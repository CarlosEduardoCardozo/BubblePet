-- Preço por porte, adicionais no agendamento e controle de acesso por conta.

-- Preço opcional por porte; sem valor, vale servicos.preco_centavos.
alter table servicos
  add column preco_pequeno_centavos int check (preco_pequeno_centavos >= 0),
  add column preco_medio_centavos int check (preco_medio_centavos >= 0),
  add column preco_grande_centavos int check (preco_grande_centavos >= 0);

-- Extras do atendimento (desembolo, procedimento diferente...):
-- [{ "descricao": "Desembolo", "valorCentavos": 2000 }]. Cobrados no
-- fechamento mesmo quando o banho é coberto pelo plano.
alter table agendamentos
  add column adicionais jsonb not null default '[]'::jsonb
    check (jsonb_typeof(adicionais) = 'array');

-- Conta congelada pelo admin da plataforma: some tudo pro usuário (RLS) e
-- o link público fica indisponível.
alter table petshops
  add column status text not null default 'ativo' check (status in ('ativo', 'congelado')),
  add column congelado_em timestamptz;

-- current_petshop_id() só devolve petshop ativo: todas as policies de
-- tenant usam essa função, então congelar corta o acesso em todo lugar.
create or replace function public.current_petshop_id()
returns uuid
language sql
security definer
stable
set search_path = public
as $$
  select p.petshop_id
  from perfis p
  join petshops s on s.id = p.petshop_id
  where p.id = auth.uid()
    and s.status = 'ativo'
$$;
