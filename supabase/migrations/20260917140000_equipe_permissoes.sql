-- Equipe do petshop com permissões por área (recepção só com agenda e
-- clientes, por exemplo), usuário desativável e registro de uso.

alter table public.perfis
  add column permissoes text[] not null default '{}'
    check (permissoes <@ array['agenda', 'clientes', 'planos', 'servicos', 'financeiro', 'configuracoes']::text[]),
  add column ativo boolean not null default true,
  add column ultimo_uso_em timestamptz,
  add column criado_por uuid references auth.users (id) on delete set null;

-- Até aqui o usuário podia dar UPDATE na própria linha inteira — inclusive
-- role, petshop_id e agora permissoes. Equipe só é alterada pelo servidor
-- (service role, depois de conferir que quem pede é o dono).
drop policy if exists perfis_update_self on public.perfis;

-- Usuário desativado perde o acesso a todos os dados na hora.
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
    and p.ativo
    and s.status = 'ativo'
$$;

-- Dono pode tudo; os demais só as áreas marcadas.
create or replace function public.tem_permissao(p_modulo text)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from perfis p
    join petshops s on s.id = p.petshop_id
    where p.id = auth.uid()
      and p.ativo
      and s.status = 'ativo'
      and (p.role = 'dono' or p_modulo = any (p.permissoes))
  )
$$;

revoke execute on function public.tem_permissao(text) from anon, public;
grant execute on function public.tem_permissao(text) to authenticated;

-- Financeiro: extratos só pra quem tem a área.
drop policy if exists fechamentos_tenant_isolation on public.fechamentos;
create policy fechamentos_financeiro on public.fechamentos
  for all
  using (petshop_id = current_petshop_id() and tem_permissao('financeiro'))
  with check (petshop_id = current_petshop_id() and tem_permissao('financeiro'));

-- Serviços e planos: todo mundo da equipe lê (a agenda precisa); só quem tem
-- a área cria, edita ou desativa.
drop policy if exists servicos_tenant_isolation on public.servicos;
create policy servicos_leitura on public.servicos
  for select using (petshop_id = current_petshop_id());
create policy servicos_escrita on public.servicos
  for insert with check (petshop_id = current_petshop_id() and tem_permissao('servicos'));
create policy servicos_alteracao on public.servicos
  for update using (petshop_id = current_petshop_id() and tem_permissao('servicos'))
  with check (petshop_id = current_petshop_id() and tem_permissao('servicos'));
create policy servicos_exclusao on public.servicos
  for delete using (petshop_id = current_petshop_id() and tem_permissao('servicos'));

drop policy if exists planos_tenant_isolation on public.planos;
create policy planos_leitura on public.planos
  for select using (petshop_id = current_petshop_id());
create policy planos_escrita on public.planos
  for insert with check (petshop_id = current_petshop_id() and tem_permissao('planos'));
create policy planos_alteracao on public.planos
  for update using (petshop_id = current_petshop_id() and tem_permissao('planos'))
  with check (petshop_id = current_petshop_id() and tem_permissao('planos'));
create policy planos_exclusao on public.planos
  for delete using (petshop_id = current_petshop_id() and tem_permissao('planos'));

-- Configurações: dados do petshop e log do WhatsApp.
drop policy if exists petshops_tenant_update on public.petshops;
create policy petshops_configuracoes_update on public.petshops
  for update using (id = current_petshop_id() and tem_permissao('configuracoes'))
  with check (id = current_petshop_id() and tem_permissao('configuracoes'));

drop policy if exists mensagens_whatsapp_tenant_isolation on public.mensagens_whatsapp;
create policy mensagens_whatsapp_configuracoes on public.mensagens_whatsapp
  for all
  using (petshop_id = current_petshop_id() and tem_permissao('configuracoes'))
  with check (petshop_id = current_petshop_id() and tem_permissao('configuracoes'));
