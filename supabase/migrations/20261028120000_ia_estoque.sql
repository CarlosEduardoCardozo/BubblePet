-- IA nas mensagens de retorno + controle de estoque (cadastro pela foto).

-- "Estoque" vira uma área que o dono libera por usuário da equipe.
alter table public.perfis drop constraint if exists perfis_permissoes_check;
alter table public.perfis add constraint perfis_permissoes_check
  check (permissoes <@ array['agenda', 'clientes', 'planos', 'servicos', 'estoque', 'financeiro', 'configuracoes']::text[]);

alter table retorno_config
  add column usar_ia boolean not null default false,
  add column tom_ia text check (tom_ia is null or length(tom_ia) <= 300);

create table produtos (
  id uuid primary key default gen_random_uuid(),
  petshop_id uuid not null references petshops (id) on delete cascade,
  nome text not null check (length(trim(nome)) between 2 and 120),
  marca text,
  categoria text not null default 'outro'
    check (categoria in ('shampoo', 'condicionador', 'perfume', 'higiene', 'medicamento', 'racao', 'petisco', 'acessorio', 'outro')),
  -- Tamanho da embalagem, como vem no rótulo ("5 L", "500 ml", "1 kg").
  conteudo text,
  -- Quantidade em estoque, na unidade escolhida (unidades ou embalagens).
  quantidade numeric(10, 2) not null default 0 check (quantidade >= 0),
  unidade text not null default 'un' check (unidade in ('un', 'frasco', 'pacote', 'caixa', 'litro', 'kg')),
  -- Abaixo disso o produto aparece como "acabando".
  minimo numeric(10, 2) not null default 0 check (minimo >= 0),
  custo_centavos int check (custo_centavos is null or custo_centavos >= 0),
  preco_centavos int check (preco_centavos is null or preco_centavos >= 0),
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index produtos_petshop_idx on produtos (petshop_id, ativo, nome);

alter table produtos enable row level security;
create policy produtos_estoque on produtos
  for all using (petshop_id = public.current_petshop_id() and public.tem_permissao('estoque'))
  with check (petshop_id = public.current_petshop_id() and public.tem_permissao('estoque'));

create table estoque_movimentos (
  id uuid primary key default gen_random_uuid(),
  petshop_id uuid not null references petshops (id) on delete cascade,
  produto_id uuid not null references produtos (id) on delete cascade,
  tipo text not null check (tipo in ('entrada', 'saida', 'ajuste')),
  -- Entrada e saída são positivas; o ajuste guarda a quantidade nova.
  quantidade numeric(10, 2) not null check (quantidade >= 0),
  saldo_depois numeric(10, 2) not null,
  motivo text,
  criado_por uuid references auth.users (id),
  criado_em timestamptz not null default now()
);
create index estoque_movimentos_produto_idx on estoque_movimentos (produto_id, criado_em desc);

alter table estoque_movimentos enable row level security;
create policy estoque_movimentos_estoque on estoque_movimentos
  for all using (petshop_id = public.current_petshop_id() and public.tem_permissao('estoque'))
  with check (petshop_id = public.current_petshop_id() and public.tem_permissao('estoque'));

-- Movimenta e registra numa transação só (duas pessoas mexendo ao mesmo
-- tempo não perdem baixa). security invoker: a RLS vale normalmente.
create or replace function public.movimentar_estoque(
  p_produto_id uuid,
  p_tipo text,
  p_quantidade numeric,
  p_motivo text default null
)
returns numeric
language plpgsql
set search_path = public
as $$
declare
  v_atual numeric;
  v_novo numeric;
  v_petshop uuid;
begin
  if p_quantidade is null or p_quantidade < 0 then
    raise exception 'Quantidade inválida.';
  end if;

  select quantidade, petshop_id into v_atual, v_petshop
  from produtos where id = p_produto_id for update;
  if v_atual is null then
    raise exception 'Produto não encontrado.';
  end if;

  v_novo := case p_tipo
    when 'entrada' then v_atual + p_quantidade
    when 'saida' then v_atual - p_quantidade
    when 'ajuste' then p_quantidade
  end;
  if v_novo is null then
    raise exception 'Tipo de movimento inválido.';
  end if;
  if v_novo < 0 then
    raise exception 'Saída maior que o estoque (tem %).', v_atual;
  end if;

  update produtos set quantidade = v_novo, atualizado_em = now() where id = p_produto_id;
  insert into estoque_movimentos (petshop_id, produto_id, tipo, quantidade, saldo_depois, motivo, criado_por)
  values (v_petshop, p_produto_id, p_tipo, p_quantidade, v_novo, nullif(trim(p_motivo), ''), auth.uid());
  return v_novo;
end;
$$;

revoke execute on function public.movimentar_estoque(uuid, text, numeric, text) from public, anon;
grant execute on function public.movimentar_estoque(uuid, text, numeric, text) to authenticated;
