# Engine V2 — status de conclusão Codex

Atualizado em 2026-07-25. Este documento é um ledger intermediário e não é uma
declaração de conclusão.

## Resultado em uma linha

O núcleo e a interface receberam correções estruturais e estão verdes
localmente, mas o goal permanece aberto: canários reais, laboratório cego real,
rotulagem humana, fluxo autenticado, prova não-canário, CI remoto e restauração
operacional ainda não foram comprovados. Fundação e escrita V2 agora falham
fechado enquanto essas provas não gerarem um certificado de release. O release
fixa `claude-opus-5` como único escritor, `claude-sonnet-5` para
raciocínio/julgamento e `claude-haiku-4-5-20251001` para fatos.

## Branch e evidência local

- Branch isolada: `codex/engine-v2-conclusao`
- Base remota: `origin/master` em `d6578fd5`
- Divergência após fetch: 0 commits atrás; 45 à frente (incluindo este ledger)
- Último commit de código validado: `bc5f1a5bf9e6d8209936057c6ff382ad600741ae`
- Suíte: 79 arquivos, 802 testes aprovados, 3 pulados
- Lint: 0 erros; 3 warnings antigos de Fast Refresh
- Worker typecheck: aprovado
- Build de produção: aprovado (warning de chunk grande)
- PR remoto atual: draft #3 em `2205fef`, sem estes commits e sem checks

## Matriz da definição de pronto

| # | Critério | Estado | Evidência / pendência |
|---|---|---|---|
| 1 | Regressão meta-9 corrigida | comprovado em código | Snapshot, promoção condicional, restauração e ledger; testes Hoover/Romantasy |
| 2 | Calibração reproduzível | parcial | Corpus/splits/hashes/métricas/promoção fail-closed e planilha humana auditável implementados; laboratório/UI bloqueiam release sem corpus pronto; 14 amostras, 596 ocorrências e 182 atestações aguardam revisão humana |
| 3 | Três canários 3/3 plenos | pendente | Claude CLI respondeu 429 antes de qualquer token; não foi substituído por mock |
| 4 | Dois capítulos atuais aprovados por canário | pendente | Depende da execução real dos canários |
| 5 | Vozes distinguíveis em leitura cega | pendente | Protocolo v2 corrigido/testado; certificação recalcula cobertura, acertos, hashes da saída bruta, contratos e gates em vez de confiar nos relatórios; execução real aguarda reset |
| 6 | Corte, fusão e reordenação | parcial | Staging/rollback e pipeline integrados testados; confirmação com modelo real virá nos canários |
| 7 | Meta-9 em livro longo real | parcial | Fluxo >40 mil palavras testado integralmente com provedor controlado; execução real ainda falta |
| 8 | Wizard V2 completo no navegador | parcial | UI desktop/mobile e estados locais verificados; criação autenticada ponta a ponta ainda falta |
| 9 | Erro, timeout e worker offline | comprovado em código/UI | Resolver operacional testado; tela de configuração ausente e recuperação de job implementadas |
| 10 | Prova real não-canário autorizada | pendente | O Índice não foi alterado; sandbox/cópia ainda exige escolha/autorização |
| 11 | Banco/arquivo/hash/parecer consistentes | parcial | Certificação recalcula hashes da prosa, IDs, contratos, cobertura, vínculos de parecer e pins de modelo; o provedor rejeita fallback/ausência de `modelUsage`; falta conferência em execução real |
| 12 | Testes e checks verdes | parcial | Suíte/lint/typecheck/build locais verdes; gate de release reprova intencionalmente enquanto não existir certificado; remoto não pode rodar sem push |
| 13 | Ambiente restaurado | pendente | `AtelierWorkerFechamento` ainda existe no Windows; principal está desabilitado |
| 14 | PR contém código auditado | pendente | PR #3 está desatualizado; push não autorizado |
| 15 | Relatório final sem pendências | pendente | Este ledger registra as pendências sem reinterpretá-las |

## Bloqueio externo atual

O health-check mínimo do Claude CLI com o ID oficial `claude-opus-5` alcançou o
serviço, mas retornou HTTP 429, limite semanal, com zero tokens processados e
reset informado às 13h. Até o reset, executar novamente canários ou laboratório
seria uma repetição idêntica sem nova hipótese.

## Próxima sequência

1. Após o reset, executar três canários isolados (`--disco`, dois capítulos,
   `--completo`) e corrigir defeitos gerais até 3/3 pleno.
2. Executar `v2-lab-isolado.ts`, preservar `execucao.json`,
   `avaliacao-cega.json` e `relatorio.json`.
3. Exportar os rótulos com `v2-rotulos-humanos.ts`, concluir ocorrências e
   atestações, validar em dry-run e só então aplicar. O CSV, revisor, data e
   atestações ficam ligados por SHA-256. Rodar o calibrador; promover somente
   se precisão, recall, holdout e não-regressão passarem.
4. Registrar/exportar a avaliação humana do laboratório e executar
   `v2-certificar-release.ts`; o certificado precisa casar com runtime,
   modelos fixos, contratos, corpus, canários e cinco hashes de evidência.
5. Executar fluxo autenticado do wizard e meta-9 longa em sandbox seguro.
6. Solicitar a autorização mínima para a prova real não-canário.
7. Restaurar ambiente, atualizar matriz, apresentar SHA/diff e pedir autorização
   explícita para push/PR/merge/deploy.
