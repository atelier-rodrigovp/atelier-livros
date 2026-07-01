# CLAUDE.md — Atelier de Livros IA (regras do projeto)

## Controles de produção (schema-free)

Sem DDL (não há conexão Postgres/CLI/PAT no ambiente — ver [[project-ddl-migrations]]):
- **Prioridade** e **pausa por projeto** vivem em `projects.briefing` (jsonb):
  `briefing.prioridade` (int, maior = mais cedo) e `briefing.producao_pausada` (bool).
- **Concorrência** (`max_paralelo`) numa linha de config em `jobs`
  (`tipo='config_producao'`, `payload.max_paralelo`); fallback env `MAX_PARALLEL_HEAVY`.
- Picker puro em `worker/src/fila.ts` (`escolherProximo`): ordena por prioridade DESC,
  empate por created_at ASC; pula projeto pausado, projeto já em execução
  (concorrência nunca roda 2 jobs do MESMO project_id) e retry_at futuro. Degrade
  gracioso (chaves ausentes → defaults). UI: "Produzir agora"/pausa na aba Escrita;
  seletor de simultâneos + aviso de custo do Max em Configurações.
- `supabase/producao.sql` é OPCIONAL (promover a colunas reais um dia); o código
  funciona sem ele.

## Observabilidade / telemetria (quem come a cota e quem serializa)

Os transcripts do Claude Code (`~/.claude/projects/<cwd-com-`/:\ `→`-`>/**/*.jsonl`)
registram por mensagem `model` + `isSidechain` + `usage` (input/cache/output), e as
chamadas Task trazem `subagent_type` — é a **verdade do disco** de tokens por AGENTE
(o `run_claude`/`runClaude` usa texto puro e NÃO expõe usage). `worker/src/telemetria.ts`
(`coletarTelemetria`, testado) agrega isso + sinais de throughput do `runner.log`
(restarts, calls sem rc, hard-fails de 32k) e persiste **schema-free** numa linha `jobs`
(`tipo='telemetria'`, `status='paused'`, nunca reivindicada). Roda **após o runner** em
`escrever_livro` (best-effort, nunca derruba o job). Backfill/sweep:
`WORK_DIR=<real> npx tsx worker/scripts/backfill-telemetria.ts [<id>]`. Painel
**Observabilidade** (`src/pages/Observabilidade.tsx`, rota+nav) lê essa linha: custo-proxy
e output por papel com **gargalo destacado**, restarts, falso-limite/32k-fail. Custo-proxy
pondera opus/sonnet/haiku só p/ **ranquear** (não é fatura). **Dois eixos distintos:**
TOKEN (tokens/cap → quantos caps a cota rende; paralelizar NÃO ajuda) vs THROUGHPUT
(caps/h → sofre com serialização e restarts; paralelizar ajuda).

**Diagnóstico medido (2026-07-01, frota de 17 projetos):** o vilão NÃO é o escritor opus
relendo a craft (cache_read ≈85% absorve; escritor ~$39). É (1) o **ORQUESTRADOR gerando
71–100% do output** fazendo o micro-loop inline (vários projetos antigos ainda em opus →
$600–$1281/livro), e (2) um **falso "limite do Max"**: `escreverLivro` (jobs.ts ~815)
trata "0 capítulo NOVO neste run" como throttle e **pausa ~15min**, mesmo quando o run fez
uma **revisão** (marcador `review/_revcap-NN.done`) — descasamento entre a definição de
progresso do runner (inclui revisão) e a do worker (só capítulo novo). Prova: `claude -p`
responde na hora (conta não throttada) mas há job pausado "por limite"; `runner.log` tem
zero string de limite; resets crescem ~20min (não é reset real). Fix aplicado: subir
`CLAUDE_CODE_MAX_OUTPUT_TOKENS=64000` no worker (`index.ts`) mata os hard-fails de 32k
(default 32000 estourava o micro-loop → rc=1 → ~40min jogados fora). **Fix B** (jobs.ts:
conta `review/_revcap-NN.done` como progresso → mata a pausa de ~15min) e **Fix C**
(runner: `prompt_revisao_capitulo` DELEGA a crítica ao `livro-revisor` e a aplicação ao
`livro-editor`, passando só a evidência dinâmica do detector — o critério a–h já vive no
agente; **A/B mediu −49% do output do orquestrador** com paridade de cadência/prosa) —
ambos aplicados. **Fix C tem guarda determinística no runner** (não o LLM): após a revisão
confere `arquivo ≥ piso` + `estado-narrativo.md` atualizado (continuidade no ledger
canônico, não em arquivo avulso) + rerroda `cadencia_acima` (tiques caíram?); se falhar, 1
re-revisão dirigida **bounded** (marcador `review/_revcap-NN.try`), na 2ª aceita com aviso
alto. Vive no runner (`worker/skill-patches/.../livro_runner.py`) → vale para TODO projeto
do próximo capítulo em diante (sem sweep por-projeto). Pós-edição do runner: rodar
`instalar-skills.ps1`.


Plataforma que orquestra agentes do Claude Code para produzir livros (front
React+Vite+TS; Supabase; worker local em `worker/` via fila de jobs; deploy em
GitHub Pages). Verdade do disco: o worker confere arquivos reais antes de gravar.

## Skills de escrita (instaladas em `~/.claude/skills/`)

O worker resolve a `skill_escrita` de um projeto em `~/.claude/skills/<skill>`
(deriva de `RUNNER_PATH`). Estado atual — **6/6 de escrita instaladas**:

| Skill                          | Uso                         |
| ------------------------------ | --------------------------- |
| `livro-do-zero-ao-epub`        | runner + fases (base)       |
| `edicao-kindle`                | EPUB determinístico (base)  |
| `skill-dan-brown`              | thriller de conspiração     |
| `hoover-mcfadden`              | thriller-romance            |
| `skill-jk-rowling`             | prosa imersiva              |
| `vesper-escritor-de-capitulos` | trilogia VÉSPER             |
| `skill-romantasy`              | romantasy                   |

As 4 de autor foram copiadas (2026-06-26) do cache do app Claude desktop:
`…/Claude_pzs8sxrjxfjjc/LocalCache/Roaming/Claude/local-agent-mode-sessions/skills-plugin/<ids>/skills/<skill>`.
O `skills-livro.zip` do repo NÃO contém as de autor — para reinstalar, copie a
pasta completa (SKILL.md + assets/references) desse cache para `~/.claude/skills/`.
Só os projetos `skill-dan-brown` (saga "A Biblioteca Afogada", autor Iago) usam
hoje uma skill de autor; os demais estão com `skill_escrita = nenhuma`.

**Edições de skill vivem em `worker/skill-patches/`** (fora de `~/.claude/skills/`,
que não versiona e é sobrescrito num reinstall). Depois de reinstalar skills, rode
`pwsh worker/skill-patches/instalar-skills.ps1` para reaplicar nossas edições (com
backup). Hoje: `arquiteto-de-enredo` v6.3 (portão de ambição ≥8 + voz com
assinatura positiva) e `livro-do-zero-ao-epub` (gate de maneirismo no runner:
**por capítulo** na ESCRITA + **book-wide** na fase `DESMANEIRISMO`, que itera
contando→reescrevendo→recontando até abaixo do orçamento global antes de
EPUB/CONCLUIR) + distingue **throttle do Max de estagnação** (não envenena o
contador; emite `RUNNER_LIMITE_MAX`) + **léxico de muletas** ("coisa" ≤1/cap) no
gate + **micro-loop escritor→revisor→editor por capítulo LIGADO POR PADRÃO** (camada
central de qualidade; escape hatch `--sem-revisao-por-capitulo` / env
`REVISAO_POR_CAPITULO=0` / `payload.sem_revisao_por_capitulo` / toggle na UI para
baratear no Max). O detector de repetição/muleta vive em `worker/src/maneirismo.ts`
(TS, testado) e espelhado no runner. **Detector de CADÊNCIA (ritmo, não palavras):**
`diagnosticarCadencia`/`cadenciaAcima` (TS) + `cadencia_acima` (runner) medem o
staccato que a Regra 4 da skill-dan-brown bane — fragmentos colados, densidade de
staccato, clipe de negação, anáfora, epigrama antitético e a **cota da Regra 4**
(itálico ≤2–3, retórica ≤1–2, fragmento ≤1–2 e nunca dois colados). Ligado no
**gate por capítulo**, no **revisor** (cota com as contagens reais) e no
**DESMANEIRISMO** (por capítulo). A instrução é **VARIAR o ritmo** (fundir frases
curtas, encadear na revelação), não só cortar palavra. Moldes adicionais (escapavam):
**antítese com "haver"** ("Não havia X… Havia Y") e **símile-andaime** ("como se / como
quando") em `MOLDES`/`_MOLDES_CAP`; e **interioridade-sem-evento** (`interioridadeSemEvento`,
heurística: cópula/percepção alta + diálogo ~nulo → "bem escrito e chato") que **sinaliza,
não bloqueia** — só alimenta o revisor. **Revisor por capítulo é CRÍTICO HOLÍSTICO**
(lever definitivo, não whack-a-mole de lista): item (g) manda ler o capítulo e cortar/
dramatizar símile-andaime, eco de negação, anáfora/staccato e decoração-sem-evento mesmo
fora da lista — as contagens entram como evidência. A **cota da Regra 4 também é
injetada na FUNDAÇÃO** como alvo positivo (não só enforce em runtime): o arquiteto
não a emite por padrão, então `worker/src/voz-regra4.ts` (`normalizarVozRegra4`,
testado) garante a seção de cota (fragmento ≤1–2 nunca colado, itálico ≤2–3, retórica
≤1–2, anti-"coisa") no `perfil-de-voz.md` + a política dura nas Notas de Execução da
`Estrutura-do-Livro.md`. Roda **após `criar_fundacao`** e **no início de
`escrever_livro`** (idempotente via marcador `<!-- COTA-CADENCIA v1 -->`; reconhece
também injeções legadas sem marcador, p.ex. a edição manual de A Espiral). Sweep:
`npx tsx worker/scripts/normalizar-voz-regra4.ts [<project_id>]`. **Vive no worker, NÃO
na prosa do `arquiteto-de-enredo`** (cujo SKILL.md tem encoding corrompido — não
editar). Os números da cota **batem com os orçamentos do detector** (`ORC_CADENCIA`:
fragEnfase 2/colados 0, italico 3, retorica 2, anafora/clipe 1; muleta "coisa" orc10k 4
≈1/cap) — o alvo que o escritor recebe é o mesmo que o gate cobra. **Blindagem dos
parágrafos-modelo (§2 do perfil):** o mesmo passo injeta uma **linha de guarda**
(`<!-- GUARDA-MODELOS v1 -->`: "modelos = técnica, não copie, não reproduza muleta")
e **escaneia** os modelos por muleta (`escanearMuletasNosModelos`), **sinalizando**
(log/`aviso`) sem reescrever a prosa do autor — porque o gate de cadência roda nos
capítulos, não no perfil, então a §2 não era coberta.

**Corrente skill→fundação→escritor (a craft da skill chega à caneta):** o escritor
(`prompt_escrita_capitulo`) lia só a fundação, nunca a craft da skill
(`references/voz-e-oficio.md`/`metamodelo-thriller.md`), e `criar_fundacao` tratava
`skill_escrita` como etiqueta. `worker/src/craft-skill.ts` (`normalizarCraftSkill`,
testado) injeta no `perfil-de-voz.md` um **RESUMO DE CRAFT por skill** (motor + regras
como ALVO POSITIVO concreto), marcado `<!-- CRAFT-SKILL v1 -->`, idempotente e **agnóstico**
(`CRAFT_POR_SKILL`: dan-brown, jk-rowling, hoover-mcfadden, romantasy, vésper; skill
desconhecida/nenhuma → no-op). Roda após `criar_fundacao` e no início de `escrever_livro`.
O prompt de `criar_fundacao` também **obriga o arquiteto a ingerir** a craft da skill; e
`prompt_escrita_capitulo` manda o escritor **ler e SEGUIR o bloco `## CRAFT DA SKILL`** do
perfil. Sweep: `npx tsx worker/scripts/aplicar-craft-skill.ts [<id>]`. **A skill é boa — o
buraco era a fiação** (escritor não lia a craft; fundação não a ingeria).

**O Opus escreve da CRAFT, não do digest-haiku (corrente fechada de verdade):** a
auditoria independente mostrou que o bloco `CRAFT-SKILL` no perfil era **insuficiente** —
o agente `livro-escritor` era mandado "não reler a fundação; o digest basta", e a VOZ
chegava comprimida a ~2 linhas por **haiku**. `worker/src/craft-agentes.ts`
(`normalizarCraftNosAgentes`, testado) conserta os AGENTES GERADOS: no `livro-escritor`
injeta `<!-- CRAFT-LEITURA v1 -->` (VOZ/TÉCNICA lida DIRETO de `voz-e-oficio.md` +
`metamodelo-thriller.md` + bloco CRAFT a cada capítulo; digest = só FATOS) e **neutraliza
o "não releia"**; no `livro-revisor` injeta `<!-- PROPULSAO v1 -->` (VEREDITO "isto está
vivo?" — reprova "competente e chato", não só defeito). Roda após `criar_fundacao`, no
início de `escrever_livro` e no sweep `consertar-craft-agentes.ts`. O runner
`prompt_escrita_capitulo` manda LER as references da skill (não o resumo); flag
`--revisor-craft-opus` (env `REVISOR_CRAFT_OPUS=1`, default off) eleva o veredito de
propulsão a opus. **O `arquiteto-de-enredo/SKILL.md` foi regravado SEM os 3189 NUL**
(conteúdo idêntico, agora editável) e o template do escritor na fábrica corrigido (VOZ vs
FATOS) — projeto novo nasce certo. **Canais separados: voz nunca passa por compressão de
haiku.**

## Modelo por papel (subagentes livro-*) + orquestrador

No Claude Code, um subagente **sem `model:` no frontmatter HERDA o modelo do pai**
(o orquestrador). Como o arquiteto gera os agentes por prosa, o `model:` saía
não-determinístico (o editor já apareceu em opus, encarecendo o micro-loop à toa).
Política pinada deterministicamente em `worker/src/modelos-agentes.ts` (testado):
**escritor=opus** (inegociável — a prosa nasce nele), **revisor=sonnet**,
**editor=haiku** (tarefa barata: aplicar edições + gravar estado-narrativo),
**contextualizador=haiku**, **arquiteto-comercial=sonnet**. `normalizarModelosAgentes()`
roda **após `criar_fundacao`** (todo projeto novo nasce certo) e **no início de
`escrever_livro`** (corrige projetos vivos; idempotente). Sweep avulso:
`npx tsx worker/scripts/normalizar-modelos-agentes.ts`.

**Orquestrador da escrita longa = sonnet por padrão** (`MODEL_ORQUESTRADOR`, default
`sonnet`): ele só roteia/delega a prosa ao subagente escritor (opus via frontmatter),
então não precisa de opus. As fases **inline** que NÃO delegam — `ESTRUTURA`,
`REVIEW` (book-bestseller-review) e `REESCRITA` (prosa cirúrgica) — o runner sobe
para o modelo **pesado** (`--model-pesado`, default opus) via `modelo_da_fase()`, para
não rebaixar nem o avaliador nem a prosa. `MODEL` (opus) segue valendo para os jobs
interativos/fundação (`runClaude`).

## Livros importados — hidratação do WORK_DIR

Os importadores (`worker/scripts/importar-*.mjs`) gravam só no **banco**
(`projects`/`editions`/`chapters`) e no **Storage** (`<owner>/<id>/manuscrito/NN-*.md`,
`<id>/fundacao/*`) — **não** no `WORK_DIR` nem criam `ESTADO_LIVRO.json`. Como o worker
lê "a verdade do disco" (`chaptersOnDisk`/`readState`) e nunca baixava do Storage, o app
(lê o banco) mostrava 32/32 e avaliar/refinar (leem o disco) viam 0/32 / "fundação
ausente". `worker/src/hidratar.ts` (`hidratarWorkDir`, testado) baixa os capítulos no
layout do runner (`capitulo-NN.md`, por `numero` do banco), baixa a fundação se houver,
**semeia `ESTADO_LIVRO.json`** (`fase_atual=CONCLUIDO` quando completo) e consolida o
`MANUSCRITO-MESTRE.md`. Idempotente. Roda **automático no início** de `avaliar`,
`escrever_livro`, `traduzir`, `gerar_epub` (só quando falta ESTADO — no-op p/ projeto
normal). Sweep: `npx tsx worker/scripts/hidratar-importados.ts [<id>]`. **`avaliar`** tem
bypass do portão de parcialidade quando `fase=CONCLUIDO` (livro completo pode ter
capítulos abaixo do piso — front-matter/curtos — que não contam no piso, ex.: A Casa que
Conta 29/32 no piso 1400, mas 32/32 real). **Refinar** importado SEM fundação Atelier
(agentes `livro-*`) falha com **erro claro e acionável** (não run cru): avalie/publique ou
reconstrua a fundação. (UI de "Preparar"/"Reconstruir fundação" = fatia futura; hoje a
hidratação é automática e todos os importados têm fundação no Storage.)

## Trava antivazamento (nenhum meta-texto chega ao livro)

Camadas (ver `worker/README.md` e `docs/auditoria-vazamento.md`):

1. **Preflight** (`escrever_livro`): skill ausente ⇒ job `error`, sem degradação
   silenciosa. **Não alterar** esse comportamento (a falha alta é desejada).
2. **`sanitizarCapitulo()`** (`worker/src/sanitize.ts`, testado): remove
   comentário HTML/fence/chatter de pipeline; conservador com prosa legítima.
3. **Gate por capítulo** + **gate de compilação** (`tools/gate_manuscrito.py`).

Auditoria: `worker/scripts/auditar-vazamentos.ts`. **Backups dos originais
limpos:** `.orig.bak` ao lado de cada arquivo no `WORK_DIR`, e
`worker/audit-backup/<key>` para o Storage (ambos fora do git).

## Bloqueios de IA conhecidos (estado em 2026-06-26)

- **OpenAI gpt-image-1**: "Billing hard limit reached" → capas caem no Cloudflare
  flux-schnell (grátis). Subir o teto em platform.openai.com para usar gpt-image-1.
- **Escrita (binário `claude` do worker)**: usa `ANTHROPIC_API_KEY` (crédito
  baixo) com precedência sobre o login Max. Para escrever via plano Max, **unset
  `ANTHROPIC_API_KEY`** no ambiente do worker; senão a escrita falha por crédito
  (não por preflight).
