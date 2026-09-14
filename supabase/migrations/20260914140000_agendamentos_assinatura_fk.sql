-- Prometida na Fase 2 ("a constraint é adicionada na Fase 3") e esquecida:
-- sem ela o PostgREST não resolve agendamentos -> assinaturas e a montagem
-- da confirmação/lembrete falhava.
alter table agendamentos
  add constraint agendamentos_assinatura_id_fkey
  foreign key (assinatura_id) references assinaturas (id) on delete set null;
create index agendamentos_assinatura_id_idx on agendamentos (assinatura_id);
notify pgrst, 'reload schema';
