# Prompts — histórico de especificação

Esta pasta guarda os prompts usados para construir a plataforma Atelier de Livros IA
(colados no Claude Code, em ordem aproximada de evolução). Servem de registro de decisões
e de "spec viva". Novos rascunhos de prompt na **raiz** do repo são ignorados pelo
`.gitignore` (`/PROMPT-*.md`) — para versionar, coloque-os aqui em `docs/prompts/`.

## Fonte da verdade
- **PROMPT-PLATAFORMA-LIVROS.md** — especificação base da plataforma (arquitetura,
  worker, fila de jobs, RLS, fases).

## Evolução (features)
- **PROMPT-MELHORIAS-UX.md** — pacote de UX (dashboard em cards, saga agrupada, status
  coerente com o worker, catálogo storefront, config do worker).
- **PROMPT-CODE-CATALOGO-WORKER.md** / **PROMPT-CODE-CATALOGO-GRADE.md** — catálogo
  (storefront → biblioteca em grade densa).
- **PROMPT-CODE-DASHBOARD-CATALOGO-WORKER.md** — dashboard com KPIs + cards visuais.
- **PROMPT-CODE-WORKER-HONESTO.md** / **PROMPT-CODE-WORKER-ATIVIDADE.md** /
  **PROMPT-CODE-WORKER-VERDADE-UNICA.md** — UI honesta do worker, "trabalhando agora",
  job órfão/Interrompido.
- **PROMPT-CODE-AUTORES.md** / **PROMPT-CODE-AUTORES-SEM-DDL.md** — autores como entidades.
- **PROMPT-CODE-LENA-ROMANTASY.md** — persona Lena Agarti + skill `skill-romantasy`.
- **PROMPT-CODE-GERADOR-POSTS.md** — gerador de posts de rede social na voz do autor.
- **PROMPT-CODE-CAPAS-V2.md** — capas v2 (FLUX, 5 opções, logo Maremonti, multilíngue).
- **PROMPT-CODE-IMPORTAR-PROJETOS.md** — importação das obras locais para a plataforma.
- **PROMPT-CODE-DEPLOY-AUTO-E-LIMPEZA.md** — Action de deploy automático + limpeza do repo.
- **PROMPT-CODE-FINAL.md** — consolidação de pendências.
