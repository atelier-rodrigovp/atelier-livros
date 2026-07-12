# Auditoria de conclusão do goal

Data: 2026-07-11. Esta auditoria não considera “código escrito” como prova suficiente.

| Frente | Estado | Evidência | Falta |
|---|---|---|---|
| Quality State | comprovado localmente | hash, métricas, decisionBy, blockers, exceção; testes | observar arquivos numa execução isolada real |
| Recontagem | comprovado localmente | runner + aceitação em seis cenários | executar com Claude somente após instalar patch |
| Teto != aprovação | comprovado localmente | Python e TS bloqueiam; testes | nenhuma etapa local |
| Gate final | comprovado localmente | `publication-gate` e integração | execução isolada com EPUB real |
| Paridade TS/Python | parcial comprovado | fixtures comuns de muletas | ampliar fixtures para todas as regras duplicadas |
| Fluxo escrever_livro | comprovado por harness | claim até estado do front | não executado contra serviços reais por segurança |
| Retry/circuit breaker | comprovado localmente | política e classificação rc/timeout | observar outage simulada com worker completo |
| Publicação transacional | comprovado por adapters | falhas de upload/DB, retomada e contrato SQL | executar SQL em Postgres efêmero |
| Concorrência | contrato comprovado | claim RPC, teste do perdedor e invariantes SQL | corrida real requer Postgres |
| Skill patches | verificador comprovado | manifest e hashes | instalação está divergente; aplicação exige autorização |
| Observabilidade | lógica comprovada | testes de estados operacionais | validação visual requer deploy/local auth controlada |
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
- Retomada não duplica versão: **sim por chave de conteúdo; DB real pendente**.
- Dois workers no mesmo projeto: **RPC implementada; corrida real pendente**.
- Drift de skill detectado: **sim; instalação atual foi corretamente detectada como divergente**.
- Observabilidade separa atual/histórico/bloqueios: **lógica sim; visual pós-deploy pendente**.
- Suíte e análise estática: **ver ledger com a execução mais recente**.

## Decisão de conclusão

O goal **não pode ser declarado concluído** enquanto a migração não for validada em
Postgres, o patch não for instalado/testado e a interface resultante não for verificada.
Essas ações foram deliberadamente excluídas da execução automática pelas regras de
segurança do próprio goal.
