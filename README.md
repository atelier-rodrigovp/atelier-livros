# Atelier de Livros IA — esqueleto do repositório

Scaffold inicial para a plataforma descrita em `PROMPT-PLATAFORMA-LIVROS.md`.
Web (Netlify) + Supabase (dados/auth/storage/fila) + Agent-worker local (IA via
Claude Code MAX). **Use este esqueleto como base e deixe o Claude Code completá-lo
seguindo o spec, fase por fase, com `/goal`.**

## Estrutura
```
atelier-livros/
├── README.md                  · este arquivo
├── netlify.toml               · build/deploy do front
├── .gitignore
├── .env.example               · variáveis do FRONT (anon key)
├── package.json               · front React+Vite+TS+Tailwind+shadcn
├── supabase/
│   ├── schema.sql             · tabelas (idempotente)
│   └── policies.sql           · RLS (owner = auth.uid())
├── src/                       · front (bootstrap mínimo)
│   ├── lib/supabase.ts
│   └── App.tsx
└── worker/                    · agent-worker LOCAL (NÃO vai para o Netlify)
    ├── package.json
    ├── .env.example           · SERVICE ROLE só aqui
    └── src/
        ├── supabase.ts
        ├── index.ts           · loop de polling + lock + dispatch
        └── jobs.ts            · executores por tipo de job (chamam Claude Code/runner)
```

## Setup rápido
### 1) Supabase
1. Crie um projeto no Supabase.
2. Rode `supabase/schema.sql` e depois `supabase/policies.sql` no SQL Editor.
3. Crie os buckets de Storage: `manuscritos`, `epubs`, `capas`, `pacotes` (privados).
4. Em Auth, **desabilite signups** e crie o seu usuário (uso próprio).

### 2) Front (Netlify)
```
cp .env.example .env        # preencha VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY
npm install
npm run dev                 # local
npm run build               # produção (Netlify usa isto)
```
Deploy: conecte o repo no Netlify (build `npm run build`, publish `dist`).

### 3) Worker (na SUA máquina, onde o Claude Code MAX está logado)
```
cd worker
cp .env.example .env        # SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, CLAUDE_BIN, RUNNER_PATH...
npm install
npm run dev                 # ou: npm run start (produção)
```
Para rodar 24/7: use PM2 (`pm2 start npm --name atelier-worker -- run start`) ou o
Agendador de Tarefas do Windows. Para independer do PC, migre o worker para uma VM
(ver Seção 15 do spec).

## Validação da FASE 0 (fundação técnica)
Critérios de aceite (Seção 12). Tudo abaixo deve passar contra o Supabase **real**:
1. `npm install` na raiz e em `worker/` sem erros.
2. `npm run build` (front) e `npm test` (unitários) verdes.
3. Rodar `supabase/schema.sql` e `supabase/policies.sql` no SQL Editor (idempotentes —
   podem rodar de novo sem quebrar). Criar os 4 buckets de Storage.
4. Criar seu usuário em Auth e **desabilitar signups**. Login no painel funciona.
5. Criar um projeto pelo botão “Novo projeto” → persiste (visível só para você por RLS).
6. Subir o worker (`cd worker && npm run start`) → ele loga **“conectado”** e o
   indicador “Worker online” acende no painel.
7. Em **Configurações → Enfileirar job de teste (ping)** → o job sai de `queued` para
   `done` (worker pegou o job de teste). É o smoke test ponta a ponta da fila.

> **Skills de IA (FASE 1+):** a escrita/tradução/capa/EPUB dependem das skills
> `arquiteto-de-enredo`, `livro-do-zero-ao-epub` (+ `livro_runner.py`),
> `traducao-editorial`, `edicao-kindle`, `book-bestseller-review`, `canvas-design`.
> Elas **ainda não estão instaladas** nesta máquina e serão necessárias a partir da
> FASE 1. A FASE 0 não depende delas.

## Testes
```
npm test            # unitários do front (vitest): validações Zod + reducers de status
cd worker && npm run typecheck
```

## Regras de ouro (do spec)
- A web NUNCA chama o Claude direto; ela enfileira `jobs`. Quem executa é o worker.
- `service_role` e o login do Claude Code ficam SÓ no worker (`.env` fora do git).
- Escrita do livro = `livro_runner.py --model opus` (verdade do disco). `/goal`
  orquestra fases de desenvolvimento e tarefas macro.
- Amazon: gerar pacote + importar CSV (sem scraping).

> Próximo passo: abra o Claude Code nesta pasta e cole o **Prompt de arranque**
> (Seção 16 do `PROMPT-PLATAFORMA-LIVROS.md`).
