# Estado de execução — correção e certificação da Engine V2

**Objetivo ativo até a Definition of Done do prompt mestre.** Se a execução for
interrompida, retomar daqui SEM perguntar nada.

SHA inicial da sessão: `34b2cea`. Branch: `master`. **Nunca fazer push sem
autorização explícita; nunca aplicar SQL remoto; nunca gerar canário; nunca
chamar modelo de prosa; nunca escrever capítulo.**

## Ordem de trabalho

### Defeitos da revisão (antes das fatias abertas)
- [x] D1. `npm run prontidao` não pode emitir IMPLEMENTACAO_APROVADA com fatia/garantia obrigatória ausente
- [x] D2. Escada executa estratégias realmente diferentes (cirúrgica/orientada/reficha/integral/julgamento)
- [x] D3. `modo=canario` não contorna certificado para fundação nem escrita geral
- [x] D4. SQL/RLS: owner do projeto, campos históricos imutáveis, revogação sem reescrita
- [x] D5. Encadeamento real: `max_novos_caps=1` não produz falso `done`; retoma até fechamento/Meta9
- [x] D6. Cruzamento macro × micro por campos estruturados (plantio, reforço, pagamento, fios, clímax, marcos, atos, tensão)
- [x] D7. Documentos V2: disco, Storage e abertura real pela interface

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
implementacao    IMPLEMENTACAO_APROVADA
regressao        REGRESSAO_APROVADA
integracao_mock  INTEGRACAO_MOCK_APROVADA
acuracia         ACURACIA_AGUARDANDO_ROTULAGEM_HUMANA
release          RELEASE_BLOQUEADO
canarios_novos   BLOQUEADOS_AGUARDANDO_AUTOR
```

## Próxima tarefa

CONCLUÍDO. Os defeitos D1–D7 e as fatias B–Q estão fechados e comprovados por
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
| histórico append-only | worker | triggers do banco | recusa update/delete | `engine_eventos_v2` | — | P-01..02 | local ok; **banco real não comprovado** |
| RLS e owner | migration | Postgres | isola por dono | políticas | — | D4-01 | local ok; **banco real não comprovado** |
| certificado × autorização | `release.ts` | todo ponto de entrada | fail-closed | `engine_autorizacoes_v2` | — | M-01..03, D3-01 | local ok |
| documentos V2 (contrato) | `documentosDaFundacao` | índice + tela | caminho e hash | índice | lista de docs | D7-01 | local ok |
| documentos V2 (real) | worker | Supabase Storage | upload e download | Storage | download | — | **D7-02 externo, não comprovado** |
| desvio V1/V2 | `executarJobRoteado` | log | rota declarada | log | badge da engine | roteamento.test | local ok |

DoD local executada em 2026-07-28 sobre `5dc4d13`:

| verificação | resultado |
|---|---|
| testes da raiz (inclui interface) | 107 arquivos, 1348 passaram, **0 pulados** |
| testes do worker | 95 arquivos, 1221 passaram, **0 pulados** |
| typecheck raiz (`tsc -b`) | limpo |
| typecheck worker (`tsc --noEmit`) | limpo |
| build (`tsc -b && vite build`) | ok |
| lint (`eslint .`) | 0 erros, 3 avisos pré-existentes de `react-refresh` |
| SQL/RLS isolados | 74 passaram |
| testes da interface | 127 passaram |
| ciclo com `ProvedorMock` | 4 + 28 passaram |
| `npm run prontidao -- --ciclo` | 0 bloqueios, 8 não comprovados |

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

Cada um vira um documento em `evidencias-externas/` vinculado ao commit e aos
hashes do que estava valendo. Ausente = NÃO COMPROVADO, que não é zero nem
sucesso. Push continua dependendo de autorização.
