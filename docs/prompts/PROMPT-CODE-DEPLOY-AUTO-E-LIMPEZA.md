# Prompt para o Claude Code — deploy automático (GitHub Action) + limpeza do repo

Você roda na minha máquina, repositório `ATELIER-LIVROS`. Faça de forma autônoma. Objetivo: (1) todo push no `master` publicar sozinho no GitHub Pages (sem eu lembrar do passo gh-pages), e (2) organizar os arquivos que foram parar no repo. Não exponha segredos. Ao final, faça commit + push no master e confirme que a Action rodou e o site atualizou.

## Contexto técnico (já verificado)
- Front Vite. Build: `tsc -b && vite build`. Base no Pages: `vite.config.*` usa `base: process.env.GHPAGES ? "/atelier-livros/" : "/"`.
- O site é servido pelo branch **`gh-pages`** (publicação do `dist/`). Hoje o deploy é manual e por isso o master fica à frente do que está no ar.
- O build precisa, em tempo de build, de **`VITE_SUPABASE_URL`** e **`VITE_SUPABASE_ANON_KEY`** (são chaves **públicas** anon — não é a service_role). Estão no `.env` da raiz local.
- App é SPA com rotas (deep-links) — precisa de fallback `404.html`.

## Parte 1 — GitHub Action de deploy automático
Crie `.github/workflows/deploy.yml` que, em **push no `master`**:
1. `actions/checkout`, `actions/setup-node` (Node 20), `npm ci`.
2. Roda o build com base do Pages e os secrets: `GHPAGES=1 VITE_SUPABASE_URL=${{ secrets.VITE_SUPABASE_URL }} VITE_SUPABASE_ANON_KEY=${{ secrets.VITE_SUPABASE_ANON_KEY }} npm run build`.
3. **SPA fallback:** copie `dist/index.html` para `dist/404.html` (passo no workflow) para deep-links funcionarem no Pages.
4. Publica `dist/` no branch `gh-pages` com `peaceiris/actions-gh-pages@v4` (usando `GITHUB_TOKEN`; `permissions: contents: write`). `publish_dir: ./dist`, `publish_branch: gh-pages`.
- Adicione `concurrency` para não rodar dois deploys ao mesmo tempo. Não rode em pushes que mudem só `worker/**` ou `**/*.md` se quiser (opcional `paths-ignore`), mas o padrão pode publicar sempre.

### Secrets (faça do jeito mais autônomo possível)
- Leia os valores atuais de `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` do `.env` local.
- Se o **GitHub CLI (`gh`) estiver autenticado**, crie os secrets sozinho: `gh secret set VITE_SUPABASE_URL --body "<valor>"` e idem para a anon key. (São chaves públicas; risco baixo.)
- Se `gh` **não** estiver autenticado, NÃO trave: deixe o workflow pronto e me diga claramente os 2 valores + o passo manual exato (GitHub → Settings → Secrets and variables → Actions → New repository secret), para eu colar. Não exponha a service_role (essa nunca vai pra secret de front).
- Confirme nas Pages settings que a fonte continua o branch `gh-pages` (não mude para "GitHub Actions source" se já está em branch).

### Verificação
Após commitar o workflow e dar push, confirme que a Action **rodou com sucesso** e que o `index-*.js` servido em `atelier-rodrigovp.github.io/atelier-livros` é o novo (me diga o nome do arquivo). A partir daqui, todo push no master publica sozinho.

## Parte 2 — Limpeza do repo
O `git add -A` anterior commitou arquivos de trabalho na raiz. Organize, sem apagar nada útil:
- **Mova os `PROMPT-*.md`** da raiz para `docs/prompts/` (use `git mv`, preservando histórico). Crie `docs/prompts/README.md` listando-os.
- **Remova `Iniciar-Worker.bat`** do repo (`git rm`) — foi descartado.
- **Mantenha** `worker/scripts/*.mjs` (`importar-projetos.mjs`, `seed-autores.mjs`) — são ferramentas reais; se quiser, mova para `worker/scripts/` já é o lugar certo, só garanta que não rodam no build do front.
- Atualize `.gitignore` para ignorar arquivos de rascunho na raiz no futuro (ex.: `/PROMPT-*.md`) e qualquer `*.local`, mantendo os de `docs/prompts/` versionados.
- (Opcional) Se `skills-livro.zip` (grande) estiver versionado e não for necessário no front, sugira ignorá-lo — mas só remova se eu confirmar; por ora só aponte.

## Aceite
- [ ] `.github/workflows/deploy.yml` criado; push no master dispara build + publish no `gh-pages` automaticamente.
- [ ] Secrets `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` configurados (via `gh` se autenticado; senão instruções claras pra mim).
- [ ] `404.html` gerado no deploy (deep-links OK).
- [ ] `PROMPT-*.md` movidos para `docs/prompts/`; `Iniciar-Worker.bat` removido; `.gitignore` atualizado.
- [ ] Primeira Action verde; bundle novo confirmado no ar.

## Limites
- Só chaves públicas (`VITE_*`) viram secret de front; a service_role NUNCA.
- Não mude a arquitetura de saga/dados; não apague projetos, scripts úteis nem os prompts (mover, não deletar).
- Sem libs novas pesadas.
