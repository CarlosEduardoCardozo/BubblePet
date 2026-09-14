-- Capacidade por horário (petshop maior dá 2-3 banhos ao mesmo tempo),
-- agendamentos recorrentes e crédito de plano pra meses futuros.

alter table public.petshops
  add column capacidade_por_horario smallint not null default 1
    check (capacidade_por_horario between 1 and 20);

-- Série de agendamentos criada de uma vez ("toda semana, 4 vezes").
alter table public.agendamentos add column recorrencia_id uuid;
create index agendamentos_recorrencia_idx on public.agendamentos (recorrencia_id)
  where recorrencia_id is not null;

-- A exclusion constraint só permitia 1 atendimento por vez. No lugar dela,
-- um trigger conta quantos atendimentos acontecem AO MESMO TEMPO no
-- intervalo (não só quantos se sobrepõem: com capacidade 2, 9:00-9:40 +
-- 9:40-10:20 + 9:20-10:00 cabe). O lock por petshop serializa inserções
-- concorrentes, então dois tutores não pegam a última vaga juntos.
alter table public.agendamentos drop constraint if exists agendamentos_sem_sobreposicao;

create or replace function public.checar_capacidade_agenda()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_capacidade int;
  v_max int;
begin
  if new.status in ('cancelado', 'faltou') then
    return new;
  end if;
  -- Mudança que não mexe em horário nem reativa (adicionais, observações,
  -- concluir): não revalida — senão baixar a capacidade travaria edições.
  if tg_op = 'UPDATE'
     and new.inicio = old.inicio and new.fim = old.fim
     and old.status not in ('cancelado', 'faltou') then
    return new;
  end if;

  perform pg_advisory_xact_lock(hashtextextended('agenda:' || new.petshop_id::text, 0));

  select capacidade_por_horario into v_capacidade from petshops where id = new.petshop_id;
  v_capacidade := coalesce(v_capacidade, 1);

  -- O máximo de simultâneos acontece no início do novo ou no início de algum
  -- atendimento que começa dentro dele.
  select coalesce(max(c), 0) into v_max
  from (
    select (
      select count(*) from agendamentos b
      where b.petshop_id = new.petshop_id
        and b.id <> new.id
        and b.status not in ('cancelado', 'faltou')
        and b.inicio <= pt.t and b.fim > pt.t
    ) as c
    from (
      select new.inicio as t
      union
      select a.inicio from agendamentos a
      where a.petshop_id = new.petshop_id
        and a.id <> new.id
        and a.status not in ('cancelado', 'faltou')
        and a.inicio > new.inicio and a.inicio < new.fim
    ) pt
  ) x;

  if v_max + 1 > v_capacidade then
    raise exception using
      errcode = '23P01',
      message = case when v_capacidade = 1
        then 'Já existe um agendamento nesse horário.'
        else 'Esse horário já está lotado (' || v_capacidade || ' atendimentos ao mesmo tempo).'
      end;
  end if;
  return new;
end;
$$;

revoke all on function public.checar_capacidade_agenda() from public, anon, authenticated;

create trigger agendamentos_capacidade
  before insert or update of inicio, fim, status on public.agendamentos
  for each row execute function public.checar_capacidade_agenda();

-- Saldo que dá pra usar numa competência. Mês futuro ainda não renovado
-- conta com os créditos do plano que vão entrar: agendar a série de banhos
-- do mês que vem já consome o crédito dele.
create or replace function public.saldo_plano(p_assinatura_id uuid, p_competencia date)
returns int
language sql
stable
security invoker
set search_path = public
as $$
  select coalesce((
    select sum(cm.quantidade)::int from creditos_movimentos cm
    where cm.assinatura_id = p_assinatura_id and cm.competencia = p_competencia
  ), 0)
  + case
      when p_competencia > date_trunc('month', now() at time zone 'America/Sao_Paulo')::date
       and not exists (
         select 1 from creditos_movimentos cm
         where cm.assinatura_id = p_assinatura_id
           and cm.competencia = p_competencia
           and cm.tipo = 'renovacao'
       )
      then coalesce((
        select p.creditos_mes from assinaturas a join planos p on p.id = a.plano_id
        where a.id = p_assinatura_id and a.status = 'ativa'
      ), 0)
      else 0
    end;
$$;

-- Mesma regra de antes; o saldo passa pelo saldo_plano (mês futuro) e o
-- conflito de horário fica com o trigger de capacidade.
create or replace function public.agendar_com_plano(
  p_pet_id uuid,
  p_servico_id uuid,
  p_inicio timestamptz,
  p_observacoes text default null
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

  v_competencia := date_trunc('month', p_inicio at time zone 'America/Sao_Paulo')::date;

  -- Serializa o consumo do mesmo plano (série criada de uma vez, dois
  -- cliques seguidos).
  perform pg_advisory_xact_lock(hashtextextended('plano:' || v_assinatura_id::text, 0));

  if public.saldo_plano(v_assinatura_id, v_competencia) <= 0 then
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
    petshop_id, assinatura_id, tipo, quantidade, agendamento_id, competencia
  )
  values (
    v_petshop_id, v_assinatura_id, 'consumo', -1, v_agendamento_id, v_competencia
  );

  return v_agendamento_id;
end;
$$;
