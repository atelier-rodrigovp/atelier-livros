-- ============================================================================
-- PROPOSTA DE DDL — Contrato de progresso (Fase 1). NÃO APLICADO PELO AGENTE.
-- Protocolo (mesmo da migration da engine): blocos idempotentes + SELECT de
-- verificação com saída esperada. Você cola no SQL Editor do Supabase.
-- Nenhuma linha destrói dados; tudo é `add column if not exists`.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Motivação (00-diagnostico.md §6): hoje `chapters` não representa o estado por
-- capítulo. A mera existência da linha = "sincronizado", sem hash nem qualidade.
-- Não há como distinguir "sincronizado mas não aprovado" de "aprovado", e não há
-- vínculo com o hash avaliado (o invariante de identidade de 1.1 fica sem lastro
-- no banco). Estas colunas dão esse lastro, SEM duplicar conceito:
--   chapters.text_sha256  ==  engine_chapter_provenance.capitulo_hash
-- (mesmo significado/nome; um é a linha de ESTADO, o outro a de PROVENIÊNCIA da
--  engine — juntam-se pelo hash). Metadados de engine/provedor/modelo continuam
--  em engine_chapter_provenance (modelo hosted), não em chapters.
-- ----------------------------------------------------------------------------

-- OPÇÃO A (RECOMENDADA, MÍNIMA) — só colunas de estado em chapters -------------
alter table public.chapters
  add column if not exists text_sha256    text,          -- sha256 do .md sincronizado (= capitulo_hash)
  add column if not exists quality_status text,          -- 'approved' | 'blocked_quality' | 'exception' | null
  add column if not exists quality_stage  text,          -- REVISAO_CAPITULO | DESMANEIRISMO | ... (contexto)
  add column if not exists approved_at     timestamptz;  -- quando a aprovação hash-bound foi registrada

comment on column public.chapters.text_sha256 is
  'sha256 do capitulo-NN.md efetivamente sincronizado. Igual a engine_chapter_provenance.capitulo_hash — junção por hash, um contrato duas engines.';

-- Verificação A (esperado: 4 linhas, uma por coluna nova) ---------------------
select column_name, data_type
from information_schema.columns
where table_schema = 'public' and table_name = 'chapters'
  and column_name in ('text_sha256','quality_status','quality_stage','approved_at')
order by column_name;
-- SAÍDA ESPERADA:
--   approved_at     | timestamp with time zone
--   quality_stage   | text
--   quality_status  | text
--   text_sha256     | text

-- NOTA sobre linhas existentes (1–36 do 53abdade e demais projetos): ficam com
-- text_sha256 = NULL. O resolvedor (1.1) trata "linha existe + text_sha256 null"
-- como "sincronizado, hash desconhecido" (legado) — NÃO regride nem apaga nada.
-- A reconciliação da Fase 4 preenche o hash do cap-37 ao sincronizá-lo.

-- ----------------------------------------------------------------------------
-- OPÇÃO B (FULLER, OPCIONAL) — proveniência comum às duas engines.
-- Só se você quiser, JÁ, o ledger de proveniência engine-agnóstico. Requer
-- coordenar com a migration hosted (0001-engine-hosted.PROPOSTA.sql §8), pois
-- lá engine_chapter_provenance tem colunas NOT NULL específicas do hosted
-- (qualification_id, engine_config_versao, skill_snapshot_hash, versao_modelo).
-- Para a engine Claude Code gravar a mesma tabela, essas colunas precisariam ser
-- NULLABLE (ou default) — decisão que toca a iniciativa hosted. Por isso NÃO
-- incluo o CREATE aqui: se você aprovar a Opção B, eu trago um bloco alinhado
-- com o autor da migration hosted, para não bifurcar o schema.
-- Recomendação: aplicar a Opção A agora; deixar a B para quando a migration
-- hosted for aplicada, reaproveitando a tabela dela.
-- ----------------------------------------------------------------------------

-- ----------------------------------------------------------------------------
-- COMPLEMENTO (Fase 2, virá como SQL separado quando a implementação fechar):
-- a RPC idempotente de sync (supabase/reliability.sql:79 `on conflict
-- (edition_id, numero) do update`) passará a gravar também text_sha256 /
-- quality_status / approved_at. Não incluído aqui porque depende do shape final
-- do payload de sync do worker (unidade 1.2 da Fase 2).
-- ============================================================================
