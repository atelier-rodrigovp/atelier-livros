# Aplicar `supabase/reliability.sql` — passo a passo (pendente de autor)

A auditoria NÃO tem via DDL (sem CLI, sem connection string, dashboard exige
login — regra: não contornar). Estado ANTES já comprovado em 2026-07-12:

- probe real: 2º insert de job `queued` idêntico foi **ACEITO**
  (`efa54ce3-d198-4561-a4d9-b83beccf4b2c`) ⇒ índice de dedupe ausente;
- `claim_job`/`promote_publication` existem (o harness da auditoria claimou
  jobs via RPC com sucesso) — as versões novas do arquivo os substituem.

## 1) Snapshot ANTES (cole o resultado em `docs/audits/pre-sql-snapshot.sql`)

No SQL Editor (https://supabase.com/dashboard/project/dzgbatsecbkjmucmigjv/sql/new):

```sql
select indexname, indexdef from pg_indexes
 where schemaname='public' and tablename in ('jobs','artifacts','editions')
 order by indexname;

select t.tgname, pg_get_triggerdef(t.oid) as def
  from pg_trigger t join pg_class c on c.oid = t.tgrelid
 where c.relname = 'editions' and not t.tgisinternal;

select p.proname, pg_get_functiondef(p.oid) as def
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname='public'
   and p.proname in ('claim_job','promote_publication','guard_edition_pronto');
```

## 2) Aplicar

Cole o conteúdo COMPLETO de `supabase/reliability.sql` (na ordem do arquivo —
o `promote_publication` novo, com `set_config`, vem antes do trigger-guarda) e
execute. Pré-condição do índice: zero duplicatas `queued` por
(owner, project_id, tipo) — verificar antes:

```sql
select owner, project_id, tipo, count(*) from public.jobs
 where status='queued' and project_id is not null
 group by 1,2,3 having count(*) > 1;
```

## 3) Verificar (positivo)

```sql
select indexname from pg_indexes
 where schemaname='public' and indexname in
 ('jobs_one_queued_per_project_tipo_uidx','artifacts_identity_uidx');

select tgname, tgenabled from pg_trigger t join pg_class c on c.oid=t.tgrelid
 where c.relname='editions' and tgname='editions_guard_pronto';
```

## 4) Testes negativos (comprovação real)

No SQL Editor (registro efêmero, com rollback):

```sql
begin;
  insert into public.editions (owner, project_id, idioma, is_origem, status)
  select owner, id, 'xx-TESTE', false, 'pendente' from public.projects limit 1
  returning id;  -- anote o id
  -- deve FALHAR com "editions.status=pronto so pode ser gravado pela promocao transacional"
  update public.editions set status='pronto' where idioma='xx-TESTE';
rollback;
```

Dedupe (pode ser pelo SQL Editor ou re-rodando o probe da auditoria a partir
do repositório — ele mesmo limpa):

```
node <scratchpad>/probe-dedupe.mjs worker/.env
# esperado DEPOIS: "insert 2 (duplicado): REJEITADO: duplicate key value violates
# unique constraint \"jobs_one_queued_per_project_tipo_uidx\""
```

## 5) Colar as evidências

Colar os resultados de 1, 3 e 4 neste diretório (`docs/audits/`) e marcar o
item como PROVADO no NEW-PROJECT-COMPLETION-AUDIT.md.
