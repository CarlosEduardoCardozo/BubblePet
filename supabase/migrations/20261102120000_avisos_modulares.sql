-- Avisos modulares do WhatsApp: confirmação pré-ativada, lembretes automáticos
-- em quantos horários o petshop quiser (24 h antes, 4 h antes...) e textos dos
-- botões personalizados. Cada agendamento guarda os lembretes que vale para
-- ele e pode ser ajustado na hora.

create table avisos_config (
  petshop_id uuid primary key references petshops (id) on delete cascade,
  -- Confirmação ao marcar: já vem ligada na agenda (a pessoa desliga por agendamento).
  confirmacao_ativa boolean not null default true,
  -- Lista de {horas, ativo}: quantas horas antes do atendimento cada lembrete sai.
  lembretes jsonb not null default '[{"horas":24,"ativo":true},{"horas":4,"ativo":false}]'::jsonb,
  -- Texto dos botões (o WhatsApp aceita até 20 caracteres).
  botao_confirmar text not null default 'Confirmar' check (char_length(botao_confirmar) between 1 and 20),
  botao_cancelar text not null default 'Cancelar' check (char_length(botao_cancelar) between 1 and 20),
  -- Linha embaixo dos botões; null = texto padrão do BubblePet.
  rodape text check (rodape is null or char_length(rodape) <= 120),
  -- Lembrete automático só sai dentro desta janela (horas, horário de São Paulo).
  janela_inicio smallint not null default 8 check (janela_inicio between 0 and 23),
  janela_fim smallint not null default 20 check (janela_fim between 1 and 24),
  atualizado_em timestamptz not null default now()
);

alter table avisos_config enable row level security;
create policy avisos_config_tenant_isolation on avisos_config
  for all using (petshop_id = public.current_petshop_id())
  with check (petshop_id = public.current_petshop_id());

-- Lembretes que valem para o agendamento: {"lembretes":[24,4]} (horas antes).
-- null = agendamento antigo, sem lembrete automático.
alter table agendamentos add column avisos jsonb;

-- Todo agendamento novo, venha de onde vier (agenda, link público, plano),
-- recebe os lembretes padrão do petshop, se ele não trouxer os próprios.
create or replace function public.preencher_avisos_agendamento()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_horas jsonb;
begin
  if new.avisos is not null then
    return new;
  end if;
  select coalesce(jsonb_agg((l->>'horas')::int), '[]'::jsonb)
    into v_horas
    from avisos_config c, jsonb_array_elements(c.lembretes) l
   where c.petshop_id = new.petshop_id
     and coalesce((l->>'ativo')::boolean, false);
  if not exists (select 1 from avisos_config where petshop_id = new.petshop_id) then
    v_horas := '[24]'::jsonb;
  end if;
  new.avisos := jsonb_build_object('lembretes', v_horas);
  return new;
end;
$$;

create trigger agendamentos_preencher_avisos
before insert on agendamentos
for each row execute function public.preencher_avisos_agendamento();

-- Controle do que já saiu: um lembrete por agendamento e por horário.
create table agendamento_lembretes (
  id uuid primary key default gen_random_uuid(),
  petshop_id uuid not null references petshops (id) on delete cascade,
  agendamento_id uuid not null references agendamentos (id) on delete cascade,
  horas smallint not null,
  status text not null check (status in ('enviado', 'erro', 'ignorado')),
  erro text,
  criado_em timestamptz not null default now(),
  unique (agendamento_id, horas)
);
create index agendamento_lembretes_petshop_idx on agendamento_lembretes (petshop_id, criado_em desc);

alter table agendamento_lembretes enable row level security;
create policy agendamento_lembretes_tenant_isolation on agendamento_lembretes
  for all using (petshop_id = public.current_petshop_id())
  with check (petshop_id = public.current_petshop_id());

-- Aviso ao cliente quando o petshop cancela o dia.
alter table mensagens_whatsapp drop constraint if exists mensagens_whatsapp_tipo_check;
alter table mensagens_whatsapp add constraint mensagens_whatsapp_tipo_check
  check (tipo in ('teste', 'lembrete', 'confirmacao', 'otp', 'fechamento', 'relatorio', 'retorno', 'plano_sobrando', 'pet_pronto', 'fidelidade', 'dia_cancelado'));
