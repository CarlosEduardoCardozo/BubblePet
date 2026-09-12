-- A renovação é idempotente (só insere se não houver 'renovacao' na
-- competência), então rodar todo dia é seguro e cobre o caso de o dia 1 falhar
-- ou o cron não ter rodado — foi o que aconteceu em setembro/2026 (nenhuma
-- execução em cron.job_run_details). cron.schedule com o mesmo nome atualiza
-- o job existente.
select cron.schedule(
  'renovar-creditos-mensal',
  '0 6 * * *',
  $$select public.renovar_creditos_mes()$$
);
