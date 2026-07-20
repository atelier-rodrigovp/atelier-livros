# Engine V2 — Decisão arquitetural (F0)

**Data:** 2026-07-20 · **Branch:** `codex/engine-v2` (base `estilo-hoover-correcao` @ f5ada1e = master local + correções dan-brown fb4004a + hoover f5ada1e) · **Baseline:** worker typecheck OK, worker 521✓/3 skip, front 598✓/3 skip, build OK.

## Problema (evidência do diagnóstico F0)

1. **9 fontes concorrentes de estado** para o mesmo fato (`ESTADO_LIVRO.json`, marcadores `.done/.try`, `_correcao-cap-NN.json`, `quality/*.json`, `estado-narrativo.md`, `MANUSCRITO-MESTRE.md`, `chapters`, `editions`, `jobs.progresso`), reconciliadas por um único resolvedor que só roda no worker.
2. **Matriz de skills duplicada TS↔Python** (`exigencias-skill.ts` ↔ `EXIGE_SPEC_POR_SKILL` no runner) + condicionais por nome de skill em 6 módulos do núcleo.
3. **Parecer do revisor se perde**: o veredito qualitativo do micro-loop nunca é persistido; sobrevivem só métricas e um marcador booleano. Aprovação sem trilha do julgamento.
4. **7 donos da prosa**, incluindo o editor (haiku) reescrevendo capítulos — haiku atua como coautor literário.
5. **Contexto máximo, não mínimo**: o escritor recebe fundação inteira + perfil + estrutura; o orquestrador (sessão Claude Code) já foi medido produzindo 71–100% do output.

## Decisões

**D1 — Núcleo V2 em TypeScript único** (`worker/src/v2/`). Fim do espelho Python: detectores, gates e matriz de skills existem UMA vez, em TS. O runner Python V1 permanece intocado para projetos V1.

**D2 — Dispatch por engine**: `projects.engine_mode = 'v2'` desvia para o pipeline V2 num único ponto antes do dispatch atual (padrão do ADR-EZC-001); default/desconhecido → V1 byte-idêntico. Nenhuma regressão para projetos existentes.

**D3 — Papéis como chamadas independentes de modelo**, não sessão orquestradora. Cada papel (arquiteto de cena, contextualizador, escritor, revisor literário, auditor factual, editor estrutural) é uma chamada não-interativa (claude CLI `-p`, saída JSON validada por schema) com **contexto compilado mínimo** e modelo por **classe de capacidade** (`raciocinio`, `fatos`, `prosa`, `julgamento`) configurável — nunca nome de modelo hardcoded no núcleo. O **gravador de estado é código determinístico** do worker. Provedores hosted (engine zero-custo) ficam fora do escopo V2 (benchmark fechado 2026-07-16: nenhum papel com vencedor gratuito); a abstração de provider permite religá-los depois sem tocar o núcleo.

**D4 — Estado canônico = ledger de execuções + snapshot por projeto no Supabase.** Tabelas novas em `supabase/engine_v2.sql` (idempotente, RLS `owner_all`, mesmo padrão da migração 0001 já aplicada): `engine_runs` (execução com engine_version, skill_id/version, papel, classe/modelo, input_bundle_hash, output_hash, status, attempt, parent_run_id, evidências, erro estruturado), `engine_reviews` (parecer estruturado hash-bound), `engine_scene_specs` (fichas), `engine_state` (snapshot canônico por projeto). Reuso das tabelas existentes `engine_skill_snapshots` (versão de skill) e `engine_policies`. **Arquivos Markdown viram artefatos/evidência referenciados por hash** — o axioma "verdade no disco" vira *verificação* (o gravador só registra aprovação após conferir o arquivo e o hash), não uma segunda fonte de estado. DDL é aplicada pelo autor no dashboard (única etapa humana); enquanto as tabelas não existem, a persistência V2 grava em Storage e a UI mostra "migração pendente" — sem aprovação fantasma.

**D5 — Skill = contrato versionado em dados** (`worker/skills-v2/<id>/contrato.json` no repo, schema `skill-contract/v1`, hash de conteúdo). Nenhum `if skill === "..."` no núcleo: rotação de POV/fios, relógios, custo de magia, cotas de cadência, políticas de exposição/diálogo/metáfora viram **políticas declaradas** interpretadas por validadores genéricos parametrizados. Skill desconhecida ou contrato inválido = falha clara antes do escritor. Instalação local verificável contra o repo por hash.

**D6 — Specs sem prosa**: ficha estruturada (JSON, schema validado) com POV, local/tempo, objetivo, obstáculo, ação física, informação nova, virada, mudança de estado, gancho, fatos obrigatórios, conhecimentos proibidos, fios; validador anti-ghostwriting rejeita metáfora/frase pronta/pensamento redigido (reusa detectores de `maneirismo.ts`).

**D7 — Gates universais ≠ sinais editoriais.** Gates determinísticos bloqueantes (artefato ausente, truncamento, fora do schema, repetição quase literal, contradição factual comprovada, POV impossível, conhecimento proibido, estado inconsistente, aprovação sem evidência). Sinais editoriais (diálogo, metáfora, aforismo, interioridade, ganchos…) **nunca bloqueiam sozinhos**: entram no parecer do revisor, que dispõe cada um (violação confirmada / exceção válida / falso positivo / decisão humana), persistido em `engine_reviews`. Aprovação exige evidência positiva, não ausência de bloqueio. (Lição CR4: régua nasce per-skill; a régua vem do contrato, nunca de default global.)

**D8 — Reuso deliberado, sem misturar trabalho alheio**: detectores de `maneirismo.ts` (como sinais), `chapter-state.ts` como referência do resolvedor, tabelas `engine_*` já aplicadas no banco. O código não-commitado do usuário (`worker/src/engines/hosted/`, benchmarks) **não é portado** — permanece intocado no worktree principal.

**D9 — Migração V1→V2 idempotente e evidência-preservante**: importa capítulos/fundação/quality-states; aprovação V1 só migra como aprovação V2 se houver evidência hash-bound válida (senão `legado_sem_evidencia`); originais preservados; relatório + rollback lógico. "O Índice dos Abduzidos" é o projeto-diagnóstico.

## Consequências

- Uma skill nova = um diretório de contrato + referências; zero mudança no núcleo.
- O escritor (classe `prosa`) é o único papel autorizado a produzir prosa; correções voltam ao escritor com lista cirúrgica; o editor estrutural propõe, o worker aplica.
- Toda execução é auditável: run → input_bundle_hash → parecer → aprovação com evidência → artefato com hash.
- O laboratório de canários roda os mesmos papéis com fichas fixas e compara skills às cegas antes de qualquer release de contrato.
