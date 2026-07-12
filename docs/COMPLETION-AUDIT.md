# Auditoria de conclusão do goal

Data: 2026-07-11. Esta auditoria não considera “código escrito” como prova suficiente.

| Frente | Estado | Evidência | Falta |
|---|---|---|---|
| Quality State | comprovado localmente | hash, métricas, decisionBy, blockers, exceção; testes | observar arquivos numa execução isolada real |
| Recontagem | comprovado e instalado | runner + aceitação em seis cenários + dry-run instalado | execução editorial completa com Claude será prova contínua |
| Teto != aprovação | comprovado localmente | Python e TS bloqueiam; testes | nenhuma etapa local |
| Gate final | comprovado localmente | `publication-gate` e integração | execução isolada com EPUB real |
| Paridade TS/Python | parcial comprovado | fixtures comuns de muletas | ampliar fixtures para todas as regras duplicadas |
| Fluxo escrever_livro | comprovado por harness | claim até estado do front | não executado contra serviços reais por segurança |
| Retry/circuit breaker | comprovado localmente | política e classificação rc/timeout | observar outage simulada com worker completo |
| Publicação transacional | comprovado em Postgres efêmero | falhas de upload/DB, retomada e promoção SQL real | aplicar a migração validada no Supabase |
| Concorrência | comprovada em Postgres efêmero | winner/loser via `claim_job` e advisory lock | aplicar a migração validada no Supabase |
| Skill patches | instalado e comprovado | 5/5 hashes, backup e dry-run rc=0 | nenhuma etapa local |
| Observabilidade | publicada e comprovada | deploy Pages, DOM real, layout 1280 px e console sem erros | nenhuma etapa local |
| Segurança | comprovado localmente | owner scanner, paths, acceptEdits | revisão operacional pós-migração |
| Documentação | comprovado | arquitetura, ADR, runbook, ledger e matriz | atualizar após evidência operacional |

## Critérios objetivos

- Capítulo não é aprovado por teto: **sim, prova local**.
- Edição não é pronta com blocker: **sim no código; promoção SQL ainda não executada**.
- Correção seguida de recontagem: **sim**.
- Mudança invalida hash: **sim**.
- Teste integrado `escrever_livro`: **sim, sem serviços externos**.
- Testes sem segredo: **sim**.
- Retry com teto: **sim**.
- Retomada não duplica versão: **sim por chave de conteúdo e promoção exercitada em Postgres efêmero**.
- Dois workers no mesmo projeto: **winner/loser exercitado em Postgres efêmero**.
- Drift de skill detectado: **sim; instalação foi atualizada e os 5 hashes agora conferem**.
- Observabilidade separa atual/histórico/bloqueios: **sim na versão publicada**.
- Suíte e análise estática: **ver ledger com a execução mais recente**.

## Decisão de conclusão

O goal **ainda não pode ser declarado concluído** porque a migração, embora aprovada em
Postgres efêmero, ainda não foi aplicada no Supabase. O patch e o deploy já foram
instalados e verificados. A auditoria de produção encontrou duas identidades de artefato
duplicadas (nove linhas); sete linhas funcionalmente idênticas foram removidas, mantendo
o registro mais recente de cada identidade. O banco ficou com 30 artefatos e zero
identidades duplicadas, pronto para receber o índice único.
