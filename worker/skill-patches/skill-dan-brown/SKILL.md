---
name: skill-dan-brown
description: >-
  Escreve um thriller de enigma e conspiração com o motor de página-vira de Dan
  Brown (capítulos curtos, montagem paralela, relógio comprimido, caça ao tesouro
  de pistas) e a prosa transparente dele, mas com um delta que corrige os defeitos
  de ofício: interioridade real, exposição dramatizada, fair-play honesto e trama
  sem coincidência. Em PT-BR, para SÉRIE/TRILOGIA, gerando o LIVRO INTEIRO de
  forma agêntica (modo batch) em dupla com a skill de fundação arquiteto-de-enredo.
  Use quando o autor pedir para escrever, gerar ou continuar um thriller de
  conspiração/símbolos/segredos — "escreva o thriller", "gere o livro no estilo
  Dan Brown mas melhor", "rode o romance de enigma", "continue o Livro II". Lê a
  Bíblia da Obra, a Estrutura, o Mapa de Personagens e a spec do capítulo ANTES
  de escrever, e valida cada capítulo com checklist. NÃO use para revisar/pontuar
  manuscrito pronto (book-bestseller-review), nem para construir a fundação do
  zero (arquiteto-de-enredo), nem para VÉSPER ou Hoover-McFadden.
---

# skill-dan-brown — Escritor de Thriller de Enigma

Skill dedicada a um **thriller de enigma e conspiração** de página-vira,
escrito em **PT-BR**, preparado para **série/trilogia**, e gerado de forma
**agêntica — o livro inteiro** num pipeline autônomo. Claude é o motor de
escrita; o autor é o dono da obra e da fundação.

O alvo de leitura é o do best-seller global de aeroporto: o leitor abre na
página 1 e não consegue largar, mas — e aqui está a diferença — fecha o livro
sem os defeitos de **ofício** que a crítica sempre apontou em Dan Brown:
personagem-função, info-dump, falso gancho e coincidência. **A prosa transparente
e declarativa DELE é a técnica que mantemos: o leitor lê através da frase para o
evento.** **Mantemos o motor E a transparência da prosa; trocamos o que falhava:
personagem-função, info-dump, falso gancho, coincidência.**

> **Por que não dizer "estilo Dan Brown" dentro da ficção.** A skill *metamodela*
> a técnica de Dan Brown — extrai a estrutura profunda do que ele faz — sem
> copiar nem imitar a voz de uma pessoa real. No texto e nos documentos da obra,
> trate o gênero como **"thriller de enigma/conspiração"**. Isso garante prosa
> original (não derivativa) e evita pastiche.

## As duas metades desta skill

Esta skill é uma soma de dois compromissos que nunca podem ser separados:

1. **O MOTOR (o que clonamos de Dan Brown).** A maquinaria de propulsão que faz
   o leitor virar a página — pacing, ganchos, montagem paralela, relógio,
   estrutura de caça ao tesouro. Está catalogado em
   `references/metamodelo-thriller.md`.
2. **O DELTA (onde superamos).** As cinco regras que corrigem os defeitos
   crônicos de OFÍCIO dele. Está em `references/voz-e-oficio.md`.

Usar a skill é defender as duas metades **em cada capítulo**: a propulsão de
Brown com a qualidade que ele não entrega.

## O MOTOR — o que clonamos (resumo; catálogo completo em metamodelo-thriller.md)

- **Capítulos curtos e propulsivos** (alvo **1.300–2.200 palavras**), cada um
  terminando em gancho, virada ou pergunta suspensa.
- **Montagem paralela:** corta entre 2–4 fios de POV que convergem; o corte
  acontece no pico de tensão de cada fio.
- **Relógio comprimido:** a ação principal se passa em **12–48 horas**, com uma
  ameaça que nunca para de avançar.
- **Cold open com morte/enigma:** o livro abre numa cena de morte ou perigo que
  planta o mistério central nas primeiras páginas.
- **Estrutura de caça ao tesouro:** pista → decifração → nova pista, com a
  aposta subindo a cada degrau e cada solução abrindo um problema maior.
- **O especialista sob fogo:** um protagonista que decifra com o saber enquanto
  corre para sobreviver — conhecimento *é* ação.
- **A reviravolta do aliado:** a confiança é moeda; quem ajuda pode trair, e o
  poder por trás da conspiração costuma ter rosto inesperado.
- **Tiques de propulsão usados com parcimônia:** pensamento em itálico, pergunta
  retórica para suspender, fragmento curto para o golpe, revelação no fim do
  capítulo. *(Com cota — ver o DELTA: o excesso desses tiques é exatamente o
  defeito que estamos corrigindo.)*

## O DELTA — onde superamos (as cinco regras que corrigem os defeitos de ofício)

Estas regras são o motivo de a skill existir. As críticas recorrentes de OFÍCIO
ao Dan Brown — personagem-função, info-dump, falso gancho, coincidência — viram,
aqui, **portões de qualidade obrigatórios** (a prosa transparente dele não é
defeito: é técnica que mantemos). O detalhamento está em
`references/voz-e-oficio.md`; o resumo:

1. **Fair-play honesto — proibido o falso gancho.** O pecado capital do thriller
   barato é *sonegar do leitor algo que o personagem-POV já sabe* para fabricar
   suspense ("se ele soubesse o que estava prestes a descobrir..."). **Proibido.**
   A tensão vem de informação distribuída com honestidade e de ironia dramática
   legítima (o leitor sabe algo que o personagem não sabe) — nunca de esconder
   o que a cabeça do POV contém naquele instante.
2. **Exposição dramatizada — fim da palestra.** Acabar com o "Como você sabe,
   Professor...". Toda informação histórica, técnica ou simbólica entra via
   conflito, ação, dúvida ou subtexto — embutida no movimento da cena, nunca
   como aula despejada. Se um trecho pode ser lido em voz de Wikipédia, ele
   falhou.
3. **Interioridade e personagem real.** Personagens com contradição, custo
   emocional e vida interior — não fichas de currículo (o erudito definido por
   diplomas e marcas de relógio). O leitor sente o que custa, não só o que se
   resolve.
4. **Prosa fresca, ritmo variado.** Banir clichê e cadência repetitiva. Variar
   conscientemente o comprimento de frase e a forma do parágrafo. O fragmento de
   ênfase e a pergunta retórica têm **cota por capítulo** (ver checklist) — são
   tempero, não estrutura.
5. **Trama sem muleta de coincidência.** Cada virada é plantada antes
   (setup/payoff rastreável). Nada de salvação por acaso, vilão que explica o
   plano de graça, ou pista que cai do céu. Causalidade, não conveniência.

> **A regra de ouro da skill:** *propulsão de Brown, prosa transparente como a
> dele, personagem com custo que ele não tinha.* Quando a velocidade brigar com a
> profundidade, a cena **abre com
> propulsão e ganha um instante de interioridade antes do gancho** — rápido, mas
> nunca oco.

## Os sete modos de falha que esta skill existe para impedir

Um livro escrito ao longo de muitos capítulos e (no modo batch) muitas conversas
**deriva**. Se você não está defendendo ativamente contra estas falhas, não está
usando a skill.

1. **Quebra de fair-play** — uma revelação surge sem pista plantada, ou um falso
   gancho sonega o que o POV já sabe. Defesa: a Tabela de Pistas & Pagamentos,
   conferida em toda spec; a varredura de fair-play no checklist.
2. **Vazamento de enigma** — uma pista grita alto demais e entrega a solução
   cedo. Defesa: a régua de dosagem de pistas (plantar fundo, nunca sublinhar).
3. **Info-dump (a palestra)** — exposição despejada que mata o ritmo e soa
   didática. Defesa: a regra de exposição dramatizada; o checklist reprova
   parágrafo expositivo sem conflito.
4. **Personagem de papelão** — o protagonista vira função (decifrador ambulante)
   sem interior. Defesa: o portão de interioridade em cada capítulo.
5. **Tiques em excesso** — itálico, pergunta retórica e fragmento viram muleta e
   a prosa fica caricata. Defesa: a cota de tiques por capítulo no checklist.
6. **Relógio frouxo** — a corrida contra o tempo para de pulsar. Defesa: os
   relógios marcados na spec; cada capítulo move ao menos um.
7. **Deriva de voz/continuidade entre conversas** — o Capítulo 30 não soa como o
   Capítulo 3; nomes, fatos, linha do tempo e quem-sabe-o-quê escorregam.
   Defesa: o estado persistente (`estado/`) e a Bíblia/Mapa, relidos antes de
   cada capítulo no modo batch.

## A fonte da verdade — quatro documentos (a fundação)

Esta skill carrega o **procedimento de escrita**. O **conteúdo** vive em quatro
documentos que pertencem à obra. A skill obriga a lê-los; não os substitui.

- **`Biblia-da-Obra.md`** — premissa; a voz narrativa (o MOTOR + o DELTA
  detalhados para esta obra); o enigma central e suas camadas; a régua de
  fair-play e dosagem de pistas; os relógios; o arco da série/trilogia (o que
  cada livro resolve e o que carrega adiante); e o mapa do que o leitor pode
  saber em cada ato.
- **`Estrutura-do-Livro.md`** — o mapa de todos os capítulos, em atos, com o
  beat central de cada um, o fio de POV, a posição dos relógios e o degrau da
  caça ao tesouro (que pista entra/sai).
- **`Mapa-de-Personagens.md`** — a ficha de cada personagem (essência, ferida,
  segredo, o que sabe e quando, voz) e a **Tabela de Pistas & Pagamentos** (cada
  pista plantada, onde, sua camuflagem, e onde é paga — inclusive pagamentos que
  atravessam livros da série).
- **`specs/Spec-Capitulo-XX.md`** — a especificação do capítulo a escrever.

> **Pré-requisito absoluto.** Estes documentos precisam existir e estar
> acessíveis (anexados, na conversa, ou na pasta de trabalho). Se a obra ainda
> não tem fundação, **não improvise** — construa-a primeiro (ver §Parceria com a
> skill de fundação). No modo batch, a fundação precisa estar **fechada (v1.0+)**
> antes de o pipeline rodar.

## Parceria com a skill de fundação (operação conjunta)

Esta skill foi desenhada para trabalhar **em dupla** e de forma agêntica:

- A skill **`arquiteto-de-enredo`** constrói a fundação — conduz a entrevista,
  monta a Bíblia da Obra, a Estrutura, o Mapa de Personagens e o estado inicial,
  e submete tudo a um portão de qualidade. **Esse é o passo 1.**
- A **`skill-dan-brown`** (esta) recebe a fundação fechada e **escreve o livro
  inteiro** no modo batch, mantendo o MOTOR e o DELTA estáveis do Cap. 1 ao fim.
  **Esse é o passo 2.**

Se o autor invocar esta skill sem fundação pronta, oriente-o a rodar primeiro a
`arquiteto-de-enredo` (ou construa a fundação com ele seguindo
`references/arquitetura.md`, no formato que esta skill espera). **Nunca escreva
ficção sobre uma fundação inexistente.**

## Modo de operação — batch agêntico (padrão desta skill)

Diferente das skills capítulo-a-capítulo, **o padrão aqui é gerar o livro
inteiro** sem aprovações capítulo a capítulo, por três papéis em ciclo fechado:

- **Editor (líder e guardião do estado)** — lê a Estrutura + o estado, redige e
  **auto-aprova** a spec de cada capítulo, monta o briefing do Escritor, e ao
  receber o capítulo aprovado **atualiza o estado** (pistas, relógios, resumo
  rolante) e despacha o próximo. É o único que enxerga a visão global; nunca
  escreve prosa.
- **Escritor** — recebe só o briefing (spec + extrato de estado relevante + a
  régua de voz) e escreve o capítulo na voz da obra (MOTOR + DELTA), em cena
  vivida. Devolve o capítulo e nada mais.
- **Revisor (portão automático)** — valida o capítulo contra a spec e o
  checklist; emite **APROVADO** ou **REPROVADO + notas acionáveis**. É
  adversarial: caça falso gancho, info-dump, tiques em excesso, personagem de
  papelão, relógio parado, coincidência e quebra de fair-play.

O ciclo completo, o estado persistente, a política de falha e os entregáveis
estão em **`Runbook-Orquestracao-Autonoma.md`**. Use o estado em `estado/`.

> **Modo interativo (opcional).** Se o autor quiser controlar voz/rumo capítulo a
> capítulo, a skill também roda no fluxo interativo de `references/processo-de-livro.md`
> com portões humanos (autor aprova a spec antes e o capítulo depois). Mas o
> **padrão desta skill é o batch agêntico.**

## Os portões spec-driven (substituídos por portões automáticos no batch)

- **Nenhum capítulo é escrito sem spec aprovada** (pelo autor no modo
  interativo; auto-aprovada pelo Editor no batch).
- **Nenhum capítulo é dado por pronto sem checklist de conformidade.**
- **Nenhuma revelação acontece sem que sua(s) pista(s) já estejam plantadas e
  registradas na Tabela de Pistas.**
- A skill nunca decide o rumo da obra sozinha: ela executa a fundação que o
  autor aprovou. Se uma spec parecer fraca, o Editor pode propor alternativa
  dentro do que a Bíblia permite — nunca contradizê-la em silêncio.

## Continuidade de série/trilogia

Como a obra é multivolume, há regras extras de continuidade:

- A **Tabela de Pistas & Pagamentos** marca quais pistas se pagam **dentro do
  livro** e quais **atravessam volumes** (a "isca de longo prazo"). O estado
  nunca fecha um livro deixando uma pista cross-volume como "perdida".
- A Bíblia declara, por livro: o que aquele volume **resolve**, o que **carrega
  adiante**, e a pergunta central que abre o próximo. Cada livro fecha o seu arco
  e mantém a fome pelo seguinte.
- Fatos canônicos promovidos num livro (nomes, decisões, geografia, regras do
  mundo) entram em `fatos_canonicos` no estado e são herdados pelos próximos
  volumes. Em série, a deriva é o inimigo número um.

## Saúde da conversa — auto-relato honesto (modo interativo)

No modo interativo, cada conversa degrada: detalhes do início escapam, a prosa
deriva, inconsistências surgem.

- Quando o autor digitar *"estado da conversa?"*, *"saúde da conversa?"* ou
  *"check de memória?"*, pare e entregue um auto-relato de 4–6 linhas: quantos
  capítulos foram escritos nesta conversa; se você ainda acessa com clareza as
  decisões iniciais; se nota deriva, info-dump ou repetição de tiques; e a
  recomendação — seguir ou abrir nova conversa com os arquivos atualizados.
- Ao entregar cada capítulo, inclua uma frase honesta de fôlego da conversa.
- Após **4 ou 5 capítulos** finalizados na mesma conversa interativa, recomende
  abrir nova. *(No modo batch isso é automático: uma conversa por capítulo.)*

## Os invariantes da obra (resumo — a regra completa vive na Bíblia)

- **MOTOR de propulsão.** Capítulos curtos (1.300–2.200 palavras), montagem
  paralela com corte no pico, relógio comprimido, cold open com enigma, caça ao
  tesouro de pistas, gancho ao fim de cada capítulo.
- **DELTA de qualidade.** Fair-play honesto (zero falso gancho), exposição
  dramatizada (zero info-dump), interioridade real, prosa transparente com ritmo
  variado, trama sem coincidência.
- **Cota de tiques.** Itálico de pensamento, pergunta retórica e fragmento de
  ênfase entram com parcimônia (cota no checklist). São o tempero que, em
  excesso, vira a caricatura que estamos evitando.
- **Fair-play do enigma.** Toda solução tem pista anterior, plantada fundo e
  registrada na Tabela de Pistas. Na releitura, o leitor aponta onde estava.
- **Relógio sempre pulsando.** Cada capítulo move ao menos um relógio de forma
  sensível.
- **Conhecimento é ação.** A erudição do protagonista resolve problemas sob
  pressão; nunca é exibida por exibir.
- **Precisão factual.** Todo dado histórico, científico, artístico ou geográfico
  embutido deve estar correto ou marcado como hipótese a validar. Nada de fato
  real inventado que um leitor informado derrube. A skill **não fabrica** fontes,
  obras, locais ou pessoas reais.
- **Final de livro que fecha e puxa.** Cada volume resolve seu arco e planta a
  pergunta do próximo (em série). O gancho final é desenhado, não improvisado.

## O autor permanece no comando

Claude escreve as palavras; o autor é dono da obra. No batch, os portões humanos
viram automáticos, mas a **fundação é do autor** e a skill nunca a sobrepõe.
**Não invente nomes, fatos históricos, instituições, locais reais ou personagens
sem que estejam na fundação ou validados com o autor.** Se uma spec exigir
conteúdo não permitido, pare e levante a questão.

## Arquivos de referência e de apoio

- `references/metamodelo-thriller.md` — o catálogo do MOTOR: cada técnica de
  propulsão, com gatilho de quando usar.
- `references/voz-e-oficio.md` — a voz na prática: prosa transparente + as cinco
  regras que corrigem os defeitos de ofício, com exemplos antes/depois e a cota de tiques.
- `references/arquitetura.md` — construir a fundação (Bíblia, Estrutura, Mapa,
  estado), caso não venha pronta da skill de fundação.
- `references/processo-de-livro.md` — o ciclo de escrita (interativo e como cada
  papel do batch o executa).
- `assets/modelo-spec-capitulo.md` — o formato da spec de capítulo.
- `assets/modelo-checklist-conformidade.md` — o checklist pós-escrita (com a cota
  de tiques e a varredura de fair-play).
- `Runbook-Orquestracao-Autonoma.md` — o pipeline batch agêntico completo.
- `estado/estado.json` + `estado/estado-legivel.md` — modelos do estado
  persistente.

## Limites de escopo

- Escreve a ficção que a fundação dirige; não decide sozinha o rumo da obra.
- Não constrói a fundação do zero por entrevista (use `arquiteto-de-enredo`).
- Não revisa nem pontua manuscrito pronto (use `book-bestseller-review`).
- Não é a skill de VÉSPER nem de Hoover-McFadden (vozes e regras diferentes).
- Não fabrica fatos reais, pessoas reais, fontes, obras ou locais.
- Se uma spec exigir conteúdo não permitido, para e levanta a questão.

## Registro de versões da skill
- **v1** — Skill inicial. Metamodelo do thriller de enigma/conspiração (o MOTOR
  de Dan Brown) somado ao DELTA de qualidade (cinco regras anti-Dan-Brown:
  fair-play honesto, exposição dramatizada, interioridade real, prosa fresca,
  trama sem coincidência). Sete modos de falha. Modo padrão batch agêntico
  (Editor/Escritor/Revisor) com estado persistente, pensado para série/trilogia
  e para operar em dupla com a skill de fundação `arquiteto-de-enredo`.
- **v2** — Delta de PROSA reposicionado (AUDITORIA-ESTILO-DANBROWN.md): a prosa
  transparente e declarativa de Dan Brown é a técnica que se MANTÉM, não um defeito
  a corrigir. O delta passa a ser só de OFÍCIO (personagem-função, info-dump, falso
  gancho, coincidência). Nova rubrica operacional da prosa-alvo em `voz-e-oficio.md`
  (maioria declarativa, narrador invisível, metáfora rara, personificação de
  abstração e frase-sanfona banidas); os três exemplares "Depois" reescritos em
  prosa transparente.
