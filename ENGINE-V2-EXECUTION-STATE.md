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

DoD local executada em 2026-07-28 sobre `5dc4d13`:

| verificação | resultado |
|---|---|
| testes da raiz (inclui interface) | 105 arquivos, 1305 passaram, 3 pulados |
| testes do worker | 93 arquivos, 1187 passaram, 3 pulados |
| typecheck (`tsc --noEmit`) | limpo |
| build (`tsc -b && vite build`) | ok |
| lint (`eslint .`) | 0 erros, 3 avisos pré-existentes de `react-refresh` |
| SQL/RLS isolados | 74 passaram (historico, autorizacao-politica, reliability-sql, owner-scope, release-allowlist) |
| meta-testes do D1 | 16 passaram (`dod-conferencia.test.ts`) |
| ciclo com `ProvedorMock` | 4 passaram (integracao-mock) + 28 (pipeline, integracao-estrutural, lab) |
| `npm run prontidao -- --ciclo` | 0 bloqueios, 3 não comprovados, 46/46 garantias aprovadas |

Os 3 pulados são limites de recall conhecidos e documentados da heurística de
transparência (`src/transparencia.test.ts`), não regressões.

Pendências que NÃO são da implementação e dependem do autor:
1. rotulagem humana de 14 amostras do corpus (única via para RELEASE_CERTIFICADO);
2. aplicar `supabase/engine_v2_autorizacoes.sql` e `engine_v2_historico.sql`;
3. autorizar o projeto em `engine_autorizacoes_v2`;
4. autorizar o push.
