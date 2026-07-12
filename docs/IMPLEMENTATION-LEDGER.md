# Ledger de implementação — confiabilidade e qualidade

Este ledger registra evidência incremental do goal de transformar gates e estados
editoriais em garantias verificáveis. Ele não substitui testes nem ADRs.

## Baseline — 2026-07-11

- Hipótese: a suíte anunciada como verde não era hermética.
- Arquivos afetados: `worker/src/hidratar.test.ts`.
- Risco: testes locais exigirem credenciais de produção e falharem antes de executar.
- Evidência antes: `npm test` coletou 22 suítes e falhou ao importar
  `worker/src/supabase.ts`; 284 testes passaram, mas `hidratar.test.ts` executou 0.
- Mudança: adapters externos foram substituídos no teste por mocks explícitos; o
  comportamento de hidratação continua exercitado somente via `HidratarIO` falso.
- Prova esperada: a suíte completa coleta também os testes de hidratação sem ler `.env`.
- Pendências: Quality State, pós-condições, gate final, retry, publicação, locks,
  manifest de skills, observabilidade e documentação canônica.
- Próximo ciclo: introduzir contrato único de Quality State com invalidação por hash.

## Ciclos 2–9 — contratos, gates e operação

- Hipótese: gates falhavam porque tentativa e teto eram tratados como aprovação.
- Arquivos: runner, `quality-state.ts`, `quality-loop.ts`, `publication-gate.ts`,
  `retry-policy.ts`, `claim.ts`, manifest de skills e Observabilidade.
- Mudanças: pós-medição obrigatória; hash por capítulo; bloqueios distintos; gate final;
  circuit breaker; claim distribuído; upsert de artefatos; preflight de skill; estados
  operacionais honestos; fixtures TS/Python compartilhadas.
- Provas: testes unitários e de aceitação dedicados, Python parity e typecheck.
- Pendências externas: aplicar migração, instalar patch, executar teste em ambiente
  isolado e validar visualmente após deploy — todas exigem autorização e não foram feitas.
- Próximo ciclo: suíte completa, lint, atualização do hash do manifest e auditoria final.

## Auditoria local final — 2026-07-11

- `npm test`: 38 suítes, 351 testes, todos aprovados na auditoria de ciclos 10–14.
- `npm run lint`: 0 erros; 3 avisos preexistentes de Fast Refresh.
- `npm run build`: aprovado; aviso de bundle acima de 500 kB.
- `worker tsc --noEmit`: aprovado.
- Pyflakes: sem achados no runner e nos testes Python selecionados.
- Regressão `gate_spec_capitulo`: aprovada executando o branch real.
- Paridade TS/Python: três fixtures compartilhadas aprovadas.
- Integridade do manifest no repositório: aprovada.
- Contrato SQL: quatro invariantes automatizadas protegem lock por projeto, owner,
  idempotência de artefatos e promoção em função única; execução real ainda requer Postgres.
- Produção/Supabase/skills instaladas/deploy: não alterados.

### Pendências que exigem etapa operacional isolada

- Aplicar e validar `supabase/reliability.sql` em banco de teste antes da produção.
- Auditar duplicatas existentes de artifacts antes de criar o índice único.
- Aplicar patches instalados somente com autorização e executar o preflight real.
- Exercitar falhas transacionais com Postgres/Storage falsos ou ambiente efêmero.
- Validar visualmente a Observabilidade depois de um deploy autorizado.

### Avisos estáticos aceitos e documentados

- Fast Refresh em `CoverArt.tsx`, `ui/badge.tsx` e `ui/button.tsx`: os módulos exportam
  componentes e helpers usados pelo projeto; são 3 warnings, não erros de lint.
- Bundle principal acima de 500 kB: dívida de performance do front, sem impacto sobre
  as garantias de qualidade/consistência deste goal; requer code splitting dedicado.

## Ciclos 10–14 — integração, transação e segurança

- Hipótese: gate final correto ainda podia ser seguido por uploads/updates parciais e
  outros jobs podiam promover `pronto` por caminhos laterais.
- Mudanças: staging por hash; `promote_publication` transacional; teste integrado de
  `escrever_livro`; tradução/revisão aguardam EPUB final; `pronto` exclusivo do gate;
  recontagem após todos os passes; classificação de rc/timeout/sem-rc; owner explícito;
  proteção de caminhos.
- Provas locais: falhas de upload e banco não promovem; retomada usa o mesmo manifest;
  correção ineficaz não faz upload; status bloqueado chega ao contrato do front;
  scanners de owner e testes de path permanecem verdes.
- Pendência externa remanescente: executar as funções SQL num Postgres efêmero/isolado,
  aplicar a migração e patches somente após revisão/autorização e validar o front após deploy.

## Ciclo operacional autorizado — 2026-07-11

- Skill instalada com backup em `~/.claude/skill-backups/20260711231759`; os cinco
  arquivos conferem com o manifest 1.0.0 e o runner instalado concluiu `--dry-run` com rc=0.
- Commit `4a74892` publicado em `master`; workflow GitHub Pages `29176576997` concluído
  com sucesso.
- A rota online de Observabilidade exibiu corretamente `Órfão / worker offline`,
  `Retomada vencida` e `Na fila`; viewport 1280×720 sem overflow horizontal e sem erros
  de console.
- `supabase/reliability.sql` foi executado integralmente em Postgres efêmero (PGlite):
  claim winner/loser e promoção atômica de capítulo, artefato, edição e projeto aprovados.
- Auditoria read-only no Supabase encontrou duas identidades duplicadas, com cinco e
  quatro linhas. Os campos funcionais eram idênticos; foram preservados os dois registros
  mais recentes e removidas sete linhas redundantes. Resultado: 30 artefatos e zero
  identidades duplicadas. Nenhum objeto do Storage foi removido.
- Pendência única: autenticar no painel administrativo e aplicar a migração já validada;
  os RPCs `claim_job` e `promote_publication` ainda não estão expostos pelo PostgREST.
