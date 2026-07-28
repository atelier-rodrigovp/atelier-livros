-- Engine V2 — autorização por projeto (fatia M).
--
-- Migração ADITIVA: nenhuma tabela existente é alterada, nada é removido, a V1
-- não é tocada.
--
-- Por que existe: a lista de projetos autorizados a rodar a Engine V2 vivia
-- HARDCODED em `worker/src/v2/release.ts` (PROJETOS_CANARIO_V2). Consequência
-- prática: o autor não conseguia rodar um livro seu sem editar o código-fonte e
-- reiniciar o worker. Autorização é DADO, não código.
--
-- Regra que esta tabela sustenta:
--   - sem certificado de release válido, nenhum projeto de PRODUÇÃO executa;
--   - com certificado válido, cada projeto AINDA exige uma linha aqui;
--   - autorização não substitui certificado — a única exceção é o modo
--     'canario', que é explícito, auditado e existe porque é o canário que
--     produz a evidência que o certificado exige (ovo-e-galinha do fail-closed).

create table if not exists public.engine_autorizacoes_v2 (
  id            uuid primary key default gen_random_uuid(),
  owner         uuid not null references auth.users(id) on delete cascade,
  project_id    uuid not null references public.projects(id) on delete cascade,
  -- 'producao' exige certificado de release válido; 'canario' o substitui.
  modo          text not null check (modo in ('producao', 'canario')),
  -- Quem autorizou e por quê (auditoria; nunca em branco).
  autorizado_por text not null,
  motivo        text not null,
  ativo         boolean not null default true,
  created_at    timestamptz not null default now(),
  revoked_at    timestamptz
);

-- Um projeto tem no máximo uma autorização ATIVA.
create unique index if not exists engine_autorizacoes_v2_projeto_ativo
  on public.engine_autorizacoes_v2 (project_id)
  where ativo;

create index if not exists engine_autorizacoes_v2_owner on public.engine_autorizacoes_v2 (owner);

alter table public.engine_autorizacoes_v2 enable row level security;

-- O dono lê e concede as próprias autorizações (a UI precisa disso).
drop policy if exists engine_autorizacoes_v2_select on public.engine_autorizacoes_v2;
create policy engine_autorizacoes_v2_select on public.engine_autorizacoes_v2
  for select using (auth.uid() = owner);

drop policy if exists engine_autorizacoes_v2_insert on public.engine_autorizacoes_v2;
create policy engine_autorizacoes_v2_insert on public.engine_autorizacoes_v2
  for insert with check (auth.uid() = owner);

-- REVOGAR é permitido; reescrever a autorização (mudar modo/motivo/quem
-- autorizou) NÃO é — a trilha de quem liberou o que continua íntegra.
drop policy if exists engine_autorizacoes_v2_revogar on public.engine_autorizacoes_v2;
create policy engine_autorizacoes_v2_revogar on public.engine_autorizacoes_v2
  for update using (auth.uid() = owner)
  with check (
    auth.uid() = owner
    and ativo = false
    and revoked_at is not null
  );

-- Sem policy de DELETE: autorização concedida não é apagada, é revogada.

-- ---------------------------------------------------------------------------
-- SEED — os quatro canários que estavam hardcoded em release.ts, migrados para
-- dado. Rode UMA vez, substituindo <OWNER_USER_ID> pelo seu uuid.
-- A obra real (53abdade-…) NÃO entra: decisão do autor, mantida.
-- ---------------------------------------------------------------------------
-- insert into public.engine_autorizacoes_v2 (owner, project_id, modo, autorizado_por, motivo)
-- values
--   ('<OWNER_USER_ID>', '8b11072c-097d-4964-8f89-abecb96eb16c', 'canario', 'rodrigo', 'Canário V2 — O Cofre de Alcobaça (dan-brown)'),
--   ('<OWNER_USER_ID>', 'aa8af83f-b2a1-41e0-ac0b-e46e620ee5c7', 'canario', 'rodrigo', 'Canário V2 — Tudo o que não te contei (hoover-mcfadden)'),
--   ('<OWNER_USER_ID>', '5f59a08b-5947-46ab-9547-76bd31e74e5f', 'canario', 'rodrigo', 'Canário V2 — A Corte do Sal (romantasy)'),
--   ('<OWNER_USER_ID>', '5ac9d614-1d1c-4fbd-8376-a731d1945ac6', 'canario', 'rodrigo', 'Canário V2 — Prova O Farol Cego (dan-brown)')
-- on conflict do nothing;
