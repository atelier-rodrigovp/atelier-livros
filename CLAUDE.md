# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Quick Start Commands

```bash
# Frontend (React + Vite)
npm install && npm run dev          # start dev server (http://localhost:5173)
npm run build                        # production build
npm test                             # vitest

# Worker (Node/TS agent)
cd worker
npm install && npm run start         # start polling loop
npm run typecheck                    # tsc --noEmit (strict checks)
npm run dev                          # watch mode

# Single test file
cd worker && npx vitest run src/jobs.test.ts
```

## System Architecture

**Three-tier design:**

1. **Web** (React + Vite + TypeScript) — GitHub Pages. Reads/writes only via Supabase (never calls Claude directly).
2. **Supabase** (Postgres + Auth + Storage + Realtime + RLS) — Single source of truth for projects, jobs queue, chapters, editions, user data.
3. **Agent-Worker** (Node/TS, local) — Runs only where Claude Code (MAX plan) is logged in. Polls `jobs` table → executes skills (`skill-dan-brown`, `hoover-mcfadden`, `skill-jk-rowling`, `vesper-escritor-de-capitulos`, `skill-romantasy`) → syncs outputs to Storage + database.

```
WEB (GitHub Pages) ──HTTPS──► SUPABASE (Postgres/Auth/Storage/Realtime)
   painel/catálogo           tabelas + fila `jobs`              ▲  │
                                                    pega job   │  ▼  status/artefatos
                                        AGENT-WORKER (PC, Claude MAX logado)
                                        poll → executa skills → sobe ao Storage
```

**Key invariant:** "Truth on disk." The worker verifies actual files (`capitulo-NN.md`, `ESTADO_LIVRO.json`, `MANUSCRITO-MESTRE.md`) before writing to the database. If a skill produces files out of sync with what the DB expects, the job fails with a clear error.

## Jobs Queue (Web → Worker)

| tipo | payload | worker executes |
|---|---|---|
| `criar_fundacao` | `{project_id}` | `arquiteto-de-enredo` (non-interactive) → foundation files + SQL `editions` record |
| `escrever_livro` | `{project_id}` | `livro_runner.py` (orchestrates writer/reviewer/editor loop per chapter) → chapters + MANUSCRITO-MESTRE.md + EPUB → Storage |
| `gerar_epub` | `{edition_id}` | `edicao-kindle/build_epub.py` (deterministic) → `artifacts(epub)` |
| `traduzir` | `{project_id, idiomas:[...]}` | `traducao-editorial` per language → new editions + translated chapters |
| `gerar_capa` | `{edition_id}` | `canvas-design` → PNG/PDF KDP → `artifacts(capa)` |
| `avaliar` | `{project_id}` | `book-bestseller-review` → commercial diagnostic report in job logs |
| (others) | — | `gerar_pacote`, `importar_vendas`, `ping` |

## Normalization Pipeline (Worker Fixtures)

Before executing `escrever_livro`, the worker applies deterministic normalizers. Idempotence is a required contract and must be demonstrated per normalizer; comments alone are not proof.

### Entry Points

In `worker/src/jobs.ts`:
- **Line 481–507** (fase `PREPARAR`, called by `criar_fundacao` and at start of `escrever_livro`):
  1. `normalizarModelosAgentes()` (line 481) — ensures writer=opus, reviewer=sonnet, editor=haiku
  2. `normalizarVozRegra4()` (line 485) — injects rhythm quota (Rule 4 ceilings: fragment ≤1–2, italics ≤2–3, rhetoric ≤1–2, no "coisa" >1/ch) + guard comments over model paragraphs
  3. `normalizarCraftSkill()` (line 494) — injects skill-specific craft block (motor + rules as positive targets) into `perfil-de-voz.md`
  4. `normalizarCraftNosAgentes()` (line 501) — **CRITICAL:** injects `<!-- CRAFT-LEITURA v1 -->` into writer agent (read craft DIRECTLY, not digest); injects `<!-- PROPULSAO v1 -->` into reviewer agent. The PROPULSAO verdict is now **dual-axis** (`ADENDO_TRANSPARENCIA`): "is it alive? **AND is it transparent?**" — opacity (gnomic aphorism, abstraction personification, frase-sanfona, evaluative adjective on objects, sub-50% declarative) reproves with the same weight as a dead chapter (see AUDITORIA-ESTILO-DANBROWN.md).
  5. `normalizarExigenciasSkill()` (line 507) — injects structural specs per skill (dan-brown fios + dossier, hoover clocks + narrator, romantasy POV rotation + cost scalar)
  6. `desornamentarModelosPerfil()` (`modelos-perfil.ts`) — flags §2 model paragraphs that carry ornament tics (gnomic/personification/sanfona/metaphor/eco-negation) with `<!-- MODELO-FLAG -->`; **never rewrites prose** (uncertain provenance = author's call).

### What Each Normalizer Does

**`craft-agentes.ts`**
- `normalizarCraftNosAgentes()`: Modifies `.claude/agents/livro-escritor.md` and `livro-revisor.md`
  - Writer: adds `<!-- CRAFT-LEITURA v1 -->` block that says "read craft from skill references directly (voz-e-oficio.md, metamodelo-*.md), not just digest; digest = facts only"
  - Reviewer: adds `<!-- PROPULSAO v1 -->` block with a **dual-axis** verdict: (1) "is it alive?" — reproves competent-but-dead chapters; (2) `ADENDO_TRANSPARENCIA` "is it transparent?" — reproves opacity (gnomic aphorism ≤2/ch, abstraction personification ≤2/ch, frase-sanfona ≤1/ch, evaluative adjective on physical objects, majority-declarative floor). Opacity and deadness weigh equally; "alive" is proven by event + cut, not by rhetorical load.

**`craft-skill.ts`**
- `normalizarCraftSkill()`: Modifies `perfil-de-voz.md`
  - Injects `<!-- CRAFT-SKILL v1 -->` section: motor (e.g. "build suspicion → revelation") + rules as positive targets (not just "avoid"), keyed by `CRAFT_POR_SKILL` (dan-brown, jk-rowling, hoover-mcfadden, romantasy, vesper; unknown skill = no-op)

**`voz-regra4.ts`**
- `normalizarVozRegra4()`: Modifies `perfil-de-voz.md`
  - Injects `<!-- COTA-CADENCIA v1 -->` with Rhythm Rule 4 quotas: fragment ≤1–2 (never adjacent), italics ≤2–3, rhetoric ≤1–2, no "coisa" >1/ch
  - Injects `<!-- GUARDA-MODELOS v1 -->` over model paragraphs (§2 of profile): "models = technique, don't copy, don't replicate muleta"
  - Scans model paragraphs for muletas and signals (never rewrites author's models)

**`modelos-agentes.ts`**
- `normalizarModelosAgentes()`: Modifies `.claude/agents/*.md`
  - Pins writer model to opus, reviewer to sonnet, editor to haiku (deterministic; independent of architect's prose)

**`exigencias-skill.ts`**
- `normalizarExigenciasSkill()`: Modifies `.claude/agents/livro-editor.md` + runtime gate checks
  - Adds skill-specific structural specs (dan-brown: narrative fios + factual dossier; hoover: clock times + narrator voice; romantasy: POV rotation + magic cost)
  - Signals missing foundation docs (`docsFundacao` key), missing spec sections (e.g. `<!-- TABELA-PISTAS -->`), rotation violations
  - Never generates — architect writes, normalizer verifies + signals

### Post-Foundation Sweeps

```bash
# All re-idempotent — safe to re-run on live projects
npx tsx worker/scripts/normalizar-modelos-agentes.ts
npx tsx worker/scripts/normalizar-voz-regra4.ts [<project_id>]
npx tsx worker/scripts/aplicar-craft-skill.ts [<project_id>]
npx tsx worker/scripts/consertar-craft-agentes.ts [<project_id>]
# (exigencias-skill is checked at runtime; no standalone sweep)
npx tsx worker/scripts/desornamentar-perfis.ts [<project_id>]   # flags ornamented §2 model paragraphs
```

## Transparency Detectors (AUDITORIA-ESTILO-DANBROWN.md)

`maneirismo.ts` (mirrored in `livro_runner.py::_sinais_transparencia`) adds the axis the
old gates missed — "cheap tics vs. propulsion" never measured **transparency vs. ornament**.
Detectors: `contarGnomico` (aphorism/máxima), `contarPersonificacao` (abstraction/body-agent),
`contarSanfona` (reformulation chains), `contarAdjetivoAvaliativo` (moral adjective on objects),
`percentDeclarativasSimples` (floor), `sinalDialogoInterioridade`, `contarMetaforaElaborada`;
`diagnosticarTransparencia(texto, skill)` aggregates them.

- **Mode = SIGNAL for every skill.** They feed the reviewer prompt (`SINAIS DE TRANSPARENCIA`
  block) and the `ADENDO_TRANSPARENCIA` verdict; they do **not** deterministically block.
- **Promotion to a hard gate is per-skill** via `ORC_TRANSPARENCIA_POR_SKILL` (empty = all
  signal). Only a skill validated in the A/B benchmark with zero false-positives on control
  chapters gets `bloqueia:true` cotas. **Dan-brown cotas stay dan-brown-only** — other skills
  never get the hard block from this change.
- **Retention (`_reter_pre_edicao`)**: before any agent rewrite (revcap/gate/desman/correcao),
  the runner copies `capitulo-NN.md` to `capitulos-em-revisao/capitulo-NN.pre-<stage>-<seq>.md`
  (last 3 per chapter+stage). Closes the audit's H3 gap (pre-correction versions were destroyed).

## Quality Gates per Chapter

Inside `livro_runner.py` (executed by the worker), after each chapter is written:

1. **Per-chapter mannerism gate** (`gate_maneirismo_capitulo`) — calls `worker/src/maneirismo.ts` logic mirrored in Python:
   - Detects muletas ("coisa" target ≤1/ch, symbols, echo, anaphora, staccato density, rhetoric quota)
   - Detects cross-chapter signature repetition (aforistic phrases recycled verbatim across chapters)
   - **Signals** interioridade-sem-evento (high copula/perception + near-zero dialogue = "well written and boring") — feeds reviewer, doesn't block

2. **Per-chapter spec gate** (`gate_spec_capitulo`) — validates skill structural requirements:
   - Dan-brown: narrative fio assigned, day/hour advanced, factual dossier updated, Rhythm Rule 4 within quota
   - Hoover: ≥1 clock moved this chapter, day/hour sequence valid (MOD 7 for day-of-week), narrator voice consistent
   - Romantasy: POV rotation respected (no same fio >N chapters in window), magic cost scalar applies
   - **Bounded retry:** if spec fails, 1 directed re-write (marked `_spec-NN.try`); on 2nd fail, accepts with high warning (no loop)

3. **Book-wide mannerism purge phase** (`DESMANEIRISMO`, runs before EPUB) — iterates counting → rewriting → recounting until muleta budget is met

## Automatic Quality Recovery (no click required)

When the runner blocks on quality (rc=3), the worker no longer parks the job as `paused`. `index.ts` delegates to `tratarBloqueioQualidade` (`worker/src/correcao-fluxo.ts` + pure decisions in `correcao-automatica.ts`):

- **Classification (persisted in `progresso.quality_categoria`):** `recuperavel_qualidade` (auto-retry) vs `fundacao_pendente` / `decisao_autoral` / `circuit_breaker` (paused, human decision). Quota (`retry_at` + `aguardando_reset`) and infra retries keep their own flows.
- **Correction ladder (executes, never just recommends):** degrau 1 deterministic (worker) → 2 directed revision → 3 focused edit → 4 focused rewrite → 5 broad revision → 6 alternative model (`revisor_craft_opus`) → 7 circuit breaker. Ladder start chosen by blocker type (`escada-correcao.ts:classificarBlocker`); never repeats the same strategy on the same text hash; 2 failures at a degrau escalate; budget = 5 attempts per chapter/stage.
- **Mechanics:** the worker writes `review/_correcao-cap-NN.json` (degrau directive + exact blockers — the runner injects it into the micro-loop prompt) and removes the bounded-retry marker (`_revcap-NN.try` / `_spec-NN.try`) to grant exactly one new gated attempt; the runner's acceptance guard **recounts the same gates unchanged** (removing the marker never approves anything). The job is requeued with `progresso.retry_at` (backoff 90s×2^n, cap 30min) — the heavy picker already skips future `retry_at` and re-claims on its own.
- **Persistent ledger:** `quality/correcao-ledger.json` in the project WORK_DIR (truth on disk; survives restarts) mirrored as `progresso.correcao` for the UI. Attempts close as `aprovado` on the success path of `escrever_livro` (`concluirCorrecoesAprovadas`).
- **Foundation (SG7):** a failed foundation gate on a book in progress persists `fundacao_status/fundacao_blockers` in progresso — writing continues, publication stays blocked; UI shows a separate banner (`aviso_fundacao`), never mixed with the chapter blocker.
- **UI:** resolver states `correcao_automatica`, `aguardando_correcao` (button becomes optional "Tentar agora"), `circuit_breaker`, `aguardando_decisao`, `producao_desativada` (global `worker_control` pause, distinct from per-project pause).

## Observability

Painel **Observabilidade** (`src/pages/Observabilidade.tsx`) consumes telemetry row (`tipo='telemetria'` in `jobs` table, populated by `worker/src/telemetria.ts`). Signals:
- **Cost proxy** (tokens/chapter weighted by model opus/sonnet/haiku)
- **Output per role** (orchestrator, writer, reviewer, editor) — highlights bottleneck
- **Restarts** (runner crash + recovery)
- **Throughput** (chapters/hour vs. bottleneck: serialization vs. parallelism)
- **Throttle signals** (Max plan hard limit vs. false limit from misdetected progress)

**Known diagnosis (2026-07-01–06):**
- Orchestrator's inline output ≈71–100% of total → rewire to delegate more to subagents
- False "Max limit" throttle: runner counts progress including review; worker was counting only new chapters → fixed
- 32k output token ceiling caused micro-loop crashes → bumped to 64000 in `index.ts`

## Leak Prevention (Meta-Text Lockdown)

Multilayer defense — none of the LLM's pipeline chatter leaks into the published book.

1. **Preflight** (`jobs.ts`): skill missing → job `error` (no degradation)
2. **Per-chapter sanitize** (`sanitize.ts`): removes HTML comments, fence blocks, pipeline chatter; **backup `.orig.bak`** of originals
3. **Per-chapter gate** (`gate_manuscrito.py`): rejects if forbidden marker remains
4. **Compilation gate** (`gate_manuscrito.py` before EPUB): manuscript/EPUB must be meta-text-free

Audit acervo: `npx tsx worker/scripts/auditar-vazamentos.ts`

## Writing Skills (Must Be Installed)

Worker resolves `skill_escrita` from `~/.claude/skills/<skill_name>/` (derived from `RUNNER_PATH`). **Missing skill = job `error` (no fallback).**

**Always required (base):**
- `livro-do-zero-ao-epub` (runner + phases + gates)
- `edicao-kindle` (EPUB deterministic composition)

**Author skills** (optional, per project):
- `skill-dan-brown` (thriller, conspiracy, Rule 4 rhythm)
- `hoover-mcfadden` (contemporary drama/romance, clocks + narrator)
- `skill-jk-rowling` (immersive fantasy, cast + world)
- `vesper-escritor-de-capitulos` (literary trilogy voice)
- `skill-romantasy` (romantasy, POV rotation + magic cost)

To install: copy `SKILL.md` + `assets/references` folder to `~/.claude/skills/<skill>/`. After installing skills, apply patches:

```bash
pwsh worker/skill-patches/instalar-skills.ps1
# (backs up `~/.claude/skills/`, applies TS-driven edits)
```

## Skill Patches

Edits live in `worker/skill-patches/` (outside `~/.claude/skills`, which doesn't version). Applied by `instalar-skills.ps1` (idempotent). Examples:
- `arquiteto-de-enredo` — ambition gate ≥8, signature voice
- `livro-do-zero-ao-epub` — gates, muleta budget, micro-loop toggle

## Imported Books (Hydration from Storage)

Importers (`worker/scripts/importar-*.mjs`) write only to database + Storage, not to `WORK_DIR`. The worker reads disk as source of truth, so "hydrate" function auto-downloads chapters + foundation on first `avaliar` / `escrever_livro` / `traduzir` / `gerar_epub`:

```bash
npx tsx worker/scripts/hidratar-importados.ts [<project_id>]
```

(Runs automatically; safe to call manually.)

## Environment Variables (Worker)

**`worker/.env`** (git-ignored, secrets only here):
- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE` — database access
- `OWNER_USER_ID` — single-user mode (who is "me"?)
- `RUNNER_PATH` — path to `~/.claude/skills/livro-do-zero-ao-epub/assets/livro_runner.py`
- `WORK_DIR` — staging area for chapters/manuscripts (local, usually `~/Livros/manuscritos/`)
- `CLAUDE_BIN`, `PY_BIN` — full paths on Windows (shims don't resolve without shell)
- `MODEL_ORQUESTRADOR` — which model orchestrates long chains (default `sonnet`; only routes to subagents, doesn't write prose)
- `REVISAO_POR_CAPITULO` — toggle micro-loop (default `1`; set `0` to skip per-chapter review/edit for cost)
- `REVISOR_CRAFT_OPUS` — elevate reviewer verdict to opus (default off)
- `ORC_CADENCIA_POR_SKILL` — rhythm quota per skill (e.g. dan-brown: `fragEnfase:2, fragColados:0, ...`)

Optional:
- `POLL_INTERVAL_MS` — how often worker checks for new jobs (default 5000)
- `HEARTBEAT_STALE_MIN` — worker timeout (default 15)
- `CLAUDE_CODE_MAX_OUTPUT_TOKENS` — output ceiling per message (default 64000; raise if you see "response exceeded 32000")
- `PYTHONUTF8=1` — Windows UTF-8 for Python spawned subprocesses (always set)
- **Unset `ANTHROPIC_API_KEY`** to use MAX plan OAuth instead of API credits

## Frontend Pages

- **Dashboard** — projects list + Realtime job status
- **NovoProjeto** — briefing wizard (genre, ambition, style, custom skills)
- **Projeto** — 8 tabs: Fundação / Escrita / Edições / Capas / EPUBs / Vendas / Observabilidade / Configurações
- **Observabilidade** — token cost, throughput, restarts, bottleneck
- **Configuracoes** — worker health, ping, max parallelism slider
- **Catalogo** — filterable grid of book covers
- **Vendas** — KDP CSV import + dashboards
- **Leitor** — book reader (markdown → styled HTML)
- **Autores** — author library (archived projects, quick-start templates)

## Testing

Frontend:
```bash
npm test                                    # vitest all
npm test src/lib/parseKdpCsv.test.ts        # single file
```

Worker:
```bash
cd worker
npx vitest run                              # all
npx vitest run src/maneirismo.test.ts       # single module
npx vitest run src/craft-agentes.test.ts    # tests for CRAFT-LEITURA / PROPULSAO blocks
```

**Coverage contract:** TypeScript strict, full Vitest collection, Python behavioral regressions and shared TS/Python fixtures. Do not document a fixed test count; report the current command output.

## Production Control

- **Web deploy:** GitHub Actions publishes `dist` to `gh-pages` on relevant pushes to `master`.
- **Worker:** runs 24/7 on user's PC (Windows Task Scheduler or PM2) with backoff+retry on network errors
- **Database pauses:** toggle `worker_control.enabled` (Realtime → all jobs waits; no claim)
- **Max parallelism:** set in UI (Configurações tab) or SQL `jobs` row `tipo='config_producao'`, `payload.max_paralelo`

## Debugging Workflow

1. **Check worker alive:** Configurações → ping test
2. **Read job logs:** click job in Dashboard, scroll to tail
3. **Inspect chapters on disk:** `$WORK_DIR/capitulo-NN.md` (each chapter)
4. **Inspect state:** `$WORK_DIR/ESTADO_LIVRO.json` (current phase + progress marker)
5. **Read project DB:** query `projects.briefing` (config), `chapters` (per-chapter meta), `editions` (versions)
6. **Telemetry sweep:** `npx tsx worker/scripts/backfill-telemetria.ts [<project_id>]` to re-aggregate cost
7. **Audit cross-chapter continuity:** `npx tsx worker/scripts/auditar-cross-continuidade.ts` (repetition, POV monotony, day/hour arithmetic)

## Key Files to Know

**Architecture / orchestration:**
- `worker/src/jobs.ts` — job dispatch, phase sequencing, normalizers called
- `worker/src/lib.ts` — file I/O, skill resolution, chapter inventory on disk
- `worker/src/index.ts` — polling loop, lock, heartbeat, reentrancy

**Quality gates:**
- `worker/src/maneirismo.ts` — muleta detection, repetition cross-chapter, interioridade-sem-evento
- `worker/src/exigencias-skill.ts` — structural specs per skill, fio rotation, day/hour validation
- `worker/skill-patches/livro-do-zero-ao-epub/assets/livro_runner.py` — per-chapter gate execution
- `tools/gate_manuscrito.py` — final manuscript/EPUB leak check

**Fixtures/normalizers:**
- `worker/src/craft-agentes.ts` — CRAFT-LEITURA (writer) + PROPULSAO (reviewer)
- `worker/src/craft-skill.ts` — CRAFT-SKILL blocks per skill
- `worker/src/voz-regra4.ts` — COTA-CADENCIA (rhythm quota) + model guard
- `worker/src/exigencias-skill.ts` — skill-specific spec injection
- `worker/src/modelos-agentes.ts` — deterministic model pinning (opus/sonnet/haiku)

**Observability:**
- `src/pages/Observabilidade.tsx` — dashboard reading `telemetria` row
- `worker/src/telemetria.ts` — aggregates tokens + throughput + restarts

**Import / hydration:**
- `worker/src/hidratar.ts` — downloads chapters + foundation from Storage on demand

**Leak prevention:**
- `worker/src/sanitize.ts` — per-chapter chatter removal
- `worker/scripts/auditar-vazamentos.ts` — acervo leak audit

## Production Deployment Checklist

- [ ] Supabase project live, schema + storage + auth configured
- [ ] GitHub Pages enabled for `gh-pages`; repository secrets set (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`)
- [ ] Worker PC: Node 20+, Python 3.12+, Pillow, Claude Code MAX logado
- [ ] Skills installed in `~/.claude/skills/`: arquiteto-de-enredo, livro-do-zero-ao-epub, edicao-kindle, tradução-editorial, book-bestseller-review, canvas-design + author skills (dan-brown, hoover, jk-rowling, vesper, romantasy)
- [ ] Patches applied: `pwsh worker/skill-patches/instalar-skills.ps1`
- [ ] Worker .env configured (SUPABASE_URL, SERVICE_ROLE, RUNNER_PATH, WORK_DIR, CLAUDE_BIN, PY_BIN)
- [ ] Worker running 24/7 (Task Scheduler or PM2)
- [ ] Test smoke flow: create project → start writing → check Dashboard + Observabilidade

## Known Blockers & Workarounds

- **OpenAI gpt-image-1 billing hard limit:** capas fall back to Cloudflare flux-schnell (free). Raise OpenAI cap to use gpt-image-1.
- **ANTHROPIC_API_KEY set in worker:** writing fails by credit, not preflight. Unset it to use MAX plan OAuth.
- **Windows UTF-8 subprocess fail:** set `PYTHONUTF8=1` (already in index.ts, but verify if runner spins alone).
- **Python UnicodeEncodeError on emoji:** was stdout=cp1252 on Windows. Fixed by PYTHONUTF8=1 + runner logs to file before print.
