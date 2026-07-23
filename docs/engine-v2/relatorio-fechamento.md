# Engine V2 â€” RelatÃ³rio de Fechamento

Branch `codex/engine-v2-fechamento` Â· PR #3 Â· worktree `ATELIER-LIVROS-V2-FECHAMENTO`
Ãšltima atualizaÃ§Ã£o: 2026-07-22 (em curso â€” seÃ§Ãµes marcadas â³ aguardam execuÃ§Ã£o)

> **Leia primeiro:** o item mais importante deste relatÃ³rio Ã© o Â§6 â€” o critÃ©rio
> "3/3 canÃ¡rios aprovados **plenos**" **nÃ£o foi cumprido**, por uma causa
> estrutural identificada. EstÃ¡ documentado com evidÃªncia e caminho de correÃ§Ã£o.

---

## 1. O que a Engine V2 passou a fazer

Nove defeitos foram levantados por leitura dirigida na Fase 0 e todos foram
corrigidos; dois defeitos **novos** apareceram durante a correÃ§Ã£o e tambÃ©m foram
fechados. Em ordem de impacto:

| # | Defeito | CorreÃ§Ã£o |
|---|---|---|
| 1 | Auditor mudo: contradiÃ§Ãµes nÃ£o viravam correÃ§Ã£o | achados do auditor entram no pacote de correÃ§Ã£o do escritor |
| 2 | Anti-loop estrito matava capÃ­tulo recuperÃ¡vel | saldo ponderado com platÃ´ de 1 rodada tolerado |
| 3 | CorreÃ§Ã£o sÃ³ cirÃºrgica | pipeline escolhe cirÃºrgico vs. reescrita orientada |
| 4 | Cotas idÃªnticas nas 3 skills | cotas por skill (ver Â§6 â€” calibraÃ§Ã£o Ã© assunto aberto) |
| 5 | CorreÃ§Ãµes sem os trechos flagrados | instruÃ§Ãµes globais carregam as ocorrÃªncias |
| 6 | `editor_estrutural` sÃ³ existia no tipo | implementado (corte/reordenaÃ§Ã£o determinÃ­sticos + manifesto) |
| 7 | Fluxo terminava sem meta-nota | meta-nota real com rubrica do bestseller-review |
| 8 | `engine_mode` ausente no frontend | wizard cria projeto V2, canÃ¡rio de voz, decisÃµes do autor |
| 9 | DossiÃª factual fora do pacote | docs factuais entram verbatim no revisor e no auditor |
| **10** | **(novo)** cota de cadÃªncia nunca casava (label vs. chave) | `CadenciaTique.chave` |
| **11** | **(novo)** `cotaDeclarada` exigia id inexistente â€” **nenhuma cota de contagem chegava aos sinais** | matcher por inclusÃ£o normalizada |

Os defeitos 10 e 11 sÃ£o os mais graves da lista: atÃ© serem corrigidos,
`fora_da_cota` era **sempre falso** â€” o sistema media e nÃ£o comparava.

## 2. CorreÃ§Ãµes de robustez descobertas pelos canÃ¡rios (22/07)

Cada rodada de canÃ¡rio expÃ´s um modo de falha real do caminho V2. Todos
corrigidos com teste do caso literal, **sem tocar na rÃ©gua**:

| Commit | Defeito | Efeito antes |
|---|---|---|
| `077c6cb` | parecer omitia disposiÃ§Ã£o de 1 sinal fora da cota | capÃ­tulo inteiro reprovado; agora Ã© retry tÃ©cnico do revisor com o sinal nomeado |
| `5d3a956` | detector de ornamento bloqueava campo de **ficha** | `arquiteto_cena` em loop determinÃ­stico (3 saÃ­das idÃªnticas rejeitadas) |
| `4ba05f1` | 429 do plano Max nÃ£o classificado no V2 | **852 runs falhos** do `arquiteto_cena` em ~3h de loop quente; agora pausa com `retry_at` do reset sem contar tentativa |
| `2205fef` | campo nÃ£o-string na ficha â†’ `v.trim is not a function` | mensagem inÃºtil fazia o retry falhar 3Ã— idÃªntico |

O fix `4ba05f1` foi **validado em produÃ§Ã£o**: Ã s 14:00Z o worker detectou o
limite, pausou anunciando o reset (16:11Z) e retomou sozinho no segundo exato,
sem queimar tentativa. Repetiu Ã s 18:07Z â†’ 21:11Z.

## 3. Infraestrutura de execuÃ§Ã£o

- **Worker sob Scheduled Task** (`AtelierWorkerFechamento` + wrapper com
  auto-restart e anti-duplicata), espelhando o mecanismo da produÃ§Ã£o. Motivo: o
  worker lanÃ§ado pelo harness, quando morto, sobrevivia **Ã³rfÃ£o de console** e
  todo `claude` filho falhava com `0xC0000142`. Sob a task, o wrapper ressuscita
  em â‰¤60s com console prÃ³prio.
- **Desmontagem pendente:** `Unregister-ScheduledTask -TaskName 'AtelierWorkerFechamento' -Confirm:$false`
  e reabilitar `AtelierWorker` (a task do autor estÃ¡ **Disabled**).

## 4. MigraÃ§Ã£o do Ãndice dos Abduzidos

59 capÃ­tulos migrados: **23 aprovados hash-bound**, 36 `legado_sem_evidencia`,
0 divergÃªncias; idempotÃªncia provada em 2Âª execuÃ§Ã£o. CapÃ­tulos legado **nunca**
sÃ£o reescritos por `escrever_livro` â€” reescrever prosa do autor Ã© decisÃ£o humana.

O capÃ­tulo 60 foi **interrompido a pedido do autor**: job cancelado, entrada
removida do estado (v3â†’v4, 59 caps), texto preservado em disco como
`capitulo-60.md.interrompido-pelo-autor`.

## 5. RÃ©gua: o que aconteceu com a calibraÃ§Ã£o 1.1.0

A calibraÃ§Ã£o 1.1.0 (cota = mÃ¡ximo observado no corpus aprovado, n=3) foi
**rejeitada** pela auditoria externa â€” com razÃ£o: definir a cota pelo mÃ¡ximo de
3 amostras neutraliza o detector (sanfona iria de 1 para 18). Contratos revertidos
a **1.0.0**, rÃ©gua **congelada**, e regra interina implementada: *o nÃºmero do
detector nunca confirma violaÃ§Ã£o sozinho* â€” o revisor cita cada ocorrÃªncia
literal e fecha a conta (`citadas + falsos_positivos = valor`), validado em
cÃ³digo (`validarParecer`).

Foi essa regra que produziu os pareceres de qualidade editorial que os canÃ¡rios
mostram â€” e Ã© ela que tambÃ©m produz o resultado do Â§6.

## 6. âš ï¸ O critÃ©rio "3/3 aprovados plenos" NÃƒO foi cumprido

**Fato, com evidÃªncia hash-bound:** sob a rÃ©gua 1.0.0, **todo capÃ­tulo que passou
saiu como `aprovado_com_excecao`** â€” nenhum pleno.

| CanÃ¡rio | CapÃ­tulo | Veredito sob 1.0.0 | Review |
|---|---|---|---|
| hoover | 1 | `aprovado_com_excecao` (voz de acÃºmulo) | `430c0b1e` â†’ `97225c8c` |
| hoover | 2 | `aprovado_com_excecao` | `17e92d70` â†’ `8705217a` |
| romantasy | 1 | `aprovado_com_excecao` | `79fe26b2` |
| romantasy | 2 | `aprovado_com_excecao` | `9d6f59b3` |
| dan-brown | 1 | **`reprovado`** â€” defeito real (nÃ£o convergiu em 17 runs) | `78204d99` |
| dan-brown | 2 | `aprovado` sob a rÃ©gua **1.1.0 rejeitada** (nÃ£o re-revisado) | `a6dd10f6` |

> As aprovaÃ§Ãµes plenas do dan-brown (`5cf0b9b1`, `a6dd10f6`) eram sob a **1.1.0
> rejeitada**. Revalidado sob 1.0.0, o capÃ­tulo 1 â€” texto idÃªntico â€” **reprova**.

**Causa raiz â€” DOIS motivos opostos, ambos honestos.** As exceÃ§Ãµes e a reprova
nÃ£o sÃ£o complacÃªncia nem rigidez cega do revisor:

- **hoover e romantasy (vozes de ACÃšMULO): a cota Ã© apertada demais porque o
  detector Ã© impreciso.** A cota `sanfona = 1` enfrenta um detector cuja precisÃ£o
  nessa voz Ã© ~0â€“15% (`investigacao-sanfona-hoover.md`) â€” das 11 ocorrÃªncias do
  capÃ­tulo 1 do hoover, **10 eram enumeraÃ§Ã£o descritiva concreta**, citadas uma a
  uma. Cumprir a cota ao pÃ© da letra descaracterizaria a voz que o contrato manda
  proteger. â†’ `aprovado_com_excecao` honesto.

- **dan-brown (voz de TRANSPARÃŠNCIA): a cota estÃ¡ CERTA e o texto tinha um defeito
  real.** O revisor confirmou `interioridade_run = 3` (regra contratual 1â€“2) com
  as ocorrÃªncias citadas: blocos de 3â€“4 frases de deduÃ§Ã£o interior sem estÃ­mulo
  fÃ­sico â€” acÃºmulo que uma prosa "transparente" nÃ£o deve ter. A **1.1.0 mascarava
  esse defeito** ao afrouxar a cota. â†’ `reprovado` correto. (O loop de correÃ§Ã£o
  nÃ£o convergiu em 17 runs: limitaÃ§Ã£o do escritor em reduzir o acÃºmulo, nÃ£o da
  rÃ©gua.)

Ou seja: **a 1.0.0 nÃ£o Ã© "burra em geral" â€” Ã© apertada demais onde o _detector_ Ã©
impreciso (vozes de acÃºmulo) e corretamente rÃ­gida onde nÃ£o Ã© (transparÃªncia). A
1.1.0 era errada dos dois lados: relaxava o falso positivo do hoover E o defeito
real do dan-brown.** O pipeline, no meio disso, faz o certo em ambos os casos â€”
aprova com exceÃ§Ã£o auditada onde Ã© voz, reprova com citaÃ§Ã£o onde Ã© defeito.

**Caminho (nÃ£o executado â€” exige o processo separado que o autor definiu):**
construir corpus rotulado Ã  mÃ£o, medir precisÃ£o/recall por detector e por voz,
recalibrar cotas com nÃºmero medido (nÃ£o chutado), validar em holdout. SÃ³ entÃ£o
promover cotas a bloqueio duro por skill. O corpus Ã© prÃ©-requisito de tudo â€”
mexer no detector sem ele Ã© repetir o erro da 1.1.0 (o dan-brown Ã© a prova).

**OpÃ§Ã£o futura, dependente dos resultados da calibraÃ§Ã£o â€” sinal semÃ¢ntico
INFORMATIVO.** Primeiro candidato a atacar a imprecisÃ£o do detector nas vozes de
acÃºmulo: um sinal que mede se segmentos consecutivos *acrescentam informaÃ§Ã£o
nova* (via similaridade de embeddings â€” determinÃ­stica) para distinguir
enumeraÃ§Ã£o-que-avanÃ§a de reformulaÃ§Ã£o-que-repete. **NÃ£o decide nada, nÃ£o muda
cota, nÃ£o bloqueia** â€” sÃ³ sussurra ao revisor "destes 11, estes 3 parecem
repetiÃ§Ã£o real", reduzindo o trabalho de dispor falsos positivos (economia de
tokens/janela, que Ã© o gargalo). Preserva o congelamento da rÃ©gua (nÃ£o altera o
que aprova) e o determinismo (base do hash-binding). **PrÃ©-condiÃ§Ãµes antes de
implementar:** (1) corpus rotulado existente, para medir se o sussurro Ã©
confiÃ¡vel; (2) embeddings determinÃ­sticos viÃ¡veis no ambiente (a mÃ¡quina Windows
tem histÃ³rico de quebrar dependÃªncia nativa); (3) validaÃ§Ã£o de que o sinal reduz
o falso positivo sem introduzir novos. Registrado como a **primeira tarefa
concreta** do processo de calibraÃ§Ã£o, nÃ£o do fechamento.

**DecisÃ£o do autor:** aceitar `aprovado_com_excecao` com citaÃ§Ã£o auditada como
equivalente a pleno para efeito do 3/3, ou manter o critÃ©rio estrito e declarar
o item nÃ£o cumprido atÃ© a calibraÃ§Ã£o. *Este relatÃ³rio nÃ£o decide isso.* Nota: com
o dan-brown reprovando sob 1.0.0, o critÃ©rio estrito dÃ¡ **0/3 plenos**, nÃ£o 2/3 â€”
a questÃ£o nÃ£o Ã© margem, Ã© a rÃ©gua descalibrada e o defeito real coexistindo.

## 6-bis. Leitura cega â€” qualidade independente e o defeito de fundo

As trÃªs aberturas (capÃ­tulo 1 de cada canÃ¡rio) foram avaliadas **Ã s cegas** por
um leitor fresco, sem qualquer informaÃ§Ã£o de gÃªnero, autor ou origem, e sem saber
que os trÃªs vinham do mesmo sistema. Ã‰ a Ãºnica evidÃªncia de qualidade que nÃ£o
passa pelos detectores do prÃ³prio pipeline.

**Notas cegas:** romantasy 9,0 Â· hoover 8,5 Â· dan-brown 7,0. Dois dos trÃªs
"viraria a pÃ¡gina com forÃ§a"; o dan-brown foi o mais frio ("planta baixa de
suspense, nÃ£o cena") â€” o que **converge com a reprova por excesso de deduÃ§Ã£o**
que o revisor apontou de forma independente (Â§6). Sinais que concordam.

**O achado central â€” e ele responde Ã  queixa que originou este trabalho
("tiques saem repetidos").** O leitor cego concluiu: *"na superfÃ­cie, trÃªs vozes
distintas; no fundo, a mesma inteligÃªncia."*

- **A superfÃ­cie estÃ¡ sÃ³lida.** POV, tempo verbal, gÃªnero e o lÃ©xico de cada
  domÃ­nio (clorexidina/Glasgow no hoover; isÃ³bata/velino no romantasy;
  filigrana/ferrogÃ¡lica no dan-brown) sÃ£o convincentes e bem separados â€”
  "nenhum lÃª como cenÃ¡rio trocado por cima do mesmo parÃ¡grafo". O sistema
  **controla registro de superfÃ­cie**, e isso Ã© uma conquista real.

- **A retÃ³rica de revelaÃ§Ã£o NÃƒO diverge.** Uma assinatura estrutural atravessa os
  trÃªs, intacta apesar da troca de gÃªnero, POV e tempo verbal: (1) o fecho por
  antÃ­tese *"nÃ£o era A, era B"*; (2) o aparte que universaliza com *"a gente"*;
  (3) o corpo que age antes da vontade; (4) a veterania cronometrada ("dezoito
  anos", "onze anos", "dez mil vezes"); (5) a obsessÃ£o de contar segundos.

Isto reformula o problema original com precisÃ£o: os tiques de superfÃ­cie **por
capÃ­tulo** estÃ£o sob controle (Ã© o que os detectores + revisor medem e corrigem).
O que ainda trai a origem comum Ã© a **cadÃªncia de como cada voz revela e fecha** â€”
e essa Ã© uma propriedade **entre livros**, que nenhum detector atual mede (todos
operam por capÃ­tulo). Ã‰ a prÃ³xima fronteira real da qualidade, maior que a
calibraÃ§Ã£o de cotas: exigiria um sinal **cross-book** de divergÃªncia de retÃ³rica.
Registrado como achado; fora do escopo desta entrega.

## 7. ReduÃ§Ã£o de escopo declarada

- **FusÃ£o de capÃ­tulos** no editor estrutural: **nÃ£o implementada** (sÃ³ corte e
  reordenaÃ§Ã£o).
- **Nota de canÃ¡rio curto nÃ£o Ã© evidÃªncia de meta:** um livro de 2 capÃ­tulos nÃ£o
  fecha 9.0 â€” as escalaÃ§Ãµes `META_NAO_ATINGIDA` observadas sÃ£o o comportamento
  correto, nÃ£o falha. Notas: dan-brown 8.3 (2 iteraÃ§Ãµes), hoover 4.7 (1).
- **CapÃ­tulo real do Ãndice:** cancelado por decisÃ£o do autor; os canÃ¡rios
  passaram a ser a prova de produÃ§Ã£o.
- **Meta-nota em livro longo** (blocos + sÃ­ntese de arco >40k palavras): tem
  teste unitÃ¡rio, **nunca rodou ponta a ponta**.

## 8. Achado aberto (nÃ£o corrigido â€” decisÃ£o de desenho)

Quando a meta-nota manda reescrever um capÃ­tulo jÃ¡ aprovado e a reescrita
reprova com o orÃ§amento esgotado, o capÃ­tulo termina **rebaixado** no estado
(`escrito`/`bloqueado`) sem restaurar a versÃ£o aprovada. Observado no dan-brown
cap 1 e no hoover cap 2. A aprovaÃ§Ã£o original continua auditÃ¡vel nas reviews
(hash-bound), mas o estado canÃ´nico fica pior do que o melhor resultado obtido.
CorreÃ§Ã£o sugerida: manter a melhor versÃ£o aprovada quando a reescrita da
meta-nota falha. **NÃ£o implementado nesta entrega** â€” muda semÃ¢ntica de estado e
merece decisÃ£o sua.

## 8-bis. SÃ­ntese dos oito fixes

AlÃ©m dos 4 fixes da Â§2, mais 4 fixes de protocolo emergiram dos canÃ¡rios (todos
com teste do caso literal, rÃ©gua intocada): casamento tolerante do nome do sinal
(`7accb2f`), auditabilidade sÃ³ para detector de ocorrÃªncia e nÃ£o escalar
(`c1569f0`), throttle do Max no `rc=1` (`8b3ecbf`), e o predicado de disposiÃ§Ã£o
completa. **Oito fixes no total, nenhum de julgamento literÃ¡rio â€” todos de
comunicaÃ§Ã£o entre os papÃ©is.** Ã‰ o resultado mais informativo do exercÃ­cio: o
nÃºcleo editorial (detectores, cotas, rubrica) nÃ£o precisou de um ajuste; o que
faltava era a plumbing que faz os papÃ©is conversarem sem se atropelar â€” defeito
que sÃ³ emerge rodando prosa real, capÃ­tulo apÃ³s capÃ­tulo.

## 9. Testes

`npm run typecheck` limpo e **657 testes passando** (3 skipped) no worker no
Ãºltimo ciclo commitado. Frontend: 700 passed / 3 skipped no baseline da Fase 0.

## 10. PendÃªncias desta entrega

- âœ… romantasy 2/2 concluÃ­do (`aprovado_com_excecao` sob 1.0.0)
- âœ… dan-brown revalidado sob 1.0.0 â€” capÃ­tulo 1 **reprova** (defeito real; ver Â§6)
- âœ… leitura cega das 3 prosas (= teste de distinguibilidade; ver Â§6-bis) â€” notas 9,0/8,5/7,0, superfÃ­cie distinta, retÃ³rica de revelaÃ§Ã£o compartilhada
- â³ restauraÃ§Ã£o do ambiente: worker (task `AtelierWorkerFechamento` a
  desinstalar, `AtelierWorker` do autor a reabilitar), jobs V1 pausados
  (`83caefa2`, `cbf5ee19`), projetos-canÃ¡rio `producao_pausada`
- ðŸ›‘ **merge, deploy e smoke aguardam consentimento explÃ­cito do autor**

