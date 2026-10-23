-- Pet adicional no plano: o tutor assina o plano pra um pet e inclui outros
-- pets dele na mesma assinatura. O saldo de banhos é um só, dividido entre
-- todos; cada pet adicional paga um valor a mais, combinado na hora.

create table assinatura_pets_adicionais (
  id uuid primary key default gen_random_uuid(),
  petshop_id uuid not null references petshops (id) on delete cascade,
  assinatura_id uuid not null references assinaturas (id) on delete cascade,
  pet_id uuid not null references pets (id) on delete cascade,
  preco_centavos int not null default 0 check (preco_centavos >= 0),
  criado_em timestamptz not null default now(),
  unique (assinatura_id, pet_id)
);
create index assinatura_pets_adicionais_petshop_id_idx on assinatura_pets_adicionais (petshop_id);
create index assinatura_pets_adicionais_pet_id_idx on assinatura_pets_adicionais (pet_id);

alter table assinatura_pets_adicionais enable row level security;

create policy assinatura_pets_adicionais_tenant_isolation on assinatura_pets_adicionais
  for all using (petshop_id = public.current_petshop_id())
  with check (petshop_id = public.current_petshop_id());

-- Assinatura ativa que cobre o pet nesse serviço — como titular ou como pet
-- adicional. Um lugar só pra essa regra: agenda, link público e
-- agendar_com_plano usam esta function. security invoker: RLS normal.
create or replace function public.assinatura_do_pet(p_pet_id uuid, p_servico_id uuid)
returns uuid
language sql
stable
set search_path = public
as $$
  select a.id
  from assinaturas a
  join planos p on p.id = a.plano_id
  where a.status = 'ativa'
    and p.ativo = true
    and p.servico_id = p_servico_id
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

-- Mesma regra de antes; só a busca da assinatura passa a enxergar o pet
-- adicional.
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
  v_assinatura_id := public.assinatura_do_pet(p_pet_id, p_servico_id);

  if v_assinatura_id is null then
    raise exception 'Esse pet não tem plano ativo para esse serviço.';
  end if;

  select petshop_id into v_petshop_id from assinaturas where id = v_assinatura_id;

  select duracao_min into v_duracao_min from servicos where id = p_servico_id;
  if v_duracao_min is null then
    raise exception 'Serviço não encontrado.';
  end if;
  v_fim := p_inicio + (v_duracao_min || ' minutes')::interval;

  v_competencia := date_trunc('month', p_inicio at time zone 'America/Sao_Paulo')::date;

  -- Serializa o consumo do mesmo plano (série criada de uma vez, dois
  -- cliques seguidos, dois pets do mesmo plano ao mesmo tempo).
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

notify pgrst, 'reload schema';
