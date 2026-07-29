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
| 2. citação por índice | não iniciado |
| 3. timeouts por papel | não iniciado |
| 4. esforço por papel | investigado: `--effort` EXISTE (`low, medium, high, xhigh, max`), validado no CLI real |
| 5. cascata de julgamento | não iniciado |
| 6. pins de modelo | não iniciado |

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
