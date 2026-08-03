-- Engine V2 — fechamento do fluxo entrevista -> aprovação -> fundação.
--
-- Migração ADITIVA. A aprovação fica fora de `briefing` para que o snapshot
-- aprovado não altere o próprio hash e para que mudança posterior do briefing
-- invalide a aprovação de forma verificável.

alter table public.projects
  add column if not exists briefing_aprovado jsonb;

comment on column public.projects.briefing_aprovado is
  'Snapshot hash-bound do briefing explicitamente aprovado pelo autor antes da fundação V2.';

-- Estrutura mínima no banco. A validação completa (hash, lacunas e conflitos)
-- continua no worker, que é o portão autoritativo da fundação.
alter table public.projects
  drop constraint if exists projects_briefing_aprovado_schema;

alter table public.projects
  add constraint projects_briefing_aprovado_schema
  check (
    briefing_aprovado is null
    or (
      briefing_aprovado->>'schema' = 'briefing-aprovado/v1'
      and coalesce(length(briefing_aprovado->>'hash'), 0) = 64
      and coalesce(length(btrim(briefing_aprovado->>'aprovado_por')), 0) > 0
      and briefing_aprovado ? 'aprovado_em'
      and jsonb_typeof(briefing_aprovado->'briefing') = 'object'
    )
  );
