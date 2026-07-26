# Engine V2 — Operação

## Visão em uma frase

Cada capítulo passa por papéis isolados — arquiteto de cena → contextualizador → **escritor** (único autor de prosa) → gates universais → revisor literário → auditor factual — e só é aprovado pelo **gravador determinístico** quando existe parecer estruturado com evidência positiva e hash do texto conferido no disco.

## Estado canônico

- **Fonte única:** tabela `engine_state` (snapshot versionado por projeto, lock otimista) + ledger `engine_runs` (toda chamada de papel) + `engine_reviews` (pareceres hash-bound) + `engine_scene_specs` (fichas). DDL em `supabase/engine_v2.sql` (idempotente — **aplicada pelo autor no SQL Editor**; o worker não roda DDL).
- **Pré-DDL:** o worker cai automaticamente para persistência em disco (`<WORK_DIR>/<projeto>/engine-v2/*.jsonl|estado.json`) e loga aviso; a UI mostra "aguardando migração de banco". Nada é inventado.
- Arquivos Markdown (capítulos, perfil) são **artefatos/evidência** referenciados por hash — o gravador confere o disco antes de registrar; eles não competem com o estado.

## Papéis × classes de capacidade

| Papel | Classe | Modelo fixo | Escreve prosa? |
|---|---|---|---|
| arquiteto_enredo | raciocinio | `claude-sonnet-5` | não (fundação sem parágrafos-modelo) |
| arquiteto_cena | raciocinio | `claude-sonnet-5` | não (ficha estruturada) |
| contextualizador | fatos | `claude-haiku-4-5-20251001` | **proibido** (itens >60 palavras são rejeitados) |
| escritor | prosa | `claude-opus-5` | **único** |
| revisor_literario | julgamento | `claude-sonnet-5` | não (parecer JSON) |
| auditor_factual | fatos | `claude-haiku-4-5-20251001` | não |
| editor_estrutural | raciocinio | `claude-sonnet-5` | não (propõe; worker aplica) |
| gravador de estado | — | — (código determinístico) | — |

Os IDs são pins de release em `worker/src/v2/config.ts`. As variáveis
`V2_MODEL_RACIOCINIO|FATOS|PROSA|JULGAMENTO` só podem repetir esses valores;
qualquer divergência falha antes da primeira chamada. O envelope do Claude Code
também precisa reportar exatamente o ID solicitado em `modelUsage`: ausência,
fallback ou mistura de modelos bloqueia o run sem retry.

## Ativar a V2 num projeto

```sql
update projects set engine_mode = 'v2' where id = '<uuid>';
```
`engine_mode` ausente/desconhecido → V1 byte-idêntica (fail-safe). O desvio é um único ponto (`worker/src/v2/integracao.ts`, chamado em `index.ts`).

`engine_mode='v2'` **não basta para escrever**. O canário de voz e o laboratório
podem rodar para produzir evidências, mas `criar_fundacao` e `escrever_livro`
exigem `worker/release/engine-v2.json` válido. O worker recalcula hashes dos
contratos, do corpus e de todo o runtime não-teste (incluindo lockfile) em cada
verificação; mudança posterior de código, contrato, corpus **ou modelo fixo**
invalida o certificado.

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
- Depois de registrar a leitura humana, use **Baixar evidência para
  certificação**. O arquivo preserva palpites e gabarito vinculados aos IDs
  anônimos da execução.

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

## Certificar o release

Somente depois de calibração, canários e laboratório aprovados:

```powershell
cd worker
npx tsx scripts/v2-certificar-release.ts `
  --canarios "<WORK_DIR>\canario-v2-resumo.json" `
  --lab-dir "<WORK_DIR>\lab-v2\<execucao-id>" `
  --humano "<downloads>\avaliacao-humana-<execucao-id>.json" `
  --por "Nome do autor/revisor" `
  --commit "<SHA Git completo>"

npx tsx scripts/v2-verificar-release.ts
```

O primeiro comando rejeita exceções, hashes divergentes, menos de dois
capítulos plenos por skill, menos de três amostras de laboratório por skill,
regressão, vazamento, avaliação automática abaixo dos pisos ou avaliação humana
abaixo de 80%, além de evidência produzida por modelos diferentes dos pins. O
segundo é o mesmo gate executado pelo CI.

## Recuperação de falhas

| Sintoma | Ação |
|---|---|
| `TabelasV2AusentesError` / banner "migração pendente" | aplicar `supabase/engine_v2.sql` no dashboard |
| run `falha` com `FORA_DO_SCHEMA` | já houve retry técnico; ver `engine_runs.erro` e o prompt via `input_bundle_hash` |
| capítulo `bloqueado` | ver `doc.bloqueios` + parecer na aba Engine; corrigir causa; re-executar (retoma do estado) |
| `ErroConcorrencia` persistente | duas instâncias escrevendo o mesmo projeto — garanta 1 worker por projeto |
| provedor timeout | `timeoutMs` por chamada; re-executar retoma pelo hash |
