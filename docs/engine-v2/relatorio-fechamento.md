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

| Canário | Capítulo | Veredito sob 1.0.0 | Review |
|---|---|---|---|
| hoover | 1 | `aprovado_com_excecao` (voz de acúmulo) | `430c0b1e` → `97225c8c` |
| hoover | 2 | `aprovado_com_excecao` | `17e92d70` → `8705217a` |
| romantasy | 1 | `aprovado_com_excecao` | `79fe26b2` |
| romantasy | 2 | `aprovado_com_excecao` | `9d6f59b3` |
| dan-brown | 1 | **`reprovado`** — defeito real (não convergiu em 17 runs) | `78204d99` |
| dan-brown | 2 | `aprovado` sob a régua **1.1.0 rejeitada** (não re-revisado) | `a6dd10f6` |

> As aprovações plenas do dan-brown (`5cf0b9b1`, `a6dd10f6`) eram sob a **1.1.0
> rejeitada**. Revalidado sob 1.0.0, o capítulo 1 — texto idêntico — **reprova**.

**Causa raiz — DOIS motivos opostos, ambos honestos.** As exceções e a reprova
não são complacência nem rigidez cega do revisor:

- **hoover e romantasy (vozes de ACÚMULO): a cota é apertada demais porque o
  detector é impreciso.** A cota `sanfona = 1` enfrenta um detector cuja precisão
  nessa voz é ~0–15% (`investigacao-sanfona-hoover.md`) — das 11 ocorrências do
  capítulo 1 do hoover, **10 eram enumeração descritiva concreta**, citadas uma a
  uma. Cumprir a cota ao pé da letra descaracterizaria a voz que o contrato manda
  proteger. → `aprovado_com_excecao` honesto.

- **dan-brown (voz de TRANSPARÊNCIA): a cota está CERTA e o texto tinha um defeito
  real.** O revisor confirmou `interioridade_run = 3` (regra contratual 1–2) com
  as ocorrências citadas: blocos de 3–4 frases de dedução interior sem estímulo
  físico — acúmulo que uma prosa "transparente" não deve ter. A **1.1.0 mascarava
  esse defeito** ao afrouxar a cota. → `reprovado` correto. (O loop de correção
  não convergiu em 17 runs: limitação do escritor em reduzir o acúmulo, não da
  régua.)

Ou seja: **a 1.0.0 não é "burra em geral" — é apertada demais onde o _detector_ é
impreciso (vozes de acúmulo) e corretamente rígida onde não é (transparência). A
1.1.0 era errada dos dois lados: relaxava o falso positivo do hoover E o defeito
real do dan-brown.** O pipeline, no meio disso, faz o certo em ambos os casos —
aprova com exceção auditada onde é voz, reprova com citação onde é defeito.

**Caminho (não executado — exige o processo separado que o autor definiu):**
construir corpus rotulado à mão, medir precisão/recall por detector e por voz,
recalibrar cotas com número medido (não chutado), validar em holdout. Só então
promover cotas a bloqueio duro por skill. O corpus é pré-requisito de tudo —
mexer no detector sem ele é repetir o erro da 1.1.0 (o dan-brown é a prova).

**Opção futura, dependente dos resultados da calibração — sinal semântico
INFORMATIVO.** Primeiro candidato a atacar a imprecisão do detector nas vozes de
acúmulo: um sinal que mede se segmentos consecutivos *acrescentam informação
nova* (via similaridade de embeddings — determinística) para distinguir
enumeração-que-avança de reformulação-que-repete. **Não decide nada, não muda
cota, não bloqueia** — só sussurra ao revisor "destes 11, estes 3 parecem
repetição real", reduzindo o trabalho de dispor falsos positivos (economia de
tokens/janela, que é o gargalo). Preserva o congelamento da régua (não altera o
que aprova) e o determinismo (base do hash-binding). **Pré-condições antes de
implementar:** (1) corpus rotulado existente, para medir se o sussurro é
confiável; (2) embeddings determinísticos viáveis no ambiente (a máquina Windows
tem histórico de quebrar dependência nativa); (3) validação de que o sinal reduz
o falso positivo sem introduzir novos. Registrado como a **primeira tarefa
concreta** do processo de calibração, não do fechamento.

**Decisão do autor:** aceitar `aprovado_com_excecao` com citação auditada como
equivalente a pleno para efeito do 3/3, ou manter o critério estrito e declarar
o item não cumprido até a calibração. *Este relatório não decide isso.* Nota: com
o dan-brown reprovando sob 1.0.0, o critério estrito dá **0/3 plenos**, não 2/3 —
a questão não é margem, é a régua descalibrada e o defeito real coexistindo.

## 6-bis. Leitura cega — qualidade independente e o defeito de fundo

As três aberturas (capítulo 1 de cada canário) foram avaliadas **às cegas** por
um leitor fresco, sem qualquer informação de gênero, autor ou origem, e sem saber
que os três vinham do mesmo sistema. É a única evidência de qualidade que não
passa pelos detectores do próprio pipeline.

**Notas cegas:** romantasy 9,0 · hoover 8,5 · dan-brown 7,0. Dois dos três
"viraria a página com força"; o dan-brown foi o mais frio ("planta baixa de
suspense, não cena") — o que **converge com a reprova por excesso de dedução**
que o revisor apontou de forma independente (§6). Sinais que concordam.

**O achado central — e ele responde à queixa que originou este trabalho
("tiques saem repetidos").** O leitor cego concluiu: *"na superfície, três vozes
distintas; no fundo, a mesma inteligência."*

- **A superfície está sólida.** POV, tempo verbal, gênero e o léxico de cada
  domínio (clorexidina/Glasgow no hoover; isóbata/velino no romantasy;
  filigrana/ferrogálica no dan-brown) são convincentes e bem separados —
  "nenhum lê como cenário trocado por cima do mesmo parágrafo". O sistema
  **controla registro de superfície**, e isso é uma conquista real.

- **A retórica de revelação NÃO diverge.** Uma assinatura estrutural atravessa os
  três, intacta apesar da troca de gênero, POV e tempo verbal: (1) o fecho por
  antítese *"não era A, era B"*; (2) o aparte que universaliza com *"a gente"*;
  (3) o corpo que age antes da vontade; (4) a veterania cronometrada ("dezoito
  anos", "onze anos", "dez mil vezes"); (5) a obsessão de contar segundos.

Isto reformula o problema original com precisão: os tiques de superfície **por
capítulo** estão sob controle (é o que os detectores + revisor medem e corrigem).
O que ainda trai a origem comum é a **cadência de como cada voz revela e fecha** —
e essa é uma propriedade **entre livros**, que nenhum detector atual mede (todos
operam por capítulo). É a próxima fronteira real da qualidade, maior que a
calibração de cotas: exigiria um sinal **cross-book** de divergência de retórica.
Registrado como achado; fora do escopo desta entrega.

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

Além dos 4 fixes da §2, mais 4 fixes de protocolo emergiram dos canários (todos
com teste do caso literal, régua intocada): casamento tolerante do nome do sinal
(`7accb2f`), auditabilidade só para detector de ocorrência e não escalar
(`c1569f0`), throttle do Max no `rc=1` (`8b3ecbf`), e o predicado de disposição
completa. **Oito fixes no total, nenhum de julgamento literário — todos de
comunicação entre os papéis.** É o resultado mais informativo do exercício: o
núcleo editorial (detectores, cotas, rubrica) não precisou de um ajuste; o que
faltava era a plumbing que faz os papéis conversarem sem se atropelar — defeito
que só emerge rodando prosa real, capítulo após capítulo.

## 9. Testes

`npm run typecheck` limpo e **657 testes passando** (3 skipped) no worker no
último ciclo commitado. Frontend: 700 passed / 3 skipped no baseline da Fase 0.

## 10. Pendências desta entrega

- ✅ romantasy 2/2 concluído (`aprovado_com_excecao` sob 1.0.0)
- ✅ dan-brown revalidado sob 1.0.0 — capítulo 1 **reprova** (defeito real; ver §6)
- ✅ leitura cega das 3 prosas (= teste de distinguibilidade; ver §6-bis) — notas 9,0/8,5/7,0, superfície distinta, retórica de revelação compartilhada
- ⏳ restauração do ambiente: worker (task `AtelierWorkerFechamento` a
  desinstalar, `AtelierWorker` do autor a reabilitar), jobs V1 pausados
  (`83caefa2`, `cbf5ee19`), projetos-canário `producao_pausada`
- 🛑 **merge, deploy e smoke aguardam consentimento explícito do autor**
