# ADR 0001 — Quality State e gates bloqueantes

- Status: aceito
- Data: 2026-07-11

## Decisão

Aprovação será vinculada ao hash do texto. Toda correção será seguida de nova medição.
Teto de tentativas produzirá bloqueio, não aprovação. A publicação terá uma decisão
estruturada única e manifest de evidências.

## Motivo

O sistema anterior confundia “tentamos corrigir” com “foi corrigido” e permitia EPUB
após o teto do desmaneirismo. Isso tornava gates consultivos apesar da documentação.

## Consequências

Livros podem parar em `blocked_quality`; essa parada é intencional e visível. Textos
alterados precisam ser reavaliados. Exceções humanas tornam-se explícitas e auditáveis.
