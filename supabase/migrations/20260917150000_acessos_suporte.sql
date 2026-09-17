-- Registro de cada vez que o admin do BubblePet entra como um usuário
-- (suporte). Só o servidor (service role) lê e escreve.
create table public.acessos_suporte (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid not null references auth.users (id) on delete cascade,
  alvo_id uuid not null references auth.users (id) on delete cascade,
  petshop_id uuid references public.petshops (id) on delete cascade,
  inicio timestamptz not null default now(),
  fim timestamptz
);
create index acessos_suporte_petshop_idx on public.acessos_suporte (petshop_id, inicio desc);
alter table public.acessos_suporte enable row level security;
