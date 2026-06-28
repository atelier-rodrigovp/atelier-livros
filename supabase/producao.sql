-- Controles de produção — OPCIONAL.
--
-- O código JÁ funciona SCHEMA-FREE (sem rodar este SQL): prioridade e pausa por
-- projeto vivem em `projects.briefing` (jsonb) e a concorrência numa linha de
-- config em `jobs` (tipo='config_producao'). Nada quebra sem esta migração.
--
-- Este arquivo existe para quem QUISER promover esses controles a colunas reais
-- no futuro (cole no SQL editor do Supabase). Se aplicar, dá para migrar o código
-- do jsonb para as colunas — mas não é necessário.

-- Prioridade da fila pesada (maior = mais cedo) e pausa de produção por projeto.
alter table public.projects
  add column if not exists prioridade integer not null default 0,
  add column if not exists producao_pausada boolean not null default false;

-- Concorrência: nº de projetos pesados simultâneos.
alter table public.worker_control
  add column if not exists max_paralelo integer not null default 1;

-- Migração dos valores já gravados em jsonb (idempotente):
-- update public.projects
--   set prioridade = coalesce((briefing->>'prioridade')::int, 0),
--       producao_pausada = coalesce((briefing->>'producao_pausada')::boolean, false);
