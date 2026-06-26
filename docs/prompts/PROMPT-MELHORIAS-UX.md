# Prompt de melhorias — Atelier (UX/UI)

Cole este prompt no agente de código (Claude Code) rodando na raiz do repositório `ATELIER-LIVROS`.

---

## Contexto da stack (não reescreva a arquitetura)

- **Front:** React + Vite + TypeScript, shadcn/ui, Tailwind. Páginas em `src/pages/*`, status puro em `src/lib/status.ts`, tipos em `src/lib/types.ts`, hooks em `src/hooks/*`.
- **Back:** Supabase (Postgres + Realtime + Storage). Tabelas principais: `projects`, `editions`, `artifacts`, `jobs`, `worker_heartbeats`, `worker_control`.
- **Worker:** processo TS local (`worker/src/*`) que consome a fila `jobs`, roda a IA (Opus/skills), escreve `worker_heartbeats` (online/offline) e respeita `worker_control.enabled` (pausar/retomar fila).
- **Modelo da saga (importante):** cada volume de uma série é **um `project` separado**, todos com o mesmo campo `serie`. `briefing.serie_total` guarda quantos volumes a saga tem. O job `criar_volumes` cria os projetos 2..N encadeados, herdando a fundação do vol. 1.

**Regra geral:** todas as mudanças abaixo são de **UX/apresentação**. NÃO faça migração destrutiva de dados nem funda linhas de `projects`. Agrupamento de saga é só na camada de UI. Mantenha `src/lib/status.ts` testável (já tem testes) e atualize/adicione testes quando mudar lógica de status.

Ao final, rode `npm run build` (e os testes) e gere o `dist` — o app em produção parece estar exibindo um build antigo (ex.: botão "Reescrever livro" que já não existe no `src`).

---

## 1) Dashboard (`src/pages/Dashboard.tsx`)

### 1.1 Remover "Jobs ativos" da visão principal
O card "Jobs ativos" hoje só lista `job.tipo` + badge de status — é log técnico, não tem valor pro autor.

- Remover o card "Jobs ativos" do layout principal do Dashboard.
- Mover esse conteúdo para um lugar discreto: uma aba/seção **"Atividade"** dentro de **Configurações** (ou um Sheet/Drawer "Ver atividade" acionado por um link pequeno no rodapé do Dashboard). Lá pode listar os jobs com tipo, status, horário e erro.
- O Dashboard deve focar 100% nos projetos.

### 1.2 Melhorar a exibição dos projetos (cards)
Trocar a `<ul>` atual por **cards** mais ricos, em grid responsivo (1 col mobile, 2–3 desktop). Cada card mostra:
- Título (grande), gênero, idioma de origem.
- Badge de status **derivado** (ver item 1.4), não o `proj.status` cru.
- Mini-progresso quando estiver escrevendo (ex.: `16/32 capítulos` + barra fina), lendo de `editions`/último job `escrever_livro`.
- Ações: abrir projeto, e o botão de excluir movido para um menu "…" (não exposto direto, pra evitar clique acidental).

### 1.3 Agrupar volumes de uma saga no MESMO card
Hoje 3 volumes de uma trilogia aparecem como 3 linhas soltas. Em vez disso:
- Agrupar projetos por `serie` **na UI**. Projetos sem série continuam como card individual.
- Renderizar **um único card por saga**, com o nome da série, o nº de volumes (`Vol. 1–3`) e o status de cada volume. Ao expandir/clicar, mostrar a lista dos volumes (cada um leva ao seu `/projeto/:id`).
- Não alterar o banco; é só `groupBy(serie)` no carregamento dos projetos.

### 1.4 Status que respeita o worker
O badge "Escrevendo" aparece mesmo com o worker **offline**, o que é incoerente (offline = nada processa).

- Criar em `src/lib/status.ts` uma função pura, ex. `displayProjectStatus({ projectStatus, hasActiveJob, workerOnline })`, que retorna o rótulo/variante de exibição:
  - Se `projectStatus === "escrevendo"` (ou há job `queued`/`running`) **e** worker **offline** → rotular **"Escrita pausada (worker offline)"** com variante neutra/âmbar, nunca "Escrevendo" animado.
  - Se há job ativo **e** worker online → "Escrevendo".
  - Demais casos: mapeamento atual.
- Adicionar testes para essa função.
- Dashboard e `Projeto.tsx` passam a usar o status derivado. O `useWorkerStatus` já expõe `online`.

---

## 2) Página do projeto (`src/pages/Projeto.tsx`)

### 2.1 Botão de escrita: nunca sugerir "refazer tudo"
No `src` o rótulo já varia ("Escrever livro" / "Continuar escrita" / "Continuar / revisar"), mas o build em produção mostra **"Reescrever livro"**, que assusta (parece descartar o que já existe).

- Garantir que o rótulo seja sempre não-destrutivo e claro:
  - Nada escrito ainda → **"Iniciar escrita"**.
  - Em progresso (faltam capítulos) → **"Continuar escrita (cap. X/Y)"**.
  - Todos os capítulos feitos, abaixo da meta de nota → **"Refinar até a meta"** (com tooltip explicando que melhora, não recomeça).
- Manter/realçar o texto auxiliar que já existe ("Continua de onde parou… não descarta nem reescreve o que já existe").
- **Eliminar definitivamente** qualquer ocorrência do rótulo "Reescrever livro" no código e no build.

### 2.2 "Criar volumes da saga (N)" — dar confiança ao usuário
Hoje é um botão que dispara o job direto, sem o autor saber o que vai acontecer. Refazer o fluxo:

- Ao clicar, abrir um **Dialog de confirmação** que explica em linguagem simples, antes de enfileirar:
  - **O que vai criar:** "Vamos criar os volumes 2 e 3 da série *X* como novos projetos, **sem alterar este volume 1**."
  - **O que é herdado:** mundo, elenco e voz (Bíblia, Mapa de Personagens, perfil de voz) vêm do vol. 1.
  - **O que é gerado novo:** a Estrutura própria de cada volume, avançando os arcos.
  - **Pré-requisitos:** "A fundação deste volume precisa estar pronta" (mostrar aviso se não estiver, já que o worker valida isso).
  - **O que NÃO acontece:** não escreve os capítulos dos novos volumes automaticamente; cada volume é escrito depois, individualmente.
  - Botões: "Criar volumes" / "Cancelar".
- Após enfileirar, mostrar progresso claro ("Criando volume 2 de 3…") e, ao concluir, **link direto para os novos projetos criados** (consultar `projects` por `serie` + `volume`).
- Tratar mensagens de erro do worker de forma amigável (ex.: saldo da conta esgotado, fundação ausente) com texto orientando a próxima ação.

---

## 3) Catálogo (`src/pages/Catalogo.tsx`) — estilo Amazon/Netflix

Pensar numa biblioteca com muitos livros. Reformular a navegação:

- **Layout em prateleiras/grade rica:** capas maiores com aspect ratio de livro, hover com leve zoom/sombra e overlay (título, idioma, status). Estilo storefront.
- **Organização por seções** (carrosséis horizontais roláveis, estilo Netflix), por ex.: "Continuar produção" (status escrevendo/revisão), "Prontos / Publicados", "Por série" (agrupado por `serie`), "Por idioma".
- **Busca por título** + manter os filtros existentes (idioma, status, série), redesenhados como chips/segmented controls em vez de `<select>` cru.
- **Estado vazio** com ilustração e CTA "Criar primeiro projeto".
- **Performance:** capas via `signedUrl` já existem; manter, mas considerar cache simples em memória pra não reassinar a cada render. Usar `loading="lazy"` nas imagens.
- Acessível e responsivo (teclado, alt nas imagens, contraste).

Não inventar dados — usar `projects` + `editions` + `artifacts(tipo='capa')` como já é feito.

---

## 4) Configurações (`src/pages/Configuracoes.tsx`) — clarear ligar/desligar o worker

O usuário não entende como liga/desliga o worker. A causa: a UI mistura **dois conceitos**:
1. **Worker rodando na máquina** (online/offline via heartbeat) → a UI **não controla** isso; depende do processo local.
2. **`worker_control.enabled`** (o Switch atual) → só **pausa/retoma a fila**, não inicia o processo.

Reformular a seção Worker pra deixar isso explícito:

- **Bloco "Status do worker":** indicador online/offline grande + último heartbeat. Quando **offline**, exibir um aviso claro: "O worker não está rodando na sua máquina. O processamento só acontece com ele ligado." e mostrar **como iniciar** (o comando/atalho usado pra subir o `worker/`, ex.: `npm run dev` na pasta `worker`, ou o script real do projeto — verificar `worker/package.json` e documentar o comando correto).
- **Bloco "Processar fila":** renomear/explicar o Switch como **"Processar fila de jobs"**, deixando claro que ele só vale **quando o worker está online**, e que offline ele não faz nada. Quando offline, desabilitar o Switch (ou mostrá-lo esmaecido) com a explicação.
- Texto curto de "Como funciona": worker é um programa local; este painel só liga/pausa a fila — para ligar/desligar o worker de fato, é o processo na máquina.
- Verificar o comando real de start do worker em `worker/package.json` e refletir na UI/copy.

---

## Critérios de aceite (checklist)

- [ ] Dashboard sem o card "Jobs ativos"; atividade movida para Configurações (ou drawer discreto).
- [ ] Projetos exibidos como cards; saga agrupada em um único card com seus volumes.
- [ ] Nenhum projeto mostra "Escrevendo" com worker offline; status derivado testado.
- [ ] Botão de escrita nunca diz "Reescrever livro"; rótulos claros e não-destrutivos.
- [ ] "Criar volumes da saga" passa por Dialog explicativo antes de enfileirar; links pros volumes criados.
- [ ] Catálogo redesenhado (storefront/carrosséis, busca, filtros como chips, estado vazio).
- [ ] Configurações separa "worker online/offline" de "processar fila", com instrução de como subir o worker.
- [ ] `npm run build` ok, testes passando, `dist` regenerado.

## Não faça
- Não fundir/migrar linhas de `projects` (saga continua N projetos; agrupamento é só visual).
- Não mudar o contrato do worker nem os tipos de job.
- Não introduzir libs pesadas novas; usar shadcn/ui + Tailwind já presentes.
