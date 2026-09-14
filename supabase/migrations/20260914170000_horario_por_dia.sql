-- Horário por dia da semana ("sábado até meio-dia", intervalo de almoço).
-- Chave = dia ISO (1=segunda ... 7=domingo); dia ausente = fechado.
-- { "1": {"abertura":"08:00","fechamento":"18:00","pausaInicio":"12:00","pausaFim":"13:00"},
--   "6": {"abertura":"08:00","fechamento":"12:00"} }
-- horario_abertura/horario_fechamento/dias_funcionamento continuam como
-- resumo (menor abertura, maior fechamento, dias abertos), gravados junto.
alter table public.petshops
  add column horario_semana jsonb
    check (horario_semana is null or jsonb_typeof(horario_semana) = 'object');

update public.petshops p
set horario_semana = (
  select coalesce(jsonb_object_agg(
    d::text,
    jsonb_build_object(
      'abertura', to_char(p.horario_abertura, 'HH24:MI'),
      'fechamento', to_char(p.horario_fechamento, 'HH24:MI')
    )
  ), '{}'::jsonb)
  from unnest(p.dias_funcionamento) as d
)
where horario_semana is null;
