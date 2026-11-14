-- Data em que a venda/despesa aconteceu. É o que o "Caixa do dia" usa pra
-- somar o que entrou e saiu; data_prevista é quando o dinheiro cai (ou a
-- despesa vence) e data_recebimento é quando de fato caiu ou foi paga.
alter table lancamentos
  add column data_lancamento date not null default current_date;

create index lancamentos_petshop_data_lancamento_idx
  on lancamentos (petshop_id, data_lancamento);
