# Engine V2 — Operação

## Visão em uma frase

Cada capítulo passa por papéis isolados — arquiteto de cena → contextualizador → **escritor** (único autor de prosa) → gates universais → revisor literário → auditor factual — e só é aprovado pelo **gravador determinístico** quando existe parecer estruturado com evidência positiva e hash do texto conferido no disco.

## Estado canônico

- **Fonte única:** tabela `engine_state` (snapshot versionado por projeto, lock otimista) + ledger `engine_runs` (toda chamada de papel) + `engine_reviews` (pareceres hash-bound) + `engine_scene_specs` (fichas). DDL em `supabase/engine_v2.sql` (idempotente — **aplicada pelo autor no SQL Editor**; o worker não roda DDL).
- **Pré-DDL:** o worker cai automaticamente para persistência em disco (`<WORK_DIR>/<projeto>/engine-v2/*.jsonl|estado.json`) e loga aviso; a UI mostra "aguardando migração de banco". Nada é inventado.
- Arquivos Markdown (capítulos, perfil) são **artefatos/evidência** referenciados por hash — o gravador confere o disco antes de registrar; eles não competem com o estado.

## Papéis × classes de capacidade

| Papel | Classe | Modelo (default) | Escreve prosa? |
|---|---|---|---|
| arquiteto_enredo | raciocinio | sonnet | não (fundação sem parágrafos-modelo) |
| arquiteto_cena | raciocinio | sonnet | não (ficha estruturada) |
| contextualizador | fatos | haiku | **proibido** (itens >60 palavras são rejeitados) |
| escritor | prosa | opus | **único** |
| revisor_literario | julgamento | sonnet | não (parecer JSON) |
| auditor_factual | fatos | haiku | não |
| editor_estrutural | raciocinio | sonnet | não (propõe; worker aplica) |
| gravador de estado | — | — (código determinístico) | — |

Override por ambiente: `V2_MODEL_RACIOCINIO|FATOS|PROSA|JULGAMENTO`. Nenhum nome de modelo no núcleo.

## Ativar a V2 num projeto

```sql
update projects set engine_mode = 'v2' where id = '<uuid>';
```
`engine_mode` ausente/desconhecido → V1 byte-idêntica (fail-safe). O desvio é um único ponto (`worker/src/v2/integracao.ts`, chamado em `index.ts`).

## Gates universais vs sinais editoriais

- **Gates (bloqueiam, determinísticos):** artefato ausente, truncamento, POV estruturalmente impossível, repetição quase literal cross-capítulo, menção a conhecimento proibido da ficha, saída fora do schema, contradição factual comprovada pelo auditor, aprovação sem evidência, estado inconsistente (hash).
- **Sinais (nunca bloqueiam sozinhos):** gnômico, personificação, sanfona, declarativas, diálogo, metáfora, cadência, interioridade, tamanho, tipo de gancho. As **cotas vêm só do contrato da skill** (lição CR4); o revisor dispõe cada sinal medido (violação confirmada / exceção válida / falso positivo / decisão humana) e o `conferirParecer` garante consistência: aprovação exige evidência positiva; violação confirmada nunca passa; o código só rebaixa veredito, nunca promove.

## Correção e retomada

- Correção volta **ao escritor** com lista cirúrgica (local + problema + instrução), nunca reescrita cega; orçamento `maxCorrecoes` (default 2) com anti-loop por convergência de violações.
- Falha/interrupção: o estado canônico marca o capítulo; re-executar continua do primeiro capítulo não aprovado (aprovação é hash-bound — texto mudou, aprovação regride).
- Bloqueio vira `doc.bloqueios[]` + status do capítulo; a UI mostra o código e o detalhe.

## Laboratório (release de skill/contrato)

- `worker/src/v2/lab/`: 6 cenas fixas (mesmos fatos) × N skills → amostras com sinais/gates → **avaliação cega** (o avaliador recebe só resumos dos contratos) → relatório anterior vs candidata.
- Decisão automática: regressão de tique >30% em qualquer skill OU vazamento de POV = **rejeitar** (nunca melhorar uma skill destruindo outra); sem avaliação = pendente.
- Rodar pela UI (página Laboratório → job `laboratorio_v2`) ou direto: o job publica relatório + amostras cegas em `jobs.progresso`.

## Migração V1→V2

```bash
# idempotente; nunca altera arquivos V1; relatório em <projeto>/engine-v2/migracao-relatorio.json
npx tsx -e "import('./src/v2/migracao.js').then(m => m.migrarProjetoV1({...}))"
```
- Aprovação V1 só migra como aprovada com evidência (quality-state `approved` + hash batendo com o arquivo atual); resto vira `legado_sem_evidencia`.
- `reverterMigracao` remove o que veio da migração preservando aprovações V2 reais.
- "O Índice dos Abduzidos" é o projeto-diagnóstico da migração.

## Canários (fluxo completo real)

```bash
cd worker && npx tsx scripts/v2-canario.ts todos --caps 2
```
Roda briefing → fundação (arquiteto_enredo, proibido semear aforismo) → fichas → contexto → escrita → gates → revisão → auditoria → aprovação, por skill, com chamadas reais. **Não cria linhas em `jobs`** (o worker V1 vivo nunca reivindica canário). Relatórios em `<WORK_DIR>/canario-v2-*/engine-v2/canario-relatorio.json` e resumo em `<WORK_DIR>/canario-v2-resumo.json`.

## Recuperação de falhas

| Sintoma | Ação |
|---|---|
| `TabelasV2AusentesError` / banner "migração pendente" | aplicar `supabase/engine_v2.sql` no dashboard |
| run `falha` com `FORA_DO_SCHEMA` | já houve retry técnico; ver `engine_runs.erro` e o prompt via `input_bundle_hash` |
| capítulo `bloqueado` | ver `doc.bloqueios` + parecer na aba Engine; corrigir causa; re-executar (retoma do estado) |
| `ErroConcorrencia` persistente | duas instâncias escrevendo o mesmo projeto — garanta 1 worker por projeto |
| provedor timeout | `timeoutMs` por chamada; re-executar retoma pelo hash |
