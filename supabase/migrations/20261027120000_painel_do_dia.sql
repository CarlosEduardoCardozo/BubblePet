-- Painel do dia: cada atendimento anda por etapas (chegou → banho →
-- secagem → pronto → entregue). Em "pronto" o tutor é avisado pelo
-- WhatsApp que pode buscar; em "entregue" o atendimento vira concluído.

alter table agendamentos
  add column etapa text check (etapa in ('chegou', 'banho', 'secagem', 'pronto', 'entregue')),
  add column etapa_em timestamptz,
  -- Evita mandar o "pode buscar" duas vezes se a etapa for e voltar.
  add column pronto_avisado_em timestamptz;

alter table mensagens_whatsapp drop constraint if exists mensagens_whatsapp_tipo_check;
alter table mensagens_whatsapp add constraint mensagens_whatsapp_tipo_check
  check (tipo in ('teste', 'lembrete', 'confirmacao', 'otp', 'fechamento', 'relatorio', 'retorno', 'plano_sobrando', 'pet_pronto'));
