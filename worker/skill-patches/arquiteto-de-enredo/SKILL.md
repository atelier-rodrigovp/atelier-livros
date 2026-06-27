---
name: arquiteto-de-enredo
description: >-
  Transforma uma ideia crua de livro num projeto executável: conduz uma entrevista em blocos (perguntas em botões com recomendação), valida a fundação num portão de qualidade e gera o projeto (Bíblia, Mapa de Personagens, Estrutura, estado, cinco subagentes). Use quando o autor quiser começar um livro novo, estruturar um enredo, desenvolver uma premissa, 'montar a fundação', 'criar a bíblia da obra' ou 'estruturar a trama'. Ao fim, grava um ESTADO_LIVRO.json semente (fase ESCRITA) e entrega um prompt agêntico pronto para colar no Claude Code, que escreve o livro inteiro com o motor v2 e revisa com book-bestseller-review. NÃO dispara o /goal. Camada anti-maçada: anti-repetição (Mapa de Conhecimento do Leitor) e densidade por entrelaçamento. Agnóstica de gênero. NÃO use para escrever capítulos nem revisar manuscrito pronto (book-bestseller-review).
---

# Arquiteto de Enredo — da ideia à fundação escrevível (v6.2)

> **Versão monolítica v6.2.** Esta SKILL.md é autossuficiente: todas as políticas
> estão embutidas aqui (seções "REFERÊNCIA EMBUTIDA" no fim). Se os moldes dos
> cinco agentes não existirem na instalação, reconstrua-os a partir da anatomia
> descrita aqui.
>
> **PROTOCOLO Cowork → Claude Code (v6.1).** O fluxo do autor tem três passos:
> **(1)** esta skill conduz o briefing no Cowork e gera a fundação;
> **(2)** ao fim, ela grava o `ESTADO_LIVRO.json` semente e entrega um **prompt
> agêntico pronto** para colar no Claude Code; **(3)** no Claude Code, esse prompt
> aciona o `livro-do-zero-ao-epub` (motor v2), que escreve e revisa o livro até a
> meta, sem o autor mandar "continua".
>
> **O `/goal` foi REMOVIDO** (v6): escrevia o livro num único agente sobrecarregado
> que resumia e "narrava" a conclusão, e auto-relatava conclusão/nota sem ninguém
> ler os arquivos. O motor v2 faz fan-out por capítulo, deriva tudo do disco e só
> aceita review com relatório real salvo.

Esta skill é a **fábrica de fundação** e o **ponto de partida do fluxo**. Pega uma
ideia, faz a entrevista guiada, produz os documentos executáveis e entrega o
gatilho para o Claude Code escrever o livro.

## A filosofia

Um livro escrito por pipeline só é tão bom quanto sua fundação. Toda deriva de
voz, todo furo, todo meio arrastado nasce de fundação incompleta. Esta skill
**fecha e valida a fundação antes de uma palavra de ficção** — de um jeito que dá
prazer: perguntas que parecem conversa, cada uma já com recomendação.

Princípios estruturais:
- **Qualidade não se negocia por economia** (v5): escritor no modelo mais forte;
  comprime-se o contexto, não a prosa.
- **Repetição é defeito estrutural, não estilístico** (v5.2): cura-se com memória
  do conhecimento do leitor, não com "escrever melhor".
- **Extensão é consequência de trama, não de volume** (v5.2): páginas vêm de fios
  entrelaçados, nunca de esticar trama magra.
- **Conclusão é fato verificável, não auto-relato** (v6): a escrita é feita pelo
  motor v2, que conta capítulos e palavras lendo o disco.

## O método de entrevista

### Princípio das perguntas
1. **Vai em botões** (ferramenta de perguntas com opções tappáveis).
2. **Traz recomendação embutida.** Uma opção é a recomendada; ao pedido do autor,
   explique a mais forte em 1–3 frases.
3. **Tem saída de controle do autor** ("quero sugestão / quero discutir").

Máximo 3 perguntas por chamada. Nunca despeje 20 de uma vez.

### A regra de implicação
Quando uma resposta cria tensão com outra decisão, **nomeie a implicação em 1–2
frases antes do próximo bloco**. É o que transforma entrevista em design.

### Os blocos temáticos (saída adaptativa)
Só pergunte o que falta; o bloco fecha quando seus campos essenciais estão
definidos. Termina quando todos fecham (tipicamente 18–35 perguntas).

1. **Semente** — ideia crua; gênero/subgênero.
2. **Premissa & promessa** — logline; promessa ao leitor; emoção-alvo; a
   **pergunta humana central (tema)** que toda a história investiga e que **cada
   batida** da Estrutura vai complicar (não só uma premissa boa — um fio temático).
3. **Personagens** — protagonista (ferida, segredo, **desejo ativo**, voz);
   antagonista (páreo real); apoio essencial **com função distinta** — cada apoio
   declara **FUNÇÃO NARRATIVA / FIO QUE CARREGA / ENTRELAÇA COM** (REFERÊNCIA
   EMBUTIDA B); quem sabe o quê.
   **PERGUNTA OBRIGATÓRIA (nº de personagens):** pergunte explicitamente, em
   botões, **quantos personagens nomeados** o autor quer, separados por papel —
   protagonista(s), antagonista(s) e **quantos de apoio**. Cada apoio essencial
   carrega um fio. Se o autor pedir mais apoios do que fios sustentáveis
   (`palavras-alvo ÷ fios ≥ ~25–30k`), avise da saturação e proponha fundir os
   redundantes. Registre o número no Mapa de Personagens.
4. **Motor de tensão** — relógio(s); conflito; o que está em jogo; mistério e
   pistas; **reviravolta de meio**; e **as subtramas que entrelaçam**.
5. **Estrutura** — atos; vira-pontos; **tamanho**; linha do tempo; PdV e tempo
   verbal; imagem de abertura; **imagem/metáfora-mestra do livro inteiro
   (controlling image)** — uma imagem de controle que recorre com sentido ao longo
   da obra (não decoração); tier dos capítulos.
   **PERGUNTA OBRIGATÓRIA (tamanho em páginas E capítulos):** pergunte SEMPRE, em
   botões, **(a) quantas páginas** (impresso, ~275 palavras/página) e **(b)
   quantos capítulos**. Converta e confirme na frente do autor:
   `páginas × 275 ≈ palavras`; `palavras ÷ capítulos ≈ palavras/cap`;
   **piso ≈ 85% da média/cap**. Registre os quatro números (páginas-alvo,
   capítulos, palavras-alvo, piso) na Bíblia e na semente. Nunca gere a fundação
   sem esses fechados.
6. **Voz & textura** — referências; cadência; intimidade/violência; motivos.
   **PERGUNTA OBRIGATÓRIA (skill de escrita do Opus):** liste, em botões, as skills
   de escritor instaladas (varra a pasta de skills por skills de estilo — ex.:
   `skill-dan-brown`, `hoover-mcfadden`, `skill-jk-rowling`,
   `vesper-escritor-de-capitulos`) MAIS a opção "Nenhuma — usar só o
   perfil-de-voz.md". Pergunte qual skill o subagente `livro-escritor` (Opus) deve
   APLICAR ao escrever ESTE livro. A escolha é OBRIGATÓRIA e vira `skill_escrita`.
   Registre em perfil-de-voz.md, em CLAUDE.md e na semente ESTADO_LIVRO.json
   (`skill_escrita`). O `livro-escritor` deve INVOCAR essa skill em cada capítulo,
   combinada com o perfil-de-voz.md (estilo do autor-referência + voz da obra).
7. **Final & ganchos** — como termina; ambiguidades; ganchos; o que o leitor sente.
8. **Fechamento** — nomes, cenário, pendências; idioma do manuscrito; gerar EPUB?

## As fases

### Fase 1 — Entrevista
Conduza os blocos. Deixe o autor despejar a ideia primeiro; depois abra o Bloco 1.
Não gere documentos no meio.

### Fase 1.5 — Portão em DOIS NÍVEIS (viabilidade + ambição)
> **O teto do livro é decidido aqui, na fundação — não no laço de reescrita.** Uma
> fundação "6–7 em tudo" passa por um gate que mira 6 e vira livro 7–8; remendo
> posterior converge a um platô, não a 9. Por isso o portão tem DOIS níveis: um
> piso de **viabilidade** (não escrever fundação quebrada) e um piso de **ambição**
> (conectar a meta 9.0 à fundação). Mede-se também **presença de excelência**, não
> só ausência de defeito.

Quando os 8 blocos fecharem, antes de gerar:

1. **Auditoria adversarial** impiedosa: cace cada fraqueza (meio arrastado, twist
   sem fair-play, protagonista passivo, voz genérica, relógios que se anulam).

2. **Scorecard 1–10**, cada nota com evidência apontando a decisão (ou ausência)
   da entrevista:
   - **8 dimensões maiores + 2 modificadoras** (competência — como antes).
   - **5 dimensões de EXCELÊNCIA** (medem o que separa 8 de 9 — presença, não
     ausência de defeito):
     - **a) Arquitetura de revelação / rereadability** — cada virada mapeada a
       *(o que se planta)* + *(o que ressignifica no retrovisor)*. Um livro 9 relê
       diferente. Twist sem o par plante→ressignifica explícito = **< 8**.
     - **b) Fio temático único** — UMA pergunta humana que **toda** batida da
       Estrutura complica. Se há beats que não tocam o tema = **< 8**.
     - **c) Imagem/metáfora-mestra (controlling image)** — imagem de controle do
       livro inteiro, definida na Bíblia e rastreada para recorrer com sentido.
       Ausente, ou só uma "imagem de abertura" solta = **< 8**.
     - **d) Custo irreversível** — **cada ato** tem um beat que custa ao
       protagonista algo que não se recupera (risco que aterrissa, não melodrama).
       Sem custo por ato = **< 8**.
     - **e) Voz: assinatura positiva** — "você reconheceria de olhos vendados?".
       Digital sintática/léxica/de-olhar específica e diferenciada por autor. Só
       "não-genérica" (defesa negativa) é 6–7, **não** 8. (A SPEC de assinatura
       positiva no `perfil-de-voz.md` é a fatia 2 deste refino.)

3. **Diagnóstico de densidade:** `palavras-alvo ÷ fios ativos`. Se um fio sozinho
   carrega além de ~25–30k palavras, a fundação está magra — devolva ao Bloco 3/4
   (REFERÊNCIA EMBUTIDA B).

4. **GATE DE VIABILIDADE (piso — inalterado):** qualquer dimensão **maior < 6**
   **OU saturação de densidade** → **NÃO gere**. Diagnostique (furo + conserto em
   botões), volte ao bloco, repontue. Repita até nenhuma maior < 6 e densidade
   saudável. Não se escreve fundação quebrada.

5. **GATE DE AMBIÇÃO (teto — NOVO):** as dimensões que **fixam o teto** —
   **Premissa, Estrutura/Revelação, Personagens, Voz, Tema** + as **5 de
   EXCELÊNCIA (a–e)** — devem mirar **≥ 8**. Abaixo de 8, **não aprove em
   silêncio**:
   - **Primeiro, devolva ao bloco** para fortalecer: proponha, em botões, o
     **movimento concreto** que sobe a dimensão (ex.: "plante o objeto X no cap 3
     para o twist do cap 27 reler", "dê ao ato 2 um custo que não volta"), nunca
     "escreva melhor". Repontue.
   - **Se o autor não quiser fortalecer** (ou a ideia tiver teto real), **registre
     com honestidade** no Diagnóstico de Fundação (topo da Bíblia): *"fundação
     **competente, não excepcional** — teto estimado ~8.x; dimensões abaixo de 8:
     <lista>; para 9 falta <o quê>"*. **Não finja 9.**
   - O gate de ambição **NÃO bloqueia a geração** (diferente do piso de
     viabilidade): ele força a **escolha consciente** — fortalecer agora, ou
     assumir o teto por escrito. Assim a meta 9.0 do projeto se conecta à fundação.

6. **O autor manda:** se insistir abaixo do **piso de viabilidade**, registre
   pendência crítica no topo da Bíblia e prossiga.

### Fase 2 — Geração do projeto executável + revisão única
1. **Quatro documentos:**
   - `Biblia-da-Obra.md` — Diagnóstico de Fundação no topo (com a razão de
     densidade **e o veredito de ambição**: "excepcional — ≥8 em todas as do teto",
     ou "competente — teto estimado ~X.x; abaixo de 8: <dimensões>; para 9 falta
     <o quê>"). O laço de escrita lê esse veredito como alvo honesto.
   - `Mapa-de-Personagens.md` — Tabela de Pistas; **FUNÇÃO NARRATIVA / FIO /
     ENTRELAÇA COM** por apoio; **Mapa de Entrelaçamento** (REFERÊNCIA EMBUTIDA B).
   - `Estrutura-do-Livro.md` — cada capítulo com `tier` (default `pivo`).
   - `estado/estado.json` + `estado/estado-legivel.md` — com o bloco
     `"densidade"` (REFERÊNCIA EMBUTIDA B).
   - `estado/estado-narrativo.md` — o ledger, com a seção
     **`## CONHECIMENTO DO LEITOR` (MCL)** (REFERÊNCIA EMBUTIDA A) além de fios
     abertos, pistas plantadas/pagas, relógios, onde-está-cada-personagem, fatos
     estabelecidos e resumo por capítulo.
2. **Maquinaria agêntica** (cinco agentes em `.claude/agents/`, personalizados):
   - `livro-editor.md` — orquestra; specs puxam **FIOS A AVANÇAR + MATERIAL NOVO
     OBRIGATÓRIO** do Mapa de Entrelaçamento.
   - `livro-contextualizador.md` (haiku) — destila o digest
     `contexto/contexto-cap-NN.md`; o digest ganha **`## O LEITOR JÁ SABE`**.
   - `livro-escritor.md` (opus, inegociável) — escreve lendo digest + spec +
     perfil de voz **e invocando a `skill_escrita` escolhida** (estilo do
     autor-referência); regra inviolável de **não-reexposição**. **Saída padronizada
     (v6): grava em `manuscrito/capitulo-NN.md` com NN de DOIS dígitos** — é
     exatamente o nome que o motor v2 lê para contar/validar. Nada de `cap-1.md`,
     sufixos de cena, etc.
   - `livro-revisor.md` (sonnet) — modo cirúrgico; atualiza ledger E MCL;
     checklist com **reexposição indevida**.
   - `livro-arquiteto-comercial.md` (sonnet) — tração macro; vigia o Mapa de
     Entrelaçamento e liga `alerta_saturacao`.
   - `CLAUDE.md` — cola as três políticas (REFERÊNCIAS EMBUTIDAS A, B e economia v5).
3. **Pastas:** `manuscrito/`, `specs/`, `capitulos-em-revisao/`, `contexto/`,
   `review/`.
4. **Perfil de voz** → `perfil-de-voz.md`.
5. **Revisão única:** apresente o projeto + as políticas + a tabela de modelos;
   peça uma rodada de ajustes. **Confirme aqui:** `max_iteracoes_reescrita`
   (default 4), `gerar_epub` (sim/não), meta de nota (default 9.0) e idioma do
   manuscrito — vão para a semente na Fase 3.

### Fase 3 — Semente + entrega do prompt agêntico ao Claude Code (sem `/goal`)
A fundação está pronta. Esta skill **não escreve capítulos e não dispara `/goal`**.
Em vez disso, prepara o terreno para o Claude Code e entrega o gatilho.

**3.1 Confirme a integridade da fundação:** os quatro documentos, os cinco agentes
e as pastas existem; `Estrutura-do-Livro.md` tem N capítulos numerados; o
`livro-escritor.md` grava em `manuscrito/capitulo-NN.md` (dois dígitos).

**3.2 Grave a SEMENTE `ESTADO_LIVRO.json`** na raiz do projeto, **já na fase
ESCRITA**, para o motor v2 começar a escrever direto (sem refazer a fundação).
Use exatamente estes campos (o motor preenche o resto):
```json
{
  "titulo": "<título da obra>",
  "total_capitulos_previstos": <N da Estrutura>,
  "skill_escrita": "<skill de escritor escolhida ou null>",
  "fase_atual": "ESCRITA",
  "gerar_epub": <true|false>,
  "meta_nota": 9.0,
  "max_iteracoes_reescrita": 4,
  "piso_palavras_cap": 1400
}
```

**3.3 Entregue ao autor o PROMPT AGÊNTICO pronto para o Claude Code.** Mostre, num
bloco de código que ele copia inteiro, exatamente isto (substituindo `<projeto>`
pelo caminho da pasta e mantendo/ajustando o `--epub`):

```
Use a skill livro-do-zero-ao-epub para escrever este livro INTEIRO de forma
autônoma. A fundação JÁ existe nesta pasta (<projeto>): Biblia-da-Obra.md,
Estrutura-do-Livro.md, Mapa-de-Personagens.md, perfil-de-voz.md, os 5 agentes em
.claude/agents/, e um ESTADO_LIVRO.json semente já na fase ESCRITA. NÃO dispare
/goal e NÃO refaça a fundação. Rode o motor v2 (assets/livro_runner.py) com:
  nohup python3 <SKILL_DIR>/livro-do-zero-ao-epub/assets/livro_runner.py \
    --projeto <projeto> --briefing <projeto>/briefing.md \
    --epub --meta 9.0 --max-reescritas 4 --piso 1400 \
    >> <projeto>/runner.log 2>&1 &
Escreva capítulo a capítulo (um contexto fresco por capítulo, gravando
manuscrito/capitulo-NN.md), consolide, rode book-bestseller-review salvando o
relatório real em review/, reescreva só o que o review apontar e repita até nota
>= 9.0. Me avise o PID e como acompanhar (tail -f <projeto>/runner.log). Pode
seguir sozinho até CONCLUIDO.
```

**3.4 Diga ao autor, em 2–3 linhas:** que ele agora abre o Claude Code **nesta
mesma pasta**, cola o prompt acima e aguarda; que o motor é reentrante (pode fechar
o terminal); e que a qualquer momento pode conferir a verdade no disco:
`ls manuscrito/capitulo-*.md | wc -l`.

> Estrutura final da pasta do projeto:
> ```
> <projeto>/
> ├── .claude/agents/{livro-editor,livro-contextualizador,livro-escritor,livro-revisor,livro-arquiteto-comercial}.md
> ├── estado/{estado.json,estado-legivel.md,estado-narrativo.md}
> ├── manuscrito/  specs/  capitulos-em-revisao/  contexto/  review/
> ├── Biblia-da-Obra.md  Estrutura-do-Livro.md  Mapa-de-Personagens.md
> ├── CLAUDE.md  perfil-de-voz.md  briefing.md
> └── ESTADO_LIVRO.json (semente; o motor v2 assume e gera runner.log na escrita)
> ```

## Economia de contexto (v5)
(1) digest, não documentos integrais; (2) ledger, não releitura; (3) revisão
cirúrgica, não reescrita; (4) orquestrador enxuto; (5) janela de calibração do
digest nos primeiros capítulos.

## Camada anti-maçada (v5.2)
1. **Anti-repetição (MCL)** — REFERÊNCIA EMBUTIDA A.
2. **Densidade por entrelaçamento** — REFERÊNCIA EMBUTIDA B.

## Modelos por agente (defaults)
| Agente | Default | Racional |
|---|---|---|
| Escritor | `opus` (**inegociável**) | onde a prosa nasce |
| Contextualizador | `haiku` | destilação por template |
| Editor | `haiku` | orquestra, não escreve |
| Revisor | `sonnet` | sobe a `opus` em twist sofisticado |
| Arquiteto comercial | `sonnet` | `opus` em checkpoint crítico |

## Regras invioláveis
- **Não inventar fatos.** Só entram dados que o autor forneça/aprove.
- **Não escrever ficção.** Esta skill estrutura; não redige capítulos.
- **O autor manda.** Toda decisão é dele.
- **Passar no portão antes de gerar** (inclui densidade).
- **Qualidade não se negocia por economia.**
- **Repetição é defeito estrutural** — combate-se com memória e densidade.
- **Não dispara `/goal`.** Semeia o estado e entrega o prompt agêntico para o
  Claude Code rodar o `livro-do-zero-ao-epub` (motor v2). Só entrega com projeto
  íntegro (Fase 2 terminada).

## Limites de escopo
- Estrutura e valida a fundação; **não** escreve capítulos, **não** revisa
  manuscrito pronto (para isso, `book-bestseller-review`) e **não** roda o pipeline
  de escrita por si (quem escreve é o `livro-do-zero-ao-epub`, no Claude Code).
- Não fabrica dados reais, pessoas reais nem fontes.
- Se a ideia tocar conteúdo não permitido, para e levanta a questão.

---
---

# REFERÊNCIA EMBUTIDA A — Política Anti-Repetição (v5.2)

> Resolve a queixa mais corrosiva de um pipeline longo: **o escritor re-explica ao
> leitor o que o leitor já sabe**. A causa é arquitetural: cada capítulo nasce sem
> memória do que já foi *entregue ao leitor*. O ledger da v5 rastreia
> **continuidade**; faltava rastrear **conhecimento do leitor**.

**Re-explicar ≠ referir.** O texto pode *referir-se* a um fato sabido (de leve); o
que não pode é **reexpor** (reapresentar do zero algo que o leitor já recebeu).

## O artefato: Mapa de Conhecimento do Leitor (MCL)
Seção nova no ledger `estado/estado-narrativo.md`, chamada
`## CONHECIMENTO DO LEITOR`. Por item já entregue ao leitor:
```
- [REVELADO cap NN] <fato/pista/motivação> — STATUS: estabelecido
  · referência permitida daqui em diante: alusão breve, sem reexpor
  · gatilho de reexposição autorizada: <nenhum | só se PdV novo que não presenciou>
```
Entram no MCL: revelações de trama; pistas já mostradas ao leitor; motivações já
dramatizadas; fatos de mundo já apresentados; backstory já entregue. O **revisor**
atualiza o MCL a cada capítulo aprovado.

## Exceções autorizadas (quando reexpor é legítimo)
1. **Novo PdV** que não presenciou a revelação — processa o fato pela ótica dele,
   com informação nova; nunca recapitulação neutra.
2. **Reviravolta que ressignifica** — fato velho ganha sentido novo: é pagamento.
3. **Salto temporal longo** — alusão de uma frase, não parágrafo de resumo.
Fora disso, é redundância. Sem gatilho no MCL, o default é **referir, nunca
reexpor**.

## Três pontos de injeção
**1. Digest (contextualizador):** seção obrigatória
```
## O LEITOR JÁ SABE (não reexpor — referir no máximo)
<itens do MCL relevantes a este capítulo; itens com gatilho marcados ✓REEXPOR-OK>
```
**2. Escritor (regra inviolável):** antes de explicar pista/motivação/fato, confira
"O LEITOR JÁ SABE". Se está lá sem ✓REEXPOR-OK, *aluda* em no máximo uma frase —
nunca reapresente. Se sentir necessidade de reexpor, falta **material novo**: peça
revisão de spec, não encha com recapitulação.
**3. Revisor (checklist):** `[ ] Reexposição indevida` — marque cada ocorrência
como edição cirúrgica; reincidência do mesmo item em 2+ capítulos = sinalizar ao
editor para reforçar a spec seguinte.

---

# REFERÊNCIA EMBUTIDA B — Política de Densidade e Entrelaçamento (v5.2)

> Resolve **atingir a meta de páginas sem esticar.** Quando falta trama para o
> tamanho-alvo, o escritor preenche reciclando — e nasce a repetição. A cura é a
> **fundação gerar material novo legítimo**: subtramas que se cruzam e personagens
> cuja existência *produz* cena. Densidade ≠ enchimento.

## Diagnóstico de extensão (no portão, Fase 1.5)
`palavras-alvo ÷ fios narrativos ativos = palavras por fio`. Fio ativo = trama
principal + cada subtrama com início, meio, complicação e pagamento próprios.
**Saturação:** se um fio carrega sozinho além de ~25–30k palavras, vai esticar.
Se estourar, o portão **não aprova com "escreva mais denso"** — devolve ao Bloco
3/4 para adicionar subtrama ou elevar um apoio a portador de fio.

## Elenco com função (Bloco 3)
Cada apoio essencial declara no Mapa:
```
- FUNÇÃO NARRATIVA: <o que só ele faz pela trama>
- FIO QUE CARREGA: <a subtrama de que é dono, ou "nenhum — função de cena">
- ENTRELAÇA COM: <quais personagens/fios cruza, e onde>
```
Corte duro: **dois personagens com a mesma função = um é redundante** (funda ou
diferencia).

## Mapa de Entrelaçamento (no Mapa-de-Personagens.md)
```
## MAPA DE ENTRELAÇAMENTO
| Bloco (caps) | Fio principal | Subtrama A | Subtrama B | Cruzamentos |
|---|---|---|---|---|
| 1–6   | apresenta | planta | —      | A toca o protagonista no cap 5 |
| 7–14  | complica  | escala | planta | A e B colidem no cap 12 |
| 15–22 | crise     | paga   | escala | B reposiciona o fio principal no cap 20 |
| 23–fim| resolve   | —      | paga   | todos convergem no clímax |
```
Regra de saúde: **nenhum bloco prolongado com fio único** (assinatura do meio
arrastado).

## Specs que matam o esticar
A spec de cada capítulo ganha:
```
## FIOS A AVANÇAR NESTE CAPÍTULO
- Fio principal: <passo>
- Subtrama ativa: <passo>
- Cruzamento, se houver: <o que colide>
## MATERIAL NOVO OBRIGATÓRIO
<o que este capítulo introduz que ainda não existe. Sem material novo, funde com o
vizinho.>
```

## Trava no estado
`estado.json` ganha:
```
"densidade": { "palavras_alvo": 0, "fios_ativos": 0, "palavras_por_fio": 0, "alerta_saturacao": false }
```
Se a auditoria macro detectar fio arrastando, liga `alerta_saturacao` e recomenda
acelerar o pagamento do fio ou ativar subtrama dormente — **nunca** "escrever mais
devagar".

---

## Registro de versões
- **v6.2** — Portão em DOIS NÍVEIS (fatia 1 do refino de teto): mantém o gate de
  **viabilidade** (<6 → não gera) e adiciona um **GATE DE AMBIÇÃO** (≥8 nas
  dimensões que fixam o teto + 5 dimensões de **EXCELÊNCIA**: rereadability, fio
  temático, controlling image, custo irreversível, voz-assinatura). Abaixo de 8
  não aprova em silêncio — fortalece ou registra o teto honesto na Bíblia. Conecta
  a meta 9.0 à fundação. Blocos 2 e 5 agora pedem tema e controlling image.
- **v6.1** — Protocolo Cowork → Claude Code explícito. Fase 3 agora grava a
  SEMENTE `ESTADO_LIVRO.json` (fase ESCRITA) e entrega um **prompt agêntico pronto**
  para o autor colar no Claude Code (passo 2 do fluxo).
- **v6** — Removido o disparo do `/goal`; entrega à escrita pelo motor v2; saída do
  `livro-escritor` padronizada para `manuscrito/capitulo-NN.md` (dois dígitos);
  removidos os assets embutidos do `/goal`.
- **v5.2** — Camada anti-maçada (MCL + densidade por entrelaçamento).
- **v5.1** — Janela de calibração do digest.
- **v5** — Economia de contexto (contextualizador; ledger; revisão cirúrgica;
  orquestrador enxuto; tier por capítulo).
- **v4** — Modelos variáveis por agente; arquiteto comercial.
- **v3** — Fase 1.5: portão de qualidade (adversarial + Scorecard com piso).
- **v2** — Projeto executável completo.
- **v1** — Entrevista em 8 blocos; geração dos 4 documentos.
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     

---

# APRIMORAMENTOS (2026-06) — leitura obrigatória

## Escritor agêntico travado em OPUS 4.8 (inegociável)
- O `livro-escritor` roda **sempre em opus** (frontmatter `model: opus`). O motor
  `livro-do-zero-ao-epub` deve disparar a sessão headless com `--model opus`
  (agora default no runner). **Nunca** confiar no modelo default do CLI.
- O prompt de ESCRITA do motor DELEGA a prosa ao subagente `livro-escritor` via
  Task — a prosa nasce no opus, não na sessão principal.

## Robusto porém dinâmico (anti-linguiça, anti-repetição)
- Atingir o tamanho por **MATERIAL NOVO** (evento, virada, informação, cena),
  nunca por recapitulação, descrição decorativa ou diálogo de enchimento.
- Antes de explicar um fato, checar o MCL (`O LEITOR JÁ SABE`): se já foi
  entregue, ALUDIR em ≤1 frase. Reexpor é defeito estrutural, não estilo.
- O piso é chão, não teto: escrever o capítulo COMPLETO; se faltar matéria para
  o piso, é falha de spec — parar e sinalizar, não encher.

## Dimensionamento sempre perguntado
- Bloco 3: número de personagens por papel. Bloco 5: páginas E capítulos.
- Semente `ESTADO_LIVRO.json` ganha `paginas_alvo` e mantém `piso_palavras_cap`
  derivado da média/cap.

---

# SKILL DE ESCRITA DO OPUS (`skill_escrita`) — OBRIGATÓRIA

- O Bloco 6 pergunta, em botões e de forma OBRIGATÓRIA, qual skill de escritor o
  subagente `livro-escritor` (Opus) deve aplicar ao livro (ex.: `skill-dan-brown`,
  `hoover-mcfadden`, `skill-jk-rowling`, `vesper-escritor-de-capitulos`) ou
  "Nenhuma" (só perfil-de-voz.md).
- A escolha entra na semente `ESTADO_LIVRO.json` como `skill_escrita` e no corpo do
  `livro-escritor.md` gerado.
- O `livro-escritor.md` gerado deve trazer, no topo das instruções: "Antes de
  escrever a prosa de cada capítulo, INVOQUE a skill `skill_escrita` (se houver) e
  aplique a técnica dela COMBINADA com o perfil-de-voz.md. Se `skill_escrita` for
  null/Nenhuma, use apenas o perfil-de-voz.md."
- O motor `livro-do-zero-ao-epub` já delega a escrita ao `livro-escritor` (Opus);
  a skill de estilo é aplicada DENTRO dessa delegação.
