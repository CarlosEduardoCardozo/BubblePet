-- Tutoriais em vídeo: o admin do BubblePet cadastra vídeos (link do YouTube,
-- Vimeo, Loom, Google Drive ou .mp4) ligados a uma funcionalidade do painel
-- ("agenda", "planos"...). O painel mostra todos em /tutoriais e um ícone de
-- dúvida no título de cada tela que tenha vídeo.
--
-- Conteúdo global (não é por petshop): qualquer usuário logado lê os ativos;
-- só o servidor (service role, ações do admin) escreve.

create table tutoriais (
  id uuid primary key default gen_random_uuid(),
  -- Chave da funcionalidade, definida no código (src/lib/tutoriais.ts).
  topico text not null check (topico ~ '^[a-z0-9-]{2,40}$'),
  titulo text not null check (char_length(titulo) between 2 and 120),
  descricao text check (descricao is null or char_length(descricao) <= 400),
  video_url text not null check (char_length(video_url) between 8 and 500),
  duracao text check (duracao is null or char_length(duracao) <= 10), -- "2:35"
  ordem smallint not null default 0,
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index tutoriais_topico_idx on tutoriais (topico, ordem);

alter table tutoriais enable row level security;
create policy tutoriais_leitura on tutoriais
  for select to authenticated using (ativo);
