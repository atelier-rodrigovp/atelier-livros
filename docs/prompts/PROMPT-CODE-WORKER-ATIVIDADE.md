# Prompt para o Claude Code — Configurações: mostrar EM QUAL livro o worker está trabalhando

Você roda na minha máquina, repositório `ATELIER-LIVROS`. Faça de forma autônoma. Ao final: `npm run build` limpo, testes ok, `git commit` + `git push`, e valide no navegador com Playwright (senha `<SENHA_DO_APP>`) com screenshot da tela de Configurações. Não exponha segredos.

## Problema
Na seção **Atividade** (Configurações), cada job mostra só o tipo (`escrever_livro`, `gerar_capas`…) + hora + status. Não dá pra saber **qual projeto/livro** o worker está processando. Pior: há um `escrever_livro` preso em **"Executando"** desde 23/06 enquanto o worker está offline — é um **job órfão** (o worker caiu segurando o lock) e a UI não deixa isso claro.

## O que implementar (em `src/pages/Configuracoes.tsx` + helpers de status)

### 1) "Trabalhando agora" — no bloco do Worker
Quando houver um job `running` (e o worker **online** pelo heartbeat), mostre, com destaque, **em qual obra** ele está:
- Título do projeto (+ série/Vol. N se houver) — resolva `jobs.project_id → projects` (e autor via `briefing.autor` se disponível). Link para `/projeto/:id`.
- Tipo amigável da tarefa (ver mapa abaixo) e, para escrita, o **progresso** lido de `jobs.progresso`: `cap_atual/total`, `fase`, `palavras`, `nota` quando existirem (ex.: "Escrevendo · cap 7/32 · fase REVISÃO").
- Barra de progresso fina quando `total` existir.
Se não houver job ativo, mostre "Worker ocioso" (quando online) — sem inventar atividade.

### 2) Job órfão / lock obsoleto
Um job com `status='running'` mas com o **worker offline** (heartbeat velho) ou `locked_at` antigo (> ~5 min sem heartbeat) **não está rodando**. Nesses casos:
- Não exiba "Executando" verde/animado. Rotule como **"Interrompido"** (âmbar) com tooltip: "O worker caiu durante esta tarefa. Religue o worker para retomar." Use `worker_heartbeats.last_seen` e/ou `jobs.locked_at`/`updated_at` para decidir.
- Adicione (se trivial) um botão discreto **"Reenfileirar"** nesse job órfão, que volta o status para `queued` e limpa `locked_by/locked_at` (update via supabase do front, sob RLS do owner). Sem isso, ao menos deixe claro que ele está parado.

### 3) Lista "Atividade" enriquecida
Para cada linha de job, mostre: **tipo amigável** + **nome do projeto** (resolvido por `project_id`; "—" se nulo, ex. `ping`) + hora + status. Linha clicável vai para `/projeto/:id` quando houver. Mantenha o filtro que já exclui `controle_escrita`.

Mapa de tipos → rótulo: `escrever_livro`→"Escrita", `gerar_capa`/`gerar_capas`→"Capas", `gerar_epub`→"EPUB", `traduzir`→"Tradução", `avaliar`→"Avaliação", `revisar`→"Revisão", `gerar_post_social`→"Post social", `criar_fundacao`/`refinar_fundacao`→"Fundação", `criar_volumes`→"Volumes da saga", `gerar_pacote`→"Pacote KDP", `importar_vendas`→"Vendas", `ping`→"Teste".

### 4) Dados
- Carregue `jobs` (com `project_id`, `progresso`, `status`, `locked_at`, `updated_at`, `tipo`, `created_at`) e um mapa `projects(id → titulo, serie, volume, briefing)`; resolva o autor por `briefing.autor`. Use realtime (já há canal de jobs) para "Trabalhando agora" atualizar ao vivo.
- Reaproveite o helper de "worker online" (heartbeat < 2 min) já existente em `src/lib/status.ts`; se útil, adicione uma função pura `jobAtivoReal({status, workerOnline, lockedAt, now})` testável, e cubra com teste.

## Aceite (screenshot Playwright)
- [ ] Bloco do Worker mostra "Trabalhando agora: <Título> (Vol. N) · cap X/Y · fase" quando há escrita ativa e worker online; "ocioso" quando online sem job.
- [ ] Job `running` com worker offline aparece como **Interrompido** (não "Executando"), com explicação; (idealmente) botão "Reenfileirar".
- [ ] Lista Atividade mostra o nome do projeto por job e linka para ele.
- [ ] `jobAtivoReal` testado; `npm run build` limpo; commit + push; bundle novo servindo.

## Limites
- Sem DDL/credencial nova (usa tabelas/colunas existentes: `jobs.project_id`, `jobs.progresso`, `jobs.locked_at`, `worker_heartbeats`).
- Não invente atividade quando o worker está offline. Sem libs novas pesadas; não exponha segredos.
