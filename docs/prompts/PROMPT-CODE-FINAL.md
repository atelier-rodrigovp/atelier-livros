# Prompt para o Claude Code — Catálogo (grade) + Dashboard + Worker

Cole no Claude Code na raiz do `ATELIER-LIVROS`. Trabalho de **acabamento visual** (não rascunho), referência de qualidade: biblioteca tipo Plex/Letterboxd e painel de produção limpo. Ao final: `npm run build` limpo, testes passando, `git commit` + `git push` (deploy Pages), e **valide no navegador com Playwright** (senha `AtelierLivros2026`) com screenshot das 3 telas antes de declarar pronto. Reutilize o componente já extraído `src/components/CoverArt.tsx` em todas as telas.

---

## 1) Catálogo (`src/pages/Catalogo.tsx`) — grade densa de biblioteca, não vitrine

O atual usa hero gigante + carrosséis (padrão de vitrine com curadoria). Para uma biblioteca de produção que terá 30/100/500 livros, isso é errado: o hero queima uma tela e o carrossel esconde a maioria dos itens. Refazer como **biblioteca**.

**Remover:** hero/banner e carrosséis (sem `Carrossel`, sem setas, sem hero).

**Topo (uma linha, com respiro):**
- "Catálogo" à esquerda + subtítulo com contagem real (`N livros · M idiomas`).
- À direita, mesma linha: **busca** compacta (~190px, ícone lupa) + **ordenação** (select: Recentes / Título A–Z / Status).
- Linha de **chips** abaixo: idiomas + separador + status (toggláveis). Ao lado, **toggle "Agrupar por série"** — default **desligado**, preferência persistida em `localStorage`.

**Conteúdo:**
- **Grade densa responsiva**: `grid` `repeat(auto-fill, minmax(132px, 1fr))`, gap ~16px; 5–7 colunas em telas largas. Pôster em `aspect-[2/3]`, `border-radius-lg`, via `CoverArt`. Selo `Vol. N` quando série, badge de status no topo, título abaixo + idioma, hover `scale-105` + sombra. **Cada item uma única vez.**
- **Toggle ligado → agrupar por série:** seções com cabeçalho da série (serif) + grade só daquele série (ordenado por `volume`), e seção final "Livros avulsos". Mesmo pôster, mesma densidade. Desligado → grade única com tudo.
- Busca/filtro/ordenação funcionam nos dois modos; sem `display:none` (re-render real). Estado vazio: "Nada encontrado.".
- **Capas reais substituem o fallback colorido automaticamente** (CoverArt já faz `if capa → <img>`); `loading="lazy"`, cache de URL assinada, `alt`.

Referência: o mock aprovado nesta conversa (grade densa, busca+ordenação no topo-direito, chips, toggle agrupar, sem hero).

## 2) Dashboard (`src/pages/Dashboard.tsx`) — confirmar/ajustar

(Se já implementado na rodada anterior, validar e corrigir o que faltar.)
- Subtítulo **coerente com o que aparece** (ex.: `1 série · 3 volumes · 0 avulsos`); nunca "3 projetos" mostrando 1 card.
- Faixa de **KPIs**: Livros / Em produção / Prontos / Publicados (número grande + ícone).
- "Seus projetos": grid que **preenche a largura**; card de saga com fileira de mini-capas (`CoverArt` variant mini) clicáveis por volume, selo `Vol. N` + status, barra de progresso (volumes prontos / total) e status agregado via `displayProjectStatus`. Card de livro avulso com mini-capa + título/status/progresso. Excluir no menu "⋯".

## 3) Configurações (`src/pages/Configuracoes.tsx`) — botão Ligar

- Botão primário reflete o estado e oferece a ação oposta, sempre visível: worker Parado/`enabled=false` → **"Ligar produção"** (preenchido, ícone Power); ativo/`enabled=true` → **"Desligar produção"** (outline). Nunca esconder o "Ligar" quando está off.
- Estados (heartbeat): **Produzindo** (verde pulsante) · **Pausado** (âmbar) · **Parado** (cinza). Manter "Rodar teste (ping)", seção Atividade e a nota sem terminal: *"O worker não está em execução nesta máquina. Inicie o worker uma vez para que o app passe a controlá-lo."*

## Aceite (com screenshot Playwright de cada tela)
- [ ] Catálogo: sem hero/carrossel; grade densa (5–7 col); item nunca duplicado; busca+ordenação topo-direito; chips; toggle "Agrupar por série" (default off, persistido); capa real cobre o fallback.
- [ ] Dashboard: contagem coerente; KPIs; cards com mini-capas; sem vazio gritante.
- [ ] Config: "Ligar produção" visível quando off/Parado; alterna para "Desligar" quando ativo.
- [ ] `CoverArt` reutilizado; build limpo; testes ok; commit + push; bundle novo servindo.

**Não faça:** hero/banner; carrossel; migração de dados (saga = N projetos, agrupamento só na UI); libs novas pesadas (shadcn/ui + Tailwind apenas); não reintroduza instrução de terminal na UI.
