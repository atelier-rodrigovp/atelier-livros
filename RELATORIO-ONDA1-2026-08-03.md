# Relatório — Onda 1: desencalhar a entrega (2026-08-03)

Execução do PROMPT 1 do plano de auditoria. Toda afirmação abaixo está colada da
saída do comando que a sustenta. O que não foi medido está marcado
**NÃO VERIFICADO** e nomeado.

---

## Correções ao contexto factual recebido

O prompt pedia para confirmar os fatos antes de agir. **Dois estavam errados** e
mudaram o escopo da entrega.

| Afirmação do prompt | Medido | Veredito |
|---|---|---|
| HEAD em `codex/pre-canary-ready` @ `90bc032` | idem | ✅ confere |
| `master` **e** `origin/master` em `e905030` | `master` = `e905030`; `origin/master` = **`2cc31c3`** | ❌ **errado** |
| `master..HEAD` = 20 commits, 111 arquivos, +4396/−1158 | idem | ✅ confere |
| `HEAD..master` = 0 | idem | ✅ confere |
| `deploy.yml` só em push no master, ignora `worker/**` e `*.md` | idem | ✅ confere |
| `.prontidao/prontidao.json` head=`928938d`, "dois commits atrás" | head=`928938d`, **três** commits atrás | ⚠️ parcial |
| `bloqueios_producao` = `["CERTIFICADO_RELEASE"]` | idem | ✅ confere |

**Consequência:** `origin/master` estava 10 commits atrás do `master` local. O lote
real a entregar não era de 20 commits, mas de **30** — os 20 da branch mais 10 que
nunca tinham sido empurrados (`f59b61b`…`e905030`, a fila de custo e a cascata de
julgamento). O diffstat do lote entregue é **125 arquivos, +7489/−1346**, não
111/+4396/−1158.

```
$ git rev-parse HEAD; git rev-parse master; git rev-parse origin/master
90bc032ac68d4e2d4bb6a1772497ef9ad99ae088
e90503058cbc7dbca8c4ac4441827ec6a9e931ec
2cc31c3be71ebb1cc63a617dd32111e97be07d90

$ git rev-list --count master..HEAD ; git rev-list --count HEAD..master ; git rev-list --count origin/master..HEAD
20
0
30

$ git diff --shortstat master..HEAD
 111 files changed, 4396 insertions(+), 1158 deletions(-)

$ git diff --shortstat origin/master..HEAD
 125 files changed, 7489 insertions(+), 1346 deletions(-)
```

O `master` local era ancestral do HEAD, então o lote é uma linha reta — sem rebase,
sem conflito:

```
$ git merge-base --is-ancestor master HEAD && echo SIM
SIM
$ git merge-base --is-ancestor origin/master HEAD && echo SIM
SIM
```

---

## F1 — Diagnóstico

### Os 30 commits do lote

```
$ git log --oneline origin/master..HEAD
90bc032 fix(engine-v2): pause cleanly on weekly quota
939fb20 fix(engine-v2): canonicalize cascade signal names
4d06733 fix(engine-v2): close autonomous judgment loop
928938d fix(engine-v2): publish cadence pair evidence
aa74ce2 feat(engine-v2): remove manual review gates
1dc5171 fix(v2): reconhecer aliases Claude no ledger
4525a49 fix(ui): confirmar inicio de downloads
a975cc1 fix(ui): baixar mesmo sem suporte a popups
23759b6 fix(ui): abrir downloads assinados no gesto do clique
91215ad fix(v2): fechar contagem no delta da cascata
2006633 feat(v2): gate pre-canary on real role evidence
0f6a5c1 fix(v2): provar documentos completos e evitar cache vencido
9f1759b fix(v2): tornar fundacao retomavel e auditavel
eb7da02 fix(v2): representar convergencia de fios na fundacao
3a5ab6c fix(v2): separar fundacao pre-canario do release
b50f90e fix(worker): preservar estado real no heartbeat
0d56126 fix(v2): entrevistar antes de qualquer prosa
ba225cb fix(v2): separar pre-canario e provar schema remoto
d022df4 feat(v2): conectar gates literarios e revalidacao transitiva
bd19770 feat(v2): exigir aprovacao explicita antes da fundacao
e905030 docs(v2): worker religado no código atual, e o carimbo provado nos dois casos
1546906 feat: divergência entre o código do worker e o do repositório vira bloqueio
aae0b83 test(v2): regressão inteira da fila de custo, e a projeção dita como projeção
95a5625 perf(v2): pins de modelo por papel, e o worker passa a dizer que código tem
1cba687 feat(v2): cascata de julgamento — a decisão cara julga nos dois sentidos
d9348ff fix(v2): duração medida no spawn e 11 runs órfãos encerrados (A1)
a2d59d1 docs(v2): a regra de timeout passa a medir trabalho, não timeout
83a3ccc perf(v2): esforço e timeout viram propriedade declarada de cada papel
63c1e25 perf(v2): o revisor cita a ocorrência por índice, e o sistema hidrata ao gravar
f59b61b perf(v2): falha de formato do revisor deixa de custar um retry inteiro
```

### `deploy.yml` — gatilho confirmado

`.github/workflows/deploy.yml` (linhas 4–11):

```yaml
on:
  push:
    branches: [master]
    paths-ignore:
      - "worker/**"
      - "**/*.md"
  workflow_dispatch: {}
```

O lote toca **33 arquivos fora de `worker/` e fora de `*.md`** — logo o deploy
dispara mesmo com o `paths-ignore`:

```
$ git diff --name-only origin/master..HEAD | grep -v '^worker/' | grep -v '\.md$' | wc -l
33
```

(entre eles `src/pages/Projeto.tsx`, `src/pages/NovoProjeto.tsx`,
`src/components/EngineV2Panel.tsx`, `src/lib/*.ts`, `supabase/engine_v2_fluxo.sql`)

### `.prontidao/prontidao.json` antes da execução

```json
"head": "928938d5449aceb16a5dde8a148bf4e626b0f78c",
"gerado_em": "2026-08-01T18:48:23.860Z",
"bloqueios_producao": ["CERTIFICADO_RELEASE"],
"bloqueios": [],
"versao_worker": { "ok": true, "evidencia": "worker roda o código do repositório (928938d)" }
```

`928938d` é o **quarto** commit a partir do topo da branch (`90bc032` → `939fb20`
→ `4d06733` → `928938d`), ou seja três commits atrás — não dois.

---

## Regressão obrigatória (antes do merge)

Rodada na raiz, na ordem exigida. **Todos verdes.**

```
### npm test -- --run
 Test Files  133 passed (133)
      Tests  1700 passed (1700)
   Duration  91.05s
EXIT_TEST=0

### npm run typecheck --prefix worker
> tsc --noEmit
EXIT_TYPECHECK=0

### npm run build
> tsc -b && vite build
✓ 2539 modules transformed.
dist/assets/index-cIl1CyWr.js   1,311.75 kB │ gzip: 371.20 kB
✓ built in 11.36s
EXIT_BUILD=0

### npm run lint
> eslint .
✖ 3 problems (0 errors, 3 warnings)
EXIT_LINT=0
```

Os 3 warnings são pré-existentes e não bloqueiam (`react-refresh/only-export-components`
em `CoverArt.tsx`, `ui/badge.tsx`, `ui/button.tsx`). Estão reportados, não escondidos.

---

## F2 — PR e CI

**Ação irreversível nomeada nº 1:** push da branch `codex/pre-canary-ready` para
`origin`. Resultado: `Everything up-to-date` — a branch já estava publicada em
`90bc032`, nada novo foi exposto.

**Ação irreversível nomeada nº 2:** abertura de PR público para `master`.

**PR #5:** https://github.com/atelier-rodrigovp/atelier-livros/pull/5

CI verde no run do PR:

```
$ gh run view 30812620772 --json conclusion,status,headSha
conclusion=success status=completed sha=90bc032ac68d4e2d4bb6a1772497ef9ad99ae088
url=https://github.com/atelier-rodrigovp/atelier-livros/actions/runs/30812620772

$ gh pr checks 5
validar	pass	1m24s	.../actions/runs/30812620772/job/91682670694
```

O passo que mais importa — o gate da Engine V2 — passou **preservando o bloqueio**,
não afrouxando nada:

```
Gate da Engine V2 (pré-canário ou release certificada)
  PRE-CANÁRIO: DEPLOY TÉCNICO APROVADO
  deploy técnico pré-canário permitido; release literária permanece fail-closed até certificado válido
  - bloqueio preservado: certificado não encontrado em .../worker/release/engine-v2.json
```

---

## F3 — Merge e deploy

**Ação irreversível nomeada nº 3:** merge do PR #5 em `master` (merge commit,
`--no-ff` — 30 commits + 1 merge commit empurrados para `origin/master`), o que
dispara o deploy público no GitHub Pages.

```
$ gh pr view 5 --json state,mergedAt,mergeCommit
state=MERGED mergedAt=2026-08-03T12:14:32Z mergeCommit=cf801cfb85e84036c5460596c8ba81fb8b0c6fea

$ git fetch origin
   2cc31c3..cf801cf  master     -> origin/master

$ git log --oneline -3 origin/master
cf801cf Merge PR #5: lote pré-canário (30 commits) — Engine V2 pronta para canário, fila de custo e cascata de julgamento
90bc032 fix(engine-v2): pause cleanly on weekly quota
939fb20 fix(engine-v2): canonicalize cascade signal names
```

### OBJETIVO (1) — `origin/master` contém os commits

```
$ git rev-list --count origin/master..HEAD
0
$ git rev-parse HEAD origin/master master
cf801cfb85e84036c5460596c8ba81fb8b0c6fea
cf801cfb85e84036c5460596c8ba81fb8b0c6fea
cf801cfb85e84036c5460596c8ba81fb8b0c6fea
```

`master` local, `origin/master` e o checkout de trabalho estão no **mesmo commit**.
A árvore do merge commit é idêntica à de `90bc032` (merge de linha reta, nenhum
código alterado pelo merge):

```
$ git rev-parse cf801cf^{tree} ; git rev-parse 90bc032^{tree}
b08af7017aa4a9f508be4f7d7fd7f30f3b72832b
b08af7017aa4a9f508be4f7d7fd7f30f3b72832b
```

### OBJETIVO (3) — deploy rodou e o gh-pages tem o build novo

```
$ gh run view 30812781240 --json conclusion,status,headSha
conclusion=success status=completed sha=cf801cfb85e84036c5460596c8ba81fb8b0c6fea
url=https://github.com/atelier-rodrigovp/atelier-livros/actions/runs/30812781240

$ git log -1 --format='%H%n%ad%n%s' --date=iso origin/gh-pages
f954bddf4f8df4750d9cb0a45f7552c5f3513044
2026-08-03 12:15:10 +0000
deploy: cf801cfb85e84036c5460596c8ba81fb8b0c6fea
```

O commit do `gh-pages` **nomeia o SHA do merge**. Bundle publicado e servido ao vivo:

```
$ git ls-tree --name-only origin/gh-pages assets/ | grep -E "\.(js|css)$"
assets/index-B5U8lFXw.css
assets/index-DSK0B4QS.js

$ curl -sS -o /dev/null -w "HTTP %{http_code}\n" https://atelier-rodrigovp.github.io/atelier-livros/
HTTP 200

$ curl -sS https://atelier-rodrigovp.github.io/atelier-livros/ | grep assets
    <script type="module" crossorigin src="/atelier-livros/assets/index-DSK0B4QS.js"></script>
    <link rel="stylesheet" crossorigin href="/atelier-livros/assets/index-B5U8lFXw.css">
```

O hash do bundle publicado (`index-DSK0B4QS.js`) difere do build local
(`index-cIl1CyWr.js`) porque o CI compila com `GHPAGES=1` e injeta
`VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` — build de produção, não o local.

---

## F4 — Worker de produção no código novo

**Ação irreversível nomeada nº 4:** parada forçada e reinício do worker de produção.

Estado antes: worker no ar desde 2026-08-01, carimbando `90bc032` — o SHA da branch,
não o do `master` recém-mergeado.

```
$ Get-CimInstance Win32_Process -Filter "Name='node.exe'" | ? { $_.CommandLine -match 'index\.ts' }
ProcessId CreationDate
    17972 01/08/2026 17:11:39
```

Verificado antes de matar que **nenhum job estava em execução** (nada foi
interrompido no meio):

```
RUNNING: []
```

Dependências reinstaladas e processo derrubado com o procedimento documentado
(`Stop-Process -Force` no PID do node — `Stop-ScheduledTask` não mata o filho):

```
$ npm install --prefix worker
up to date, audited 17 packages in 3s
found 0 vulnerabilities

$ ... | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }
matando PID 17972
```

O wrapper supervisor (`worker-wrapper.cmd`, PID 20832) reiniciou o worker sozinho
— não foi preciso `Start-ScheduledTask`:

```
$ Get-CimInstance Win32_Process ... (33s depois)
ProcessId CreationDate
    19320 03/08/2026 09:17:00
```

### DoD — `worker.log` com PID novo e reconexão

```
[2026-08-03T12:17:04.109Z] [worker pc-rodrigo] conectado. owner=c149a482-41ec-446d-a9cb-583d38bcac44 poll=5000ms stale=15min
[2026-08-03T12:17:04.109Z] [worker pc-rodrigo] código: cf801cf (worktree limpa) — início 2026-08-03T12:17:01.800Z
```

### OBJETIVO (5) — heartbeat no banco

```json
{
  "worker_id": "pc-rodrigo",
  "status": {
    "codigo": {
      "sha": "cf801cfb85e84036c5460596c8ba81fb8b0c6fea",
      "sujo": false,
      "sujos": [],
      "iniciadoEm": "2026-08-03T12:17:01.800Z"
    },
    "estado": "online"
  },
  "last_seen": "2026-08-03T12:17:34.13+00:00"
}
```

`sha` do heartbeat == HEAD do repositório == `cf801cf`, worktree limpa. Os arquivos
modificados que restam no working tree estão em `worker/autostart/`, fora de
`CAMINHOS_DO_WORKER` (`worker/src`, `worker/scripts`, `worker/skills-v2`), por isso
não sujam o carimbo.

---

## F5 — Prontidão regenerada

`npm run prontidao` rodou contra o HEAD novo. **Saiu com `exit 1`: 5 bloqueios.**
O objetivo (4) pedia o arquivo regenerado com `head == HEAD atual` e os estados
formais impressos — isso foi cumprido. Mas os estados **não são verdes**, e o
`pre_canary` **regrediu**. Reporto o resultado real, não o desejado.

```
$ node -e "const r=require('./.prontidao/prontidao.json'); ..."
head: cf801cfb85e84036c5460596c8ba81fb8b0c6fea
gerado_em: 2026-08-03T12:23:18.475Z
duracao_ms: 307926
versao_worker: {"ok":true,"evidencia":"worker roda o código do repositório (cf801cf)"}
bloqueios_producao: ["MIGRACOES_REMOTAS","INTEGRACAO_REAL","DOWNLOAD_AUTENTICADO","PROVEDOR_REAL","ONZE_PAPEIS_E_CASCATA_REAL","CERTIFICADO_RELEASE"]
bloqueios: 5
EXIT_PRONTIDAO=1
```

`head` == `cf801cf` == HEAD atual. ✅ Objetivo (4), parte do arquivo.

### Conjunto completo de estados formais

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

Bloqueios: 5 · Não comprovados: 4
Duração: 307.9s
```

### Tudo que é local continua verde

```
--- REGRESSÃO LOCAL (DoD completa) ---
  [OK  ] suíte completa a partir da RAIZ (inclui interface) — 1700 passaram, 0 falharam, 0 pulados
  [OK  ] suíte completa a partir de `worker/` (independência de cwd) — 1474 passaram, 0 falharam, 0 pulados
  [OK  ] typecheck (raiz) — tsc -b sem erros
  [OK  ] typecheck (worker) — tsc --noEmit sem erros
  [OK  ] build de produção — tsc -b && vite build concluído
  [OK  ] lint (zero erros) — 0 erro(s), 3 aviso(s)
  [OK  ] SQL/RLS local — 83 passaram, 0 falharam
  [OK  ] ciclo determinístico com ProvedorMock — 22 passaram, 0 falharam
  [OK  ] interface — logica (src/lib) — 172 passaram, 0 falharam
  [OK  ] interface — componentes RENDERIZADOS (src/components) — 46 passaram, 0 falharam
  [OK  ] interface — paginas/rotas (src/pages) — 8 passaram, 0 falharam

--- CÓDIGO EM EXECUÇÃO ---
  [OK  ] código do worker no ar × HEAD do repositório — worker roda o código do repositório (cf801cf)
```

### OBJETIVO (5) — `versao_worker` ok:true

```json
"versao_worker": {
  "item": "código do worker no ar × HEAD do repositório",
  "ok": true,
  "evidencia": "worker roda o código do repositório (cf801cf)"
}
```

✅ Cumprido.

### O que reprovou: as 5 evidências externas caducaram

```
--- VERIFICAÇÃO EXTERNA (fora do alcance desta máquina) ---
  [FALHA] migrações aplicadas e verificadas no banco real — fingerprints.migrations_source_hash mudou desde a verificação · fingerprints.worker_hash mudou desde a verificação · fingerprints.interface_hash mudou desde a verificação
  [FALHA] fluxo real interface → worker → Storage com download conferido — (idem)
  [FALHA] interface autenticada: abertura e download dos documentos V2 — (idem)
  [FALHA] smoke do provedor real (sem escrita literária) — (idem)
  [FALHA] 11 papéis com modelo real e cascata em duas passadas — (idem)
```

**Isto não é regressão causada por esta execução.** É o gate fazendo o trabalho
dele: as cinco evidências foram carimbadas contra `928938d` e nunca foram
regeradas depois dos três commits seguintes.

```
$ node -e "... tested_code_commit de cada evidência ..."
migracoes_remotas    tested_code_commit= 928938d…  verificado_em= 2026-08-01T18:43:59.668Z
integracao_real      tested_code_commit= 928938d…  verificado_em= 2026-08-01T18:43:55.851Z
ui_autenticada       tested_code_commit= 928938d…  verificado_em= 2026-08-01T18:44:02.348Z
provedor_real        tested_code_commit= 928938d…  verificado_em= 2026-08-01T18:43:53.094Z
papeis_reais         tested_code_commit= 928938d…  verificado_em= 2026-08-01T18:43:48.467Z
```

O `.prontidao/prontidao.json` anterior dizia `PRE_CANARY_READY` **porque tinha sido
gerado em `928938d`** — o mesmo commit das evidências. Os três commits seguintes
(`4d06733`, `939fb20`, `90bc032`) mexeram em `worker/src/**` e `src/**` e nunca
tiveram a prontidão regerada. Regenerar contra o HEAD real expôs isso:

```
$ git diff --stat 928938d..cf801cf
 src/components/EngineV2Panel.tsx        |  2 +-
 src/lib/resolveOperationalState.ts      | 20 +++----
 worker/src/limite-max.ts                |  2 +-
 worker/src/v2/cascata.ts                | 37 ++++++++++--
 worker/src/v2/conformidade.ts           | 11 ++--
 worker/src/v2/papeis.ts                 | 14 ++++-
 worker/src/v2/pipeline.ts               | 75 +++++++++++++++----------
 worker/src/v2/tarefas.ts                | 16 +++---
 (+ testes e docs) — 17 arquivos, 369 inserções, 72 remoções
```

`worker_hash` e `interface_hash` mudaram **por motivo legítimo**: o código mudou.

### Achado colateral: `migrations_source_hash` caduca sem mudança de SQL

Recalculei as quatro fingerprints com o mesmo algoritmo de `prontidao.ts`
(`fingerprintsAtuais`, linhas 588–596) e comparei com as gravadas:

```
chave                    gravada            atual              veredito
migrations_source_hash   f5fb064c45e20f9c   b41950bfcd2989bd   MUDOU
contratos_hash           57f28413d35eb76c   57f28413d35eb76c   IGUAL
worker_hash              f3d143ec8ef91925   859eba36da556d15   MUDOU
interface_hash           5a011b11544ec251   73069314359b19c9   MUDOU
```

`contratos_hash` **IGUAL** — prova independente de que nenhum `contrato.json` foi
tocado nesta entrega.

Mas `migrations_source_hash` mudou **sem que nenhum `.sql` mudasse no git**:

```
$ git diff --stat 928938d..cf801cf -- supabase/
(vazio)
$ git status --short supabase/
(vazio)
$ git log -1 --format='%h %ad' --date=iso -- 'supabase/*.sql'
9f1759b 2026-07-31 13:51:18 -0300   (anterior a 928938d)
```

A causa é que `fingerprintsAtuais` hasheia os **bytes em disco** (`readFileSync`),
e o disco divergiu do blob do git por fim de linha. Quatro dos onze `.sql` têm
bytes diferentes do que o git versiona, sem aparecer em `git status`:

```
supabase/authors.sql                 disco=3abfee31 blob=3abfee31
supabase/engine_v2.sql               disco=56837ccc blob=186be7f0   <-- diverge
supabase/engine_v2_autorizacoes.sql  disco=1d49638d blob=1d49638d
supabase/engine_v2_fluxo.sql         disco=202be4b2 blob=31ef5a32   <-- diverge
supabase/engine_v2_historico.sql     disco=a1d9cdf3 blob=a1d9cdf3
supabase/policies.sql                disco=5730f041 blob=5730f041
supabase/producao.sql                disco=bda79926 blob=bda79926
supabase/reliability.sql             disco=2ef13ac7 blob=11c5e948   <-- diverge
supabase/schema.sql                  disco=aeb882fc blob=3ad71d89   <-- diverge
supabase/social_posts.sql            disco=ba594de7 blob=ba594de7
supabase/storage.sql                 disco=520ea22c blob=520ea22c
```

**Consequência para o autor:** a evidência externa pode caducar por normalização de
CRLF num `git checkout`, sem que uma linha de SQL tenha mudado — falso positivo do
gate. Não consertei: mexer no gate seria afrouxar rigor, e isso é decisão do autor.
Fica registrado como dívida.

### Por que o CI passou e a prontidão local reprova

Não é contradição — são gates diferentes. O CI roda
`v2-verificar-release.ts --pre-canary`, que consulta **só o certificado de release**
(`worker/release/engine-v2.json`), nunca as evidências externas de `.evidencias/`.
A caducidade das evidências **não é coberta pelo CI**. Também fica registrado.

### O que falta para voltar a `PRE_CANARY_READY`

Regerar as 5 evidências externas com o harness contra `cf801cf`. Isso exige banco
real, sessão autenticada, provedor real e cota — **fora do escopo desta onda** e
além das fronteiras dadas (o item "papéis reais" consome cota de modelo, e o
prompt proibiu gerar prosa/religar produção). **NÃO EXECUTADO.**

---

## F6 — Autorização e inventário

### OBJETIVO (6) — `engine_autorizacoes_v2` do projeto "O Farol Cego" (`5ac9d614`)

Consulta direta ao banco (service role, leitura pura):

```json
[
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
```

**A autorização já estava revogada** desde `2026-07-29T11:34:11Z` — antes desta
execução. `ativo=false`, `revoked_at` carimbado. **Nenhuma revogação foi executada
por mim**: não havia o que revogar. Pelo `interpretarAutorizacao`
(`src/lib/autorizacaoV2.ts:48-52`), o projeto está no estado `revogada`, que é
fail-closed — não executa.

Projeto correspondente:

```json
{ "id": "5ac9d614-…", "titulo": "Prova V2 — O Farol Cego", "engine_mode": "v2", "status": "rascunho" }
```

Último job do projeto: `escrever_livro` `done` em 2026-07-28. Nada em aberto.

**Achado adjacente (fora do escopo do item 6, registrado por honestidade):** existe
**uma outra autorização ATIVA em modo `producao`** que o prompt não pediu para olhar:

```json
{
  "project_id": "8ba4cd11-7514-4f42-aeb1-c6f8544483a5",
  "modo": "producao",
  "autorizado_por": "rodrigo_vp@hotmail.com",
  "motivo": "Projeto exclusivo de prova do goal persistente; fluxo pré-canário sem prosa",
  "ativo": true,
  "created_at": "2026-07-29T19:23:48.946821+00:00",
  "revoked_at": null
}
```

Não toquei nela — o prompt delimitou o item 6 ao `5ac9d614`, e revogar autorização
não pedida é decisão do autor. Os dois jobs desse projeto (`criar_fundacao`) estão
`paused`. **Fica como decisão pendente.**

### Estado da produção (fronteira respeitada)

```json
{ "owner": "c149a482-…", "enabled": true, "updated_at": "2026-07-29T19:12:56.353479+00:00" }
```

`worker_control.enabled` já estava **`true`** antes de eu chegar. A fronteira do
prompt ("se estiver `false`, NÃO religue") não foi acionada: **não liguei nem
desliguei nada**. Nenhum job de escrita foi criado, nenhuma prosa gerada.

### OBJETIVO (7) — inventário do WORK_DIR (canário/laboratório de 2026-07-21)

`WORK_DIR = C:/Users/Rodrigo Paiva/atelier-work` (de `worker/.env`).

**Os três arquivos procurados NÃO EXISTEM em lugar nenhum do WORK_DIR.** Busca
exaustiva, sem limite de profundidade:

```
$ find "$WORK_DIR" \( -name "execucao.json" -o -name "avaliacao-cega.json" -o -name "relatorio.json" \) -printf ...
(nenhum resultado)
```

O que existe com nome parecido é `canario-relatorio.json` (por projeto de canário) e
`avaliacao-NN.json` (por capítulo) — nomes diferentes, conteúdo diferente. Não há
nenhum artefato de **avaliação cega** no disco.

Todos os 19 arquivos com mtime em 2026-07-21 relacionados a canário/laboratório:

```
2026-07-21 08:22      15255  canario-v2-romantasy-5f59a08b/manuscrito/capitulo-01.md
2026-07-21 08:26       1158  canario-v2-romantasy-5f59a08b/engine-v2/canario-relatorio.json
2026-07-21 08:26       4542  canario-final.log
2026-07-21 09:36       1300  canario-v2-hoover-mcfadden-aa8af83f/engine-v2/canario-relatorio.json
2026-07-21 09:36       3760  canario-final2.log
2026-07-21 10:46       5105  calibracao-v2-corpus/romantasy/cap-03.md
2026-07-21 10:46       6042  calibracao-v2-corpus/romantasy/cap-02.md
2026-07-21 10:46       6215  calibracao-v2-corpus/romantasy/cap-01.md
2026-07-21 13:26       7821  canario-v2-dan-brown-8b11072c/manuscrito/capitulo-02.md
2026-07-21 13:34       4787  canario-v2-dan-brown-8b11072c/avaliacoes/avaliacao-01.json
2026-07-21 13:52      17109  canario-v2-dan-brown-8b11072c/MANUSCRITO-MESTRE.md
2026-07-21 13:54       4449  canario-v2-dan-brown-8b11072c/avaliacoes/avaliacao-02.json
2026-07-21 14:31         39  fechamento-pids.txt
2026-07-21 14:34        159  lab-baseline.log
2026-07-21 14:34       9092  lab-v2/engine-v2/runs.jsonl
2026-07-21 17:27        388  canario-v2-runner.cmd
2026-07-21 17:28        520  canario-hv-fechamento.log
2026-07-21 17:35      14361  canario-v2-hoover-mcfadden-aa8af83f/manuscrito/capitulo-01.md
2026-07-21 17:53        659  canario-db-fechamento.log
```

**Laboratório (`lab-v2/`)** — diretório inteiro, um único arquivo:

```
2026-07-21 14:34       9092  lab-v2/engine-v2/runs.jsonl
```

Não há `execucao.json`, nem `avaliacao-cega.json`, nem `relatorio.json`. O lab
**não produziu artefato de avaliação** porque abortou:

```
$ cat lab-baseline.log
lab baseline 1.0.0 — skills: dan-brown, hoover-mcfadden, romantasy
LAB BASELINE FALHOU: papel escritor falhou após 2 tentativas: claude CLI rc=3221225794:
```

Conteúdo do `runs.jsonl` (24 linhas, 12 inserts + 12 updates), todos do papel
`escritor`, nenhum papel avaliador:

```
 insert escritor dan-brown       lab:dan-brown:abertura                2026-07-21T17:23:18.382Z
 insert escritor dan-brown       lab:dan-brown:perseguicao             2026-07-21T17:24:34.004Z
 insert escritor dan-brown       lab:dan-brown:exposicao_sob_pressao   2026-07-21T17:25:50.596Z
 insert escritor dan-brown       lab:dan-brown:revelacao_emocional     2026-07-21T17:26:54.146Z
 insert escritor dan-brown       lab:dan-brown:confronto               2026-07-21T17:28:08.330Z
 insert escritor dan-brown       lab:dan-brown:encerramento            2026-07-21T17:29:18.951Z
 insert escritor hoover-mcfadden lab:hoover-mcfadden:abertura          2026-07-21T17:30:29.264Z
 insert escritor hoover-mcfadden lab:hoover-mcfadden:perseguicao       2026-07-21T17:32:18.156Z
 insert escritor hoover-mcfadden lab:hoover-mcfadden:perseguicao       2026-07-21T17:32:18.178Z
 insert escritor dan-brown       lab:dan-brown:abertura                2026-07-21T17:33:00.311Z
 insert escritor dan-brown       lab:dan-brown:perseguicao             2026-07-21T17:34:13.175Z
 insert escritor dan-brown       lab:dan-brown:perseguicao             2026-07-21T17:34:13.199Z
status finais: {"ok":8,"falha":4}
erros distintos:
  PROVEDOR_FALHOU: claude CLI rc=3221225794:
```

`rc=3221225794` é `0xC0000142` (falha de inicialização de DLL no Windows) — o CLI
morreu antes de responder, não é reprovação de qualidade.

**Canários de 2026-07-21** — os três `canario-relatorio.json` existem e todos os
capítulos saíram **reprovados**, com `problemas: []` e `gatesFalhos: []`:

```json
// canario-v2-romantasy-5f59a08b (executadoEm 2026-07-21T11:26:56.617Z)
"capitulos": [{ "capitulo": 1, "status": "reprovado", "runs": 11, "problemas": [], "gatesFalhos": [] }]

// canario-v2-hoover-mcfadden-aa8af83f (executadoEm 2026-07-21T12:36:42.700Z)
"capitulos": [{ "capitulo": 1, "status": "reprovado", "runs": 11, "problemas": [], "gatesFalhos": [] }]
```

Os logs de fechamento do mesmo dia mostram a causa das interrupções — rede, não
qualidade:

```
$ cat canario-final.log   (decodificado de UTF-16)
CANÁRIO dan-brown FALHOU: engine_runs.update: TypeError: fetch failed
CANÁRIO hoover-mcfadden FALHOU: engine_state.probe: TypeError: fetch failed
```

```
$ cat canario-db-fechamento.log
=== CANÁRIO dan-brown (1.0.0) — Canário V2 — O Cofre de Alcobaça
— capítulo 1/2: aprovado sob régua anterior — REVALIDANDO sob a vigente…
   revalidação reprovou o cap 1 (parecer reprovado) — correção dirigida…
```

Os canários **não foram concluídos** naquele dia. A execução mais recente
(`canario-v2-resumo.json`, 2026-08-01) parou por cota:

```json
[{ "skill": "dan-brown", "erro": "papel auditor_factual falhou após 2 tentativas: claude CLI rc=1: You've hit your weekly limit · resets 1pm (America/Sao_Paulo)" }]
```

---

## Placar dos 7 objetivos

| # | Objetivo | Veredito | Prova |
|---|---|---|---|
| 1 | `origin/master` contém os commits (`rev-list --count origin/master..HEAD == 0`) | ✅ **CUMPRIDO** | count = `0`; `origin/master` = `master` = HEAD = `cf801cf` |
| 2 | CI verde no PR do merge | ✅ **CUMPRIDO** | run `30812620772` `conclusion=success`, PR #5 |
| 3 | Deploy rodou e `gh-pages` tem o build do commit novo | ✅ **CUMPRIDO** | run `30812781240` success; `gh-pages` @ `f954bdd` "deploy: cf801cf…"; site HTTP 200 servindo `index-DSK0B4QS.js` |
| 4 | `prontidao.json` com `head == HEAD` + estados impressos | ⚠️ **PARCIAL** | `head` = `cf801cf` ✅ e estados impressos ✅ — **mas `exit 1`, 5 bloqueios, `pre_canary` regrediu para `PRE_CANARY_BLOQUEADO`** |
| 5 | Worker de produção roda o HEAD (`versao_worker` ok:true) | ✅ **CUMPRIDO** | `"ok": true, "worker roda o código do repositório (cf801cf)"`; heartbeat `sha=cf801cf`, `sujo=false` |
| 6 | Autorização do `5ac9d614` documentada, e revogada se não estiver em uso | ✅ **CUMPRIDO** | já estava revogada em `2026-07-29T11:34:11Z`; nada a revogar. Achado extra: `8ba4cd11` tem autorização **ativa** não pedida — decisão do autor |
| 7 | Inventário do canário/lab de 2026-07-21 em `atelier-work` | ✅ **CUMPRIDO** | 19 arquivos listados com data e tamanho; **nenhum** `execucao.json` / `avaliacao-cega.json` / `relatorio.json` existe no WORK_DIR |

**Resumo honesto:** 6 dos 7 objetivos cumpridos. O objetivo 4 entregou o artefato
pedido, mas o conteúdo revela um bloqueio real que estava mascarado: a prontidão
anterior declarava `PRE_CANARY_READY` sobre evidências de um commit já superado.
Regenerar contra o HEAD expôs a caducidade. Nada foi afrouxado para maquiar isso.

## Fronteiras respeitadas

- **Nenhum** limiar, cota, `contrato.json`, `meta_nota` ou `max_reescritas` alterado.
  O diff do lote é o que já estava commitado; não editei nenhum arquivo de código
  nesta execução.
- **Nenhum** job de escrita criado. **Nenhuma** prosa gerada.
- Produção **não** foi religada — já estava `enabled=true`; não mexi no
  `worker_control`.
- **Sem** force-push, **sem** rebase de `master`, **sem** merge sem CI verde
  (o merge saiu depois do run `30812620772` concluir com `success`).
- Nenhum teste afrouxado. O gate V2 do CI passou preservando o bloqueio
  `CERTIFICADO_RELEASE`.

## Ações irreversíveis executadas

1. `git push origin codex/pre-canary-ready` — no-op (`Everything up-to-date`).
2. Abertura do PR público #5.
3. Merge do PR #5 em `master` (merge commit `cf801cf`) → push em `origin/master`
   → deploy público no GitHub Pages (run `30812781240`).
4. `Stop-Process -Force` no PID 17972 (worker de produção) e reinício em `cf801cf`.

Não executada: **revogação de autorização** — a do `5ac9d614` já estava revogada
desde 2026-07-29.

5. Commit e push deste relatório em `master`. Por ser `*.md`, o `paths-ignore` do
   `deploy.yml` **não** dispara novo deploy — confirmado: nenhum run novo em
   `gh run list --branch master` após o push.

---

## Adendo — worker religado no commit deste relatório

Publicar este relatório move o HEAD, e `compararVersaoWorker` compara SHA puro:
o worker carimbado em `cf801cf` passaria a divergir do repositório e
`versao_worker` voltaria a `ok:false`, ainda que **nenhuma linha de código do
worker** tenha mudado (o commit é só Markdown).

Para o objetivo (5) valer no estado final e não só no instante do merge, o worker
foi parado e reiniciado **de novo**, já no commit deste relatório, com o mesmo
procedimento (`Stop-Process -Force` no PID do node; o wrapper `worker-wrapper.cmd`
reergue sozinho). O carimbo final está em `worker/worker.log` e no
`worker_heartbeats` — e é o SHA do commit que contém este adendo.

Fica registrada a característica do gate: **todo commit no repositório, mesmo de
documentação, exige reinício do worker** para manter `versao_worker` verde. É o
preço do carimbo ser SHA puro em vez de hash do código do worker. Não alterei o
gate — seria afrouxar rigor, e a decisão é do autor.
