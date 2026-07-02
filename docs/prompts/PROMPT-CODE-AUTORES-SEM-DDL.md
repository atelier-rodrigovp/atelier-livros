# Prompt para o Claude Code — Autores SEM criar tabela (zero DDL, zero token)

Você roda na minha máquina, repositório `ATELIER-LIVROS` (React+Vite+TS, shadcn/ui, Tailwind, Supabase; deploy GitHub Pages). **Restrição dura: NÃO há como rodar DDL** (não existe token do Supabase, senha do banco nem acesso ao SQL Editor, e a service_role não cria tabela). Portanto **reescreva a feature de Autores para NÃO depender de nenhuma tabela nova nem de coluna nova** — use apenas dados que o front já pode ler e gravar sob a RLS existente. O usuário não vai tocar em nada. Ao final: `npm run build` limpo, testes ok, `git commit` + `git push`, e valide no navegador com Playwright (senha `<SENHA_DO_APP>`) com screenshots.

## Princípio (onde guardar os autores sem DDL)
Não use a tabela `authors` nem a coluna `projects.author_id` (não existem e não podem ser criadas). Em vez disso:

1. **Registro de autores = um "projeto-sistema" oculto.** Crie/atualize **uma única linha** em `projects` que serve de container do registro, identificada por um marcador no `briefing` (ex.: `briefing._registry === "autores"`) e `titulo = "⟦Autores⟧"`, `status = "rascunho"`. Guarde o array de autores em `briefing.autores` (cada autor: `{ id (slug), nome, estilo, genero, bio, personalidade, referencias, social:{instagram,x,tiktok,threads,youtube,site} }`). O front lê e grava essa linha sob a RLS de `projects` (owner) que já funciona — **sem DDL**.
2. **Vínculo obra→autor = `projects.briefing.autor`** (string com o nome do autor). Reatribuir uma obra = atualizar o `briefing.autor` daquele projeto (merge no jsonb; o front já pode `update` em `projects`).
3. **Excluir o projeto-sistema de TODAS as listagens/contagens de livros** (Catálogo, Dashboard, qualquer lista). Regra: ignore projetos com `briefing._registry === "autores"` (ou `titulo === "⟦Autores⟧"`). No Catálogo isso já tende a sumir (não tem `edition`), mas garanta a exclusão explícita no Dashboard e onde houver contagem.
4. **Avatar:** nesta fase use avatar tipográfico (iniciais/letra com cor determinística, igual ao `CoverArt`) — **não** faça upload pra Storage (exigiria policy/DDL). Deixe o upload real para uma fase futura.

Crie um módulo `src/lib/authors.ts` com: `carregarRegistro()`, `salvarRegistro(autores)`, `autorDeProjeto(briefing)`, `atribuirAutor(projectId, nomeAutor)`. Toda a UI usa esse módulo (nada de `from("authors")`).

## Seed inicial (faça via o próprio app/módulo, sem script externo obrigatório)
Ao abrir a página de Autores pela primeira vez (ou num efeito idempotente), se o registro não existir, crie-o com estes 4 autores e garanta o vínculo das obras:

- **Mia Peducci** — estilo "Thriller-romance doméstico"; gênero "Suspense psicológico / romance"; referências "Colleen Hoover, Freida McFadden, Ken Follett (saga)"; bio "Thrillers-romance domésticos que doem e viram a página: coração de Colleen Hoover dentro da máquina de Freida McFadden. Narradoras não-confiáveis, segredos de família, trauma levado a sério e um twist que sempre foi justo."; personalidade "Intensa, empática, atenta ao não-dito; intimidade e franqueza emocional; finais que não dão paz."
- **Aria Nolan** — estilo "Suspense psicológico seco-sensorial"; gênero "Thriller psicológico"; referências "Freida McFadden, Harlan Coben; Perfume, The Conversation"; bio "Suspense psicológico de frase seca e nervo exposto. Narradores não-confiáveis que medem o mundo por um sentido levado ao limite — o perigo chega primeiro como ruído."; personalidade "Contida, precisa, inquietante; humor seco; atenção clínica ao sensorial."
- **Iago Provardi** — estilo "Techno-thriller de conspiração"; gênero "Mistério científico"; referências "Dan Brown, Michael Crichton, Blake Crouch"; bio "Techno-thrillers de página-vira sobre conspirações, ciência e segredos enterrados — Dan Brown com lastro factual. Frio, clínico, ritmo de bisturi."; personalidade "Cerebral, cético, fascinado por mistérios institucionais."
- **Lena Agarti** — estilo "A definir"; bio "Pseudônimo em formação — estilo e catálogo a definir."; personalidade "A definir."

`social`: 6 campos vazios (badge "a criar" na UI).

**Vínculo obra→autor** (set `briefing.autor` de cada projeto existente, casando por `titulo`/`serie`):
- **Iago Provardi:** série "Vésper".
- **Aria Nolan:** "O Colecionador de Silêncios"; "A Casa que Conta".
- **Mia Peducci:** série "A Linhagem das Cinzas"; "A Memória dos Outros"; "O que a Maré Esconde"; "A Última Carta de Vênus"; "Enquanto Você Dormia em Lisboa"; série "Última Chamada para o Embarque".
- (Projeto inexistente → ignore sem erro.)

## UI (reaproveite o que já foi construído; só troque a fonte de dados)
- **Menu "Autores"** → `/autores` (lista: avatar tipográfico, nome, estilo, nº de obras) e `/autores/:id` (editar bio, personalidade, referências, estilo/gênero; redes sociais com "a criar"/link; **obras do autor** com ação "mover para outro autor" que chama `atribuirAutor`). Botão "Gerar post (em breve)" desabilitado.
- **Projeto:** seletor de autor que grava `briefing.autor`; mostra o autor no cabeçalho com link para `/autores/:id`.
- **Catálogo:** filtro por autor e nome do autor no pôster — resolvendo o autor por `briefing.autor` (não por tabela). Mantenha a grade densa e o agrupamento por série.
- Remova qualquer chamada a `supabase.from("authors")` / `author_id` que tenha sido escrita antes; tudo passa pelo módulo `authors.ts`. Apague `supabase/authors.sql` e o seed que dependia de tabela, se existirem (ou marque como obsoletos).

## Aceite (screenshots Playwright)
- [ ] Nenhuma dependência de tabela `authors` ou coluna `author_id`; nada de DDL. App funciona sem o usuário tocar no Supabase.
- [ ] Registro de autores persistido na linha-sistema; 4 autores semeados; 12 obras vinculadas pelo mapa.
- [ ] `/autores` lista e detalhe editável funcionando (salvar persiste e sobrevive a reload); mover obra entre autores funciona.
- [ ] Projeto-sistema NÃO aparece como livro em Catálogo nem é contado no Dashboard.
- [ ] Catálogo com filtro por autor; pôster mostra o autor.
- [ ] `npm run build` limpo, testes ok, commit + push, bundle novo servindo; screenshots de `/autores`, um detalhe e o Catálogo filtrado por autor.

## Limites
- Zero DDL, zero token, zero acesso ao SQL Editor. Se algo "exigiria" tabela, resolva com o registro em `briefing`.
- Não apague projetos/obras reais. Não exponha segredos. Sem libs novas pesadas.
- Avatar real/upload e postagem em redes ficam para fase futura.
