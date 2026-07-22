# Engine V2 — Relatório de Fechamento

Branch `codex/engine-v2-fechamento` · PR #3 · worktree `ATELIER-LIVROS-V2-FECHAMENTO`
Última atualização: 2026-07-22 (em curso — seções marcadas ⏳ aguardam execução)

> **Leia primeiro:** o item mais importante deste relatório é o §6 — o critério
> "3/3 canários aprovados **plenos**" **não foi cumprido**, por uma causa
> estrutural identificada. Está documentado com evidência e caminho de correção.

---

## 1. O que a Engine V2 passou a fazer

Nove defeitos foram levantados por leitura dirigida na Fase 0 e todos foram
corrigidos; dois defeitos **novos** apareceram durante a correção e também foram
fechados. Em ordem de impacto:

| # | Defeito | Correção |
|---|---|---|
| 1 | Auditor mudo: contradições não viravam correção | achados do auditor entram no pacote de correção do escritor |
| 2 | Anti-loop estrito matava capítulo recuperável | saldo ponderado com platô de 1 rodada tolerado |
| 3 | Correção só cirúrgica | pipeline escolhe cirúrgico vs. reescrita orientada |
| 4 | Cotas idênticas nas 3 skills | cotas por skill (ver §6 — calibração é assunto aberto) |
| 5 | Correções sem os trechos flagrados | instruções globais carregam as ocorrências |
| 6 | `editor_estrutural` só existia no tipo | implementado (corte/reordenação determinísticos + manifesto) |
| 7 | Fluxo terminava sem meta-nota | meta-nota real com rubrica do bestseller-review |
| 8 | `engine_mode` ausente no frontend | wizard cria projeto V2, canário de voz, decisões do autor |
| 9 | Dossiê factual fora do pacote | docs factuais entram verbatim no revisor e no auditor |
| **10** | **(novo)** cota de cadência nunca casava (label vs. chave) | `CadenciaTique.chave` |
| **11** | **(novo)** `cotaDeclarada` exigia id inexistente — **nenhuma cota de contagem chegava aos sinais** | matcher por inclusão normalizada |

Os defeitos 10 e 11 são os mais graves da lista: até serem corrigidos,
`fora_da_cota` era **sempre falso** — o sistema media e não comparava.

## 2. Correções de robustez descobertas pelos canários (22/07)

Cada rodada de canário expôs um modo de falha real do caminho V2. Todos
corrigidos com teste do caso literal, **sem tocar na régua**:

| Commit | Defeito | Efeito antes |
|---|---|---|
| `077c6cb` | parecer omitia disposição de 1 sinal fora da cota | capítulo inteiro reprovado; agora é retry técnico do revisor com o sinal nomeado |
| `5d3a956` | detector de ornamento bloqueava campo de **ficha** | `arquiteto_cena` em loop determinístico (3 saídas idênticas rejeitadas) |
| `4ba05f1` | 429 do plano Max não classificado no V2 | **852 runs falhos** do `arquiteto_cena` em ~3h de loop quente; agora pausa com `retry_at` do reset sem contar tentativa |
| `2205fef` | campo não-string na ficha → `v.trim is not a function` | mensagem inútil fazia o retry falhar 3× idêntico |

O fix `4ba05f1` foi **validado em produção**: às 14:00Z o worker detectou o
limite, pausou anunciando o reset (16:11Z) e retomou sozinho no segundo exato,
sem queimar tentativa. Repetiu às 18:07Z → 21:11Z.

## 3. Infraestrutura de execução

- **Worker sob Scheduled Task** (`AtelierWorkerFechamento` + wrapper com
  auto-restart e anti-duplicata), espelhando o mecanismo da produção. Motivo: o
  worker lançado pelo harness, quando morto, sobrevivia **órfão de console** e
  todo `claude` filho falhava com `0xC0000142`. Sob a task, o wrapper ressuscita
  em ≤60s com console próprio.
- **Desmontagem pendente:** `Unregister-ScheduledTask -TaskName 'AtelierWorkerFechamento' -Confirm:$false`
  e reabilitar `AtelierWorker` (a task do autor está **Disabled**).

## 4. Migração do Índice dos Abduzidos

59 capítulos migrados: **23 aprovados hash-bound**, 36 `legado_sem_evidencia`,
0 divergências; idempotência provada em 2ª execução. Capítulos legado **nunca**
são reescritos por `escrever_livro` — reescrever prosa do autor é decisão humana.

O capítulo 60 foi **interrompido a pedido do autor**: job cancelado, entrada
removida do estado (v3→v4, 59 caps), texto preservado em disco como
`capitulo-60.md.interrompido-pelo-autor`.

## 5. Régua: o que aconteceu com a calibração 1.1.0

A calibração 1.1.0 (cota = máximo observado no corpus aprovado, n=3) foi
**rejeitada** pela auditoria externa — com razão: definir a cota pelo máximo de
3 amostras neutraliza o detector (sanfona iria de 1 para 18). Contratos revertidos
a **1.0.0**, régua **congelada**, e regra interina implementada: *o número do
detector nunca confirma violação sozinho* — o revisor cita cada ocorrência
literal e fecha a conta (`citadas + falsos_positivos = valor`), validado em
código (`validarParecer`).

Foi essa regra que produziu os pareceres de qualidade editorial que os canários
mostram — e é ela que também produz o resultado do §6.

## 6. ⚠️ O critério "3/3 aprovados plenos" NÃO foi cumprido

**Fato, com evidência hash-bound:** sob a régua 1.0.0, **todo capítulo que passou
saiu como `aprovado_com_excecao`** — nenhum pleno.

| Canário | Capítulo | Veredito | Review |
|---|---|---|---|
| hoover | 1 | `aprovado_com_excecao` | `430c0b1e` → `97225c8c` |
| hoover | 2 | `aprovado_com_excecao` | `17e92d70` → `8705217a` |
| romantasy | 1 | `aprovado_com_excecao` | `79fe26b2` |
| romantasy | 2 | ⏳ | ⏳ |
| dan-brown | 1 e 2 | `aprovado` **pleno** — mas sob a régua **1.1.0 rejeitada** | `5cf0b9b1`, `a6dd10f6` |

**Causa raiz.** As exceções não são complacência do revisor: são cotas
incompatíveis com as vozes. No hoover, a cota `sanfona = 1` enfrenta um detector
cuja precisão nessa voz é de ~0–15% (documentado em
`investigacao-sanfona-hoover.md`) — das 11 ocorrências do capítulo 1, **10 eram
enumeração descritiva concreta**, citadas uma a uma pelo revisor. Cumprir a cota
ao pé da letra exigiria descaracterizar a voz que o próprio contrato manda
proteger.

Ou seja: **a 1.0.0 é honesta mas descalibrada, e a 1.1.0 era calibrada pelo
método errado.** O pipeline, no meio disso, está fazendo exatamente o que deve —
aprovando com exceção auditada em vez de mentir em qualquer direção.

**Caminho (não executado — exige o processo separado que o autor definiu):**
calibrar com corpus rotulado, medir precisão/recall por detector e por voz,
validar em holdout. Só então promover cotas a bloqueio duro por skill.

**Decisão do autor:** aceitar `aprovado_com_excecao` com citação auditada como
equivalente a pleno para efeito do 3/3, ou manter o critério estrito e declarar
o item não cumprido até a calibração. *Este relatório não decide isso.*

## 7. Redução de escopo declarada

- **Fusão de capítulos** no editor estrutural: **não implementada** (só corte e
  reordenação).
- **Nota de canário curto não é evidência de meta:** um livro de 2 capítulos não
  fecha 9.0 — as escalações `META_NAO_ATINGIDA` observadas são o comportamento
  correto, não falha. Notas: dan-brown 8.3 (2 iterações), hoover 4.7 (1).
- **Capítulo real do Índice:** cancelado por decisão do autor; os canários
  passaram a ser a prova de produção.
- **Meta-nota em livro longo** (blocos + síntese de arco >40k palavras): tem
  teste unitário, **nunca rodou ponta a ponta**.

## 8. Achado aberto (não corrigido — decisão de desenho)

Quando a meta-nota manda reescrever um capítulo já aprovado e a reescrita
reprova com o orçamento esgotado, o capítulo termina **rebaixado** no estado
(`escrito`/`bloqueado`) sem restaurar a versão aprovada. Observado no dan-brown
cap 1 e no hoover cap 2. A aprovação original continua auditável nas reviews
(hash-bound), mas o estado canônico fica pior do que o melhor resultado obtido.
Correção sugerida: manter a melhor versão aprovada quando a reescrita da
meta-nota falha. **Não implementado nesta entrega** — muda semântica de estado e
merece decisão sua.

## 9. Testes

`npm run typecheck` limpo e **652 testes passando** (3 skipped) no worker no
último ciclo commitado. Frontend: 700 passed / 3 skipped no baseline da Fase 0.

## 10. Pendências desta entrega

- ⏳ romantasy capítulo 2 + fases finais
- ⏳ dan-brown: revalidação dos 2 capítulos sob 1.0.0 (as aprovações plenas atuais são sob a régua rejeitada)
- ⏳ Laboratório 1.0.0: identidade e distinguibilidade das vozes
- ⏳ leitura cega das 3 prosas
- ⏳ restauração do ambiente: pausa global de escrita, jobs V1 pausados
  (`83caefa2`, `cbf5ee19`), task `AtelierWorkerFechamento` desinstalada,
  `AtelierWorker` reabilitada
- 🛑 **merge, deploy e smoke aguardam consentimento explícito do autor**
