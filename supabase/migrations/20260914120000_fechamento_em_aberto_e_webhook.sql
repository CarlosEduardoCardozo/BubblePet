-- Fechamento passa a cobrar "tudo que ainda não foi cobrado" (e não mais o
-- mês do calendário): cada agendamento aponta pro extrato em que entrou.
-- Extrato enviado ou pago fica congelado; só o rascunho (aberto e não
-- enviado) é recalculado — no máximo um rascunho por cliente.

alter table agendamentos
  add column fechamento_id uuid references fechamentos (id) on delete set null;
create index agendamentos_fechamento_id_idx on agendamentos (fechamento_id);

alter table fechamentos
  drop constraint fechamentos_petshop_id_tutor_id_competencia_key,
  add column periodo_inicio date,
  add column periodo_fim date;

create unique index fechamentos_um_rascunho_por_tutor
  on fechamentos (petshop_id, tutor_id)
  where status = 'aberto' and enviado_em is null;

-- Segredo da URL do webhook da UAZAPI (respostas dos botões Confirmar/Cancelar).
alter table petshop_whatsapp add column webhook_secret text;
