# Matriz requisito -> implementação -> teste

| Requisito | Implementação | Prova |
|---|---|---|
| aprovação por hash | `quality-state.ts`, runner `quality/*.json` | `quality-state.test.ts` |
| exceção humana explícita | `applyQualityException` + job auditável | `quality-state.test.ts` |
| recontagem pós-correção | runner `gate_maneirismo_capitulo`, `quality-loop.ts` | `quality-loop.acceptance.test.ts` |
| teto não aprova | runner + `decideQualityState` | aceitação casos 2–5 |
| gate final | `publication-gate.ts`, `jobs.ts` | `publication-gate.test.ts` |
| teste sem segredo | mock de adapters em `hidratar.test.ts` | 6 testes de hidratação |
| retry com teto | `retry-policy.ts`, `index.ts` | `retry-policy.test.ts` |
| claim distribuído | `supabase/reliability.sql`, `claim.ts` | `claim.test.ts` |
| artifact idempotente | índice único, staging por conteúdo e `promote_publication` | `publication-transaction.test.ts` |
| ciclo escrever_livro | claim + quality loop + gate + staging + promoção | `escrever-livro.integration.test.ts` |
| status pronto exclusivo | `state-machine.ts` + RPC de promoção | `state-machine.test.ts` |
| falhas do runner | `runner-outcome.ts` + circuit breaker | `runner-outcome.test.ts` |
| owner obrigatório | filtros explícitos em jobs/index/hidratar | `owner-scope.test.ts` |
| paths seguros | `path-safety.ts` | `path-safety.test.ts` |
| skill drift | manifest + `skill-manifest.ts` | `skill-manifest.test.ts` |
| paridade TS/Python | fixture JSON compartilhada | `quality-parity.test.ts` + `test_quality_parity.py` |
| observabilidade honesta | `Observabilidade.tsx` | testes + verificação da rota publicada sem erros/overflow |

## Limitações deliberadas

O patch foi instalado com backup e conferência do manifest, e o front foi publicado e
verificado. A migração foi exercitada em Postgres efêmero e aplicada no Supabase dentro
de uma transação. O catálogo real confirmou as duas funções e o índice; o PostgREST expõe
2/2 RPCs e os artefatos permanecem com zero identidades duplicadas.
