# Relatório — PASSO 2: as evidências externas (2026-08-03)

> ## `PRE_CANARY_READY` NÃO voltou.
>
> Quatro das cinco evidências ficaram `ok:true`. A quinta — `papeis_reais` — não
> foi gerada, por decisão sua depois que eu levantei o que ela realmente exige.
> O bloqueio restante é exatamente um: `ONZE_PAPEIS_E_CASCATA_REAL`.
>
> Os bloqueios de pré-canário caíram de **5 para 1**, e a prontidão fechou com
> **`bloqueios: 0`** — não há nenhuma afirmação inválida, só uma ausência de prova
> nomeada.
>
> **Custo real medido: 91.301 tokens de saída em `claude-opus-5`** (o primeiro
> número de custo não-fixture do projeto).

---

## Placar das 5 evidências

| # | Evidência | Veredito | Commit testado |
|---|---|---|---|
| 1 | `migracoes_remotas` | ✅ **ok:true** | `9a84cf0` |
| 2 | `integracao_real` | ✅ **ok:true** | `9a84cf0` |
| 3 | `ui_autenticada` | ✅ **ok:true** | `9a84cf0` |
| 4 | `provedor_real` | ✅ **ok:true** | `9a84cf0` |
| 5 | `papeis_reais` | ⛔ **AUSENTE** — não gerada (ver "o que não ficou provado") | — |

Validação pela régua do LEITOR (a mesma que a prontidão e o gate do CI usam):

```
$ node validar-ev.mjs
[OK   ] migracoes_remotas — testou 9a84cf0
[OK   ] integracao_real — testou 9a84cf0
[OK   ] ui_autenticada — testou 9a84cf0
[OK   ] provedor_real — testou 9a84cf0
[AUSENTE] papeis_reais — sem evidência em .evidencias/papeis_reais.json
```

**As quatro passaram na primeira tentativa.** Isso é a prova prática de que a
unificação da régua no PASSO 1.5 funcionou: o escritor (`gerar-evidencia.ts`)
carimbou exatamente o que o leitor confere. Antes do conserto, 0 dos 4 campos
batiam e todas nasceriam inválidas.

---

## F0 — Pré-condições

```
$ git rev-parse HEAD ; git rev-parse origin/master ; git rev-list --count origin/master..HEAD
9a84cf01dce69a89c385b9d40a12349a239758f7
9a84cf01dce69a89c385b9d40a12349a239758f7
0

$ git diff --name-only d2a909a
RELATORIO-PASSO1-5.md
worker/autostart/instalar-autostart.ps1
worker/autostart/worker-wrapper.cmd
```

Nenhum arquivo das quatro impressões mudou desde o congelamento.

### As quatro impressões, antes e depois

| campo | `d2a909a` (congelado) | working tree (agora) | mudou? |
|---|---|---|---|
| `migrations_source_hash` | `94f4fef631059f5e` | `94f4fef631059f5e` | não |
| `contratos_hash` | `28e6eb44e879e07e` | `28e6eb44e879e07e` | não |
| `worker_hash` | `0825a803a792cd25` | `0825a803a792cd25` | não |
| `interface_hash` | `fcd4dd3f03e17cf2` | `fcd4dd3f03e17cf2` | não |

Medidas com a mesma função (`fingerprintsAtuais`), uma vez num `git worktree`
limpo de `d2a909a` e uma vez no working tree.

### Worker e suíte

```
$ tail -1 worker/worker.log
[2026-08-03T16:57:33.718Z] [worker pc-rodrigo] código: 9a84cf0 (worktree limpa)

$ npm test -- --run
 Test Files  138 passed (138)
      Tests  1748 passed (1748)
EXIT=0
```

---

## F1 — Projeto descartável

```
=== PROJETO CRIADO ===
{
  "id": "96e32430-3252-4562-8d52-149bd8e08b36",
  "titulo": "Prova V2 — 2026-08-03",
  "skill_escrita": "hoover-mcfadden",
  "engine_mode": "v2",
  "total_capitulos": 2,
  "meta_nota": 9,
  "status": "rascunho"
}

=== AUTORIZACAO CRIADA ===
{
  "id": "4503968e-e57a-4c13-849a-73125e5fac4d",
  "project_id": "96e32430-3252-4562-8d52-149bd8e08b36",
  "modo": "producao",
  "autorizado_por": "rodrigo",
  "motivo": "PASSO 2 — prova pre-canario das 5 evidencias externas (2026-08-03). Projeto descartavel; revogar ao fim.",
  "ativo": true,
  "created_at": "2026-08-03T16:40:25.705543+00:00",
  "revoked_at": null
}
```

Briefing completo e aprovado com hash (`e2dd7011bb05059b`), 0 lacunas e 0 conflitos —
sem isso a fundação é recusada por `autorizarFundacao`.

**`total_capitulos` foi corrigido de 2 para 6 no meio do caminho.** O motivo está
no achado nº 1 abaixo.

---

## F2 — Evidência 1: `migracoes_remotas`

Introspecção real via SQL no banco de produção (`dzgbatsecbkjmucmigjv`), 6 passos,
todos `exit_code 0`:

| passo | resultado |
|---|---|
| migrations registradas em `supabase_migrations` | 2: `engine_v2_historico`, `engine_v2_autorizacoes` |
| tabelas do núcleo V2 presentes | 4/4 + 4/4 de autorização/histórico |
| introspecção do schema V2 completo | 8 tabelas · 85 colunas · 36 constraints · 11 policies · 8 triggers · 19 índices |
| RLS habilitada | 8 de 8 com `relrowsecurity=true` |
| triggers de imutabilidade | 7 presentes (`_imutavel`, `_sem_delete`, `_sem_update`, `engine_runs_congelar`) |
| `projects.briefing_aprovado` | presente (`engine_v2_fluxo.sql` aplicado) |

```
$ npx tsx scripts/gerar-evidencia.ts --entrada ../.evidencias/migracoes-remotas-input.json
evidência gravada: .evidencias\migracoes_remotas.json
  commit testado: 9a84cf0
  passos: 6 · artefatos: 0
```

---

## F3 — Evidências 2 e 3

### `integracao_real` — interface → worker → Storage, com hash conferido

Produzida por `v2-materializar-documentos.ts --confirmar`, que faz upload real e
baixa de volta conferindo hash. 14 passos, 7 artefatos:

```
[OK] autorizacao ativa do projeto em engine_autorizacoes_v2 — modo=producao por=rodrigo
[OK] round-trip: documentosDaFundacao reproduz o disco byte a byte — 6 documentos identicos
[OK] upload + download com hash conferido: perfil-de-voz.md — sha256 6932c62e236056ba… (2058 bytes)
[OK] upload + download com hash conferido: fundacao/biblia-da-obra.md — sha256 0659712e03af4d42… (5660 bytes)
[OK] upload + download com hash conferido: fundacao/mapa-personagens.json — sha256 5b8c648c3dcabb3a… (4632 bytes)
[OK] upload + download com hash conferido: estrutura.json — sha256 583448462aea4499… (8938 bytes)
[OK] upload + download com hash conferido: fundacao/matriz-de-relogios.md — sha256 f6d62ffeff695b23… (2906 bytes)
[OK] upload + download com hash conferido: fundacao/regras-da-narradora.md — sha256 15369d59ab3d3098… (3624 bytes)
[OK] indice-documentos.json publicado e conferido por URL assinada — sha256 cfaf7a30e856ccac… (1286 bytes)

14 passos aprovados · 7 artefatos conferidos
```

### `ui_autenticada` — sessão real no app publicado

Executada no Chrome, na sessão de `rodrigo_vp@hotmail.com` (já autenticada — não
precisei pedir login). 7 passos:

- Dashboard do app publicado carregou; o projeto de prova aparece com
  `Engine V2 · hoover-mcfadden@1.1.0`.
- **A interface impede prosa antes do certificado:** botão "Iniciar escrita"
  **desabilitado**, com "Resolver antes da escrita: obter o certificado final de
  release". Fail-closed visível na tela.
- A interface lê `engine_autorizacoes_v2`: mostrou "Projeto autorizado (producao)"
  com o motivo exato que gravei, e o botão "Revogar autorização".
- Os 6 documentos da fundação listados, com `matriz de relogios` e
  `regras da narradora` marcados como **contrato** (exigências do hoover).
- **Download autenticado:** o clique em "Perfil de voz" abriu
  `/storage/v1/object/sign/manuscritos/<owner>/<projeto>/perfil-de-voz.md` com
  token de escopo `download`.

**Prova cruzada — o ponto mais forte desta rodada:** baixei os 7 artefatos pela
sessão autenticada do navegador (HTTP 200 em todos) e os sha256 batem **byte a
byte** com os que o worker mediu ao subir:

| artefato | bytes | sha256 (worker = navegador) |
|---|---|---|
| `perfil-de-voz.md` | 2058 | `6932c62e236056ba…` |
| `fundacao/biblia-da-obra.md` | 5660 | `0659712e03af4d42…` |
| `fundacao/mapa-personagens.json` | 4632 | `5b8c648c3dcabb3a…` |
| `estrutura.json` | 8938 | `583448462aea4499…` |
| `fundacao/matriz-de-relogios.md` | 2906 | `f6d62ffeff695b23…` |
| `fundacao/regras-da-narradora.md` | 3624 | `15369d59ab3d3098…` |
| `indice-documentos.json` | 1286 | `cfaf7a30e856ccac…` |

O que o worker escreve é exatamente o que o autor baixa. Isso não é inferência —
são dois caminhos independentes chegando ao mesmo hash.

---

## F4 — Evidência 4: `provedor_real`

Smoke do provedor real, **sem uma linha de prosa literária**. 5 passos:

```
[OK] autenticacao e disponibilidade do provedor — respondeu em 6860ms; versao do CLI 2.1.220 (Claude Code)
[OK] modelo executado e o solicitado — solicitado=claude-sonnet-5 executado=claude-sonnet-5
[OK] resposta estruturada valida contra schema minimo — ok=true eco=prontidao; tokens_out=20
[OK] timeout aborta a chamada — abortou: claude CLI: timeout após 1ms
[OK] modelo invalido e recusado — classificado: claude CLI rc=1: There's an issue with the selected model (modelo-que-nao-existe-2026)

5/5 passos aprovados
```

Na primeira execução usei `esforco: "baixo"` e o provedor **recusou** — os valores
aceitos são `low/medium/high/xhigh/max`. O erro foi meu; registro porque o gate
acertou ao recusar, e porque a primeira tentativa saiu `2/3` e não foi aproveitada.

---

## F6 — Prontidão regenerada

```
head: 9a84cf01dce69a89c385b9d40a12349a239758f7
gerado_em: 2026-08-03T17:29:04.943Z
bloqueios: 0 | nao_comprovados: 6
bloqueios_producao: ["ONZE_PAPEIS_E_CASCATA_REAL","CERTIFICADO_RELEASE"]
versao_worker: worker roda o código do repositório (9a84cf0)
EXIT_PRONTIDAO=0
```

**`bloqueios: 0`** — nenhuma afirmação inválida. O que resta é ausência de prova,
nomeada.

### Verificação externa

```
--- VERIFICAÇÃO EXTERNA (fora do alcance desta máquina) ---
  [OK  ] migrações aplicadas e verificadas no banco real — evidência válida — testou 9a84cf0, fingerprints do código conferem
  [OK  ] fluxo real interface → worker → Storage com download conferido — evidência válida — testou 9a84cf0, fingerprints do código conferem
  [OK  ] interface autenticada: abertura e download dos documentos V2 — evidência válida — testou 9a84cf0, fingerprints do código conferem
  [OK  ] smoke do provedor real (sem escrita literária) — evidência válida — testou 9a84cf0, fingerprints do código conferem
  [N/COMPROV] 11 papéis com modelo real e cascata em duas passadas — sem evidência em .evidencias/papeis_reais.json
```

### Estados formais

```
=== ESTADOS FORMAIS ===
  implementacao_local IMPLEMENTACAO_LOCAL_APROVADA
  regressao_local     REGRESSAO_LOCAL_APROVADA
  integracao_mock     INTEGRACAO_MOCK_APROVADA
  acuracia            CORPUS_AUTOMATICO_PRONTO_PARA_LAB
  migracoes_remotas   MIGRACOES_REMOTAS_COMPROVADAS
  integracao_real     INTEGRACAO_REAL_APROVADA
  ui_autenticada      UI_AUTENTICADA_APROVADA
  provedor_real       PROVEDOR_REAL_APROVADO
  papeis_reais        PAPEIS_REAIS_NAO_COMPROVADOS
  pre_canary          PRE_CANARY_BLOQUEADO: ONZE_PAPEIS_E_CASCATA_REAL
  release_producao    RELEASE_PRODUCAO_BLOQUEADO: ONZE_PAPEIS_E_CASCATA_REAL, CERTIFICADO_RELEASE
  canarios_novos      BLOQUEADOS: ONZE_PAPEIS_E_CASCATA_REAL
  projeto             PROJETO_NAO_AUTORIZADO (por projeto; consulte engine_autorizacoes_v2)
  prova_literaria     PROVA_LITERARIA_NAO_EXECUTADA

Bloqueios: 0 · Não comprovados: 6
```

### Comparação com o objetivo

| estado | objetivo do PASSO 2 | resultado real |
|---|---|---|
| `pre_canary` | `PRE_CANARY_READY` | ⛔ `PRE_CANARY_BLOQUEADO: ONZE_PAPEIS_E_CASCATA_REAL` |
| `canarios_novos` | `CANARIO_AUTORIZADO_PELO_GATE` | ⛔ `BLOQUEADOS: ONZE_PAPEIS_E_CASCATA_REAL` |
| `release_producao` | `…: CERTIFICADO_RELEASE` (só isso) | ⛔ `…: ONZE_PAPEIS_E_CASCATA_REAL, CERTIFICADO_RELEASE` |

**Nenhum dos três estados-alvo foi atingido**, e todos pelo mesmo motivo único.
O avanço mensurável: os bloqueios de pré-canário caíram de **5 para 1**.

Antes desta rodada:

```
pre_canary  PRE_CANARY_BLOQUEADO: MIGRACOES_REMOTAS, INTEGRACAO_REAL,
            DOWNLOAD_AUTENTICADO, PROVEDOR_REAL, ONZE_PAPEIS_E_CASCATA_REAL
```

Depois:

```
pre_canary  PRE_CANARY_BLOQUEADO: ONZE_PAPEIS_E_CASCATA_REAL
```

---

## F7 — Autorização revogada

### ANTES

```json
{ "id": "4503968e-…", "project_id": "96e32430-…", "modo": "producao",
  "autorizado_por": "rodrigo", "ativo": true, "revoked_at": null }
ATIVAS: 1
```

### DEPOIS

```json
{ "id": "4503968e-…", "project_id": "96e32430-…", "modo": "producao",
  "ativo": false, "revoked_at": "2026-08-03T17:26:43.83+00:00" }
ATIVAS: 0
```

As três linhas do histórico continuam preservadas (revogadas, nunca deletadas).

---

## CUSTO REAL — o primeiro número não-fixture do projeto

```
=== runs do projeto de prova ===
  fundacao:macro                 ok  claude-opus-5  in=2  out=15433
  fundacao:macro:portao-retry-1  ok  claude-opus-5  in=2  out=17051
  fundacao:macro:portao-retry-2  ok  claude-opus-5  in=2  out=12360
  fundacao:macro                 ok  claude-opus-5  in=2  out=22553
  fundacao:macro:portao-retry-1  ok  claude-opus-5  in=2  out=16665
  fundacao:micro                 ok  claude-opus-5  in=2  out= 7239

TOTAL: 6 runs · tokens_in=12 · tokens_out=91301
```

> **CUSTO REAL MEDIDO nesta rodada: 91.301 tokens de saída em `claude-opus-5`,
> em 6 runs de `arquiteto_enredo`, para produzir UMA fundação de 6 capítulos —
> dos quais 44.844 (49%) foram queimados numa tentativa que o portão nunca
> poderia aprovar.** O smoke do provedor (fase 4) custou 20 tokens de saída.

**`tokens_in=2` em todos os runs é um número que não convence.** Um prompt com
pacote compilado não tem 2 tokens de entrada. O provedor lê
`usage.input_tokens` do envelope do CLI, e esse campo aparentemente não conta o
prompt enviado por stdin. **Conclusão: a métrica de entrada é inconfiável; só
`tokens_out` deve ser usado para custo até isso ser investigado.** Não é
conserto desta tarefa (mexeria em `worker/src`).

---

## O que não ficou provado

### 1. ACHADO — `total_capitulos` baixo torna o portão de arco insatisfazível, e custa caro descobrir

Criei o projeto com `total_capitulos=2`. O portão calcula:

```
limiteInicio = Math.ceil(total * 0.25)   // = 1
limiteFim    = Math.ceil(total * 0.8)    // = 2
… exige um marco com  c > limiteInicio && c < limiteFim   // c > 1 && c < 2
```

Com 2 capítulos **não existe inteiro possível** — a condição é matematicamente
insatisfazível. O sistema descobriu isso gastando **3 chamadas de opus (44.844
tokens)** antes de reprovar:

```
[engine-v2] portão da fundação reprovou a MACRO (tentativa 1): ARCO_INCOMPLETO:
  arco:Marta Vilar: nenhum marco entre os capítulos 2 e 1
```

"entre os capítulos 2 e 1" é o próprio gate dizendo que o intervalo está invertido.

**O que falta:** uma validação barata, antes da primeira chamada, de que
`total_capitulos` admite um arco válido. Hoje o custo dessa descoberta é três
chamadas do modelo mais caro. **Não consertei** — seria mexer em `worker/src`,
proibido aqui.

**Correção de um diagnóstico meu:** no meio da execução eu li
`for (let tentativa = 0; macro === null; tentativa++)` e concluí "loop infinito",
matando o worker por precaução. **Estava errado** — existe
`MAX_RETRIES_PORTAO = 2` com `throw` dentro do laço, e o job teria parado sozinho
com `FUNDACAO_REPROVADA`. Verifiquei antes de escrever isto aqui; o custo
queimado teria sido o mesmo.

### 2. A evidência 5 não prova o que o nome promete — e por isso não foi gerada

Ao abrir `v2-provar-papeis-reais.ts` descobri que ele **não executa os 11 papéis**.
Executa 5 ao vivo (`revisor_literario`, `revisor_decisao`, `conformidade_ficha`,
`extrator_memoria`, `julgamento_idioma`) e completa os outros 6 com
`ultimoRunReal(papel)`, que consulta:

```sql
select … from engine_runs where owner = OWNER and papel = $1 and status = 'ok'
  and model_provider ilike '%claude%' order by finished_at desc limit 1
```

— **sem filtrar por projeto e sem filtrar por commit.** Na evidência anterior isso
produziu uma prova que mistura 5 runs feitos naquela hora com 6 runs herdados de
projetos antigos, alguns de código diferente. A evidência sai `ok:true` e diz
"11 papéis com modelo real", mas o que ela sustenta é "5 rodaram agora; dos outros
6 existe algum run bem-sucedido em algum lugar do ledger".

Além disso o script exige um capítulo-fonte com ≥500 palavras e ficha persistida.
O projeto novo só tem fundação — gerar isso seria escrever capítulo, que é o
PASSO 3.

Levei as opções a você e a decisão foi **parar e entregar 4 de 5**. Concordo: era
escolher entre uma evidência que passa sem convencer e uma ausência honesta.

**Para o PASSO 3 resolver isto de verdade**, a evidência precisaria de duas
mudanças em `worker/scripts/v2-provar-papeis-reais.ts` (arquivo livre, fora das
impressões): filtrar `ultimoRunReal` pelo projeto de prova, e exigir que os runs
sejam do commit corrente.

### 3. Divergência entre a régua da UI e a do worker

A aba Fundação mostrou **"Entrevista incompleta"** (vermelho) e
**"Fundação bloqueada: concluir a entrevista"** — mas o worker gerou a fundação
normalmente. `autorizarFundacao` (worker) exige briefing sem lacunas, sem
conflitos e aprovado; a UI exige, além disso, uma entrevista concluída. Como
inseri o briefing direto no banco, não houve job `entrevistar`.

Não é falha de segurança (a UI é mais estrita), mas **as duas telas discordam
sobre o mesmo projeto**, e quem olha só a interface conclui que a fundação não
podia existir. Registrado, não consertado.

### 4. O que cada evidência aprovada NÃO cobre

- `migracoes_remotas` prova o schema das **8 tabelas V2**. Não olha as 7 tabelas
  `engine_*` restantes (`engine_calls`, `engine_configs`, `engine_policies`,
  `engine_qualifications`, `engine_quota_state`, `engine_skill_snapshots`,
  `engine_chapter_provenance`) — as "tabelas órfãs" já conhecidas.
- `integracao_real` e `ui_autenticada` provam o ciclo **da fundação**. Não tocam
  capítulo, manuscrito nem EPUB, porque não há capítulo neste projeto.
- `provedor_real` prova disponibilidade, pin de modelo, timeout e recusa de modelo
  inválido. **Não prova qualidade de saída** — o eco de 20 tokens não é julgamento
  literário.

### 5. Fronteiras — nada tocado

Nenhum arquivo de `supabase/**/*.sql`, `worker/skills-v2/**/contrato.json`,
`worker/src/**/*.ts` (não-teste) ou `src/**/*.tsx?` (não-teste) foi alterado —
provado pelas quatro impressões idênticas no F0 e por `git diff --name-only`.
Nenhum `meta_nota`, `max_reescritas`, limiar ou cota. Nenhum capítulo escrito.
Nenhum projeto antigo tocado (a rodada anterior de `.evidencias/` foi movida para
`.evidencias/_anteriores/` para não ser reaproveitada por engano). `.evidencias/`
segue no `.gitignore` e não é versionado.
