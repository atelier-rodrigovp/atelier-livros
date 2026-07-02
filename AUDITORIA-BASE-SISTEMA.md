# AUDITORIA-BASE-SISTEMA — Atelier de Livros IA

**Data:** 2026-07-02 (madrugada/manhã). **Método:** FASE A read-only, 4 fronts auditados em
paralelo por subagentes (robustez do worker, corrente skill→fundação→agentes→runner num
projeto VIVO, skills de autor provadas NA PÁGINA, segurança), consolidados pelo orquestrador.
Nada do sistema foi editado; o job em produção `e45d6f6e` (projeto `53abdade`) não foi tocado.
Prosas de teste e wrappers vivem no scratchpad da sessão (fora do repo).

**Veredito em uma linha:** a base é sã — corrente de craft fechada no projeto vivo, segurança
limpa (zero P0/P1), skills entregando assinatura na página (3 SIM, 1 PARCIAL) — mas a
**produção está parada agora** (worker morto desde 01/07 23:44) e a "morte intermitente" dos
runs tem causa-candidata nova e específica (encoding cp1252, não rede).

---

## 0. AÇÃO OPERACIONAL PENDENTE (antes de qualquer spec)

**O worker está MORTO e a fila parada.** Reboot sujo 01/07 23:43:51 (Event Log 6008) →
Scheduled Task `AtelierWorker` disparou no logon 23:44:00 **antes da rede subir** →
`verificarConexao` falhou 1× → `process.exit(1)` (`worker/src/index.ts:326-329`) → task sem
auto-restart → nenhum processo do worker desde então (verificado 02/07 06:52). O job
`e45d6f6e` está com `retry_at` vencido e ninguém o processa.

Agravante: o processo que rodou 30/06–01/07 era **código anterior aos fixes A/B/honestidade**
(prova: o log imprime `"aguardando reset até"` — string que não existe no HEAD; hard-fails de
32k DEPOIS do Fix A commitado). Os fixes estão no HEAD mas **nunca rodaram em produção**.
Reerguer o worker também os coloca no ar pela primeira vez.

Comando (runbook oficial do HANDOFF; **aguarda "confirmado"** por ser ação irreversível):
```powershell
Start-ScheduledTask -TaskName 'AtelierWorker'
```

---

## 1. Achados ranqueados

### P0

| # | Achado | Front | Evidência-chave |
|---|--------|-------|-----------------|
| P0-1 | **Worker morre no boot por falha transitória e nada o reergue.** `verificarConexao` (index.ts:187-197) + `loop().catch(e => process.exit(1))` (index.ts:326-329) + task `AtelierWorker` sem auto-restart ("Último resultado: 1"). Produção parou em silêncio. | Robustez | tail do worker.log 01/07 23:45:15 (`TypeError: fetch failed` em verificarConexao); Event Log 6008 23:43:51; task start 23:44:00; zero processo `tsx src/index.ts` em 02/07 06:52 |
| P0-2 | **"Morte intermitente" dos runs NÃO é rede: o python do runner morre em silêncio ~6–12min dentro da call, e o worker descarta o diagnóstico.** 31/44 calls sem rc no runner.log do 53abdade. Correlação com fetch failed: NEGATIVA (mortes da madrugada 01/07 em janela sem falha de heartbeat). Causa-candidata forte: `UnicodeEncodeError` — `log()` do runner faz `print(flush=True)` antes de gravar o arquivo, e o stdout do python spawnado é **cp1252 errors=strict** (confirmado na máquina); um ✓/→/emoji no resumo do Claude mata o processo entre o retorno da call e o log do rc. Sugestivo: 0 das 247 linhas sobreviventes do runner.log contém caractere fora do cp1252. O caminho `LimiteMaxError` do worker descarta `r.code`/`r.err` — cegueira de diagnóstico. | Robustez | runner.log: `05:07:11 Disparando Claude` → fim abrupto → `05:22:55 === runner v2 iniciado`; `livro_runner.py:92-99`; `locale.getpreferredencoding(False) = cp1252` |
| P0-3 | **Divergência doc↔produção: Fixes A/B/1e92acd commitados mas nunca executados em produção** (CLAUDE.md/HANDOFF dizem "aplicados"). Toda a evidência de 30/06–01/07 veio de código antigo. | Robustez | string `"aguardando reset até"` no log inexistente no HEAD; 32k-fails 30/06 19:26+ após Fix A (e6b68fc 01/07 10:50) |

### P1

| # | Achado | Front | Evidência-chave |
|---|--------|-------|-----------------|
| P1-1 | **Blip de rede consome tentativa de job com trabalho íntegro no disco.** `must()` (jobs.ts:130-135) e `uploadFile` (lib.ts:136-148) sem retry: 1 `fetch failed` na gravação pós-runner ⇒ attempts++ ⇒ 3 azares = job `error` (horas de runner intactas no disco, ignoradas). `finalizar` (index.ts:182-185) engole erro ⇒ job órfão `running` por 15min. 321 `fetch failed` no worker.log (319 de heartbeat). Único retry existente: `upsertCapResiliente` (jobs.ts:659-670) — o modelo a replicar. | Robustez | worker.log l.233-234: `falha ao gravar status final` + `erro (tentativa 1): erro de escrita no banco: TypeError: fetch failed` |
| P1-2 | **COTA-CADENCIA v1 suprimida em projetos novos por falso-positivo do `RE_LEGADO`.** O arquiteto v6.3 emite cota PARCIAL nativa ("nunca dois colados", "Cota de tiques") que casa com `RE_LEGADO` (`voz-regra4.ts:25`) ⇒ `jaTemCota()` true ⇒ injeção completa suprimida. O escritor de projetos novos NÃO recebe anáfora ≤1, clipe ≤1, staccato, "coisa" ≤1/cap como alvo positivo — só descobre quando o gate reprova. Custo medido: cap 6 do 53abdade aceito com "cadencia excesso 40→17" (o micro-loop pagou a conta). | Integrações | marcador AUSENTE no perfil-de-voz.md e Estrutura-do-Livro.md do 53abdade; perfil §1 l.25 e Estrutura l.115 (cota nativa parcial) |
| P1-3 | **`ORC_CADENCIA` único criminaliza a voz correta das skills de cadência rápida.** Capítulo hoover-mcfadden que CUMPRE a craft ("curta e cheia") reprova no detector: staccato 47,6% (alvo 35%), fragmentos colados 24, fragmento de ênfase 38 — contando **falas de diálogo** como fragmento. Em produção, gate por capítulo + DESMANEIRISMO forçariam a skill a desfazer a própria assinatura. | Skills | detector sobre `hoover-mcfadden/capitulo-teste.md`: `acima=true` com 6 tiques, todos coerentes com a craft da skill |
| P1-4 | **A craft qualitativa não segura o opus sem números: muletas estouram NA ORIGEM.** 3 dos 4 capítulos de teste saíram com "coisa" ≥2× (vesper e hoover 5×!), símile-andaime >1 (vesper 3×), antítese/anáfora acima — mesmo com as references lidas na íntegra. O alvo numérico do orçamento chega ao gate mas não à caneta. | Skills | vesper: maneirismo 70,6/10k (pior dos 4); hoover: "coisa" 5×; romantasy: anáfora 5 |

### P2

| # | Achado | Front |
|---|--------|-------|
| P2-1 | Fix C perdeu 3 critérios do inline antigo no revisor delegado: continuidade dura de FATOS, voz fora do perfil (perfil-de-voz nem está nas Fontes do revisor), moldes nomeados (símile-andaime/eco de negação/antítese-haver nunca entram na evidência da revisão). | Integrações |
| P2-2 | Banda de palavras conflitante na mesma fundação: CRAFT-SKILL diz "1.300–2.200", Estrutura/agente cobram "1.800–2.700, piso 1.800". Um capítulo de 1.500 "conforme a craft" queimaria um run. | Integrações |
| P2-3 | Digest sem zero-pad: runner gera `contexto-cap-7.md`, agentes esperam convenção `NN` (`contexto-cap-07.md`). Hoje inócuo (nome exato vai no prompt). | Integrações |
| P2-4 | Token estrangeiro/typo de geração invisível a TODOS os gates: capítulo vesper saiu com **"ninguño"** — chegaria ao EPUB. | Skills |
| P2-5 | Senha do app (`<SENHA_DO_APP>`) em texto claro em 10 docs versionados (`docs/prompts/PROMPT-CODE-*.md`). Repo privado + RLS mantêm em P2; sobe a P1 se o repo for público. | Segurança |
| P2-6 | `.gitignore` sem `*.orig.bak` e `__pycache__` (o `__pycache__` do skill-patch já aparece untracked). | Segurança |
| P2-7 | Gate de compilação com degrade silencioso: `if (!existsSync(GATE_SCRIPT)) return;` (jobs.ts:121) — se `tools/` mover, o gate some sem aviso (mitigante: sanitize+metaResidual por capítulo continuam). | Segurança |
| P2-8 | `auditar-vazamentos.ts` escreve por padrão (regrava capítulos + upsert no Storage), sem `--dry-run` — não pôde ser rodado na auditoria. | Segurança |
| P2-9 | Higiene de observabilidade: heartbeat poluindo o log (319 linhas idênticas), `setProgress` com erro nem lido, mojibake do redirect da task (`>>` cmd sem UTF-8), worker.log sem timestamps próprios (dificultou a forense). | Robustez |
| P2-10 | Guarda do Fix C aceita queda PARCIAL de tiques (40→17), não "abaixo do orçamento" — coerente com o design bounded, mas capítulo aceito ≠ dentro do orçamento (DESMANEIRISMO é a garantia final). Registrado como característica, não defeito. | Integrações |

### Observação a verificar (fora do disco)

**3 projetos homônimos** "O Índice dos Abduzidos" no WORK_DIR (`53abdade` 7/60 vivo, `81696863`
5/60, `a9947ca4` ?/44). O picker desduplica por `project_id`, não por título — se mais de um
estiver ativo no banco, duas versões do mesmo livro podem ser escritas em paralelo. Não
verificável sem consulta ao banco (nenhum script read-only genérico existe em `worker/scripts/`).

### Limpos (com prova de onde se procurou)

- **Segurança/segredos:** zero valor hardcoded (greps por `service_role|sbp_|sk-ant|eyJ…` no
  repo e `git log -S` no histórico → só placeholders dos `.env.example`, commit `f236fe4`
  verificado); `.gitignore` cobre `worker/.env`/`.env*`/logs/audit-backup; nenhum log/telemetria/
  front imprime env (grep `console.*(process.env)` → 0; front usa só `VITE_*` anon).
- **Trava antivazamento intacta:** preflight falha alto (jobs.ts:64-74, chamado em :691, sem
  commit recente tocando); `sanitizarCapitulo` no caminho de gravação (jobs.ts:79-96 com
  hard-fail `metaResidual`, chamadas em :716/:802/:872/:1043/:1277…) com **10/10 testes verdes**;
  `gate_manuscrito.py` presente e invocado pelo worker (jobs.ts:59/:874/:1054/:1288). Nota de
  fiação: o gate antivazamento por capítulo é o sanitize+metaResidual do WORKER; o gate do
  runner é o de maneirismo (qualidade) — cobertura completa, fiação diferente da assumida.
- **Injeção de comando:** único spawn é `lib.ts:41` com `shell:false`; dados do banco nunca
  viram argv (só conteúdo de prompt `-p`); runner python usa `subprocess.run` com lista.
- **Corrente no projeto vivo (53abdade):** pins de modelo 5/5 corretos; CRAFT-LEITURA v1 no
  escritor (l.40, com neutralização explícita do "não releia"); PROPULSAO v1 no revisor (l.37);
  digest "só FATOS" (l.9/l.33); CRAFT-SKILL v1 (perfil l.82) + GUARDA-MODELOS v1 (l.41);
  runner instalado **byte-idêntico** ao patch; evidência do detector chega ao revisor delegado
  (blocos byte-idênticos ao inline antigo); guarda determinística funcionando ao vivo
  (runner.log:241 "cap 6 revisado (delegado) → aceito. cadencia excesso 40→17");
  disco↔estado consistente no 53abdade (7 caps ≥1800 palavras = `capitulos_aprovados: 7`) e
  no importado hidratado 247c5aeb "A Casa que Conta" (32/32 + mestre 100.689 palavras).
- **Rótulo honesto do throttle funcionando:** `aguardando_reset: true, reset_at: "11:20pm"` =
  runner.log 22:56 "You've hit your session limit · resets 11:20pm".

---

## 2. Vereditos das skills NA PÁGINA (prosa gerada, trechos literais)

Capítulos de teste (~1000 palavras, opus, premissas sintéticas originais) no scratchpad da
sessão, subpastas `skill-jk-rowling/`, `hoover-mcfadden/`, `skill-romantasy/`, `vesper/`
(arquivo `capitulo-teste.md` em cada). Sem throttle durante os testes (4/4 pings OK).

| Skill | Veredito | Prova (amostra) | Detector |
|-------|----------|-----------------|----------|
| skill-jk-rowling | **SIM** | Respiração: período único de ~120 palavras na abertura ("Havia setenta e três degraus… que é sempre a que ninguém foi buscar"); concreto encantado ("num tom de quem confere uma lista de compras: — A quarta-feira de chuva…"); ternura no fio ("gaivotas… como pontos de exclamação de asas fechadas") | 42,5/10k dentro; cadência ok; mancha: "coisa" 2× |
| hoover-mcfadden | **SIM** | Não-confiável fair-play ("Foi tudo verdade. Cada palavra." / "Era só isso. Eu decidi que era só isso."); curta-e-cheia ("Bato uma na outra. Quando fecham, respiro."); 3 relógios + gancho ("Não existia cópia.") | **reprova no ORC único — falso positivo estrutural (P1-3)** |
| skill-romantasy | **SIM** (ressalva) | Custo da magia pago em cena e recobrado no gancho ("abri a boca para dizer que na oficina da minha mãe, na tarde cor de mel — e não encontrei a tarde. Só o buraco liso."); yearning com freio ("a mão que subiu meio caminho e voltou") | acima: anáfora 5, colados 7 (moldes retóricos de IA — P1-4) |
| vesper | **PARCIAL** | Voz chega inteira (assinatura-não-nome: "girou-a nas mãos — uma vez, duas, três — como quem sempre bebeu assim."; cadência longa ok) MAS os anti-padrões da própria reference não chegam: símile-andaime 3×, "coisa" 5×, e o typo **"ninguño"** | 70,6/10k ACIMA (pior dos 4) |

Limitações registradas: n=1 por skill; ~1000 palavras (piso de 2.000 e densidade de 7 camadas
não testados); POV duplo da romantasy não testável em capítulo único; Vésper canônica não
tocada (premissa sintética análoga); 1ª geração jk falhou por sandbox do harness de teste
(resolvido com `--add-dir` — não é a corrente de produção).

---

## 3. SPECS (P0/P1; P2 em anexo curto)

### SPEC-01 (P0-1) — Worker imortal no boot + auto-restart
- **OBJETIVO:** worker sobrevive a reboot com rede atrasada e a crash; nunca mais "morto em silêncio".
- **ARQUIVOS:** `worker/src/index.ts` (startup); Scheduled Task `AtelierWorker` (settings de restart) e/ou wrapper versionado em `worker/autostart/` (previsto no PROMPT-CODE-WORKER-AUTOSTART.md, nunca criado).
- **MUDANÇA:** (1) `verificarConexao`/startup: loop de espera infinito com log 1×/min ("aguardando rede/Supabase…") em vez de `process.exit(1)`; (2) task com auto-restart (RestartCount/RestartInterval ou wrapper `while` com backoff) — scripts versionados.
- **DoD:** iniciar o worker com Wi-Fi desligado → processo vivo logando "aguardando rede"; religar → `[worker …] conectado` sem exit 1. Matar o processo → task reergue sozinha (`schtasks /query /tn AtelierWorker /v` sem "Último resultado: 1" permanente). `npx vitest run` + `npx tsc --noEmit` verdes.
- **RISCO DE REGRESSÃO:** loop de espera pode mascarar URL/credencial errada → o log periódico carrega a mensagem do erro original; auto-restart pode criar 2ª instância se `npm start` manual estiver rodando → documentar no runbook (anti-duplicata completa fica como dívida).

### SPEC-02 (P0-2) — Matar a morte silenciosa do runner (encoding + diagnóstico)
- **OBJETIVO:** nenhuma call morre sem rc por encoding; toda morte de runner deixa causa legível.
- **ARQUIVOS:** `worker/src/index.ts` (env do processo); `worker/skill-patches/livro-do-zero-ao-epub/assets/livro_runner.py` (`log()`); `worker/src/jobs.ts` (caminho LimiteMaxError). Pós-edição do runner: `instalar-skills.ps1` (pedir confirmação).
- **MUDANÇA:** (1) exportar `PYTHONUTF8=1` no env dos filhos (1 linha ao lado de `CLAUDE_CODE_MAX_OUTPUT_TOKENS`); (2) `log()` do runner: gravar o ARQUIVO antes do `print` e embrulhar o `print` em try/except; (3) `escreverLivro` loga `rc` + tail de `r.err` em TODO retorno do runner, inclusive no caminho `LimiteMaxError` (hoje descartado).
- **DoD:** teste real — capítulo/resumo contendo "✓ → ≥ emoji" → `Claude rc=0` aparece no runner.log (sem fim abrupto); unit test do wrapper se aplicável; `npx vitest run` + `npx tsc --noEmit` verdes; diff patch↔instalado vazio após reinstalar.
- **RISCO DE REGRESSÃO:** `PYTHONUTF8=1` muda o encoding de TODOS os I/O do runner (arquivos já são UTF-8 — verificar leituras com encoding explícito); mexer no `log()` é mexer no coração do runner → mudança mínima e testada com um run manual antes de produção.

### SPEC-03 (P1-1) — Retry/backoff nas chamadas Supabase (claim FORA)
- **OBJETIVO:** falha transitória de rede não mata worker, não consome tentativa de job com disco íntegro, não gera rótulo mentiroso; claim único preservado.
- **ARQUIVOS:** novo `worker/src/retry.ts` + `retry.test.ts`; `worker/src/index.ts`; `worker/src/jobs.ts`; `worker/src/lib.ts`.
- **MUDANÇA:** `comRetry(fn, {tentativas=5, baseMs=1000, tetoMs=30000})` — re-executa somente erros de rede (`/fetch failed|ECONNRESET|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|UND_ERR/i`), backoff exponencial com jitter ±50%; NUNCA re-tenta erro não-rede (constraint/auth falham alto na 1ª). Aplicar em: `finalizar` (5×; ao esgotar, log alto + recuperarOrfaos como rede de segurança), `must()`/gravações pós-runner + `uploadFile` (5×; ao esgotar, classificar como interrupção `retryAt:+2min` SEM consumir attempts — padrão já existente em jobs.ts:856-862; atenção a inserts não-idempotentes de `artifacts` → upsert/checar antes), `setProgress` (3×, base 500ms; ao esgotar loga e segue), `heartbeat` (1 retry; falhas seguintes viram contador agregado logado a cada 5min). **SEM retry por design:** o claim (update condicional é a garantia anti-duplo-claim; resposta perdida ⇒ tratar como "não peguei"), picker/selects de config (POLL 5s já é o retry), recuperarLimiteMax/recuperarOrfaos (periódicos).
- **DoD:** `npx vitest run` verde incluindo: comRetry re-tenta N× em "fetch failed" e desiste; não re-tenta constraint; claim jamais envolvido. Teste real: desligar Wi-Fi 60–90s durante escrever_livro de teste → sem `erro de escrita no banco`, `attempts` inalterado, ≤1 linha agregada de heartbeat. `npx tsc --noEmit` verde.
- **RISCO DE REGRESSÃO:** duplicação de `artifacts` em retry de insert (mitigar com upsert); mascarar 401/403 atrás de retry (classificação estrita); interação com `recuperarLimiteMax`/`deveRecuperar` (limite-max.ts:81-85) — manter strings de motivo compatíveis com os regex.

### SPEC-04 (P1-2) — COTA-CADENCIA completa em projetos novos (consertar RE_LEGADO)
- **OBJETIVO:** o bloco completo da cota (anáfora/clipe/staccato/"coisa") chega ao escritor de projetos novos mesmo quando o arquiteto emitiu cota parcial.
- **ARQUIVOS:** `worker/src/voz-regra4.ts` + teste.
- **MUDANÇA:** trocar `RE_LEGADO` binário por detecção de COMPLETUDE: só considerar "já tem cota" se o texto cobrir também anáfora/clipe E o orçamento de "coisa"; senão injetar `SECAO_REGRA4_PERFIL` normalmente (marcador mantém idempotência dali em diante).
- **DoD:** `npx tsx worker/scripts/normalizar-voz-regra4.ts 53abdade-554d-47e2-bd14-955de3ffc41e` → `mudou=true`; grep `COTA-CADENCIA v1` no perfil e na Estrutura → presentes; testes do módulo verdes (incluindo caso "legado completo de A Espiral NÃO duplica").
- **RISCO DE REGRESSÃO:** duplicação de cota em projetos com a edição manual legada (mitigar mantendo reconhecimento de legado quando COMPLETO); prompt do escritor cresce ~40 linhas.

### SPEC-05 (P1-3) — Orçamento de cadência POR SKILL
- **OBJETIVO:** o gate não reprovar a voz correta das skills de cadência rápida (hoover-mcfadden) nem contar diálogo como fragmento de ênfase.
- **ARQUIVOS:** `worker/src/maneirismo.ts` (`ORC_CADENCIA_POR_SKILL`, default = atual; excluir linhas iniciadas por `—`/aspas da contagem de fragmento, mantendo contagem separada "fragmentos em diálogo" como sinal); `worker/skill-patches/.../livro_runner.py` (`cadencia_acima` recebe `skill_escrita` e resolve o orçamento); `worker/src/voz-regra4.ts` (cota injetada usa os números da skill quando for de cadência rápida). Pós-runner: `instalar-skills.ps1` com confirmação.
- **DoD:** detector com orçamento hoover sobre `hoover-mcfadden/capitulo-teste.md` → sem tiques de fragmento vindos de diálogo e `acima=false` para a voz conforme; capítulos jk/vesper/romantasy avaliados pelo default SEM mudança de resultado; testes de maneirismo.ts verdes; re-gerar o capítulo hoover e o gate não reprovar por cadência.
- **RISCO DE REGRESSÃO:** afrouxar demais deixa passar staccato vazio em skills longas (default intacto, mapa opt-in); excluir diálogo pode mascarar tique em falas (contagem separada só-sinal para o revisor).

### SPEC-06 (P1-4) — Números do orçamento na caneta (CRAFT-SKILL v2)
- **OBJETIVO:** o alvo numérico ("coisa" ≤1, símile-andaime ≤1, antítese ≤1, anáfora colada 0 — resolvido pela skill via SPEC-05) chega ao escritor no prompt, não só ao gate.
- **ARQUIVOS:** `worker/src/craft-skill.ts` (bloco "ORÇAMENTO DE PÁGINA" em cada entrada de `CRAFT_POR_SKILL`); `worker/src/craft-agentes.ts` (mesma linha no bloco CRAFT-LEITURA do livro-escritor); bump `<!-- CRAFT-SKILL v2 -->` reconhecendo v1 (idempotente) + testes.
- **DoD:** `npx tsx worker/scripts/aplicar-craft-skill.ts <id>` limpo; re-gerar o capítulo de teste vesper com perfil v2 → "coisa" ≤1 e símile-andaime ≤1 no detector; testes atualizados verdes.
- **RISCO DE REGRESSÃO:** excesso de proibição esteriliza a prosa → formular como orçamento/alvo positivo ("uma imagem forte vale mais que três"), não lista de banimentos; prompt maior (custo marginal em cache).

### Anexo — specs curtas P2 (implementar oportunisticamente)
- **SPEC-07 (P2-1):** paridade plena do Fix C — `craft-agentes.ts`: perfil-de-voz nas Fontes do revisor + itens "voz fora do perfil" e "continuidade dura vs ledger" + moldes nomeados. DoD: sweep `consertar-craft-agentes.ts` → grep dos 3 critérios no livro-revisor.md do 53abdade.
- **SPEC-08 (P2-4):** léxico estrangeiro — lista curta literal (`ninguño`, `pero`, `entonces`…) em `contarMuletas` alvo 0 + item no bloco do revisor. DoD: unit test com a frase real detecta.
- **SPEC-09 (P2-2):** banda única — parametrizar a banda do CRAFT_POR_SKILL pelo `piso_palavras_cap` (ou remover o número do bloco). DoD: grep `1.300–2.200` vazio pós-sweep.
- **SPEC-10 (P2-3):** zero-pad do digest no runner (`{:02d}`), aceitando legado na leitura.
- **SPEC-11 (P2-5..8, segurança):** trocar a senha do app no Supabase Auth + substituir nos docs; `.gitignore` += `*.orig.bak`, `__pycache__/`; `console.warn` quando `GATE_SCRIPT` ausente (jobs.ts:121); flag `--dry-run` no auditar-vazamentos.ts.
- **SPEC-12 (P2-9):** timestamps `[ISO]` nos console.log/error do worker + heartbeat agregado (parte já coberta na SPEC-03) + UTF-8 no redirect da task (junto da SPEC-01).
- **Verificação (observação):** consultar no banco se `81696863`/`a9947ca4` (homônimos do Índice) estão ativos; se sim, pausar/arquivar os duplicados via UI (decisão do usuário).

---

## 4. Ordem de implementação recomendada (FASE B, uma por vez)

1. **SPEC-01** (destrava a produção de forma durável) — precedida do restart manual confirmado.
2. **SPEC-02** (mata a maior fonte de desperdício: runs de ~40min perdidos sem diagnóstico).
3. **SPEC-03** (retry — segunda maior fonte: tentativas queimadas por blip).
4. **SPEC-04** (cota completa para projetos novos).
5. **SPEC-05 + SPEC-06** (qualidade na página; SPEC-06 depende dos números por skill da SPEC-05).
6. P2s oportunistas (SPEC-07..12).

## 5. Riscos e dívidas deixados registrados

- Anti-duplicata de instância do worker (task + `npm start` manual) — mitigada por lock de job, não resolvida.
- `interioridadeSemEvento` em 60–62% nos capítulos jk/vesper (abaixo do gatilho, mas perto) — acompanhar.
- Densidade de 7 camadas e piso de 2.000 palavras não provados nos testes de ~1000 palavras (n=1 por skill).
- Consulta banco↔disco pendente de um script read-only (hoje só sweeps que escrevem).
- P0-3 implica que os números do "diagnóstico medido" do CLAUDE.md misturam código pré e pós-fix; re-medir telemetria após o worker rodar o HEAD.
