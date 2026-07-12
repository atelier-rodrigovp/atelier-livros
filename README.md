# Atelier de Livros IA

Plataforma pessoal que orquestra os agentes de IA do Claude Code (plano MAX) para
**produzir, traduzir, capear, empacotar e acompanhar livros** de ponta a ponta.
Fonte de verdade do produto: `PROMPT-PLATAFORMA-LIVROS.md`.

- **Web (GitHub Pages):** React + Vite + TypeScript + Tailwind + shadcn/ui — painel de controle.
- **Supabase:** Postgres (dados + fila de jobs), Auth (single-user), Storage, Realtime, RLS.
- **Agent-worker (local):** Node/TS que pega jobs na fila e executa a IA (Claude Code
  headless + `livro_runner.py` + skills). **A web nunca chama o Claude direto.**

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
| `criar_fundacao` | `{project_id}` | `arquiteto-de-enredo` (não interativo) → fundação no disco → Storage; cria edição origem |
| `escrever_livro` | `{project_id}` | `livro_runner.py --model opus` até CONCLUIDO; capítulos/manuscrito/EPUB → Storage; nota/status por verdade do disco |
| `gerar_epub` | `{edition_id}` | `edicao-kindle/build_epub.py` (determinístico) + `validate_epub.py` → `artifacts(epub)` |
| `traduzir` | `{project_id, idiomas:[...]}` | `traducao-editorial` por idioma → `editions` + capítulos traduzidos |
| `gerar_capa` | `{edition_id}` | `canvas-design` (arte + tipografia) → PNG/PDF KDP → `artifacts(capa)` |
| `gerar_pacote` | `{edition_id}` | `edicao-kindle` (pacote comercial) → `publishing_packages` |
| `importar_vendas` | `{import_id, csv_path}` | parse CSV KDP → `sales_rows` (a UI de Vendas também importa direto) |
| `ping` | `{}` | smoke test ponta a ponta da fila |

## Setup (resumo — detalhes em `SETUP-CREDENCIAIS.md`)

### 1) Supabase
1. Crie um projeto. Em **SQL Editor**, rode em ordem: `supabase/schema.sql`,
   `supabase/policies.sql`, `supabase/storage.sql` (todos idempotentes).
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
skills instaladas em `~/.claude/skills/`: `arquiteto-de-enredo`,
`livro-do-zero-ao-epub`, `traducao-editorial`, `edicao-kindle`,
`book-bestseller-review`, `canvas-design`.
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
Dashboard (projetos + jobs Realtime) · Novo Projeto (wizard de briefing) · Projeto
(abas Fundação/Escrita/Edições/Capas/EPUBs/Publicação) · Catálogo (capas filtráveis) ·
Vendas (import CSV KDP + dashboards) · Configurações (saúde do worker + ping).

## Testes
```
npm test                    # front (vitest): parser CSV KDP, validações Zod, reducers de status
cd worker && npm run typecheck
```

## Amazon/KDP
Sem API: a plataforma **gera o pacote** (sinopse, descrição HTML, 7 keywords, 3
categorias, EPUB, capa) para publicação manual no KDP, e **importa CSV** dos relatórios
para os dashboards. Nada de scraping/automação de login (respeita os Termos).

## Regras de ouro
- A web NUNCA chama o Claude direto; enfileira `jobs`. Quem executa é o worker.
- `service_role` e login do Claude só no worker (`.env` fora do git).
- Escrita = `livro_runner.py --model opus` (verdade do disco).
- Opus inegociável no escritor; skills baratas mantêm seu frontmatter.
