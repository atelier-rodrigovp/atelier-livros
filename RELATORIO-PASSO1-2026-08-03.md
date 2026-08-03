# Relatório — PASSO 1: fechar os seis buracos e congelar o código (2026-08-03)

Execução das TAREFAS A–F com custo ZERO de modelo. Toda afirmação abaixo vem com
a saída do comando que a sustenta. O que não foi medido está marcado
**NÃO VERIFICADO**.

---

> ## CODIGO CONGELADO EM `bebac0e3574d55032a444597cb602ec4337f53a6`
>
> **O PASSO 2 deve provar ESTE commit.** `origin/master` está no mesmo SHA e o
> worker de produção executa exatamente este código.

---

## Placar das 6 tarefas

| # | Tarefa | Veredito | O que prova |
|---|---|---|---|
| A | Medidor de qualidade do LIVRO | ✅ **FECHADA** | 15 testes; prova negativa com 12 vermelhos ao remover o produtor |
| B | Quanto custa um livro | ✅ **FECHADA** | 10 testes (inclui integração com o molde) + 7 de renderização |
| C | CI cego para prova vencida | ✅ **FECHADA** | 11 testes; gate agora sai `exit 2` — comportamento esperado |
| D | Falso alarme de fim de linha | ✅ **FECHADA** | 6 testes; hash idêntico em LF, CRLF e CR |
| E | Dois documentos contraditórios | ✅ **FECHADA** | diff dos dois arquivos, coerentes |
| F | Trava de segurança religada | ✅ **FECHADA** | antes: 1 ativa · depois: 0 ativas |

**Regressão: 1744 testes / 137 arquivos / 0 falhas** (era 1700/133 — subiu 44, não caiu).

---

## F0 — Estado confirmado antes de agir

```
$ git rev-parse --abbrev-ref HEAD ; git rev-parse HEAD ; git rev-parse origin/master
master
ddb67acb90fdd94b5ea229ef740967dbcc4b35a3
ddb67acb90fdd94b5ea229ef740967dbcc4b35a3

$ git rev-list --count origin/master..HEAD ; git rev-list --count HEAD..origin/master
0
0
```

### Suíte baseline (antes de qualquer mudança)

```
 Test Files  133 passed (133)
      Tests  1700 passed (1700)
   Duration  122.65s
EXIT=0
```

### Os greps que comprovam os problemas

**A — nenhum produtor de PROVA_LITERARIA no repositório inteiro:**

```
$ grep -rn "PROVA_LITERARIA" worker src --include=*.ts | grep -v ".test."
worker/scripts/prontidao.ts:56:  | "PROVA_LITERARIA_APROVADA" | "PROVA_LITERARIA_REPROVADA" | "PROVA_LITERARIA_NAO_EXECUTADA"
worker/scripts/prontidao.ts:766:    prova_literaria: "PROVA_LITERARIA_NAO_EXECUTADA",
```

Duas ocorrências: a declaração do tipo e **uma string literal**. Zero produtores.

**C — o gate do CI nunca leu `.evidencias/`:**

```
$ grep -n "evidencia\|evidencias\|validarEvidencia\|fingerprint" worker/scripts/v2-verificar-release.ts
(NENHUMA mencao a evidencia externa — CEGO confirmado)
```

**D — `.gitattributes` protegia só a calibração:**

```
$ cat .gitattributes
# Corpus de calibração V2 é hash-bound (sha256 no manifesto): nunca converter EOL.
worker/calibration/** -text
```

Sintoma medido na hora: `worker/package-lock.json` aparecia como modificado em
`git status` com `git diff` **vazio** — divergência de bytes puramente de EOL.

**E — a contradição, literal:**

```
$ grep -n "REC-03" -A 12 worker/src/limitacoes-conhecidas.ts
40:    destrava:
41-      "reconhecer `não X, não Y, Z` sem conector aproxima o detector de enumeração legítima …
42-      "o limiar depende de amostra rotulada por humano",
```

```
$ cat calibracao-humana/README.md
# Rotulagem humana — fluxo encerrado
… rotulagem de ocorrências não é requisito da Engine V2, do laboratório, dos
canários, do certificado nem da escrita.
```

Contexto medido: `docs/engine-v2/investigacao-sanfona-hoover.md` linha 30 —
"precisão do detector na voz hoover ≈ 0–15% (0–2 sanfonas genuínas em 13)";
`calibracao-humana/rotulos.local.csv` com 779 linhas (778 + cabeçalho), todas as
justificativas ainda em `SUBSTITUIR POR JUSTIFICATIVA HUMANA ESPECÍFICA`.

---

## TAREFA A — o medidor de qualidade do livro

### O que existia e o que passou a existir

O sistema media a si mesmo em três níveis (fiação, mutação, regressão, migrações,
papéis) e **nada sobre o livro**. `prova_literaria` era uma constante.

- **A1 · produtor** — `worker/scripts/v2-prova-literaria.ts` (casca CLI) sobre
  `worker/src/v2/prova-literaria.ts#executarProvaLiteraria` (miolo testável).
  Consolida o manuscrito com o **mesmo** `consolidarManuscrito` da meta-nota — o
  mesmo texto que `capitulos-db.ts` sincroniza para o Storage — e avalia com
  `avaliarLivro`, que compila o pacote e executa o papel `revisor_literario` pelo
  caminho de provedor da V2, gravando no ledger. **Nenhuma segunda via.**
- **A2 · consumidor** — `prontidao.ts` lê `.prova-literaria/<project_id>.json` e
  deriva o estado, fail-closed.
- **A3 · a nota nunca é somada pelo modelo** — reusa `derivarNotaEFloor` e
  `atingiuMeta` de `meta9.ts`. O validador **recalcula** nota e piso e recusa o
  artefato se o gravado divergir.
- **A4 · testes de integração** — 15 testes em `prova-literaria.test.ts`.

Para não abrir uma segunda via, duas funções de `meta9.ts` passaram de privadas a
exportadas (`lerCapitulos`, `avaliarLivro`). Diff total em `meta9.ts`: **duas
palavras `export`**, nenhuma linha de lógica.

```
$ git diff --stat 928938d..HEAD -- worker/src/v2/meta9.ts   # (no commit final)
 worker/src/v2/meta9.ts | 4 ++--
```

### O artefato assinado

Contém, por exigência do enunciado: nota por dimensão (as 10, com evidência),
nota agregada, piso, relatório textual íntegro, `manuscrito_sha256` e
`tested_code_commit`.

### Fail-closed provado

| Situação | Estado derivado |
|---|---|
| artefato ausente | `NAO_EXECUTADA` |
| gerado em SHA ≠ HEAD | `NAO_EXECUTADA` |
| `manuscrito_sha256` ≠ manuscrito no disco | `NAO_EXECUTADA` |
| manuscrito inexistente no disco | `NAO_EXECUTADA` |
| nota adulterada à mão | inválido → `NAO_EXECUTADA` |
| válido, nota ≥ meta e piso ≥ 7 | `APROVADA` |
| válido, abaixo da meta | `REPROVADA` |

### Verde

```
$ npx vitest run src/v2/prova-literaria.test.ts
 ✓ src/v2/prova-literaria.test.ts (15 tests) 1246ms
 Test Files  1 passed (1)
      Tests  15 passed (15)
```

### PROVA NEGATIVA (DoD)

Produtor removido do módulo (arquivo truncado antes de
`executarProvaLiteraria`), teste executado:

```
$ head -251 src/v2/prova-literaria.ts > /tmp/sem-produtor.ts && cp /tmp/sem-produtor.ts src/v2/prova-literaria.ts
$ npx vitest run src/v2/prova-literaria.test.ts

   × executarProvaLiteraria (produtor) > avalia o livro pelo caminho de provedor da V2 e assina o artefato 107ms
   × executarProvaLiteraria (produtor) > reprova sem inflar: nota abaixo da meta sai REPROVADA, não arredondada 64ms
   × executarProvaLiteraria (produtor) > grava o artefato onde a prontidão o procura 70ms
   × a nota agregada sai do código, nunca do modelo > ignora a nota que o modelo tentar declarar e recalcula das dimensões 80ms
   × a nota agregada sai do código, nunca do modelo > artefato com nota adulterada é INVÁLIDO (o validador recalcula) 126ms
   × derivarEstadoProvaLiteraria (consumidor fail-closed) > gerada em SHA diferente do HEAD => NAO_EXECUTADA 111ms
   × derivarEstadoProvaLiteraria (consumidor fail-closed) > hash do manuscrito divergente => NAO_EXECUTADA (nota velha não vale para texto novo) 92ms
   × derivarEstadoProvaLiteraria (consumidor fail-closed) > manuscrito inexistente no disco => NAO_EXECUTADA 57ms
   × derivarEstadoProvaLiteraria (consumidor fail-closed) > artefato válido e aprovado => APROVADA 55ms
   × derivarEstadoProvaLiteraria (consumidor fail-closed) > artefato válido e abaixo da meta => REPROVADA (nunca some, nunca vira ausência) 51ms
   × derivarEstadoProvaLiteraria (consumidor fail-closed) > floor abaixo do mínimo reprova mesmo com média acima da meta 53ms
   × derivarEstadoProvaLiteraria (consumidor fail-closed) > o estado VARIA com a entrada (uma constante reprovaria este teste) 77ms
⎯⎯⎯⎯⎯⎯ Failed Tests 12 ⎯⎯⎯⎯⎯⎯⎯
```

**12 testes vermelhos.** Produtor restaurado e reconferido:

```
$ cp /tmp/prova-literaria.bak.ts src/v2/prova-literaria.ts
produtor restaurado na linha: 252:export async function executarProvaLiteraria(...)
$ npx vitest run src/v2/prova-literaria.test.ts
 ✓ src/v2/prova-literaria.test.ts (15 tests) 1246ms
      Tests  15 passed (15)
```

**Prova negativa do consumidor:** os dois testes que leem `prontidao.ts`
(`não grava mais o estado como string literal constante` e
`importa e usa o derivador do artefato`) estavam **vermelhos antes** de A2 —
saída registrada durante a implementação: `Tests  2 failed | 13 passed (15)`.
Voltar `prontidao.ts` à constante os derruba de novo.

---

## TAREFA B — quanto custa um livro

### B1 · tokens por papel e por capítulo

Achado que evitou trabalho duplicado: **o molde já instrumentava**.
`executarPapel` (`papeis.ts`) já chamava `concluirRun` com `tokens_in`/
`tokens_out`, e `engine_runs` já tem as colunas (`supabase/engine_v2.sql:54-55`).
Faltava **agregar**. Nenhuma DDL nova, nenhum call-site tocado.

`worker/src/v2/custo.ts` agrega por papel, por capítulo e por modelo. Decisões de
honestidade da medição, todas cobertas por teste:

- run **sem** medição de token não vira zero (não puxa a média para baixo) e é
  contado em `runs_sem_medicao`;
- run que **falhou** não conta como custo de capítulo produzido, mas aparece nos
  totais e em `runs_falhos` — consumiu cota;
- trabalho **fora de capítulo** (fundação, avaliação de livro) fica em
  `sem_capitulo`, sem diluir a média por capítulo;
- `capitulo:N` **e** `spec:N` são o mesmo capítulo — a ficha é trabalho gasto para
  produzi-lo, e deixá-la fora subestimaria o custo.

Persistência sem DDL, no padrão de `telemetria` / `qualidade_editorial`: linha
`jobs` `tipo='custo_v2'`, `status='paused'` (o picker nunca reivindica), gravada
no `finally` da rota V2 em `integracao.ts` — inclusive quando a execução falha.

### B2 · projeção rotulada

`projetarCustoLivro` = média **medida** por capítulo × `total_capitulos`. Calculada
**no worker** e não na tela, para não existirem duas réguas de custo. Devolve
`null` sem base medida ou sem total — nunca inventa denominador. O payload carrega
`natureza: "PROJECAO"` e a tela renderiza em bloco separado, com a base da conta à
vista ("média de X por capítulo × N capítulos, extrapolada de M medidos").

### B3 · `por_modelo` renderizado

`telemetria.ts` calculava e persistia `por_modelo` desde sempre e **nenhuma tela
mostrava**. Agora `<QuebraPorModelo>` renderiza no card de cada projeto.

### Verde

```
$ npx vitest run src/v2/custo.test.ts
 ✓ src/v2/custo.test.ts (10 tests) 24ms
      Tests  10 passed (10)

$ npx vitest run src/components/PainelCusto.test.tsx
 ✓ src/components/PainelCusto.test.tsx (7 tests) 59ms
      Tests  7 passed (7)
```

O teste de integração com o molde é o que trava a instrumentação:

```
o molde `executarPapel` registra tokens no ledger
  › um papel executado deixa tokens_in/tokens_out no run, e a agregação
    os encontra por papel e por capítulo
```

Ele executa dois papéis reais com `ProvedorMock`, lê os runs do disco e confere
`por_papel`, `por_capitulo` e `por_modelo`. Se alguém parar de instrumentar o
molde, fica vermelho.

### Números

**Nenhum número de custo real foi medido nesta sessão** — não houve execução V2 e
a tarefa é de custo zero. Os valores nos testes são fixtures. Marcação:

- valores dos testes: **FIXTURE**, não medição;
- `media_por_capitulo` no payload: **MEDIDO** (quando houver execução);
- `projecao.projetado`: **PROJETADO**, sempre.

---

## TAREFAS C e D

### C — o gate deixou de ser cego

`decidirGateReleaseCI` ganhou o campo opcional `evidencias` e um estado novo,
`EVIDENCIA_EXTERNA_VENCIDA`. Regras:

- evidência **presente e inválida** (vencida) → **reprova**, em qualquer modo,
  antes mesmo de olhar o certificado;
- evidência **ausente** → **não** reprova (é ausência de prova, esperada antes do
  pré-canário) — mesma semântica que a prontidão já usava;
- sem o campo `evidencias`, o comportamento antigo é preservado.

Reusa `validarEvidencia` via `avaliarEvidenciasExternas` — **não** há segunda régua.

```
$ npx vitest run src/v2/gate-release-ci.test.ts
 Test Files  1 passed (1)
      Tests  11 passed (11)
```

**O gate rodando no commit congelado — reprova, como o enunciado previu:**

```
$ npx tsx scripts/v2-verificar-release.ts --pre-canary
EVIDÊNCIA EXTERNA VENCIDA — o código mudou desde a verificação
- migracoes_remotas (testou 928938d): fingerprints.migrations_source_hash mudou desde a verificação · fingerprints.contratos_hash mudou desde a verificação · fingerprints.worker_hash mudou desde a verificação · fingerprints.interface_hash mudou desde a verificação
- integracao_real (testou 928938d): (idem)
- ui_autenticada (testou 928938d): (idem)
- provedor_real (testou 928938d): (idem)
- papeis_reais (testou 928938d): (idem)

Regenere as evidências com o harness contra o HEAD atual. Nenhum atalho:
prova que não vale mais para este código não certifica este código.
GATE_EXIT=2
```

Não contornei, não adicionei exceção, não fiz o gate ignorar o estado atual.

### D — hash determinístico

Escolha e justificativa: **normalizar EOL antes de hashear**, e não mexer no
`.gitattributes`.

- **Por que essa:** conserta a **causa no cálculo** e vale para os quatro campos
  de uma vez, independentemente do estado do checkout. As outras duas opções
  resolvem menos: `.gitattributes` não conserta checkouts já divergentes (e
  exigiria reescrever 4 `.sql`), e hashear o blob do git criaria dependência de
  repositório git num código que também roda em cópia solta.
- **Por que NÃO é reduzir rigor:** conteúdo diferente, nome diferente, arquivo a
  mais ou a menos continuam mudando o hash — todos com teste.

**Segundo defeito encontrado no mesmo cálculo, não previsto no enunciado:** o hash
misturava o **caminho ABSOLUTO** (`h.update(a)` com `a` absoluto), então o mesmo
código em outro diretório — worktree, clone, outra máquina — produzia outro hash.
Corrigido junto: a identidade passou a ser o caminho **relativo à raiz** com `/`.

A régua saiu de dentro de `scripts/prontidao.ts` (onde era privada) para
`worker/src/v2/fingerprints.ts`, porque o gate do CI precisa da mesma — era
exatamente por ela morar num script que o CI não conseguia enxergar prova vencida.

```
$ npx vitest run src/v2/fingerprints.test.ts
 ✓ src/v2/fingerprints.test.ts (6 tests) 175ms
      Tests  6 passed (6)
```

Testes: LF ≡ CRLF, LF ≡ CR, mudar uma linha muda, acrescentar arquivo muda,
renomear muda, e outra raiz **não** muda.

---

## TAREFA E — a contradição resolvida

Direção adotada: a recomendada — **os detectores são consultivos, quem decide é o
revisor-modelo** — e REC-03 passou a dizer **o que vale**, em vez de sumir.

Antes de escrever, verifiquei a afirmação no código (`worker/src/v2/tarefas.ts`,
`tarefaRevisor`, REGRA DOS SINAIS DE CONTAGEM, linha 140):

> "o NÚMERO do detector NUNCA confirma violação sozinho … preencha
> `ocorrencias_citadas` com o NÚMERO de CADA ocorrência que julgou defeito real …
> ocorrência não citada conta como falso positivo"

Ajustei minha redação depois de ler: é citação **por índice**, não transcrição
literal do trecho. O texto do relatório e dos dois arquivos reflete o código.

### Diff 1 — `worker/src/limitacoes-conhecidas.ts`

```diff
-// teste de caracterização e o `prontidao` a lista como bloqueio formal. Não
-// existe RELEASE_PRODUCAO_CERTIFICADO com limitação de recall em aberto.
+// teste de caracterização e o `prontidao` a reporta como NÃO COMPROVADA — que
+// não é bloqueio, é ausência de prova nomeada, item por item.
+
+// QUEM DECIDE (resolvido em 2026-08-03, PASSO 1):
+// os detectores de transparência são CONSULTIVOS. O número que eles produzem
+// NUNCA confirma violação sozinho — está escrito assim em `tarefas.ts`
+// (`tarefaRevisor`, REGRA DOS SINAIS DE CONTAGEM): para dispor
+// `violacao_confirmada` o revisor precisa citar, em `ocorrencias_citadas`, o
+// ÍNDICE de cada ocorrência que julgou defeito real; ocorrência não citada conta
+// como falso positivo, e citadas + `falsos_positivos` têm de fechar o valor
+// medido. Quem decide é o revisor-modelo, sobre o texto; o detector só aponta
+// onde olhar.
+
+// Isso está medido, não suposto: `docs/engine-v2/investigacao-sanfona-hoover.md`
+// mediu a precisão de `contarSanfona` na voz hoover em 0–15% …
+
+// Consequência para o recall: um falso NEGATIVO de detector consultivo não deixa
+// nada passar sozinho, porque não era ele que reprovava. Por isso REC-03 deixou
+// de depender de "amostra rotulada por humano" — esse fluxo está ENCERRADO
+// (`calibracao-humana/README.md`) e não é requisito de nada.

-  /** O que destrava a correção. */
+  /** O que passa a valer enquanto a limitação existe, e o que a destravaria. */

-    destrava:
-      "reconhecer `não X, não Y, Z` sem conector aproxima o detector de enumeração legítima …
-      "o limiar depende de amostra rotulada por humano",
+    destrava:
+      "O QUE VALE: o detector é consultivo — sanfona só reprova quando o revisor-modelo cita o ÍNDICE da ocorrência
+      em `ocorrencias_citadas` (tarefaRevisor, violacao_confirmada), então este falso negativo não deixa capítulo ruim passar sozinho.
+      O QUE DESTRAVARIA: … recalibrar exige processo separado (corpus automático versionado, precisão/recall, holdout)
+      ou decisão explícita do autor. NÃO depende de rotulagem humana: esse fluxo está encerrado (calibracao-humana/README.md).",
```

Correção colateral honesta: o cabeçalho afirmava que a prontidão lista a limitação
como "bloqueio formal". **É falso** — ela sai como `[N/COMPROV]` e entra em
`nao_comprovados`, não em `bloqueios`. Corrigido junto.

### Diff 2 — `calibracao-humana/README.md`

```diff
+## Nenhuma limitação de detector depende desta pasta
+
+Isto ficou dito em um lugar só e contradito em outro. Até 2026-08-03,
+`worker/src/limitacoes-conhecidas.ts` afirmava que o falso negativo REC-03 do
+detector `contarSanfona` destravava com "amostra rotulada por humano" — enquanto
+este README já declarava a rotulagem encerrada. As duas coisas não podiam ser
+verdade ao mesmo tempo, e a que estava errada era a primeira.
+
+- **Os detectores de transparência são CONSULTIVOS.** … `tarefaRevisor`
+  (REGRA DOS SINAIS DE CONTAGEM) exige que ele cite em `ocorrencias_citadas` o
+  índice de cada ocorrência julgada defeito real …
+- **Por isso um falso negativo de detector não deixa capítulo ruim passar**: não
+  era o detector que reprovava.
+- **Recalibrar detector não é trabalho de rotulagem humana.** Exige processo
+  separado — corpus automático versionado, precisão/recall e holdout — ou decisão
+  explícita do autor. A régua dos contratos 1.0.0 está congelada.
```

O detector `contarSanfona` **não foi tocado** — tarefa de documentação, como pedido.

---

## TAREFA F — trava religada

### ANTES

```json
[
  {
    "id": "8384035f-0308-4eb5-a81a-c485b6278d9d",
    "project_id": "8ba4cd11-7514-4f42-aeb1-c6f8544483a5",
    "modo": "producao",
    "autorizado_por": "rodrigo_vp@hotmail.com",
    "motivo": "Projeto exclusivo de prova do goal persistente; fluxo pré-canário sem prosa",
    "ativo": true,
    "created_at": "2026-07-29T19:23:48.946821+00:00",
    "revoked_at": null
  },
  {
    "id": "67d19ea0-a335-4a88-9000-937ec2a3c15c",
    "project_id": "5ac9d614-1d1c-4fbd-8376-a731d1945ac6",
    "modo": "producao",
    "autorizado_por": "rodrigo",
    "motivo": "Prova pre-canario D7-02: materializar documentos V2 no Storage e conferir hash. Sem geracao de prosa.",
    "ativo": false,
    "created_at": "2026-07-28T21:39:30.157164+00:00",
    "revoked_at": "2026-07-29T11:34:11.092682+00:00"
  }
]

=== ATIVAS: 1 ===

- 8384035f-0308-4eb5-a81a-c485b6278d9d
  projeto: 8ba4cd11-7514-4f42-aeb1-c6f8544483a5 (PROVA GOAL B50 — Fluxo sem canário · status rascunho)
  modo: producao · por: rodrigo_vp@hotmail.com
  criada: 2026-07-29T19:23:48.946821+00:00
  jobs em curso (running/queued): 0
```

Critério aplicado: revogar as que **não** são trabalho em curso. A única ativa
tinha **zero** jobs `running`/`queued` e o projeto está em `rascunho`.

### DEPOIS

```json
[
  {
    "id": "8384035f-0308-4eb5-a81a-c485b6278d9d",
    "project_id": "8ba4cd11-7514-4f42-aeb1-c6f8544483a5",
    "modo": "producao",
    "autorizado_por": "rodrigo_vp@hotmail.com",
    "motivo": "Projeto exclusivo de prova do goal persistente; fluxo pré-canário sem prosa",
    "ativo": false,
    "created_at": "2026-07-29T19:23:48.946821+00:00",
    "revoked_at": "2026-08-03T13:15:07.984+00:00"
  },
  {
    "id": "67d19ea0-a335-4a88-9000-937ec2a3c15c",
    "project_id": "5ac9d614-1d1c-4fbd-8376-a731d1945ac6",
    "modo": "producao",
    "autorizado_por": "rodrigo",
    "motivo": "Prova pre-canario D7-02: materializar documentos V2 no Storage e conferir hash. Sem geracao de prosa.",
    "ativo": false,
    "created_at": "2026-07-28T21:39:30.157164+00:00",
    "revoked_at": "2026-07-29T11:34:11.092682+00:00"
  }
]

=== ATIVAS: 0 ===
```

Linha **preservada** (revogada, não deletada) — as duas continuam no histórico com
`autorizado_por` e `motivo` intactos, como o trigger de imutabilidade exige.

---

## F6 — Congelamento

### Regressão obrigatória, completa

```
### npm test -- --run
 Test Files  137 passed (137)
      Tests  1744 passed (1744)
EXIT_TEST=0
### typecheck worker
EXIT_TYPECHECK=0
### build
EXIT_BUILD=0
### lint
✖ 3 problems (0 errors, 3 warnings)
EXIT_LINT=0
```

**1700 → 1744 testes. Não caiu.** Os 3 avisos de lint são os mesmos
pré-existentes (`react-refresh/only-export-components` em `CoverArt.tsx`,
`ui/badge.tsx`, `ui/button.tsx`).

### Commit único de fechamento

```
$ git log --oneline -1 ; git rev-parse HEAD
bebac0e feat(v2): o sistema passa a medir o LIVRO, o custo e a própria prova vencida
bebac0e3574d55032a444597cb602ec4337f53a6

$ git push origin master
   ddb67ac..bebac0e  master -> master

$ git rev-parse HEAD origin/master ; git rev-list --count origin/master..HEAD
bebac0e3574d55032a444597cb602ec4337f53a6
bebac0e3574d55032a444597cb602ec4337f53a6
0
```

21 arquivos, +2277/−101:

```
 .gitignore                             |   4 +
 calibracao-humana/README.md            |  27 +++
 src/components/PainelCusto.test.tsx    | 106 ++++++++++
 src/components/PainelCusto.tsx         | 185 ++++++++++++++++++
 src/lib/formato.ts                     |   7 +
 src/pages/Observabilidade.tsx          |  37 +++-
 worker/scripts/prontidao.ts            | 186 +++++++++++-------
 worker/scripts/v2-prova-literaria.ts   | 162 ++++++++++++++++
 worker/scripts/v2-verificar-release.ts |  27 ++-
 worker/src/limitacoes-conhecidas.ts    |  46 +++--
 worker/src/v2/custo-persistencia.ts    |  91 +++++++++
 worker/src/v2/custo.test.ts            | 230 ++++++++++++++++++++++
 worker/src/v2/custo.ts                 | 187 ++++++++++++++++++
 worker/src/v2/fingerprints.test.ts     | 103 ++++++++++
 worker/src/v2/fingerprints.ts          | 140 +++++++++++++
 worker/src/v2/gate-release-ci.test.ts  | 101 ++++++++++
 worker/src/v2/gate-release-ci.ts       |  33 ++++
 worker/src/v2/integracao.ts            |  28 ++-
 worker/src/v2/meta9.ts                 |   4 +-
 worker/src/v2/prova-literaria.test.ts  | 345 +++++++++++++++++++++++++++++++++
 worker/src/v2/prova-literaria.ts       | 329 +++++++++++++++++++++++++++++++
 21 files changed, 2277 insertions(+), 101 deletions(-)
```

### Worker de produção no código congelado

```
$ tail -1 worker/worker.log
[2026-08-03T13:33:58.353Z] [worker pc-rodrigo] código: bebac0e (worktree limpa) — início 2026-08-03T13:33:47.725Z
```

### Deploy

```
$ gh run view 30817503253 --json conclusion,status,headSha
deploy: conclusion=success status=completed sha=bebac0e3574d55032a444597cb602ec4337f53a6
```

### Prontidão regenerada no commit congelado

```
$ node -e "const r=require('./.prontidao/prontidao.json'); …"
head: bebac0e3574d55032a444597cb602ec4337f53a6
gerado_em: 2026-08-03T13:41:23.552Z
versao_worker: {"ok":true,"evidencia":"worker roda o código do repositório (bebac0e)"}
bloqueios: 5 | nao_comprovados: 5
EXIT_PRONTIDAO=1
```

`head` == HEAD == commit congelado. ✅

**A seção nova, que antes não existia:**

```
--- PROVA LITERÁRIA (qualidade do LIVRO, não do sistema) ---
  [N/COMPROV] prova literária (qualidade do LIVRO) — nenhuma prova em .prova-literaria/ —
              gere com `npx tsx scripts/v2-prova-literaria.ts <project_id>`
```

```json
"prova_literaria": {
  "estado": "PROVA_LITERARIA_NAO_EXECUTADA",
  "itens": [
    {
      "item": "prova literária (qualidade do LIVRO)",
      "ok": null,
      "evidencia": "nenhuma prova em .prova-literaria/ — gere com `npx tsx scripts/v2-prova-literaria.ts <project_id>`"
    }
  ]
}
```

O estado continua `NAO_EXECUTADA` — mas agora **porque a pasta está vazia**, e não
porque a string estava escrita no código. É a mesma palavra com significado
oposto: antes era constante, agora é derivação com motivo nomeado. Basta gerar uma
prova para o estado virar `APROVADA` ou `REPROVADA`.

**Estados formais completos:**

```
=== ESTADOS FORMAIS ===
  implementacao_local IMPLEMENTACAO_LOCAL_APROVADA
  regressao_local     REGRESSAO_LOCAL_APROVADA
  integracao_mock     INTEGRACAO_MOCK_APROVADA
  acuracia            CORPUS_AUTOMATICO_PRONTO_PARA_LAB
  migracoes_remotas   MIGRACOES_REMOTAS_NAO_COMPROVADAS
  integracao_real     INTEGRACAO_REAL_NAO_COMPROVADA
  ui_autenticada      UI_AUTENTICADA_NAO_COMPROVADA
  provedor_real       PROVEDOR_REAL_NAO_COMPROVADO
  papeis_reais        PAPEIS_REAIS_NAO_COMPROVADOS
  pre_canary          PRE_CANARY_BLOQUEADO: MIGRACOES_REMOTAS, INTEGRACAO_REAL, DOWNLOAD_AUTENTICADO, PROVEDOR_REAL, ONZE_PAPEIS_E_CASCATA_REAL
  release_producao    RELEASE_PRODUCAO_BLOQUEADO: MIGRACOES_REMOTAS, INTEGRACAO_REAL, DOWNLOAD_AUTENTICADO, PROVEDOR_REAL, ONZE_PAPEIS_E_CASCATA_REAL, CERTIFICADO_RELEASE
  canarios_novos      BLOQUEADOS: MIGRACOES_REMOTAS, INTEGRACAO_REAL, DOWNLOAD_AUTENTICADO, PROVEDOR_REAL, ONZE_PAPEIS_E_CASCATA_REAL
  projeto             PROJETO_NAO_AUTORIZADO (por projeto; consulte engine_autorizacoes_v2)
  prova_literaria     PROVA_LITERARIA_NAO_EXECUTADA

Bloqueios: 5 · Não comprovados: 5
Duração: 276.3s
```

Os 5 bloqueios são as evidências externas vencidas — **exatamente o que o PASSO 2
resolve**, e o mesmo motivo pelo qual o gate do CI agora reprova. O estado não
melhorou nem piorou em relação à Onda 1; o que mudou é que agora **duas** portas
enxergam a caducidade (prontidão e CI), em vez de uma.

Regressão de interface dentro da prontidão registra os testes novos:
`interface — componentes RENDERIZADOS (src/components) — 53 passaram` (era 46).

---

## O que ficou pior ou não fechou

Esta seção existe para não fechar fase em silêncio.

### 1. O CI vai reprovar até o PASSO 2 — e isso é o comportamento correto

Consequência direta e declarada da TAREFA C. O gate sai `exit 2` com
`EVIDENCIA_EXTERNA_VENCIDA`.

**Não houve merge com CI vermelho**, porque não houve merge nem CI: `ci.yml` roda
em `pull_request` para `master` e em `push` para `codex/**`; este fechamento foi
push direto no `master`, que dispara só o `deploy.yml`. Verificado:

```
$ gh run list --workflow ci.yml --limit 3
completed  success  Lote pré-canário …  CI  codex/pre-canary-ready  pull_request  30812620772  2026-08-03T12:12:23Z
completed  success  fix(engine-v2): pause cleanly on weekly quota  CI  codex/pre-canary-ready  push  30716375606  2026-08-01T20:10:00Z
completed  success  fix(engine-v2): canonicalize cascade signal names  CI  codex/pre-canary-ready  push  30716039895  2026-08-01T20:00:53Z
```

**Decisão pendente do autor:** o próximo PR para `master` vai reprovar por este
motivo até o PASSO 2 regenerar as evidências. Não contornei — o enunciado mandava
registrar e perguntar. **Pergunta:** manter assim (recomendado: o gate está certo)
ou o PASSO 2 vem antes de qualquer PR?

### 2. Mudar o algoritmo do hash invalidou o `contratos_hash` como prova independente

**Esta é uma piora real que eu introduzi.** No relatório da Onda 1,
`contratos_hash` batia idêntico (`57f28413d35eb76c`) e servia como prova de que
nenhum `contrato.json` fora tocado. Como a TAREFA D trocou o algoritmo (EOL
normalizado + caminho relativo), **todos os quatro hashes mudaram de valor**, e
essa comparação direta não vale mais.

Reconferi por outro caminho, e os contratos seguem intocados:

```
$ git diff --stat 928938d..HEAD -- 'worker/skills-v2/**/contrato.json'
(vazio = intocados no git)
$ git status --short worker/skills-v2/
(vazio = intocados no disco)
$ ls worker/skills-v2/*/contrato.json
worker/skills-v2/dan-brown/contrato.json
worker/skills-v2/hoover-mcfadden/contrato.json
worker/skills-v2/romantasy/contrato.json
```

Efeito prático: nenhum, porque as cinco evidências já estavam inválidas nos outros
três campos. Mas a partir do PASSO 2 os hashes novos passam a ser a linha de base.

### 3. Lint subiu para 4 avisos no meio do caminho — e voltou para 3

Ao exportar `fmtTok` de um componente, criei um aviso novo
(`react-refresh/only-export-components`). Movi o formatador para
`src/lib/formato.ts` e o lint voltou ao baseline de 3. Registrado porque foi uma
piora real, ainda que revertida na mesma sessão.

### 4. O que NÃO foi executado (custo de modelo)

- **`v2-prova-literaria.ts` nunca rodou contra modelo real.** Está coberto por 15
  testes com `ProvedorMock`, compila e passa no typecheck, mas a execução real
  contra um livro **NÃO FOI VERIFICADA** — consumiria cota, o que a tarefa proíbe.
  O modo ensaio (sem `--confirmar`) existe para o autor conferir sem gastar.
- **Nenhum número de custo real foi medido.** `custo_v2` só terá conteúdo depois
  da próxima execução V2. Todos os números de custo neste relatório são
  **FIXTURE**, não medição.
- **As evidências externas não foram regeneradas** — é o PASSO 2, custa cota.

### 5. Dívida deixada de propósito

- **`.gitattributes` não foi alterado.** A normalização no hash resolve o problema
  do gate por completo, mas o working tree continua divergindo do blob em 4 `.sql`
  e no `package-lock.json` (EOL). Não incomoda o gate; incomoda quem olhar
  `git status` e vir arquivo "modificado" com `git diff` vazio. Mexer nisso exige
  renormalizar arquivos de migração — decisão do autor.
- **`.prova-literaria/` entrou no `.gitignore`** pela mesma razão de
  `.evidencias/`: o remoto é público e a prova carrega `project_id`, sha256 do
  manuscrito e o relatório editorial do livro.

### 6. Fronteiras — nada tocado

Nenhum `meta_nota`, `max_reescritas`, limiar, cota ou `contrato.json` foi alterado
(conferido por git acima). Nenhuma cota de modelo gasta. Nenhum livro antigo
migrado, hidratado ou "salvo". Nenhum job de escrita criado. Nenhum teste marcado
como `skip` ou afrouxado.
