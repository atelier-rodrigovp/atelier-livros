# Prompt para o Claude Code — Catálogo: grade densa de biblioteca (não vitrine)

Cole no Claude Code na raiz do `ATELIER-LIVROS`. Ao final: `npm run build` limpo, testes passando, `git commit` + `git push` (deploy Pages), e **valide no navegador com Playwright** (senha `AtelierLivros2026`) com screenshot antes de declarar pronto.

## Diagnóstico (por que refazer)
O catálogo atual usa **hero gigante + carrosséis por série**. Isso é padrão de *vitrine com curadoria* (Netflix home). Para uma **biblioteca de produção pessoal** que vai ter 30, 100, 500 livros, isso é errado: o hero queima uma tela inteira sem função e o carrossel esconde a maioria dos itens, forçando scroll lateral item a item. O padrão correto é **biblioteca**: uma grade densa de capas, com busca, ordenação e filtros. (Pense Plex/Letterboxd/“Sua biblioteca” da Amazon, não a home da Netflix.)

## Reescrever `src/pages/Catalogo.tsx`

**Remover:** o hero/banner e os carrosséis horizontais. Sem `Carrossel`, sem setas, sem hero.

### Topo (uma linha, com respiro)
- Título "Catálogo" à esquerda; subtítulo com contagem real (`N livros · M idiomas`).
- À direita, na mesma linha: **busca** (input compacto ~190px com ícone de lupa) + **ordenação** (select: Recentes / Título A–Z / Status).
- Linha de **chips** abaixo: idiomas + separador + status (toggláveis, multi-desmarcável), como já existe o `chipCls`.
- **Toggle "Agrupar por série"** (um botão/switch) ao lado dos chips. Default: **desligado** (grade única).

### Conteúdo
- **Grade densa responsiva** de pôsteres: `grid` com `repeat(auto-fill, minmax(132px, 1fr))`, `gap` ~16px. Capas em `aspect-[2/3]`, `border-radius-lg`, usando `CoverArt` (já extraído). Selo `Vol. N` quando série; badge de status no topo; título abaixo da capa (1–2 linhas) + idioma; hover `scale-105` suave + sombra. **Cada item aparece uma única vez.**
- **Toggle ligado → "Agrupar por série":** render por seções — cabeçalho da série (serif) + a grade só com os volumes daquela série (ordenados por `volume`), e uma seção final "Livros avulsos". Mesmo componente de pôster e mesma densidade; só insere cabeçalhos. Toggle desligado → uma grade única com tudo (séries e avulsos juntos), respeitando busca/filtros/ordenação.
- Buscar/filtrar funciona nos dois modos. Estado vazio: "Nada encontrado." centralizado.
- Persistir a preferência do toggle em `localStorage`.

### Densidade e acabamento
- O objetivo é **ver muitas capas de uma vez** com respiro — não cards enormes. Em telas largas, 5–7 colunas.
- `loading="lazy"` nas imagens, cache de URL assinada (já existe `capaCache`), `alt` descritivo.
- Sem `display:none` para alternar modos (re-render real via estado, não esconder DOM).

Referência de layout/comportamento: o mock aprovado nesta conversa (grade densa, busca+ordenação no topo-direito, chips, toggle de agrupar, sem hero).

## Aceite (com screenshot Playwright)
- [ ] Sem hero e sem carrossel.
- [ ] Grade densa responsiva (5–7 colunas em telas largas); item nunca duplicado.
- [ ] Busca + ordenação no topo-direito; chips de idioma/status; toggle "Agrupar por série" (default off, persistido).
- [ ] Modo agrupado mostra seções por série + "Avulsos", mantendo a mesma grade.
- [ ] `CoverArt` reutilizado; build limpo; testes ok; commit + push; bundle novo servindo.

**Não faça:** banner/hero; carrossel; migração de dados (saga = N projetos, agrupamento só na UI); libs novas pesadas (shadcn/ui + Tailwind apenas).
