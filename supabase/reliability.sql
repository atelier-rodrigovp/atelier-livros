-- Primitivas de confiabilidade do worker. Aplicar manualmente após revisão.
-- Nenhuma rotina deste arquivo é executada automaticamente pelo repositório.

create or replace function public.claim_job(
  p_job_id uuid,
  p_owner uuid,
  p_worker text
) returns setof public.jobs
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_project uuid;
begin
  select project_id into v_project
  from public.jobs
  where id = p_job_id and owner = p_owner and status = 'queued';

  if not found then return; end if;

  -- Serializa claims do mesmo projeto mesmo quando são jobs diferentes e workers
  -- diferentes. Jobs sem projeto usam o próprio id como chave.
  perform pg_advisory_xact_lock(hashtext(coalesce(v_project::text, p_job_id::text)));

  if v_project is not null and exists (
    select 1 from public.jobs
    where owner = p_owner and project_id = v_project and status = 'running'
  ) then
    return;
  end if;

  return query
  update public.jobs
  set status = 'running', locked_by = p_worker, locked_at = now()
  where id = p_job_id and owner = p_owner and status = 'queued'
  returning *;
end;
$$;

comment on function public.claim_job(uuid, uuid, text) is
  'Claim atomico com exclusao distribuida por projeto; nao possui fallback inseguro no worker.';

-- A migração falha de modo visível se já houver duplicatas; não apaga dados
-- automaticamente. Audite e resolva duplicatas antes de reaplicar.
create unique index if not exists artifacts_identity_uidx
  on public.artifacts (edition_id, tipo, storage_path);

create or replace function public.promote_publication(
  p_owner uuid,
  p_project_id uuid,
  p_edition_id uuid,
  p_manifest jsonb,
  p_chapters jsonb,
  p_artifacts jsonb
) returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  c jsonb;
  a jsonb;
begin
  if not exists (
    select 1 from public.editions
    where id = p_edition_id and project_id = p_project_id and owner = p_owner
  ) then raise exception 'edition fora do owner/project'; end if;

  for c in select * from jsonb_array_elements(p_chapters) loop
    insert into public.chapters(owner, edition_id, numero, titulo, palavras, storage_path)
    values (p_owner, p_edition_id, (c->>'numero')::int, c->>'titulo',
            coalesce((c->>'palavras')::int, 0), c->>'storage_path')
    on conflict (edition_id, numero) do update set
      titulo = excluded.titulo, palavras = excluded.palavras,
      storage_path = excluded.storage_path;
  end loop;

  for a in select * from jsonb_array_elements(p_artifacts) loop
    insert into public.artifacts(owner, edition_id, tipo, storage_path, meta)
    values (p_owner, p_edition_id, a->>'tipo', a->>'storage_path',
            coalesce(a->'meta', '{}'::jsonb) || jsonb_build_object('publication_manifest', p_manifest))
    on conflict (edition_id, tipo, storage_path) do update set meta = excluded.meta;
  end loop;

  update public.editions set status = 'pronto', updated_at = now()
  where id = p_edition_id and owner = p_owner;
  update public.projects set status = 'pronto', updated_at = now()
  where id = p_project_id and owner = p_owner;
  return jsonb_build_object('ok', true, 'manifest_id', p_manifest->>'id');
end;
$$;

comment on function public.promote_publication(uuid, uuid, uuid, jsonb, jsonb, jsonb) is
  'Promove capitulos, artefatos e status numa unica transacao apos staging no Storage.';
