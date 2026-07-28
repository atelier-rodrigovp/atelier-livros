-- Engine V2 — histórico APPEND-ONLY e RLS (fatia P).
--
-- Migração ADITIVA. NÃO aplicar remotamente sem revisão do autor.
--
-- O problema: `engine_runs`, `engine_reviews` e o estado canônico são descritos
-- como histórico de execução, mas nada no banco impedia um UPDATE ou DELETE de
-- apagá-los. "Auditável" que o próprio dono pode reescrever não é auditoria.
--
-- Separação que esta migração impõe:
--   · FATOS DE AUDITORIA (o que aconteceu) → append-only, imutáveis;
--   · PREFERÊNCIA DO USUÁRIO (o que ele quer) → mutável, em outra tabela.
-- Correção nunca reescreve o evento anterior: gera um evento NOVO que o
-- referencia.

-- ---------------------------------------------------------------------------
-- 1. Eventos de auditoria da engine
-- ---------------------------------------------------------------------------

create table if not exists public.engine_eventos_v2 (
  id           uuid primary key default gen_random_uuid(),
  owner        uuid not null references auth.users(id) on delete cascade,
  project_id   uuid not null references public.projects(id) on delete cascade,
  -- Tipo do fato. Vocabulário fechado: evento sem tipo conhecido não entra.
  tipo         text not null check (tipo in (
    'capitulo_aprovado',
    'capitulo_reprovado',
    'gate_bloqueou',
    'correcao_tentada',
    'circuit_breaker',
    'revalidacao',
    'premissa_alterada',
    'briefing_aprovado',
    'canario_aprovado',
    'fundacao_gerada',
    'autorizacao_concedida',
    'autorizacao_revogada',
    'excecao_do_autor'
  )),
  capitulo     int,
  -- Hash do texto/artefato a que o evento se refere (quando aplicável).
  text_hash    text,
  -- Corpo do fato. Nunca editado: corrigir gera outro evento.
  payload      jsonb not null default '{}'::jsonb,
  -- Evento que este corrige/substitui (a trilha fica encadeada, não sobrescrita).
  corrige_id   uuid references public.engine_eventos_v2(id),
  criado_em    timestamptz not null default now()
);

create index if not exists engine_eventos_v2_projeto on public.engine_eventos_v2 (project_id, criado_em desc);
create index if not exists engine_eventos_v2_owner on public.engine_eventos_v2 (owner);
create index if not exists engine_eventos_v2_tipo on public.engine_eventos_v2 (project_id, tipo);

alter table public.engine_eventos_v2 enable row level security;

-- Leitura: só o dono.
drop policy if exists engine_eventos_v2_select on public.engine_eventos_v2;
create policy engine_eventos_v2_select on public.engine_eventos_v2
  for select using (auth.uid() = owner);

-- Inserção: o dono do PROJETO. O worker (service role) ignora RLS e anexa direto.
drop policy if exists engine_eventos_v2_insert on public.engine_eventos_v2;
create policy engine_eventos_v2_insert on public.engine_eventos_v2
  for insert with check (
    auth.uid() = owner
    and public.engine_v2_dono_do_projeto(project_id, auth.uid())
  );

-- SEM policy de UPDATE e SEM policy de DELETE: o histórico só cresce.
-- Os triggers abaixo valem também para o service role, que ignora RLS.

create or replace function public.engine_eventos_v2_append_only()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'UPDATE' then
    raise exception
      'engine_eventos_v2 é append-only: para corrigir um evento, insira outro com corrige_id apontando para ele'
      using errcode = 'check_violation';
  end if;
  raise exception 'engine_eventos_v2 é append-only: eventos não são apagados'
    using errcode = 'check_violation';
end;
$$;

drop trigger if exists engine_eventos_v2_sem_update on public.engine_eventos_v2;
create trigger engine_eventos_v2_sem_update
  before update on public.engine_eventos_v2
  for each row execute function public.engine_eventos_v2_append_only();

drop trigger if exists engine_eventos_v2_sem_delete on public.engine_eventos_v2;
create trigger engine_eventos_v2_sem_delete
  before delete on public.engine_eventos_v2
  for each row execute function public.engine_eventos_v2_append_only();

-- ---------------------------------------------------------------------------
-- 2. Preferências do usuário — MUTÁVEIS, e por isso separadas do histórico
-- ---------------------------------------------------------------------------

create table if not exists public.engine_preferencias_v2 (
  id          uuid primary key default gen_random_uuid(),
  owner       uuid not null references auth.users(id) on delete cascade,
  project_id  uuid not null references public.projects(id) on delete cascade,
  chave       text not null,
  valor       jsonb not null default '{}'::jsonb,
  updated_at  timestamptz not null default now(),
  unique (project_id, chave)
);

alter table public.engine_preferencias_v2 enable row level security;

drop policy if exists engine_preferencias_v2_all on public.engine_preferencias_v2;
create policy engine_preferencias_v2_all on public.engine_preferencias_v2
  for all using (auth.uid() = owner)
  with check (
    auth.uid() = owner
    and public.engine_v2_dono_do_projeto(project_id, auth.uid())
  );

-- ---------------------------------------------------------------------------
-- 3. Proteção do histórico JÁ EXISTENTE (engine_runs / engine_reviews)
--
-- São registros de execução: uma vez concluídos, não mudam. `engine_runs` ainda
-- precisa de UPDATE enquanto o run está em curso (running → ok/falha), então o
-- trigger só congela o que já terminou.
-- ---------------------------------------------------------------------------

create or replace function public.engine_runs_congelar_concluido()
returns trigger
language plpgsql
as $$
begin
  if old.status in ('ok', 'falha', 'cancelado') then
    raise exception 'engine_runs: run concluído é histórico e não muda (id %)', old.id
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

do $$
begin
  if to_regclass('public.engine_runs') is not null then
    execute 'drop trigger if exists engine_runs_congelar on public.engine_runs';
    execute 'create trigger engine_runs_congelar before update on public.engine_runs
             for each row execute function public.engine_runs_congelar_concluido()';
  end if;
end;
$$;

create or replace function public.engine_reviews_imutavel()
returns trigger
language plpgsql
as $$
begin
  raise exception 'engine_reviews é histórico: um parecer não é reescrito nem apagado (id %)', old.id
    using errcode = 'check_violation';
end;
$$;

do $$
begin
  if to_regclass('public.engine_reviews') is not null then
    execute 'drop trigger if exists engine_reviews_sem_update on public.engine_reviews';
    execute 'create trigger engine_reviews_sem_update before update on public.engine_reviews
             for each row execute function public.engine_reviews_imutavel()';
    execute 'drop trigger if exists engine_reviews_sem_delete on public.engine_reviews';
    execute 'create trigger engine_reviews_sem_delete before delete on public.engine_reviews
             for each row execute function public.engine_reviews_imutavel()';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Exceção administrativa: explícita e auditada
--
-- Se algum dia for preciso remover um evento (LGPD, dado sensível gravado por
-- engano), o caminho é este: registrar a exceção ANTES, com quem e por quê. Sem
-- linha aqui, os triggers acima continuam barrando.
-- ---------------------------------------------------------------------------

create table if not exists public.engine_excecoes_admin_v2 (
  id          uuid primary key default gen_random_uuid(),
  owner       uuid not null references auth.users(id) on delete cascade,
  alvo_tabela text not null,
  alvo_id     uuid not null,
  motivo      text not null check (length(btrim(motivo)) > 0),
  autorizada_por text not null check (length(btrim(autorizada_por)) > 0),
  criada_em   timestamptz not null default now()
);

alter table public.engine_excecoes_admin_v2 enable row level security;

drop policy if exists engine_excecoes_admin_v2_select on public.engine_excecoes_admin_v2;
create policy engine_excecoes_admin_v2_select on public.engine_excecoes_admin_v2
  for select using (auth.uid() = owner);
-- Sem insert/update/delete por usuário: exceção administrativa passa por
-- migração revisada, nunca pela aplicação.
