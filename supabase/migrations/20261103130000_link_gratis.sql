-- Link de agendamento grátis (freemium): o petshop cria um link em segundos,
-- só com nome e WhatsApp, sem conta. O tutor faz um pedido pelo link e o
-- BubblePet avisa o petshop pelo WhatsApp da plataforma. Quando o petshop cria
-- a conta completa, o petshop novo herda o mesmo endereço (slug).
--
-- As duas tabelas só são lidas e escritas pelo servidor (service role): RLS
-- ligado e nenhuma policy, então anon/authenticated não enxergam nada.

create table links_gratis (
  id uuid primary key default gen_random_uuid(),
  -- Mesmo espaço de endereços de petshops.slug: /agendar/<slug>.
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) between 3 and 40),
  nome_petshop text not null check (char_length(nome_petshop) between 2 and 80),
  nome_dono text not null check (char_length(nome_dono) between 2 and 80),
  whatsapp text not null, -- E.164
  -- [{"nome":"Banho","preco_centavos":5000}] — preço opcional (null = "a combinar").
  servicos jsonb not null default '[]'::jsonb check (jsonb_typeof(servicos) = 'array'),
  endereco text check (endereco is null or char_length(endereco) <= 160),
  -- Hash SHA-256 do token secreto da página de gestão (/meu-link/<token>).
  token_hash text not null unique,
  -- Preenchido quando vira conta completa: o link passa a ser do petshop.
  petshop_id uuid references petshops (id) on delete set null,
  convertido_em timestamptz,
  ip text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index links_gratis_whatsapp_idx on links_gratis (whatsapp, criado_em desc);
create index links_gratis_ip_idx on links_gratis (ip, criado_em desc);
alter table links_gratis enable row level security;

create table pedidos_link_gratis (
  id uuid primary key default gen_random_uuid(),
  link_id uuid not null references links_gratis (id) on delete cascade,
  tutor_nome text not null check (char_length(tutor_nome) between 2 and 80),
  tutor_telefone text not null, -- E.164
  pet_nome text not null check (char_length(pet_nome) between 1 and 60),
  servico text not null check (char_length(servico) between 1 and 80),
  dia date not null,
  turno text not null check (turno in ('manha', 'tarde')),
  observacao text check (observacao is null or char_length(observacao) <= 300),
  -- Aviso ao petshop pelo WhatsApp da plataforma.
  aviso_status text not null default 'ignorado' check (aviso_status in ('enviado', 'erro', 'ignorado')),
  aviso_erro text,
  ip text,
  criado_em timestamptz not null default now()
);
create index pedidos_link_gratis_link_idx on pedidos_link_gratis (link_id, criado_em desc);
create index pedidos_link_gratis_ip_idx on pedidos_link_gratis (ip, criado_em desc);
create index pedidos_link_gratis_tel_idx on pedidos_link_gratis (tutor_telefone, criado_em desc);
alter table pedidos_link_gratis enable row level security;
