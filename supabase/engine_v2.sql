-- ============================================================================
-- ENGINE V2 — estado canônico (idempotente; seguro re-executar)
-- Aplicar no SQL Editor do dashboard Supabase (worker não aplica DDL).
-- Padrão idêntico à migração 0001-engine-hosted (aplicada 2026-07-13):
-- colunas reais só para chaves de consulta/constraint; miolo em jsonb; RLS owner_all.
-- ============================================================================

-- 1) engine_runs — ledger append-only de execuções (toda chamada de papel é um run)
create table if not exists public.engine_runs (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null default auth.uid(),
  project_id uuid references public.projects(id) on delete cascade,
  edition_id uuid references public.editions(id) on delete set null,
  job_id uuid references public.jobs(id) on delete set null,
  parent_run_id uuid references public.engine_runs(id) on delete set null,
  engine_version text not null,
  skill_id text,
  skill_version text,
  foundation_version text,
  papel text not null,                       -- model_role: arquiteto_cena|contextualizador|escritor|revisor_literario|auditor_factual|editor_estrutural|arquiteto_enredo
  capacidade text,                           -- classe: raciocinio|fatos|prosa|julgamento
  model_provider text,
  model_name text,
  alvo text,                                 -- ex.: 'capitulo:12' | 'spec:12' | 'fundacao' | 'canario:abertura'
  input_bundle_hash text,
  output_hash text,
  status text not null default 'running',    -- running|ok|falha|cancelado
  attempt int not null default 1,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  tokens_in int,
  tokens_out int,
  evidencias jsonb not null default '[]',    -- [{tipo, caminho|referencia, hash, detalhe}]
  erro jsonb,                                -- {codigo, mensagem, classe, detalhe} — nunca stack cru sem classe
  payload jsonb not null default '{}',       -- metadados adicionais (nunca segredo, nunca manuscrito)
  created_at timestamptz not null default now()
);
create index if not exists engine_runs_proj_idx on public.engine_runs (project_id, started_at desc);
create index if not exists engine_runs_job_idx on public.engine_runs (job_id);
create index if not exists engine_runs_alvo_idx on public.engine_runs (project_id, alvo);

-- 2) engine_reviews — parecer estruturado do revisor, hash-bound ao texto avaliado
create table if not exists public.engine_reviews (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null default auth.uid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  edition_id uuid references public.editions(id) on delete cascade,
  run_id uuid references public.engine_runs(id) on delete set null,
  capitulo int,                              -- null = parecer de livro/fundação
  text_hash text not null,                   -- sha256 do texto exato avaliado
  verdict text not null,                     -- aprovado|aprovado_com_excecao|reprovado|necessita_decisao_humana
  parecer jsonb not null,                    -- {dramatic_progression, skill_adherence, clarity, emotional_effect, continuity, hook_effectiveness, evidencias[], sinais[{sinal,valor,disposicao,evidencia}], correcoes[]}
  created_at timestamptz not null default now()
);
create index if not exists engine_reviews_cap_idx on public.engine_reviews (project_id, capitulo, created_at desc);

-- 3) engine_scene_specs — fichas estruturadas de cena (sem prosa), versionadas
create table if not exists public.engine_scene_specs (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null default auth.uid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  edition_id uuid references public.editions(id) on delete cascade,
  capitulo int not null,
  versao int not null default 1,
  hash text not null,                        -- sha256 da ficha canônica
  status text not null default 'rascunho',   -- rascunho|validada|rejeitada|substituida
  ficha jsonb not null,                      -- schema scene-spec/v1 (validado no worker)
  origem_run_id uuid references public.engine_runs(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (project_id, capitulo, versao)
);

-- 4) engine_state — snapshot canônico por projeto (o worker é o único escritor)
create table if not exists public.engine_state (
  project_id uuid primary key references public.projects(id) on delete cascade,
  owner uuid not null default auth.uid(),
  engine_version text not null,
  versao int not null default 1,             -- incrementa a cada gravação (optimistic lock)
  doc jsonb not null default '{}',           -- {fase, skill:{id,versao,hash}, fundacao:{versao,hash}, capitulos:{"1":{status,text_hash,spec_versao,review_id,aprovacao}}, bloqueios[], migracao:{origem,relatorio}}
  updated_at timestamptz not null default now()
);

-- RLS owner_all (mesmo padrão de policies.sql / 0001)
do $$
declare t text;
begin
  foreach t in array array['engine_runs','engine_reviews','engine_scene_specs','engine_state'] loop
    execute format('alter table public.%I enable row level security', t);
    if not exists (
      select 1 from pg_policies where schemaname = 'public' and tablename = t and policyname = 'owner_all'
    ) then
      execute format(
        'create policy owner_all on public.%I for all using (owner = auth.uid()) with check (owner = auth.uid())', t
      );
    end if;
  end loop;
end $$;

-- updated_at automático no snapshot
create or replace function public.engine_state_touch()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;
drop trigger if exists engine_state_touch on public.engine_state;
create trigger engine_state_touch before update on public.engine_state
  for each row execute function public.engine_state_touch();

-- Realtime só para o snapshot (a UI observa fase/bloqueios; runs são consultados sob demanda)
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'engine_state'
  ) then
    execute 'alter publication supabase_realtime add table public.engine_state';
  end if;
end $$;

-- ============================================================================
-- ROLLBACK LÓGICO (não executar junto; guardado para auditoria):
-- drop table if exists public.engine_reviews, public.engine_scene_specs cascade;
-- drop table if exists public.engine_runs cascade;
-- drop table if exists public.engine_state cascade;
-- ============================================================================
