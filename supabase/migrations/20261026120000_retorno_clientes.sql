-- Retorno de clientes: o sistema descobre de quanto em quanto tempo cada pet
-- volta, avisa o tutor pelo WhatsApp quando chega a hora (ou quando sobra
-- banho do plano no mês) e mostra tudo no painel de Oportunidades.
-- O envio é espaçado de propósito: muitas mensagens seguidas do número do
-- petshop levam a bloqueio no WhatsApp.

create table retorno_config (
  petshop_id uuid primary key references petshops (id) on delete cascade,
  -- Desligado até o dono ligar em Oportunidades.
  ativo boolean not null default false,
  -- Avisa N dias antes da data prevista de volta.
  dias_antes smallint not null default 2 check (dias_antes between 0 and 15),
  -- Intervalo usado quando o pet só veio uma vez.
  intervalo_padrao_dias smallint not null default 30 check (intervalo_padrao_dias between 7 and 120),
  janela_inicio time not null default '09:00',
  janela_fim time not null default '18:00',
  -- Minutos entre uma mensagem e a próxima.
  intervalo_envio_min smallint not null default 20 check (intervalo_envio_min between 5 and 120),
  limite_dia smallint not null default 15 check (limite_dia between 1 and 50),
  -- Não manda de novo pro mesmo pet antes disso.
  reenviar_apos_dias smallint not null default 21 check (reenviar_apos_dias between 7 and 90),
  -- Avisa quem ainda tem banho do plano sobrando nos últimos dias do mês.
  avisar_plano_sobrando boolean not null default true,
  dias_fim_mes smallint not null default 10 check (dias_fim_mes between 3 and 20),
  -- Último dia em que a rotina montou a fila (America/Sao_Paulo).
  planejado_em date,
  atualizado_em timestamptz not null default now(),
  constraint retorno_config_janela check (janela_fim > janela_inicio)
);

alter table retorno_config enable row level security;
create policy retorno_config_tenant_isolation on retorno_config
  for all using (petshop_id = public.current_petshop_id())
  with check (petshop_id = public.current_petshop_id());

-- Fila de mensagens automáticas. "Quando vai ser enviado" vem daqui.
create table mensagens_agendadas (
  id uuid primary key default gen_random_uuid(),
  petshop_id uuid not null references petshops (id) on delete cascade,
  pet_id uuid not null references pets (id) on delete cascade,
  tutor_id uuid not null references tutores (id) on delete cascade,
  tipo text not null check (tipo in ('retorno', 'plano_sobrando')),
  agendada_para timestamptz not null,
  status text not null default 'pendente'
    check (status in ('pendente', 'enviada', 'cancelada', 'erro')),
  -- 'automatico' (rotina) ou 'manual' (botão Enviar agora).
  origem text not null default 'automatico' check (origem in ('automatico', 'manual')),
  enviada_em timestamptz,
  erro text,
  criado_em timestamptz not null default now()
);
create index mensagens_agendadas_fila_idx on mensagens_agendadas (petshop_id, status, agendada_para);
create index mensagens_agendadas_pet_idx on mensagens_agendadas (pet_id, criado_em desc);

alter table mensagens_agendadas enable row level security;
create policy mensagens_agendadas_tenant_isolation on mensagens_agendadas
  for all using (petshop_id = public.current_petshop_id())
  with check (petshop_id = public.current_petshop_id());

-- "Não incomodar" por pet: fica fora das mensagens automáticas.
alter table pets add column retorno_pausado boolean not null default false;

-- Novos tipos no histórico de envios.
alter table mensagens_whatsapp drop constraint if exists mensagens_whatsapp_tipo_check;
alter table mensagens_whatsapp add constraint mensagens_whatsapp_tipo_check
  check (tipo in ('teste', 'lembrete', 'confirmacao', 'otp', 'fechamento', 'relatorio', 'retorno', 'plano_sobrando'));

-- Rotina: a cada 5 minutos o banco chama o app, que monta a fila do dia e
-- envia no máximo uma mensagem por petshop por vez. Endereço e segredo
-- ficam numa tabela sem policy (só o service role lê).
create extension if not exists pg_net;

create table sistema_rotinas (
  id smallint primary key default 1 check (id = 1),
  base_url text not null,
  segredo text not null
);
alter table sistema_rotinas enable row level security;

insert into sistema_rotinas (base_url, segredo)
values ('https://bubblepets.vercel.app', replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''));

create or replace function public.chamar_rotina_retorno()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v sistema_rotinas%rowtype;
begin
  select * into v from sistema_rotinas where id = 1;
  if v.base_url is null then return; end if;
  perform net.http_post(
    url := v.base_url || '/api/rotinas/retorno',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-rotina-segredo', v.segredo),
    body := '{}'::jsonb,
    timeout_milliseconds := 55000
  );
end;
$$;

revoke execute on function public.chamar_rotina_retorno() from public, anon, authenticated;

select cron.schedule('retorno-clientes', '*/5 * * * *', $$select public.chamar_rotina_retorno()$$);
