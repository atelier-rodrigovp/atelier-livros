-- RLS: cada usuário só enxerga/edita os próprios dados (owner = auth.uid()).
-- Rode DEPOIS de schema.sql.

do $$
declare t text;
begin
  foreach t in array array[
    'projects','editions','chapters','artifacts','publishing_packages',
    'jobs','sales_imports','sales_rows','worker_heartbeats'
  ] loop
    execute format('alter table %I enable row level security;', t);
    execute format('drop policy if exists owner_all on %I;', t);
    execute format($p$
      create policy owner_all on %I
        for all
        using (owner = auth.uid())
        with check (owner = auth.uid());
    $p$, t);
  end loop;
end $$;

-- OBS: o agent-worker conecta com a SERVICE_ROLE, que ignora RLS por design.
-- Por isso o worker DEVE filtrar sempre por owner nas queries e jamais ser exposto.
