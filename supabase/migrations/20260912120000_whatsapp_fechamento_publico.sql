-- Entrega 14/09: WhatsApp (UAZAPI), link público de agendamento e fechamento
-- do mês. Uma migration só, aplicada de uma vez via MCP.

-- ---------------------------------------------------------------------------
-- petshops: configuração do negócio + estado (não o segredo) do WhatsApp
-- ---------------------------------------------------------------------------
alter table petshops
  add column slug text,
  add column endereco text,
  add column horario_abertura time not null default '08:00',
  add column horario_fechamento time not null default '18:00',
  -- 1=segunda ... 7=domingo (convenção ISO/luxon, a mesma usada no app)
  add column dias_funcionamento smallint[] not null default '{1,2,3,4,5,6}',
  add column whatsapp_status text not null default 'desconectado'
    check (whatsapp_status in ('desconectado', 'conectando', 'conectado')),
  add column whatsapp_numero text,
  add column whatsapp_profile_nome text;

-- Slug inicial derivado do nome + 4 chars do id pra garantir unicidade;
-- editável em Configurações.
update petshops
set slug = trim(both '-' from lower(regexp_replace(nome, '[^a-zA-Z0-9]+', '-', 'g')))
  || '-' || left(id::text, 4)
where slug is null;

alter table petshops
  alter column slug set not null,
  add constraint petshops_slug_formato
    check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(slug) between 3 and 40);
create unique index petshops_slug_uidx on petshops (slug);

-- O token da instância fica numa tabela à parte, com RLS ligada e SEM policy:
-- só o service role (server-only) alcança. Assim o browser client nunca
-- consegue ler o segredo, mesmo com `select *` em petshops.
create table petshop_whatsapp (
  petshop_id uuid primary key references petshops (id) on delete cascade,
  instance_id text,
  token text not null,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
alter table petshop_whatsapp enable row level security;

-- ---------------------------------------------------------------------------
-- tutores: soft-delete (igual a pets) — delete físico estourava FK de
-- agendamentos na frente do usuário.
-- ---------------------------------------------------------------------------
alter table tutores add column ativo boolean not null default true;

-- ---------------------------------------------------------------------------
-- Log de mensagens enviadas pelo WhatsApp
-- ---------------------------------------------------------------------------
create table mensagens_whatsapp (
  id uuid primary key default gen_random_uuid(),
  petshop_id uuid not null references petshops (id) on delete cascade,
  tutor_id uuid references tutores (id) on delete set null,
  numero text not null,
  tipo text not null
    check (tipo in ('teste', 'lembrete', 'confirmacao', 'otp', 'fechamento', 'relatorio')),
  status text not null check (status in ('enviada', 'erro')),
  erro text,
  criado_em timestamptz not null default now()
);
create index mensagens_whatsapp_petshop_idx on mensagens_whatsapp (petshop_id, criado_em desc);
alter table mensagens_whatsapp enable row level security;
create policy mensagens_whatsapp_tenant_isolation on mensagens_whatsapp
  for all using (petshop_id = public.current_petshop_id())
  with check (petshop_id = public.current_petshop_id());

-- ---------------------------------------------------------------------------
-- OTP do link público. RLS ligada sem policy: só o service role acessa.
-- Nunca guarda o código em claro (HMAC com OTP_SECRET do app).
-- ---------------------------------------------------------------------------
create table otp_codigos (
  id uuid primary key default gen_random_uuid(),
  petshop_id uuid not null references petshops (id) on delete cascade,
  telefone text not null,
  codigo_hash text not null,
  expira_em timestamptz not null,
  tentativas smallint not null default 0,
  consumido_em timestamptz,
  ip text,
  criado_em timestamptz not null default now()
);
create index otp_codigos_lookup_idx on otp_codigos (petshop_id, telefone, criado_em desc);
create index otp_codigos_ip_idx on otp_codigos (ip, criado_em desc);
alter table otp_codigos enable row level security;

select cron.schedule(
  'limpar-otp-diario',
  '0 4 * * *',
  $$delete from public.otp_codigos where criado_em < now() - interval '1 day'$$
);

-- ---------------------------------------------------------------------------
-- Fechamento do mês: um extrato por tutor por competência (1º dia do mês).
-- `itens` é um snapshot — o PDF e a cobrança não mudam se o serviço for
-- editado depois.
-- ---------------------------------------------------------------------------
create table fechamentos (
  id uuid primary key default gen_random_uuid(),
  petshop_id uuid not null references petshops (id) on delete cascade,
  tutor_id uuid not null references tutores (id) on delete cascade,
  competencia date not null,
  itens jsonb not null,
  total_centavos int not null,
  status text not null default 'aberto' check (status in ('aberto', 'pago')),
  enviado_em timestamptz,
  pago_em timestamptz,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (petshop_id, tutor_id, competencia)
);
create index fechamentos_petshop_status_idx on fechamentos (petshop_id, status);
create index fechamentos_petshop_competencia_idx on fechamentos (petshop_id, competencia);
alter table fechamentos enable row level security;
create policy fechamentos_tenant_isolation on fechamentos
  for all using (petshop_id = public.current_petshop_id())
  with check (petshop_id = public.current_petshop_id());

-- ---------------------------------------------------------------------------
-- agendamentos: valor congelado na criação (0 quando pago com plano) e
-- garantia anti-sobreposição no banco (o check-then-insert das actions
-- continua pra dar mensagem amigável; a corrida real morre aqui).
-- ---------------------------------------------------------------------------
update agendamentos a
set valor_centavos = case when a.origem_plano then 0 else s.preco_centavos end
from servicos s
where s.id = a.servico_id and a.valor_centavos is null;

create extension if not exists btree_gist with schema extensions;

alter table agendamentos
  add constraint agendamentos_sem_sobreposicao
  exclude using gist (petshop_id with =, tstzrange(inicio, fim) with &&)
  where (status <> 'cancelado');

-- Mesmo corpo da Fase 3, só acrescenta valor_centavos = 0 no insert.
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
