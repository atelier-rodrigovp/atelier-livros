# Engine V2 — runbook de publicação, smoke e rollback

Este runbook só deve ser executado depois de autorização explícita do autor. O
teste final de produção pertence ao autor/Claude; canários e laboratório podem
rodar antes em persistência isolada (`--disco`).

## Pré-condições obrigatórias

1. Worktree limpo e commit a publicar identificado por SHA completo.
2. Matriz de pronto sem pendência obrigatória.
3. `npm ci`, `npm ci --prefix worker`, testes, lint, typecheck e build verdes.
4. Canários Dan Brown, Hoover/McFadden e Romantasy com 2/2 capítulos
   `aprovado` no estado canônico atual — exceção não conta.
5. As 14 amostras da calibração estão `validado_humano`, com atestação por
   sinal, SHA-256 do pacote e calibrador sem `rotulacao_pendente`.
6. Toda cota candidata passou por calibração, holdout e laboratório; nenhuma
   cota foi promovida apenas por máximo/média de amostras.
7. Laboratório cego v2 aprovado e com artefatos brutos preservados.
8. Avaliação cega humana registrada e exportada, com acerto mínimo de 80%.
9. `v2-certificar-release.ts` gerou `worker/release/engine-v2.json` e
   `v2-verificar-release.ts` aprovou no checkout que será publicado.
10. Backup lógico do banco e cópia segura do `WORK_DIR`.
11. Worker temporário encerrado; somente a instância principal conhecida pode
   processar a fila.

## Ordem de publicação

1. Aplicar `supabase/engine_v2.sql` no SQL Editor do Supabase.
2. Executar as consultas de verificação abaixo.
3. Gerar e revisar o certificado de release com os artefatos finais.
4. Fazer push da branch auditada e aguardar o check `CI / validar`, incluindo o
   gate de certificação.
5. Confirmar que o SHA aprovado no GitHub é exatamente o SHA testado localmente.
6. Atualizar ou substituir o draft PR #3; não misturar uma branch antiga.
7. Fazer merge somente após novo aval do autor.
8. Aguardar o workflow de GitHub Pages concluir no mesmo SHA.
9. Restaurar/iniciar o worker principal no checkout publicado.
10. Executar o smoke em projeto descartável.
11. Somente depois do smoke considerar migração de projeto real.

## Verificação do banco

```sql
select column_name, data_type, column_default
from information_schema.columns
where table_schema = 'public'
  and table_name = 'projects'
  and column_name = 'engine_mode';

select conname, pg_get_constraintdef(oid)
from pg_constraint
where conrelid = 'public.projects'::regclass
  and conname = 'projects_engine_mode_check';

select table_name
from information_schema.tables
where table_schema = 'public'
  and table_name in ('engine_runs', 'engine_reviews', 'engine_scene_specs', 'engine_state')
order by table_name;

select tablename, policyname
from pg_policies
where schemaname = 'public'
  and tablename in ('engine_runs', 'engine_reviews', 'engine_scene_specs', 'engine_state')
order by tablename, policyname;
```

Resultado esperado: coluna e constraint presentes; quatro tabelas presentes;
policy `owner_all` nas quatro tabelas.

## Smoke de produção em projeto descartável

1. Abrir “Novo projeto”.
2. Selecionar Engine V2 e uma skill.
3. Gerar canário de voz.
4. Confirmar na tela: texto, contrato/versão, parecer, sinais, evidências e
   veredito.
5. Testar rejeição ou ajuste; confirmar histórico persistido.
6. Aprovar somente uma amostra com veredito técnico `aprovado`.
7. Concluir entrevista e gerar fundação.
8. Confirmar no painel:
   - versão da engine e da skill;
   - fase/progresso;
   - runs e pareceres;
   - hashes;
   - estados de worker offline/pausado/throttle quando simulados.
9. Recarregar a página em cada espera e confirmar retomada sem spinner eterno.
10. Confirmar que nenhuma linha/projeto fora da conta do autor foi alterado.

## Consultas do smoke

Substitua apenas `:project_id` pelo UUID descartável.

```sql
select id, engine_mode, skill_escrita, total_capitulos
from projects
where id = :project_id;

select project_id, engine_version, versao, doc, updated_at
from engine_state
where project_id = :project_id;

select id, papel, alvo, status, attempt, skill_id, skill_version,
       input_bundle_hash, output_hash, erro, started_at, finished_at
from engine_runs
where project_id = :project_id
order by started_at;

select id, capitulo, text_hash, verdict, run_id, parecer, created_at
from engine_reviews
where project_id = :project_id
order by created_at;
```

Sinais de falha: `engine_mode` diferente de `v2`; run em hot loop; aprovação
sem `text_hash`/parecer; hash atual diferente do aprovado; UI promovendo
`aprovado_com_excecao`; meta aprovada sem piso; spinner que não se recupera.

## Rollback lógico recomendado

O rollback normal não apaga tabelas nem histórico:

```sql
update projects
set engine_mode = 'claude_code'
where id = :project_id;
```

Depois:

1. Pausar novos jobs V2.
2. Preservar `engine_state`, `engine_runs` e `engine_reviews` para auditoria.
3. Reverter o merge em novo commit e aguardar redeploy.
4. Reiniciar o worker principal no SHA anterior.
5. Confirmar heartbeat e ausência de jobs `running` órfãos.

Para uma migração V1→V2 feita por engano, sem apagar os arquivos V1:

```powershell
npx tsx worker/scripts/v2-migrar.ts <project_id> --reverter
```

Não executar o `DROP TABLE` comentado em `supabase/engine_v2.sql` como rollback
rotineiro; ele destrói trilha de auditoria e exige backup/restauração.
