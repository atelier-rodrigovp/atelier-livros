# HANDOFF — Atelier de Livros IA

**Data:** 2026-07-02 (manhã; seção 0 nova). **Autor do handoff:** sessão Claude Code.
**Para:** próximo eu / próximo engenheiro. Leia junto com `CLAUDE.md` (raiz), a memória
em `~/.claude/projects/<este-projeto>/memory/` e `AUDITORIA-BASE-SISTEMA.md`.

---

## 0. ATUALIZAÇÃO 2026-07-02 — Auditoria da base + FASE B (leia primeiro)

Auditoria de 4 fronts em `AUDITORIA-BASE-SISTEMA.md`; SPECs 01–06 aprovadas,
implementadas, commitadas (SEM push) e **aplicadas em produção** às ~10:38:

- **Descoberta P0 que muda o diagnóstico anterior:** o worker estava MORTO desde
  01/07 23:44 (crash de startup pós-reboot + task sem auto-restart) e os fixes
  A/B/honestidade do dia 01/07 **nunca tinham rodado** (commit ≠ produção). E a
  "morte intermitente" dos runs NÃO era rede: era `UnicodeEncodeError` (stdout
  **cp1252** do python; ✓/→/emoji matava o `log()` antes de logar o rc).
- **Aplicado:** SPEC-01 startup resiliente + `worker/autostart/` (wrapper com
  auto-restart + anti-duplicata; task re-registrada — provado: kill → reergue em
  15s, 1 instância); SPEC-02 `PYTHONUTF8=1` + `log()` grava antes do print + rc/err
  em todo retorno; SPEC-03 `retry.ts` (writes idempotentes; claim FORA; blip de rede
  = re-enfileira sem queimar tentativa, rótulo honesto); SPEC-04 cota de cadência
  completa (RE_LEGADO por completude); SPEC-05 `ORC_CADENCIA_POR_SKILL` + diálogo
  fora dos tiques (espelho TS↔python com paridade provada); SPEC-06 `CRAFT-SKILL v2`
  (ORÇAMENTO DE PÁGINA na caneta; −70% de muletas na origem em 2 gerações de prova).
  Commits: `0c71887 0ad0a49 578be9e 859c5f3 6fd8f78 82046a7`. Runner reinstalado
  (diff vazio); produção religada; job `e45d6f6e` retomado no cap 7 (revisão).
- **Dívidas:** SPEC-07 (paridade plena do Fix C no revisor: continuidade dura, voz
  fora do perfil, moldes nomeados), SPEC-08 (token estrangeiro "ninguño" invisível
  aos gates), SPEC-10 (zero-pad do digest no runner), SPEC-11 (trocar a senha
  `<SENHA_DO_APP>` exposta em 10 docs versionados), SPEC-12 (timestamps no
  worker.log); **teste de Wi-Fi da SPEC-03: ✓ PASSOU** (02/07 ~12:16, queda real de
  ~90s durante a escrita do cap 8: PID intacto, attempts=0, zero "erro de escrita no
  banco", heartbeat agregado "voltou após 10 falha(s)", call do Claude em voo
  sobreviveu e o job seguiu running);
  residual "coisa" ~2×/cap na origem — lever seguinte é o Fix D
  (`--revisor-craft-opus`); 2 jobs queued do MESMO projeto `da74a71e` (picker não
  duplica execução, mas vale limpar); **re-medir telemetria com o HEAD** (baseline
  antigo INVALIDADO pelo P0-3). Sem push ainda — pedir confirmação.

---

## 1. O que é

Plataforma pessoal que orquestra agentes do Claude Code para **escrever livros inteiros**.
- **Front:** React+Vite+TS+Tailwind+shadcn em `src/`. Deploy: **GitHub Pages**
  (`atelier-rodrigovp.github.io/atelier-livros`) — rebuild no push pra `master`.
- **Dados:** Supabase (projects, editions, chapters, jobs, artifacts, worker_heartbeats).
- **Worker:** Node/tsx local em `worker/` (fila de jobs, roda na máquina logada no plano Max).
- **Motor de escrita:** `livro_runner.py` (Python) dentro da skill `livro-do-zero-ao-epub`.
- **"Verdade do disco":** o worker/runner conferem ARQUIVOS reais antes de gravar status.

## 2. Estado ATUAL (o que está rolando agora — honesto)

- **Job em produção:** `e45d6f6e` (escrever_livro) do projeto **53abdade — "O Índice dos
  Abduzidos"** (skill-dan-brown, 60 caps). Está no **cap 7/60**.
- **Worker:** no ar (foi reiniciado várias vezes hoje; PID muda). Job **elegível** (queued,
  sem retry).
- **Conta Max:** esgotou a cota à noite e **resetou ~23:20** (America/Sao_Paulo). Cota de volta.
- **⚠️ Ambiente instável hoje:** a conexão Supabase da máquina está com `fetch failed`
  recorrente (ver worker.log). Isso **atrasa o worker pegar jobs** e é a **suspeita nº1 da
  "morte intermitente" dos runs** (ver §5). É rede/ambiente, **não** bug de código.

## 3. Arquitetura da escrita (como um livro é produzido)

1. **Fundação** (`criar_fundacao`): skill `arquiteto-de-enredo` gera Biblia/Mapa/Estrutura/
   perfil-de-voz + **5 agentes** em `<WORK_DIR>/<id>/.claude/agents/` (livro-escritor,
   livro-revisor, livro-editor, livro-contextualizador, livro-arquiteto-comercial).
2. **Escrita** (`escrever_livro`): o worker invoca `livro_runner.py`. O runner tem um
   `while True` com fases (ESTRUTURA→ESCRITA→CONSOLIDACAO→REVIEW→REESCRITA→DESMANEIRISMO→
   EPUB→CONCLUIDO). Na ESCRITA, por capítulo: **micro-loop** contextualizador→escritor→
   revisor→editor via subagentes (Task).
3. **Modelo por papel** (pinado em `worker/src/modelos-agentes.ts`): **escritor=opus**
   (inegociável), revisor=sonnet, editor=haiku, contextualizador=haiku. **Orquestrador da
   sessão = sonnet** (`MODEL_ORQUESTRADOR`); fases inline pesadas (ESTRUTURA/REVIEW/REESCRITA)
   sobem pra opus (`--model-pesado`).
4. **Corrente de craft** (a voz da skill chega à caneta): o escritor lê `voz-e-oficio.md` +
   `metamodelo-thriller.md` + bloco CRAFT-SKILL **direto** (nunca comprimido por haiku). Ver
   `worker/src/craft-*.ts` e a seção da craft no CLAUDE.md.

## 4. O que foi feito NESTA sessão (eficiência + observabilidade)

Investigação: o sistema não escalava (85% da cota semanal sumia; ~5-6 caps em ~14h).
**Medi por agente** (parseando os transcripts `~/.claude/projects/<cwd>/**/*.jsonl`, que têm
`model`+`isSidechain`+`usage`+`subagent_type`). **Vilão real ≠ hipótese:** não é o escritor
relendo a craft (cache_read ~85% absorve; escritor ~$39/livro). É:

| Fix | Commit | O quê |
|---|---|---|
| **A** | e6b68fc | `CLAUDE_CODE_MAX_OUTPUT_TOKENS=64000` no worker (`index.ts`) — mata os hard-fails de 32k (default 32000 estourava o micro-loop → rc=1 → ~40min jogados fora). |
| **B** | 5801351 | `jobs.ts`: conta `review/_revcap-NN.done` (revisão) como PROGRESSO → mata a pausa falsa de ~15min (o worker só contava capítulo NOVO). |
| **C** | 4dc844e | `livro_runner.py` `prompt_revisao_capitulo` **DELEGA** a crítica (livro-revisor) e a aplicação (livro-editor) em vez do orquestrador raciocinar inline. **A/B mediu −49% do output do orquestrador**, paridade de cadência/prosa/continuidade. Tem **guarda determinística no runner** (não o LLM): confere piso + `estado-narrativo.md` atualizado + rerroda `cadencia_acima` (tiques caíram?); bounded via `_revcap-NN.try`. |
| **Painel** | e6b68fc, 290a37c | Aba **Observabilidade** (`src/pages/Observabilidade.tsx`): telemetria por agente (gargalo destacado, restarts, falso-limite/32k-fail) + seção **"Em produção agora"** (consumo AO VIVO dos projetos escrevendo: tokens/cap, projeção, estado do job). |
| **Honestidade** | 1e92acd | "run interrompido sem progresso" **≠** "limite do plano Max": `LimiteMaxError` ganhou `motivo`/`aguardandoReset`; o branch "não avançou" agora re-tenta em ~2min com rótulo honesto (era 15min mentindo "limite do Max"). O limite REAL (reset parseado) segue intacto. |

Instrumentação vive em `worker/src/telemetria.ts` (testado); persiste schema-free numa linha
`jobs` (`tipo='telemetria'`). Backfill: `WORK_DIR=<real> npx tsx worker/scripts/backfill-telemetria.ts`.

**Prova de que funciona (A/B + run manual):** o runner novo revisou o cap 6 (guarda: tiques
40→17, piso ok, ledger ok) e escreveu o cap 7. Sem crash.

## 5. Problemas conhecidos / fios em aberto

- **Morte intermitente dos runs (ABERTO, provável ambiental):** ~alguns runs do worker
  morrem no meio (~5min) sem completar o passo → progresso zero. No diagnóstico original,
  30/41 chamadas morriam. Fixes A/B/C reduziram custo e a pausa falsa, mas a MORTE em si
  persiste. Suspeita nº1: **conexão Supabase/rede instável** (os `fetch failed` no worker.log).
  Um run **manual** (mesmo código/env) completou sem morrer → reforça a hipótese ambiental.
  **Próximo passo sugerido:** adicionar retry/backoff nas queries do picker/setProgress pra
  tolerar `fetch failed`, e/ou investigar a rede da máquina.
- **`claude` no Windows:** o worker usa `CLAUDE_BIN` = caminho COMPLETO do `claude.exe`
  (`worker/.env`). NÃO usar `claude.cmd` via subprocess — o shim batch **trunca o prompt no
  primeiro newline** (mordi essa isca no A/B; perdi um run).
- **Livros importados:** `hidratarWorkDir` baixa capítulos/fundação do Storage pro WORK_DIR
  (o worker lê o disco). Ver seção no CLAUDE.md.
- **Bloqueios de IA:** gpt-image-1 no "billing hard limit" (capas caem no flux-schnell grátis);
  escrita via Max exige `ANTHROPIC_API_KEY` UNSET (senão cobra crédito de API).

## 6. Runbook (comandos)

- **Reiniciar o worker** (após mudar código do worker):
  ```powershell
  Get-CimInstance Win32_Process -Filter "Name='node.exe'" | ? { $_.CommandLine -match 'index\.ts' } | % { Stop-Process -Id $_.ProcessId -Force }
  Start-ScheduledTask -TaskName 'AtelierWorker'
  ```
- **Reaplicar edições de skill** (após editar `worker/skill-patches/…`): rodar
  `worker/skill-patches/instalar-skills.ps1` (faz backup; copia pra `~/.claude/skills`).
  **Sempre rodar após editar `livro_runner.py`** — o runner de produção é o INSTALADO.
- **Testes/tipos do worker:** `cd worker && npx vitest run && npx tsc --noEmit`.
- **Build do front:** `npm run build` (na raiz).
- **A conta está throttada?** `claude -p "OK" --model sonnet` (com `ANTHROPIC_API_KEY` unset).
  Responde = não throttada.
- **WORK_DIR real:** `C:/Users/Rodrigo Paiva/atelier-work/<project_id>` (FORA do repo).
- **Transcripts (telemetria):** `~/.claude/projects/C--Users-Rodrigo-Paiva-atelier-work-<id>/`.
- **Logs:** worker → `worker/worker.log`; runner por projeto → `<WORK_DIR>/<id>/runner.log`.

## 7. Gotchas (não-óbvios)

- Editar `livro_runner.py` em `worker/skill-patches/` **não** vale até rodar `instalar-skills.ps1`
  (produção usa o instalado, via `RUNNER_PATH`).
- O `SKILL.md` do `arquiteto-de-enredo` foi regravado sem os 3189 NUL (agora editável).
- Escritor **sempre opus**. Não inflar `book-bestseller-review`. Não comprimir a voz em digest.
- Guarda do Fix C é **bounded**: 1 re-revisão dirigida (marcador `.try`), 2ª aceita com aviso.
- Segredos: `service_role` só no `worker/.env`; nunca imprimir valores de chave.
- Idioma: respostas em pt-BR; código/paths/identificadores em inglês quando o codebase usa.

## 8. Próximos passos sugeridos (prioridade)

1. **Endurecer o worker contra `fetch failed`** (retry/backoff nas queries do picker/setProgress)
   — endereça a raiz da morte intermitente e do atraso de pickup. **Maior ganho restante.**
2. **Comparar telemetria antes×depois** num livro real de produção (não só o A/B) — fechar o
   ciclo com números de produção; o painel "Em produção agora" já mostra isso ao vivo.
3. (Opcional) Fix D: se capítulos de transição saírem "competentes mas mornos", ligar o passe
   de propulsão em opus no revisor (`--revisor-craft-opus`, hoje default off).
4. Promover os controles schema-free (prioridade/pausa/telemetria em `jobs`/`briefing`) a
   colunas reais quando houver DDL (ver `supabase/producao.sql`, opcional).

## 9. Commits desta sessão (mais recentes primeiro)

- `1e92acd` fix(honestidade): "run sem progresso" ≠ "limite do Max"
- `290a37c` feat(observabilidade): seção "Em produção agora"
- `4dc844e` feat(fix-c): orquestrador DELEGA a revisão + guarda determinística
- `5801351` fix(throughput): revisão conta como progresso (mata falso "limite do Max")
- `e6b68fc` feat(observabilidade): telemetria por agente + painel + Fix A (32k)
