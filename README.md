# Atelier de Livros IA

Plataforma pessoal que orquestra os agentes de IA do Claude Code (plano MAX) para
**produzir, traduzir, capear, empacotar e acompanhar livros** de ponta a ponta.

- **Web (GitHub Pages):** React + Vite + TypeScript + Tailwind + shadcn/ui — painel de controle.
- **Supabase:** Postgres (dados + fila de jobs), Auth (single-user), Storage, Realtime, RLS.
- **Agent-worker (local):** Node/TS que pega jobs na fila e executa a IA (Claude Code
  headless + skills). **A web nunca chama o Claude direto.**

## Duas engines de escrita

O projeto tem **duas** engines, e o desvio é um único ponto de código
(`worker/src/v2/integracao.ts`), decidido por projeto pelo campo
`projects.engine_mode`:

- **V2** (`engine_mode='v2'`) — núcleo em `worker/src/v2/`. Onze papéis separados por
  classe de capacidade, com o escritor como **único** autor de prosa; skills como
  contratos versionados em dados (`worker/skills-v2/<id>/contrato.json`, hoje
  `dan-brown`, `hoover-mcfadden`, `romantasy`); compilador de contexto com precedência
  de 7 camadas; gates universais determinísticos separados dos sinais editoriais;
  parecer do revisor persistido e hash-bound; estado canônico único no Postgres
  (`supabase/engine_v2.sql`). **Não usa `livro_runner.py`.**
- **V1** (qualquer outro valor, inclusive ausente — é o fail-safe) — `livro_runner.py`
  executado pelo worker, com os normalizadores de fixture e os gates por capítulo.

Detalhe de arquitetura, com arquivo e linha: `CLAUDE.md`. Decisão e operação:
`docs/engine-v2/00-decisao-arquitetural.md` e `01-operacao.md`. De onde sai cada teto
de qualidade: `docs/engine-v2/09-teto-humano.md`.

## Arquitetura
```
WEB (GitHub Pages) ──HTTPS──► SUPABASE (Postgres/Auth/Storage/Realtime/RLS)
   painel/catálogo            tabelas + fila `jobs`            ▲  │
                                                    pega job   │  ▼  status/artefatos
                                            AGENT-WORKER (PC, Claude MAX logado)
                                            poll → executa skills → sobe ao Storage
```
Segredos: o front só conhece `anon key`; a `service_role` e o login do Claude ficam
**só no worker** (`worker/.env`, fora do git).

## Fila de jobs (web → worker)
| tipo | payload | worker faz |
|---|---|---|
| `criar_fundacao` | `{project_id}` | fundação no disco → Storage; cria edição origem (V1: `arquiteto-de-enredo` não interativo) |
| `escrever_livro` | `{project_id}` | escreve até CONCLUIDO; capítulos/manuscrito/EPUB → Storage; status por **verdade do disco**. V2: pipeline de papéis; V1: `livro_runner.py --model opus` |
| `avaliar` | `{project_id}` | `book-bestseller-review` → diagnóstico comercial nos logs do job |
| `gerar_epub` | `{edition_id}` | `edicao-kindle/build_epub.py` (determinístico) + `validate_epub.py` → `artifacts(epub)` |
| `traduzir` | `{project_id, idiomas:[...]}` | `traducao-editorial` por idioma → `editions` + capítulos traduzidos |
| `gerar_capa` | `{edition_id}` | `canvas-design` (arte + tipografia) → PNG/PDF KDP → `artifacts(capa)` |
| `gerar_pacote` | `{edition_id}` | `edicao-kindle` (pacote comercial) → `publishing_packages` |
| `importar_vendas` | `{import_id, csv_path}` | parse CSV KDP → `sales_rows` (a UI de Vendas também importa direto) |
| `ping` | `{}` | smoke test ponta a ponta da fila |

Há mais tipos no despacho (`worker/src/jobs.ts`) — entre eles `refinar_fundacao`,
`criar_volumes`, `gerar_capas_opcoes`, `compor_capas`, `entrevistar`,
`aceitar_excecao_qualidade`, `gerar_post_social` — e dois **exclusivos da V2**:
`laboratorio` (regressão com avaliação cega) e `canario_voz` (cena curta de amostra da
voz, antes da fundação).

## Setup (resumo — detalhes em `SETUP-CREDENCIAIS.md`)

### 1) Supabase
1. Crie um projeto. Em **SQL Editor**, rode em ordem: `supabase/schema.sql`,
   `supabase/policies.sql`, `supabase/storage.sql` e, para a Engine V2,
   `supabase/engine_v2.sql` (todos idempotentes).
2. **Storage:** crie 4 buckets privados — `manuscritos`, `epubs`, `capas`, `pacotes`.
3. **Auth:** crie seu usuário e **desative signups** (uso próprio). Login por
   e-mail+senha ou **magic link**.

### 2) Front (GitHub Pages)
```
cp .env.example .env        # VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY (públicas)
npm install
npm run dev                 # local (http://localhost:5173)
npm run build               # build local; o workflow publica com GHPAGES=1
```
Deploy: configure os secrets `VITE_*` no GitHub; o workflow publica o branch `gh-pages`.

### 3) Worker (na sua máquina, com Claude Code MAX logado)
Pré-requisitos: **Node 20+**, **Python 3.12+** (com **Pillow**: `pip install pillow`,
usado pelo compositor determinístico de capas), **Claude Code** (logado no MAX), e as
skills instaladas em `~/.claude/skills/`. Base: `arquiteto-de-enredo`,
`livro-do-zero-ao-epub`, `traducao-editorial`, `edicao-kindle`,
`book-bestseller-review`, `canvas-design`. De autor (por projeto): `skill-dan-brown`,
`hoover-mcfadden`, `skill-jk-rowling`, `vesper-escritor-de-capitulos`,
`skill-romantasy`. **Skill ausente = job em `error`, sem degradação.**

Depois de instalar, aplique os patches (idempotente):
```
pwsh worker/skill-patches/instalar-skills.ps1
```
O worker confere o `sha256` de cada arquivo contra `worker/skill-patches/manifest.json`
e recusa subir com `SKILL_DRIFT` se a cópia instalada não bater.
```
cd worker
cp .env.example .env        # SUPABASE_URL, SERVICE_ROLE, OWNER_USER_ID, RUNNER_PATH...
npm install
npm run start
```
> **Windows:** o worker usa `spawn(shell:false)`, que não resolve shims `.cmd` nem
> nomes do PATH. Aponte `CLAUDE_BIN` e `PY_BIN` para os **.exe reais** (ver
> `worker/.env.example`).

### Deploy contínuo (GitHub Pages)
Todo push em `master` que afete o front aciona `.github/workflows/deploy.yml`, gera
`dist` com base `/atelier-livros/` e publica em `gh-pages`. Site no ar:
**https://atelier-rodrigovp.github.io/atelier-livros/**.

### Rodar o worker 24/7
- **Windows (Agendador de Tarefas):** crie uma tarefa "Ao iniciar o sistema" que roda
  `npm run start` em `worker/` (ação: o `node.exe`/`npm` com diretório inicial em `worker/`).
- **PM2 (multiplataforma):**
  ```
  npm i -g pm2
  pm2 start npm --name atelier-worker -- run start    # dentro de worker/
  pm2 save && pm2 startup
  ```
- Para independer do PC, migre o worker para uma **VM 24/7** (mesmo `.env`).

## Telas
`src/pages/`: Dashboard (projetos + jobs Realtime) · Novo Projeto (wizard de briefing) ·
Projeto (abas por área) · Observabilidade (custo por papel, throughput, reinícios) ·
Laboratório (regressão com avaliação cega da V2) · Catálogo (capas filtráveis) ·
Leitor · Autores e Autor · Vendas (import CSV KDP + dashboards) · Configurações (saúde
do worker + ping) · Login.

## Testes
```
npm test                                 # front (vitest)
cd worker && npx vitest run              # worker (TS): suíte completa
cd worker && npm run typecheck           # tsc --noEmit, strict
python tools/test_quality_parity.py      # paridade TS ↔ Python dos detectores
```
Não documente contagem fixa de testes — reporte a saída atual do comando.

## Amazon/KDP
Sem API: a plataforma **gera o pacote** (sinopse, descrição HTML, 7 keywords, 3
categorias, EPUB, capa) para publicação manual no KDP, e **importa CSV** dos relatórios
para os dashboards. Nada de scraping/automação de login (respeita os Termos).

## Regras de ouro
- A web NUNCA chama o Claude direto; enfileira `jobs`. Quem executa é o worker.
- `service_role` e login do Claude só no worker (`.env` fora do git).
- **Verdade no disco:** o worker confere os arquivos reais antes de escrever no banco.
  Arquivo fora de sincronia com o que o banco espera = job falha com erro claro.
- Opus inegociável no escritor. Na V2 o modelo vem do mapa classe→modelo da
  configuração, nunca do núcleo.
- **Teto de qualidade vem de prosa humana publicada, nunca do acervo da própria
  engine.** Teto tirado do que se está medindo garante zero marcação por construção —
  o erro está documentado em `docs/engine-v2/09-teto-humano.md` para não se repetir.
- Detector com falso positivo não bloqueia: vira sinal para o revisor.
