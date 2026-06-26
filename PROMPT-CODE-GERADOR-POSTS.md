# Prompt para o Claude Code — gerador de posts de rede social na voz de cada autor

Você roda na minha máquina, no repositório `ATELIER-LIVROS` (React+Vite+TS, shadcn/ui, Tailwind, Supabase + worker local que executa a IA via fila de `jobs`; deploy GitHub Pages). Faça tudo de forma autônoma. Ao final: `npm run build` limpo, testes ok, `git commit` + `git push`, e valide no navegador com Playwright (senha `AtelierLivros2026`). Use a service_role do `worker/.env` quando precisar semear/verificar dados; nunca exponha segredos.

## Pré-requisito
A feature **Autores** já existe (tabela `authors` com `bio`, `personalidade`, `referencias`, `estilo`, `genero`, `social`; `projects.author_id`; página `/autores/:id`). Esta fase **adiciona o gerador de posts na voz do autor**. Se algo da feature Autores faltar, crie o mínimo necessário, mas não a refaça.

## Objetivo
Gerar **rascunhos de posts de rede social escritos na voz de cada autor** (personalidade + estilo + referências), opcionalmente ancorados em uma obra. Apenas **gerar, editar, aprovar e copiar/exportar** — **sem postagem real** (sem OAuth/integração) nesta fase.

## Arquitetura: usar a fila de jobs + worker (como o resto da plataforma)
A geração roda no **worker** (mesma ponte `jobs` que escreve livros/traduz), para reaproveitar o acesso ao Claude. A web só enfileira e exibe.

### Parte 1 — Schema (migração idempotente em `supabase/`)
- Tabela `social_posts`: `id uuid pk`, `owner uuid default auth.uid()`, `author_id uuid references authors(id) on delete cascade`, `project_id uuid references projects(id) on delete set null`, `rede text` (instagram|x|tiktok|threads|youtube|site), `objetivo text`, `tema text`, `conteudo text`, `variantes jsonb default '[]'` (alternativas geradas), `hashtags text[]`, `status text default 'rascunho'` (rascunho|aprovado|arquivado), `created_at`, `updated_at` (trigger updated_at). RLS por owner (espelhe `policies.sql`); habilite realtime se as outras usam.
- Adicione o tipo de job `gerar_post_social` (à lista de tipos em `src/lib/types.ts` e onde o worker faz o dispatch).
- Atualize `src/lib/types.ts` com a interface `SocialPost`.

### Parte 2 — Worker (`worker/src/jobs.ts`): handler `gerarPostSocial`
- Payload do job: `{ author_id, rede, objetivo, tema?, project_id?, n_variantes? (default 3) }`.
- O handler: carrega o autor (`nome, estilo, genero, bio, personalidade, referencias`) e, se houver `project_id`, o contexto da obra (título, gênero, sinopse/`Biblia` se disponível em Storage ou em `publishing_packages.sinopse`). Monta um prompt que instrui o Claude a **escrever NA VOZ do autor** (injete personalidade + estilo + referências como contrato de voz) e a respeitar a **spec da rede** (abaixo). Gera `n_variantes` alternativas + hashtags sugeridas.
- **Modelo:** use um modelo leve/barato para esta tarefa (sonnet ou haiku — post social não precisa de Opus); siga a política de modelos do projeto.
- Grava 1 linha em `social_posts` com `conteudo` = melhor variante e `variantes` = todas, `hashtags`, `status='rascunho'`. Atualiza progresso/heartbeat como os outros jobs. Respeita `worker_control.enabled` (pausa) como o resto.

### Parte 3 — Spec por rede (o gerador deve seguir)
- **Instagram:** legenda envolvente; 1ª linha = gancho forte; 3–6 hashtags relevantes (não spam); CTA ("link na bio"); emojis com moderação conforme a voz do autor.
- **X (Twitter):** ≤ 280 caracteres; punchy; 0–2 hashtags; sem emoji se a voz for seca (ex.: Aria/Iago).
- **TikTok:** roteiro curto — gancho nos primeiros 3s + legenda; sugerir ideia visual; tom nativo da plataforma.
- **Threads:** conversacional, sem hashtag-spam; convida resposta.
- **YouTube:** título + descrição (vídeo) ou post de comunidade, conforme o objetivo.
- **Site/blog:** nota/parágrafo curto, mais formal.
Sempre em pt-BR por padrão (a menos que o objetivo peça outro idioma). A voz mantém a assinatura do autor: ex. Mia (intimista, emocional, soco no fim), Aria (seca, sensorial, inquietante), Iago (cerebral, factual, gancho).

### Parte 4 — UI
1. **Página do autor (`/autores/:id`):** em cada rede social, troque o stub "Gerar post (em breve)" por um botão **"Gerar post"** ativo. Abre um diálogo: rede (pré-preenchida), **objetivo** (ex.: divulgar lançamento, teaser, bastidores, frase de impacto, engajamento), **tema** (livre), **obra** (select opcional dos projetos do autor), **nº de variações**. Ao confirmar, enfileira `gerar_post_social` e mostra estado (na fila / gerando / pronto), via realtime.
2. **Aba/seção "Conteúdo" do autor:** lista os `social_posts` (filtra por rede/status), cada card com: rede, objetivo, obra (se houver), o texto, as variações (alternar), hashtags. Ações: **Copiar**, **Editar** (salva `conteudo`), **Aprovar/Arquivar** (muda `status`), **Exportar .txt**. Sem botão de "publicar" real.
3. Se o worker estiver **offline/Parado**, mostre que o job ficará na fila até ligar o worker (coerente com a UI honesta do worker — não finja que gerou).

## Aceite (com screenshots Playwright)
- [ ] Tabela `social_posts` + job `gerar_post_social` + RLS (migração idempotente).
- [ ] Worker gera variações na voz do autor, respeitando a spec de cada rede e o contexto da obra quando informada.
- [ ] UI: botão "Gerar post" por rede, diálogo de objetivo/tema/obra, lista de rascunhos com copiar/editar/aprovar/arquivar/exportar.
- [ ] Sem postagem real; se worker offline, job aguarda na fila com aviso claro.
- [ ] `npm run build` limpo, testes ok, commit + push, bundle novo servindo; screenshot do diálogo e de um rascunho gerado (pode ser com worker rodando, ou ao menos o estado "na fila").

## Limites
- **Não** implemente publicação/integração real em redes (sem OAuth). Só gerar/editar/copiar/exportar.
- Use o worker + fila (não chame a IA direto do front).
- Modelo leve para esta tarefa; respeite `worker_control` e a política de modelos.
- Não exponha segredos; sem libs novas pesadas.
