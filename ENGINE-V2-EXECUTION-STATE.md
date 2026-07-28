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

CONCLUÍDO. Todos os defeitos (D1–D7) e todas as fatias (A–Q) estão fechados e
comprovados. `npm run prontidao -- --ciclo` reporta os seis estados exigidos.

Pendências que NÃO são da implementação e dependem do autor:
1. rotulagem humana de 14 amostras do corpus (única via para RELEASE_CERTIFICADO);
2. aplicar `supabase/engine_v2_autorizacoes.sql` e `engine_v2_historico.sql`;
3. autorizar o projeto em `engine_autorizacoes_v2`;
4. autorizar o push.
