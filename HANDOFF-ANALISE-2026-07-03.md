# HANDOFF — Atelier de Livros IA · sessão de ANÁLISE (Cowork)
*Snapshot de 2026-07-03 (tarde). Leia isto primeiro, depois `CLAUDE.md` (raiz, fonte de verdade viva) e `AUDITORIA-HOOVER-ROMANTASY.md`. Para o histórico anterior, `HANDOFF-ATELIER.md`.*

---

## 0. O que é o Atelier (3 frases)
Plataforma que orquestra agentes do Claude Code para **escrever livros inteiros** com qualidade de autor real (não "IA competente e chata"), capítulo a capítulo, de forma autônoma. Autor (Rodrigo) cria projetos por uma UI web; um **worker local** puxa uma fila de jobs (Supabase) e roda um **motor** (`livro_runner.py`) que delega a escrita a subagentes (escritor **opus**, revisor sonnet, editor/contextualizador haiku). Objetivo: livros que soem como Dan Brown/Hoover/etc. e que a produção **escale** dentro da cota do plano Max.

## 1. MODELO DE TRABALHO (leia antes de agir)
- **Cowork (você) escreve PROMPTS; o Claude Code na máquina do Rodrigo EXECUTA.** Você audita/planeja e entrega prompts em bloco de código; ele cola no Code (Windows), que lê/edita/roda/commita/reinicia o worker.
- **A sandbox do Cowork NÃO alcança:** Supabase (sem DNS) nem o `WORK_DIR` (`C:/Users/Rodrigo Paiva/atelier-work`). Toda leitura de banco/projeto vivo é **delegada ao Code**. Você alcança montado: o repo `ATELIER-LIVROS`, as pastas de autor em `LIVROS/`, a `Saga/`, e as skills read-only em `~/.claude/skills`.
- **Regras de ouro (não quebrar):**
  1. **Provar na PÁGINA, não no marcador** — validação de qualidade lê prosa gerada e julga contra a craft.
  2. **Consertar no MOLDE, não na instância** — fix por-projeto evapora; a correção durável vive no worker/na fábrica.
  3. **Durabilidade:** edições de skill vivem fora do git (`~/.claude/skills`) → versionar em `worker/skill-patches/` + `instalar-skills.ps1` + nota no `CLAUDE.md`.
  4. **`book-bestseller-review` é honesto — nunca inflar nota.**
  5. **Medir, não presumir.**
  6. **Rodrigo detesta pergunta de enrolação e "resolvido" prematuro.** Seja decisivo; honesto sobre provado vs. pendente; proponha proativamente.

## 2. ARQUITETURA (o mapa)
```
IDEIA → [arquiteto-de-enredo] gera a FUNDAÇÃO (Bíblia, Estrutura, Mapa, perfil-de-voz, ESTADO_LIVRO.json, 5 agentes)
      → [livro-do-zero-ao-epub / livro_runner.py] MOTOR: ESTRUTURA→ESCRITA→CONSOLIDAÇÃO→REVIEW→REESCRITA→DESMANEIRISMO→EPUB
          por capítulo: contextualizador(haiku)→ escritor(OPUS)→ revisor(sonnet)→ editor(haiku); orquestrador(sonnet; opus nas fases inline pesadas)
      → [book-bestseller-review] juiz honesto → [edicao-kindle] EPUB
```
- **Front:** React+Vite+TS (GitHub Pages). **Dados:** Supabase (Postgres+Storage+Realtime). **Worker:** Node/TS em `worker/` (fila, "verdade do disco", anti-trapaça). **Motor:** `livro_runner.py` (asset da skill `livro-do-zero-ao-epub`).
- **Escrita usa o plano Max** (o worker apaga `ANTHROPIC_API_KEY` p/ usar o OAuth do Max). A cota **semanal** é o limite real; cifrões na telemetria são **proxy de ranking, não fatura**.
- **Corrente da craft (fechada):** o escritor lê a craft da skill (`voz-e-oficio.md`/`metamodelo` + bloco `CRAFT-SKILL v2` no perfil, com **ORÇAMENTO DE PÁGINA**); o digest do haiku carrega só FATOS. Injeções determinísticas após `criar_fundacao` e no início de `escrever_livro` (idempotentes por marcador): `craft-skill.ts`, `craft-agentes.ts`, `voz-regra4.ts`, `modelos-agentes.ts`, `exigencias-skill.ts`.

## 3. ESTADO ATUAL (2026-07-03, pós FASE HM/RM) — honesto

**Fiação por skill (o eixo do trabalho recente):** o mecanismo genérico `EXIGENCIAS_ESTRUTURAIS_POR_SKILL` (`worker/src/exigencias-skill.ts`) + gate `EXIGE_SPEC_POR_SKILL` no runner + `ORC_CADENCIA_POR_SKILL` (`maneirismo.ts`) transformam as assinaturas de gênero de **emergentes** (iniciativa do opus) em **engenharia**. **Skill sem entrada = NO-OP absoluto.**

| Skill | Fiada? | Eixo de assinatura |
|---|---|---|
| skill-dan-brown | ✅ (1ª) | rotação de fios + dossiê factual |
| hoover-mcfadden | ✅ (2ª, HM1/HM2, hoje) | relógios nomeados + narradora + pistas + DIA/HORA + presente |
| skill-romantasy | ✅ (3ª, RM1/RM2/RM3, hoje) | POV duplo + custo-escala + slow burn + ORC próprio (frase-soco BookTok) |
| skill-jk-rowling | ⬜ pendente | plantar-e-pagar (esqueleto no Anexo 4 do relatório) |
| vesper | ⬜ pendente | léxico canônico + mapa de revelação (idem) |

- **FASE HM/RM instalada em produção hoje** (backup `~/.claude/skill-backups/20260703143035/`; diff patch↔instalado vazio; worker reiniciado 17:30:38Z). Prova em 3 níveis: determinístico (vitest 138, gate py 13/13, sweep 14/14), voz direta (RM3 antes/depois) e geração (2 subagentes opus, 6/6 caps passam, "coisa" hoover 7/3/2→1/1/1). Ver `AUDITORIA-HOOVER-ROMANTASY.md`.
- **Interface generalizada:** `docsFundacao?` (verifica presença arquivo-ou-marcador e SINALIZA ausência, **nunca gera** — quem gera é o arquiteto); `dossie:boolean` do dan-brown intacto.
- **14 commits locais NÃO-PUSHADOS** (`origin/master..HEAD`, de `0c71887` a `dbaa7e5`). Push retido aguardando autorização do autor com provas à vista.

## 4. ALVOS DE ANÁLISE ABERTOS (prioridade p/ a nova sessão)

**#1 — PRODUÇÃO GLOBALMENTE PAUSADA (RESOLVIDO o diagnóstico; ação = decidir religar).** O job `e45d6f6e` (projeto `53abdade`, "O Índice dos Abduzidos", dan-brown, 20/60 caps) não retomava após o limite do Max. **Causa raiz (confirmada por SELECT read-only):** a flag global `worker_control.enabled = false` (setada 2026-07-03T13:12:34Z / 10:12 local, via o toggle da web "liga/pausa TODO o processamento"). Com ela `false`, `processamentoAtivo()` (`worker/src/index.ts:127`) retorna false e o loop pesado só faz `heartbeat({estado:"paused"})` + sleep — **não reivindica nada** e não loga. Descartado como causa: fila (o picker `escolherProximo` RETORNA `e45d6f6e`; há 3 candidatos claimables), rede (Supabase 401/38ms), worker morto (1 instância viva), o deploy HM/RM (foi 17:30Z, ~4h depois da pausa). **NÃO é bug — é o toggle desligado.** **Ação:** religar a produção = ligar o toggle na web (ou `UPDATE worker_control SET enabled=true WHERE owner=<OWNER>`), **se a pausa não for intencional**. Ao religar, o worker reivindica `e45d6f6e` e retoma o cap 21 no runner NOVO (fecha a prova do deploy end-to-end). Confirmar com o Rodrigo antes de religar (pode ter pausado de propósito p/ economizar cota).

**#2 — jk-rowling e vesper (fechar o padrão das 6 skills).** Replicar a metodologia HM/RM: auditar na página (anatomia + 3 caps opus) e popular as entradas. Esqueleto no **Anexo 4** de `AUDITORIA-HOOVER-ROMANTASY.md` (jk = registro plantar-e-pagar via `docsFundacao`; vesper = léxico canônico como arquivo-fonte + mapa de revelação; verificar se vesper precisa de ORC próprio).

**#3 — Re-medição da telemetria.** O baseline do "diagnóstico medido" no `CLAUDE.md` está **INVALIDADO** (o processo em produção era código anterior aos fixes A/B). Com ~1 dia de produção consolidada no HEAD, re-medir pelo painel **Observabilidade** (custo/output por agente, gargalo, restarts, calls-sem-rc) e confirmar Fix B/C na prática.

**#4 — ~27 "calls sem rc"** (chamadas do runner que morrem no meio) não 100% diagnosticadas — a telemetria captura; investigar num run real.

**#5 — Regravar `arquiteto-de-enredo/SKILL.md` sem os NUL** (destrava editar o template do escritor na origem; hoje as correções vivem no worker por causa disso).

**#6 — Números de PRODUÇÃO ponta a ponta** (um livro real completo): confirmar qualidade num **capítulo de transição** (não só cold-open) + telemetria antes/depois.

## 5. ONDE OLHAR (arquivos-chave)
- `CLAUDE.md` — fonte de verdade viva (produção, telemetria, skills, trava antivazamento, pins, cota de cadência, craft-skill, **nota FASE HM/RM**).
- `AUDITORIA-HOOVER-ROMANTASY.md` — a auditoria/specs/prova mais recente (metodologia replicável para jk/vesper).
- `worker/src/` — `exigencias-skill.ts` (fiação por skill), `maneirismo.ts` (detector cadência/muleta + ORC por skill), `craft-skill.ts`, `craft-agentes.ts`, `voz-regra4.ts`, `modelos-agentes.ts`, `fila.ts` (picker), `jobs.ts` (executores), `index.ts` (loop/fila), `limite-max.ts`, `telemetria.ts`, `hidratar.ts`.
- `worker/skill-patches/livro-do-zero-ao-epub/assets/livro_runner.py` — o motor (gates `gate_spec_capitulo`, `EXIGE_SPEC_POR_SKILL`, `CAD_POR_SKILL`, `_sem_acento`).
- `worker/skill-patches/instalar-skills.ps1` — reaplica patches de skill sobre `~/.claude/skills` (com backup). Rodar após qualquer edição de skill/runner.
- `src/pages/` — front (Projeto, Configuracoes, Observabilidade, Catalogo, Leitor).

**Acesso ao sistema vivo (só via Code, não Cowork):** WORK_DIR `C:/Users/Rodrigo Paiva/atelier-work/<project_id>/` (tem `ESTADO_LIVRO.json`, `runner.log`, `specs/`, `capitulo-NN.md`, `dossie-factual.md`). Worker: Scheduled Task `AtelierWorker` → `worker/autostart/worker-wrapper.cmd` → `node --import tsx src/index.ts` (log em `worker/worker.log`, timestamps UTC). Restart limpo = `Stop-ScheduledTask AtelierWorker` + matar node index.ts + `Start-ScheduledTask`. `claude.exe` real: `~/AppData/Roaming/npm/node_modules/@anthropic-ai/claude-code/bin/claude.exe` (NUNCA `claude.cmd` — trunca no 1º newline). Throttle-check da cota: `ANTHROPIC_API_KEY= <claude.exe> -p "OK" --model sonnet`.

## 6. PRIMEIRA AÇÃO SUGERIDA
Peça ao Rodrigo qual front atacar (resume-anomaly #1 é a mais quente e bloqueia a produção; ou jk/vesper #2; ou telemetria #3). Leia `CLAUDE.md` + `AUDITORIA-HOOVER-ROMANTASY.md`. Como o Cowork não alcança banco/WORK_DIR, entregue um **prompt de análise read-only com evidência citada** (arquivo:linha + prosa/estado do disco) para o Code rodar. Nunca certifique "tudo certo" sem estado real lido na mão.
