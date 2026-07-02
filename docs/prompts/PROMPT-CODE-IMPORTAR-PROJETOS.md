# Prompt para o Claude Code — importar minhas obras para a plataforma Atelier (faça tudo sozinho)

Você roda na minha máquina (Windows), com acesso ao repositório `ATELIER-LIVROS`, às pastas de livros e à internet (você alcança o Supabase). **Objetivo:** importar 9 obras (12 volumes) das pastas locais para a plataforma Atelier (Supabase + Storage) e confirmar que aparecem no Catálogo. Eu só vou colar este prompt — **você faz todo o resto de forma autônoma**: pode escrever e executar o código temporário que precisar (Node tem `@supabase/supabase-js` e `dotenv` em `worker/node_modules`), verificar, corrigir e validar. Não dependa de nenhum script pré-existente; se houver um `worker/scripts/importar-projetos.mjs`, fique à vontade para reescrevê-lo ou ignorá-lo. Não me peça para rodar nada.

## Credenciais e ambiente
- Use `worker/.env`: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `OWNER_USER_ID`. Conecte com a **service_role** (ignora RLS). Nunca imprima esses valores.
- Confirme o schema em `supabase/schema.sql` e `supabase/storage.sql`.

## Modelo de dados
- `projects` → `editions` (idioma) → `chapters` + `artifacts` (`tipo` = capa|epub|manuscrito).
- Storage buckets: `manuscritos`, `epubs`, `capas`, `pacotes`. Caminho dos arquivos: `"<OWNER_USER_ID>/<project_id>/..."` (a 1ª pasta é o uid do dono).
- Sugestão de caminhos: fundação → `manuscritos/<owner>/<pid>/fundacao/<arquivo>`; capítulos → `manuscritos/<owner>/<pid>/manuscrito/NN-<arquivo>`; capa → `capas/<owner>/<pid>/capa.<ext>`; epub → `epubs/<owner>/<pid>/<arquivo>`.

## Regras / decisões já fechadas (não reabra)
- **Cada volume é um `project` separado** com o mesmo campo `serie` (é assim que a plataforma agrupa saga). Avulso: `serie = null`.
- `idioma_origem = 'pt-BR'`; crie 1 `edition` pt-BR com `is_origem = true`.
- `status` do projeto: tem EPUB → `pronto`; senão, tem capítulos → `revisao`. Edition: `pronto` se epub, senão `revisao`.
- `total_capitulos` = nº de capítulos importados. `chapters.numero` = ordem natural; `titulo` derivado do nome do arquivo; `palavras` = contagem de palavras do .md.
- Capa: quando a pasta tiver várias imagens, escolha **uma** (primeira em ordem natural; em "Lisboa" prefira a variante cujo nome contém `BT`). Não precisa escolher a "melhor".
- Capítulos = só os `.md` dentro da pasta de capítulos, **excluindo** arquivos de fundação/consolidados/relatórios (nomes contendo: `biblia`, `estrutura`, `mapa-de-personagens`, `perfil-de-voz`, `completo`, `consolidad`, `relatorio`, `avaliacao`, `briefing`, `runbook`, `changelog`, `style-sheet`, `agents`, `claude`, `readme`, `metadados`, `pacote`). Ordene naturalmente (numérico).
- Fundação = os que existirem entre `Biblia-da-Obra.md`, `Estrutura-do-Livro.md`, `Mapa-de-Personagens.md`, `perfil-de-voz.md`.
- **Idempotência:** antes de criar, cheque se já existe `project` do mesmo (owner, titulo, serie, volume); se existir, pule (a menos que precise refazer — aí apague em cascata e recrie).

## As 9 obras (mapa já levantado — pastas e particularidades)
Raízes: `C:\Users\Rodrigo Paiva\Desktop\PESSOAL\Saga` e `C:\Users\Rodrigo Paiva\Desktop\PESSOAL\LIVROS\<Autor>\<Projeto>`. Os números entre parênteses são a contagem esperada de capítulos (aproximada — sirva de conferência).

1. **A Linhagem das Cinzas** — série, autor *Mia Peducci*, gênero suspense histórico. Base = raiz da pasta `Saga`. **Fundação compartilhada na raiz da Saga.** Volumes:
   - v1 "O Pecado das Cinzas" — caps em `manuscrito/Livro-01-O-Pecado-das-Cinzas/*.md` (50); capa `Capas/Livro I.png`.
   - v2 "A Primeira Renovação" — `manuscrito/Livro-02-A-Primeira-Renovacao/*.md` (50); capa `Capas/Livro II.png`.
   - v3 "O Século da Dúvida" — `manuscrito/Livro-03-O-Seculo-da-Duvida/*.md` (50); capa `Capas/Livro III.png`.
2. **O Colecionador de Silêncios** — avulso, *Aria Nolan*. Base `LIVROS\Aria Nolan\- O Colecionador de Silêncios`. Caps `manuscrito/*.md` (50, formato `NN-Capitulo-NN-slug.md`); fundação na raiz; capa `Capa.png`; epub `O Colecionador de Silencios.epub`.
3. **Vésper** — série (vol 1), *Iago Provardi*. Base `LIVROS\Iago Provardi\VESPER`. **Capítulos ficam na RAIZ** (`00-Prologo.md`, `NN-Capitulo-NN-slug.md`, ~27) — também há cópia em `Consolidado/` (pode usar essa). Fundação na raiz (pode faltar 1 dos 4). Capa `Capa livro 1.png`. Ignore `_Automacao-Livro-II` e `material-antigo`.
4. **A Memória dos Outros** — avulso, *Mia Peducci*. Base `LIVROS\Mia Peducci\- A Memória dos Outros`. Caps `manuscrito/*.md` (62; inclui `00-Epigrafe` e fragmentos); fundação na raiz; capa: pasta `Capas/` (várias — pegue uma); epub `A-Memoria-dos-Outros.epub` na raiz (ignore os de `revisao-v2/` e `Peducci, Mia/`).
5. **O que a Maré Esconde** — avulso, *Mia Peducci*. Base `LIVROS\Mia Peducci\- O que a Maré Esconde`. Caps `manuscrito/Capitulo-NN.md` (50); fundação na raiz; capa pasta `Capa O que a Maré Esconde/`; epub `O-Que-a-Mare-Esconde.epub`.
6. **A Última Carta de Vênus** — avulso, *Mia Peducci*. Base `LIVROS\Mia Peducci\A Última Carta de Vênus`. Caps `manuscrito/Capitulo-NN.md` (45) — **exclua** `A-Ultima-Carta-de-Venus-completo.md`; fundação na raiz; **sem capa** (vai cair no fallback colorido); sem epub.
7. **Enquanto Você Dormia em Lisboa** — avulso, *Mia Peducci*. Base `LIVROS\Mia Peducci\Enquanto Você Dormia em Lisboa`. Caps `manuscrito/NN-Capitulo-NN-slug.md` (44); fundação na raiz; capa pasta `Capas/` (variantes `BT/ES/GE/IT` — prefira `BT`); sem epub.
8. **Última Chamada para o Embarque** — série (2 vols), *Mia Peducci*. Base `LIVROS\Mia Peducci\Última Chamada para o Embarque`:
   - v1 "Última Chamada para o Embarque" — caps `manuscrito/cap-NN.md` (46); fundação na raiz; capa `Capas/1 BR.png`.
   - v2 "Última Chamada para o Embarque — Vol. 2" — caps `Livro-II/manuscrito/*.md` (38); fundação em `Livro-II/`; capa `Capas/2 BR.png`.
9. **A Casa que Conta** — avulso, *Mia Peducci*. Base `LIVROS\Mia Peducci\A Casa que Conta`. Caps `manuscrito/Capitulo-NN-Noite-XX.md` (32); fundação na raiz; capa pasta `Capas/`; sem epub.

## Faça (loop agêntico, sem me pedir nada)
1. **Buckets:** verifique se `manuscritos`, `epubs`, `capas`, `pacotes` existem; **crie como privados** os que faltarem.
2. **Importe** os 12 volumes conforme o mapa acima (escreva o código que quiser; rode você mesmo). Trate erros por volume e siga em frente; corrija mapeamento de caminho se algum acento/encoding do Windows falhar.
3. **Verifique no banco:** 12 `projects` novos; cada um com 1 `edition` pt-BR `is_origem=true`; `chapters` nas contagens esperadas (acima); `artifacts` de capa/epub onde existirem.
4. **Spot-check de Storage:** para 2–3 projetos, gere signed URL da capa e de 1 capítulo e confirme HTTP 200.
5. **Confirme no app:** abra o Atelier no navegador (Playwright; login senha `<SENHA_DO_APP>`), vá ao **Catálogo** e tire screenshot mostrando a trilogia "A Linhagem das Cinzas" e "Última Chamada para o Embarque" agrupadas por série (Vol. 1/2/3), os avulsos, capas reais onde há arquivo e fallback colorido onde não há (ex.: A Última Carta de Vênus).

## Limites
- **Não** faça commit/push nem deploy — isto é carga de dados, não mudança de app.
- **Não** exponha segredos do `.env` em logs.
- Se algo exigir decisão minha (título ambíguo, volume faltando), importe o resto e **liste a pendência no final** com uma pergunta objetiva.

## Entrega
Relatório curto: tabela por projeto (título · série/vol · capítulos · capa S/N · epub S/N · status), resultado da verificação no banco e do spot-check de Storage, e o screenshot do Catálogo agrupado. Liste pendências, se houver.
