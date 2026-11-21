-- Plano com vários serviços (4 banhos + 2 hidratações + 1 tosa), crédito
-- contado por serviço, vários serviços no mesmo agendamento e recebimento
-- do avulso direto no caixa pelo agendamento.

-- 1. Serviços do plano -------------------------------------------------------

create table public.plano_itens (
  id uuid primary key default gen_random_uuid(),
  petshop_id uuid not null references public.petshops(id) on delete cascade,
  plano_id uuid not null references public.planos(id) on delete cascade,
  servico_id uuid not null references public.servicos(id),
  quantidade integer not null check (quantidade > 0 and quantidade <= 100),
  criado_em timestamptz not null default now(),
  unique (plano_id, servico_id)
);
create index plano_itens_servico_idx on public.plano_itens (servico_id);

alter table public.plano_itens enable row level security;
create policy plano_itens_leitura on public.plano_itens
  for select using (petshop_id = current_petshop_id());
create policy plano_itens_escrita on public.plano_itens
  for insert with check (petshop_id = current_petshop_id() and tem_permissao('planos'));
create policy plano_itens_alteracao on public.plano_itens
  for update using (petshop_id = current_petshop_id() and tem_permissao('planos'))
  with check (petshop_id = current_petshop_id() and tem_permissao('planos'));
create policy plano_itens_exclusao on public.plano_itens
  for delete using (petshop_id = current_petshop_id() and tem_permissao('planos'));

-- Planos que já existem: o serviço único vira o primeiro item.
insert into public.plano_itens (petshop_id, plano_id, servico_id, quantidade)
select petshop_id, id, servico_id, creditos_mes from public.planos
on conflict do nothing;

-- planos.servico_id / creditos_mes continuam como resumo (serviço principal
-- e total de créditos), mantidos pela tela de planos.

-- 2. Crédito por serviço -----------------------------------------------------

alter table public.creditos_movimentos add column servico_id uuid references public.servicos(id);

update public.creditos_movimentos cm
set servico_id = p.servico_id
from public.assinaturas a
join public.planos p on p.id = a.plano_id
where a.id = cm.assinatura_id and cm.servico_id is null;

create index creditos_movimentos_saldo_idx
  on public.creditos_movimentos (assinatura_id, servico_id, competencia);

-- Quem ainda insere sem serviço (código antigo): usa o do agendamento ou o
-- principal do plano.
create or replace function public.creditos_movimentos_servico_padrao()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.servico_id is null then
    if new.agendamento_id is not null then
      select servico_id into new.servico_id from agendamentos where id = new.agendamento_id;
    end if;
    if new.servico_id is null then
      select p.servico_id into new.servico_id
      from assinaturas a join planos p on p.id = a.plano_id
      where a.id = new.assinatura_id;
    end if;
  end if;
  return new;
end;
$$;

create trigger creditos_movimentos_servico_padrao
  before insert on public.creditos_movimentos
  for each row execute function public.creditos_movimentos_servico_padrao();

-- Apagar um agendamento devolve o crédito (os movimentos dele somem junto).
alter table public.creditos_movimentos drop constraint creditos_movimentos_agendamento_id_fkey;
alter table public.creditos_movimentos
  add constraint creditos_movimentos_agendamento_id_fkey
  foreign key (agendamento_id) references public.agendamentos(id) on delete cascade;

create or replace function public.saldo_plano_servico(
  p_assinatura_id uuid, p_servico_id uuid, p_competencia date
)
returns integer
language sql
stable
set search_path = public
as $$
  select coalesce((
    select sum(cm.quantidade)::int from creditos_movimentos cm
    where cm.assinatura_id = p_assinatura_id
      and cm.servico_id = p_servico_id
      and cm.competencia = p_competencia
  ), 0)
  + case
      when p_competencia > date_trunc('month', now() at time zone 'America/Sao_Paulo')::date
       and not exists (
         select 1 from creditos_movimentos cm
         where cm.assinatura_id = p_assinatura_id
           and cm.servico_id = p_servico_id
           and cm.competencia = p_competencia
           and cm.tipo = 'renovacao'
       )
      then coalesce((
        select pi.quantidade from assinaturas a
        join plano_itens pi on pi.plano_id = a.plano_id
        where a.id = p_assinatura_id and a.status = 'ativa' and pi.servico_id = p_servico_id
      ), 0)
      else 0
    end;
$$;

-- Saldo total (todos os serviços), pra quem mostra um número só.
create or replace function public.saldo_plano(p_assinatura_id uuid, p_competencia date)
returns integer
language sql
stable
set search_path = public
as $$
  select coalesce((
    select sum(cm.quantidade)::int from creditos_movimentos cm
    where cm.assinatura_id = p_assinatura_id and cm.competencia = p_competencia
  ), 0)
  + case
      when p_competencia > date_trunc('month', now() at time zone 'America/Sao_Paulo')::date
      then coalesce((
        select sum(pi.quantidade)::int from assinaturas a
        join plano_itens pi on pi.plano_id = a.plano_id
        where a.id = p_assinatura_id and a.status = 'ativa'
          and not exists (
            select 1 from creditos_movimentos cm
            where cm.assinatura_id = a.id
              and cm.servico_id = pi.servico_id
              and cm.competencia = p_competencia
              and cm.tipo = 'renovacao'
          )
      ), 0)
      else 0
    end;
$$;

create or replace function public.renovar_creditos_mes()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_competencia date := date_trunc('month', now() at time zone 'America/Sao_Paulo')::date;
begin
  insert into creditos_movimentos (petshop_id, assinatura_id, tipo, quantidade, competencia, servico_id)
  select a.petshop_id, a.id, 'renovacao', pi.quantidade, v_competencia, pi.servico_id
  from assinaturas a
  join plano_itens pi on pi.plano_id = a.plano_id
  where a.status = 'ativa'
    and not exists (
      select 1 from creditos_movimentos cm
      where cm.assinatura_id = a.id
        and cm.servico_id = pi.servico_id
        and cm.tipo = 'renovacao'
        and cm.competencia = v_competencia
    );
end;
$$;

create or replace function public.assinatura_do_pet(p_pet_id uuid, p_servico_id uuid)
returns uuid
language sql
stable
set search_path = public
as $$
  select a.id
  from assinaturas a
  join planos p on p.id = a.plano_id
  join plano_itens pi on pi.plano_id = p.id and pi.servico_id = p_servico_id
  where a.status = 'ativa'
    and p.ativo = true
    and (
      a.pet_id = p_pet_id
      or exists (
        select 1 from assinatura_pets_adicionais ad
        where ad.assinatura_id = a.id and ad.pet_id = p_pet_id
      )
    )
  order by (a.pet_id = p_pet_id) desc, a.criado_em
  limit 1;
$$;

-- Créditos da assinatura no mês, um por serviço do plano.
create or replace function public.creditos_do_pet(p_pet_id uuid, p_competencia date)
returns table (
  servico_id uuid, assinatura_id uuid, plano_nome text, quantidade integer, saldo integer
)
language sql
stable
set search_path = public
as $$
  select distinct on (pi.servico_id)
    pi.servico_id, a.id, p.nome, pi.quantidade,
    public.saldo_plano_servico(a.id, pi.servico_id, p_competencia)
  from assinaturas a
  join planos p on p.id = a.plano_id and p.ativo
  join plano_itens pi on pi.plano_id = p.id
  where a.status = 'ativa'
    and (
      a.pet_id = p_pet_id
      or exists (
        select 1 from assinatura_pets_adicionais ad
        where ad.assinatura_id = a.id and ad.pet_id = p_pet_id
      )
    )
  order by pi.servico_id, (a.pet_id = p_pet_id) desc, a.criado_em;
$$;

drop function if exists public.agendar_com_plano(uuid, uuid, timestamptz, text);

create or replace function public.agendar_com_plano(
  p_pet_id uuid,
  p_servico_id uuid,
  p_inicio timestamptz,
  p_observacoes text default null,
  p_fim timestamptz default null
)
returns uuid
language plpgsql
set search_path = public
as $$
declare
  v_assinatura_id uuid;
  v_petshop_id uuid;
  v_duracao_min int;
  v_fim timestamptz;
  v_competencia date;
  v_agendamento_id uuid;
begin
  v_assinatura_id := public.assinatura_do_pet(p_pet_id, p_servico_id);
  if v_assinatura_id is null then
    raise exception 'Esse pet não tem plano ativo para esse serviço.';
  end if;

  select petshop_id into v_petshop_id from assinaturas where id = v_assinatura_id;

  select duracao_min into v_duracao_min from servicos where id = p_servico_id;
  if v_duracao_min is null then
    raise exception 'Serviço não encontrado.';
  end if;
  v_fim := coalesce(p_fim, p_inicio + (v_duracao_min || ' minutes')::interval);

  v_competencia := date_trunc('month', p_inicio at time zone 'America/Sao_Paulo')::date;

  perform pg_advisory_xact_lock(hashtextextended('plano:' || v_assinatura_id::text, 0));

  if public.saldo_plano_servico(v_assinatura_id, p_servico_id, v_competencia) <= 0 then
    raise exception 'Sem créditos disponíveis nesse mês para esse plano.';
  end if;

  insert into agendamentos (
    petshop_id, pet_id, servico_id, inicio, fim, observacoes,
    origem_plano, assinatura_id, valor_centavos
  )
  values (
    v_petshop_id, p_pet_id, p_servico_id, p_inicio, v_fim, p_observacoes,
    true, v_assinatura_id, 0
  )
  returning id into v_agendamento_id;

  insert into creditos_movimentos (
    petshop_id, assinatura_id, tipo, quantidade, agendamento_id, competencia, servico_id
  )
  values (
    v_petshop_id, v_assinatura_id, 'consumo', -1, v_agendamento_id, v_competencia, p_servico_id
  );

  return v_agendamento_id;
end;
$$;

-- Serviço extra do agendamento usando crédito do plano. Devolve a assinatura
-- usada, ou null se o pet não tem crédito daquele serviço no mês.
create or replace function public.consumir_credito_servico(p_agendamento_id uuid, p_servico_id uuid)
returns uuid
language plpgsql
set search_path = public
as $$
declare
  v_ag record;
  v_assinatura_id uuid;
  v_competencia date;
begin
  select id, petshop_id, pet_id, inicio into v_ag from agendamentos where id = p_agendamento_id;
  if v_ag.id is null then
    raise exception 'Agendamento não encontrado.';
  end if;

  v_assinatura_id := public.assinatura_do_pet(v_ag.pet_id, p_servico_id);
  if v_assinatura_id is null then
    return null;
  end if;

  v_competencia := date_trunc('month', v_ag.inicio at time zone 'America/Sao_Paulo')::date;
  perform pg_advisory_xact_lock(hashtextextended('plano:' || v_assinatura_id::text, 0));

  -- Já está usando crédito desse serviço neste agendamento.
  if coalesce((
    select sum(quantidade) from creditos_movimentos
    where agendamento_id = p_agendamento_id and servico_id = p_servico_id
      and tipo in ('consumo', 'estorno')
  ), 0) < 0 then
    return v_assinatura_id;
  end if;

  if public.saldo_plano_servico(v_assinatura_id, p_servico_id, v_competencia) <= 0 then
    return null;
  end if;

  insert into creditos_movimentos (
    petshop_id, assinatura_id, tipo, quantidade, agendamento_id, competencia, servico_id
  )
  values (v_ag.petshop_id, v_assinatura_id, 'consumo', -1, p_agendamento_id, v_competencia, p_servico_id);

  return v_assinatura_id;
end;
$$;

-- Devolve o crédito de um serviço extra tirado do agendamento.
create or replace function public.estornar_credito_servico(p_agendamento_id uuid, p_servico_id uuid)
returns void
language plpgsql
set search_path = public
as $$
begin
  insert into creditos_movimentos (
    petshop_id, assinatura_id, tipo, quantidade, agendamento_id, competencia, servico_id
  )
  select petshop_id, assinatura_id, 'estorno', -sum(quantidade)::int, p_agendamento_id,
         min(competencia), p_servico_id
  from creditos_movimentos
  where agendamento_id = p_agendamento_id and servico_id = p_servico_id
    and tipo in ('consumo', 'estorno')
  group by petshop_id, assinatura_id
  having sum(quantidade) < 0;
end;
$$;

-- Cancelar devolve todos os créditos do agendamento (serviço principal e
-- extras); reabrir um cancelado volta a consumir os mesmos créditos.
create or replace function public.estornar_credito_ao_cancelar()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.status = 'cancelado' and old.status <> 'cancelado' then
    insert into creditos_movimentos (
      petshop_id, assinatura_id, tipo, quantidade, agendamento_id, competencia, servico_id
    )
    select petshop_id, assinatura_id, 'estorno', -sum(quantidade)::int, new.id,
           date_trunc('month', new.inicio at time zone 'America/Sao_Paulo')::date, servico_id
    from creditos_movimentos
    where agendamento_id = new.id and tipo in ('consumo', 'estorno')
    group by petshop_id, assinatura_id, servico_id
    having sum(quantidade) < 0;
  elsif old.status = 'cancelado' and new.status <> 'cancelado' then
    insert into creditos_movimentos (
      petshop_id, assinatura_id, tipo, quantidade, agendamento_id, competencia, servico_id
    )
    select petshop_id, assinatura_id, 'consumo', -1, new.id,
           date_trunc('month', new.inicio at time zone 'America/Sao_Paulo')::date, servico_id
    from creditos_movimentos
    where agendamento_id = new.id and tipo in ('consumo', 'estorno')
    group by petshop_id, assinatura_id, servico_id
    having sum(quantidade) = 0 and bool_or(tipo = 'consumo');
  end if;
  return new;
end;
$$;

-- 3. Vários serviços no agendamento e pagamento no caixa ---------------------

-- Itens: {servico_id, nome, duracao_min, valor_centavos, assinatura_id, plano_nome}
-- (assinatura_id/plano_nome preenchidos quando o crédito do plano cobriu).
alter table public.agendamentos
  add column servicos_extras jsonb not null default '[]'::jsonb
    check (jsonb_typeof(servicos_extras) = 'array'),
  add column pago_em timestamptz;

alter table public.lancamentos
  add column agendamento_id uuid references public.agendamentos(id) on delete cascade;
create index lancamentos_agendamento_idx on public.lancamentos (agendamento_id) where agendamento_id is not null;

alter table public.lancamentos drop constraint lancamentos_origem_check;
alter table public.lancamentos add constraint lancamentos_origem_check
  check (origem = any (array['manual', 'extrato', 'recorrencia', 'pdv', 'agendamento']));

revoke execute on function public.creditos_movimentos_servico_padrao() from public, anon, authenticated;
revoke execute on function public.estornar_credito_ao_cancelar() from public, anon, authenticated;
revoke execute on function public.renovar_creditos_mes() from public, anon, authenticated;

-- Compatibilidade: plano salvo só com servico_id/creditos_mes (código antigo)
-- ganha/atualiza o item único.
create or replace function public.planos_item_padrao()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_n int;
begin
  select count(*) into v_n from plano_itens where plano_id = new.id;
  if v_n = 0 then
    insert into plano_itens (petshop_id, plano_id, servico_id, quantidade)
    values (new.petshop_id, new.id, new.servico_id, new.creditos_mes);
  elsif v_n = 1 and tg_op = 'UPDATE'
        and (new.servico_id <> old.servico_id or new.creditos_mes <> old.creditos_mes) then
    update plano_itens set servico_id = new.servico_id, quantidade = new.creditos_mes
    where plano_id = new.id;
  end if;
  return new;
end;
$$;
revoke execute on function public.planos_item_padrao() from public, anon, authenticated;
create trigger planos_item_padrao
  after insert or update on public.planos
  for each row execute function public.planos_item_padrao();

-- Serviço incluído no plano no meio do mês: os assinantes já ganham o
-- crédito do mês atual (sem esperar a rotina diária).
create or replace function public.renovar_creditos_plano(p_plano_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_competencia date := date_trunc('month', now() at time zone 'America/Sao_Paulo')::date;
begin
  if not exists (select 1 from planos where id = p_plano_id and petshop_id = current_petshop_id()) then
    raise exception 'Plano não encontrado.';
  end if;
  insert into creditos_movimentos (petshop_id, assinatura_id, tipo, quantidade, competencia, servico_id)
  select a.petshop_id, a.id, 'renovacao', pi.quantidade, v_competencia, pi.servico_id
  from assinaturas a
  join plano_itens pi on pi.plano_id = a.plano_id
  where a.plano_id = p_plano_id
    and a.status = 'ativa'
    and not exists (
      select 1 from creditos_movimentos cm
      where cm.assinatura_id = a.id
        and cm.servico_id = pi.servico_id
        and cm.tipo = 'renovacao'
        and cm.competencia = v_competencia
    );
end;
$$;
revoke execute on function public.renovar_creditos_plano(uuid) from public, anon;
grant execute on function public.renovar_creditos_plano(uuid) to authenticated;
