-- Fase 0: núcleo multi-tenant (tenant, pessoas, pets).
-- Ver PLANO.md seções 4.1 e 4.5.

create table petshops (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  telefone text,
  chave_pix text,
  dia_fechamento smallint not null default 28 check (dia_fechamento between 1 and 31),
  criado_em timestamptz not null default now()
);

-- Usuários internos (dono, staff); role 'tutor' reservada para o portal do tutor (Fase 2+).
create table perfis (
  id uuid primary key references auth.users (id) on delete cascade,
  petshop_id uuid not null references petshops (id) on delete cascade,
  nome text not null,
  role text not null default 'dono' check (role in ('dono', 'staff', 'tutor')),
  criado_em timestamptz not null default now()
);
create index perfis_petshop_id_idx on perfis (petshop_id);

create table tutores (
  id uuid primary key default gen_random_uuid(),
  petshop_id uuid not null references petshops (id) on delete cascade,
  nome text not null,
  telefone text not null, -- E.164, ex: +5547999999999
  email text,
  cpf text,
  observacoes text,
  auth_user_id uuid references auth.users (id), -- null no MVP; liga o portal do tutor na Fase 2
  criado_em timestamptz not null default now()
);
create index tutores_petshop_id_idx on tutores (petshop_id);

create table pets (
  id uuid primary key default gen_random_uuid(),
  petshop_id uuid not null references petshops (id) on delete cascade,
  tutor_id uuid not null references tutores (id) on delete cascade,
  nome text not null,
  especie text not null default 'cachorro',
  raca text,
  porte text check (porte in ('pequeno', 'medio', 'grande')),
  nascimento date,
  observacoes text, -- alergias, temperamento etc.
  foto_url text,
  ativo boolean not null default true
);
create index pets_petshop_tutor_idx on pets (petshop_id, tutor_id);

-- Resolve o petshop_id do usuário autenticado sem recursão de RLS
-- (uma policy em `perfis` que consultasse `perfis` diretamente entraria em loop).
create or replace function public.current_petshop_id()
returns uuid
language sql
security definer
stable
set search_path = public
as $$
  select petshop_id from perfis where id = auth.uid()
$$;

alter table petshops enable row level security;
alter table perfis enable row level security;
alter table tutores enable row level security;
alter table pets enable row level security;

create policy petshops_tenant_isolation on petshops
  for select using (id = public.current_petshop_id());

create policy petshops_tenant_update on petshops
  for update using (id = public.current_petshop_id());

-- Usuário sempre enxerga a própria linha (necessária para resolver o próprio
-- petshop_id no primeiro login) e as demais linhas do mesmo tenant.
create policy perfis_select on perfis
  for select using (id = auth.uid() or petshop_id = public.current_petshop_id());

create policy perfis_update_self on perfis
  for update using (id = auth.uid());

create policy tutores_tenant_isolation on tutores
  for all using (petshop_id = public.current_petshop_id())
  with check (petshop_id = public.current_petshop_id());

create policy pets_tenant_isolation on pets
  for all using (petshop_id = public.current_petshop_id())
  with check (petshop_id = public.current_petshop_id());
