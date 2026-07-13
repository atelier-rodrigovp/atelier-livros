# ADR 0002 — Contrato da entrevista e Quality State da fundação

- Status: proposto; depende da auditoria
- Data: 2026-07-11

## Contexto

O percurso atual usa JSON produzido por agente para concluir a entrevista e considera a
fundação pronta com um conjunto pequeno de verificações de presença. A auditoria deve
comprovar se isso permite estados completos apenas nominalmente.

## Decisão proposta

Adotar schema determinístico para a entrevista e Quality State agregado da fundação,
vinculado aos hashes de seus arquivos. Escrita só pode iniciar quando esse contrato estiver
aprovado ou houver exceção humana explícita e auditável.

## Estado

Aceito e implementado em 2026-07-12 (ver ADR 0003 para o desenho final):
schema determinístico da entrevista em `worker/src/entrevista.ts` (21 testes) e
Quality State agregado da fundação em `worker/src/fundacao-gate.ts` (19 testes),
vinculado aos hashes dos arquivos. Escrita só inicia com o gate aprovado
(retomada de livros vivos registra o estado sem brickar; exceção humana usa
`applyQualityException`).
