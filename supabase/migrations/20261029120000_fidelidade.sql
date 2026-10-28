-- Programa de fidelidade (cartão de carimbos): a cada N atendimentos pagos o
-- cliente ganha um prêmio (banho grátis ou desconto). Conta por cliente,
-- somando todos os pets. Os carimbos saem dos próprios agendamentos; só o
-- uso do prêmio fica marcado no atendimento em que ele foi aplicado.

create table fidelidade_config (
  petshop_id uuid primary key references petshops (id) on delete cascade,
  -- Desligado até o dono ligar em Fidelidade.
  ativo boolean not null default false,
  -- Atendimentos pagos para ganhar um prêmio.
  meta smallint not null default 10 check (meta between 2 and 50),
  -- 100 = atendimento grátis.
  desconto_pct smallint not null default 100 check (desconto_pct between 5 and 100),
  -- Como o prêmio aparece pro cliente ("Banho grátis", "50% no próximo banho").
  premio text not null default 'Banho grátis' check (char_length(premio) between 2 and 60),
  -- Serviços que contam carimbo. null = todos.
  servico_ids uuid[],
  -- Manda WhatsApp quando o cliente ganha o prêmio.
  avisar_whatsapp boolean not null default true,
  -- Só conta atendimentos a partir desta data.
  contar_desde date not null default current_date,
  atualizado_em timestamptz not null default now()
);

alter table fidelidade_config enable row level security;
create policy fidelidade_config_tenant_isolation on fidelidade_config
  for all using (petshop_id = public.current_petshop_id())
  with check (petshop_id = public.current_petshop_id());

-- Atendimento em que o prêmio foi usado: não conta carimbo e guarda o valor
-- de antes do desconto pra poder desfazer.
alter table agendamentos
  add column fidelidade_resgate boolean not null default false,
  add column fidelidade_valor_original int;

-- Um aviso por prêmio ganho (o 1º, o 2º...). Evita mandar duas vezes.
create table fidelidade_avisos (
  id uuid primary key default gen_random_uuid(),
  petshop_id uuid not null references petshops (id) on delete cascade,
  tutor_id uuid not null references tutores (id) on delete cascade,
  premio_numero int not null,
  status text not null check (status in ('enviado', 'erro', 'ignorado')),
  erro text,
  criado_em timestamptz not null default now(),
  unique (tutor_id, premio_numero)
);
create index fidelidade_avisos_petshop_idx on fidelidade_avisos (petshop_id, criado_em desc);

alter table fidelidade_avisos enable row level security;
create policy fidelidade_avisos_tenant_isolation on fidelidade_avisos
  for all using (petshop_id = public.current_petshop_id())
  with check (petshop_id = public.current_petshop_id());

alter table mensagens_whatsapp drop constraint if exists mensagens_whatsapp_tipo_check;
alter table mensagens_whatsapp add constraint mensagens_whatsapp_tipo_check
  check (tipo in ('teste', 'lembrete', 'confirmacao', 'otp', 'fechamento', 'relatorio', 'retorno', 'plano_sobrando', 'pet_pronto', 'fidelidade'));
