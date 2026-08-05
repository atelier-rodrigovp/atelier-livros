# Relatório — Canário 2 (hoover-mcfadden), 2026-08-03 → 2026-08-05

> # O canário escreveu 2 capítulos dos 12. Não 12: **DOIS** — 1 aprovado, 1 bloqueado.
>
> A parada foi decisão do autor, depois de o capítulo 2 estourar o orçamento de 8
> regens (teve 9) e de dois achados que mudam a conversa: **o capítulo 2 troca o
> paciente da cama** sem nenhum gate perceber, e o molde de frase que o autor
> reconheceu de imediato ("Não é X. É Y.") foi **medido 13 vezes no capítulo 1 e
> aprovado 13 vezes como falso positivo**.
>
> A pergunta original — a qualidade cai no miolo? — segue **SEM RESPOSTA**. De
> novo não há miolo.

---

## F1/F2 — O conserto que motivou a rodada: FEITO e PROVADO

O bug: `aplicarDelta` (worker/src/v2/cascata.ts) elevava ocorrências de
`falso_positivo` a `violacao_confirmada` e não atualizava `correcoes` — parecer
internamente contraditório, capítulo bloqueado sem instrução de conserto.

Teste reproduzindo o caso exato (sanfona valor 10, 3 reversões nos índices 3/5/10,
`correcoes: []`). **Vermelho antes**, saída literal:

```
 ❯ src/v2/cascata.test.ts (27 tests | 4 failed) 18ms
   × [canário 2026-08-03] 3 falso_positivo→violacao_confirmada produzem 3 correções — nunca parecer contraditório
     → expected [] to have a length of 3 but got +0
   × cada correção sintetizada localiza o trecho medido e carrega o motivo da decisão
     → Cannot read properties of undefined (reading 'local')
   × correções da triagem são preservadas, as do delta entram depois
     → expected [ { local: 'L:9', …(2) } ] to have a length of 4 but got 1
   × falha alto se a elevação não puder sair com correção (índice já citado, correções vazias)
     → expected [Function] to throw an error
```

**Verde depois**:

```
 ✓ src/v2/cascata.test.ts (27 tests) 11ms
 Test Files  1 passed (1) · Tests  27 passed (27)
```

Conserto: toda ocorrência que o delta eleva sai com correção sintetizada (trecho
medido + motivo da decisão); no único caminho sem síntese possível, a composição
falha alto nomeando o sinal. Suíte completa: worker 1519/0 + raiz **1752/0**
(base era 1748; os 4 a mais são os testes novos). Typecheck limpo. Nenhum
limiar, cota, `contrato.json`, `meta_nota` ou `max_reescritas` tocado. Commit:
`ddfe468`.

**A prova de campo do conserto existe**: o capítulo 1 desta rodada atravessou
triagem → cascata → correção dirigida **com instruções** → `aprovado_com_excecao`
com evidência hash-bound (review `d01d9ffc`). A parede de 2026-08-03 não se
repetiu. O conserto fez exatamente o que prometia — e só isso.

---

## Linha do tempo — 6 lançamentos, 5 interrupções

| # | quando | fim | causa |
|---|---|---|---|
| A | 03/08 ~20:17 | 03/08 20:18 | **kill externo** do wrapper (harness) derrubou a árvore de processos |
| B | 03/08 20:20 | 03/08 20:37 | cota de sessão (`resets 11:30pm`) |
| C | 04/08 07:13 | 04/08 ~07:35 | cota de sessão (`resets 12:10pm`) |
| D | 04/08 18:02 | 04/08 ~19h | **cap 1 APROVADO às 18:48**; cota caiu durante o cap 2 (`resets 10:10pm`) |
| E | 04/08 22:27 | 04/08 ~22:35 | revisor inventou sinal fora do detector (`"pretérito fora do fio-M (verificação manual)"`) e confirmou violação nele; a régua anti-fabricação recusou 2× — falha de conformidade do MODELO, sistema falhou fechado corretamente |
| F | 04/08 ~22:40 | 04/08 23:34 | cap 2 **reprovado** no mérito; orçamento de regens estourado; autor mandou parar |

Cada retomada **reescreve o capítulo não-aprovado do zero e gera ficha nova** —
as instruções de correção da tentativa anterior não sobrevivem. As 9 regens do
capítulo 2 não foram 9 tentativas informadas; foram ~3 arranques cegos ×
micro-loop. E a re-ficha da retomada foi a porta do achado nº 1 abaixo.

## Log por capítulo (F2 do enunciado)

```
cap | pal  | escritas | runs | tokens_out | veredito
  1 | 2784 |     9*   |  51  |    422.726 | aprovado_com_excecao (18:48 de 04/08)
  2 | 2564 |     9    |  38  |    306.532 | bloqueado QUALIDADE_REPROVADA (23:34 de 04/08)
fichas (spec:1/spec:2)            ~9.006
TOTAL rodada 2                   738.264 tokens_out em 102 runs
```
\* das 9 escritas do cap 1, 5 foram queimadas pelas interrupções A/B/C (reescritas
do zero sem veredito); o ciclo aprovado usou 4.

Por papel (rodada 2 inteira):

```
revisor_literario   ok=15 falhas=4  381.801   52%
revisor_decisao     ok=14 falhas=2  120.744   16%   } julgamento = 68%
escritor            ok=18           115.958   16%
auditor_factual     ok=13            52.269    7%
conformidade_ficha  ok=14            43.574    6%
contextualizador    ok=6             12.683    2%
arquiteto_cena      ok=6  falhas=7    9.006    1%
extrator_memoria    ok=1              2.229   <1%
```

## Custo de regime — o número limpo

A janela D produziu o único ciclo sem interrupção: **capítulo 1, da ficha à
aprovação, 196.585 tokens de saída em 46 minutos** (revisor_literario 99.277,
escritor 33.108, revisor_decisao 28.749, auditor 15.907, conformidade 12.816).

Bate com a base da rodada 1 (199.370). O regime é estável: **~200 mil tokens de
saída e ~50 min por capítulo aprovado**. Projeção honesta: 12 caps ≈ **2,4 M**;
60 caps ≈ **11,8 M** — desde que os capítulos aprovem no 1º ciclo, o que o
capítulo 2 desmente. O custo real desta rodada foi 738 mil para 1 aprovado:
**3,7× o regime**, pago a interrupções e à cena que não fechou.

---

## ACHADO Nº 1 (o mais grave): o capítulo 2 troca o paciente da cama — e nenhum gate viu

No capítulo 1 **aprovado**, a paciente é **Beatriz Salgado** ("Beatriz Salgado,
cinquenta e dois anos... traqueostomia com cânula número seis") e **Otávio anda,
fala, dirige e bebe café** ("já de sapato, com as chaves do carro na mão").

No capítulo 2 — a noite seguinte na cronologia — quem está traqueostomizado, de
fralda, "magro do jeito que ficam os corpos que passaram de dois meses deitados"
é **Otávio**. Beatriz sumiu da casa.

Origem rastreada nas fichas persistidas (`specs.jsonl`):

- ficha cap 1: *"Beatriz está acamada, traqueostomizada"; "Otávio é marido de Beatriz e mora na casa"* ✓
- ficha cap 2 **v1** (janela D): ambígua mas compatível ("sozinha na casa com Otávio; Otávio observa cada hesitação")
- ficha cap 2 **v2** (re-ficha da retomada E): **"Otávio Salgado está acamado, dependente de cuidados, com via aérea e dieta enteral"** ← a troca nasce aqui
- ficha cap 2 **v3** (retomada F): mantém a troca ("Que Otávio tem qualquer capacidade de comunicação voluntária" como conhecimento proibido)

As três fichas saíram **"validada"**. O escritor obedeceu à ficha. O auditor
factual — cujo trabalho é contradição com o estabelecido — reprovou o capítulo
por um refinamento (a narradora atribui intenção ao olhar do paciente) **e não
viu que o paciente era outra pessoa**. A conformidade cobrou o nome "Beatriz"
ausente — sem notar que a Beatriz da ficha v2 virou "autora do caderno" em vez
de a mulher na cama.

**Classe do defeito**: a re-ficha da retomada regenera a cena a partir da
fundação sem validar contra a **prosa aprovada** dos capítulos anteriores. A
`memoria_prosa` (fatia H) existe para isso e não protegeu — o extrator rodou 1
vez (após a aprovação do cap 1), mas nenhum gate confronta ficha nova × memória.
É defeito de **composição/verificação**, da mesma família do bug da cascata:
mecânico, testável, não é limiar. **Não consertei** — o enunciado desta fase era
parar e relatar, e o autor mandou parar.

Este é o falso-negativo que a tarefa mandava caçar, em versão pior: não foi
"capítulo fraco passou" — foi "contradição frontal de continuidade não
detectada por nenhuma das quatro camadas que existem para isso" (validação de
ficha, escritor com contexto do cap anterior, auditor factual, conformidade).

## ACHADO Nº 2: o tique que o autor reconheceu — medido e aprovado como voz

A frase que derrubou a confiança do autor:

> *"Não é olhar de quem procura. É olhar de quem já achou e está conferindo se
> continua no lugar."* (cap 2)

O molde ("Não é X. É Y." / eco-negação com coda) está no capítulo 1 **aprovado**,
repetidamente:

- *"Não é frieza. É que a manutenção eu sei nomear."*
- *"Não emperrada: fechada."*
- *"Isso não é acordar [...]: é abertura ocular espontânea"*
- *"Não limpa de quem passou pano [...]. Limpa de esta semana."*
- *"Ele não está prometendo silêncio: está me concedendo o meu"*

E no capítulo 2, além da frase acima: *"O silêncio dele não é ausência. É uma
coisa que está acontecendo"*, *"Papel de carta a gente escreve para alguém.
Diário a gente escreve para si."* (aforismo gnômico de manual).

**O sistema viu e absolveu.** Parecer final do capítulo 1: `sanfona` medida
**13** vezes, personificação **7** — **todas as 20 dispostas como
falso_positivo**, triagem e decisão cara concordando ("das 13 sanfonas, 12 são
enumeração clínica concreta ou dedução que avança"). Notas 5/5/4/5/5/4,
`correcoes: 0`.

Compare as três medições da mesma voz, mesmo detector:

| rodada | sanfona medida | confirmada como defeito |
|---|---|---|
| 1 (03/08, cap 1 antigo) | 10 | 3 (após cascata) |
| 2 (04/08, cap 1 novo) | 13 | **0** |
| 2 (04/08, cap 2) | (bloqueado antes do fim) | — |

O detector é consistente; **o julgamento não é** — e tende à leniência. O
desenho diz "detector é consultivo, quem decide é o revisor", e o revisor decide
sistematicamente que o molde é a voz da narradora. Treze vezes num capítulo de
2.784 palavras não é voz; é cadência de fábrica. A régua não tem hoje nenhum
mecanismo que capture **frequência do mesmo molde** como defeito quando cada
instância, isolada, é defensável — e é exatamente assim que o tique sobrevive.

Registro também a **repetição estrutural entre capítulos**: a cena da gaiola
limpa é executada quase idêntica nos caps 1 e 2 ("limpa... esta semana" nos
dois; a descoberta re-encenada como se fosse nova), e os gates de repetição
(quase-literal e semântica) não dispararam.

## F6 — Leitura integral dos 2 capítulos (feita por mim, sem delegar)

**Capítulo 1 (aprovado): é bom.** A competência clínica constrói a narradora
("folga de um dedo, nem mais nem menos, porque frouxo desloca e apertado
macera"); a releitura da frase do marido ("*A senhora não precisa* — não *eu não
vou* [...] quem concede pode recolher") é suspense de gente grande; o fecho
("ninguém me ofereceu nada às onze e vinte. Ele me adiantou. [...] eu ainda não
sei quanto devo") paga o capítulo inteiro. Fraquezas: a densidade de jargão nos
parágrafos de procedimento, e o molde do achado nº 2 em dose alta.

**Capítulo 2 (bloqueado): mais fraco, e não só pela troca de paciente.** O
melhor beat é a descoberta do caderno ("A primeira página foi escrita por último
e foi posta na frente" — excelente). Mas o capítulo re-encena o 1 em vez de
avançá-lo: gaiola de novo, degrau de novo, a "conta aberta" ruminada de novo; e
a densidade do tique sobe. Com a premissa quebrada (paciente trocado), é
impublicável independentemente da prosa.

**Cruzamento pedido pelo enunciado**: o capítulo que os gates aprovaram com
4,7/5 de média carrega 20 ocorrências medidas do maneirismo, todas absolvidas, e
o capítulo seguinte contradiz o aprovado na premissa física central sem que o
gate de contradição dispare. **EM DESTAQUE: as duas falhas são de
falso-negativo — o sistema hoje reprova pelo refinado e deixa passar o
estrutural.**

---

## Evidências do congelamento que caducaram

Aceito pelo autor antes da rodada. Provadas contra `9a84cf0` (código congelado
em `d2a909a`), caducaram com o commit `ddfe468` (worker/src mudou → fingerprint
mudou):

1. `migracoes_remotas` (8 tabelas, 85 colunas, RLS 8/8)
2. `integracao_real` (14 passos, 7 artefatos com hash conferido)
3. `ui_autenticada` (sessão real, 7 sha256 batendo byte a byte)
4. `provedor_real` (disponibilidade, pin, timeout, recusa de modelo inválido)

A quinta (`papeis_reais`) já não existia — parada no PASSO 2 por não convencer.
Refazê-las custa ~1 execução do gerador cada, quando houver motivo.

## O que esta rodada PROVOU

- O conserto da cascata funciona em produção: parecer nunca mais saiu
  contraditório, correção dirigida circulou, capítulo atravessou até aprovação
  com evidência.
- O regime de custo é estável e conhecido: ~200k tokens_out / ~50 min por
  capítulo aprovado em ciclo limpo.
- A retomada por estado funciona (6 lançamentos, zero perda de estado).
- O sistema falha fechado ao certo: sinal inventado pelo revisor foi recusado
  pela régua anti-fabricação.

## O que esta rodada DERRUBOU

- **Confiança na re-ficha da retomada**: ela alucina premissas contra a prosa
  aprovada e nada a confere (achado nº 1).
- **Confiança no julgamento de maneirismo na voz hoover**: 20 ocorrências
  medidas, 0 confirmadas, no capítulo aprovado (achado nº 2). O julgamento
  drifta para a leniência entre rodadas.
- A projeção "12 caps ≈ 2,4M" pressupõe 1º ciclo limpo — o cap 2 gastou 306k e
  não aprovou.

## Decisão do autor, registrada

> "Mesmo tique de sempre, não dá pra confiar no sistema, no escritor ou nas
> skills. Pare e reporte tudo."

Parado. Nada mais foi executado depois da coleta deste relatório. Se um dia a
rodada 3 existir, os dois alvos que este relatório deixa nomeados, em ordem:

1. **Gate de continuidade ficha × prosa aprovada** (mesma família do conserto da
   cascata: composição, com teste que reproduz a troca Beatriz→Otávio) — e a
   retomada deveria **reutilizar ficha validada** em vez de regenerá-la.
2. **Frequência de molde como sinal** — o detector já conta; falta a régua
   tratar 13 instâncias/capítulo do mesmo molde como defeito de cadência mesmo
   quando cada uma, sozinha, é defensável. Medido, não afrouxado.

## Anexos

- `canario-2-capitulos/capitulo-01-APROVADO-COM-EXCECAO.md` (2.784 palavras)
- `canario-2-capitulos/capitulo-02-BLOQUEADO.md` (2.564 palavras)
- Projeto em disco: `~/atelier-work/canario-v2-hoover-mcfadden-97dd7390`
  (estado, runs.jsonl, reviews.jsonl, specs.jsonl — toda a contabilidade citada)
