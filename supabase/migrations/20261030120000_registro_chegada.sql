-- Registro de chegada do pet: quando ele chega machucado, embolado, com a pele
-- irritada etc., o banhista marca o que viu no agendamento e anexa fotos e
-- vídeos. Fica guardado como prova do estado em que o pet chegou.

create table agendamento_chegada (
  agendamento_id uuid primary key references agendamentos (id) on delete cascade,
  petshop_id uuid not null references petshops (id) on delete cascade,
  -- Marcas rápidas: machucado, embolado, pele, pulgas, sujo, estressado, outro.
  condicoes text[] not null default '{}',
  observacao text check (observacao is null or char_length(observacao) <= 500),
  -- O tutor pode ver este registro na área dele.
  mostrar_tutor boolean not null default false,
  atualizado_em timestamptz not null default now()
);
create index agendamento_chegada_petshop_idx on agendamento_chegada (petshop_id);

alter table agendamento_chegada enable row level security;
create policy agendamento_chegada_tenant_isolation on agendamento_chegada
  for all using (petshop_id = public.current_petshop_id())
  with check (petshop_id = public.current_petshop_id());

create table agendamento_midias (
  id uuid primary key default gen_random_uuid(),
  petshop_id uuid not null references petshops (id) on delete cascade,
  agendamento_id uuid not null references agendamentos (id) on delete cascade,
  -- Caminho no armazenamento: {petshop_id}/{agendamento_id}/{arquivo}.
  caminho text not null,
  tipo text not null check (tipo in ('foto', 'video')),
  tamanho_bytes integer,
  criado_em timestamptz not null default now()
);
create index agendamento_midias_agendamento_idx on agendamento_midias (agendamento_id, criado_em);
create index agendamento_midias_petshop_idx on agendamento_midias (petshop_id);

alter table agendamento_midias enable row level security;
create policy agendamento_midias_tenant_isolation on agendamento_midias
  for all using (petshop_id = public.current_petshop_id())
  with check (petshop_id = public.current_petshop_id());

-- Arquivos: balde privado (só quem está logado no petshop enxerga), até 50 MB.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'registros',
  'registros',
  false,
  52428800,
  array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'video/mp4', 'video/quicktime', 'video/webm']
)
on conflict (id) do nothing;

create policy registros_ler on storage.objects
  for select to authenticated
  using (bucket_id = 'registros' and (storage.foldername(name))[1] = public.current_petshop_id()::text);
create policy registros_enviar on storage.objects
  for insert to authenticated
  with check (bucket_id = 'registros' and (storage.foldername(name))[1] = public.current_petshop_id()::text);
create policy registros_apagar on storage.objects
  for delete to authenticated
  using (bucket_id = 'registros' and (storage.foldername(name))[1] = public.current_petshop_id()::text);
