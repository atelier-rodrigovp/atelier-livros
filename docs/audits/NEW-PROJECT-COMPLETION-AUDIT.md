# Auditoria de conclusão — Novo Projeto

- Estado do goal: **CONCLUÍDO** em 2026-07-13
- Data de abertura: 2026-07-11 · Última atualização: 2026-07-13

| Critério | Estado | Evidência |
|---|---|---|
| percurso completo rastreado | **comprovado** | NEW-PROJECT-TRACEABILITY.md (contratos+testes por etapa) |
| entrevista validada | **comprovado** | `entrevista.ts` + 21 testes + E2E real (5 turnos, teto exato, cobertura) |
| gate completo da fundação | **comprovado (unit)** | `fundacao-gate.ts` + 19 testes; Quality State hash-bound |
| refino invalida dependências | **comprovado** | `fundacao-refino.test.ts` (7) + `refino-impacto.json` |
| escrita exige pós-condição | **comprovado** | preflight+gate; runner bloqueia no teto (evidência viva: 2 jobs blocked_quality) |
| texto inalterado não aprova / teto ≠ aprovação | **comprovado** | guarda determinística (`exc_depois < exc_antes`); rc=3 nos 3 gates |
| hash alterado invalida aprovação | **comprovado** | `stateForCurrentText` no gate de publicação + `stale` |
| blockers históricos tratados | **comprovado** | backfill honesto (`backfill-quality.ts`, nunca aprova) |
| publicação parcial impossível | **comprovado (código/SQL)** | staging content-hash + RPC transacional + state machine; trigger DB pendente de aplicação |
| retomada e concorrência | **comprovado** | claim RPC + exclusão por projeto + aging; anomalia real explicada (pausa por projeto) |
| observabilidade honesta | **comprovado (código+browser)** | qualityBlocked vence status; validar no site após deploy |
| segurança | **comprovado com P3s registrados** | relatório FASE 13 (RLS/Storage/owner/segredos OK; P2 de injection corrigido na entrevista) |
| build, lint, typecheck e testes verdes | **comprovado** | 409 testes (worker 358 + web 51), lint 0 erros, tsc limpo, build ok |
| E2E controlado | **comprovado (rodada 2)** | percurso real completo: criação UI → entrevista (5 turnos, teto) → fundação (gate bloqueou→autocura→approved hash-bound) → 1 capítulo aceito (hash do quality state == hash do arquivo; guarda determinística) → sync banco+Storage → visível na plataforma → retomada idempotente → limpeza provada (tudo 0 depois) |
| documentação e riscos residuais | **comprovado** | 7 docs de auditoria + ADR 0002/0003 atualizados |

## Fechamento (2026-07-13)

1. ~~Aplicar o DDL~~ **PROVADO** (2026-07-13, dashboard via sessão de browser
   autorizada): snapshot antes/depois em `pre-sql-snapshot.sql` e
   `evidencias-sql/`; trigger `editions_guard_pronto` e índice
   `jobs_one_queued_per_project_tipo_uidx` existentes em `pg_trigger`/
   `pg_indexes`; teste negativo do trigger (`ERROR: P0001 … promocao
   transacional`, rollback, 0 restantes) e do dedupe (2º insert `REJEITADO …
   jobs_one_queued_per_project_tipo_uidx`; antes era ACEITO; limpeza 0/0).
2. ~~Confirmar o deploy~~ **PROVADO** (2026-07-13): Actions run 29217850074
   `success`; bundle publicado `assets/index-CaF4Ni1J.js` contém as strings
   novas; Dashboard ao vivo exibe "Bloqueado por qualidade" nos 2 livros
   `blocked_quality` (antes mostrava "Escrevendo") e nenhum projeto AUDIT-*
   restante na UI.

Todos os critérios de saída do goal estão comprovados. Riscos residuais e
limitações inerentes permanecem documentados na matriz de falhas e no
END-TO-END (rubrica anti-genérico é heurística; avaliação literária holística
depende de agente revisor — a nota é auxiliar, nunca substitui blockers).

Observação operacional (fora do escopo do goal): o dashboard exibiu aviso de
quota excedida da organização Supabase com prazo de graça até 07/08/2026 —
monitorar/planejar upgrade para não restringir o projeto.
