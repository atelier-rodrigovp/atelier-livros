# PROMPT SPEC-DRIVEN — Plataforma "Atelier de Livros IA"
### Do zero ao hero, com Claude Code + /goal · Netlify (web) + Supabase (dados) + Agent-worker local (IA)

> **Como usar este documento.** Ele é um *prompt spec-driven* completo. Abra o
> Claude Code numa pasta nova de projeto e cole a **Seção 16 (Prompt de arranque)**.
> O Claude Code usará este spec inteiro como fonte de verdade e construirá a
> plataforma **por fases**, usando `/goal` como orquestrador de cada fase. As
> seções 1–15 são a especificação; a 16 é o gatilho; a 17–18 são apoio.
>
> **Idioma do produto:** PT-BR (interface), conteúdo dos livros conforme cada projeto.

---

## 1. VISÃO

Uma plataforma web **de uso pessoal** (com login) que orquestra os agentes de IA do
Claude Code (plano MAX) para **produzir, traduzir, capear, empacotar e acompanhar
livros** de ponta a ponta. A web é o **painel de controle**; a IA pesada roda num
**agent-worker local** na máquina onde o Claude Code está logado. Os dados, arquivos
e a fila de trabalho ficam no **Supabase**. O front é publicado no **Netlify**.

**Resultado esperado:** criar um projeto de livro a partir de um briefing → a IA
escreve o livro inteiro (agêntico, Opus no escritor) → revisa até a meta → gera EPUB
→ traduz para 6 idiomas → gera capa por idioma → monta o pacote de publicação
(sinopse, keywords, categorias) → organiza tudo num catálogo → importa relatórios de
venda da Amazon e mostra dashboards.

---

## 2. PRINCÍPIOS E RESTRIÇÕES (ler antes de codar)

1. **Netlify/Supabase NÃO executam Claude Code.** Toda tarefa de IA (escrita,
   tradução, capa, EPUB, pacote) é executada por um **Agent-worker** que roda na
   máquina do usuário (onde o Claude Code/MAX está autenticado). A comunicação é via
   uma **fila de jobs** no Supabase. A web nunca chama o Claude diretamente.
2. **Verdade vem do disco/banco, não de auto-relato.** Reaproveitar a filosofia do
   `livro_runner.py` v2: o worker confere arquivos reais e grava status verificável.
3. **Opus inegociável no escritor.** O worker dispara o runner com `--model opus`; a
   prosa nasce no subagente `livro-escritor`. Skills baratas (haiku/sonnet) mantêm
   seu frontmatter.
4. **Amazon/KDP não tem API de publicação nem de vendas.** A plataforma **gera o
   pacote** (sinopse, 7 keywords, 3 categorias, EPUB, capa) para publicação manual no
   KDP, e **importa CSV** dos relatórios KDP para dashboards. Nada de scraping.
5. **Segurança de segredos:** a `service_role` do Supabase e o login do Claude Code
   ficam **somente no worker local**. O front usa apenas `anon key` + JWT do usuário.
6. **Single-user com controle de acesso:** Supabase Auth (e-mail+senha ou magic
   link). RLS amarra todo dado a `auth.uid()`. (Estrutura já pronta para multi-user
   no futuro, mas habilitado só para o dono.)
7. **Idempotência e retomada:** todo job é reentrante; se o worker cair, ao voltar
   ele retoma do estado real (igual ao runner blindado).
8. **`/goal` como orquestrador, runner como espinha.** Use `/goal` para orquestrar
   fases de desenvolvimento e tarefas macro (ex.: "gerar pacote completo nos 6
   idiomas"). Para a **escrita do livro**, use o `livro_runner.py` (determinístico,
   à prova de trapaça) — é mais confiável que deixar o /goal escrever capítulos.

---

## 3. ARQUITETURA DE ALTO NÍVEL

```
┌──────────────────────────┐        ┌─────────────────────────────┐
│  WEB (Netlify)           │  HTTPS │  SUPABASE                    │
│  React+Vite+Tailwind+    │◄──────►│  - Postgres (dados+fila jobs)│
│  shadcn/ui               │        │  - Auth (single-user)        │
│  Painel/Catálogo/Status  │        │  - Storage (epub/capa/manus.)│
└──────────────────────────┘        │  - Realtime (status ao vivo) │
                                     │  - RLS (owner = auth.uid())  │
                                     └──────────────┬──────────────┘
                                        pega job ▲  │ resultados/status
                                                 │  ▼
                                  ┌──────────────────────────────────┐
                                  │  AGENT-WORKER (PC do usuário)     │
                                  │  Node/TS (ou Python) long-running │
                                  │  - poll jobs (FOR UPDATE SKIP     │
                                  │    LOCKED)                        │
                                  │  - executa Claude Code headless:  │
                                  │    skills + livro_runner.py +     │
                                  │    /goal                          │
                                  │  - upload de artefatos p/ Storage │
                                  │  - escreve status verificável     │
                                  │  Usa o plano MAX (login local)    │
                                  └──────────────────────────────────┘
```

---

## 4. STACK TÉCNICA

- **Front:** React 18 + Vite + TypeScript + Tailwind CSS + **shadcn/ui** + lucide-react;
  Recharts (dashboards); React Router; TanStack Query; Zod (validação).
- **Backend gerenciado:** Supabase (Postgres 15, Auth, Storage, Realtime, RLS).
- **Worker:** Node 20 + TypeScript (preferido; mesmo ecossistema do front) **ou**
  Python 3.12 (reaproveita o `livro_runner.py`). Recomendado: **worker em Node que
  invoca o `livro_runner.py` via `child_process`** — assim aproveita o runner pronto.
- **Deploy:** Netlify (front, build `vite build`, SPA redirect). Worker roda local
  (`npm run worker`) como processo/serviço; documentar PM2/Task Scheduler para 24/7.
- **CLI de IA:** Claude Code (plano MAX, já logado na máquina do worker), invocado
  com `claude -p ... --permission-mode bypassPermissions --model opus` e, quando a
  tarefa for macro, com `/goal`.

---

## 5. MODELO DE DADOS (Supabase / Postgres)

> Habilitar `pgcrypto` (uuid). Toda tabela tem `owner uuid default auth.uid()`,
> `created_at timestamptz default now()`, `updated_at`. RLS: `owner = auth.uid()`.

```sql
-- PROJETOS (um projeto = uma obra; pode ter volumes/série)
create table projects (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null default auth.uid(),
  titulo text not null,
  serie text,
  volume int default 1,
  genero text,
  idioma_origem text default 'pt-BR',
  status text not null default 'rascunho', -- rascunho|fundacao|escrevendo|revisao|pronto|publicado
  briefing jsonb not null default '{}',    -- respostas da entrevista (ver 8.1)
  skill_escrita text,                      -- ex.: skill-dan-brown | hoover-mcfadden | null
  paginas_alvo int, total_capitulos int, piso_palavras int default 1400,
  meta_nota numeric default 9.0,
  created_at timestamptz default now(), updated_at timestamptz default now()
);

-- EDIÇÕES POR IDIOMA (a obra em cada idioma)
create table editions (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null default auth.uid(),
  project_id uuid not null references projects(id) on delete cascade,
  idioma text not null,                    -- pt-BR|en-US|en-GB|es-ES|it-IT|de-DE|fr-FR
  status text not null default 'pendente', -- pendente|traduzindo|revisao|pronto
  is_origem boolean default false,
  nota_review numeric,
  unique(project_id, idioma)
);

-- CAPÍTULOS (por edição)
create table chapters (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null default auth.uid(),
  edition_id uuid not null references editions(id) on delete cascade,
  numero int not null,
  titulo text, palavras int default 0,
  storage_path text,                       -- manuscrito/capitulo-NN.md no Storage
  unique(edition_id, numero)
);

-- ARTEFATOS (epub, capa, manuscrito-mestre, pacote)
create table artifacts (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null default auth.uid(),
  edition_id uuid references editions(id) on delete cascade,
  tipo text not null,                      -- epub|capa|manuscrito|pdf|outro
  storage_path text not null,
  url_publica text, meta jsonb default '{}'
);

-- PACOTE DE PUBLICAÇÃO (por edição/idioma)
create table publishing_packages (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null default auth.uid(),
  edition_id uuid not null references editions(id) on delete cascade,
  sinopse text, descricao_html text,
  keywords text[],                         -- 7
  categorias text[],                       -- 3
  subtitulo text, autor text, preco_sugerido numeric,
  status text default 'rascunho'
);

-- FILA DE JOBS (o coração da ponte web↔worker)
create table jobs (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null default auth.uid(),
  project_id uuid references projects(id) on delete cascade,
  edition_id uuid references editions(id) on delete cascade,
  tipo text not null,    -- ver 6.1 (criar_fundacao|escrever_livro|traduzir|gerar_capa|gerar_pacote|gerar_epub|importar_vendas)
  payload jsonb not null default '{}',
  status text not null default 'queued',   -- queued|running|paused|done|error|canceled
  progresso jsonb default '{}',            -- {fase, cap_atual, total, nota, ...}
  log text, erro text,
  attempts int default 0, max_attempts int default 3,
  locked_by text, locked_at timestamptz,
  created_at timestamptz default now(), updated_at timestamptz default now()
);

-- VENDAS (import CSV dos relatórios KDP)
create table sales_imports (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null default auth.uid(),
  arquivo text, periodo text, importado_em timestamptz default now()
);
create table sales_rows (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null default auth.uid(),
  import_id uuid references sales_imports(id) on delete cascade,
  project_id uuid references projects(id),
  idioma text, marketplace text, data date,
  unidades int, royalty numeric, moeda text
);
```

**Storage buckets:** `manuscritos/`, `epubs/`, `capas/`, `pacotes/` — privados;
acesso via signed URLs geradas sob RLS. **Realtime:** habilitar em `jobs` e
`projects` para o painel atualizar status ao vivo.

**RLS (todas as tabelas):**
```sql
alter table <tabela> enable row level security;
create policy "owner_all" on <tabela>
  for all using (owner = auth.uid()) with check (owner = auth.uid());
```

---

## 6. CONTRATO DE JOBS (fila web ↔ worker)

### 6.1 Tipos de job e payloads
| tipo | payload (jsonb) | o worker faz |
|---|---|---|
| `criar_fundacao` | `{project_id}` | roda `arquiteto-de-enredo` NÃO interativo a partir de `projects.briefing` → gera fundação no disco → sobe arquivos da fundação p/ Storage; cria `editions` (origem) |
| `escrever_livro` | `{project_id}` | roda `livro_runner.py --model opus` até CONCLUIDO; sobe capítulos/manuscrito; atualiza `chapters`, nota, status |
| `gerar_epub` | `{edition_id}` | roda `edicao-kindle` → EPUB validado (epubcheck) → Storage + `artifacts` |
| `traduzir` | `{project_id, idiomas:[...]}` | roda `traducao-editorial` por idioma → cria/atualiza `editions`, capítulos traduzidos |
| `gerar_capa` | `{edition_id}` | gera arte (IA de imagem) + tipografia (`canvas-design`) → PNG/PDF KDP → `artifacts` tipo capa |
| `gerar_pacote` | `{edition_id}` | gera sinopse/descrição HTML/7 keywords/3 categorias (via `edicao-kindle`/LLM) → `publishing_packages` |
| `importar_vendas` | `{import_id, csv_path}` | parseia CSV KDP → `sales_rows` |

### 6.2 Ciclo de vida
`queued → running → (done | error | paused)`. Worker pega com
`select ... for update skip locked` (lock atômico), marca `locked_by/locked_at`,
`status=running`, faz heartbeat em `progresso`, e ao fim grava `done` ou `error`
(com `erro` e incremento de `attempts`; re-enfileira se `attempts < max_attempts`).
**Reentrância:** se o worker reiniciar, jobs `running` órfãos (sem heartbeat há > N min)
voltam a `queued`.

---

## 7. AGENT-WORKER (local)

Processo long-running em Node/TS na máquina do usuário. Responsabilidades:

1. **Conectar ao Supabase** com `service_role` (lido de `.env` local, NUNCA no front).
2. **Loop de polling** (ex.: a cada 5 s) buscando `jobs.status='queued'` do owner.
3. **Executor por tipo de job** (Seção 8) — invoca Claude Code headless e/ou o
   `livro_runner.py` em uma pasta de trabalho por projeto
   (`~/atelier-livros/<project_id>/`).
4. **Sync de artefatos:** após cada fase, sobe arquivos do disco para o Storage e
   atualiza tabelas (verdade do disco → banco).
5. **Heartbeat & status:** escreve `progresso` (fase, capítulo atual, nota) para o
   painel mostrar ao vivo via Realtime.
6. **Segurança:** só o worker tem `service_role` e o login do Claude Code.
7. **Concorrência:** 1 job pesado por vez por padrão (configurável); jobs leves
   (pacote/capa) podem rodar em paralelo limitado.

**Invocação de IA (exemplos):**
- Fundação (não interativa):
  `claude -p "<prompt FASE ESTRUTURA do runner, lendo briefing.md>" --permission-mode bypassPermissions --model opus`
- Escrita do livro inteiro (espinha determinística):
  `python3 livro_runner.py --projeto <dir> --briefing <dir>/briefing.md --epub --meta 9.0 --max-reescritas 4 --piso <piso> --model opus`
- Orquestração macro com **/goal** (quando fizer sentido): abrir o Claude Code na
  pasta e enviar um goal como "gerar pacote de publicação nos 6 idiomas e capas".

---

## 8. MAPEAMENTO SKILLS → JOBS

> O worker traduz cada job em chamadas às skills já instaladas. **Não reimplementar
> a lógica das skills** — orquestrá-las.

### 8.1 `criar_fundacao` → skill `arquiteto-de-enredo` (modo não interativo)
- A web coleta o **briefing** num formulário que espelha as perguntas obrigatórias da
  skill: gênero/subgênero; logline; **tamanho em páginas E capítulos**; **nº de
  personagens por papel**; **`skill_escrita`** (lista de skills de estilo:
  `skill-dan-brown`, `hoover-mcfadden`, `skill-jk-rowling`,
  `vesper-escritor-de-capitulos`, ou "Nenhuma"); PdV/tempo; relógio; twist; subtramas;
  final; idioma; gerar EPUB?; meta de nota; piso.
- O worker grava `briefing.md` e roda a skill em modo NÃO interativo (defaults
  registrados em `## SUPOSIÇÕES ASSUMIDAS`). Saída: Bíblia, Estrutura,
  Mapa-de-Personagens, perfil-de-voz, 5 agentes, estado/, `ESTADO_LIVRO.json` semente
  (já com `skill_escrita`).

### 8.2 `escrever_livro` → `livro-do-zero-ao-epub` (`livro_runner.py`, **opus**)
- Espinha determinística; verdade do disco; o subagente `livro-escritor` (opus)
  **invoca a `skill_escrita`** combinada ao perfil de voz; anti-linguiça/anti-MCL.
- Worker espelha `manuscrito/capitulo-NN.md` → `chapters` + Storage; nota → `editions`.

### 8.3 `gerar_epub` → skill `edicao-kindle` (epubcheck) → `artifacts(tipo=epub)` + signed URL.

### 8.4 `traduzir` → skill `traducao-editorial` (PT-BR → en-US/en-GB/es-ES/it-IT/de-DE/fr-FR)
- Pipeline de 3 passos da skill (tradução, glossário canônico, revisão adversarial).
- Cria `editions` por idioma + capítulos traduzidos; depois pode disparar `gerar_epub`
  e `gerar_capa` por idioma.

### 8.5 `gerar_capa` → IA de imagem + `canvas-design`
- Gera arte de fundo com modelo de imagem; compõe título/subtítulo/autor com
  `canvas-design`; exporta PNG/PDF no tamanho KDP; **uma capa por idioma**.

### 8.6 `gerar_pacote` → `edicao-kindle` + LLM
- Sinopse, descrição HTML de vendas, **7 keywords**, **3 categorias**, subtítulo,
  preço sugerido → `publishing_packages` (por idioma).

### 8.7 Qualidade → skill `book-bestseller-review` (já embutida no runner na fase REVIEW).

---

## 9. FRONT-END (Netlify) — TELAS E FLUXOS

**Design system (editorial, elegante):** tema claro/escuro; tipografia serif para
títulos (ex.: "Fraunces"/"Newsreader") + sans para UI (Inter); paleta sóbria
(papel/tinta + 1 acento); cards com sombra suave; shadcn/ui para componentes;
microinterações discretas. Acessível (contraste AA).

**Telas:**
1. **Login** (Supabase Auth; magic link/e-mail+senha).
2. **Dashboard** — visão geral: projetos por status, jobs em andamento (Realtime),
   últimas vendas, atalhos.
3. **Novo Projeto** — wizard que coleta o briefing (8.1), incluindo a escolha da
   `skill_escrita`; ao concluir, enfileira `criar_fundacao`.
4. **Projeto (detalhe)** — abas:
   - *Fundação* (Bíblia/Estrutura/Mapa — visualização e edição leve);
   - *Escrita* (botão "Escrever livro" → `escrever_livro`; progresso por capítulo,
     nota, log ao vivo);
   - *Edições/Idiomas* (disparar `traduzir`; status por idioma);
   - *Capas* (gerar/visualizar por idioma);
   - *EPUBs* (links de download/signed URL por idioma);
   - *Publicação* (pacote KDP por idioma: sinopse, keywords, categorias — copiar 1‑clique).
5. **Catálogo** — grade de capas filtrável **por idioma**, status e série; cada card
   abre a edição.
6. **Vendas** — upload de CSV KDP → dashboards (Recharts): unidades/royalty por
   período, por idioma, por marketplace, por título.
7. **Configurações** — perfil, idioma padrão, chaves (somente status, sem expor
   segredos), saúde do worker (online/offline via heartbeat).

**Realtime:** painel de jobs assina mudanças em `jobs`/`projects`.

---

## 10. AUTENTICAÇÃO E SEGURANÇA
- Supabase Auth single-user; **desabilitar signups** (criar o usuário dono manualmente)
  para "uso próprio".
- RLS em todas as tabelas (`owner = auth.uid()`). Storage com signed URLs.
- Front (Netlify) só conhece `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY`.
- `service_role` e login do Claude Code **apenas** no worker local (`.env` fora do git).
- Sanitizar uploads de CSV; validar com Zod; rate-limit no worker.

---

## 11. AMAZON/KDP (sem API oficial)
- **Geração de pacote** pronto para publicação manual (sinopse, descrição HTML, 7
  keywords, 3 categorias, EPUB validado, capa por idioma) — botões "copiar" para colar
  no KDP.
- **Vendas:** import manual de CSV dos **Relatórios KDP** → `sales_rows` → dashboards.
- **(Opcional, fase futura):** Amazon **Ads** API oficial para campanhas pagas — fora
  do MVP.
- **Nunca** automatizar login/scraping do KDP (viola ToS).

---

## 12. FASES DE ENTREGA (milestones + critérios de aceite)

> Cada fase é um `/goal` no Claude Code. Só avance quando os critérios passarem.

**FASE 0 — Fundação técnica**
- Repo Vite+React+TS+Tailwind+shadcn; Supabase com schema (Seção 5) + RLS; Auth
  single-user; deploy Netlify; `.env.example`; worker esqueleto que conecta e faz
  polling.
- *Aceite:* login funciona; criar um `projects` pelo painel persiste com RLS; worker
  loga "conectado" e pega um job de teste.

**FASE 1 — Criar projeto + escrever livro (núcleo)**
- Wizard de briefing (8.1) → `criar_fundacao`; tela de projeto; `escrever_livro`
  rodando o `livro_runner.py --model opus`; progresso por capítulo via Realtime;
  EPUB ao final.
- *Aceite:* a partir de um briefing, a plataforma gera fundação, escreve um livro
  curto de teste (ex.: 5 caps, piso baixo), nota registrada, EPUB baixável. Verdade
  conferida no Storage (nº de capítulos × palavras).

**FASE 2 — Tradução (6 idiomas)**
- `traduzir` com `traducao-editorial`; edições por idioma; EPUB por idioma.
- *Aceite:* um livro pronto gera as 6 edições com capítulos traduzidos e EPUBs.

**FASE 3 — Capas + Catálogo**
- `gerar_capa` (IA de imagem + canvas-design) por idioma; catálogo filtrável por
  idioma.
- *Aceite:* cada edição tem capa PNG/PDF no tamanho KDP; catálogo exibe e filtra.

**FASE 4 — Pacote de publicação + Vendas**
- `gerar_pacote` (sinopse/keywords/categorias) por idioma; import CSV KDP; dashboards.
- *Aceite:* pacote copiável por idioma; importar um CSV de exemplo gera dashboards
  corretos.

**FASE 5 — Robustez & operação**
- Retomada de jobs órfãos; heartbeat do worker no painel; logs; testes E2E; doc de
  como rodar o worker 24/7 (PM2/Task Scheduler) e migrar para VM.
- *Aceite:* matar o worker no meio de um job e reabrir → retoma sem corromper; suíte
  E2E verde.

---

## 13. VARIÁVEIS DE AMBIENTE

**Front (Netlify):**
```
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
```
**Worker (local, .env NÃO versionado):**
```
SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...      # só aqui
WORKER_ID=pc-rodrigo
WORK_DIR=~/atelier-livros
CLAUDE_BIN=claude                  # Claude Code logado no MAX
RUNNER_PATH=~/.../livro-do-zero-ao-epub/assets/livro_runner.py
POLL_INTERVAL_MS=5000
MAX_PARALLEL_HEAVY=1
```

---

## 14. TESTES E VERIFICAÇÃO
- **Unidade:** parsers (CSV KDP), validações Zod, reducers de status.
- **Integração:** RLS (usuário só vê o próprio dado), fila (lock atômico, reentrância).
- **E2E (Playwright):** login → criar projeto → escrever livro de teste → EPUB →
  traduzir 1 idioma → capa → pacote → import vendas.
- **Verificação à prova de trapaça:** o worker confere arquivos no disco (nº de
  capítulos × piso de palavras) antes de marcar `done` — espelha o `livro_runner.py`.
- **Verificação final por subagente:** ao fim de cada fase, rodar um subagente de
  revisão que valida critérios de aceite contra o banco/Storage reais.

---

## 15. RISCOS E MITIGAÇÕES
- **Worker offline (PC desligado):** jobs ficam `queued`; painel mostra worker
  offline; documentar migração para VM 24/7. 
- **Truncamento/sync de arquivos:** worker valida tamanho/linhas e recalcula do disco;
  nunca confia em contadores auto-relatados.
- **Limites do plano MAX / rate:** worker serializa jobs pesados (1 por vez) e faz
  backoff em erro.
- **KDP ToS:** nada de scraping; só geração de ativos + import CSV.
- **Segredos vazando:** `service_role` só no worker; front só com anon key; `.env`
  fora do git; revisar com um subagente de segurança antes do deploy.

---

## 16. PROMPT DE ARRANQUE (cole isto no Claude Code, na pasta do projeto)

```
Você vai construir a plataforma "Atelier de Livros IA" seguindo, como FONTE DE
VERDADE, o arquivo PROMPT-PLATAFORMA-LIVROS.md (este spec). Stack: React+Vite+
TypeScript+Tailwind+shadcn/ui (web no Netlify) + Supabase (Postgres/Auth/Storage/
Realtime/RLS) + um Agent-worker local em Node/TS que invoca o Claude Code headless e
o livro_runner.py (skill livro-do-zero-ao-epub) com --model opus.

Princípios inegociáveis (Seção 2 do spec): Netlify/Supabase NÃO rodam Claude Code —
a IA roda no worker local via fila de jobs no Supabase; Opus no escritor; verdade vem
do disco/banco; Amazon = gerar pacote + importar CSV (sem scraping); single-user com
RLS; segredos service_role só no worker.

Trabalhe POR FASES (Seção 12). Para CADA fase, use /goal para se organizar:
  /goal Implementar a FASE <n> do PROMPT-PLATAFORMA-LIVROS.md, cumprindo seus
  critérios de aceite, com testes, sem avançar para a próxima fase antes de validar.

Regras de execução:
1) Comece pela FASE 0 e só avance quando os critérios de aceite passarem (rode os
   testes e verifique contra Supabase/Storage reais, não auto-relato).
2) Gere migrações SQL idempotentes para o schema da Seção 5 e ative RLS em tudo.
3) Implemente o contrato de jobs da Seção 6 e o worker da Seção 7/8 mapeando cada job
   às skills já instaladas (arquiteto-de-enredo, livro-do-zero-ao-epub,
   traducao-editorial, canvas-design + IA de imagem, edicao-kindle,
   book-bestseller-review). NÃO reimplemente a lógica das skills — orquestre-as.
4) UI bonita e editorial (Seção 9), shadcn/ui, tema claro/escuro, acessível.
5) Entregue .env.example (Seção 13), README de setup (front no Netlify + worker
   local 24/7 via PM2/Task Scheduler) e suíte de testes (Seção 14).
6) Ao fim de cada fase, rode um subagente de verificação (qualidade + segurança) que
   confira os critérios de aceite e a não-exposição de segredos.

Me mostre, a cada fase: o que foi feito, como validar, e o próximo passo. Pode
seguir de forma autônoma dentro de cada fase; pare entre fases para meu OK.
```

---

## 17. EXTENSÕES FUTURAS (não-MVP)
- Amazon Ads API (campanhas pagas/ACOS) no módulo de Vendas.
- Worker em VM 24/7 (independe do PC).
- Multi-usuário com papéis (já há base no schema).
- Áudio (audiolivro) e versões em PDF para print-on-demand.
- Agendador (escrever/traduzir em horários definidos) reaproveitando a skill `schedule`.

## 18. GLOSSÁRIO
- **Agent-worker:** processo local que executa a IA (Claude Code) e fala com o Supabase.
- **Job:** unidade de trabalho na fila (escrever, traduzir, capa, pacote, epub, vendas).
- **Edição:** a obra em um idioma específico.
- **Pacote de publicação:** sinopse + descrição + 7 keywords + 3 categorias + EPUB + capa.
- **Verdade do disco:** status derivado de arquivos/registros reais, nunca de auto-relato.
```
```
