-- Atelier — Posts de rede social (rascunhos na voz do autor). Idempotente.
-- Rode no SQL Editor do Supabase (depois de authors.sql).

create extension if not exists pgcrypto;

create table if not exists social_posts (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null default auth.uid(),
  author_id uuid references authors(id) on delete cascade,
  project_id uuid references projects(id) on delete set null,
  rede text not null,                       -- instagram|x|tiktok|threads|youtube|site
  objetivo text,
  tema text,
  conteudo text,
  variantes jsonb not null default '[]',    -- alternativas geradas
  hashtags text[],
  status text not null default 'rascunho',  -- rascunho|aprovado|arquivado
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists social_posts_author_idx on social_posts (author_id, created_at desc);

-- trigger updated_at (reusa set_updated_at do schema.sql)
do $$
begin
  if exists (select 1 from pg_proc where proname = 'set_updated_at') then
    drop trigger if exists trg_social_posts_updated on social_posts;
    create trigger trg_social_posts_updated before update on social_posts
      for each row execute function set_updated_at();
  end if;
end $$;

-- RLS por owner
alter table social_posts enable row level security;
do $$
begin
  drop policy if exists social_posts_select on social_posts;
  create policy social_posts_select on social_posts for select to authenticated using (owner = auth.uid());
  drop policy if exists social_posts_insert on social_posts;
  create policy social_posts_insert on social_posts for insert to authenticated with check (owner = auth.uid());
  drop policy if exists social_posts_update on social_posts;
  create policy social_posts_update on social_posts for update to authenticated using (owner = auth.uid());
  drop policy if exists social_posts_delete on social_posts;
  create policy social_posts_delete on social_posts for delete to authenticated using (owner = auth.uid());
end $$;

-- Realtime (idempotente)
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'social_posts'
    ) then
      alter publication supabase_realtime add table social_posts;
    end if;
  end if;
end $$;
