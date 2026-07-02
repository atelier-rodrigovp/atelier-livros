# Prompt para o Claude Code — status do worker: uma fonte única de verdade (acabar com o conflito)

Você roda na minha máquina, repositório `ATELIER-LIVROS`. Faça de forma autônoma. Ao final: `npm run build` limpo, testes ok, `git commit` + `git push`; valide com Playwright (senha `<SENHA_DO_APP>`) com screenshot de Configurações. Não exponha segredos. Sem DDL/credencial nova.

## Problema
A tela de Configurações mostra infos que parecem se contradizer: o topo diz **"Produzindo · último sinal <hoje>"** (heartbeat fresco) e o painel "Trabalhando agora" mostra cap 27/32; mas a lista **Atividade** mostra o MESMO job de escrita como **"Executando"** com data de ontem (o `created_at` do job). O usuário não consegue saber se está realmente rodando. Causa: a UI mistura três sinais (heartbeat vivo, status do job, e timestamps) sem reconciliá-los, e usa a hora de início do job como se fosse "agora".

## Princípio: derivar TUDO de uma função pura única
Crie em `src/lib/status.ts` uma função pura testável, ex. `estadoWorker({ heartbeat, jobAtivo, now })`, que retorna **um** estado canônico usado pelo badge do topo, pelo painel "Trabalhando agora" e pela linha da Atividade — para nunca divergirem. Use estes sinais:
- **Heartbeat:** `worker_heartbeats.last_seen` (vivo se < ~90s) e `worker_heartbeats.status.estado` (o worker já grava `online|idle|busy|paused` e, quando em job, `status.job` + `status.tipo`).
- **Job ativo:** o job cujo `id === heartbeat.status.job` (preferir isso a "o `escrever_livro` mais recente"); seus campos `progresso` (`cap_atual/total`, `fase`, `palavras`), `updated_at`, `status`, `locked_at`.

Estados canônicos:
- **Produzindo** (verde, pulsante): heartbeat fresco **e** `estado === 'busy'` **e** o job correspondente teve `progresso`/`updated_at` movido recentemente.
- **Ocioso** (neutro): heartbeat fresco, `estado` `online|idle`, sem job ativo. (worker vivo, nada na fila)
- **Pausado** (âmbar): heartbeat fresco e `enabled === false` (`worker_control`).
- **Travado / sem avanço** (âmbar, alerta): heartbeat fresco e `estado==='busy'`, **mas** o `progresso/updated_at` do job não muda há > N min (ex.: 8). Mensagem: "worker vivo, mas a tarefa não avança há X min — pode estar travada (ou em pausa de limite de plano)".
- **Parado** (cinza): sem heartbeat fresco. Jobs `running` aqui = **Interrompido** (não "Executando").

## UI — reconciliar as três áreas
1. **Painel "Trabalhando agora":** além de obra + `cap X/Y · fase`, mostre **"atualizado há <Xs/Xmin>"** (de `job.updated_at` ou do `progresso`), e **"iniciado em <data/hora>"** (de `created_at`) — separando claramente início de "agora". Auto-atualize via realtime/poll a cada ~15–20s (o canal de jobs já existe). Se o estado for "Travado/sem avanço", mostre o alerta + botão **Reenfileirar**.
2. **Badge do topo:** use o estado canônico (Produzindo/Ocioso/Pausado/Travado/Parado) — não derive de `online && enabled` apenas.
3. **Atividade:** para cada linha, NÃO mostre "Executando" cru. Mostre o status reconciliado: se é o job ativo e está avançando → "Em andamento · atualizado há X"; se `running` mas worker parado/idle → "Interrompido"; concluídos como hoje. **A hora exibida deve ser o `updated_at` (última atividade), NÃO o `created_at`** — hoje a lista mostra a data de criação do job, que fica "presa" no passado (ex.: 25/06 17:10) mesmo depois de reenfileirar ou de avançar capítulos, parecendo desatualizada. Mostre `updated_at` como "atualizado há X / às HH:MM" e, se útil, o `created_at` só com rótulo "iniciado em …". **A lista deve atualizar ao vivo** (assine o realtime de `jobs` / refaça o fetch ao requeue) para o status e a hora mudarem na hora — sem o usuário recarregar a página.

## Garantir que os sinais são reais (worker)
Confirme em `worker/src/index.ts`/`jobs.ts` que, durante `escrever_livro`, o worker:
- emite heartbeat `estado:'busy'` com `job` e `tipo` (e mantém o keepalive); e
- **atualiza `progresso.cap_atual` (e `updated_at` do job) a cada capítulo concluído** — para que "atualizado há X" e o avanço do contador sejam verdade. Se hoje só grava no fim, passe a gravar incrementalmente por capítulo.

## Aceite (screenshot Playwright + teste)
- [ ] `estadoWorker(...)` pura e testada (casos: produzindo, ocioso, pausado, travado, parado/interrompido).
- [ ] Badge do topo, "Trabalhando agora" e Atividade SEMPRE concordam (sem infos conflitantes).
- [ ] "Trabalhando agora" mostra "iniciado em …" e "atualizado há …", auto-atualiza, e sinaliza "sem avanço há X min" quando aplicável (com Reenfileirar).
- [ ] Atividade não mostra "Executando" cru; job longo de escrita aparece como "Em andamento · atualizado há X" quando vivo, "Interrompido" quando o worker não está ativo nele.
- [ ] `npm run build` limpo, testes ok, commit + push, bundle novo servindo.

## Limites
- Sem DDL/credencial nova (usa `worker_heartbeats.status`, `jobs.progresso/updated_at/locked_at`, `worker_control`).
- Não invente "Produzindo" quando o job não avança. Sem libs novas pesadas; não exponha segredos.
