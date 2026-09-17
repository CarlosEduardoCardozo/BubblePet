-- Textos das mensagens de WhatsApp personalizados por petshop.
-- { "confirmacao": "Oi, {tutor}! ...", "fechamento": "..." } — tipo ausente
-- usa o texto padrão do BubblePet.
alter table public.petshops
  add column modelos_mensagem jsonb not null default '{}'::jsonb
    check (jsonb_typeof(modelos_mensagem) = 'object');
