-- Engine V2 — autorização por projeto (fatia M / defeito D4).
--
-- Migração ADITIVA: nenhuma tabela existente é alterada, nada é removido, a V1
-- não é tocada. NÃO aplicar remotamente sem revisão do autor.
--
-- Por que existe: a lista de projetos autorizados vivia HARDCODED em
-- `worker/src/v2/release.ts`. Consequência prática: o autor não conseguia rodar
-- um livro seu sem editar o código-fonte. Autorização é DADO, não código.
--
-- Regra que esta tabela sustenta:
--   - sem certificado de release válido, nenhum projeto de PRODUÇÃO executa;
--   - com certificado válido, cada projeto AINDA exige uma linha aqui;
--   - `modo='canario'` cobre APENAS a operação de canário — nunca fundação,
--     escrita de livro ou avaliação (ver EXIGEM_CERTIFICADO em release.ts).

create table if not exists public.engine_autorizacoes_v2 (
  id             uuid primary key default gen_random_uuid(),
  owner          uuid not null references auth.users(id) on delete cascade,
  project_id     uuid not null references public.projects(id) on delete cascade,
  modo           text not null check (modo in ('producao', 'canario')),
  -- Quem autorizou e por quê (auditoria; nunca em branco).
  autorizado_por text not null check (length(btrim(autorizado_por)) > 0),
  motivo         text not null check (length(btrim(motivo)) > 0),
  ativo          boolean not null default true,
  created_at     timestamptz not null default now(),
  revoked_at     timestamptz,
  -- Coerência do par (ativo, revoked_at): ativo nunca tem revogação, e revogado
  -- sempre tem. Sem isto, "revogar" poderia deixar a linha num estado ambíguo.
  constraint engine_autorizacoes_v2_revogacao_coerente
    check ((ativo and revoked_at is null) or (not ativo and revoked_at is not null))
);

-- Um projeto tem no máximo uma autorização ATIVA.
create unique index if not exists engine_autorizacoes_v2_projeto_ativo
  on public.engine_autorizacoes_v2 (project_id)
  where ativo;

create index if not exists engine_autorizacoes_v2_owner on public.engine_autorizacoes_v2 (owner);

alter table public.engine_autorizacoes_v2 enable row level security;

-- ---------------------------------------------------------------------------
-- D4.1 — o `owner` da autorização tem de ser o DONO DO PROJETO.
-- Sem isto, um usuário autenticado poderia inserir `owner = auth.uid()`
-- apontando para o project_id de outra pessoa e autorizar a obra alheia.
-- ---------------------------------------------------------------------------
create or replace function public.engine_v2_dono_do_projeto(p_project uuid, p_owner uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.projects p
    where p.id = p_project and p.owner = p_owner
  );
$$;

drop policy if exists engine_autorizacoes_v2_select on public.engine_autorizacoes_v2;
create policy engine_autorizacoes_v2_select on public.engine_autorizacoes_v2
  for select using (auth.uid() = owner);

drop policy if exists engine_autorizacoes_v2_insert on public.engine_autorizacoes_v2;
create policy engine_autorizacoes_v2_insert on public.engine_autorizacoes_v2
  for insert with check (
    auth.uid() = owner
    and public.engine_v2_dono_do_projeto(project_id, auth.uid())
    -- Nasce ATIVA: inserir uma linha já revogada só sujaria a trilha.
    and ativo
    and revoked_at is null
  );

-- ---------------------------------------------------------------------------
-- D4.2 — REVOGAR sem REESCREVER. O update só pode virar ativo=false e carimbar
-- revoked_at; todo campo histórico (quem autorizou, por quê, em que modo, para
-- que projeto, quando) permanece IMUTÁVEL. Um trigger garante isso mesmo para
-- quem escreve pelo service role, que ignora RLS.
-- ---------------------------------------------------------------------------
drop policy if exists engine_autorizacoes_v2_revogar on public.engine_autorizacoes_v2;
create policy engine_autorizacoes_v2_revogar on public.engine_autorizacoes_v2
  for update using (auth.uid() = owner and ativo)
  with check (auth.uid() = owner and not ativo and revoked_at is not null);

create or replace function public.engine_autorizacoes_v2_imutavel()
returns trigger
language plpgsql
as $$
begin
  -- Campos históricos: qualquer alteração é rejeitada, venha de onde vier.
  if new.id            is distinct from old.id
     or new.owner          is distinct from old.owner
     or new.project_id     is distinct from old.project_id
     or new.modo           is distinct from old.modo
     or new.autorizado_por is distinct from old.autorizado_por
     or new.motivo         is distinct from old.motivo
     or new.created_at     is distinct from old.created_at then
    raise exception
      'engine_autorizacoes_v2: campos históricos são imutáveis (revogue e crie uma autorização nova)'
      using errcode = 'check_violation';
  end if;
  -- A única transição permitida é ativa → revogada.
  if old.ativo = false then
    raise exception 'engine_autorizacoes_v2: autorização já revogada não muda mais'
      using errcode = 'check_violation';
  end if;
  if new.ativo = true then
    raise exception 'engine_autorizacoes_v2: o único update permitido é a revogação (ativo=false)'
      using errcode = 'check_violation';
  end if;
  if new.revoked_at is null then
    new.revoked_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists engine_autorizacoes_v2_imutavel on public.engine_autorizacoes_v2;
create trigger engine_autorizacoes_v2_imutavel
  before update on public.engine_autorizacoes_v2
  for each row execute function public.engine_autorizacoes_v2_imutavel();

-- D4.3 — sem policy de DELETE e com trigger que barra remoção: autorização
-- concedida não é apagada, é revogada. (O service role ignora RLS, mas não
-- ignora trigger.)
create or replace function public.engine_autorizacoes_v2_sem_delete()
returns trigger
language plpgsql
as $$
begin
  raise exception 'engine_autorizacoes_v2: histórico não é apagado — revogue (ativo=false)'
    using errcode = 'check_violation';
end;
$$;

drop trigger if exists engine_autorizacoes_v2_sem_delete on public.engine_autorizacoes_v2;
create trigger engine_autorizacoes_v2_sem_delete
  before delete on public.engine_autorizacoes_v2
  for each row execute function public.engine_autorizacoes_v2_sem_delete();

-- ---------------------------------------------------------------------------
-- SEED — os quatro canários que estavam hardcoded em release.ts, migrados para
-- dado. Rode UMA vez, substituindo <OWNER_USER_ID> pelo seu uuid.
-- A obra real (53abdade-…) NÃO entra: decisão do autor, mantida.
-- Note o modo: 'canario' NÃO autoriza escrever livro — só a amostra de canário.
-- ---------------------------------------------------------------------------
-- insert into public.engine_autorizacoes_v2 (owner, project_id, modo, autorizado_por, motivo)
-- values
--   ('<OWNER_USER_ID>', '8b11072c-097d-4964-8f89-abecb96eb16c', 'canario', 'rodrigo', 'Canário V2 — O Cofre de Alcobaça (dan-brown)'),
--   ('<OWNER_USER_ID>', 'aa8af83f-b2a1-41e0-ac0b-e46e620ee5c7', 'canario', 'rodrigo', 'Canário V2 — Tudo o que não te contei (hoover-mcfadden)'),
--   ('<OWNER_USER_ID>', '5f59a08b-5947-46ab-9547-76bd31e74e5f', 'canario', 'rodrigo', 'Canário V2 — A Corte do Sal (romantasy)'),
--   ('<OWNER_USER_ID>', '5ac9d614-1d1c-4fbd-8376-a731d1945ac6', 'canario', 'rodrigo', 'Canário V2 — Prova O Farol Cego (dan-brown)')
-- on conflict do nothing;
