-- Atelier — Autores (pseudônimos como entidades de 1ª classe). Idempotente.
-- Rode no SQL Editor do Supabase (depois de schema.sql/policies.sql).

create extension if not exists pgcrypto;

create table if not exists authors (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null default auth.uid(),
  nome text not null,
  slug text unique,
  estilo text,
  genero text,
  bio text,
  personalidade text,
  referencias text,
  avatar_path text,
  social jsonb not null default '{}',     -- instagram|x|tiktok|threads|youtube|site
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- vínculo obra -> autor (não destrói a obra se o autor sumir)
alter table projects add column if not exists author_id uuid references authors(id) on delete set null;

-- trigger updated_at (reusa a função set_updated_at criada no schema.sql)
do $$
begin
  if exists (select 1 from pg_proc where proname = 'set_updated_at') then
    drop trigger if exists trg_authors_updated on authors;
    create trigger trg_authors_updated before update on authors
      for each row execute function set_updated_at();
  end if;
end $$;

-- RLS por owner (espelha o padrão das demais tabelas)
alter table authors enable row level security;
do $$
begin
  drop policy if exists authors_select on authors;
  create policy authors_select on authors for select to authenticated using (owner = auth.uid());
  drop policy if exists authors_insert on authors;
  create policy authors_insert on authors for insert to authenticated with check (owner = auth.uid());
  drop policy if exists authors_update on authors;
  create policy authors_update on authors for update to authenticated using (owner = auth.uid());
  drop policy if exists authors_delete on authors;
  create policy authors_delete on authors for delete to authenticated using (owner = auth.uid());
end $$;

-- Realtime (idempotente)
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'authors'
    ) then
      alter publication supabase_realtime add table authors;
    end if;
  end if;
end $$;
