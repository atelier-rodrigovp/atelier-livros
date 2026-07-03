# HANDOFF — Atelier de Livros IA
*Documento de transferência para uma nova sessão (Cowork/Fable). Leia isto primeiro, depois `CLAUDE.md` (raiz do repo) e `AUDITORIA-SKILLS-E-AGENTES.md`.*

---

## 0. O que é o Atelier (em 3 frases)
Plataforma que orquestra agentes do Claude Code para **escrever livros inteiros** com qualidade, capítulo a capítulo, de forma autônoma. Autor (Rodrigo) cria projetos por uma interface web; um **worker local** puxa uma fila de jobs e roda um **motor** (`livro_runner.py`) que delega a escrita a subagentes especializados. Objetivo declarado: livros que soem como um **autor real** (ex.: Dan Brown), não "IA competente e chata", e que a produção **escale** dentro da cota do plano Max.

---

## 1. MODELO DE TRABALHO (leia antes de qualquer coisa)
- **Cowork (você) escreve PROMPTS; o Claude Code na máquina do Rodrigo EXECUTA.** O fluxo do projeto inteiro é: você audita/planeja e entrega um prompt em bloco de código; ele cola no Claude Code (Windows), que lê/edita arquivos, roda, commita e reinicia o worker.
- **A sandbox do Cowork NÃO alcança:** o Supabase (sem DNS) nem o `WORK_DIR` (`C:/Users/Rodrigo Paiva/atelier-work`, não montado). Então **toda leitura de banco e de projeto vivo é delegada ao Code.** O que você alcança montado: o repo `ATELIER-LIVROS`, as pastas de autor em `LIVROS/`, a `Saga/`, e as skills read-only em `~/.claude/skills`.
- **Regras de ouro herdadas (não quebrar):**
  1. **Provar na PÁGINA, não no marcador.** Auditoria de "marcador presente" enganou duas vezes enquanto os livros saíam chatos. Toda validação de qualidade lê prosa gerada e a julga contra a craft.
  2. **Consertar no MOLDE, não na instância.** Fix por-projeto evapora; a correção durável vive no worker/na fábrica de fundação.
  3. **Durabilidade obrigatória:** edições de skill vivem FORA do git (`~/.claude/skills`) — têm que ser versionadas em `worker/skill-patches/` + `instalar-skills.ps1` + nota no `CLAUDE.md`, senão somem no próximo reinstall.
  4. **`book-bestseller-review` é honesto — nunca inflar a nota.**
  5. **Medir, não presumir.** A telemetria refutou a hipótese "óbvia" (não era o escritor relendo craft; era o orquestrador gerando inline).
  6. **Rodrigo detesta pergunta de enrolação e "resolvido" prematuro.** Seja decisivo, honesto sobre o que está provado vs. pendente, e proponha proativamente.

---

## 2. ARQUITETURA (o mapa)
```
IDEIA → [arquiteto-de-enredo] gera a FUNDAÇÃO (Bíblia, Estrutura, Mapa, perfil-de-voz, ESTADO_LIVRO.json, 5 agentes)
      → [livro-do-zero-ao-epub / livro_runner.py] MOTOR: ESTRUTURA→ESCRITA→CONSOLIDAÇÃO→REVIEW→REESCRITA→DESMANEIRISMO→EPUB
          por capítulo: contextualizador(haiku)→ escritor(opus)→ revisor(sonnet)→ editor(haiku); orquestrador(sonnet; opus nas fases inline pesadas)
      → [book-bestseller-review] juiz honesto (nota) → [edicao-kindle] EPUB
```
- **Front:** React+Vite+TS, GitHub Pages. **Dados:** Supabase (Postgres + Storage + Realtime). **Worker:** Node/TS em `worker/` (fila de jobs, "verdade do disco", anti-trapaça). **Motor:** `livro_runner.py` (asset da skill).
- **Escrita usa o plano Max** (o worker apaga `ANTHROPIC_API_KEY` para usar o login OAuth do Max, não a API paga). A cota **semanal** de tokens é o verdadeiro limite. Cifrões na telemetria são **proxy de ranking, não fatura.**

### Agentes (gerados por projeto; modelos pinados em `worker/src/modelos-agentes.ts`)
| Agente | Modelo | Função |
|---|---|---|
| livro-contextualizador | haiku | destila o *digest* de FATOS do capítulo |
| livro-escritor | **opus** (inegociável) | escreve a prosa; lê craft + digest + spec |
| livro-revisor | sonnet | crítico adversarial + de PROPULSÃO; edições cirúrgicas |
| livro-editor | haiku | aplica edições, grava o ledger `estado-narrativo.md` |
| livro-arquiteto-comercial | sonnet | audita TRAÇÃO macro nos checkpoints (não por capítulo) |

### Skills (em `~/.claude/skills`, fora do git)
- **arquiteto-de-enredo** (fábrica de fundação; v6.x monolítica). **⚠️ SKILL.md tem 3189 bytes NUL** — legível via `tr -d '\000'`, mas **quebra o editor**. Por isso as correções da fábrica vivem no worker (injeções determinísticas após `criar_fundacao`). **Regravar limpo é um pendente recomendado** (destrava editar o template do escritor na origem).
- **skill-dan-brown** (FORTE): motor (cap curto, corte no pico, relógio 12–48h, montagem paralela, cold open, caça a pistas) + 5 regras (`references/voz-e-oficio.md`, `metamodelo-thriller.md`).
- **hoover-mcfadden, skill-jk-rowling, vesper-escritor-de-capitulos, skill-romantasy** (todas FORTES; mesmo molde: SKILL.md + references/voz-e-oficio + assets). **Ainda não auditadas na página como a dan-brown foi** — alvo de auditoria.
- **book-bestseller-review** (juiz), **edicao-kindle** (EPUB), **livro-do-zero-ao-epub** (motor).

---

## 3. O QUE FOI FEITO NESTA SESSÃO (tudo commitado/no ar salvo nota)
**Confiabilidade:** auto-retomada real do limite do Max (para de morrer como "Erro"; contador de estagnação não é mais envenenado por throttle); contagem 0/32 corrigida (worker grava do disco; front usa max(cap_atual, chapters)); dedupe da fila; prioridade/pausa-por-projeto/concorrência (schema-free em `projects.briefing`/`jobs`).

**Anti-repetição / cadência** (`worker/src/maneirismo.ts` + espelho no runner): molds nomeados + n-grama genérico + **muletas ("coisa" ≤~1/cap)** + **família de cadência** (fragmentos colados, clipe de negação, anáfora, **símile-andaime "como se/como quando"**, **antítese com "haver"**, interioridade-sem-evento). Gate por capítulo + fase **DESMANEIRISMO** book-wide (itera até abaixo do orçamento).

**A CORREÇÃO DE RAIZ (a mais importante) — a craft chega à caneta:** o escritor lia só a fundação/digest (voz comprimida por haiku) e era mandado "não releia a fundação" → prosa genérica. Corrigido: o escritor agora **lê a craft inteira** (`voz-e-oficio.md` + `metamodelo` + bloco `CRAFT-SKILL` no perfil) por capítulo; o digest do haiku carrega só FATOS. Injeções determinísticas duráveis: `craft-skill.ts` (bloco CRAFT-SKILL por skill), `normalizarVozRegra4` (cota de cadência no perfil), model pins, guarda dos parágrafos-modelo. **Provado na página:** cold-open e revisão do cap 5 leem Brown.

**Eficiência (escala):** Fix A = `CLAUDE_CODE_MAX_OUTPUT_TOKENS=64000` (mata hard-fails de 32k); Fix B = revisão conta como progresso (mata a pausa falsa de ~15min, maior ganho de throughput); **Fix C** = orquestrador **delega** a revisão em vez de gerar inline (**−49% do output do orquestrador**, A/B medido, prosa/cadência em paridade, guarda determinística bounded). **Telemetria + painel Observabilidade** (custo/output por agente, gargalo destacado, restarts).

**Importados:** livros escritos fora do Atelier viviam só em banco/Storage, não no WORK_DIR → o worker não os enxergava (0/32, "fundação ausente"). Hidratação (`hidratarWorkDir`) baixa capítulos+fundação e semeia `ESTADO_LIVRO.json`. (Ver `CLAUDE.md`.)

---

## 4. ESTADO ATUAL — provado vs. pendente (honesto)
**Provado com evidência:** a craft chega ao escritor (prosa Brown na página); os 3 fixes de eficiência (números A/B); confiabilidade da retomada; detector de cadência/muleta.
**Pendente / a validar:**
1. **Números de PRODUÇÃO** (um livro real de ponta a ponta): confirmar Fix C e a qualidade num **capítulo de transição** (não só cold-open) + telemetria antes/depois. *Um único run fecha os dois loops.*
2. **Regravar `arquiteto-de-enredo/SKILL.md` sem os NUL** (destrava editar a fábrica na origem).
3. **~27 "calls sem rc"** (chamadas que morrem no meio) não 100% diagnosticadas — a telemetria agora captura; investigar no próximo run.
4. **Skills de autor além da dan-brown** (jk-rowling, hoover-mcfadden, romantasy, vesper): a correção da corrente vale pra todas, mas **não foram provadas na página** — auditar. ✅ **hoover-mcfadden e skill-romantasy AUDITADAS + FIADAS (2026-07-03, FASE HM/RM — ver `AUDITORIA-HOOVER-ROMANTASY.md`):** 5 SPECs (HM1/HM2/RM1/RM2/RM3) aplicadas e INSTALADAS em produção (backup `20260703143035`); as assinaturas estruturais viraram engenharia (`EXIGENCIAS_ESTRUTURAIS_POR_SKILL` + gate `EXIGE_SPEC` + `docsFundacao` genérico + ORC próprio da romantasy). Prova na página: 6/6 caps passam o detector, "coisa" 7/3/2→1/1/1, assinaturas com trecho. Faltam ainda **jk-rowling e vesper** (esqueleto no Anexo 4 do relatório: jk = registro plantar-e-pagar; vesper = léxico canônico + mapa de revelação).
5. **Importados sem fundação** (ex.: A Memória dos Outros, Vésper): precisam de reconstrução de fundação para refinar (avaliar já funciona).
6. **Lever de reserva:** passe de craft por capítulo (opus reescreve para propulsão) — se capítulos de transição saírem mornos.
7. **Worker auto-start** (prompt escrito — `PROMPT-CODE-WORKER-AUTOSTART.md`; confirmar se foi aplicado).

---

## 5. ALVOS DE AUDITORIA (alinhados ao objetivo do Rodrigo)
Ao pedir "audite o projeto, busque melhorias, valide integrações/conexões de agentes, analise e melhore as skills de escritor, e o funcionamento de todo o sistema", os fronts naturais:
- **Integrações/conexões:** a corrente skill→fundação→contextualizador→escritor→revisor→editor→juiz está toda fechada? (a de dan-brown está; confirmar nas outras skills e nos agentes GERADOS de um projeto vivo, não nos templates da Saga). Front↔Supabase↔worker↔runner: consistência de fonte (banco vs disco), realtime, hidratação.
- **Agentes:** cada um recebe o contexto certo? O revisor delegado (Fix C) pega **continuidade** tão bem quanto pegava inline? O contextualizador (haiku) preserva o que precisa?
- **Skills de escritor:** auditar na PÁGINA cada skill de autor (gerar 1 capítulo, criticar contra a craft dela) — não só ler o SKILL.md.
- **Sistema/eficiência:** ler o painel Observabilidade num run real; caps/hora, output por agente, burn semanal; achar o próximo gargalo com número.
- **Sempre:** read-only na análise; evidência citada (arquivo:linha + prosa); prova na página; proponha correção durável (molde, não instância); entregue como PROMPT pro Claude Code.

---

## 6. ONDE OLHAR (arquivos-chave)
- `CLAUDE.md` (raiz) — regras de produção, telemetria, skills, trava antivazamento, pins, cota de cadência, craft-skill. **É a fonte de verdade viva.**
- `AUDITORIA-SKILLS-E-AGENTES.md` — o mapa detalhado das skills e agentes.
- `worker/src/` — `jobs.ts` (executores), `index.ts` (loop/fila), `fila.ts` (picker), `maneirismo.ts` (detector), `modelos-agentes.ts` (pins), `craft-skill.ts`, `voz-regra4.ts`, `telemetria.ts`, `hidratar.ts`, `limite-max.ts`.
- `worker/skill-patches/` — as edições versionadas de skill/runner + `instalar-skills.ps1`.
- `worker/skill-patches/livro-do-zero-ao-epub/assets/livro_runner.py` — o motor.
- `src/pages/` — front (Projeto, Configuracoes, Observabilidade, Catalogo, Leitor).
- Os muitos `PROMPT-CODE-*.md` na raiz — histórico de prompts já rodados (referência do que já foi feito).

---

## 7. PRIMEIRA AÇÃO SUGERIDA PARA A NOVA SESSÃO
Peça ao Rodrigo qual front ele quer atacar primeiro (integrações, skills de escritor, eficiência, ou um livro específico), leia `CLAUDE.md` + `AUDITORIA-SKILLS-E-AGENTES.md` para contexto, e — como a sandbox não alcança banco/WORK_DIR — entregue um **prompt de auditoria read-only com evidência citada** para o Claude Code rodar na máquina dele. Nunca certifique "tudo certo" sem prosa gerada na mão.
