# Auditoria da interface web × Engine V2
**2026-07-27** · Escopo: todas as páginas, todos os campos, todo o caminho do dado

## Veredito em uma frase

A interface coleta um livro e a engine escreve outro: dos ~25 dados que o autor fornece, a Engine V2 lê **três**, e o livro que ela produz não aparece em nenhuma das telas seguintes.

---

## Quebra 1 — ENTRADA: a entrevista inteira é descartada

O wizard conduz a entrevista do `arquiteto-de-enredo` e grava em `briefing` cerca de vinte campos validados (`worker/src/entrevista.ts:177-233,325`): `protagonista{nome,ferida,segredo,desejo}`, `antagonista`, `personagens`, `tom`, `pdv`, `tempo_verbal`, `linha_tempo`, `final`, `canone`, `proibido`, `genero`, `serie`, `paginas_alvo`, `meta_palavras`, `meta_nota`, **`idioma`**.

A fundação V2 lê **`briefing.ideia_central` e nada mais** (`worker/src/v2/integracao.ts:675-679`), e repassa `{titulo, premissa, totalCapitulos}` (`:697-701`) para `tarefaArquitetoEnredo` (`worker/src/v2/tarefas.ts:154-163`), que devolve quatro campos: `perfil_voz` (≤300 palavras), `estrutura` (≤25 palavras por capítulo), `fios`, `promessa_editorial`.

Confirmado por busca no worker inteiro: **nenhuma leitura** de `briefing.tom`, `.pdv`, `.protagonista`, `.antagonista`, `.personagens`, `.canone`, `.proibido`, `.idioma`, `.linha_tempo`, `.final`. `briefing.qa` só é lido no caminho V1 (`jobs.ts:404`).

**Consequência:** o modelo inventa personagens, tom, ponto de vista e ambientação a partir de uma frase. Foi assim que "Alcobaça" na ideia central virou um livro inteiro em português de Portugal — não havia camada nenhuma dizendo o contrário.

## Quebra 2 — CONTROLE: depois de criado, nada do autor alcança a engine

- O compilador de contexto tem 7 camadas de precedência (`v2/compilador.ts:11-19`). A camada 1 (`seguranca`) e a camada 7 (`preferencia`) **nunca são alimentadas**: `preferencias:` não aparece uma única vez no worker, e nenhum dos 8 call sites de `compilarPacote` as passa.
- A camada 3 (`decisao_autor`) funciona, mas só é escrita **uma vez**, no INSERT do wizard (`NovoProjeto.tsx:808`). `Projeto.tsx` nunca grava `decisoes_autor`.
- `TIPOS_V2 = {escrever_livro, criar_fundacao, laboratorio_v2}` (`v2/integracao.ts:45`). Portanto **"Pedir melhorias", "Refinar fundação" e "Avaliar" nunca chegam à V2** — são jobs V1.
- O `ajuste_autor` do canário de voz promete na tela "fica registrado como decisão autoral" (`NovoProjeto.tsx:1173`), mas `registrarDecisaoCanario` (`:732-753`) não escreve em `decisoes_autor`.
- `meta_nota` da coluna nunca chega ao motor: a UI enfileira `escrever_livro` com payload vazio (`Projeto.tsx:798`) e a engine lê `job.payload.meta_nota ?? 9` (`integracao.ts:623`). A meta é sempre 9.
- `sem_revisao_por_capitulo` é enviado pela UI e não tem leitor em `v2/`.

## Quebra 3 — SAÍDA: a V2 escreve livros que a plataforma não enxerga

**A Engine V2 nunca escreve na tabela `chapters`** — zero ocorrências em `worker/src/v2/`. Prova no banco de produção:

| livro | engine | linhas em `chapters` |
|---|---|---|
| O Índice dos Abduzidos | V1 | 59 |
| Canário — O Cofre de Alcobaça | V2 | **0** |
| Canário — Tudo o que não te contei | V2 | **0** |
| Canário — A Corte do Sal | V2 | **0** |

`chapters` é o que alimenta o Leitor, o Catálogo, a avaliação best-seller, a tradução, a capa, o EPUB, o pacote KDP e as vendas. Logo, um livro escrito pela V2 **não pode ser lido, traduzido, capeado, publicado nem vendido pela plataforma**. O ciclo termina no `engine_state`.

## Quebra 4 — campos que existem e ninguém lê

`idioma_origem` (7 idiomas na UI, engine escreve sempre pt-BR), `piso_palavras`, `paginas_alvo`, `meta_nota`, `genero` — todos editáveis em `Projeto.tsx:1280-1347`, nenhum lido pela engine. As colunas reais `prioridade` e `producao_pausada` (`producao.sql:12-14`) são ignoradas: a UI usa chaves homônimas dentro do `briefing`.

`briefing.idea` é duplicata literal de `ideia_central` e não tem consumidor.

## Correções ao que eu disse antes

Três achados de subagente caíram na verificação contra o repositório real: `engine_reviews` **tem** escritor (`v2/persistencia.ts:122`); `v2/lab/job.ts` **existe**; e o job `laboratorio_v2` já rodou com sucesso (1 job `done`, 21/jul). Eram artefato de um snapshot incompleto que eu montei.

## Ordem de correção

1. **Entrada** — o briefing inteiro (incluindo idioma) chega à fundação, que passa a produzir bíblia e mapa de personagens, não quatro campos.
2. **Saída** — a V2 grava em `chapters`, reabrindo leitor, tradução, capa, EPUB e venda.
3. **Controle** — camadas 3 e 7 vivas depois da criação; `revisar` e `refinar_fundacao` roteados para V2.
4. **Coerência** — campos mortos ou ligados ou removidos; nada de coluna que o autor edita e ninguém lê.
