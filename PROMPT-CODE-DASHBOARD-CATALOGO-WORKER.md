# Prompt para o Claude Code — Dashboard + Catálogo (Netflix-grade) + botão Ligar Worker

Cole no Claude Code na raiz do `ATELIER-LIVROS`. Stack: React + Vite + TS, shadcn/ui, Tailwind, Supabase. Ao final: `npm run build` limpo, testes passando, `git commit` + `git push` (deploy GitHub Pages) e **valide no navegador com Playwright** (login: senha `AtelierLivros2026`) tirando screenshot das 3 telas antes de declarar pronto.

Este é um trabalho de **acabamento visual**, não de rascunho. Refêrencias de qualidade: storefront da Netflix/Amazon Prime. Capriche em espaçamento, hierarquia, densidade e estados de hover. Nada de telas com 80% de espaço vazio.

**Antes:** extraia o componente de capa gerada (hoje dentro de `Catalogo.tsx`: `CoverArt` + `PALETAS` + `hashStr`) para `src/components/CoverArt.tsx` e reutilize em Dashboard e Catálogo. DRY.

---

## 1) Dashboard (`src/pages/Dashboard.tsx`) — está catastrófico, refazer

Problemas: diz "3 projetos" mas mostra 1 card (a saga agrupa 3 volumes → a contagem mente); o resto é vazio; cards sem nada visual.

Refaça assim, de cima pra baixo:

1. **Header:** título "Dashboard" à esquerda; botão "Novo projeto" à direita (manter). Subtítulo **honesto e coerente com o que aparece**: ex. `1 série · 3 volumes · 0 livros avulsos` (calcule de verdade; nunca "3 projetos" se mostro 1 card).
2. **Faixa de KPIs:** 4 cards pequenos lado a lado (grid, responsivo 2×2 no mobile): **Livros** (total de projetos), **Em produção** (status escrevendo/revisão), **Prontos**, **Publicados**. Número grande + rótulo + ícone discreto. Isso preenche o topo com informação real.
3. **"Seus projetos":** grid que **preenche a largura** (`grid gap-5 sm:grid-cols-2 xl:grid-cols-3`), cards ricos e visuais:
   - **Card de saga:** nome da série + `Saga · N volumes` no topo; **uma fileira com as N mini-capas** (componente `CoverArt`, ~64×96px cada), cada mini-capa clicável vai para `/projeto/:id` do volume, com selo `Vol. N` e bolinha de status; barra de progresso da saga (volumes prontos / total) + 1 linha de status agregado (ex.: "Vol. 1 em escrita pausada"). Clicar no corpo do card abre o volume 1.
   - **Card de livro avulso:** mini-capa à esquerda + à direita título, gênero, badge de status (usar `displayProjectStatus` — coerente com worker), e progresso de capítulos quando houver.
   - Hover: leve elevação (`hover:shadow-md`), cursor pointer. Excluir vai pra um menu "⋯" (não exposto).
4. Estado vazio só quando realmente 0 projetos.

O resultado tem que parecer um painel de produção, não uma lista.

## 2) Catálogo (`src/pages/Catalogo.tsx`) — Netflix/Amazon de verdade

O atual é um rascunho: busca empilhada no topo empurra as capas pra baixo e as prateleiras são grids estáticos. Refaça:

1. **Busca e filtros no topo-direito**, na MESMA linha do título "Catálogo" (como o "Novo projeto" no Dashboard): um input de busca compacto (ícone de lupa, ~240px) + os chips de idioma/status à direita. No mobile, colapsam abaixo. **Isso dá respiro vertical para as capas.** Remova o bloco de busca/chips de cima do conteúdo.
2. **Prateleiras horizontais (carrosséis), estilo Netflix**, uma por série + uma "Livros avulsos":
   - Título da fileira (serif) à esquerda; capas em **scroll horizontal com snap** (`overflow-x-auto snap-x`), pôsteres maiores (largura ~170–190px, `aspect-[2/3]`), `shrink-0`.
   - **Setas ◀ ▶** que aparecem no hover da fileira (desktop) e rolam ~1 página; ocultas no mobile (swipe nativo).
   - Pôster: cantos arredondados, sombra, `group-hover:scale-105` suave; overlay gradiente inferior com título + `Vol. N`; badge de status no topo; `loading="lazy"`.
   - Hover do pôster: leve realce + (opcional) botão "Abrir".
3. **Hero opcional no topo** (bom toque Netflix): se houver um livro em produção, um banner largo (~`h-64`) usando a capa/cor do livro como fundo com gradiente, título grande, status e botão "Continuar" → projeto. Se não houver, omitir.
4. **Ao buscar/filtrar:** trocar carrosséis por um **grid limpo** de pôsteres (4–6 colunas), já que filtro não combina com prateleira. Sem duplicar itens.
5. Mais respiro geral: `space-y-10` entre fileiras, títulos com peso, menos densidade que hoje.

## 3) Configurações (`src/pages/Configuracoes.tsx`) — o botão "Ligar" sumiu

Bug: o botão mostra a ação conforme `enabled`, mas `enabled` é `true` por padrão mesmo com o worker **Parado**, então só aparece "Desligar produção" e nunca "Ligar".

- O **botão primário deve refletir o estado atual** e oferecer a ação oposta, sempre visível:
  - `enabled === false` (ou worker Parado) → **"Ligar produção"** — botão preenchido/primary, ícone Power.
  - `enabled === true` e worker ativo → **"Desligar produção"** — botão outline.
- Quando **Parado**, mostre "Ligar produção" como ação principal (intenção de ligar). Mantenha a nota: *"O worker não está em execução nesta máquina. Inicie o worker uma vez para que o app passe a controlá-lo."* — sem terminal/.bat.
- Estados (heartbeat): **Produzindo** (verde, pulsante) · **Pausado** (âmbar) · **Parado** (cinza). Mantenha "Rodar teste (ping)" e a seção Atividade.
- Garanta o ciclo visível quando o worker estiver no ar: Ligar→Produzindo, Desligar→Pausado.

## Aceite (com screenshot Playwright de cada tela)
- [ ] Dashboard: KPIs + cards visuais com mini-capas; contagem coerente com o que aparece; sem vazio gritante.
- [ ] Catálogo: busca/chips no topo-direito; carrosséis horizontais com setas; pôsteres maiores; grid ao filtrar; (hero opcional).
- [ ] Config: botão "Ligar produção" visível quando off/Parado; alterna para "Desligar" quando on.
- [ ] `CoverArt` extraído e reusado; build limpo; testes ok; commit + push; bundle novo confirmado servindo.

**Não faça:** migração de dados (saga = N projetos, agrupamento só na UI); libs novas pesadas (use shadcn/ui + Tailwind); não reintroduza instrução de terminal na UI.
