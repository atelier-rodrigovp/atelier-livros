# Prompt para o Claude Code — Autores como entidades (página dedicada) + redistribuir obras

Você roda na minha máquina, no repositório `ATELIER-LIVROS` (React+Vite+TS, shadcn/ui, Tailwind, Supabase; deploy GitHub Pages). Faça tudo de forma autônoma. Ao final: `npm run build` limpo, testes passando, `git commit` + `git push`, e **valide no navegador com Playwright** (login senha `AtelierLivros2026`) com screenshots. Use a service_role do `worker/.env` para as escritas de dados (seed/atribuição). Nunca exponha segredos.

## Objetivo
Transformar os **autores (pseudônimos)** em entidades de primeira classe: uma página "Autores" no menu esquerdo para personificá-los (bio, personalidade, referências, estilo, avatar e redes sociais), e **reatribuir cada obra ao autor certo**. Cada autor tem um estilo:
- **Mia Peducci** — thriller-romance doméstico (Colleen Hoover × Freida McFadden).
- **Aria Nolan** — suspense psicológico seco-sensorial (McFadden/Coben; obsessão de um sentido).
- **Iago Provardi** — techno-thriller de conspiração (Dan Brown / Crichton).
- **Lena Agarti** — a definir (sem obras ainda).

## Parte 1 — Schema (migração idempotente em `supabase/`)
- Tabela `authors`: `id uuid pk default gen_random_uuid()`, `owner uuid default auth.uid()`, `nome text`, `slug text unique`, `estilo text`, `genero text`, `bio text`, `personalidade text`, `referencias text`, `avatar_path text`, `social jsonb default '{}'` (chaves: instagram, x, tiktok, threads, youtube, site), `created_at`, `updated_at` (trigger updated_at como as outras tabelas).
- `alter table projects add column if not exists author_id uuid references authors(id) on delete set null;`
- RLS por owner em `authors` (espelhe o padrão de `supabase/policies.sql`): select/insert/update/delete só do próprio `owner`. Habilite realtime se as outras tabelas usam.
- Storage: crie bucket privado `autores` para avatares + políticas owner-based (espelhe `supabase/storage.sql`, caminho `"<owner>/<author_id>/avatar.<ext>"`).
- Atualize `src/lib/types.ts` com `Author` e o campo `author_id` em `Project`.

## Parte 2 — Seed dos 4 autores + atribuição das obras (via service_role)
Crie os autores (se já existirem por nome, faça update) com este conteúdo inicial (o usuário edita depois na UI):

- **Mia Peducci** — estilo: "Thriller-romance doméstico"; gênero: "Suspense psicológico / romance"; referências: "Colleen Hoover, Freida McFadden, Ken Follett (saga)". bio: "Thrillers-romance domésticos que doem e viram a página: coração de Colleen Hoover dentro da máquina de Freida McFadden. Narradoras não-confiáveis, segredos de família, trauma levado a sério e um twist que sempre foi justo. Casas, marés e memórias que escondem mais do que contam." personalidade: "Intensa, empática, atenta ao não-dito; fala com intimidade e franqueza emocional; gosta de finais que não dão paz."
- **Aria Nolan** — estilo: "Suspense psicológico seco-sensorial"; gênero: "Thriller psicológico"; referências: "Freida McFadden, Harlan Coben; atmosferas de Perfume e The Conversation". bio: "Suspense psicológico de frase seca e nervo exposto. Narradores não-confiáveis que medem o mundo por um sentido levado ao limite — o perigo chega primeiro como ruído. A prosa é faca; a percepção é barroca." personalidade: "Contida, precisa, inquietante; humor seco; atenção clínica ao detalhe sensorial."
- **Iago Provardi** — estilo: "Techno-thriller de conspiração"; gênero: "Mistério científico / techno-thriller"; referências: "Dan Brown, Michael Crichton, Blake Crouch". bio: "Techno-thrillers de página-vira sobre conspirações, ciência e segredos enterrados — Dan Brown com lastro factual real. Frio, clínico, ritmo de bisturi; capítulos curtos que terminam em gancho." personalidade: "Cerebral, cético, fascinado por mistérios institucionais; gosta de fato verificável dramatizado." (Nota: o catálogo dele também tem obra épica/literária.)
- **Lena Agarti** — estilo: "A definir"; bio: "Pseudônimo em formação — estilo e catálogo a definir."; personalidade: "A definir.".

`social`: deixe os 6 campos vazios com a intenção "a criar" (a UI marca como pendente).

**Atribua `projects.author_id`** casando por `titulo`/`serie` dos projetos já importados:
- **Iago Provardi:** série "Vésper".
- **Aria Nolan:** "O Colecionador de Silêncios"; "A Casa que Conta".
- **Mia Peducci:** série "A Linhagem das Cinzas" (vols 1–3); "A Memória dos Outros"; "O que a Maré Esconde"; "A Última Carta de Vênus"; "Enquanto Você Dormia em Lisboa"; série "Última Chamada para o Embarque" (vols 1–2).
- **Lena Agarti:** nenhuma.
(Se um projeto não existir ainda no banco, ignore-o sem erro — a atribuição é por correspondência de título.)

## Parte 3 — UI
1. **Menu esquerdo:** novo item **"Autores"** (ícone de pessoas) → rota `/autores`. Adicione a rota no router.
2. **Página `/autores` (lista):** grid de cards — avatar (ou iniciais), nome, estilo, nº de obras, mini-resumo. Botão "Novo autor".
3. **Página `/autores/:id` (detalhe/edição):**
   - Cabeçalho: avatar (upload pro bucket `autores`), nome, estilo, gênero.
   - Campos editáveis (salvam em `authors`): bio, personalidade, referências, estilo, gênero.
   - **Redes sociais:** linha por rede (Instagram, X, TikTok, Threads, YouTube, Site) com input de handle/URL; quando vazio, badge "a criar"; quando preenchido, vira link clicável. Salva em `authors.social`.
   - **Obras do autor:** grid de capas (reuse `CoverArt`), cada uma com ação "Mover para outro autor" (select dos autores) que atualiza `projects.author_id`. Assim o usuário corrige qualquer atribuição (ex.: mover "A Casa que Conta" ou "A Última Carta de Vênus") sem fricção.
   - Botão salvar com toast; otimista.
4. **Página do projeto (`Projeto.tsx`):** adicione um **seletor de Autor** (dropdown dos autores) que grava `projects.author_id`; mostre o autor no cabeçalho, linkando para `/autores/:id`.
5. **Catálogo:** adicione **filtro por autor** (chips ou select, junto dos filtros existentes) e mostre o nome do autor no rótulo do pôster. (Não quebre a grade densa nem o agrupamento por série já existentes.)
6. **Dashboard:** opcional — no card do projeto, mostrar o autor.

## Parte 4 — Redes sociais (escopo desta fase)
Apenas **gerenciar perfis e links** (armazenar handles/URLs por rede, marcar "a criar"/"ativo"). **Não** implemente postagem/integração real (OAuth, publicação) agora — deixe um espaço claro para a fase futura "gerar rascunho de post na voz do autor" (pode adicionar um botão desabilitado "Gerar post (em breve)"). Se for trivial, deixe um campo de notas por rede.

## Aceite (com screenshots Playwright)
- [ ] Tabela `authors` + `projects.author_id` + RLS + bucket `autores` criados (migração idempotente).
- [ ] 4 autores semeados com bio/personalidade/estilo; obras atribuídas conforme o mapa.
- [ ] Menu "Autores" + lista + detalhe editável (bio, personalidade, referências, redes sociais, avatar) funcionando; salvar persiste.
- [ ] Reatribuição de obra entre autores funciona (mover "A Casa que Conta" como teste).
- [ ] Seletor de autor na página do projeto; filtro por autor no Catálogo.
- [ ] `npm run build` limpo, testes ok, commit + push, bundle novo servindo; screenshots de `/autores`, um detalhe de autor e o Catálogo filtrado por autor.

## Limites
- Não faça postagem real em redes sociais nesta fase (sem integrações/OAuth).
- Não altere o modelo de saga (volumes continuam projetos separados).
- Não exponha segredos do `.env`. Migração de dados ok; não apague projetos existentes.
- Sem libs novas pesadas (shadcn/ui + Tailwind).
