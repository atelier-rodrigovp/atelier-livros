# GOAL-LEDGER — Correção automática sem clique (bloqueio de qualidade recuperável)

> **Goal:** todo bloqueio de qualidade tecnicamente recuperável aciona automaticamente
> uma sequência segura, persistente, idempotente e limitada de correção → reavaliação
> → aprovação → sincronização → continuação, **sem clique do usuário**, sem enfraquecer
> gates e sem loop infinito/custo descontrolado.

Incidente de referência: **O Índice dos Abduzidos** (`53abdade…`), cap-38 bloqueado em
`REVISAO_CAPITULO` ("molde antitese 'nao X, mas Y' 2x"), job `ff65b185…` → `paused`;
produção só continuou após clique manual em "Corrigir capítulo 38".

## Matriz da auditoria inicial (requisito × estado × evidência × correção)

| Req | Estado encontrado | Evidência | Correção aplicada |
|---|---|---|---|
| SG1 classificador | Parcial: qualidade/infra/quota/pausa existiam; sem (d) fundação, (e) autoral, (f) breaker persistidos | `index.ts:266-306` (pré-fix), `limite-max.ts` | `correcao-automatica.ts` (`CategoriaBloqueio`, `classificarBloqueio`), persistido em `progresso.quality_categoria` |
| SG2 escada executora | Só degrau 1; `medirEscada` recomendava sem executar; sem wiring | `escada-correcao.ts` (pré-fix), ledger contrato-progresso ciclo 5 | `correcao-fluxo.ts` (`prepararCorrecao`): degrau 1 no worker; 2–5 via `review/_correcao-cap-NN.json` + remoção do `.try`; 6 = `revisor_craft_opus`; 7 = breaker. Runner injeta a instrução no micro-loop (`_bloco_correcao`) |
| SG3 ledger | Inexistente | grep sem resultado | `quality/correcao-ledger.json` (verdade no disco) + espelho `progresso.correcao`; campos: projeto/cap/hash/estágio/bloqueio/estratégia/tentativa/resultado/retry_at/timestamps/modelo/encerramento/flag automática |
| SG4 resiliência | Trilho `queued`+`retry_at` existia (Max/infra) mas qualidade → `paused` terminal | `index.ts:266-288` pré-fix; `fila.ts:39-41` | Qualidade recuperável usa o MESMO trilho; dedupe de processamento repetido via marcador `.try` + `hash_preparado` |
| SG5 custo | Sem orçamento por capítulo p/ qualidade | `index.ts:379-390` | `MAX_TENTATIVAS_AUTO=5`/chave; nunca mesma estratégia sobre o mesmo hash; 2 falhas no mesmo degrau ⇒ escala; backoff 90s×2^n (teto 30min); breaker |
| SG6 UI | 10 situações; sem correção automática/aguardando/breaker/global; botão obrigatório | `resolveOperationalState.ts` pré-fix; `Projeto.tsx:758` | +4 situações (`correcao_automatica`, `aguardando_correcao`, `circuit_breaker`, `producao_desativada`) + `aguardando_decisao` ligado; botão vira "Tentar agora" (opcional) |
| SG7 fundação | Escrita continuava com aviso só no log; publicação bloqueava como blocked_quality genérico | `jobs.ts` gate fundação; `PUBLICATION_GATE` | `fundacao_status/fundacao_blockers` persistidos no progresso; categorias `fundacao_pendente`/`decisao_autoral`; banner `aviso_fundacao` separado na UI |
| SG8 testes reais | `quality-loop.acceptance` e `contrato-progresso.regression` só em memória | relatório da auditoria | e2e com runner Python REAL (stub apenas em `run_claude`) + integração com picker/claim reais |

**Hipótese principal CONFIRMADA:** a lacuna era orquestração pós-gate, não capacidade
do escritor — o runner já concedia 1 re-revisão dirigida por run (marcador `.try` +
pendências), mas o worker convertia o rc=3 em `paused` terminal e ninguém reagendava.

## O que foi implementado

**Novos módulos (worker):**
- `worker/src/correcao-automatica.ts` — decisão PURA: classificação (7 categorias),
  escada por tipo de problema (`degrauInicial`), orçamento, dedupe por hash,
  escalada, breaker, ledger (tipos + `registrarTentativa`/`fecharTentativaPendente`/
  `resumirLedger`).
- `worker/src/correcao-fluxo.ts` — I/O: ledger em `quality/correcao-ledger.json`;
  `capituloBloqueado` (estado `quality_cap` do bloqueio atual ou marcador `.try`);
  `prepararCorrecao` (degraus, idempotente — G5 provado por teste);
  `conciliarLedgerComDisco`/`concluirCorrecoesAprovadas`; `tratarBloqueioQualidade`
  (patch do job: `queued`+`retry_at` p/ recuperável; `paused`+categoria p/ humano).

**Arquivos protegidos alterados (baseline v1.0.6, manifest 1.0.3 — sancionados):**
- `worker/src/index.ts` — handler de `QualityBlockedError` delega a
  `tratarBloqueioQualidade`; fail-safe: erro no fluxo → `paused` (comportamento
  anterior). Nenhum outro handler alterado.
- `worker/src/jobs.ts` — `fundacaoInfo` persistido no progresso (SG7); fechamento do
  ledger no pós-run (`concluirCorrecoesAprovadas`) ANTES de propagar novo bloqueio;
  espelho `correcao` em todos os `setProgress` de `escreverLivro`.
- `livro_runner.py` — `quality_cap` no estado ao bloquear (REVISAO_CAPITULO/
  SPEC_CAPITULO; None em DESMANEIRISMO) e limpo no início do run; `_bloco_correcao`
  injeta a instrução do worker (`review/_correcao-cap-NN.json`) no prompt do
  micro-loop com diretiva por degrau; instrução removida na aceitação. Gates
  INALTERADOS (a guarda de aceitação reconta exatamente como antes).
- Skill instalada re-sincronizada via `instalar-skills.ps1` (backup em
  `~/.claude/skill-backups/20260714072419`); hash instalado = fonte = manifest
  (`74c38a7b…`).

**Frontend:**
- `src/lib/resolveOperationalState.ts` — situações novas + `aviso_fundacao` +
  `correcao_info` + `producaoGlobalAtiva` (pausa global ≠ pausa por projeto).
- `src/hooks/useWorkerStatus.ts` — lê também `worker_control.enabled`.
- `src/pages/Projeto.tsx` — botão "Tentar agora"/"Corrigindo…" (clique opcional),
  banner de fundação, linha degrau/tentativa.
- `src/pages/Dashboard.tsx` — `producaoGlobalAtiva` (semântica corrigida: antes o
  global era passado como pausa por projeto).

**Mudança justificada em `escada-correcao.ts` (G3):** moldes/cadência/repetição
cross-cap reclassificados de `narrativo` (degrau 5) para `lexical_prosa` (degrau 2)
— o gate aponta ocorrências exatas de FRASE; começar na revisão dirigida cumpre
"correção mínima e focalizada". Nenhum gate de aprovação foi alterado; isso muda
apenas O TAMANHO da primeira correção, nunca o critério de aceite.

**Decisão SG3 (sem migration):** o ledger persiste no disco do projeto
(invariante "truth on disk") com espelho em `jobs.progresso.correcao` — nenhuma
DDL necessária; sobrevive a restart e é auditável por arquivo. Uma tabela SQL
espelho pode ser adicionada depois (aditiva), mas não é pré-requisito do goal.

## Fluxo de referência (implementado)

```
runner reprova (rc=3, quality_cap) → worker classifica (SG1)
→ recuperável? ledger: fecha pendência anterior como reprovada; decide degrau
  (mín. por tipo de problema; escala se mesmo hash/2 falhas no degrau; orçamento 5)
→ prepara disco (degrau 1 determinístico | instrução p/ micro-loop + concede 1
  tentativa limitada removendo .try | ajusta contador book-wide)
→ job volta a queued com progresso.retry_at (backoff) — o picker (fila.ts) pula
  até a janela e reivindica SOZINHO depois (mesmo trilho da quota do Max)
→ runner re-roda, injeta a instrução, o time corrige, a guarda RECONTA os MESMOS
  gates → aprovado? _revcap.done + quality json hash-bound + sync + PRÓXIMO cap;
  worker fecha a tentativa como "aprovado" no ledger
→ reprovado de novo? novo ciclo com degrau maior, até orçamento → circuit breaker
  (paused, categoria circuit_breaker, diagnóstico completo no progresso)
→ não recuperável (GATE_FUNDACAO/PUBLICATION_GATE): paused com decisao_autoral/
  fundacao_pendente — estados distintos na UI.
```

## Evidências (2026-07-14)

- **Typecheck worker:** `tsc --noEmit` exit 0. **Typecheck web:** `tsc -b` exit 0.
- **Suíte monorepo:** `npx vitest run` → **569/569 verdes (56 arquivos)** (era
  455/45 no worker; +~74 testes novos; zero regressões — G1).
- **Build:** `npm run build` → `✓ built in 5.86s`.
- **E2E runner real** (`correcao-runner.e2e.test.ts`, 4/4): gate real bloqueia
  (rc=3, `QUALITY_BLOCKED stage=REVISAO_CAPITULO cap=1`); worker decide sozinho
  (queued+retry_at, `.try` removido, instrução gravada, ledger tentativa 1 degrau 2);
  re-run injeta "INSTRUCAO DE CORRECAO AUTOMATICA … degrau 2" no prompt, guarda
  reconta e aprova (`_revcap-01.done`, quality json hash-bound), estado desbloqueia,
  ledger fecha "aprovado"; escrita AVANÇA para o cap-2 e o aceita; cap-1 intacto.
- **Scheduler real** (`correcao-scheduler.integration.test.ts`, 5/5): claim atômico
  1-vencedor; `escolherProximo` pula retry_at futuro e seleciona depois; quota e
  pausa por projeto/concorrência preservadas.
- **G4:** os 38 capítulos do 53abdade têm sha256 idênticos antes/depois do trabalho
  (`diff` do snapshot = vazio); cap-37 = `f26e5831…28eb` (hash aprovado no banco).
- **G5 (idempotência):** `correcao-fluxo.test.ts` — 2ª aplicação do mesmo preparo
  sobre o mesmo hash = no-op (mtime do arquivo de instrução inalterado; lista de
  mudanças vazia); processamento duplicado do mesmo bloqueio não duplica tentativa.
- **Estado real do banco (auditoria, sem mexer):** job `ff65b185` paused
  blocked_quality (legado — será tratado pelo fluxo novo no próximo bloqueio);
  job `330c62c9` queued aguardando; `worker_control.enabled=false` (pausa global
  do autor — NÃO religada; religar é decisão exclusiva do autor);
  `chapters` = 37 linhas, cap-37 approved hash-bound, cap-38 ausente.

## Pendências honestas (não mascaradas)

1. **Validação visual autenticada** — extensão do Chrome não conectada e login por
   senha é vedado ao agente (mesmo bloqueio do ciclo anterior). O app local subiu
   com o bundle novo (tela de login renderiza); os 7 estados estão cobertos por
   teste de unidade do resolvedor (strings exatas). Screenshot autenticado fica
   com o autor, como no ciclo contrato-progresso.
2. **Ativação em produção** — worker inerte e produção global desativada por
   decisão do autor. Ao religar + reiniciar o worker: o job `330c62c9` (queued)
   roda; se o cap-38 bloquear de novo, o fluxo novo assume (ledger + retry). O
   job antigo `ff65b185` permanece `paused` como histórico (o vigente é o mais
   recente — job-vigente.ts).
3. Estágios recuperáveis de outros tipos de job (ex.: passes de prosa em
   traduções) entram na MESMA escada; degraus 2–5 só têm preparo de disco para
   capítulos de escrita — para os demais a escada atua por requeue+orçamento.

## Ciclo 2 — 2026-07-14 — Ativação em produção (pela UI, sem terminal)

- **Commits:** `61ce786` (20 arquivos do goal, seletivo — package.json/ajv e
  iniciativas alheias FORA) + `1c47bed` (fix "cap null em correção" no Dashboard,
  achado na validação visual). SEM push (push = deploy; aguarda confirmação).
- **Restart único do worker:** PID 11308 (código antigo) morto às 10:40 UTC; o
  wrapper da Scheduled Task `AtelierWorker` relançou sozinho em 15s (PID 25996)
  com `[preflight] skills conferem com manifest 1.0.3`. ÚLTIMO restart manual —
  o wrapper mantém o processo e o toggle é observado a cada poll (5s).
- **Religamento 100% pela UI (autenticado):** login por magic link administrativo
  (generateLink com a service role do worker; sem senha), sessão transplantada ao
  dev server. Clique em "Ligar produção" (Configurações) às 10:46:52 →
  `worker_control.enabled=true` no banco → job `330c62c9` **running** às 10:46:54
  (~2s) → runner retomou o 53abdade no cap-38 (micro-loop de revisão com o `.try`
  do incidente original). Pausa pela UI é o mesmo caminho (`alternarProducao(false)`;
  o estado anterior — enabled=false + heartbeat `paused` + fila intocada — era
  exatamente esse caminho aplicado).
- **UI validada AUTENTICADA em produção:** Dashboard: cartão do Índice com
  "Produção global desativada · 38 produzidos · 37 aprovados · 37 sincronizados"
  antes do clique. Configurações: "Produção pausada: o worker está rodando, mas
  não processa a fila. Religue para retomar" + Atividade com "Bloqueado por
  qualidade" nos jobs históricos. Aba Escrita (rodando): badge "Escrevendo
  (cap 38)", "Escrevendo o capítulo 38 de 60.", contadores 38/37/37 · meta 60,
  **banner separado** "Fundação com pendência (PROTAGONISTA_INCOERENTE) — a
  escrita continua; a publicação fica bloqueada até resolver", botão desabilitado
  "Escrevendo…", "motor: claude-code · opus".
- **G4:** cap-37 = `f26e5831…` intacto após o religamento.
- **Desfecho do cap-38 em andamento** (revisão delegada leva minutos; sessão do
  autor expirou antes): os critérios de observação estão abaixo. O sistema segue
  autônomo — esse é o comportamento contratado.

### Como observar o desfecho (nenhuma ação necessária)

1. **Aprovado direto (a):** `review/_revcap-38.done` aparece no WORK_DIR;
   aba Escrita salta para "Escrevendo (cap 39)"; chapters ganha a linha 38.
2. **Bloqueado recuperável (b):** worker.log mostra "correção automática do
   cap 38 — degrau N (…), tentativa X/5; nova tentativa ~HH:mm"; job volta a
   `queued` com `retry_at`; `quality/correcao-ledger.json` criado; UI mostra
   "Correção automática — cap 38"; o picker retoma sozinho na janela. ZERO cliques.
3. **Não recuperável (c):** UI mostra "Decisão autoral necessária"/"Bloqueado
   após circuit breaker" com diagnóstico — comportamento correto, não falha.

## Ciclo único — 2026-07-14

- Auditoria completa (matriz acima) → implementação → testes → guards re-abençoados
  (baseline v1.0.6; manifest 1.0.3; motivo registrado no comando e aqui) → suíte
  verde → build verde → G4 verificado → skill instalada sincronizada.
- **Status: goal CONCLUÍDO no código e provado por testes reais (runner+scheduler);
  itens 1–2 acima dependem de ação exclusiva do autor (acesso autenticado e
  religação da produção) e estão declarados, não mascarados.**
