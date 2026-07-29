# Estado de execução — correção e certificação da Engine V2

**Objetivo ativo até a Definition of Done do prompt mestre.** Se a execução for
interrompida, retomar daqui SEM perguntar nada.

SHA inicial da sessão: `34b2cea`. Branch: `master`. **Nunca fazer push sem
autorização explícita; nunca aplicar SQL remoto; nunca gerar canário; nunca
chamar modelo de prosa; nunca escrever capítulo.**

## Fila de custo por capítulo (rodada 2026-07-29)

SHA de partida: `2cc31c3`.

**Ação obrigatória cumprida:** autorização `67d19ea0` revogada pelo caminho
previsto (único UPDATE que a policy permite; o trigger carimbou `revoked_at`
sozinho). Fail-closed confirmado: `v2-materializar-documentos` volta a recusar.

| item | estado |
|---|---|
| 1. normalização determinística | **CONCLUÍDO** — `normalizarParecerBruto` ligada ao `parse` do revisor |
| 2. citação por índice | **CONCLUÍDO** — formato aditivo + hidratação na gravação |
| 3. timeouts por papel | **CONCLUÍDO** — `EXECUCAO_POR_PAPEL` |
| 4. esforço por papel | **CONCLUÍDO** — `--effort` por papel, fail-closed no aviso do CLI |
| 5. cascata de julgamento | não iniciado |
| 6. pins de modelo | não iniciado |

### Fatias 3+4 — esforço e timeout como propriedade do papel

`EXECUCAO_POR_PAPEL` (em `tipos.ts`, ao lado de `CLASSE_POR_PAPEL`) declara os
10 papéis. Os dois `timeoutMs: 900000` soltos em `fundacao.ts` sumiram — a
exceção virou tabela.

CLI instalado: **2.1.220 (Claude Code)**. Flag: `--effort <low|medium|high|xhigh|max>`.

**Fail-closed no esforço.** O CLI responde `Unknown --effort value 'x' — ignoring
it` e SEGUE rodando. `conferirEsforcoAplicado` transforma isso em erro do run
(`PROVEDOR_CONFIGURACAO`), e trata separadamente o CLI antigo que não conhece a
flag, nomeando a versão instalada. Sem isso, a engine rodaria no padrão
acreditando estar em `high` — mesma família do Storage que devolvia string vazia
para falha e para conteúdo vazio.

**Registro no run** (aditivo, sem DDL): `evidencias` passa a levar
`esforco_solicitado` e `cli_versao` ao lado de `modelo_executado`.

#### Como o timeout foi dimensionado (leitura corrigida)

Minha primeira leitura usou o p95 e estava errada: o p95 do `arquiteto_enredo`
(1106 s) está contaminado por um run que mede o TIMEOUT, não o trabalho.

| run | status | duração | tokens_out |
|---|---|---|---|
| `889f9fc9` | falha | 1621 s | **null** |
| `56d7cad7` | **ok** | **333 s** | **30.706** |
| `09b70cc7` | ok | 54 s | 4.514 |

`889f9fc9` estourou aos 300 s e teve `finished_at` carimbado 27 minutos depois
(09:32:05 → 09:59:05). Não houve 1621 s de trabalho: houve carimbo tardio. Com
9 runs, esse artefato sozinho levou o p95 a 1106 s.

**Regra corrigida, e escrita no código:** dimensionar pela maior execução
BEM-SUCEDIDA, com margem ~3×, piso de 120 s, DESCARTANDO durações de runs que
falharam por timeout. Para `arquiteto_enredo`: maior sucesso real 333 s → ~1000 s
→ os **1200 s** da tabela se sustentam. Timeout **mantido em 1200 s**; não foi
aumentado para cobrir os 1621 s, que não são trabalho.

### Fatia 6a — cascata de julgamento (triagem barata, decisão cara)

Um papel novo, `revisor_decisao`, faz a SEGUNDA passada e emite um **delta** —
não um parecer novo. É daí que vem a economia: ele não reescreve os seis eixos
nem as evidências, escreve só o que muda. Núcleo em `worker/src/v2/cascata.ts`.

**A armadilha, e como ficou fechada.** Se o modelo caro só visse as violações
que a triagem confirmou, ele só poderia DERRUBAR — a cascata viraria máquina de
leniência e a régua desceria sem ninguém ter decidido descê-la. Por isso o
gatilho (b) sobe justamente o caso em que a triagem não confirmou nada, e o
delta tem `acrescentar` com a MESMA exigência de índice do resto do sistema.

**Quatro gatilhos, com a emenda (d) do autor:**

| | quando escala | o que a decisão pode fazer |
|---|---|---|
| (a) | triagem confirmou violação | derrubar falso positivo |
| (b) | triagem descartou sinal com valor ≥ 3 | acrescentar o que ela não viu |
| (c) | triagem pediu decisão humana | decidir |
| (d) | a triagem vai FECHAR o capítulo | julgar os seis eixos |

`DESCARTE_QUE_PESA = 3` não é limiar de detector: não muda o que conta como
defeito, só quando um segundo par de olhos é chamado. Os 47 pareceres gravados
são bimodais — 15 descartam sinal com valor ≥3 (média de 7,6 ocorrências
declaradas falso positivo) e ZERO descartam com valor 1–2. Não há faixa
intermediária para o número cortar arbitrariamente.

**Taxa de escalada recontada COM (d), como o autor pediu: 38/47 = 81 %.**
14 por violação confirmada, 15 por descarte grande, o resto por fechamento.
Os 9 que não escalam são reprovados intermediários sem sinal, que vão ser
corrigidos de qualquer forma. A taxa é alta e isso é aceitável pelo próprio
argumento da spec: **a economia vem do delta, não da raridade** — a segunda
passada lê o parecer pronto e escreve poucas linhas, em vez de produzir os seis
eixos do zero.

**Emenda 2 — a decisão NÃO derruba gate universal.** `veredito_sugerido` é
sugestão. A cascata roda depois da triagem e ANTES dos gates; contradição
factual comprovada, POV violado, conhecimento indevido e gate de idioma reprovam
por cima, independentemente do delta. Teste negativo em
`cascata-pipeline.test.ts`: delta sugerindo `aprovado` com contradição
bloqueante presente → o capítulo continua reprovado, e o motivo registrado é a
contradição, não a opinião da decisão.

**Emenda 3 — `MODELO_POR_PAPEL` é CONJUNTO FECHADO**, com justificativa escrita
por exceção e um teste que afirma o conjunto exato: acrescentar uma quarta
exceção sem justificar quebra o teste de propósito. O congelamento e o erro em
`V2_MODEL_*` divergente seguem intactos.

**O consolidado passa pela MESMA validação da triagem** (`validarParecer` →
`exigirDisposicaoCompleta` → `conferirParecer`). Não existe segundo caminho de
validação, e a régua (`sinais.ts`, os três `contrato.json`) não foi tocada —
`git diff` vazio nesses arquivos, conferido antes do commit.

**Custo colateral, dito por inteiro:** a cascata mudou a sequência de chamadas de
todo teste de pipeline. Quatro asserções de contagem exata foram atualizadas
porque a contagem mudou de verdade (10 → 11 papéis; 7 → 8 runs no caminho
feliz), e o `ProvedorMock` ganhou resposta automática para `revisor_decisao`
seguindo a disciplina que já existia ali: delta VAZIO, com o veredito lido do
parecer da triagem que o próprio prompt carrega — não é opinião do mock, e a
fila enfileirada sempre vence.

### Fatia 6b — pins de modelo e a versão do código no arranque

**Pins.** `raciocinio` sobe de sonnet para **opus**: são `arquiteto_enredo`,
`arquiteto_cena` e `editor_estrutural`, e erro de arquitetura de cena não se
conserta com revisão de frase — reescreve o capítulo. `fatos` fica em haiku
como PISO, para quem só seleciona contexto já escrito (`contextualizador`); os
dois papéis de fatos que erram caro, `auditor_factual` e `extrator_memoria`,
sobem para sonnet por `MODELO_POR_PAPEL`. `julgamento` fica em sonnet na
triagem, com a segunda passada cara vindo pela cascata.

O mecanismo de congelamento fez o que existe para fazer: o teste do pin quebrou
sozinho quando o valor mudou, e foi atualizado **deliberadamente**, com o motivo
escrito ao lado. O erro em `V2_MODEL_*` divergente segue intacto — ambiente não
troca modelo sem código novo.

**Consequência formal, dita por inteiro:** mudar pin invalida calibração,
canários e certificação anteriores, conforme o comentário que já estava em
`config.ts`. Nenhum canário existia para invalidar (`CANARIOS_NOVOS` segue
`BLOQUEADOS_AGUARDANDO_AUTOR`), mas a régua vale e está registrada aqui.

**A versão do código no arranque — o que faltava para fechar A2.**
`worker/src/versao-codigo.ts` carimba, uma vez, no arranque: SHA do HEAD,
`sujo` (arquivos do worker modificados por cima) e `iniciadoEm`. Vai no log e em
todo heartbeat (`worker_heartbeats.status.codigo`). É lido UMA vez de propósito:
interessa o código com que o processo SUBIU — editar arquivo com o worker no ar
não troca o que está em execução.

`sujo` é dado de primeira classe, não nota de rodapé: SHA com arquivo modificado
por cima **parece** dado e não é, e foi esse buraco que deixou A2 sem causa raiz.

**O worker que está no ar NÃO tem este código — e agora isso está datado.**

| | |
|---|---|
| processo | PID 18188, `node --import tsx src\index.ts` |
| subiu em | **28/07/2026 16:57:49** (local) |
| último commit antes disso | `055f33b` (28/07 16:55) |
| estado no heartbeat | `paused`, sem campo `codigo` — confirma código pré-6b |

Ou seja: o processo no ar não tem NENHUMA das seis fatias, nem os quatro commits
de 28/07 18:20 em diante. **Commit não é produção.** Religar o worker com o
código novo é ação de produção e fica com o autor — não foi feito aqui.

### Fatia 6c — regressão inteira, e a projeção de custo COMO projeção

**Regressão local, tudo verde** (`npm run prontidao`, 172,8 s):

| | |
|---|---|
| suíte da raiz (inclui interface) | 1621 passaram, 0 falharam, 0 pulados |
| suíte a partir de `worker/` | 1415 passaram, 0 falharam, 0 pulados |
| typecheck raiz / worker | sem erros |
| build de produção | concluído |
| lint | 0 erros, 3 avisos (pré-existentes, react-refresh) |
| SQL/RLS local | 80 passaram |
| ciclo determinístico com ProvedorMock | 22 passaram |
| **DoD por execução** | **51/51 garantias locais** (1 externa fora do alcance local) |

O inventário passou de 47 para **52 garantias**: a fila de custo criou a fatia
**R** (R-01 a R-05 — acrescentar na cascata, gate universal por cima do delta,
conjunto fechado de exceções, SHA no arranque, worktree suja declarada).

**Quatro evidências externas EXPIRARAM, e isso é o mecanismo funcionando.**
`MIGRACOES_REMOTAS`, `INTEGRACAO_REAL`, `UI_AUTENTICADA` e `PROVEDOR_REAL`
voltaram a `[FALHA] fingerprints.worker_hash mudou desde a verificação`. Seis
fatias mexeram no código do worker; evidência colhida contra o código antigo não
vale para o novo. **D7-02, que estava comprovado, está expirado** e precisa ser
refeito depois que o código assentar.

#### A projeção de custo é PROJEÇÃO — e não fecha em 50 %

Linha de base lida do banco, só runs `status='ok'` (não de memória):

| papel | runs | média tokens_out |
|---|---:|---:|
| `revisor_literario` | 150 | **24.522** |
| `arquiteto_enredo` | 4 | 10.291 |
| `escritor` | 162 | 6.984 |
| `auditor_factual` | 127 | 5.891 |
| `arquiteto_cena` | 59 | 4.954 |
| `contextualizador` | 66 | 2.951 |
| `editor_estrutural` | 3 | 829 |

Capítulo limpo ≈ **45.300 tokens de saída**, e o revisor sozinho é **54 %** deles.
É por isso que a fila inteira aponta para ele. (`conformidade_ficha`,
`extrator_memoria` e `julgamento_idioma` não têm run nenhum — papéis novos,
nunca executados em produção. A média deles é desconhecida, não zero.)

**O que a fila faz com esse número, em projeção:**

| fatia | direção | efeito projetado |
|---|---|---|
| 1 — normalizar antes de reprovar | ↓ | poupa um run INTEIRO do revisor (24,5 k) quando o formato falha. Frequência não medida. |
| 2 — evidência por índice | ↓ | encurta a saída do revisor. **Teto registrado:** se os campos `evidencia` continuarem longos, a economia para antes dos 30 %. |
| 3+4 — esforço por papel | ↓ | `low` nos papéis baratos corta tokens de raciocínio. Não medido. |
| 6a — cascata | ↑ ~3 % | a 2ª passada escreve um delta (centenas de tokens), não um parecer (24,5 k). **Não é economia: é o jeito barato de comprar um segundo julgamento que antes não existia.** |
| 6b — pins | ↑ | ~11 k dos 45 k por capítulo sobem de faixa (`arquiteto_cena` e `editor_estrutural` sonnet→opus; `auditor_factual` haiku→sonnet). Deliberado: é o teto de julgamento subindo. |

**Conclusão honesta: não há projeção de metade.** Três fatias empurram para
baixo, duas empurram para cima de propósito, e nenhuma das duas direções foi
medida. Dizer "reduzimos 50 %" aqui seria inventar.

**O que falta para virar MEDIÇÃO:** rodar capítulo com o provedor real e comparar
`engine_runs.tokens_out` por papel contra a tabela acima, com o mesmo projeto e a
mesma skill. É uma comparação de duas linhas de SQL — e depende de escrever
capítulo, que está proibido. Enquanto isso, o número acima é projeção, não
resultado.

### Religamento do worker, e o carimbo virando bloqueio

**O worker foi religado e o codigo novo esta comprovadamente no ar.**

| | |
|---|---|
| processo antigo | PID 18188, subiu 28/07 16:57:49, codigo `055f33b` |
| processo novo | subiu 29/07 15:34:49 UTC, codigo **`1546906`** |
| log de arranque | `codigo: 1546906 (worktree limpa)` |
| heartbeat | `status.codigo.sha = 15469063e39f...`, `sujo=false` |

Religado pelo proprio `worker-wrapper.cmd` (que ja roda
`node --import tsx src\index.ts` a partir de `worker/`, identico ao
`npm run start`), preservando supervisor, rotacao de log e disjuntor. Efeito
colateral registrado: o wrapper conta `kill` como falha, entao o contador de
falhas consecutivas ficou em **3/10** — ele zera sozinho na primeira saida
limpa, e o disjuntor so abre em 10.

#### O carimbo agora BLOQUEIA

`compararVersaoWorker` (`src/lib/versaoWorker.ts`) e pura e atende aos dois
consumidores. Quatro estados, nenhum verde por omissao:

| veredicto | bloqueia | quando |
|---|---|---|
| `igual` | nao | mesmo SHA, worktree limpa |
| `divergente` | **sim** | `worker roda codigo de <sha>, repositorio esta em <sha>` |
| `suja` | **sim** | mesmo SHA, mas com arquivo modificado por cima |
| `sem_carimbo` | **sim** | worker anterior a 6b, ou dado ausente |

`npm run prontidao` ganhou a secao **CÓDIGO EM EXECUÇÃO**, lendo o heartbeat.
Worker offline vira *nao comprovado*, nunca bloqueio: se nada esta no ar, nada
produz com codigo velho. Divergencia entra em `bloqueios_producao` como
`CODIGO_DO_WORKER`.

A interface compara o carimbo com o commit de que ela **mesma** foi construida
(injetado por `vite.config.ts`). Sem git no build, a tela diz que nao sabe.

**Os dois casos foram provados ao vivo, nao so em teste:**

1. commit `1546906` com o worker ainda em `aae0b83` →
   `[FALHA] worker roda código de aae0b83, repositório está em 1546906`,
   e `CODIGO_DO_WORKER` entrou nos bloqueios de producao;
2. worker religado → `[OK] worker roda o código do repositório (1546906)`,
   e o bloqueio saiu da lista.

Consequencia que fica: **todo commit desincroniza o worker ate o reinicio**, e
agora isso aparece como bloqueio em vez de silencio.

#### O que acontece se `worker_control.enabled` voltar a `true`

Nao mexi — segue `false` desde 29/07 10:58:45 UTC.

**Resposta curta: nada roda.** Ha **zero** jobs em `queued` (16 `paused`, 10
`error`, 91 `done`, 1 `canceled`), e o picker so reivindica `queued`.

O unico caminho `paused` → `queued` e a reconciliacao legada, que roda **so no
arranque** e em modo `audit`. Com `enabled=true` ela ja rodou em 28/07 e o
veredito esta no log: **`elegiveis=0`** — 5 `project_manually_paused`, 4
`outside_allowlist`.

**O certificado ausente barra os projetos V2, sim — mas a autorizacao barra
antes.** Ordem das recusas em `release.ts`: autorizacao → certificado.

- Certificado: **ausente** (`worker/release/engine-v2.json` nao existe), mais 14
  amostras aguardando rotulagem humana.
- Autorizacao ativa: **uma so** — `Prova V2 — O Farol Cego` (5ac9d614), modo
  `producao`, com **zero** jobs ativos.

| projeto V2 com job parado | onde para | mensagem |
|---|---|---|
| O Índice dos Abduzidos, Canário V2 (×2) | autorizacao | `PROJETO_V2_NAO_AUTORIZADO`: "projeto <id> não tem autorização ativa para a Engine V2. Autorize-o na tela do projeto (ou insira uma linha em engine_autorizacoes_v2). Autorização não substitui certificado: um projeto de produção também exige release certificado." |
| Prova V2 — O Farol Cego | certificado | `RELEASE_V2_NAO_CERTIFICADA`: "Engine V2 bloqueada para fundação/escrita: certificado não encontrado em ...\workerelease\engine-v2.json · calibração: dan-brown: 4 amostra(s) aguardam validação humana · ..." |

**Achado aberto na tela:** `acaoParaBloqueio` (`src/lib/painelEditorial.ts`) mapeia
`PROJETO_V2_NAO_AUTORIZADO` para o botao "Autorizar projeto", mas
`RELEASE_V2_NAO_CERTIFICADA` **nao casa com nenhum padrao** — o bloqueio de
certificado chega a tela sem acao dirigida. Nao corrigido aqui.

### Fatia 5 — A1 fechado, A2 com parecer

**A1 — medição confiável. FECHADO.**

- `duracao_chamada_ms` passa a ser medida no **spawn** (relógio nas duas pontas,
  nos três caminhos de saída: fim normal, timeout e erro) e gravada em
  `evidencias`, aditivo, sem DDL. `finished_at` continua existindo, mas deixou
  de ser a fonte da medição.
- `falharRun` já carimbava o fim no catch; provado por teste que timeout e erro
  de infra carimbam na hora, sem espera pendurada.
- **11 runs órfãos encerrados** (não 1): 6 do revisor, e um de cada em auditor,
  contextualizador, arquiteto_cena, escritor e arquiteto_enredo. O mais antigo
  estava preso havia 196 h. `select count(*) where status='running'` → **0**.
- Fronteira do imutável confirmada CONTRA O BANCO antes e depois: o trigger
  `engine_runs_congelar` recusa `update` quando o status anterior é ok/falha/
  cancelado. O reconciliador só age sobre `running`, e um segundo update no
  `de568246` já reconciliado foi BARRADO pelo banco na prova.

Comando: `npx tsx scripts/v2-reconciliar-runs.ts [--confirmar]`. Roda por
comando, nunca em background.

**A2 — parecer em `docs/engine-v2/08-parecer-troca-de-modelo.md`.**

Ocorrência **única** em 2.037 runs. O modelo intruso é exatamente o `haiku` que
o comentário do provedor já atribui a tráfego interno do CLI, e a mitigação
(`CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC`, commit `84af5a1`) precede o run em
3 horas. Hipótese mais consistente: o worker ainda rodava o código anterior —
**não provada**, porque não há marca de restart datada em lugar nenhum.

Recomendação: prosseguir com os pins na fatia 6, mantendo
`exigirModeloExecutado` intocado e confirmando antes que o worker roda o código
atual. Segunda ocorrência depois de restart confirmado derruba a hipótese.

**Aberto (novo):** não existe registro de versão do código no start do worker.
Foi exatamente o que impediu fechar o A2, e é barato de criar.

**Dívida explícita:** regressão completa segue reservada para a fatia 6. Aqui
rodou a suíte inteira do worker: 103 arquivos, 1367 testes, zero pulados.

### Fatia 2 — evidência por índice (emenda do autor aplicada)

O modelo escreve `{"indice":3}`; o SISTEMA grava `{"indice":3,"trecho":"…"}`.
A emenda fecha um buraco que a spec original não via: `engine_reviews` guarda
`parecer` e `text_hash`, e NÃO guarda a medição — índice sozinho no arquivo é
ponteiro solto, reconstruível só remedindo com a versão de `sinais.ts` daquele
dia. `hidratarOcorrenciasCitadas` roda no mesmo ciclo, com o mesmo array de
medição da validação, como último passo do `parse` (pipeline.ts:673).

Formato ADITIVO: nenhuma linha de `engine_reviews` foi reescrita. Os três
pareceres reais lidos do banco (`5e7ce9bb`, `19094920`, `678abadb`) validam com
o schema novo — 3/3.

Rigor: a conferência por texto é aproximada (aspas, separador, prefixo de 60
chars). Por índice é igualdade de inteiro contra o intervalo medido, sem
tolerância. Item misto exige que índice e trecho apontem a MESMA ocorrência.

**Teto da estimativa (registrado a pedido do autor):** a economia é na saída do
revisor, trocando transcrição por inteiro. Se os campos `evidencia` continuarem
longos, a economia **para antes dos 30%** — o texto do parecer passa a ser
dominado por justificativa, não por citação. Se a queda medida vier bem abaixo
de 30%, a próxima investigação começa em `evidencia`, não no índice.

**Dívida explícita:** a regressão completa (`npm test` raiz e worker, `tsc`,
`build`, `lint`, `npm run prontidao`) fica para a fatia 6, por decisão do autor.
Nesta fatia rodou o escopo tocado: 101 testes (revisor, índice, normalização,
pipeline, cotas, sinais) e 1554 na raiz.

### Linha de base relida do banco (não de memória)

```sql
select papel, count(*), round(avg(tokens_out)), round(avg(extract(epoch from (finished_at-started_at)))),
       count(*) filter (where status='falha')
from public.engine_runs where engine_version='2.0.0' and model_name like 'claude-%' group by papel;
```

Confere com o enunciado. Falhas medidas: revisor 26/71, arquiteto_enredo 5/10,
escritor 21/75. Classes de falha do revisor: **36 de formato** (FORA_DO_SCHEMA)
contra 19 de infra — confirma o fato 2.

### Bloqueio a decidir (item 1, parte 2)

A DoD pede canonizar `"dentro_da_cota"` para `"conforme"`. **`"conforme"` não
existe no enum** (`Disposicao` = violacao_confirmada | excecao_valida |
falso_positivo | necessita_decisao_humana), e `tarefas.ts:139` diz ao modelo, com
todas as letras, que `"conforme"/"ok"/"dentro_da_cota"` invalidam o parecer.
Criar esse valor seria afrouxar o protocolo, não normalizá-lo.

Implementado no lugar, sem perder rigor: entrada rotulada "dentro da cota" é
**descartada** quando o detector também diz que o sinal está na cota (o protocolo
manda não listar sinal em cota — a linha não devia existir); e **continua
inválida** quando o sinal está FORA da cota, porque aí o modelo contradiz a
medição, e isso é julgamento, não formato.

## Ordem de trabalho

### Defeitos da revisão (antes das fatias abertas)
- [x] D1. `npm run prontidao` não pode emitir IMPLEMENTACAO_APROVADA com fatia/garantia obrigatória ausente
- [x] D2. Escada executa estratégias realmente diferentes (cirúrgica/orientada/reficha/integral/julgamento)
- [x] D3. `modo=canario` não contorna certificado para fundação nem escrita geral
- [x] D4. SQL/RLS: owner do projeto, campos históricos imutáveis, revogação sem reescrita
- [x] D5. Encadeamento real: `max_novos_caps=1` não produz falso `done`; retoma até fechamento/Meta9
- [x] D6. Cruzamento macro × micro por campos estruturados (plantio, reforço, pagamento, fios, clímax, marcos, atos, tensão)
- [x] D7-01 (local). Documentos V2: materialização, caminho canônico, índice, hash e consumo pela interface
- [x] D7-02 (externo, **COMPROVADO** 2026-07-28). Upload no Storage real e download em sessão autenticada, com hash conferido nas duas pontas

### Fatias abertas do plano original
- [x] E — entrevista determinística e aprovação do briefing
- [x] G — conformidade ficha → prosa
- [x] H — memória derivada da prosa e promessas cruzadas
- [x] I — repetição literal, semântica e maneirismos globais
- [x] J — revisor, auditor e idioma
- [x] K — revalidação transitiva e Meta9
- [x] L — canário como snapshot e invalidação (fixtures; NÃO gerar canário)
- [x] O — interface editorial completa
- [x] P — histórico append-only e RLS

## Estados formais exigidos na entrega

```
implementacao_local  IMPLEMENTACAO_LOCAL_APROVADA
regressao_local      REGRESSAO_LOCAL_APROVADA
integracao_mock      INTEGRACAO_MOCK_APROVADA
acuracia             ACURACIA_AGUARDANDO_ROTULAGEM
migracoes_remotas    MIGRACOES_REMOTAS_COMPROVADAS
integracao_real      INTEGRACAO_REAL_APROVADA
ui_autenticada       UI_AUTENTICADA_APROVADA
provedor_real        PROVEDOR_REAL_APROVADO
release_producao     RELEASE_PRODUCAO_BLOQUEADO: CALIBRACAO_HUMANA
canarios_novos       BLOQUEADOS_AGUARDANDO_AUTOR
prova_literaria      PROVA_LITERARIA_NAO_EXECUTADA
```

## Próxima tarefa

**A DoD NÃO está completa.** A parte local está verde; a parte externa (D7-02,
migrações, integração real, download autenticado, provedor) permanece não
comprovada, e a calibração humana não começou. "DoD local aprovada" e "sistema
pronto" são coisas diferentes — foi exatamente essa confusão que o modelo de
estados separados passou a impedir.

Os defeitos D1–D6, o D7-01 e as fatias B–Q estão fechados e comprovados por
`INVENTARIO_DOD` (46 garantias). Não existe fatia "A" no plano: a numeração das
fatias começa em B (`1af5d44`, ledger de revelações), e nenhum commit ou
documento do repositório define uma fatia A. Redação anterior deste arquivo dizia
"A–Q" — era imprecisa, não havia trabalho faltando.

### Como a DoD é comprovada (correção final do D1)

A conferência **não** olha mais se o arquivo de teste existe — isso deixava a
garantia evaporar por dentro do arquivo sem que nada acusasse. Cada garantia tem
um **ID estável** (`B-01`, `D6-01`, `Q-02`…), o teste que a prova declara esse ID
no título (`[DOD:<id>]`), e `dod-conferencia.ts` lê o **resultado da execução**:

- ID inventariado sem nenhum teste declarando → REPROVA;
- ID cujo teste está `skip`/`todo` → REPROVA (não conta como aprovado);
- ID cujo teste falhou → REPROVA;
- ID duplicado no inventário → REPROVA;
- ID declarado num teste e ausente do inventário → REPROVA.

Uma garantia pode ser provada por vários testes (o cruzamento macro × micro,
`D6-01`, tem oito); nesse caso **todos** precisam rodar e passar. Os meta-testes
de `dod-conferencia.test.ts` provam cada um desses modos de reprovação.

A regressão completa continua rodando e não foi substituída: a conferência por ID
é evidência **adicional**.

### Auditoria bullet a bullet (fase 2, segunda passada)

A matriz abaixo foi montada por amostragem na primeira passada. Estes cinco
bullets não tinham verificação individual e agora têm:

| bullet | onde decide | teste | estado |
|---|---|---|---|
| saída incompleta de papel não vira aprovação | `parseProsa`, `validarSaidaContextualizador`, `validarSaidaAuditor`, `validarParecer`, `validarParecerConformidade`, `validarParecerIdioma`, `validarExtracaoProsa` | `saida-papel.test.ts` (18) | ok — 7 papéis, cada um com caso negativo próprio |
| modelo, contrato, hash e versão registrados | `papeis.ts#executarPapel` → `iniciarRun` | `papeis.test.ts` (5 novos) | ok |
| worker fail-closed sem tabela/migration | `release.ts#tabelaAutorizacaoAusente` | `release-allowlist.test.ts` (6 novos) | ok — inclui os casos que NÃO são tabela ausente |
| nenhuma chave administrativa no front | `src/lib/supabase.ts` (anon) | `segurancaFront.test.ts` (7) | ok — varredura permanente de `src/` |
| erro de Storage não vira sucesso visual | `storage.ts#downloadText` | `storage.test.ts` (5) | **defeito corrigido** — devolvia `""` para falha e para vazio |
| erro de Supabase/auth não vira sucesso visual | `autorizacaoV2.ts#interpretarAutorizacao` | `autorizacaoV2.test.ts` (13) | ok |
| toda ação anunciada é executável | `resolveOperationalState.ts` (`IdAcao`) | `EstadoOperacional.test.tsx` (46) | ok — 11 cenários, exaustivo |

### O que a prova de D7-02 NÃO prova

A materialização foi feita por `v2-materializar-documentos.ts`, um script de
custo zero que reconstrói a fundação a partir dos documentos já em disco. Isso
prova o CAMINHO (`documentosDaFundacao` → `chaveStorage` → Storage → download
autenticado com hash conferido), não prova que **`criar_fundacao` sobe os
documentos sozinho numa rodada real**.

A distinção é concreta: a fundação deste projeto foi gerada por código ANTERIOR
ao D7 — o estado persistido não tem `indice` nem `storage_falhas`, e o Storage
estava vazio de documentos V2. O código atual (`materializarFundacao`) faz o
upload, mas isso nunca foi observado numa execução de ponta a ponta.

**Continua NÃO COMPROVADO** e não deve ser marcado como fechado.

### Matriz de fiação (auditoria da fase 2)

| garantia | produtor | consumidor | decisão | persistência | interface | teste | estado |
|---|---|---|---|---|---|---|---|
| briefing sem default | wizard | `autorizarFundacao` | não gera fundação | `briefing_aprovado` + hash | lacunas na tela | E-01..03 | local ok |
| fundação íntegra | `arquiteto_enredo` | `avaliarFundacaoV2` | bloqueia escrita | `engine_state` | banner próprio | F-01..03, D6-01 | local ok |
| macro × micro | fundação 2 passadas | `portao-fundacao` | reprova fundação | `engine_state` | banner | D6-01 | local ok |
| contrato da skill | `contrato.json` | `carregarContrato` (runtime) | cotas e pisos | hash no pacote | — | cotas-vivas | local ok |
| POV violado | `auditor_factual` | `pipeline` etapa 6 | reprova capítulo | `engine_reviews` | blocker humano | B-01 | local ok |
| conformidade ficha→prosa | `conformidade_ficha` | `conferirConformidade` | reprova capítulo | `engine_reviews` | evidência | G-01..02 | local ok |
| idioma/variante | `julgamento_idioma` | `decidirIdioma` | reprova capítulo | `engine_reviews` | blocker | J-03 | local ok |
| pisos do revisor | `revisor_literario` | `conferirParecer` | impede aprovação | `engine_reviews` | nota | J-01..02 | local ok |
| promessa não paga | fichas + prosa | `avaliarFechamentoLivro` | bloqueia fechamento | `engine_state` | promessas abertas | B-02, H-01 | local ok |
| revelação repetida | ledger | `gateRevelacaoRepetida` | reprova ficha | ledger | painel | I-02 | local ok |
| repetição literal/maneirismo | detectores | gate/sinal | reprova ou sinaliza | `engine_state` | painel | I-01, I-03, I-04 | local ok |
| memória da prosa | `extrator_memoria` | ledger | exige payoff | `memoria_prosa` | painel | H-01..02 | local ok |
| revalidação transitiva | grafo de dependência | `revalidarVizinhanca` | reabre dependentes | `engine_state` | afetados | K-01..03 | local ok |
| escada de correção | `correcao.ts` | worker | muda estratégia | `correcao-ledger.json` | tentativas | C-01..02, D2-01..02 | local ok |
| histórico append-only | worker | triggers do banco | recusa update/delete | `engine_eventos_v2` | — | P-01..02 | **comprovado no banco real**: update e delete BARRADOS |
| RLS e owner | migration | Postgres | isola por dono | políticas | — | D4-01 | **comprovado**: 4 tabelas, 7 policies, 7 triggers, RLS em todas |
| certificado × autorização | `release.ts` | todo ponto de entrada | fail-closed | `engine_autorizacoes_v2` | — | M-01..03, D3-01 | local ok |
| documentos V2 (contrato) | `documentosDaFundacao` | índice + tela | caminho e hash | índice | lista de docs | D7-01 | local ok |
| documentos V2 (real) | `v2-materializar-documentos` | Supabase Storage | upload e download | Storage | download | D7-02 | **comprovado**: 5 artefatos, hash idêntico disco → Storage → navegador |
| desvio V1/V2 | `executarJobRoteado` | log | rota declarada | log | badge da engine | roteamento.test | local ok |

DoD local executada em 2026-07-28 sobre o HEAD `74db809` (capturado pelo próprio
`prontidao` com `git rev-parse HEAD`, fail-closed — sem fallback textual):

| verificação | resultado |
|---|---|
| testes da raiz (inclui interface) | 112 arquivos, 1427 passaram, **0 pulados** |
| testes do worker | 98 arquivos, 1275 passaram, **0 pulados** |
| typecheck raiz (`tsc -b`) | limpo |
| typecheck worker (`tsc --noEmit`) | limpo — **agora cobre `scripts/`** |
| build (`tsc -b && vite build`) | ok |
| lint (`eslint .`) | 0 erros, 3 avisos pré-existentes de `react-refresh` |
| SQL/RLS isolados | 74 passaram |
| interface — lógica (`src/lib`) | 127 passaram |
| interface — componentes **renderizados** (`src/components`) | 17 passaram |
| interface — páginas/rotas (`src/pages`) | 8 passaram |
| interface — smoke de navegador | **não existe nesta fase** |
| ciclo com `ProvedorMock` | 4 + 28 passaram |
| `npm run prontidao -- --ciclo` | 0 bloqueios, 9 não comprovados |

O typecheck do worker incluía apenas `src`: o próprio comando de prontidão nunca
foi verificado. Ao incluir `scripts/`, apareceram um regex quebrado no coletor e
dois erros latentes em `v2-canario.ts` — entre eles, o arquiteto do canário
rodando **sem o idioma declarado**, logo depois de a fatia J criar um gate de
idioma. Corrigidos.

Garantias: **47 inventariadas · 46 locais · 46 encontradas · 46 executadas · 46
aprovadas**. Zero duplicadas, zero órfãs, zero arquivos ausentes, zero falhas de
coleta, zero testes DOD pulados. A única externa é `D7-02`.

Os 3 `it.skip` de `transparencia.test.ts` deixaram de existir: dois escondiam
comportamento que já funcionava; o terceiro virou `LIMITACOES_RECALL` (REC-03) e
bloqueia formalmente a acurácia.

## O que ainda depende de ação externa

Estes cinco itens bloqueiam `RELEASE_PRODUCAO` e o relatório os lista TODOS de
uma vez — reportar só o primeiro fazia o autor descobrir o seguinte na rodada
seguinte.

1. **CALIBRACAO_HUMANA** — rotular as 14 amostras já exportadas em
   `calibracao-humana/rotulos-pendentes.csv`. Só o autor fecha. Também é o que
   destrava REC-03.
2. **MIGRACOES_REMOTAS** — aplicar `supabase/engine_v2_autorizacoes.sql` e
   `supabase/engine_v2_historico.sql`. Ambas aditivas: todo `drop` é
   `drop policy/trigger if exists` seguido de recriação; nenhum `drop table`,
   nenhum `alter column`.
3. **INTEGRACAO_REAL** — fluxo real interface → worker → Storage com download e
   hash conferidos.
4. **DOWNLOAD_AUTENTICADO** — sessão autenticada abrindo os documentos V2
   (garantia `D7-02`).
5. **PROVEDOR_REAL** — smoke do provedor, sem escrita literária.

Cada um vira um documento em `.evidencias/` (fora do Git) vinculado ao commit e aos
hashes do que estava valendo. Ausente = NÃO COMPROVADO, que não é zero nem
sucesso. Push continua dependendo de autorização.

## Checkpoint do goal persistente — 2026-07-29

Estado reconciliado diretamente contra Git, Supabase, processo do worker, GitHub
Actions e `npm run prontidao -- --ciclo`:

- branch publicada: `codex/pre-canary-ready`;
- código testado: `d022df48fb5356b822ba83ec3b599d415c6cb132`;
- worker reiniciado e carimbando esse SHA, com `sujo=false`;
- worker globalmente pausado (`worker_control.enabled=false`);
- `origin/master` permanece em `2cc31c3`; a interface publicada permanece em
  `fcb2517`;
- `supabase/engine_v2_fluxo.sql` foi aplicada no projeto
  `dzgbatsecbkjmucmigjv`; `projects.briefing_aprovado` é `jsonb` e a constraint
  `projects_briefing_aprovado_schema` está validada;
- `engine_autorizacoes_v2`, `engine_eventos_v2`, `engine_preferencias_v2` e
  `engine_excecoes_admin_v2` existem no banco real;
- execuções reais observadas em 7 papéis; continuam sem run real:
  `conformidade_ficha`, `extrator_memoria`, `julgamento_idioma` e
  `revisor_decisao`;
- smoke técnico do provedor real: 5/5 passos aprovados, sem prosa e sem projeto;
- evidência fresca: `.evidencias/provedor_real.json`;
- pacote humano realmente exportado:
  `calibracao-humana/rotulos.local.csv` (14 amostras, 596 ocorrências e 182
  atestações);
- CI remoto aprovou testes, lint, typecheck e build; o gate final recusou
  corretamente a ausência de certificado e as 14 amostras humanas pendentes.
  Foi identificada e corrigida a dependência circular do CI: o modo
  `--pre-canary` permite apenas o deploy técnico enquanto mantém a release
  literária explicitamente bloqueada;
- os três relatórios antigos de canário não satisfazem o critério de release:
  todos contêm ao menos um capítulo `aprovado_com_excecao`.

Prontidão fresca:

```text
implementacao_local IMPLEMENTACAO_LOCAL_APROVADA
regressao_local     REGRESSAO_LOCAL_APROVADA
integracao_mock     INTEGRACAO_MOCK_APROVADA
provedor_real       PROVEDOR_REAL_APROVADO
migracoes_remotas   SCHEMA_REMOTO_INTROSPECTADO; EVIDENCIA_AGUARDA_SHA_LIMPO
integracao_real     INTEGRACAO_REAL_NAO_COMPROVADA
ui_autenticada      UI_AUTENTICADA_NAO_COMPROVADA
acuracia            ACURACIA_AGUARDANDO_ROTULAGEM
```

Regressão: 1642 testes na raiz, 1425 no worker, 423 no recorte de mutação,
80 SQL/RLS, zero falhas e zero testes pulados.

Introspecção autenticada observou quatro tabelas V2, 32 colunas relevantes,
21 constraints, 7 policies, 4 triggers e 10 índices. O formato de evidência foi
endurecido para incorporar colunas e constraints ao hash remoto; antes dessa
correção, uma evidência podia permanecer verde mesmo sem a nova coluna.

Próxima ação de máquina: commitar e publicar este endurecimento, reiniciar o
worker no mesmo SHA e materializar as evidências remotas com worktree limpa.
Depois, executar o fluxo autenticado sem prosa. Nenhum canário está autorizado
antes de `PRE_CANARY_READY`.

### Continuação do checkpoint

- endurecimento publicado em
  `ba225cb58099a2d474b657aa00eb9dfe030bfbd1`;
- CI completo aprovado, inclusive gate técnico `--pre-canary`, sem converter a
  release literária bloqueada em certificada;
- interface GitHub Pages publicada e o bundle contém somente o SHA `ba225cb`;
- worker reiniciado no mesmo SHA completo, com `sujo=false` e estado `paused`;
- evidências frescas no mesmo commit:
  `.evidencias/migracoes_remotas.json` e
  `.evidencias/provedor_real.json`;
- redirect autenticado do GitHub Pages foi acrescentado à allowlist do Supabase
  e a sessão do proprietário abriu o artefato correto;
- a inspeção autenticada de “Novo projeto” encontrou uma regressão de sequência:
  a V2 ainda gerava `canario_voz` antes da entrevista. Isso violava a regra
  `PRE_CANARY_READY` e produzia prosa antes da fundação e dos gates;
- correção em andamento: projeto novo vai diretamente para `entrevistar`; a
  skill escolhida no wizard permanece autoritativa na V2 sem depender de uma
  amostra de prosa pré-fundação. Testes direcionados: 26 aprovados; typecheck
  do frontend e worker limpos.
