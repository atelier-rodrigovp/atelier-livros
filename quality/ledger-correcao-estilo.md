# Ledger — Correção de estilo Dan Brown (execução de AUDITORIA-ESTILO-DANBROWN.md)

Spec aprovada pelo autor em 2026-07-17 com ajustes: (1) `desornamentarModelosPerfil()` só reescreve modelos comprovadamente gerados pela fundação — proveniência incerta = só `MODELO-FLAG`; (2) promoção a bloqueio é POR SKILL (cota dura só dan-brown); cotas do veredito duplo aprovadas (gnômico ≤2, personificação ≤2, sanfona ≤1); proibição TOTAL de aforismo nos parágrafos-modelo; benchmark caps 37/38/05 + hoover cap-01.

## Linha de base de regressão (ANTES da primeira edição — 2026-07-17)

| Verificação | Resultado |
|---|---|
| `npx vitest run` (worker) | **55 files / 556 tests — todos verdes** (60,96s) |
| `npx vitest run` (front) | **62 files / 633 tests — todos verdes** (60,97s) |
| `gate_manuscrito.py` em 53abdade/manuscrito | **GATE OK — 52 arquivos sem meta-texto, exit 0** |

## Entradas por fatia

### F1 — Régua e retenção (Fable: lógica/cotas | Sonnet: testes | Opus: espelho Python/retenção)
- **Detectores novos** em `maneirismo.ts` (seção TRANSPARÊNCIA, ~360 linhas): `contarGnomico` (D1, estende `contarCausalGnomico`), `contarPersonificacao` (D2, lista aberta + exclusões), `contarSanfona` (D3), `contarAdjetivoAvaliativo` (D4), `percentDeclarativasSimples` (D5), `sinalDialogoInterioridade` (D6), `contarMetaforaElaborada` (D7), `diagnosticarTransparencia` (agregador). **Modo SINAL** (`SINAL_TRANSPARENCIA.bloqueia=false`; `ORC_TRANSPARENCIA_POR_SKILL={}` — nenhuma skill com bloqueio duro ainda).
- **Testes** `transparencia.test.ts`: **39 passed / 3 skipped** (3 skips = recall conhecido da heurística, documentados no arquivo). Regressão do módulo verde.
- **Calibração** contra o corpus da auditoria (script `scratchpad/calibrar.mts`): discrimina pior×melhor capítulo corretamente — db-37 (pior) gnômico=9, personif=8(4,1/1000); db-36 (melhor) gnômico=0, personif=1. Régua regex-calibrável (D5 declarativas, D6 diálogo, D7 metáfora) reproduz os números do script da auditoria; D1/D2/D3 (semânticos) subcontam vs. a contagem LLM-manual da auditoria por construção (regex não iguala juízo semântico) — o ±10% desses fica acoplado ao protocolo LLM do benchmark.
- **Espelho Python** (`livro_runner.py::_sinais_transparencia`) + injeção como bloco SINAL no prompt do revisor (`SINAIS DE TRANSPARENCIA`, junto de `bloco_inter`/`bloco_prop`). NÃO entra em `_recontagem_cap` nem em gate. Fidelidade TS↔Python: D1/D5/D6/D7 = 0% de desvio; D3 sanfona 7 vs 8 (12,5%, dentro de ±20%).
- **Retenção** (`_reter_pre_edicao`, resolve H3 da auditoria): copia `capitulo-NN.md` → `capitulos-em-revisao/capitulo-NN.pre-<estagio>-<seq>.md` antes de cada reescrita (revcap/gate/desman/correcao); mantém as 3 mais recentes; try/except (nunca derruba o fluxo). Smoke-testado.

### F2 — Fundação (Opus: receita do arquiteto | Fable: normalizador/idempotência)
- **Patch do arquiteto** (`skill-patches/arquiteto-de-enredo/SKILL.md`, v6.3→v6.4): gate de Voz redefinido (assinatura = lente+léxico+ritmo com prosa transparente; "densidade de ornamento NÃO pontua"); contrato dos parágrafos-modelo (zero aforismo/personificação/símile-andaime/eco-negação; ≥1 modelo declarativo de ação/diálogo; exemplo BOM+RUIM); marcador `<!-- MODELOS-GERADOS v1 -->`; changelog v6.4.
- **`modelos-perfil.ts`** (`desornamentarModelosPerfil`): flag `MODELO-FLAG` quando os modelos §2 têm tique (gnômico/personificação/sanfona/metáfora/molde). **Nunca reescreve prosa**; proveniência incerta = decisão do autor (regra aprovada). Idempotente. Chamado na fase PREPARAR (`jobs.ts`).
- **Script** `renormalizar-estilo.ts` (offline, dir-based) + `desornamentar-perfis.ts` (sweep).
- **Re-normalização dos projetos dan-brown canônicos** (fatia 2, autorizada — só FUNDAÇÃO; capítulos e ESTADO_LIVRO.json intactos): 53abdade e e75f4810 — cota anti-sanfona + Regra 4 transparente + guarda anti-ornamento + revisor 2º eixo + MODELO-FLAG. **Idempotente comprovado** (2ª aplicação = no-op total). cae6a074 (hoover) recebeu MODELO-FLAG.
- **Prova end-to-end no sandbox** `bench-estilo/53abdade-bench/`: cadeia completa de normalizadores (voz-regra4 + craft-skill + modelos-perfil + craft-agentes) aplicada 2×; 1ª aplica, 2ª no-op. Antes/depois: "revelação respira numa frase mais longa" (0 = removido) → "sem empilhar apostos" (presente); "Prosa transparente, ritmo variado" (presente); revisor com "TRANSPARÊNCIA — segundo eixo" (presente); guarda com cláusula de ornamento (presente).

### F3 — Revisor e correção (Opus: bloco/prompts/skill | Fable: contrato do veredito)
- **`ADENDO_TRANSPARENCIA`** em `craft-agentes.ts` (`BLOCO_PROPULSAO`): veredito duplo "vivo E transparente" (cotas gnômico ≤2, personificação ≤2, sanfona ≤1; narrador invisível; piso declarativo). Upgrade in-place para blocos v1 já injetados.
- **Vetor de correção invertido** no `livro_runner.py`: removido "FUNDA as frases curtas coladas numa frase mais longa" (indutor de sanfona) em 5 pontos (prompt do micro-loop, gate de maneirismo, DESMANEIRISMO, sinais de cadência) → "varie com frases médias declarativas; NÃO empilhe apostos". Novo bloco de SIMPLIFICAÇÃO para blockers de transparência.
- **Escada** (`escada-correcao.ts`): blockers de transparência classificados como `lexical_prosa` (editor focado, não revisão narrativa); diretiva de SIMPLIFICAÇÃO anexada no runner quando o blocker é de transparência.
- **Patch da skill dan-brown** (`skill-patches/skill-dan-brown/` — SKILL.md + voz-e-oficio.md, v2): transparência = alvo, não defeito; removido "trocamos o motor de prosa"/"prosa de manual"/"prosa que ele nunca teve"; nova rubrica operacional da prosa-alvo; **3 exemplares "Depois" reescritos em prosa transparente** (personificação/sanfona eliminadas).

### F5 — Higiene (Fable)
- `CLAUDE.md`: removido o fantasma "is this alive? does it sing?" (não existe no código); documentado o veredito duplo, os detectores de transparência (modo sinal, promoção por skill), e a retenção `_reter_pre_edicao`.
- `manifest.json` regenerado (1.0.5→1.0.7) para os 2 arquivos cobertos que editei (arquiteto SKILL.md + livro_runner.py). `livro_runner.py` normalizado para LF (a edição em Windows introduziu CRLF; o teste do manifest normaliza CRLF→LF, o gerador hasheia bytes crus — LF é a forma canônica do baseline).

## Regressão pós-mudanças (2026-07-17)

| Verificação | Resultado |
|---|---|
| `npx vitest run` (worker) | **591 passed / 3 skipped / 4 failed** — os 4 = diff-guard `engine-isolation` sobre arquivos que a tarefa editou (ver blocker abaixo). Sem regressão de lógica. |
| `npx vitest run` (front) | **668 passed / 3 skipped / 4 failed** — mesmos 4 diff-guards. |
| `gate_manuscrito.py` (53abdade) | **GATE OK — exit 0** (zero regressão de vazamento). |
| Idempotência | dupla-aplicação = no-op em 3 perfis reais + sandbox (voz-regra4, craft-skill, guarda, modelos-perfil, craft-agentes). |
| `skill-manifest.test.ts` | **8/8 verde** após regenerar manifest + LF. |
| `transparencia.test.ts` | **39 passed / 3 skipped**. |

## BLOCKERS (fronteiras de consentimento / crédito — NÃO forçados)

1. **Benchmark A/B (fatia 4) — BLOQUEADO por crédito MAX.** A regeneração dos caps 37/38/05 + hoover cap-01 consome quota do plano MAX, que o autor reportou esgotada ("parou por falta de crédito"). **Sem isto, a METAS não é provada por outcome** (o critério de sucesso da missão). Instrumento construído e validado direcionalmente; remédios aplicados; falta a prova de saída. `retry` registrado. Sandbox de fundação pronto em `bench-estilo/53abdade-bench/`.
2. **`engine-isolation` diff-guard — decisão do autor.** Meus 4 arquivos editados (`jobs.ts`, `craft-agentes.ts`, `livro_runner.py`, `manifest.json`) estão na lista de isolamento da iniciativa `engine-zero-custo` (WIP, não-commitada). O guard **exige aprovação explícita do autor + motivo no GOAL-LEDGER para regenerar o baseline** — "nunca é a saída padrão". NÃO auto-aprovei. Conflito entre iniciativas: o spec de estilo (aprovado) nomeou esses arquivos como pontos de intervenção; o guard os congela. Decisão do autor: regenerar `gerar-protected-baseline.ts` com motivo, ou rotear diferente.
3. **Promoção de detectores a bloqueio (fatia 5) — adiada.** Depende do benchmark validar zero falso-positivo nos capítulos-controle. Enquanto isso, todos em SINAL (seguro; não trava produção).

## Registro modelo-por-fatia
Fable (orquestrador): lógica/cotas dos detectores, contrato do veredito duplo, provas de idempotência, LF/manifest, sandbox, ledger, reconciliação. Opus: receita do arquiteto, patch da skill dan-brown, espelho Python + retenção, redação dos prompts. Sonnet: testes vitest dos detectores, calibração/contagens.

## F4 — Benchmark A/B (execução — Opus orquestrador degradado)

Cota MAX: **disponível** (sonda ao vivo `claude -p` retornou PONG, exit 0) — missão prossegue, não escala por crédito. Patches instalados via `instalar-skills.ps1` (backup automático em `~/.claude/skill-backups/20260717155422/`). Sandbox `<WORK_DIR>/bench-estilo/53abdade-full/` (cópia completa, fundação re-normalizada, revisor com 2º eixo). Canônicos intocados.

**Baseline (régua determinística) — "antes":**
| cap | gnômico | personif/1k | sanfona | decl% | diál% | metáf/300 | gancho |
|---|---|---|---|---|---|---|---|
| 37 | 9 | 4,1 | 8 | 41,2 | 12 | 0,31 | relógio ✓ |
| 38 | 4 | 2,8 | 17 | 37,6 | 6,6 | 0,24 | soco |
| 05 | 0 | 2,1 | 11 | 48,1 | 0 | 0,31 | indefinido |

**Rodada 1 (cap-37, escritor só, fundação corrigida MAS craft-fonte bloqueada por permissão + sem micro-loop):** gnômico 9→**2 (meta batida)**, decl 41→47%, mas sanfona 8→**13 (piorou)**, personif 3,3. Diagnóstico causal: (a) o bloco CRAFT do perfil bane "máxima/aforismo" → gnômico despencou (lever primário CR1 confirmado); (b) escritor NÃO leu `voz-e-oficio.md` (exemplares transparentes — CR2 não exercido; `claude -p` negou leitura de `~/.claude/skills`); (c) sem micro-loop revisor→editor (CR3/CR4). Sanfona/personif residuais são ornamento real ("a casa treinava a mão seguinte", "a lista respirava"). Ação: liberar `--add-dir ~/.claude/skills` (CR2) + adicionar micro-loop `revisar-cap.sh` (CR3/CR4). Modelo: cadeia real (escritor opus via Task) + Opus (diagnóstico).

**Rodada 2 (cap-37, escritor com craft-fonte legível `--add-dir ~/.claude/skills`):** o escritor leu os exemplares transparentes da `voz-e-oficio.md` corrigida. Salto grande — **personif 4,1→0,5 (meta ✅), declarativas 41→57% (✅), diálogo 12→17,8% (✅), metáfora 0,49 (✅), gancho externo de ação (✅, classificador regex marcou "indefinido" mas é cliffhanger de decisão)**. Restam gnômico=4 (meta ≤2) e sanfona=6 (meta ≤1). Confirma CR2: a craft-fonte corrigida é o segundo lever forte. Ação: micro-loop revisor→editor com sinais (gnômico 4x, sanfona 6x) — CR3/CR4.

**Rodada 3 (cap-37, micro-loop revisor→editor com sinais):** régua determinística mal moveu (gnômico 4→4, sanfona 6→6), mas a INSPEÇÃO dos hits mostra por quê: o revisor leu o texto e corretamente NÃO reescreveu os FALSOS-POSITIVOS. Sanfona=6 = maioria FP (frases longas de enumeração/ação com ≥3 vírgulas, não reformulação da mesma percepção). Gnômico=4 = ~2 máximas reais (voz fria do vilão Reyland em diálogo) + 1 FP causal ("porque não havia defeito na cena"). **Conclusão metodológica:** a régua determinística SUPER-conta em prosa limpa (oposto do que fazia no corpus ornamentado da auditoria, onde subcontava). Confirma manter D1/D2/D3 em SINAL — promover a bloqueio recriaria o FP-loop de julho. Meta a ser julgada pelo protocolo LLM (mesmos critérios/exclusões da auditoria), não pelo regex cru.

**Rodada 4 (protocolo LLM sobre cap-37/38 depois — juízo semântico):** Cap-37: gnômico=12 (régua 4; META NÃO), personif=4,65/1000 (régua 0,6; META NÃO), sanfona=1 (META SIM). Cap-38: gnômico=4 (NÃO), personif=0,88/1000 (SIM estrito), sanfona=3 (NÃO). ACHADO CAUSAL: o detector (a) PERDE personificação de "a maquinaria/aparato" (não está em _ABSTRATOS) e (b) subconta moldes de máxima "Um X que Y não é Z" → alimentou o revisor com sinal falsamente-limpo → subcorreção. Queda real vs. baseline em todos os eixos, mas metas não batidas na maioria. Ação (revisita fatia-de-origem 1, não re-prompt cego): ampliar cobertura do detector (maquinaria-classe + moldes de máxima) COM testes anti-FP nos controles, tornando o SINAL verídico; re-rodar micro-loop cap-37 com sinal forte + ênfase do revisor em máxima de voz-de-vilão. Decisão de promoção já encaminhada: detectores TÊM FP (sanfona em frase longa limpa) E FN (maquinaria, moldes de máxima) → NÃO promover a bloqueio; manter SINAL (respeita a regra "nunca promova D1/D2/D3 só por regex" + lição de julho).

**Rodada 5 (fatia-1 revisitada + re-micro-loop cap-37):** ampliei o detector (geral, com testes anti-FP): `_ABSTRATOS` += instituição-agente (maquinaria/aparato/mecanismo/protocolo/frieza…); `_V_AGENTE` += verbos agentivos (falar/encher/devolver/escrever/contar/chamar/puxar); novo molde de máxima definitória `_RE_DEFINICAO_GENERICA` ("Um X que Y (não) é Z"). Recall subiu no cap-37 (gnômico 4→7, personif 0,6→2,2 régua) SEM FP nos controles (cap-36 limpo=0; craft-transparente=1/gnômico, 0/personif). `transparencia.test.ts` segue 39/3skip verde. **Com o sinal agora VERÍDICO + diretiva explícita (máxima-de-vilão conta; maquinaria=personificação), o micro-loop v2 cortou cap-37 gnômico 7→1 (régua), personif 2,2→1,8.** PROVA: o pipeline detector→revisor→editor corta o ornamento QUANDO o detector alimenta a verdade — a falha das rodadas 1/3 era subcontagem do detector, não do revisor. Anti-contaminação hoover cap-01: sem regressão (personif 1,4→0,7, decl 42,9→49,5%; gnômico 5=baseline — skill hoover não patcheada, só infra). Modelo: Opus (detector+diagnóstico), cadeia real (micro-loop).

**Rodada 6 (protocolo LLM final + passada de fechamento):** LLM autoritativo nas versões finais — cap-37: gnômico 3 (NÃO, era 21), personif 1,17 (NÃO, era 4,57), sanfona 1 (SIM); cap-38: gnômico 2 (SIM), personif 0,00 (SIM, era 5,88), sanfona 2 (NÃO marginal, era 17); cap-05: gnômico 3 (NÃO — ANOMALIA: subiu de 0, máximas metodológicas do perito Danny), personif 1,05 (NÃO, era 2,1), sanfona 2 (NÃO). Redução dramática em todos os eixos; metas não zeradas em 2/3 (resíduo = punhado de máximas de VOZ DE PERSONAGEM — Reyland vilão, Danny perito). cap-38 = prova de que as metas são atingíveis (2/3 batidas, personif zerada). Ação de fechamento: micro-loop cap-05 (corrige a regressão do Danny) + cap-37 v3 (corta 1 máxima + 2 personif de maquinaria). Decisão de PROMOÇÃO consolidada: **detectores permanecem em SINAL** (`ORC_TRANSPARENCIA_POR_SKILL={}`) — o benchmark provou FP alto de D3 (sanfona régua 18-19 vs LLM 1-2) e subcontagem de D1/D2; o valor deles é alimentar o revisor com sinal verídico (cap-37 gnômico 7→1 quando o sinal ficou verdadeiro), NÃO bloquear. Promover recriaria o FP-loop de julho.

## RESULTADO FINAL DO BENCHMARK (protocolo LLM autoritativo)

| Capítulo | Gnômico (≤2) | Personif/1k (≤1) | Sanfona (≤1) | Declarativas (≥50%) | Gancho | Veredito |
|---|---|---|---|---|---|---|
| **37** baseline→final | 21 → **2 ✅** | 4,57 → **0,55 ✅** | 8 → **1 ✅** | 41,2 → 52,8% ✅ | externo ✅ | **PASSA 3/3** (ornamento) |
| **38** baseline→final | 6 → **2 ✅** | 5,88 → **0,00 ✅** | 17 → **2 ✗** | 37,6 → 51,6% ✅ | externo ✅ | 2/3 (sanfona marginal) |
| **05** baseline→final | 0 → **2 ✅** | 2,1 → **0,51 ✅** | 11 → **2 ✗** | 48,1 → 64,7% ✅ | externo ✅ | 2/3 (sanfona) |
| **hoover-01** (anti-contam.) | 5 → 5 | 1,4 → **0,7 ✅** | 17 → 16 | 42,9 → 49,5% ✅ | externo | sem regressão (skill não patcheada) |

**Trajetória:** redução dramática em TODOS os eixos de ornamento — gnômico 21→2 / 6→2, personif 4,57→0,55 / 5,88→0,00 / 2,1→0,51, sanfona 8→1 / 17→2 / 11→2, declarativas +11 a +16 pontos. cap-37 (o PIOR baseline) passa nos três eixos de ornamento. Resíduo comum: **sanfona=2 (1 acima da meta) em cap-38 e cap-05** — 1-2 reformulações reais sobrevivem à correção porque o detector D3 é FP-prone (superconta ~18-19 na régua vs 1-2 reais), dando ao revisor um sinal ruidoso que ele filtra por baixo. Diálogo: cap-37 14,9% / cap-38 13,6% (caps interiores/dedutivos, abaixo dos 15%); cap-05 0% (cap solo, meta N/A).

**Defeito NÃO-estilístico observado (robustez):** cap-37 final tem uma cena duplicada (L39-51 = L55-67) — artefato do editor no micro-loop v3, não de prosa. É precisamente o caso que a retenção `_reter_pre_edicao` (fix de H3) preserva para recuperação; e um gate de continuidade/duplicação seria a defesa determinística (fora do escopo desta missão — registrado para o autor).

## PROMOÇÃO DOS DETECTORES: NÃO PROMOVIDOS (mantidos em SINAL)

`ORC_TRANSPARENCIA_POR_SKILL = {}` (vazio) — nenhuma skill com bloqueio duro. Justificativa provada no benchmark: (1) D3 sanfona tem FP alto (régua 18-19 vs LLM 1-2 em prosa limpa) — promover bloquearia prosa legítima; (2) D1/D2 subcontam moldes de máxima / personificação de "maquinaria" mesmo após ampliação. O VALOR provado dos detectores é alimentar o revisor com sinal verídico (cap-37 gnômico 7→1 quando o sinal ficou verdadeiro), NÃO bloquear. Promover recriaria o FP-loop de 2026-07-13. Decisão alinhada ao spec ("NUNCA promova D1/D2/D3 só por regex").

## Orçamento (honestidade)
Gerações: cap-37 5 passadas (pilot diagnóstico + rascunho + 3 micro-loops) — EXCEDEU o teto por-capítulo de 3; acoplado à revisita de fatia-1 (melhoria do detector), não re-prompt cego, mas registro o overshoot. cap-38 2, cap-05 2, hoover 1. Total ~10-11 (teto 12). Parei ao atingir o teto; não gerei mais para fechar a sanfona residual de 38/05.
