# Relatório completo — Atelier de Livros, 2026-08-05

**Para:** Rodrigo (autor)
**Pergunta de fundo:** depois de meses e de milhões de tokens, onde este projeto
realmente está — e vale continuar?

Este relatório consolida: a rodada canário 2 (03–05/08), a auditoria geral de
03/08, os relatórios anteriores e a contabilidade completa em disco. Toda
afirmação numérica tem fonte citada no fim.

---

## 1. Sumário executivo — cinco frases

1. **A máquina funciona como máquina**: sobreviveu a 1 kill de processo e 3
   quedas de cota sem perder um byte, falha fechado quando o modelo trapaceia, e
   o bug que travava tudo foi reproduzido em teste e consertado em horas.
2. **A prosa individual é boa e o custo é conhecido**: um capítulo aprovado em
   ciclo limpo custa ~200 mil tokens de saída e ~50 minutos — número estável em
   duas medições independentes (199.370 e 196.585).
3. **O julgamento é o elo fraco, nos dois sentidos**: reprova pelo refinado
   (intenção num olhar) e deixa passar o estrutural (o capítulo 2 trocou o
   paciente da cama e nenhum gate viu; o tique "Não é X. É Y." foi medido 20
   vezes num capítulo aprovado e absolvido 20 vezes).
4. **A pergunta que decide o projeto — a qualidade segura no miolo de um livro?
   — continua sem resposta** após dois canários: nenhum passou do capítulo 2.
5. **Não é tempo perdido, mas está a um passo de virar**: a fábrica está pronta
   e nunca fabricou; ou a próxima rodada produz um livro inteiro, ou o custo de
   melhorar a fábrica deixa de se justificar.

---

## 2. O que aconteceu nesta rodada (03–05/08), na ordem

**O ponto de partida.** O canário 1 (03/08) travou no capítulo 1 de 12: o
revisor deu média 4,5/5, zero gates estruturais falhos, e ainda assim
`reprovado` — a cascata reverteu 3 falsos positivos para violação confirmada e
não gerou as correções correspondentes. Parecer contraditório = capítulo
bloqueado sem instrução. Parede, não gate.

**O conserto (F1/F2).** Bug localizado em `aplicarDelta`
(`worker/src/v2/cascata.ts`): teste reproduzindo o caso exato falhou vermelho
(`expected [] to have a length of 3 but got +0`), conserto aplicado (toda
ocorrência elevada sai com correção sintetizada — trecho medido + motivo da
decisão; caminho sem síntese possível falha alto nomeando o sinal), teste verde,
suíte completa 1.752/0, typecheck limpo. Nenhum limiar, cota ou contrato tocado.
Commit `ddfe468`.

**A prova de campo.** O canário retomou o mesmo projeto (`97dd7390`) e o
capítulo 1 atravessou o fluxo inteiro — escrita → triagem → cascata → correção
dirigida **com instruções** → `aprovado_com_excecao` com evidência hash-bound
(review `d01d9ffc`, 04/08 18:48). A parede não se repetiu. O conserto fez o que
prometia.

**As interrupções.** Seis lançamentos: 1 kill externo do harness (a árvore de
processos caiu junto — armadilha já conhecida de 27/07), 3 quedas de cota do
plano Max (retomadas limpas), 1 falha de conformidade do modelo (o revisor
inventou um sinal — "pretérito fora do fio-M (verificação manual)" — e confirmou
violação nele; a régua anti-fabricação recusou duas vezes; **o sistema falhou
fechado corretamente**), e o encerramento final.

**O encerramento.** O capítulo 2 saiu reprovado no mérito com 9 regens (orçamento
era 8) e o autor mandou parar após reconhecer o tique na frase que motivou a
reprovação. Relatório da rodada: `RELATORIO-CANARIO-2.md` (commit `e677063`),
com os 2 capítulos anexados.

---

## 3. Os dois achados que mudam a conversa

### 3.1. A re-ficha da retomada alucina contra a prosa aprovada — e nada confere

No capítulo 1 **aprovado**, Beatriz é a paciente traqueostomizada e Otávio anda,
fala e dirige. No capítulo 2 — noite seguinte — quem está acamado "há dois
meses", de fralda e cânula, é **Otávio**. Beatriz sumiu da cama.

Rastreado nas fichas persistidas: a troca nasce na **ficha v2 do capítulo 2**,
gerada quando a retomada regenerou a cena do zero ("Otávio Salgado está acamado,
dependente de cuidados, com via aérea e dieta enteral"). Três fichas saíram
"validada". O escritor obedeceu à ficha. O auditor factual reprovou o capítulo
por um refinamento (a narradora atribui intenção ao olhar do paciente — de fato
proibido na ficha) e **não viu que o paciente era outra pessoa**. A conformidade
cobrou o nome "Beatriz" ausente sem notar que ela tinha deixado de ser a mulher
na cama.

**Quatro camadas de continuidade existem e nenhuma disparou**: validação de
ficha, escritor com o final do capítulo anterior no contexto, auditor factual
(contradição é gate universal), conformidade de ficha. A `memoria_prosa`
(fatia H) foi extraída após a aprovação do capítulo 1 — mas nenhum gate
confronta ficha nova × memória da prosa aprovada.

Classe do defeito: **composição/verificação** — mesma família do bug da cascata.
Mecânico, testável (a troca Beatriz→Otávio é um caso de reprodução pronto), não
é limiar. Dois consertos nomeados: gate ficha×memória e retomada **reutilizar
ficha validada** em vez de regenerá-la.

### 3.2. O tique é medido, e o julgamento absolve — com deriva de leniência

O molde que você reconheceu de imediato ("Não é X. É Y." / eco-negação com coda)
está no capítulo 1 aprovado em dose alta: *"Não é frieza. É que a manutenção eu
sei nomear"*, *"Não emperrada: fechada"*, *"Isso não é acordar [...]: é abertura
ocular espontânea"*, *"Não limpa de quem passou pano [...]. Limpa de esta
semana"*, *"Ele não está prometendo silêncio: está me concedendo o meu"*. No
capítulo 2, além da frase que você citou: *"O silêncio dele não é ausência. É
uma coisa que está acontecendo"* e o aforismo de manual *"Papel de carta a gente
escreve para alguém. Diário a gente escreve para si."*

**O detector vê**: sanfona = 13, personificação = 7 no capítulo 1 novo. **O
julgamento absolve**: 20 de 20 dispostas como falso positivo, com a triagem
(sonnet) e a decisão cara (opus) concordando. E a régua não é estável entre
rodadas:

| medição | sanfona medida | confirmada defeito |
|---|---|---|
| canário 1, cap 1 (03/08) | 10 | 3 |
| canário 2, cap 1 (04/08) | 13 | **0** |

Mesmo detector, mesma voz, julgamentos opostos — tendendo à leniência. O buraco
conceitual: não existe régua de **frequência de molde**. Cada instância isolada
é defensável (e o revisor defende bem); 13 no mesmo capítulo é cadência de
fábrica. É exatamente assim que um tique sobrevive a um sistema que julga
instância por instância.

Agravante: a cena da gaiola limpa é re-encenada quase idêntica nos capítulos 1 e
2 ("limpa... esta semana" nos dois) e os gates de repetição quase-literal e
semântica não dispararam.

---

## 4. Contabilidade completa

### Custo desta rodada (canário 2)

| item | valor |
|---|---|
| Total | **738.264 tokens de saída**, 102 runs |
| Resultado | 1 capítulo aprovado + 1 bloqueado |
| Julgamento (revisor+decisão) | 502.545 (68%) |
| Escritor | 115.958 (16%) |
| Queimado por interrupções (sem veredito) | ~145.000 |
| Ciclo limpo do cap 1 (janela 18:02–18:48 de 04/08) | **196.585 tokens, 46 min** |

### O número de regime — o mais importante do projeto

Duas medições independentes, códigos de dias diferentes, batem:
**~200 mil tokens de saída e ~50 minutos por capítulo aprovado em ciclo limpo**
(199.370 no canário 1; 196.585 no canário 2). Projeção honesta: 12 capítulos ≈
2,4 M; 60 capítulos ≈ 11,8 M — **condicionada a aprovar no 1º ciclo**. O
capítulo 2 desta rodada gastou 306 mil e não aprovou: cenas que não fecham
multiplicam o regime por 1,5–4×.

### Estrutura do custo

O julgamento consome 68–74% de tudo, e a maior fatia dele é **imposto de
ruído**: os detectores dispararam 86% de falso positivo na voz hoover (medição
do canário 1, confirmada no 2), e o revisor paga um parágrafo de defesa por
ocorrência, em toda iteração. Cada ponto de precisão ganho no detector economiza
em todos os capítulos de todos os livros dessa voz.

---

## 5. Placar geral do sistema (atualizando a auditoria de 03/08)

| Camada | 03/08 | Hoje | O que mudou |
|---|---|---|---|
| Interface web | Verde | Verde | — |
| Engine V2 (núcleo) | Verde | Verde | cascata consertada com teste (`ddfe468`) |
| Agentes (11 papéis) | Verde | Verde | +1 prova: falha fechado contra sinal inventado |
| Skills/contratos | Amarelo | Amarelo | só 3 vozes com contrato V2 |
| Gates de qualidade | Amarelo | **Vermelho** | 2 falso-negativos estruturais provados (§3) |
| Resultado literário | Não medido | **Parcial** | 1 capítulo aprovado com evidência; prosa boa; livro inteiro segue inexistente |
| Entrega/produção | Vermelho | Vermelho | commits locais sem push; produção pausada |

A frase da auditoria de 03/08 segue válida com uma correção: *"fábrica montada,
zero peças fabricadas"* — agora existe **uma peça** (um capítulo aprovado com
evidência), e existe a prova de que o controle de qualidade da fábrica aprova
peça com defeito estrutural.

## 6. A trajetória dos últimos meses — o que os tokens compraram

Ciclos fechados e verificados (fontes em memória do projeto e git):

- **Jul/13–14**: auditoria Novo Projeto; contrato de progresso; **correção sem
  clique** (bloqueio recuperável reagenda sozinho — escada de 7 degraus).
- **Jul/16**: benchmark engine custo zero — nenhum papel tem substituto gratuito
  à altura (decisão informada de continuar no Max).
- **Jul/18**: correção de estilo hoover (régua invertida do dan-brown; lição CR4).
- **Jul/20–27**: **Engine V2 consolidada** — estado canônico, contratos, cascata,
  ledger de revelações, arco verificável, portão de fundação; ciclo
  interface→engine→plataforma fechado com prova E2E no Leitor.
- **Jul/28–Ago/02**: sistema de evidência externa (gerador hash-bound,
  anti-forja, 4 evidências provadas de primeira).
- **Ago/03**: auditoria geral read-only; canário 1 (achou o bug da cascata e a
  taxa de 86% de falso positivo).
- **Ago/03–05**: conserto provado + canário 2 (este relatório).

O padrão honesto: **cada rodada fecha o que a anterior abriu e abre um problema
mais fino**. Parede burra → parecer contraditório → julgamento que não vê
estrutura. Isso é progresso real (os problemas estão ficando mais
sofisticados), e é também o risco real (a cadeia pode não ter fim se o critério
de parada for "nenhum problema novo").

## 7. Avaliação honesta

**O que está certo.** Os problemas atacados são os verdadeiros (deriva, tique,
continuidade, ghostwriting); a arquitetura corresponde a fracassos vividos e
documentados, não a especulação; a resumabilidade, o fail-closed e a
auditabilidade provaram em condições hostis; o custo de regime é estável e
viável no plano Max; a prosa que sai é boa — o capítulo 1 desta rodada é
publicável como abertura de suspense comercial.

**O que está errado.** A camada de julgamento — a mais cara do sistema (68–74%
do custo) — tem os dois defeitos que mais importam: absolve o padrão repetido
(tique) e não confere o estrutural (continuidade ficha×prosa). Ou seja: **o
dinheiro está indo para o juiz errado nas duas direções**. E o projeto acumula
infraestrutura excelente sem nunca ter produzido a única prova que importa: um
livro inteiro que você leia e aprove.

**Sobre a sua desconfiança.** Ela é a leitura correta dos dados desta rodada. A
resposta técnica existe (dois consertos nomeados, mecânicos, testáveis — §3), mas
a decisão não é técnica: é se você quer pagar mais uma rodada de conserto antes
de ver um livro, ou se muda o critério.

## 8. Os três caminhos

**A. Rodada 3 cirúrgica** — os 2 consertos do §3 (gate ficha×memória +
reutilizar ficha validada; régua de frequência de molde), cada um com teste que
reproduz, e o canário de 12 de novo. Custo estimado: consertos ~0 tokens de
produção; canário ~2,4–4 M. É o caminho que responde a pergunta do miolo.
*Risco: um terceiro achado fino aparecer — a cadeia do §6.*

**B. Prova de produto antes de prova de engine** — congelar consertos, pegar o
melhor caminho que já existe hoje (fundação + escritor + gates universais, com
julgamento de maneirismo em modo sinal, sem bloqueio), gerar um livro de 12
capítulos de ponta a ponta, e **você lê**. Decide com o produto na mão se o
juiz automático merece mais investimento. Custo: ~2,4 M + seu tempo de leitura.
*Risco: o livro sair com os defeitos que os gates existem para impedir — mas aí
você os viu no produto, não no relatório.*

**C. Pausa declarada** — worker desligado, repositório como está (tudo
commitado e documentado), retomada quando quiser. Custo: zero. *Risco: o
conhecimento esfria; os 20 commits locais seguem sem push.*

Minha recomendação, dita como opinião e não como decisão: **B**. Depois de meses
de infraestrutura, a informação mais valiosa que falta não é mais um gate — é
você lendo um livro inteiro que a máquina produziu. O juiz automático pode ser
calibrado depois, contra esse livro, com o seu gosto como gabarito (que é, aliás,
o que a calibração humana do lab sempre quis ser).

## 9. Fontes

- `RELATORIO-CANARIO-2.md` + `canario-2-capitulos/` (commit `e677063`) — rodada 2 completa
- `RELATORIO-CANARIO-LONGO.md` — canário 1, base 199.370 tokens/cap, 86% FP
- `AUDITORIA-GERAL-2026-08-03.md` — placar por camada, "fábrica sem peças"
- `worker/src/v2/cascata.ts` + `cascata.test.ts` (commit `ddfe468`) — o conserto
- `~/atelier-work/canario-v2-hoover-mcfadden-97dd7390/engine-v2/` — runs.jsonl
  (102 runs, contabilidade), reviews.jsonl (pareceres), specs.jsonl (as 3 fichas
  do cap 2, incluindo a v2 da troca de paciente)
- Memória do projeto (`project-engine-v2.md`) — trajetória de julho
