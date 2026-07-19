-- Fase 3: planos de banho com créditos mensais via ledger (seção 4.3 do doc).

create table planos (
  id uuid primary key default gen_random_uuid(),
  petshop_id uuid not null references petshops (id) on delete cascade,
  nome text not null,
  creditos_mes int not null,
  servico_id uuid not null references servicos (id),
  preco_centavos int not null,
  permite_acumular boolean not null default false,
  ativo boolean not null default true
);
create index planos_petshop_id_idx on planos (petshop_id);

create table assinaturas (
  id uuid primary key default gen_random_uuid(),
  petshop_id uuid not null references petshops (id) on delete cascade,
  pet_id uuid not null references pets (id) on delete cascade,
  plano_id uuid not null references planos (id),
  inicio date not null default current_date,
  status text not null default 'ativa'
    check (status in ('ativa', 'pausada', 'cancelada')),
  criado_em timestamptz not null default now()
);
create index assinaturas_petshop_id_idx on assinaturas (petshop_id);
create index assinaturas_pet_id_idx on assinaturas (pet_id);

create table creditos_movimentos (
  id uuid primary key default gen_random_uuid(),
  petshop_id uuid not null references petshops (id) on delete cascade,
  assinatura_id uuid not null references assinaturas (id) on delete cascade,
  tipo text not null check (tipo in ('renovacao', 'consumo', 'estorno', 'ajuste')),
  quantidade int not null,
  agendamento_id uuid references agendamentos (id),
  competencia date not null,
  criado_em timestamptz not null default now()
);
create index creditos_movimentos_assinatura_competencia_idx
  on creditos_movimentos (assinatura_id, competencia);

-- security_invoker: sem isso, a view roda com os privilégios de quem criou
-- (dono da tabela), o que ignora a RLS de creditos_movimentos e vaza saldo
-- de outros tenants. Pego pelo get_advisors depois de aplicar sem essa opção.
create view saldo_creditos
with (security_invoker = true)
as
select assinatura_id, competencia, sum(quantidade) as saldo
from creditos_movimentos
group by assinatura_id, competencia;

alter table planos enable row level security;
alter table assinaturas enable row level security;
alter table creditos_movimentos enable row level security;

create policy planos_tenant_isolation on planos
  for all using (petshop_id = public.current_petshop_id())
  with check (petshop_id = public.current_petshop_id());

create policy assinaturas_tenant_isolation on assinaturas
  for all using (petshop_id = public.current_petshop_id())
  with check (petshop_id = public.current_petshop_id());

create policy creditos_movimentos_tenant_isolation on creditos_movimentos
  for all using (petshop_id = public.current_petshop_id())
  with check (petshop_id = public.current_petshop_id());

-- Agenda um serviço consumindo crédito do plano ativo do pet. Bloqueia se não
-- houver plano cobrindo o serviço ou saldo no mês. security invoker: roda
-- como o usuário autenticado, RLS normal se aplica a tudo que a function faz.
create or replace function public.agendar_com_plano(
  p_pet_id uuid,
  p_servico_id uuid,
  p_inicio timestamptz,
  p_observacoes text default null
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_assinatura_id uuid;
  v_petshop_id uuid;
  v_duracao_min int;
  v_fim timestamptz;
  v_competencia date;
  v_saldo int;
  v_conflitos int;
  v_agendamento_id uuid;
begin
  select a.id, a.petshop_id
    into v_assinatura_id, v_petshop_id
  from assinaturas a
  join planos p on p.id = a.plano_id
  where a.pet_id = p_pet_id
    and a.status = 'ativa'
    and p.servico_id = p_servico_id
    and p.ativo = true
  limit 1;

  if v_assinatura_id is null then
    raise exception 'Esse pet não tem plano ativo para esse serviço.';
  end if;

  select duracao_min into v_duracao_min from servicos where id = p_servico_id;
  if v_duracao_min is null then
    raise exception 'Serviço não encontrado.';
  end if;
  v_fim := p_inicio + (v_duracao_min || ' minutes')::interval;

  -- Competência é sempre o mês-calendário em America/Sao_Paulo, nunca o
  -- fuso da sessão do Postgres (UTC) — evita atribuir o consumo ao mês
  -- errado pra agendamentos perto da virada do mês.
  v_competencia := date_trunc('month', p_inicio at time zone 'America/Sao_Paulo')::date;

  select coalesce(sum(quantidade), 0) into v_saldo
  from creditos_movimentos
  where assinatura_id = v_assinatura_id and competencia = v_competencia;

  if v_saldo <= 0 then
    raise exception 'Sem créditos disponíveis nesse mês para esse plano.';
  end if;

  select count(*) into v_conflitos
  from agendamentos
  where petshop_id = v_petshop_id
    and status <> 'cancelado'
    and inicio < v_fim
    and fim > p_inicio;

  if v_conflitos > 0 then
    raise exception 'Já existe um agendamento nesse horário.';
  end if;

  insert into agendamentos (
    petshop_id, pet_id, servico_id, inicio, fim, observacoes,
    origem_plano, assinatura_id
  )
  values (
    v_petshop_id, p_pet_id, p_servico_id, p_inicio, v_fim, p_observacoes,
    true, v_assinatura_id
  )
  returning id into v_agendamento_id;

  insert into creditos_movimentos (
    petshop_id, assinatura_id, tipo, quantidade, agendamento_id, competencia
  )
  values (
    v_petshop_id, v_assinatura_id, 'consumo', -1, v_agendamento_id, v_competencia
  );

  return v_agendamento_id;
end;
$$;

-- Estorna 1 crédito automaticamente quando um agendamento pago com plano é
-- cancelado. Dispara em qualquer UPDATE em agendamentos — inclusive o botão
-- "Cancelar" que já existe na agenda desde a Fase 2, sem mudar nada lá.
create or replace function public.estornar_credito_ao_cancelar()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if new.status = 'cancelado' and old.status <> 'cancelado'
     and new.origem_plano and new.assinatura_id is not null then
    insert into creditos_movimentos (
      petshop_id, assinatura_id, tipo, quantidade, agendamento_id, competencia
    )
    values (
      new.petshop_id, new.assinatura_id, 'estorno', 1, new.id,
      date_trunc('month', new.inicio at time zone 'America/Sao_Paulo')::date
    );
  end if;
  return new;
end;
$$;

create trigger agendamentos_estorno_credito
after update on agendamentos
for each row execute function public.estornar_credito_ao_cancelar();

-- Renovação mensal via pg_cron. security definer: o cron não tem usuário
-- autenticado, precisa varrer todos os tenants numa passada só.
create or replace function public.renovar_creditos_mes()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_competencia date := date_trunc('month', now() at time zone 'America/Sao_Paulo')::date;
begin
  insert into creditos_movimentos (petshop_id, assinatura_id, tipo, quantidade, competencia)
  select a.petshop_id, a.id, 'renovacao', p.creditos_mes, v_competencia
  from assinaturas a
  join planos p on p.id = a.plano_id
  where a.status = 'ativa'
    and not exists (
      select 1 from creditos_movimentos cm
      where cm.assinatura_id = a.id
        and cm.tipo = 'renovacao'
        and cm.competencia = v_competencia
    );
end;
$$;

-- Não é uma RPC pública: só o cron (e execução administrativa direta) deve
-- rodar isso, nunca o app via /rest/v1/rpc.
revoke execute on function public.renovar_creditos_mes() from public;
revoke execute on function public.renovar_creditos_mes() from anon;
revoke execute on function public.renovar_creditos_mes() from authenticated;
revoke execute on function public.estornar_credito_ao_cancelar() from public;
revoke execute on function public.estornar_credito_ao_cancelar() from anon;
revoke execute on function public.estornar_credito_ao_cancelar() from authenticated;

create extension if not exists pg_cron;

select cron.schedule(
  'renovar-creditos-mensal',
  '0 6 1 * *',
  $$select public.renovar_creditos_mes()$$
);
