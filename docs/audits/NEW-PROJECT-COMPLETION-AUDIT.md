# Auditoria de conclusão — Novo Projeto

- Estado do goal: **ativo** (2 critérios pendentes de ação/decisão do autor)
- Data de abertura: 2026-07-11 · Última atualização: 2026-07-12

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

## O que falta para concluir o goal

1. **Aplicar o DDL** (`supabase/reliability.sql`) no dashboard — único item que
   depende exclusivamente do autor (guia: `docs/audits/APLICAR-RELIABILITY-SQL.md`).
   Sem ele, a guarda de `pronto` no banco e o dedupe de enqueue existem só no
   arquivo versionado (o comportamento do worker já os cobre em código/testes).
2. **Confirmar o deploy** das correções de UI na URL publicada (push desta
   rodada dispara o GitHub Actions).
