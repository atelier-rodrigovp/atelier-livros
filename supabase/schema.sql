-- Atelier de Livros IA — schema (idempotente). Rode no SQL Editor do Supabase.
-- Depois rode policies.sql para as RLS.

create extension if not exists pgcrypto;

-- PROJETOS (uma obra; pode ter volumes/série)
create table if not exists projects (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null default auth.uid(),
  titulo text not null,
  serie text,
  volume int default 1,
  genero text,
  idioma_origem text default 'pt-BR',
  status text not null default 'rascunho', -- rascunho|fundacao|escrevendo|revisao|pronto|publicado
  briefing jsonb not null default '{}',
  skill_escrita text,                      -- skill-dan-brown | hoover-mcfadden | skill-jk-rowling | vesper-escritor-de-capitulos | null
  paginas_alvo int,
  total_capitulos int,
  piso_palavras int default 1400,
  meta_nota numeric default 9.0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- EDIÇÕES POR IDIOMA
create table if not exists editions (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null default auth.uid(),
  project_id uuid not null references projects(id) on delete cascade,
  idioma text not null,                    -- pt-BR|en-US|en-GB|es-ES|it-IT|de-DE|fr-FR
  status text not null default 'pendente', -- pendente|traduzindo|revisao|pronto
  is_origem boolean default false,
  nota_review numeric,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (project_id, idioma)
);

-- CAPÍTULOS (por edição)
create table if not exists chapters (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null default auth.uid(),
  edition_id uuid not null references editions(id) on delete cascade,
  numero int not null,
  titulo text,
  palavras int default 0,
  storage_path text,
  created_at timestamptz default now(),
  unique (edition_id, numero)
);

-- ARTEFATOS (epub, capa, manuscrito, pdf)
create table if not exists artifacts (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null default auth.uid(),
  edition_id uuid references editions(id) on delete cascade,
  tipo text not null,                      -- epub|capa|manuscrito|pdf|outro
  storage_path text not null,
  url_publica text,
  meta jsonb default '{}',
  created_at timestamptz default now()
);

-- PACOTE DE PUBLICAÇÃO (por edição)
create table if not exists publishing_packages (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null default auth.uid(),
  edition_id uuid not null references editions(id) on delete cascade,
  sinopse text,
  descricao_html text,
  keywords text[],                         -- 7
  categorias text[],                       -- 3
  subtitulo text,
  autor text,
  preco_sugerido numeric,
  status text default 'rascunho',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- FILA DE JOBS (ponte web <-> worker)
create table if not exists jobs (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null default auth.uid(),
  project_id uuid references projects(id) on delete cascade,
  edition_id uuid references editions(id) on delete cascade,
  tipo text not null,            -- criar_fundacao|escrever_livro|gerar_epub|traduzir|gerar_capa|gerar_pacote|importar_vendas
  payload jsonb not null default '{}',
  status text not null default 'queued',  -- queued|running|paused|done|error|canceled
  progresso jsonb default '{}',
  log text,
  erro text,
  attempts int default 0,
  max_attempts int default 3,
  locked_by text,
  locked_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists jobs_queue_idx on jobs (status, created_at);

-- VENDAS (import CSV dos relatórios KDP)
create table if not exists sales_imports (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null default auth.uid(),
  arquivo text,
  periodo text,
  importado_em timestamptz default now()
);
create table if not exists sales_rows (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null default auth.uid(),
  import_id uuid references sales_imports(id) on delete cascade,
  project_id uuid references projects(id),
  idioma text,
  marketplace text,
  data date,
  unidades int,
  royalty numeric,
  moeda text
);

-- HEARTBEAT DO WORKER (saúde online/offline no painel; um registro por worker)
create table if not exists worker_heartbeats (
  worker_id text not null,
  owner uuid not null default auth.uid(),
  status jsonb default '{}',
  last_seen timestamptz not null default now(),
  primary key (owner, worker_id)
);

-- gatilho updated_at
create or replace function set_updated_at() returns trigger as $$
begin new.updated_at = now(); return new; end; $$ language plpgsql;

do $$
declare t text;
begin
  foreach t in array array['projects','editions','publishing_packages','jobs'] loop
    execute format('drop trigger if exists trg_%I_updated on %I;', t, t);
    execute format('create trigger trg_%I_updated before update on %I
                    for each row execute function set_updated_at();', t, t);
  end loop;
end $$;

-- Realtime: o painel acompanha jobs/projects ao vivo (idempotente).
-- A publicação supabase_realtime já existe nos projetos Supabase.
do $$
declare t text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach t in array array['jobs','projects'] loop
      if not exists (
        select 1 from pg_publication_tables
        where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
      ) then
        execute format('alter publication supabase_realtime add table %I;', t);
      end if;
    end loop;
  end if;
end $$;
