-- Fase 2: agenda (seção 4.2 do doc).
-- assinatura_id fica sem FK por enquanto — a tabela `assinaturas` só nasce na
-- Fase 3 (planos/créditos). A constraint é adicionada lá.

create table agendamentos (
  id uuid primary key default gen_random_uuid(),
  petshop_id uuid not null references petshops (id) on delete cascade,
  pet_id uuid not null references pets (id) on delete cascade,
  servico_id uuid not null references servicos (id),
  inicio timestamptz not null,
  fim timestamptz not null,
  status text not null default 'agendado'
    check (status in ('agendado', 'confirmado', 'concluido', 'cancelado', 'faltou')),
  origem_plano boolean not null default false,
  assinatura_id uuid,
  valor_centavos int,
  observacoes text,
  criado_em timestamptz not null default now(),
  constraint agendamentos_fim_apos_inicio check (fim > inicio)
);
create index agendamentos_petshop_inicio_idx on agendamentos (petshop_id, inicio);

alter table agendamentos enable row level security;

create policy agendamentos_tenant_isolation on agendamentos
  for all using (petshop_id = public.current_petshop_id())
  with check (petshop_id = public.current_petshop_id());
