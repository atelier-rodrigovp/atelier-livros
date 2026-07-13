# ADR 0003 — Gate da fundação, invalidação pós-refino e fila justa

- Status: aceito (implementado em 2026-07-12; DDL pendente de aplicação manual)
- Contexto: auditoria end-to-end "Novo Projeto → Livro publicado"

## Decisões

1. **Contrato determinístico da entrevista** (`worker/src/entrevista.ts`): a saída
   do agente nunca atualiza o projeto sem validação de schema, tipos, coerência
   (capítulos×páginas×palavras) e COBERTURA (obrigatório perguntado ≠ inferido).
   O prompt é derivado de `CAMPOS_OBRIGATORIOS` — a contagem anunciada nunca
   diverge da lista. Obrigatório não perguntado vira pergunta determinística
   (finita, fora do teto). Input do autor é cercado como dado não-confiável.

2. **Gate da fundação com Quality State hash-bound** (`worker/src/fundacao-gate.ts`):
   presença+parseabilidade+coerência cruzada+craft comprovada+voz registrada.
   `quality/fundacao.quality.json` vincula a decisão aos hashes dos arquivos.
   `criar_fundacao` reprovada não vira status `fundacao`; início de escrita
   (0 capítulos) exige gate aprovado; retomada de livro vivo não é brickada
   (estado gravado + aviso alto; publicação segue protegida pelo gate final).

3. **Consistência de voz idempotente**: craft canônica comprovada no perfil ⇒
   registro automático auditável na Bíblia (hash+timestamp); divergência autoral
   é preservada; craft não comprovada ⇒ blocker. Substitui o aviso eterno.

4. **Refino invalida dependências**: hashes antes/depois; aprovações de capítulo
   `approved*` → `stale` (`FUNDACAO_ALTERADA_POS_REFINO`); specs afetadas
   listadas; impacto em `estado/refino-impacto.json` e no progresso do job;
   normalizadores re-executados (sequência única `aplicarNormalizadoresFundacao`);
   gate reavaliado — refino que quebra a fundação bloqueia.

5. **Backfill honesto** (`worker/src/backfill-quality.ts` + script): projetos
   antigos sem Quality State recebem estado re-MEDIDO (muleta/cadência) como
   `pending`/`rewrite_required` — nunca `approved`; decisões reais do runner são
   preservadas. Aprovação exige o loop do runner ou exceção humana.

6. **Fila justa**: prioridade efetiva = prioridade + 1/24h de espera (anti-
   starvation, `fila.ts`). Dedupe de enqueue fechado no banco por índice único
   parcial (`jobs_one_queued_per_project_tipo_uidx`).

7. **Guarda de promoção no banco**: trigger `editions_guard_pronto` impede
   `editions.status='pronto'` fora da transação `promote_publication`
   (marcada via `set_config('app.promotion_gate','1',true)`).

8. **Redução de qualidade explícita**: desligar o micro-loop exige confirmação
   na UI (com timestamp) e é rotulada no progresso do job
   (`reducao_qualidade`); a publicação continua exigindo aprovações hash-bound
   (renovadas pelo DESMANEIRISMO book-wide).

## Pendências de aplicação (autor)

- Aplicar `supabase/reliability.sql` atualizado no dashboard (o arquivo inteiro,
  na ordem: `promote_publication` com `set_config` ANTES do trigger-guarda;
  índice de dedupe exige zero duplicatas `queued` por projeto+tipo).
- Rodar `pwsh worker/skill-patches/instalar-skills.ps1` para sincronizar o
  runner instalado (divergência atual é só de comentários; comportamento igual).
- Deploy do frontend (push para master) para as correções de UI chegarem ao
  GitHub Pages.
