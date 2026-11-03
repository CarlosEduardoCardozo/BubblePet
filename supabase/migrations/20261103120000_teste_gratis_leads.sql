-- Teste grátis, primeiros passos (onboarding), CRM de leads e disparo em massa.

-- ---------------------------------------------------------------------------
-- Teste grátis: contas existentes continuam como assinantes (nada muda pra
-- elas); contas novas entram em teste, com o prazo gravado no cadastro.
-- ---------------------------------------------------------------------------
alter table petshops
  add column plano_status text not null default 'assinante' check (plano_status in ('teste', 'assinante')),
  add column teste_ate timestamptz,
  add column assinou_em timestamptz,
  -- Primeiros passos: {dispensado_em, celebrados: [...], link_compartilhado}.
  add column onboarding jsonb not null default '{}'::jsonb;

-- O dono do petshop edita a própria linha de petshops (RLS por linha), então
-- as colunas do plano precisam de proteção à parte: só o BubblePet (chave de
-- serviço ou SQL direto) muda prazo e situação. Sem isso, qualquer dono
-- estenderia o próprio teste pelo navegador.
create or replace function public.proteger_colunas_plano()
returns trigger
language plpgsql
as $$
begin
  if coalesce(auth.role(), '') = 'authenticated'
     and (new.plano_status is distinct from old.plano_status
          or new.teste_ate is distinct from old.teste_ate
          or new.assinou_em is distinct from old.assinou_em) then
    raise exception 'Essas informações do plano só podem ser alteradas pelo BubblePet.';
  end if;
  return new;
end;
$$;

create trigger petshops_proteger_plano
before update on petshops
for each row execute function public.proteger_colunas_plano();

-- O que já foi feito no painel, pra marcar os primeiros passos sozinho.
create or replace function public.onboarding_status()
returns jsonb
language sql
stable
set search_path = public
as $$
  select jsonb_build_object(
    'servicos', (select count(*) from servicos where ativo),
    'tutores', (select count(*) from tutores where ativo),
    'pets', (select count(*) from pets where ativo),
    'agendamentos', (select count(*) from agendamentos where status <> 'cancelado'),
    'dados_completos', (select (telefone is not null and endereco is not null) from petshops where id = public.current_petshop_id()),
    'whatsapp_conectado', (select whatsapp_status = 'conectado' from petshops where id = public.current_petshop_id())
  )
$$;

-- ---------------------------------------------------------------------------
-- Configurações da plataforma (uma linha só): link de pagamento, preço e o
-- WhatsApp usado nos disparos. Sem policies: só o servidor (chave de serviço)
-- lê e grava — o token da instância nunca vai pro navegador.
-- ---------------------------------------------------------------------------
create table plataforma_config (
  id smallint primary key default 1 check (id = 1),
  link_assinatura text,
  preco_mensal_centavos integer check (preco_mensal_centavos is null or preco_mensal_centavos >= 0),
  contato_whatsapp text,
  disparo_url text,
  disparo_token text,
  -- Teto de segurança dos disparos, por hora.
  disparo_por_hora smallint not null default 60 check (disparo_por_hora between 1 and 300),
  atualizado_em timestamptz not null default now()
);
alter table plataforma_config enable row level security;
insert into plataforma_config (id) values (1);

-- ---------------------------------------------------------------------------
-- CRM de leads
-- ---------------------------------------------------------------------------
create table leads (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  telefone text,
  email text,
  petshop_nome text,
  origem text not null check (origem in ('cadastro', 'landing', 'manual')),
  etapa text not null default 'novo' check (etapa in ('novo', 'contatado', 'teste', 'assinante', 'perdido')),
  observacoes text,
  -- Conta criada por este lead (quando virou teste).
  petshop_id uuid references petshops (id) on delete set null,
  -- Pediu pra não receber mais mensagem: nunca entra em disparo.
  optout boolean not null default false,
  ip text,
  ultimo_contato_em timestamptz,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create unique index leads_telefone_unico on leads (telefone) where telefone is not null;
create index leads_etapa_idx on leads (etapa, criado_em desc);
create index leads_ip_idx on leads (ip, criado_em desc);
alter table leads enable row level security;

create table leads_historico (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references leads (id) on delete cascade,
  tipo text not null check (tipo in ('nota', 'etapa', 'mensagem')),
  texto text not null,
  criado_em timestamptz not null default now()
);
create index leads_historico_lead_idx on leads_historico (lead_id, criado_em desc);
alter table leads_historico enable row level security;

-- ---------------------------------------------------------------------------
-- Disparo em massa: a campanha e a fila de envios (um por lead).
-- ---------------------------------------------------------------------------
create table disparos (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  texto text not null check (char_length(texto) between 1 and 1500),
  filtro jsonb not null default '{}'::jsonb,
  status text not null default 'enviando' check (status in ('enviando', 'pausado', 'concluido', 'cancelado')),
  total integer not null default 0,
  enviados integer not null default 0,
  erros integer not null default 0,
  criado_em timestamptz not null default now(),
  concluido_em timestamptz
);
alter table disparos enable row level security;

create table disparo_envios (
  id uuid primary key default gen_random_uuid(),
  disparo_id uuid not null references disparos (id) on delete cascade,
  lead_id uuid not null references leads (id) on delete cascade,
  telefone text not null,
  status text not null default 'pendente' check (status in ('pendente', 'enviado', 'erro', 'ignorado')),
  erro text,
  enviado_em timestamptz,
  unique (disparo_id, lead_id)
);
create index disparo_envios_fila_idx on disparo_envios (disparo_id, status);
alter table disparo_envios enable row level security;
