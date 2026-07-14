# GOAL-LEDGER — Contrato de progresso, sincronização e estado único

> **Goal persistente.** Corrigir integralmente o contrato de progresso, aprovação,
> sincronização e apresentação do Atelier de Livros, garantindo que cada capítulo
> aprovado seja persistido de forma durável imediatamente, que bloqueios posteriores
> não ocultem trabalho concluído, e que Worker, Supabase, Storage e interface web
> apresentem um estado único, verdadeiro, retomável e independente do provedor de IA.
>
> **Não conclui** por código implementado nem por testes unitários verdes. Só conclui
> quando TODOS os critérios da Definition of Done tiverem evidência verificável —
> incluindo o caso real 36/37/38 reconciliado no banco, no Storage e na interface
> publicada. Enquanto existir divergência entre worker, banco, Storage, disco e
> interface, o goal permanece **ABERTO**.

Projeto-caso: **O Índice dos Abduzidos** (`53abdade-554d-47e2-bd14-955de3ffc41e`),
meta 60 caps, `skill-dan-brown`, piso 1.800 palavras.

Regras da casa (permanentes): evidência inline (saída real, arquivo:linha, hash,
log); PROVADO vs PRESUMIDO explícito; teste via harness com produção pausada; passo
que falha 2× → parar e reportar; mesmo erro determinístico 3× → circuit breaker;
religação da fila é decisão exclusiva do autor; nunca iniciar jobs de produção real.

## Estado das fases

| Fase | Descrição | Estado |
|---|---|---|
| 0 | Auditoria somente leitura → `00-diagnostico.md` | **CONCLUÍDA** · PORTÃO 0 **APROVADO** |
| 1 | Contrato (specs 1.1–1.8) | **CONCLUÍDA** · PORTÃO 1 **APROVADO** |
| 2 | Implementação incremental (loop agêntico) | **CONCLUÍDA** (backend + frontend) |
| 3 | Testes obrigatórios (regressão 36/37/38 + demais) | **em andamento** (unit/integração verdes; falta paridade end-to-end visual) |
| 4 | Reconciliação do caso real + validação visual | **CONCLUÍDA** — reconciliação+deploy+validação visual autenticada PROVADOS |

## Subgoals

| # | Subgoal | Estado | Evidência-âncora (Fase 0) |
|---|---|---|---|
| S1 | Auditar o estado atual sem alterar nada | **feito** | `00-diagnostico.md` |
| S2 | Fonte de verdade de cada estado do capítulo | pendente | `chapters` sem coluna de qualidade/hash; `capitulos_aprovados` conta válidos≠aprovados |
| S3 | Sincronização incremental de capítulos aprovados | pendente | `jobs.ts:959` throw antes de `jobs.ts:975` sync |
| S4 | Preservar progresso ao pausar/bloquear/trocar engine | pendente | `index.ts:268-279` substitui `progresso` |
| S5 | Separar qualidade × infra × cota × pausa × decisão autoral | pendente | `operationalStatus.ts` vs `status.ts` vs inline |
| S6 | Impedir contaminação por jobs históricos | pendente | jobs `qualidade_editorial`/`telemetria` paused, progresso `{}` |
| S7 | Resolvedor operacional único para todas as telas | pendente | 4 interpretações divergentes |
| S8 | Dashboard e página de escrita verdadeiros e acionáveis | pendente | erro cru em `Projeto.tsx:55`; "pausado — decisão pendente" `Projeto.tsx:736` |
| S9 | Correções determinísticas econômicas e convergentes | pendente | 2 "coisa" consumiram ciclo completo escritor→revisor→editor |
| S10 | Retomada entre worker local e engines hospedadas | pendente | contrato deve alinhar a `engine_calls`/`execution_snapshot` |
| S11 | Testes de regressão do caso 36/37/38 | pendente | inexistente hoje |
| S12 | Validar banco, Storage, disco, interface e pós-reinício | pendente | — |

## Ciclos (loop agêntico)

### Ciclo 0 — 2026-07-13 — Auditoria somente leitura (Fase 0)
- **Observar:** projeto 53abdade pausado por qualidade no cap-38; divergência
  banco(36) × Storage(36) × disco(38).
- **Evidência coletada** (toda PROVADA, ver `00-diagnostico.md`): dois bugs de
  código localizados por arquivo:linha e confirmados no dado real; 4 divergências
  de UI; cadeia causal de 10 passos reproduzida.
- **Guards mapeados:** jobs.ts/index.ts/lib.ts estão na lista de isolamento —
  alterá-los quebra `engine-isolation.test.ts` por design. Caminho sancionado:
  `npx tsx worker/scripts/gerar-protected-baseline.ts "goal contrato-progresso
  <data>: <arquivos e razão>"` + registro aqui, a cada mudança. `livro_runner.py`
  está em 2 guards (baseline + manifest via `gerar-manifest.ts`).
- **Segurança:** produção PAUSADA (`worker_control.enabled=false`); não religar (autor).
- **Próximo passo:** PORTÃO 0 — apresentado ao autor; aguardando OK. Nenhuma edição
  fora de `docs/` até lá.
- **Critérios provados:** S1. **Pendentes:** S2–S12.

### Ciclo 1 — 2026-07-13 — PORTÃO 0 aprovado; backup real; início da Fase 1
- **PORTÃO 0 APROVADO** pelo autor, com adendo: backup imediato + DDL como SQL
  proposto + neutralidade alinhada a `engine_chapter_provenance`/`engine_calls`.
- **Backup executado** (autorizado, cópia zero-risco): `C:/Users/Rodrigo
  Paiva/atelier-work/_backup-53abdade-20260713/` com `manuscrito/{capitulo-37,38}.md`,
  `quality/*.json`, `ESTADO_LIVRO.json`, `estado/` completo, marcadores review.
  **Hashes conferidos:** cap-37 `f26e5831…28eb` (= textHash aprovado ✅),
  cap-38 `2b082953…3745` ✅.
- **Próximo passo:** escrever specs 1.1–1.8 em `01-contrato.md` + `02-ddl-proposto.sql`;
  apresentar no PORTÃO 1. Sem código até o OK.

### Ciclo 2 — 2026-07-13 — PORTÃO 1 aprovado; Fase 2 unidade 1 (S2/1.1)
- **PORTÃO 1 APROVADO.** Decisões: DDL Opção A; escada de correção começa no worker;
  persistência worker-level. Backup reconfirmado íntegro (hashes batem com disco vivo).
- **Unidade 1 (S2/1.1) — `worker/src/chapter-state.ts` (arquivo NOVO):** resolvedor
  PURO `resolveChapterState` + `aggregateChapterStates`, sobre `quality-state.ts`
  (reusa `stateForCurrentText`/`isPublishableQuality` — invariante hash→stale).
  Nenhum arquivo protegido tocado; baseline não precisa regenerar.
- **Verificação PROVADA:** `npx vitest run src/chapter-state.test.ts` → 10/10 verde;
  `npm run typecheck` → exit 0. Cobre 37 aprovado, 38 bloqueado, stale, legado, agregados.
- **Critérios provados (parcial):** S2 (modelo/resolver de capítulo, nível unidade).
- **Próximo passo:** aplicar DDL Opção A (autor cola SQL) → Unidade 2 (sync incremental
  no jobs.ts, S3/1.2) que grava text_sha256/quality_status.

### Ciclo 3 — 2026-07-13 — DDL aplicado; Unidades 2 e 3 (fix dos 2 bugs centrais)
- **DDL Opção A aplicado pelo autor** (colunas `text_sha256/quality_status/quality_stage/
  approved_at` em `chapters`; verificação retornou as 4 colunas).
- **Unidade 2 (S3/1.2) — fix Bug A em `jobs.ts`:** novo helper `sincronizarAprovados`
  (sync idempotente, hash-bound, SÓ aprovados, Storage antes do banco); edição criada
  antes do poller; **sync incremental a cada tick (~20s)**; **passe final ANTES de todo
  throw de bloqueio**; laço antigo (subia TODOS os caps) trocado por sanitize-leak +
  sync-aprovados. Resultado: cap-37 aprovado vira durável mesmo quando 38 bloqueia.
- **Unidade 3 (S4/1.3) — fix Bug B em `index.ts`:** handlers `QualityBlockedError` e
  `InfrastructureBlockedError` fazem **merge** de `cur.progresso` (spread) em vez de
  gravar literal — preservam cap_atual/total/fase/palavras/nota/continua.
- **Guards (caminho sancionado):** baseline `jobs.ts` → **v1.0.2**; `index.ts` → **v1.0.3**
  (só o arquivo de cada unidade abençoado; verificado que nenhum outro protegido divergia).
  Dispatch inalterado (não mexi no switch). Manifest não tocado (runner intacto).
- **Verificação PROVADA:** `npm run typecheck` exit 0 (2×); `engine-isolation` 13/13;
  `dispatch-caracterizacao` 4/4; `escrever-livro.integration` 2/2; `chapter-state` 10/10;
  `limite-max`+`retry-policy` verdes. Total afetadas: 62 testes verdes.
- **Critérios provados (parcial):** S3, S4 no nível unidade/integração (1 cap + mocks).
  **PENDENTE de prova end-to-end multi-capítulo:** regressão 37/38 (Fase 3, S11).
- **Próximo passo:** regressão multi-capítulo 36/37/38 (Fase 3) para PROVAR o fix
  end-to-end; depois S5/S7 (resolvedor único UI), S6, S9 (escada), S8 (UI), S10.

### Ciclo 4 — 2026-07-13 — Regressão 36/37/38 (S11) + suíte completa verde
- **Helper puro `deveSincronizar`** extraído para `chapter-state.ts`; `jobs.ts` passa a
  usá-lo (decisão de sync única e testável). Baseline `jobs.ts` → **v1.0.4** (sancionado).
- **Regressão 36/37/38 — `worker/src/contrato-progresso.regression.test.ts` (NOVO):**
  prova, no nível da decisão do contrato, que 37 aprovado sincroniza; 38 bloqueado NÃO
  chega ao leitor; sync idempotente; retomada corrige 38 sem re-sincronizar 37; e os
  contadores "38 produzidos · 37 aprovados · 37 sincronizados · 38 em correção" batem.
- **Verificação PROVADA:** `npx vitest run src/contrato-progresso.regression.test.ts`
  → 4/4; **suíte COMPLETA do worker `npx vitest run` → 447/447 (43 arquivos) verde**;
  `npm run typecheck` exit 0. Nenhuma regressão introduzida.
- **Critérios PROVADOS:** S3, S4 (fix dos 2 bugs) + regressão de contrato S11 (nível
  decisão). **PENDENTE:** prova end-to-end via job real (Fase 4, dado real) e os demais
  subgoals de UI.
- **Limite honesto (PRESUMIDO até Fase 4):** a regressão prova a LÓGICA do contrato
  (resolver+seleção+agregado). O caminho real `escreverLivro` (poller+throw ordering)
  está coberto por typecheck + integration test (1 cap) + suíte verde, mas a prova
  end-to-end com dois capítulos reais e reinício é da Fase 4 (reconciliação).
- **Próximo passo:** S5/S7 (resolvedor único no frontend) + S8 (UI) — mudanças na web;
  depois S6, S9, S10; então Fase 4 (reconciliação real — SÓ com OK explícito do autor).

### Ciclo 5 — 2026-07-13 — Backend fechado: S6 + S9 + S10 + shape congelado
- **S6 (vigente×histórico) — `worker/src/job-vigente.ts` (NOVO):** seletor PURO
  `selecionarJobVigenteEscrita` (escrever_livro de maior created_at) + `jobsEscritaSubstituidos`
  + `ehJobVigenteEscrita`. Resolve a contaminação no READ-side (sem mutação arriscada
  no hot path de enfileiramento). 4/4 testes.
- **S9 (escada de correção) — `worker/src/escada-correcao.ts` (NOVO):** degrau 1
  determinístico SÓ para o mecanicamente seguro (meta-texto + espaçamento; nunca prosa);
  `classificarBlocker` (mecanico_seguro/lexical_prosa/narrativo); `medirEscada` reporta
  quanto cada degrau resolve. Respeita Portão 1 (muleta lexical começa no degrau 2).
  4/4 testes. **MEDIÇÃO REAL no cap-38 (PROVADO):** palavras 2427→2427; "coisa" 2→2;
  degrau 1 aplicou NADA; blocker lexical_prosa → resolvidos 0 → próximo degrau 2. Dado
  honesto: para o caso motivador, o determinístico resolve 0% — a muleta exige editor
  (degrau 2). Não há atalho determinístico; wiring no runner fica decisão informada.
- **S10 (campos de engine) — `jobs.ts`:** `engineInfo={engine:"claude-code",
  provedor:"anthropic",modelo:MODEL}` no progresso inicial e do poller; preservado na
  pausa pelo merge do index.ts. Alinhado a engine_calls (provedor/modelo). Baseline
  `jobs.ts` → **v1.0.5** (sancionado).
- **SHAPE CONGELADO para S7 — `docs/contrato-progresso/03-shape-resolvedor.md`:** fontes,
  `ProgressoEscrita`, derivação dos contadores sem-disco, `OperationalState`, hierarquia
  de 9 níveis, tradução do erro cru, botões contextuais, módulos a criar. Pré-requisito
  do frontend cumprido.
- **Verificação PROVADA:** `npm run typecheck` exit 0; suíte COMPLETA do worker
  `npx vitest run` → **455/455 (45 arquivos) verde**; isolamento 13/13.
- **Critérios PROVADOS:** S6, S9 (com medição real), S10. Backend do contrato completo.
- **Próximo passo:** PORTÃO DE REVISÃO do backend (autor) → então bloco frontend
  S5/S7/S8 consumindo o shape congelado; depois Fase 4 (reconciliação real, OK explícito).

### Ciclo 6 — 2026-07-13 — Bloco frontend S5/S7/S8 (resolvedor único nas 3 telas)
- **PORTÃO DE REVISÃO do backend APROVADO** (com lembrete: paridade das 3 telas é
  critério de TESTE; portão de revisão antes do deploy obrigatório).
- **S7 — `src/lib/resolveOperationalState.ts` (NOVO):** resolvedor único (hierarquia de
  9 níveis, contadores sem-disco, tradução do erro cru, blocker humano, botões
  contextuais, engine_info) + `buildResolverInput` (entrada única → paridade por
  construção). **`src/lib/jobVigente.ts` (NOVO):** porte do seletor vigente (S6).
- **S5/S8 — telas migradas para o resolvedor:** `Dashboard.tsx` (cartão com contadores
  reais + badge do resolvedor), `Projeto.tsx` (header + aba escrita: "pausado — decisão
  pendente" e demais rótulos divergentes REMOVIDOS; erro cru do runner movido para
  `<details>` de diagnóstico; contadores produzidos/aprovados/sincronizados; botão
  "Corrigir capítulo N" quando bloqueado), `Observabilidade.tsx` (`statusVivo` via
  resolvedor). `operationalStatus.ts` ficou sem consumidor (mantido; teste ainda passa).
- **PARIDADE (critério de teste do autor) PROVADA:** `resolveOperationalState.test.ts`
  → teste dedicado "as 3 telas, mesmos dados → OperationalState IDÊNTICO" (via
  buildResolverInput) + cenário 53abdade (38/37/37 + cap 38 em correção, mensagem
  traduzida, erro cru só no diagnóstico). 12/12.
- **Verificação PROVADA:** `npx tsc -b` exit 0; **suíte COMPLETA monorepo `npx vitest
  run` → 519/519 (52 arquivos) verde**; `npm run build` (tsc -b && vite build) exit 0.
- **Critérios PROVADOS:** S5, S7, S8 (nível código+unit+paridade). **PENDENTE:**
  validação visual na plataforma publicada (Fase 4) e reconciliação real.
- **Próximo passo:** PORTÃO — Fase 4 (reconciliação real do 53abdade + deploy + validação
  visual). Exige OK EXPLÍCITO do autor (opera sobre dado real; deploy).

### Ciclo 7 — 2026-07-14 — Fase 4: reconciliação real + deploy (aprovado opção 1)
- **Ajuste de contador (regra de segurança):** `aprovados` = linhas sincronizadas NÃO
  bloqueadas (invariante S3: worker só sincroniza aprovados). NÃO escrevemos "approved"
  em linhas legadas — respeita "não aprovar arquivo só porque existe". +2 testes (14/14).
- **RECONCILIAÇÃO REAL do 53abdade** (dogfooding do fix: `resolveChapterState` +
  `deveSincronizar`): cap-37 sincronizado ao Storage + `chapters` com
  `text_sha256=f26e5831…`, `quality_status=approved`; **38 NÃO tocado** (bloqueado);
  progresso do job vigente reconstruído por MERGE honesto (cap_atual=38, total=60,
  engine, mantendo quality_status/stage/blockers).
- **PROVA (3 camadas):** banco `chapters` total 37, max 37, cap37 com hash aprovado,
  cap38 AUSENTE · Storage 37 arquivos, tem 37 não tem 38 · disco cap37 sha256 =
  `f26e5831…` = banco = aprovado (hash bate). Scripts temporários removidos.
- **DEPLOY:** commit SELETIVO (só 20 arquivos do goal; nada das outras iniciativas) →
  push `bdd549f..35a2262` na master → GitHub Actions **success**. Bundle live
  `index-YBRqGu3C.js` **contém** as strings do resolvedor (produzidos 8, sincronizados 6,
  aprovados 6, "Ver diagnóstico técnico" 1, "Corrigir capítulo" 3) — UI do contrato NO AR.
- **Verificação:** suíte COMPLETA monorepo 521/521 verde; `npm run build` OK; tsc -b limpo.
- **PENDENTE (depende do autor):** screenshot AUTENTICADO das 2 telas do 53abdade. A
  extensão do Chrome do Claude não está conectada e não posso logar (senha proibida) —
  não faço a captura autenticada sozinho. Código live comprovado; falta a foto renderizada.
- **DoD:** todos os critérios PROVADOS exceto a validação visual autenticada (bloqueada
  por acesso, não por defeito). Goal **ATIVO** só nesse item.

### Ciclo 8 — 2026-07-14 — Validação visual autenticada + fechamento
- **VALIDAÇÃO VISUAL AUTENTICADA CONFIRMADA PELO AUTOR** (sessão logada) nas DUAS telas:
  - **Dashboard (cartão 53abdade):** "Correção necessária no cap 38 · 38 produzidos ·
    37 aprovados · 37 sincronizados · cap 38 em correção" ✅
  - **Aba Escrita:** "38 produzidos · 37 aprovados · 37 sincronizados · meta 60" +
    mensagem TRADUZIDA ("Capítulo 38 precisa de uma correção de estilo antes de seguir.
    2 usos de 'coisa' no capítulo 38 …") + erro cru APENAS dentro de "Ver diagnóstico
    técnico" ✅
  - Nenhuma tela divergiu do resolvedor (paridade real confirmada).
- **Retoque cosmético (não reabriu o goal):** frase do humanizador `humanizarBlocker`
  "trocar pela coisa concreta" → "trocar pelo referente concreto" (evita a ironia de
  usar "coisa" num blocker sobre "coisa"). String minha, não citação do gate.
- **DECISÃO FINAL: goal CONCLUÍDO.** Todos os critérios da Definition of Done com
  evidência verificável: aprovado persistido antes do próximo; bloqueio posterior não
  oculta anterior; progresso sobrevive a exceção/reinício (merge); banco+Storage+disco
  reconciliados; dashboard e projeto no MESMO resolvedor com paridade testada; contadores
  semânticos corretos; jobs antigos sem bloqueio falso; mensagens traduzidas com
  diagnóstico acionável; qualidade≠cota≠infra distintos; contrato engine-agnóstico
  (alinhado a engine_calls/engine_chapter_provenance); caso 36/37/38 passa (fixture E
  reconciliação real); testes automatizados verdes (521/521); validação visual na
  plataforma publicada; nenhum gate enfraquecido; nenhum capítulo perdido.
- **Decisões que ficam com o autor:** corrigir o cap-38 (escada S9 disponível; escrita
  NÃO retomada); reiniciar o worker para ativar o backend novo (produção pausada).
