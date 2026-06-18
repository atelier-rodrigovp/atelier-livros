# SETUP-CREDENCIAIS — checklist à prova de erro (tudo grátis)

> Guia passo a passo para criar as contas gratuitas, fazer os logins únicos das CLIs
> e colocar cada chave no `.env` certo. **O Claude Code nunca precisa das suas
> senhas** — ele usa tokens das CLIs (login único no navegador) e chaves coladas nos
> `.env`. As senhas/chaves NUNCA entram no código nem no GitHub.
>
> **E-mail das contas:** `rodrigo_vp@hotmail.com`
> **Regra de ouro:** segredos só nos arquivos `.env` (já estão no `.gitignore`).
> O `service_role` do Supabase fica EXCLUSIVAMENTE em `worker/.env`.

---

## 0) Pré-requisitos na sua máquina (uma vez)
- **Node 20+** e **npm** (https://nodejs.org)
- **Git** (https://git-scm.com)
- **Python 3.12+** (para o `livro_runner.py`)
- **Claude Code** (CLI) logado no seu plano **MAX**
- (Opcional) **GitHub CLI** `gh`, **Supabase CLI**, **Netlify CLI** — instalados abaixo.

---

## 1) GitHub (grátis) — versionar o código
1. Crie a conta em https://github.com/signup com `rodrigo_vp@hotmail.com`
   (escolha um *username*, ex.: `rodrigovp`; guarde-o).
2. Instale e logue a CLI (login abre o navegador, você aprova — sem senha no terminal):
   ```powershell
   winget install GitHub.cli
   gh auth login        # escolha: GitHub.com > HTTPS > Login with a web browser
   ```
3. (O Claude Code criará o repositório com `gh repo create` na FASE 0.)

> O Claude Code usa o token salvo pelo `gh auth login`. Você não digita senha pra ele.

---

## 2) Supabase (grátis) — banco, auth, storage, fila
1. Crie a conta em https://supabase.com (botão **Start your project** → entre com
   GitHub OU com `rodrigo_vp@hotmail.com`).
2. **New project**: nome `atelier-livros`, escolha uma **senha do banco** (guarde-a
   num gerenciador — NÃO vai para o código), região mais próxima (ex.: São Paulo).
3. Aguarde ~2 min provisionar. Depois pegue as chaves em
   **Project Settings → API**:
   - **Project URL** → vai em `VITE_SUPABASE_URL` (front) e `SUPABASE_URL` (worker)
   - **anon public** → vai em `VITE_SUPABASE_ANON_KEY` (front)
   - **service_role** (em "Project API keys", clique em *Reveal*) → vai SÓ em
     `SUPABASE_SERVICE_ROLE_KEY` (worker). **NUNCA no front.**
4. Pegue também seu **User ID** (depois de criar seu usuário, passo 6):
   **Authentication → Users → (seu usuário) → copiar UID** → `OWNER_USER_ID` (worker).
5. Rode os SQLs (no painel **SQL Editor**, em ordem):
   - cole e execute `supabase/schema.sql`
   - cole e execute `supabase/policies.sql`
6. **Crie o SEU usuário** (uso próprio, signup desativado):
   **Authentication → Users → Add user** → e-mail `rodrigo_vp@hotmail.com` + uma
   senha forte (essa é a senha que VOCÊ usa para logar na plataforma).
   Em **Authentication → Providers → Email**, desative "Enable Sign-ups".
7. **Storage → Create bucket** (privados): `manuscritos`, `epubs`, `capas`, `pacotes`.
8. (Opcional) CLI:
   ```powershell
   npm install -g supabase
   supabase login       # abre o navegador, você aprova
   ```

---

## 3) Netlify (grátis) — publicar o front
1. Crie a conta em https://app.netlify.com/signup (entre com **GitHub** — mais fácil).
2. Forma recomendada: **Add new site → Import an existing project →** conecte o repo
   do GitHub. Build command `npm run build`, publish directory `dist`.
3. Em **Site settings → Environment variables**, adicione:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
   (somente chaves PÚBLICAS — nada de service_role aqui.)
4. (Opcional) CLI:
   ```powershell
   npm install -g netlify-cli
   netlify login        # abre o navegador, você aprova
   ```

---

## 4) Amazon KDP — sem automação (manual)
- Não há API de publicação nem de vendas. Use sua conta normal em
  https://kdp.amazon.com para **publicar** (colando o pacote gerado pela plataforma)
  e para **baixar os relatórios** (CSV) que você importa na aba Vendas.
- O Claude Code e o worker **não** acessam a Amazon. (Respeita os Termos.)

---

## 5) Onde cada chave vai (resumo)

**`.env` (front / Netlify) — só público:**
```
VITE_SUPABASE_URL=<Project URL>
VITE_SUPABASE_ANON_KEY=<anon public>
```

**`worker/.env` (local — SEGREDOS, fora do git):**
```
SUPABASE_URL=<Project URL>
SUPABASE_SERVICE_ROLE_KEY=<service_role — SÓ AQUI>
OWNER_USER_ID=<seu UID do Supabase>
WORKER_ID=pc-rodrigo
WORK_DIR=C:/Users/Rodrigo/atelier-work
POLL_INTERVAL_MS=5000
HEARTBEAT_STALE_MIN=15
CLAUDE_BIN=claude
RUNNER_PATH=C:/Users/.../skills/livro-do-zero-ao-epub/assets/livro_runner.py
PY_BIN=python3
MODEL=opus
```

---

## 6) Ordem de execução (do zero ao ar)
1. Criar contas (1, 2, 3) com `rodrigo_vp@hotmail.com`.
2. `gh auth login`, `supabase login`, `netlify login` (logins únicos no navegador).
3. Rodar `schema.sql` e `policies.sql` no Supabase; criar buckets; criar seu usuário.
4. Preencher `.env` (front) e `worker/.env` (worker) com as chaves.
5. Abrir o Claude Code na pasta e colar o Prompt de arranque (Seção 16 do spec) →
   FASE 0.
6. Subir o front no Netlify (via GitHub) e rodar o worker local
   (`cd worker; npm run start`).

---

## 7) Segurança (não pule)
- `service_role` e a senha do banco: **só** no `worker/.env` e no seu gerenciador de
  senhas. Jamais no front, no código ou no GitHub.
- Confirme que `.env` e `worker/.env` estão no `.gitignore` (estão) antes do 1º push.
- Se um segredo vazar (ex.: foi para um commit), **rotacione** a chave no painel do
  Supabase imediatamente.
- Peça ao Claude Code, ao fim de cada fase, para rodar uma checagem de segurança
  (nenhum segredo no repositório).

---

### Checklist rápido
- [ ] Conta GitHub criada + `gh auth login`
- [ ] Projeto Supabase criado; URL/anon/service_role copiados
- [ ] `schema.sql` + `policies.sql` executados
- [ ] Buckets `manuscritos/epubs/capas/pacotes` criados
- [ ] Meu usuário criado + signups desativados + UID copiado
- [ ] Conta Netlify criada + variáveis públicas configuradas
- [ ] `.env` (front) e `worker/.env` preenchidos
- [ ] `.gitignore` cobre os `.env` (confirmado)
- [ ] Claude Code rodou a FASE 0 com sucesso
