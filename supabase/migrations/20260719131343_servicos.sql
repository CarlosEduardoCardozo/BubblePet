-- Fase 1: catálogo de serviços do petshop (seção 4.2 do doc).

create table servicos (
  id uuid primary key default gen_random_uuid(),
  petshop_id uuid not null references petshops (id) on delete cascade,
  nome text not null,
  duracao_min int not null default 60,
  preco_centavos int not null,
  ativo boolean not null default true
);
create index servicos_petshop_id_idx on servicos (petshop_id);

alter table servicos enable row level security;

create policy servicos_tenant_isolation on servicos
  for all using (petshop_id = public.current_petshop_id())
  with check (petshop_id = public.current_petshop_id());
