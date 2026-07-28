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
`INVENTARIO_DOD` (46 garantias, cada uma amarrada a um teste). Não existe fatia
"A" no plano: a numeração das fatias começa em B (`1af5d44`, ledger de
revelações), e nenhum commit ou documento do repositório define uma fatia A.
Redação anterior deste arquivo dizia "A–Q" — era imprecisa, não havia trabalho
faltando.

DoD local executada em 2026-07-28 sobre `83ac05d`:

| verificação | resultado |
|---|---|
| testes da raiz (inclui interface) | 104 arquivos, 1289 passaram, 3 pulados |
| testes do worker | 92 arquivos, 1171 passaram, 3 pulados |
| typecheck (`tsc --noEmit`) | limpo |
| build (`tsc -b && vite build`) | ok |
| lint (`eslint .`) | 0 erros, 3 avisos pré-existentes de `react-refresh` |
| SQL/RLS isolados | 48 passaram (historico, reliability-sql, owner-scope, release-allowlist) |
| ciclo com `ProvedorMock` | 4 passaram (integracao-mock) + 28 (pipeline, integracao-estrutural, lab) |
| `npm run prontidao -- --ciclo` | 0 bloqueios, 3 não comprovados |

Os 3 pulados são limites de recall conhecidos e documentados da heurística de
transparência (`src/transparencia.test.ts`), não regressões.

Pendências que NÃO são da implementação e dependem do autor:
1. rotulagem humana de 14 amostras do corpus (única via para RELEASE_CERTIFICADO);
2. aplicar `supabase/engine_v2_autorizacoes.sql` e `engine_v2_historico.sql`;
3. autorizar o projeto em `engine_autorizacoes_v2`;
4. autorizar o push.
