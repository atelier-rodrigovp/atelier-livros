# Estado de execução — correção e certificação da Engine V2

**Objetivo ativo até a Definition of Done do prompt mestre.** Se a execução for
interrompida, retomar daqui SEM perguntar nada.

SHA inicial da sessão: `34b2cea`. Branch: `master`. **Nunca fazer push sem
autorização explícita; nunca aplicar SQL remoto; nunca gerar canário; nunca
chamar modelo de prosa; nunca escrever capítulo.**

## Ordem de trabalho

### Defeitos da revisão (antes das fatias abertas)
- [ ] D1. `npm run prontidao` não pode emitir IMPLEMENTACAO_APROVADA com fatia/garantia obrigatória ausente
- [ ] D2. Escada executa estratégias realmente diferentes (cirúrgica/orientada/reficha/integral/julgamento)
- [ ] D3. `modo=canario` não contorna certificado para fundação nem escrita geral
- [ ] D4. SQL/RLS: owner do projeto, campos históricos imutáveis, revogação sem reescrita
- [ ] D5. Encadeamento real: `max_novos_caps=1` não produz falso `done`; retoma até fechamento/Meta9
- [ ] D6. Cruzamento macro × micro por campos estruturados (plantio, reforço, pagamento, fios, clímax, marcos, atos, tensão)
- [ ] D7. Documentos V2: disco, Storage e abertura real pela interface

### Fatias abertas do plano original
- [ ] E — entrevista determinística e aprovação do briefing
- [ ] G — conformidade ficha → prosa
- [ ] H — memória derivada da prosa e promessas cruzadas
- [ ] I — repetição literal, semântica e maneirismos globais
- [ ] J — revisor, auditor e idioma
- [ ] K — revalidação transitiva e Meta9
- [ ] L — canário como snapshot e invalidação (fixtures; NÃO gerar canário)
- [ ] O — interface editorial completa
- [ ] P — histórico append-only e RLS

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

D1 — inventário de fatias obrigatórias no comando de prontidão.
