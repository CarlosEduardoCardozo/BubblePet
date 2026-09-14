-- URL do webhook registrada na UAZAPI pra esta instância. Só a versão
-- publicada (https) registra: o localhost usa a mesma instância e desviaria
-- as respostas de produção.
alter table petshop_whatsapp add column webhook_url text;
create unique index petshop_whatsapp_webhook_secret_uidx
  on petshop_whatsapp (webhook_secret)
  where webhook_secret is not null;
