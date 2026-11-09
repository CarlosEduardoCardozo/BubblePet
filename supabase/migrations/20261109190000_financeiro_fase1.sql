-- Financeiro fase 1: caixas, métodos de pagamento (com taxas e prazo de
-- recebimento), categorias, recorrências e lançamentos.
-- Dinheiro em centavos (int), como no resto do schema. Taxa sempre guardada
-- no lançamento (bruto, taxa, líquido) pra mudar a taxa do método depois não
-- reescrever o histórico.

-- ---------------------------------------------------------------------------
-- Caixas
-- ---------------------------------------------------------------------------
alter table petshops
  add column usa_varios_caixas boolean not null default false;

create table caixas (
  id uuid primary key default gen_random_uuid(),
  petshop_id uuid not null references petshops (id) on delete cascade,
  nome text not null,
  tipo text not null default 'balcao'
    check (tipo in ('balcao', 'banco', 'maquininha')),
  principal boolean not null default false,
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);
create index caixas_petshop_id_idx on caixas (petshop_id);
-- Um único caixa principal por petshop.
create unique index caixas_um_principal_idx on caixas (petshop_id) where principal;

-- ---------------------------------------------------------------------------
-- Métodos de pagamento
-- ---------------------------------------------------------------------------
create table metodos_pagamento (
  id uuid primary key default gen_random_uuid(),
  petshop_id uuid not null references petshops (id) on delete cascade,
  descricao text not null,
  tipo text not null
    check (tipo in ('dinheiro', 'pix', 'link_pagamento', 'cartao_credito', 'maquina_cartao', 'boleto')),
  bandeira text,
  ativo boolean not null default true,
  -- Caixa onde o dinheiro cai. Nulo = caixa principal.
  caixa_id uuid references caixas (id) on delete set null,
  -- Taxa fixa: escolhe uma das duas (R$ ou %). Ambas nulas = sem taxa fixa.
  taxa_fixa_tipo text check (taxa_fixa_tipo in ('reais', 'percentual')),
  taxa_fixa_valor numeric(10, 4) check (taxa_fixa_valor >= 0),
  -- Prazo de recebimento: D+1, D+14, D+30 ou personalizado.
  prazo_modo text not null default 'd1'
    check (prazo_modo in ('d1', 'd14', 'd30', 'personalizado')),
  prazo_dias smallint not null default 1 check (prazo_dias between 0 and 365),
  -- Crédito parcelado: cada parcela cai no seu mês, ou tudo junto.
  parcelado_modo text not null default 'parcela_a_parcela'
    check (parcelado_modo in ('parcela_a_parcela', 'tudo_junto')),
  max_parcelas smallint not null default 1 check (max_parcelas between 1 and 12),
  -- Método criado pelo sistema (ex.: Dinheiro): pode desativar, não excluir.
  sistema boolean not null default false,
  criado_em timestamptz not null default now(),
  constraint metodos_taxa_fixa_completa
    check ((taxa_fixa_tipo is null) = (taxa_fixa_valor is null)),
  constraint metodos_prazo_coerente
    check (
      (prazo_modo = 'd1' and prazo_dias = 1)
      or (prazo_modo = 'd14' and prazo_dias = 14)
      or (prazo_modo = 'd30' and prazo_dias = 30)
      or prazo_modo = 'personalizado'
    )
);
create index metodos_pagamento_petshop_id_idx on metodos_pagamento (petshop_id);
create index metodos_pagamento_caixa_id_idx on metodos_pagamento (caixa_id);

-- Percentual por número de parcelas (1 = à vista). Pix, dinheiro e boleto
-- usam só a linha de 1x.
create table metodo_taxas_parcela (
  metodo_id uuid not null references metodos_pagamento (id) on delete cascade,
  petshop_id uuid not null references petshops (id) on delete cascade,
  parcelas smallint not null check (parcelas between 1 and 12),
  percentual numeric(6, 3) not null default 0 check (percentual between 0 and 100),
  primary key (metodo_id, parcelas)
);
create index metodo_taxas_parcela_petshop_id_idx on metodo_taxas_parcela (petshop_id);

-- ---------------------------------------------------------------------------
-- Categorias e recorrências
-- ---------------------------------------------------------------------------
create table categorias_financeiras (
  id uuid primary key default gen_random_uuid(),
  petshop_id uuid not null references petshops (id) on delete cascade,
  nome text not null,
  tipo text not null check (tipo in ('entrada', 'saida')),
  ativa boolean not null default true,
  criado_em timestamptz not null default now(),
  unique (petshop_id, tipo, nome)
);
create index categorias_financeiras_petshop_id_idx on categorias_financeiras (petshop_id);

create table recorrencias (
  id uuid primary key default gen_random_uuid(),
  petshop_id uuid not null references petshops (id) on delete cascade,
  tipo text not null check (tipo in ('entrada', 'saida')),
  descricao text not null,
  valor_centavos int not null check (valor_centavos > 0),
  categoria_id uuid references categorias_financeiras (id) on delete set null,
  metodo_id uuid references metodos_pagamento (id) on delete set null,
  caixa_id uuid references caixas (id) on delete set null,
  frequencia text not null default 'mensal'
    check (frequencia in ('semanal', 'mensal', 'anual')),
  dia_mes smallint check (dia_mes between 1 and 31),
  data_inicio date not null default current_date,
  data_fim date,
  ativa boolean not null default true,
  ultima_geracao date,
  criado_em timestamptz not null default now(),
  check (data_fim is null or data_fim >= data_inicio)
);
create index recorrencias_petshop_id_idx on recorrencias (petshop_id);
create index recorrencias_categoria_id_idx on recorrencias (categoria_id);
create index recorrencias_metodo_id_idx on recorrencias (metodo_id);
create index recorrencias_caixa_id_idx on recorrencias (caixa_id);

-- ---------------------------------------------------------------------------
-- Lançamentos
-- ---------------------------------------------------------------------------
create table lancamentos (
  id uuid primary key default gen_random_uuid(),
  petshop_id uuid not null references petshops (id) on delete cascade,
  tipo text not null check (tipo in ('entrada', 'saida')),
  descricao text,
  valor_bruto_centavos int not null check (valor_bruto_centavos > 0),
  taxa_centavos int not null default 0 check (taxa_centavos >= 0),
  valor_liquido_centavos int generated always as (valor_bruto_centavos - taxa_centavos) stored,
  metodo_id uuid references metodos_pagamento (id) on delete set null,
  caixa_id uuid not null references caixas (id),
  categoria_id uuid references categorias_financeiras (id) on delete set null,
  -- Parcelas de um mesmo pagamento compartilham o grupo_id.
  grupo_id uuid,
  parcela_numero smallint not null default 1 check (parcela_numero >= 1),
  parcelas_total smallint not null default 1 check (parcelas_total between 1 and 12),
  status text not null default 'previsto'
    check (status in ('previsto', 'realizado', 'cancelado')),
  -- Competência: mês a que o lançamento pertence (1º dia do mês).
  competencia date not null,
  data_prevista date not null,
  data_recebimento date,
  origem text not null default 'manual'
    check (origem in ('manual', 'extrato', 'recorrencia', 'pdv')),
  fechamento_id uuid references fechamentos (id) on delete set null,
  recorrencia_id uuid references recorrencias (id) on delete set null,
  criado_por uuid default auth.uid() references perfis (id) on delete set null,
  criado_em timestamptz not null default now(),
  constraint lancamentos_realizado_com_data
    check (status <> 'realizado' or data_recebimento is not null),
  constraint lancamentos_taxa_menor_que_bruto
    check (taxa_centavos <= valor_bruto_centavos),
  constraint lancamentos_parcela_valida
    check (parcela_numero <= parcelas_total)
);
create index lancamentos_petshop_prevista_idx on lancamentos (petshop_id, data_prevista);
create index lancamentos_petshop_competencia_idx on lancamentos (petshop_id, competencia);
create index lancamentos_petshop_status_idx on lancamentos (petshop_id, status);
create index lancamentos_caixa_id_idx on lancamentos (caixa_id);
create index lancamentos_metodo_id_idx on lancamentos (metodo_id);
create index lancamentos_categoria_id_idx on lancamentos (categoria_id);
create index lancamentos_fechamento_id_idx on lancamentos (fechamento_id);
create index lancamentos_recorrencia_id_idx on lancamentos (recorrencia_id);
create index lancamentos_grupo_id_idx on lancamentos (grupo_id);
create index lancamentos_criado_por_idx on lancamentos (criado_por);

-- ---------------------------------------------------------------------------
-- RLS. Configuração (caixas e métodos): todo mundo da equipe lê, só quem tem
-- "configuracoes" altera. Movimento (lançamentos, categorias, recorrências):
-- só quem tem a área "financeiro".
-- ---------------------------------------------------------------------------
alter table caixas enable row level security;
alter table metodos_pagamento enable row level security;
alter table metodo_taxas_parcela enable row level security;
alter table categorias_financeiras enable row level security;
alter table recorrencias enable row level security;
alter table lancamentos enable row level security;

create policy caixas_leitura on caixas
  for select using (petshop_id = public.current_petshop_id());
create policy caixas_escrita on caixas
  for insert with check (petshop_id = public.current_petshop_id() and public.tem_permissao('configuracoes'));
create policy caixas_alteracao on caixas
  for update using (petshop_id = public.current_petshop_id() and public.tem_permissao('configuracoes'))
  with check (petshop_id = public.current_petshop_id() and public.tem_permissao('configuracoes'));
create policy caixas_exclusao on caixas
  for delete using (petshop_id = public.current_petshop_id() and public.tem_permissao('configuracoes'));

create policy metodos_pagamento_leitura on metodos_pagamento
  for select using (petshop_id = public.current_petshop_id());
create policy metodos_pagamento_escrita on metodos_pagamento
  for insert with check (petshop_id = public.current_petshop_id() and public.tem_permissao('configuracoes'));
create policy metodos_pagamento_alteracao on metodos_pagamento
  for update using (petshop_id = public.current_petshop_id() and public.tem_permissao('configuracoes'))
  with check (petshop_id = public.current_petshop_id() and public.tem_permissao('configuracoes'));
create policy metodos_pagamento_exclusao on metodos_pagamento
  for delete using (
    petshop_id = public.current_petshop_id()
    and public.tem_permissao('configuracoes')
    and not sistema
  );

create policy metodo_taxas_parcela_leitura on metodo_taxas_parcela
  for select using (petshop_id = public.current_petshop_id());
create policy metodo_taxas_parcela_escrita on metodo_taxas_parcela
  for insert with check (petshop_id = public.current_petshop_id() and public.tem_permissao('configuracoes'));
create policy metodo_taxas_parcela_alteracao on metodo_taxas_parcela
  for update using (petshop_id = public.current_petshop_id() and public.tem_permissao('configuracoes'))
  with check (petshop_id = public.current_petshop_id() and public.tem_permissao('configuracoes'));
create policy metodo_taxas_parcela_exclusao on metodo_taxas_parcela
  for delete using (petshop_id = public.current_petshop_id() and public.tem_permissao('configuracoes'));

create policy categorias_financeiras_financeiro on categorias_financeiras
  for all using (petshop_id = public.current_petshop_id() and public.tem_permissao('financeiro'))
  with check (petshop_id = public.current_petshop_id() and public.tem_permissao('financeiro'));

create policy recorrencias_financeiro on recorrencias
  for all using (petshop_id = public.current_petshop_id() and public.tem_permissao('financeiro'))
  with check (petshop_id = public.current_petshop_id() and public.tem_permissao('financeiro'));

create policy lancamentos_financeiro on lancamentos
  for all using (petshop_id = public.current_petshop_id() and public.tem_permissao('financeiro'))
  with check (petshop_id = public.current_petshop_id() and public.tem_permissao('financeiro'));

-- ---------------------------------------------------------------------------
-- Dados iniciais por petshop: Caixa principal, método Dinheiro (sem taxa) e
-- categorias padrão. Idempotente. Só o trigger e esta migration chamam.
-- ---------------------------------------------------------------------------
create or replace function public.semear_financeiro(p_petshop_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caixa uuid;
  v_metodo uuid;
begin
  select id into v_caixa from caixas where petshop_id = p_petshop_id and principal;
  if v_caixa is null then
    insert into caixas (petshop_id, nome, tipo, principal)
    values (p_petshop_id, 'Caixa principal', 'balcao', true)
    returning id into v_caixa;
  end if;

  if not exists (
    select 1 from metodos_pagamento
    where petshop_id = p_petshop_id and tipo = 'dinheiro' and sistema
  ) then
    insert into metodos_pagamento (petshop_id, descricao, tipo, caixa_id, prazo_modo, prazo_dias, sistema)
    values (p_petshop_id, 'Dinheiro', 'dinheiro', v_caixa, 'personalizado', 0, true)
    returning id into v_metodo;
    insert into metodo_taxas_parcela (metodo_id, petshop_id, parcelas, percentual)
    values (v_metodo, p_petshop_id, 1, 0);
  end if;

  insert into categorias_financeiras (petshop_id, nome, tipo)
  select p_petshop_id, c.nome, c.tipo
  from (values
    ('Banho e tosa', 'entrada'),
    ('Mensalidade de plano', 'entrada'),
    ('Produtos', 'entrada'),
    ('Outras entradas', 'entrada'),
    ('Aluguel', 'saida'),
    ('Salários', 'saida'),
    ('Produtos e insumos', 'saida'),
    ('Água e energia', 'saida'),
    ('Internet e telefone', 'saida'),
    ('Impostos', 'saida'),
    ('Marketing', 'saida'),
    ('Outras saídas', 'saida')
  ) as c (nome, tipo)
  on conflict (petshop_id, tipo, nome) do nothing;
end;
$$;

revoke execute on function public.semear_financeiro(uuid) from anon, authenticated, public;

create or replace function public.petshops_semear_financeiro()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.semear_financeiro(new.id);
  return new;
end;
$$;

revoke execute on function public.petshops_semear_financeiro() from anon, authenticated, public;

create trigger petshops_semear_financeiro
  after insert on petshops
  for each row execute function public.petshops_semear_financeiro();

-- Petshops que já existem.
select public.semear_financeiro(id) from petshops;
