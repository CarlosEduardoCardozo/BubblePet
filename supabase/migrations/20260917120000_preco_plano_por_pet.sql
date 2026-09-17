-- Valor do plano combinado pra cada pet. Null = vale o preço do plano.
alter table public.assinaturas
  add column preco_centavos int check (preco_centavos is null or preco_centavos >= 0);
