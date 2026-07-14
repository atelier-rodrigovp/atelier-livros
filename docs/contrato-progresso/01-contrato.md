# Fase 1 — Contrato de progresso, sincronização e estado único

**Design antes de código.** Nada aqui está implementado. Apresentado no **PORTÃO 1**;
implementação só após OK. Cada spec aponta para a evidência da Fase 0
(`00-diagnostico.md`). Princípio-guia: **um contrato, duas engines** — nomes/shapes
alinhados a `engine_chapter_provenance` e `engine_calls` (spec-2.6/2.3), sem duplicar
conceito com nome diferente.

Decisões que ficam para você estão marcadas **[DECISÃO-AUTOR]** e consolidadas no fim.

---

## 1.1 Modelo de estado por capítulo (fonte de verdade explícita)

O estado de um capítulo **não é um campo** — é uma **derivação pura** de quatro
fontes físicas, cada uma dona de um fato:

| Fato | Fonte de verdade | Como se lê |
|---|---|---|
| arquivo existe? | disco | `manuscrito/capitulo-NN.md` existe |
| acima do piso? | disco | `countWords ≥ piso` (`lib.ts:105`) |
| foi revisado? | disco | `review/_revcap-NN.done` existe |
| qual gate rodou / resultado / blocker? | `quality/capitulo-NN.json` | `stage`, `blockers` |
| qual hash foi avaliado? | `quality/capitulo-NN.json` | `textHash` |
| **aprovado?** | quality + disco | `status=="approved"` **E** `textHash == sha256(arquivo atual)` |
| sincronizado? | banco `chapters` | linha existe **E** `text_sha256 == hash aprovado` |
| disponível ao leitor? | Storage | objeto existe com o hash aprovado |
| no manuscrito-mestre? | disco | mestre contém o texto |
| elegível publicação? | gate final | todos aprovados + hashes coerentes (`decidePublication`) |
| engine/provedor/modelo? | quality/proveniência | ver 1.7 |
| próxima ação? | derivado | ver tabela de transições |

**Regra dura (invariante de identidade):** *aprovação é vinculada ao hash*. Se o texto
no disco muda depois de aprovado, `sha256(disco) != textHash` → a aprovação fica
**stale** e o capítulo **regride** para `correção_necessária`. Já existe teste desse
princípio (`quality-state.test.ts:40`).

**Máquina de estados** (nomes canônicos):

```
produzido → acima_do_piso → em_revisão → correção_necessária → aprovado
          → sincronizado → disponível → elegível_publicação
terminais alternativos: rejeitado, aprovado_excepcionalmente
```

- `correção_necessária` ⇄ `em_revisão` (a escada 1.6 opera aqui).
- `aprovado_excepcionalmente`: **só** por decisão autoral explícita e registrada
  (`applyQualityException`, já existe — `jobs.ts:2079`), com identidade/motivo/blockers/hash.
- `rejeitado`: terminal só por decisão autoral (não por timeout/orçamento).
- **Disco ≥ piso ≠ aprovado.** Hoje o sync trata "arquivo no disco ≥ piso" como
  elegível a subir (`jobs.ts:978` itera `chaptersOnDisk`); o contrato exige que **só
  `aprovado` (hash-bound) suba** ao Storage/leitor.

**Entregável de código (Fase 2):** um módulo puro `resolveChapterState(numero, {disco,
quality, dbRow, storage}) → ChapterState` — **sem I/O**, testável, compartilhado por
worker e (espelhado) frontend. Corrige a contradição S2 (`capitulos_aprovados` conta
válidos, não aprovados — `00-diagnostico.md §3.1`).

---

## 1.2 Persistência incremental (aprovado durável antes do próximo)

**Problema (Bug A):** hoje o sync roda **em lote, depois** do runner, e o throw de
bloqueio (`jobs.ts:959`) acontece **antes** desse lote (`jobs.ts:975`). O cap-37
aprovado nunca vira durável quando o 38 bloqueia.

**Design (aderente à arquitetura "verdade no disco, worker persiste"):**

1. **Sync incremental durante o run, pelo poller que já existe** (`jobs.ts:894`, roda
   a cada 20s). A cada tick, além de atualizar contadores, o poller **sincroniza cada
   capítulo que esteja `aprovado` no disco e ainda não durável** (aprovado por 1.1 +
   `text_sha256` no banco ≠ hash aprovado). Assim, um capítulo aprovado vira durável
   em ~20s — muito antes de o próximo capítulo (minutos de escrita) terminar.
   *Sem tocar no `livro_runner.py`* (protegido em 2 guards): o worker lê os artefatos
   de aprovação que o runner já grava (`quality/capitulo-NN.json`).
2. **Passe final de sync ANTES de qualquer throw.** Reordenar `escreverLivro`: o sync
   dos aprovados ocorre **antes** do branch de `blocked_quality` (e antes dos branches
   de limite/interrupção). O bloqueio do 38 passa a **suceder** a persistência do 37.
3. **Só aprovados sobem.** O laço de sync filtra por `resolveChapterState == aprovado`
   (não por `chaptersOnDisk ≥ piso`). O cap-38 bloqueado **não** sobe ao Storage/leitor.

**Garantias exigidas:**
- **Idempotência:** upsert em `chapters` por `(edition_id, numero)` (unique já existe,
  `schema.sql:50`; RPC `on conflict do update` em `reliability.sql:79`). Reenvio do
  mesmo hash é no-op. Alinha com `engine_chapter_provenance` (`on conflict do nothing`,
  spec-2.6:104).
- **Retentativa de rede:** `uploadFile`/`upsertCapResiliente` já têm retry (`lib.ts:147`,
  `jobs.ts:804`); manter.
- **Ordem correta (compensação):** Storage **primeiro**, `chapters` **depois** —
  um capítulo só é "sincronizado" no banco quando o objeto já está no Storage (evita
  linha apontando para objeto inexistente). Reconciliação disco×Storage×banco por hash.
- **Recuperação após queda / outro worker:** como o estado é derivado do disco+banco,
  qualquer worker retomando reconstrói o que falta (sync é idempotente). O reset stale
  do runner (`livro_runner.py:2109`) já reavalia do disco.
- **N+1 nunca impede N:** a reprovação do 38 não bloqueia a persistência do 37 —
  garantido por (2)+(3).

**[DECISÃO-AUTOR] Onde vive o estado durável por capítulo (hash-bound).** Ver 1.7 e
`02-ddl-proposto.sql`. Recomendação: adicionar colunas mínimas a `chapters`
(`text_sha256`, `quality_status`, `approved_at`) + a proveniência de engine em
`engine_chapter_provenance` (tabela do modelo hosted, chave `capitulo_hash` comum).

**Limite honesto (PRESUMIDO → a validar na Fase 3):** a garantia é *"todo aprovado
vira durável em ≤ ~20s e sempre antes de propagar um bloqueio"*. A versão literal
*"durável no mesmo instante em que o runner aprova, antes de escrever a próxima
linha"* exigiria o `livro_runner.py` falar com o Supabase (creds + guard duplo) —
mudança maior, fora do design mínimo. O worker-level cobre integralmente o caso
36/37/38 e o DoD "bloqueio posterior não oculta anterior". Registro como opção de
Fase 2 caso você queira durabilidade do capítulo em voo durante uma queda no meio do run.

---

## 1.3 Progresso com merge (nunca substituição)

**Problema (Bug B):** o handler de qualidade (`index.ts:268–279`) e o de infra-blocked
(`:283–296`) gravam `progresso` **literal**, apagando `cap_atual/total/fase/…`. Os de
limite/rede (`:303`, `:316`) **fazem** merge. Assimetria provada.

**Design:** **toda** transição para pausa/bloqueio faz merge sobre o progresso vigente,
via um helper único `mergeProgress(jobId, patch)` que lê o `progresso` atual e faz
spread (como `LimiteMaxError` já faz). **Shape canônico do `progresso`** (superset,
campos preservados em qualquer pausa):

```
{ fase, cap_atual, total, palavras, nota, continua,
  maior_produzido, maior_aprovado, maior_sincronizado,   // monotônicos (nunca regridem)
  capitulo_bloqueado, tentativa, orcamento_correcao,
  ultimo_sucesso_duravel,                                 // {numero, hash, at}
  engine, provedor, modelo,                               // 1.7
  quality_status, quality_stage, quality_blockers,        // estado de bloqueio
  situacao, motivo, retry_at, aguardando_reset, acao_necessaria,
  resumo }
```

- **Monotonicidade:** `maior_produzido/aprovado/sincronizado` só aumentam (merge com
  `Math.max`). Um bloqueio nunca zera contagem — some a causa do "cai de volta pra 36".
- `ultimo_sucesso_duravel`: âncora de retomada (`{numero, hash, at}`).
- O helper substitui os literais em `index.ts:271` e `:288`; os caminhos que já fazem
  merge passam a usar o mesmo helper (uniformidade).

---

## 1.4 Resolvedor operacional único

**Problema:** 4 interpretações divergentes (`00-diagnostico.md §4`). Um job `paused`
por qualidade aparece como "Bloqueado por qualidade" / "pausado — decisão pendente" /
"Pausado" conforme a tela.

**Design:** **um módulo** `resolveOperationalState({ job, projectStatus, workerOnline,
chapterStates, totalCapitulos }) → OperationalState`, consumido por dashboard, página
do projeto, aba de escrita, observabilidade, badges, botões, mensagens, progresso.
Unifica os concorrentes `status.ts` + `operationalStatus.ts` + o inline de
`Projeto.tsx:730`. **Hierarquia (precedência), mapeada aos estados hosted canônicos:**

| # | Situação | Rótulo humano | Estado hosted alinhado |
|---|---|---|---|
| 1 | executando | "Escrevendo (cap N)" | running |
| 2 | aguardando cota/disponibilidade do provedor | "Aguardando cota — retoma ~HH:MM" | `paused_free_quota` |
| 3 | retry de infra agendado | "Retomada de infraestrutura em Ns" | infra retry |
| 4 | bloqueado por qualidade | "Correção necessária no cap N" | `blocked_quality` |
| 5 | aguardando decisão autoral | "Aguardando sua decisão (cap N)" | (decisão) |
| 6 | pausado manualmente | "Produção pausada" | pausa manual |
| 7 | na fila | "Na fila" | queued |
| 8 | interrompido, retomável | "Interrompido — retoma do disco" | interrupção recuperável |
| 9 | concluído | "Concluído" | done |

- **Job pausado por qualidade nunca aparece como só "Pausado"** (mata a divergência
  `status.ts:22` vs `operationalStatus.ts:14`).
- **Contadores semânticos únicos:** `resolveOperationalState` devolve `{produzidos,
  aprovados, sincronizados, em_correcao}` derivados de `chapterStates` — uma única
  origem, fim do "36 numa tela, 38 noutra".
- `OperationalState` inclui `{ badge, tone, mensagem_humana, diagnostico_tecnico,
  botoes[], contadores, blocker_humano, proxima_acao, engine_info }`.

---

## 1.5 Estado vigente × histórico

**Problema (S6):** jobs `qualidade_editorial`/`telemetria` pausados com progresso `{}`
podem ser lidos como estado vigente; um `escrever_livro` pausado antigo (07-08) coexiste
com o vigente (07-13).

**Design:**
- **Job vigente autoritativo** por projeto = o `escrever_livro` mais recente
  (`created_at` máx) — apenas ele governa o estado de escrita. Um seletor único
  `jobVigenteEscrita(project_id)` (hoje as telas varrem sem esse conceito).
- Jobs `paused` mais antigos do mesmo tipo → marcados `substituido: true` no progresso
  quando um novo é enfileirado (via `enfileirarEscritaSeNovo`, `jobs.ts:795`), e a UI
  os ignora como estado vigente (mas preserva para auditoria).
- Jobs de **outros tipos** (`telemetria`, `qualidade_editorial`) nunca entram no cálculo
  do estado de **escrita** (filtro por `tipo`).
- Histórico preservado (nada é apagado); só a **autoridade** muda.

---

## 1.6 Escada de correção econômica (sem enfraquecer gates)

**Problema (S9):** 2 "coisa/coisas" residuais consumiram o ciclo completo
escritor→revisor→editor repetidas vezes (`livro_runner.py:2287–2348`). Caro e não
convergente para uma correção mecânica.

**Design — escalonar do barato ao caro, parando no primeiro que resolver:**

1. **Correção determinística segura** — substituição léxica guiada quando o blocker é
   muleta pontual (ex.: "coisa" → substantivo concreto do contexto), aplicada por
   regra, não por LLM, quando o mapeamento é seguro.
2. **Editor focado** nos trechos apontados (L35/L45), não no capítulo inteiro.
3. **Modelo pequeno/barato** para a correção mecânica (haiku), não opus.
4. **Recontagem determinística** — revalida por 1.1; gera **novo hash**.
5. **Revisor completo** só se o impacto for narrativo (não mecânico).
6. **Escritor completo** só para reescrita substancial.

**Invariantes (não negociáveis):** toda correção preserva sentido e voz; é recontada;
gera novo hash; **invalida a aprovação antiga se o texto mudou** (1.1); cria nova
decisão de qualidade; e **nunca aprova por timeout/orçamento esgotado**. A escada
**reduz custo**, não afrouxa o gate — o critério de aprovação segue o mesmo.

**[DECISÃO-AUTOR]** A escada roda **dentro do `livro_runner.py`** (protegido, guard
duplo) — implementá-la toca o runner. Alternativa de menor risco: um passo de correção
determinística no **worker** (TS) antes de reenfileirar, deixando o runner como está.
Recomendação: começar pelo passo (1) determinístico no worker (barato, sem tocar
runner) e medir quanto do problema ele já resolve, antes de mexer no runner.

---

## 1.7 Neutralidade de engine

O progresso e a proveniência registram, para Claude Code **e** para a engine hospedada,
os mesmos campos — alinhados aos shapes já definidos (spec-2.6):

- **`engine_calls`** (uma linha por chamada): `papel, provedor, modelo_solicitado,
  modelo_executado, tokens_in/out, custo_informado, tentativa, resultado,
  gate_posterior, quota_restante, hash_artefato`. O contrato de progresso **referencia**
  esse shape (não cria outro) para "engine/provedor/modelo/tentativa/fallback/cota/
  próximo retry/custo/resultado do gate".
- **`engine_chapter_provenance`** `(edition_id, numero, capitulo_hash)`: registro durável
  por capítulo com `capitulo_hash`, provedor/modelo do **escritor**, `call_ids`, custo.
  **É o análogo hosted do "sincronizado + aprovado hash-bound" do worker atual** — o
  contrato adota essa tabela como o ledger de proveniência **das duas engines** (a engine
  Claude Code passa a gravá-la também), com a mesma chave `capitulo_hash`.
- **Estados de pausa canônicos** (spec-2.3 §3): `paused_free_quota`,
  `paused_zero_cost_violation`, `blocked_quality`, falha técnica → são exatamente os
  níveis 2/4 da hierarquia 1.4.
- **`promote_publication` intacta:** a persistência incremental convive com a promoção
  atômica final (spec-2.6 reusa a mesma função).

**Regra:** nenhum conceito novo com nome diferente de um já existente. Onde o hosted já
nomeou (proveniência, calls, quota_state, estados de pausa), o contrato de progresso
usa o mesmo nome/shape.

---

## 1.8 UI (dashboard + página de escrita verdadeiros e acionáveis)

Tudo derivado do resolvedor único (1.4). **Nenhuma tela interpreta estado por conta
própria.**

- **Cartão do dashboard:** resumo verdadeiro — ex.: *"38 produzidos · 37 aprovados ·
  37 sincronizados · capítulo 38 em correção"*.
- **Página de escrita:** produzidos / aprovados / sincronizados / em correção +
  **blocker em linguagem humana** ("2 usos de 'coisa' no cap 38 — trocar pela coisa
  concreta") + último capítulo seguro + próxima ação + engine/provedor/modelo +
  situação de cota.
- **Mensagem principal SEMPRE traduzida.** O erro cru do runner ("time
  escritor→revisor→editor esgotou o orçamento…") vai para uma **área de diagnóstico**,
  nunca como mensagem principal. Mapa `job.erro`→humano centralizado (hoje vaza em
  `Projeto.tsx:55`, `NovoProjeto.tsx:87`, `Configuracoes.tsx:375`).
- **Botões contextuais ao estado real:** "Corrigir capítulo 38", "Ver diagnóstico",
  "Reconciliar aprovados"; **"Continuar a partir do 39" só aparece após o 38 aprovado**.
- **Linha do tempo operacional resumida:** produzido → gate → correção → recontagem →
  aprovação → sincronização → bloqueio → retomada.

---

## Decisões para você (consolidadas — resolver no PORTÃO 1)

1. **[DDL] Onde vive o estado durável por capítulo (1.1/1.2/1.7).** Recomendo:
   (a) colunas mínimas em `chapters` (`text_sha256`, `quality_status`, `approved_at`)
   para o estado sincronizado hash-bound; **e** (b) criar `engine_chapter_provenance`
   (do modelo hosted) como proveniência comum às duas engines. SQL proposto em
   `02-ddl-proposto.sql`. Alternativa mais enxuta: só (a), adiando a proveniência.
2. **[Escada de correção 1.6] Runner vs worker.** Recomendo começar pelo passo
   determinístico **no worker** (sem tocar o `livro_runner.py`), medir, e só então
   avaliar mover a escada para dentro do runner.
3. **[Persistência 1.2] Nível de garantia.** Worker-level (≤~20s + antes de todo
   throw) — recomendado e suficiente para o DoD — vs. runner-level (durável no instante
   da aprovação, mudança maior). Recomendo worker-level.

Ordem de implementação proposta (Fase 2): **1.2 sync incremental (S3)** → **1.3 merge
(S4)** → **1.1 modelo/resolver de capítulo (S2)** → **1.4/1.5 resolvedor único +
vigente×histórico (S7/S6)** → **1.6 escada (S9)** → **1.8 UI (S8)** → **1.7 neutralidade
(S10)**. Cada unidade: menor correção coerente + testes + regeneração do baseline pelo
caminho sancionado.
