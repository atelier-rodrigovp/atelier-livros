-- Políticas de Storage (RLS em storage.objects) — download/listagem por owner.
-- Convenção de caminho: "<owner_uid>/<project_id>/..." (a 1ª pasta é o uid do dono).
-- O worker (service_role) ignora RLS ao subir; estas políticas liberam o front
-- (anon+JWT) a assinar/baixar SOMENTE os próprios arquivos. Rode após schema/policies.
-- Idempotente.

do $$
declare b text;
begin
  foreach b in array array['manuscritos','epubs','capas','pacotes'] loop
    -- SELECT (necessário para createSignedUrl/download e list)
    execute format('drop policy if exists %I on storage.objects;', 'owner_read_' || b);
    execute format($p$
      create policy %I on storage.objects
        for select to authenticated
        using (bucket_id = %L and (storage.foldername(name))[1] = auth.uid()::text);
    $p$, 'owner_read_' || b, b);

    -- INSERT/UPDATE/DELETE pelo dono (o worker usa service_role e ignora isto,
    -- mas mantém o front coerente caso suba algo no futuro).
    execute format('drop policy if exists %I on storage.objects;', 'owner_write_' || b);
    execute format($p$
      create policy %I on storage.objects
        for insert to authenticated
        with check (bucket_id = %L and (storage.foldername(name))[1] = auth.uid()::text);
    $p$, 'owner_write_' || b, b);

    execute format('drop policy if exists %I on storage.objects;', 'owner_modify_' || b);
    execute format($p$
      create policy %I on storage.objects
        for update to authenticated
        using (bucket_id = %L and (storage.foldername(name))[1] = auth.uid()::text);
    $p$, 'owner_modify_' || b, b);

    execute format('drop policy if exists %I on storage.objects;', 'owner_delete_' || b);
    execute format($p$
      create policy %I on storage.objects
        for delete to authenticated
        using (bucket_id = %L and (storage.foldername(name))[1] = auth.uid()::text);
    $p$, 'owner_delete_' || b, b);
  end loop;
end $$;
