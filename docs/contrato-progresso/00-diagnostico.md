# Fase 0 — Diagnóstico (somente leitura)

**Data:** 2026-07-13 · **Projeto-caso:** O Índice dos Abduzidos
(`53abdade-554d-47e2-bd14-955de3ffc41e`), meta 60 caps, `skill-dan-brown`, piso 1.800.

Toda afirmação abaixo é **PROVADA** (saída real, arquivo:linha, hash, query) salvo
onde marcado **PRESUMIDO**. Nenhum arquivo fora de `docs/` foi alterado nesta fase.

---

## 0. Resumo executivo

O bloqueio do 53abdade **não** foi cota da Anthropic. O projeto pausou em
`REVISAO_CAPITULO` porque o cap-38 tem 2 ocorrências residuais da muleta
"coisa/coisas". **Os gates funcionaram** — o 38 não passou silenciosamente. O
defeito está no **contrato em volta dos gates**: persistência, progresso, estado e
apresentação.

Dois bugs de código, ambos confirmados no dado real, produzem a perda e a confusão:

- **Bug A — throw antes do sync** (`worker/src/jobs.ts:959`): quando o runner
  termina com `quality_status="blocked_quality"`, o worker lança `QualityBlockedError`
  **antes** do laço que sobe capítulos ao Storage e faz upsert em `chapters`
  (`jobs.ts:975–986`). Resultado: o cap-37 **aprovado** (só no disco) nunca subiu
  porque o cap-38 falhou. Falha posterior põe em risco trabalho anterior aprovado.

- **Bug B — substituição do progresso** (`worker/src/index.ts:268–279`): o handler
  de `QualityBlockedError` grava um `progresso` **literal novo** (`{quality_status,
  quality_stage, quality_blockers, resumo}`), sem fazer merge do anterior. Como
  `finalizar` faz `sb.from("jobs").update(patch)` (`index.ts:216`), a coluna `progresso`
  inteira é **sobrescrita** — perdem-se `cap_atual`, `total`, `fase`, `palavras`,
  `nota`, `continua`. Com o job parado, a UI cai na contagem do banco (36) e não
  explica o resto.

Somado a isso, **quatro interpretações divergentes** de estado no frontend (sem
resolvedor único) e **jobs históricos pausados** com progresso vazio poluindo o
estado vigente.

### Divergência das camadas (PROVADO, 2026-07-13)

| Camada | Capítulos | Fonte da evidência |
|---|---|---|
| Banco `chapters` (edição origem `716273ca…`) | **1–36** (37/38 ausentes) | query `select numero` |
| Storage `manuscritos/<owner>/53abdade…/origem` | **01–36** (37/38 ausentes) | `storage.list` |
| Disco `WORK_DIR/53abdade…/manuscrito` | **1–38** | `ls` + `wc -w` |
| — cap-37 "Descartável" (2003 palavras) | **APROVADO**, hash-bound | `quality/capitulo-37.json` |
| — cap-38 "Ela sempre soube" (2429 palavras) | **BLOQUEADO** (2× "coisa") | `ESTADO_LIVRO.json` |

---

## 1. Cadeia causal do caso 36/37/38 (10 passos, com evidência própria)

1. Até 2026-07-04 o projeto sincronizou 36 capítulos. **Prova:** último job
   `escrever_livro` com `status=done` (2026-07-04T06:29) tem
   `progresso={"cap_atual":36,"total":60,...}`; `chapters` tem exatamente 1–36.
2. Runs posteriores produziram os caps 37 e 38 **no disco**. **Prova:** disco tem
   `capitulo-37.md` (2003 palavras) e `capitulo-38.md` (2429), mtime 2026-07-13.
3. O runner revisou e **aprovou o cap-37** pelo micro-loop. **Prova:**
   `review/_revcap-37.done` existe; `quality/capitulo-37.json` tem
   `status:"approved"`, `textHash:"f26e5831…"`.
4. O hash aprovado do 37 **bate com o disco atual**. **Prova:** `sha256` do disco =
   `f26e58313700f921bea371ab820b22d95de2c5bed4cf0e11fa4343e81bfe28eb` = `textHash`.
   → A decisão de aprovação é válida e vinculada ao conteúdo vigente.
5. O runner tentou aprovar o cap-38 e **bloqueou** na guarda de aceitação após 1
   re-revisão dirigida. **Prova:** `review/_revcap-38.try` (não `.done`); **não há**
   `quality/capitulo-38.json`.
6. O runner gravou no `ESTADO_LIVRO.json`: `quality_status:"blocked_quality"`,
   `quality_stage:"REVISAO_CAPITULO"`, `quality_reason:"time escritor->revisor->editor
   esgotou o orcamento sem comprovar pos-condicoes"`, blocker = `muleta coisa/coisas
   2x — L35 … L45 …`. **Prova:** conteúdo do `ESTADO_LIVRO.json`. Origem da mensagem:
   `livro_runner.py:2339–2342` (rc=3).
7. O worker leu o estado (`jobs.ts:958`) e, em `jobs.ts:959–965`, lançou
   `QualityBlockedError` — **antes** do sync (`jobs.ts:975`). **Prova:** ordem do
   código; o laço de upload/upsert está depois do `throw`.
8. Como o throw pulou o sync, **nem o 37 aprovado nem o 38 subiram**. **Prova:**
   `chapters` e Storage param em 36; disco tem 38.
9. O handler em `index.ts:266–281` marcou o job `paused` e **substituiu** o
   `progresso` pelo literal de bloqueio (sem `cap_atual/total/fase`). **Prova:**
   `jobs.progresso` do job atual = `{"resumo":"Bloqueado por qualidade",
   "quality_stage":"REVISAO_CAPITULO","quality_status":"blocked_quality",
   "quality_blockers":[…]}` — exatamente o literal de `index.ts:271–276`.
10. A UI, com o job parado e o progresso sem contadores, cai na contagem do banco
    (36/60) numa tela, mostra "pausado — decisão pendente" noutra, "Bloqueado por
    qualidade" noutra, e vaza o `erro` cru do runner ao lado do botão "Continuar
    escrita". **Prova:** §4 abaixo (file:line).

**Risco real de perda:** o cap-37 aprovado existe **apenas no disco do PC do worker**.
Se esse disco falhar antes de uma sincronização bem-sucedida, o trabalho aprovado se
perde. O contrato atual não torna o aprovado durável antes do próximo passo.

---

## 2. Worker — pontos exatos do defeito

### 2.1 `escreverLivro` (`worker/src/jobs.ts:817–1140`)

- Poller de progresso (`jobs.ts:894–905`): a cada 20s grava `setProgress` com
  `fase/cap_atual/total/nota/palavras` lidos do disco. **Só atualiza o contador** —
  **não** sobe capítulo nenhum ao Storage/DB. Nada é durável durante o run.
- Leitura do estado (`jobs.ts:958`) → **branch de bloqueio** (`jobs.ts:959–965`):
  ```ts
  if ((state as any)?.quality_status === "blocked_quality") {
    throw new QualityBlockedError(stage, blockers, reason);   // <-- ANTES do sync
  }
  ```
- **Sync incremental** (`jobs.ts:975–986`): só aqui os capítulos são sanitizados,
  subidos (`uploadFile`) e upsertados (`upsertCapResiliente`). Está **depois** do
  throw → inalcançável quando há bloqueio.
- Nota S2: o laço de sync sobe **todos** os `caps` do disco indiscriminadamente (não
  checa aprovação — só piso de palavras via `chaptersOnDisk`). Ou seja, hoje o
  critério de "vai pro Storage/leitor" é "arquivo no disco ≥ piso", **não**
  "aprovado". `chaptersOnDisk` em `worker/src/lib.ts:105–124`.

### 2.2 Handlers de erro (`worker/src/index.ts:265–368`)

- `QualityBlockedError` (`index.ts:266–281`): grava `progresso` **literal** (sem
  merge). **Bug B.**
- `InfrastructureBlockedError` (`index.ts:283–296`): idem — literal
  `{quality_status:"blocked_infrastructure", dependency, resumo}` (também substitui).
- `LimiteMaxError` (`index.ts:301–307`): **faz** `select("progresso")` + spread
  (`{...cur.progresso, aguardando_reset, retry_at, motivo}`) — **preserva**.
- `InfrastructureRetryError`/rede (`index.ts:312–367`): **faz** merge com
  `progressoAtual` — **preserva**.
- `finalizar` (`index.ts:214–220`): `sb.from("jobs").update(patch)` — o `patch.progresso`
  substitui a coluna jsonb inteira. Confirma que os handlers que não fazem spread
  destroem o progresso.

**Assimetria provada:** só os caminhos de **qualidade** e **infra-blocked** perdem o
progresso; os de limite/retry preservam. O contrato correto (S4) exige merge em
TODAS as transições para pausa/bloqueio.

### 2.3 Reenfileiramento e dedupe

- `enfileirarEscritaSeNovo` (`jobs.ts:795–802`, chamado em `jobs.ts:1024`) — só no
  caminho "incompleto e avançou"; o caminho de bloqueio de qualidade não reenfileira
  (correto: bloqueio é decisão, não retry automático).

---

## 3. Runner — fases, quality state e persistência por capítulo

Arquivo vivo: `worker/skill-patches/livro-do-zero-ao-epub/assets/livro_runner.py`
(2483 linhas) — **byte-idêntico** ao instalado em
`~/.claude/skills/livro-do-zero-ao-epub/assets/livro_runner.py` (mesmo tamanho/mtime).
`tools/gate_manuscrito.py` é utilitário separado (antivazamento pré-EPUB), não é
chamado de dentro do runner.

- **Fases** (`livro_runner.py:65–66`): ESTRUTURA · ESCRITA · CONSOLIDACAO · REVIEW ·
  REESCRITA · DESMANEIRISMO · EPUB · CONCLUIDO. Transições em `next_phase()`
  (`:484–508`), disparadas por `done_condition()` (`:455–481`) — sempre pela verdade
  do disco.
- **Micro-loop por capítulo** dentro de ESCRITA (`:2178–2192`): antes de escrever o
  próximo, revisa o 1º capítulo válido ainda não revisado (escritor→revisor→editor).
- **Persistência por capítulo (DOIS níveis, PROVADO):**
  - marcador `review/_revcap-NN.done` ao aceitar (`:2309–2328`); reentrante
    (`primeiro_cap_nao_revisado()` `:302–308`).
  - veredito `quality/capitulo-NN.json` via `_gravar_quality_cap()` (`:258–299`),
    com `textHash = sha256(texto)` (`:281`) — aprovação vinculada ao conteúdo.
  - renovação book-wide ao concluir DESMANEIRISMO limpo (`:2374–2384`).
- **Bloqueios que setam `blocked_quality` (rc=3):** DESMANEIRISMO/teto (`:2139–2146`),
  SPEC_CAPITULO (`:2211–2218`), REVISAO_CAPITULO (`:2339–2348`, a mensagem do caso).
- **Reset stale no início de todo run** (`:2109–2114`): se o estado estava
  `blocked_quality`, volta a `pending` e reavalia tudo do disco. → a retomada
  reprocessa; relevante para S6/S10.
- **Muleta "coisa" (`:991–1009`):** budget 1 por capítulo, 4/10k global — a mais
  apertada. Guarda de aceitação (`:2287–2309`) exige piso/tiques/ledger/agência/
  streak/gate simultâneos; na 2ª falha (após `_revcap-NN.try`) → bloqueia.

### 3.1 Contradição de fonte de verdade (S2, PROVADO)

`ESTADO_LIVRO.json` diz `capitulos_aprovados: 38`, mas só o cap-37 tem quality state
aprovado (a pasta `quality/` só contém `capitulo-37.json`). Motivo: o runner deriva
`capitulos_aprovados` de `capitulos_validos()` no disco (contagem por piso de
palavras, `sincroniza_contadores_do_disco()` `:319–325`), **não** dos aprovados por
qualidade. **O nome do campo mente.** Isso alimenta o descasamento de contadores na
UI (um numerador conta "válidos", outro conta "sincronizados").

---

## 4. Frontend — 4 interpretações divergentes + vazamento de erro

**Não existe resolvedor único.** Dois helpers em `src/lib` já divergem entre si, mais
duas interpretações inline nas telas. Para o **mesmo** job `paused` +
`quality_status="blocked_quality"`:

| Tela | file:line | Rótulo exibido |
|---|---|---|
| Dashboard / cabeçalho Projeto | `src/lib/status.ts:107` (via `Dashboard.tsx:215`/`Projeto.tsx:480`) | **"Bloqueado por qualidade"** (sem mostrar o blocker) |
| Observabilidade | `src/lib/operationalStatus.ts:14` (via `Observabilidade.tsx:92`) | **"Bloqueado por qualidade"** + detalhe `stage: blockers` |
| Aba Escrita (Projeto) | `src/pages/Projeto.tsx:736` | **"pausado — decisão pendente"** |
| Badge de job (Projeto/Config) | `src/lib/status.ts:22` | **"Pausado"** |

- **Resolvedores concorrentes:** `status.ts:displayProjectStatus` (`:97–118`),
  `operationalStatus.ts:deriveWritingStatus` (`:11–23`), texto inline em
  `Projeto.tsx:730–740`, e `jobStatusBadge` (`status.ts:12–30`). Só o
  `operationalStatus.ts` expõe `quality_blockers`.
- **Contagem "36/60" derivada de 3 formas:** Dashboard usa `chapters`/`total_capitulos`
  (`Dashboard.tsx:62,216–227`); aba Escrita usa `max(progresso.cap_atual, chapters)`
  (`Projeto.tsx:687–692`); Observabilidade usa **só** `progresso` (`Observabilidade.tsx:81–82`).
  Divergem quando o `progresso` está defasado do disco/banco.
- **Vazamento do erro cru:** `Projeto.tsx:55` renderiza `job.erro.slice(0,80)` ao lado
  do botão "Continuar escrita" — é aí que "time escritor->revisor->editor esgotou o
  orçamento…" aparece como mensagem principal. Sem mapeamento central de `job.erro`→
  mensagem humana (única tradução amigável isolada em `Projeto.tsx:501–509`, só
  `criar_volumes`). Também vaza em `NovoProjeto.tsx:87`, `Configuracoes.tsx:375`.
- **Realtime:** cada tela abre seu próprio canal (`Dashboard.tsx:103–112`,
  `Projeto.tsx:137–164`, `Observabilidade.tsx:187–193`); refetch completo a cada
  evento; sem hook compartilhado. `useWorkerStatus` faz polling (não Realtime).
- **Tipagem fraca:** `Job.progresso: Record<string, unknown>` (`src/lib/types.ts:116`),
  sem shape forte de qualidade — cada tela reinterpreta.

---

## 5. Jobs históricos que contaminam o estado vigente (S6, PROVADO)

Histórico do 53abdade (últimos jobs) inclui **pausados antigos com progresso vazio**:

- `qualidade_editorial` — `paused`, `2026-07-06`, `progresso={}`.
- `telemetria` — `paused`, `2026-07-01`, `progresso={}`.
- `escrever_livro` — `paused`, `2026-07-08`, blocked_quality em `GATE_CAPITULO`
  (cadência), **anterior** ao bloqueio vigente (`REVISAO_CAPITULO`, 2026-07-13).

Não há hoje um conceito de "job vigente autoritativo": as telas varrem jobs por
`project_id`/`tipo` e podem pegar um pausado antigo. O contrato (S5/S6) precisa
definir qual registro é autoritativo e marcar os substituídos.

---

## 6. Banco — modelagem incapaz de representar o estado por capítulo (S2)

`chapters` (`supabase/schema.sql:41–51`): `id, owner, edition_id, numero, titulo,
palavras, storage_path, created_at`, `unique (edition_id, numero)`. **Sem** coluna de
`status/aprovado/hash/sincronizado`. Hoje "linha existe" = "sincronizado", e não há
como distinguir "sincronizado mas não aprovado" de "aprovado". Existe RPC idempotente
`on conflict (edition_id, numero) do update` em `supabase/reliability.sql:79–82`.

→ O contrato da Fase 1 precisará decidir **onde** vive o estado por capítulo
(coluna nova em `chapters` via DDL; ou tabela de quality state; ou espelho do
`quality/capitulo-NN.json`). **Restrição do autor (memória):** DDL não é aplicado
pelo agente — entrego SQL para o autor colar no dashboard. Decisão-para-o-autor.

---

## 7. Coordenação com trabalho em andamento (verificado)

- **Harness de benchmark RODANDO:** PIDs 31192/26308/23944 executando
  `scripts/benchmark-escritor/gerar.ts --candidatos=C4,C5,C6`. **Não tocar** em
  `worker/scripts/benchmark-*` nem `worker/src/engines/hosted/`; não rodar suítes que
  colidam enquanto ativo.
- **Worker de produção VIVO:** PID 18004 (`node --import tsx src/index.ts`). Produção
  "pausada" pela flag, mas o processo poll está ativo. Testes exigem produção pausada.
- **Kernel Codex (PID 26000)** operando no mesmo repo — preservar worktree; não mexer
  em arquivos de terceiros (`worker/engine-isolation/`, `worker/scripts/benchmark-escritor/`,
  `worker/src/engines/`, `worker/scripts/gerar-protected-baseline.ts`, `p32-*`,
  `dispatch-caracterizacao.test.ts`, `engine-isolation.test.ts` são untracked de
  outra iniciativa).

## 8. Testes existentes, guards e contrato hosted

### 8.1 Testes que tocam sync/progresso/bloqueio (worker + web)

Existem e passam hoje: `escrever-livro.integration.test.ts` (ciclo ponta-a-ponta,
**mas com 1 único capítulo**), `publication-transaction.test.ts` (atomicidade
staging→promoção via `promote_publication`), `quality-loop.acceptance.test.ts`,
`quality-state.test.ts` (hash invalida aprovação), `publication-gate.test.ts`,
`limite-max.test.ts`, `runner-outcome.test.ts`, `retry.test.ts`,
`retry-policy.test.ts` (H6: 3× erro idêntico bloqueia), `fila.test.ts` (pausa de
produção, pula reset do Max), `state-machine.test.ts`; e no frontend
`src/lib/operationalStatus.test.ts` + `src/lib/status.test.ts`.

**Lacuna PROVADA (S11):** **nenhum teste** verifica que "um capítulo aprovado é
persistido antes do próximo". Razões: (a) o integration test roda 1 capítulo — sem
sequência N→N+1; (b) `upsertCapResiliente` (`jobs.ts:804`) e `setProgress`
(`jobs.ts:220`) — a persistência incremental real — **não têm teste dedicado**; (c)
os handlers de erro do `index.ts:266–334` só têm cobertura **indireta** (via classes
de erro), sem teste do `try/catch` que exercite a substituição do progresso.

### 8.2 Guards e caminho sancionado (CRÍTICO para a Fase 2)

- `worker/engine-isolation/protected-baseline.json` (v1.0.1) congela sha256 de
  arquivos protegidos — **incluindo `worker/src/jobs.ts`, `index.ts`, `lib.ts`,
  `modelos-agentes.ts`, `limite-max.ts`, `telemetria.ts`, `craft-agentes.ts`,
  `fundacao-gate.ts`, `livro_runner.py`, `instalar-skills.ps1`, `manifest.json`,
  `gate_manuscrito.py`**. Os arquivos que este goal PRECISA alterar (jobs.ts,
  index.ts, lib.ts) estão todos aí. Alterá-los quebra `worker/src/engine-isolation.test.ts`
  **por design** (invariante I1 da iniciativa hosted).
- **Autorização:** o prompt do goal autoriza explicitamente este goal a modificar os
  protegidos pelo **caminho sancionado**:
  `npx tsx worker/scripts/gerar-protected-baseline.ts "<motivo, ≥10 chars>"`
  (recomputa hashes, bumpa patch, grava `ultimoMotivo`), com motivo no formato
  `goal contrato-progresso <data>: <arquivos e razão>`, **a cada mudança**, e registro
  no ledger. Nunca editar hash na mão.
- `livro_runner.py` está em **DOIS** guards (baseline + `manifest.json`). Se este goal
  tocar o runner: rodar `npx tsx worker/scripts/gerar-manifest.ts` **e** (com
  aprovação) `gerar-protected-baseline.ts`.
- `worker/src/dispatch-caracterizacao.test.ts` congela o `switch` de `executarJob`
  (`jobs.ts:2111–2133`). Só quebra se eu **alterar o mapa de dispatch** (adicionar
  tipo de job). Mudanças **dentro** dos handlers não o afetam. Se precisar mudar o
  switch: editar `DISPATCH_ATUAL` deliberadamente (não afrouxar).

### 8.3 Contrato hosted já definido (para nascer engine-agnóstico — S10/1.7)

`docs/engine-zero-custo/spec-2.6-modelo-de-dados.md` e `spec-2.3` já definem shapes
que o contrato de progresso deve **alinhar** (um contrato, duas engines):

- **`engine_chapter_provenance`** `(edition_id, numero, capitulo_hash)` unique,
  append-only: proveniência por capítulo com `capitulo_hash` (sha256), provedor/modelo
  do escritor, `call_ids`, custo (invariante 0). **Persistida ANTES da promoção**,
  idempotente (`on conflict do nothing`). → é o análogo hosted do meu "sync + aprovação
  vinculada a hash"; o contrato deve casar com esse shape.
- **`engine_calls`**: uma linha por chamada (papel, provedor, modelo solicitado×executado,
  tokens, custo verificado, tentativa, resultado, **gate posterior**, quota restante,
  hash do artefato).
- **`engine_quota_state`** `(owner, provedor, modelo)`: janelas de quota (Realtime) → UI
  mostra cota/ETA.
- **`execution_snapshot`**: payload congelado (`engine_configs` versão + skill_snapshot_hash)
  referenciado pelo job no claim.
- **Estados de pausa canônicos** (`spec-2.3 §3`): `paused_free_quota` (cota),
  `paused_zero_cost_violation` (preço≠0/modelo trocado), `blocked_quality` (pós-condição
  esgotou orçamento), falha técnica. → a hierarquia do resolvedor único (1.4) deve
  mapear para esses nomes.
- **O fluxo hosted reusa `promote_publication` sem alteração** — a persistência
  incremental do meu contrato deve conviver com a promoção atômica final.
- Código onde esses shapes já vivem (ler para alinhar, **não editar**):
  `worker/src/engines/hosted/{contracts.ts, estados.ts, executor.ts, validacao.ts, zero-cost.ts}`.

### 8.4 Estado vivo no momento da auditoria (segurança, PROVADO)

- **Produção PAUSADA:** `worker_control.enabled = false` (owner `c149a482…`,
  updated_at 2026-07-13T21:08). O worker não reclama jobs. `config_producao`
  `max_paralelo=1`.
- Há 2 jobs `escrever_livro` `queued` de **outros** projetos (`da74a71e…`,
  `de7ad2da…`) — não serão reclamados enquanto pausado. **Não religar a fila** é
  decisão do autor; não farei.
- Worker PID 18004, harness de benchmark PIDs 31192/26308/23944, kernel Codex PID
  26000 — todos ativos (ver §7).

---

## 9. Mapa das correções por subgoal (para a Fase 1/2 — sem implementar aqui)

| Subgoal | Correção-alvo | Âncora de evidência |
|---|---|---|
| S3 | Sincronizar capítulos aprovados **antes** de qualquer throw de bloqueio; idealmente por capítulo assim que aprovado (não em lote pós-runner) | `jobs.ts:959` vs `:975` |
| S4 | Merge de progresso em TODAS as transições para pausa/bloqueio (nunca literal) | `index.ts:268–279` vs `:303–304` |
| S2 | Definir fonte de verdade por capítulo (produzido/aprovado/sincronizado/disponível); parar de tratar "arquivo no disco ≥ piso" como aprovado; renomear/derivar contador honesto | `chaptersOnDisk` `lib.ts:105`; `capitulos_aprovados`≠aprovados |
| S5/S7 | Resolvedor único mapeando qualidade × infra × cota × pausa × decisão autoral × histórico, alinhado aos estados hosted | `status.ts` + `operationalStatus.ts` + inline |
| S6 | Job vigente autoritativo; marcar substituídos; jobs antigos não contaminam | jobs `qualidade_editorial`/`telemetria` paused vazios |
| S8 | UI verdadeira/acionável; traduzir `job.erro`; botões contextuais | `Projeto.tsx:55,736` |
| S9 | Escada de correção econômica (determinístico→editor focado→modelo barato→recontagem→revisor→escritor), sem enfraquecer gate | runner `:2287–2348`; muleta "coisa" `:991` |
| S10 | Progresso registra engine/provedor/modelo/tentativa/cota/retry, alinhado a `engine_chapter_provenance`/`engine_calls` | spec-2.6/2.3 |
| S11 | Regressão 36/37/38 com fixtures (multi-capítulo) | lacuna §8.1 |
| S12 | Validação banco×Storage×disco×UI + pós-reinício | — |

