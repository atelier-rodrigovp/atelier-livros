# Relatório — Canário longo (hoover-mcfadden), 2026-08-03

> # O canário escreveu 1 capítulo dos 12. Não 12, não 11: **UM**.
>
> E o capítulo saiu **reprovado** — mas não por ser ruim. Foi reprovado porque o
> revisor entregou um parecer internamente inconsistente: confirmou uma violação e
> deixou a lista de correções vazia. O canário parou ali.
>
> **A pergunta que a tarefa queria responder — a qualidade cai no miolo? — ficou
> SEM RESPOSTA.** Não há miolo. Não há deriva a medir.

---

## O que aconteceu, na ordem

| momento | evento |
|---|---|
| 17:44 | canário inicia; fundação gerada (6 fios, promessa editorial) |
| 17:54 | **cota de sessão esgota** no capítulo 1 — `You've hit your session limit · resets 6:30pm` |
| 18:32 | cota reseta; retomo com `--dir`, fundação reaproveitada |
| 22:26 | capítulo 1 sai **reprovado** após 4 escritas e 27 runs; canário encerra (RC=0) |

```
fundação ok · fios: O Canário, Os 41 minutos, O caso de dez anos, O corpo que escuta, A curatela, A filha
— capítulo 1/12…
   → reprovado (violação confirmada sem correção solicitada: sanfona) · runs: 22
```

O canário para no primeiro capítulo reprovado — por desenho. Não é travamento.

---

## F2 — Log por capítulo

```
cap | pal  | escritas | runs | falhas | tokens_out |  min | vereditos
  1 | 2397 |        4 |   27 |      5 |     199370 |   54 | reprovado
      erros: PROVEDOR_LIMITE, FORA_DO_SCHEMA
```

Detalhe por papel (do `runs.jsonl`, persistência isolada em disco):

```
  arquiteto_enredo     ok=1 falha=1 out= 21615
  arquiteto_cena       ok=1 falha=3 out=  2166
  contextualizador     ok=1 falha=0 out=  1948
  escritor             ok=4 falha=0 out= 37766
  revisor_literario    ok=4 falha=2 out=100703
  revisor_decisao      ok=4 falha=0 out= 31964
  auditor_factual      ok=4 falha=0 out= 14274
  conformidade_ficha   ok=4 falha=0 out= 10549
```

- **4 escritas** do mesmo capítulo (3 regens depois da primeira).
- **O revisor custa mais que o escritor**: 100.703 contra 37.766 tokens de saída —
  2,7× mais caro julgar do que escrever. Somando revisor_literario +
  revisor_decisao (a cascata), o julgamento consome **132.667**, ou 67% do
  capítulo.
- As 3 falhas do `arquiteto_cena` foram `FORA_DO_SCHEMA`; as do
  `revisor_literario`, `PROVEDOR_LIMITE` (a cota).

---

## F3 — Tabela de deriva

```
=== DERIVA: capítulos 1–4 × 9–12 ===
INSUFICIENTE: bloco 1-4 tem 1 cap(s), bloco 9-12 tem 0 cap(s)
```

**NÃO MEDIDA.** Com um capítulo não existe comparação início × miolo. Qualquer
número que eu apresentasse aqui seria invenção.

O que deu para medir, e vale registrar como linha de base para a próxima rodada:

```
=== repeticao verbatim cross-capitulo (frases >= 8 palavras) ===
  total: 0 repeticao(oes) literal(is) entre capitulos distintos   (trivial: só há 1 capítulo)

=== POV por capitulo (das fichas) ===
  {"Teresa, primeira pessoa, passado próximo": 1}
```

---

## F4 — Custo real, medido

| item | valor |
|---|---|
| fundação | 21.615 tokens de saída (2 runs) |
| capítulo 1 | **199.370 tokens de saída** (27 runs, 54 min) |
| **total da rodada** | **220.985 tokens de saída** |

> **PROJEÇÃO para 60 capítulos: ~11,96 milhões de tokens de saída**
> (199.370 × 60), mais fundação. É **PROJEÇÃO**, extrapolada de UM capítulo —
> a base mais fraca possível. Em tempo de parede: 54 min/cap × 60 = **~54 horas**
> de execução contínua.

**Correção da estimativa que apresentei antes de começar.** Eu projetei ~696k
tokens/capítulo a partir do canário hoover anterior (`aa8af83f`: 1.391.983 tokens
para 2 capítulos). O número real do código atual é **199.370 — 3,5× menor**. A
estimativa velha estava contaminada pela tempestade de 854 falhas do
`arquiteto_cena` de 2026-07-21/22, que o `TETO_FALHAS_INFRA` já contém. O código
atual está muito mais barato do que o histórico sugeria.

**`tokens_in` continua inútil** (2 por run, como no PASSO 2). Só `tokens_out` serve.

---

## F5 — Leitura direta

O enunciado pedia 3 capítulos (início, meio, fim). **Só existe um.** Li o capítulo
1 inteiro, do começo ao fim. Está anexado em
`canario-longo-capitulos/capitulo-01-REPROVADO.md` (2.397 palavras).

### Veredito honesto: a prosa é boa. Melhor do que eu esperava.

Não é "boa para máquina" — é boa. O que sustenta isso, com o texto na mão:

**1. A competência técnica cria autoridade.** A narradora é enfermeira e o texto
sabe ser enfermeira: *"Traqueostomia com cânula de número seis, cadarço de fixação
com dois dedos de folga"*, *"Sonda número doze, sem vácuo na descida, com vácuo na
subida, movimento circular, menos de dez segundos, uma passada só."* O leitor
acredita nela porque ela sabe fazer o trabalho. Isso é caracterização por ofício,
não por adjetivo.

**2. A narradora não-confiável funciona por OMISSÃO, e a omissão é estrutural.**
O capítulo gasta um parágrafo inteiro na papelada — Campo 3, 3.1, 3.2, Campo 5 —
com precisão obsessiva. Só na última página o leitor entende que aquela precisão
era o disfarce: *"Três semanas montando essa coincidência."* A minúcia burocrática
não era cor local; era a personagem escondendo o que fez. Isso é ofício de
verdade, e é exatamente o que a ficha pedia ("precisão excessiva ao descrever a
papelada da substituição").

**3. O plantio paga.** A agenda de 2016 sobre o canário que canta no escuro —
*"o pano engana os olhos dele e não engana o relógio dele. Um corpo pode obedecer
a uma coisa e ignorar todas as outras ao mesmo tempo"* — é metáfora estrutural da
paciente em coma, plantada sem sublinhar. Amarra com o fio "O Canário" da
fundação. A gaiola vazia com o forro remendado, o envelope da Vara de Família sob
a caneca, a chave no bolso dele e não no prego: tudo é detalhe que promete.

**4. O truque dos dois relógios é limpo.** Cozinha marca 00h13, monitor marca
23h58. A narradora descarta com naturalidade ("pilha velha, alguém adiantou de
propósito"). O leitor guarda. É suspense construído, não anunciado.

**5. O gancho vira a percepção.** *"Ele não perguntou o que eu estou fazendo aqui
porque não precisava perguntar. E o meu nome já estava na escala na terça, antes
de eu pedir na quarta."* Fecha o capítulo abrindo o livro.

**Onde é fraco:** o parágrafo da conferência de equipamentos (bomba, equipo,
ausculta, vácuo, ambu, cânulas) é denso e longo; um leitor sem paciência para
jargão desliza. E o revisor tem razão num ponto de cadência — volto a ele abaixo.

Se este capítulo chegasse a mim como primeiro capítulo de um manuscrito, eu
continuaria lendo.

---

## A CAÇA A FALSO-NEGATIVO — e o que encontrei foi pior

A tarefa pedia: se a prosa parecer fraca e os gates disserem que está boa, isso é
falso-negativo e é o achado mais importante. **Aconteceu o inverso, e é mais grave.**

### Os gates deram nota alta e reprovaram assim mesmo

Notas do revisor, por eixo (0–5):

```
dramatic_progression=5  skill_adherence=5  clarity=4
emotional_effect=4      continuity=5       hook_effectiveness=4
```

Seis eixos, média 4,5/5. **Nenhum gate estrutural falhou** (`gatesFalhos: []`).
E o veredito foi `reprovado`.

### Por quê: o parecer se contradiz

```json
{ "sinal": "sanfona", "valor": 10, "disposicao": "violacao_confirmada",
  "falsos_positivos": 7, "ocorrencias_citadas": [ {"indice":3}, {"indice":5}, {"indice":10} ] }
```
```json
"correcoes": []
```

A regra do sistema (`tarefas.ts`): *"Qualquer `violacao_confirmada` exige entrada
correspondente em `correcoes` e veredito `reprovado`."* O revisor confirmou a
violação e **não pediu correção nenhuma**. O gate detectou a inconsistência —
corretamente — e reprovou: `violação confirmada sem correção solicitada: sanfona`.

Resultado prático: o capítulo é bloqueado **sem instrução de como consertar**. Não
há caminho de correção dirigida. O canário para.

### A causa é a composição da cascata

Lendo o texto do parecer, dá para ver as duas passadas coladas:

- A **triagem** (`revisor_literario`) julgou as 10 ocorrências como falso positivo:
  *"As dez ocorrências são enumerações descritivas concretas ou interioridade que
  avança … explicitamente exemplificadas pelo contrato como não-sanfona."*
- A **segunda passada** (`revisor_decisao`) reverteu 3 delas, e as revisões
  aparecem emendadas no mesmo campo, prefixadas por `· decisão:`.

A cascata atualizou `sinais` (de falso positivo para violação confirmada) e **não
atualizou `correcoes`**. O delta mexeu num campo e deixou o outro para trás.

**Não investiguei o código nem consertei** — o enunciado manda parar e relatar
quando aparece bug, e consertar no meio misturaria duas medições. Fica localizado
para o próximo passo: o ponto é onde `aplicarDelta` (cascata.ts) compõe o parecer
da decisão sobre o da triagem.

### A reprovação era justa, no mérito?

Julguei as 3 ocorrências citadas, uma a uma:

| # | trecho | meu julgamento |
|---|---|---|
| 3 | *"Ele não pergunta desde quando estou na agência, se eu sabia que era aqui, se ainda moro do outro lado do rio, nada do que uma pessoa pergunta…"* | **funcional.** A coda é o que produz o estranhamento. Não cortaria. |
| 5 | *"Bastava dizer que houve confusão de escala, que a Prontacare ligaria de manhã, que eu volto de metrô sem cobrar…"* | **começa a repetir.** Mesma arquitetura da 3. |
| 10 | *"O quarto tem o bipe, o chiado do fluxo, o estalo do aquecedor esfriando, e a respiração dela…"* | **procede em parte.** Relista sons já nomeados — mas a coda ("um som de gente viva que não é som de gente dormindo") acrescenta. |

A observação de fundo do revisor é **fina e legítima**: três vezes no mesmo
capítulo a mesma arquitetura (três orações coordenadas + coda generalizante) vira
tique de cadência. Isso é crítica de line-edit de bom nível.

**Mas isso não justifica reprovar o capítulo.** É uma nota de revisão — "varie a
arquitetura destas três frases" — não um defeito estrutural. O capítulo tem
evento, virada, gancho, voz e planta pelo menos quatro coisas que pagam depois.
E a prova de que o próprio sistema concorda são as notas: 5, 5, 4, 4, 5, 4.

### O número que resume o problema

Contei todas as ocorrências que os detectores dispararam e quantas sobreviveram ao
julgamento do revisor:

```
  personificacao                 valor= 3 -> falso_positivo (fp: 3)
  sanfona                        valor=10 -> violacao_confirmada (citadas: 3, fp: 7)
  cadencia.anáfora               valor= 3 -> excecao_valida
  cadencia.pensamento em itálico valor= 4 -> falso_positivo (fp: 3)
  gancho_final                   valor=indefinido -> falso_positivo

ocorrencias DISPARADAS pelos detectores: 21
julgadas defeito REAL pelo revisor:       3
taxa de falso positivo dos detectores:    86%
```

**86% de ruído.** Isso confirma, em produção e na voz hoover, exatamente o que a
investigação de 2026-07-21 já tinha medido (precisão de `contarSanfona` entre 0 e
15% nessa voz) e que o PASSO 1 documentou em `limitacoes-conhecidas.ts`.

O `gancho_final` é caso à parte e merece nota: o classificador devolveu
`indefinido` para um capítulo cujo gancho **está lá, explícito**, no formato que a
ficha pediu. O revisor teve de consertar o detector na mão: *"Falha de
classificação automática, não ausência de gancho."*

**Em uma frase:** os detectores erram 86% das vezes, o revisor gasta a maior parte
do orçamento de tokens desfazendo esses erros (100.703 tokens, 2,7× o escritor), e
mesmo assim um erro de forma no parecer derruba um capítulo que o próprio sistema
avaliou com 4,5/5.

---

## F6 — Autorização revogada

### ANTES
```json
{ "id": "d681e0f8-…", "project_id": "1b5aa697-…", "modo": "canario",
  "ativo": true, "revoked_at": null }
ATIVAS: 1
```

### DEPOIS
```json
{ "modo": "canario", "ativo": false, "revoked_at": "2026-08-03T22:32:08.479+00:00" }
ATIVAS: 0
```

---

## O que não ficou provado

### 1. A pergunta central da tarefa ficou sem resposta
A V2 sustenta o miolo? **NÃO SEI.** Um capítulo não diz nada sobre deriva. A V1
desandava entre os capítulos 20 e 40; este canário não passou do 1. O risco
continua exatamente onde estava.

### 2. O que este canário PROVOU
- A fundação da voz hoover sai coerente (6 fios, promessa editorial, arcos).
- O pipeline percorre todos os papéis do capítulo: ficha → contexto → escrita →
  revisão → cascata → auditoria → conformidade.
- Um capítulo de 2.397 palavras, lido por mim, tem qualidade literária real.
- O custo do código atual é **3,5× menor** que o histórico sugeria.
- Os gates são rigorosos a ponto de reprovar por inconsistência de forma — o que é
  bom desenho — mas o produtor do parecer não cumpre o próprio contrato.

### 3. Ressalvas metodológicas da rodada
- **Rodei com `--disco`.** O canário gera UUID próprio e persiste no Supabase, mas
  `engine_state` tem FK para `projects` (confirmei: erro `23503`). Tentei semear o
  diretório com o UUID do projeto que criei e o gate recusou, corretamente:
  `CANARIO_MODELO_DIVERGENTE: diretório retomado não comprova os modelos fixos`.
  Não forjei o `modelos-release.json`; rodei isolado em disco. Consequência: o
  projeto `1b5aa697` e sua autorização ficaram **sem uso** — o canário não lê
  `engine_autorizacoes_v2` (confirmado: `grep exigirReleaseAtual` não retorna nada
  em `v2-canario.ts`).
- **O canário atravessou uma janela de cota.** Parou às 17:54 por limite de
  sessão, retomei às 18:32. A fundação foi reaproveitada; nada foi perdido nem
  pago duas vezes.
- **Uma única amostra.** Tudo aqui — custo, regens, taxa de falso positivo — vem de
  UM capítulo. São medições reais, não são médias confiáveis.

### 4. O que não foi feito de propósito
- **Não re-rodei.** O enunciado é explícito: fase de escrita não tem tentativa, e
  bug encontrado se relata, não se contorna.
- **Não consertei o bug da cascata.** Localizado, não tocado.
- **Não anexei 3 capítulos** — só existe um. Está em
  `canario-longo-capitulos/capitulo-01-REPROVADO.md`, com o `perfil-de-voz.md` ao
  lado para contexto.
- Nenhum limiar, cota, `meta_nota`, `max_reescritas` ou `contrato.json` foi tocado.
  Nenhuma prosa foi editada à mão. Nenhum projeto antigo foi usado.

### 5. O que eu faria a seguir, se fosse decisão minha
Consertar a composição da cascata (o delta que reverte um sinal precisa produzir a
correção correspondente) é pré-requisito de qualquer canário longo na voz hoover —
sem isso, o capítulo 1 é uma parede. É barato: um ponto em `cascata.ts`, com teste.
Só depois disso a pergunta do miolo volta a ser respondível.
