# AUDITORIA — Estilo hoover-mcfadden: onde entra a "cara de IA" (aforismo, personificação, sanfona)

**Data:** 2026-07-18 · **Modo:** somente-leitura (nenhum arquivo de skill/infra alterado nesta fase)
**Corpus:** hoover-pipeline `cae6a074` (2 caps — ambos medidos e lidos), hoover importado `38faf7e0`
(62 caps — 2 medidos, amostra lida). n de pipeline é baixo (o projeto é recente); a direção é
consistente com a auditoria dan-brown (que já mediu os mesmos projetos).
**Régua:** determinística (`worker/src/maneirismo.ts::diagnosticarTransparencia`, os mesmos
detectores da correção dan-brown) para tendência; o juízo semântico fica para o protocolo LLM do
benchmark (D1/D3 têm FP alto em prosa limpa — confirmado no benchmark dan-brown).

---

## 0. A pergunta e a resposta em 4 frases

O autor quer eliminar do hoover os tiques de IA — **aforismo/máxima empilhada, personificação de
abstração e frase-sanfona/repetição** — SEM tocar no que faz o gênero funcionar: interioridade em
primeira pessoa, emoção crua, narradora não-confiável, metáfora sentimental. A skill hoover LOCAL
já pede o certo ("sem staccato vazio", "metáfora com extrema parcimônia", "NUNCA a cadência de
VÉSPER"), então **a doença não nasce na skill** — nasce na **infra compartilhada** (a lente
aforística que o arquiteto injeta no `perfil-de-voz.md`, o prior do modelo-base, e a ausência de
qualquer freio de aforismo até a correção dan-brown). E há um **agravante novo, específico do
hoover**: a correção dan-brown, ao entrar em produção, passou a aplicar ao revisor E aos sinais de
TODA skill um **piso de transparência dan-brown** (maioria declarativa, interioridade ≤1-2 linhas,
metáfora ≤1/página) — cotas que, no hoover, penalizam exatamente a interioridade/metáfora que são a
alma do gênero. **Interioridade e metáfora emocional NÃO são o problema; são o que a infra atual
está, por acidente, tratando como problema.**

---

## 1. Baseline determinístico (régua da correção dan-brown, detectores atuais)

| cap | palavras | gnômico (≤2) | personif/1k (≤1) | sanfona (≤1) | adjAval | decl% | dial% | metaf/300 | gancho |
|---|---|---|---|---|---|---|---|---|---|
| **pipe-01** | 2.773 | **5** | 1.4 | 17 | 1 | 42.9 | 2.4 | 0.54 | soco |
| **pipe-02** | 2.883 | **4** | 0.3 | 11 | 0 | 48.1 | 25 | 0.31 | indefinido |
| imp-03 | 2.629 | 5 | 2.7 | 10 | 1 | 68.4 | 23.1 | 1.94 | indefinido |
| imp-40 | 2.353 | 5 | 2.1 | 11 | 0 | 58.9 | 0 | 0.64 | relógio |
| **META hoover** | — | **≤2** | **≤1/1k** | **≤1** | — | *sem piso* | *sem piso* | *só barra cadeia* |

Leituras:
- **Gnômico é o tique dominante e REAL:** 4-5 por capítulo contra alvo ≤2, em TODO capítulo dos dois
  projetos. Este é o alvo nº 1.
- **Personificação:** marginal na régua (0.3-2.7/1000); parte é FP (metáfora afetiva legítima do
  fio da narradora, ver §3). Alvo secundário — o protocolo LLM decide.
- **Sanfona (régua):** 10-17, altíssimo — mas a régua D3 **superconta** em prosa limpa (frases
  longas de enumeração/ação com ≥3 vírgulas). O benchmark dan-brown provou D3 régua 18-19 vs LLM
  1-2. O número REAL sai no protocolo LLM; a régua serve de tendência, não de veredito.
- **decl% / dial% / metaf:** pipe-01 tem decl 42.9% (< piso 50), dial 2.4% (< piso 15), imp-03 tem
  metaf 1.94/300 (> teto 1). **Estes três não são defeito no hoover — mas a infra atual dispara
  sinal sobre eles (ver §4). É o ponto que mais importa nesta auditoria.**

---

## 2. Causa infra vs. causa local

| # | Causa | Camada | Evidência | Tipo |
|---|---|---|---|---|
| CR1 | **A fundação injeta a lente aforística.** O arquiteto grava no perfil um "modo de VER" que É uma máxima; o escritor imita a cada capítulo. | `perfil-de-voz.md` do projeto (gerado pelo arquiteto) | perfil `cae6a074:75`: *"a beleza é sempre a superfície de algo enterrado"* → cap-01 gera *"a beleza é sempre a casca de algum estrago"* (quase-verbatim) | **INFRA** (compartilhada) |
| CR2 | **Prior do modelo-base sem contrapeso.** O aforismo é o atrator default do LLM; o hoover importado (pré-pipeline, sem bloco injetado) já mostra gnômico 5/cap. | corpus `38faf7e0` | imp-03/imp-40: gnômico 5 sem nenhum normalizador aplicado | **INFRA** (prior) |
| CR3 | **Até a correção dan-brown, nenhum detector de aforismo/personificação/sanfona era medido.** O hoover atravessava os gates de tique barato (staccato/muleta) com o ornamento caro intacto. | `maneirismo.ts` (pré-2026-07-17) | a auditoria dan-brown já registrou hoover-pipeline gnômico 6,0/1000 > dan-brown 4,7 | **INFRA** (compartilhada) — já parcialmente sanada pela correção dan-brown (detectores em SINAL) |
| CR4 | **AGRAVANTE NOVO — a correção dan-brown aplica ao hoover um piso que não é dele.** O bloco `ADENDO_TRANSPARENCIA` e os sinais `_sinais_transparencia` são skill-AGNÓSTICOS: injetam no revisor hoover "maioria declarativa; interioridade ≤1-2 linhas; metáfora ≤1/página" e disparam sinal `declarativas <50%`, `diálogo <15%`, `metáfora elaborada`. | `craft-agentes.ts:139-158` (`ADENDO_TRANSPARENCIA`, injetado por `garantirPropulsaoRevisor` em TODO `livro-revisor.md`); `maneirismo.ts:1010-1013` + `1044-1064`; espelho `livro_runner.py:2199-2233` | pipe-01/02 disparam os 3 sinais protegidos (decl 42.9/48.1%, dial 2.4%, metaf); um revisor hoover é hoje instruído a cortar interioridade/metáfora | **INFRA** (compartilhada) — **precisa correção cirúrgica sem regredir dan-brown** |
| CL1 | **A skill hoover não NOMEIA os 3 tiques.** `voz-e-oficio.md` lista "Padrões a evitar" (advérbios -mente, metáfora médica óbvia, resumo de emoção) mas NÃO cita aforismo/máxima, personificação de abstração nem frase-sanfona — então o escritor não tem o alvo explícito. | `~/.claude/skills/hoover-mcfadden/references/voz-e-oficio.md:166-175` | a seção existe e é anti-ornamento, mas os 3 tiques dominantes estão ausentes da lista | **LOCAL** (skill) — reforço barato, não é a causa-raiz |

**Veredito:** MISTA, **dominante INFRA**. Consertar só a skill hoover não resolve (a lente vem da
fundação e o prior do modelo). O trabalho pesado é na infra — e a parte MAIS urgente é CR4 (a infra
está ativamente ferindo o gênero). A skill recebe um reforço local (CL1), não a cirurgia.

---

## 3. Cadeia causal por tique (instrução → mecanismo → exemplo gerado → métrica)

### 3.1 Fecho gnômico / máxima (o tique dominante do hoover) — ALVO
- **Instrução (fundação):** `cae6a074/perfil-de-voz.md:70-75`, seção "Um modo de VER": a lente da
  narradora É um aforismo — *"a beleza é sempre a superfície de algo enterrado"*. O parágrafo-modelo
  §2 fecha em *"É mais barato acreditar do que perguntar"* (`:105`). O `MODELO-FLAG v1` já sinaliza
  isso (herança da correção dan-brown), mas a lente do "modo de VER" NÃO é flagrada (não é
  parágrafo-modelo).
- **Mecanismo:** o escritor relê o perfil a cada capítulo (`CRAFT-LEITURA`); a lente aforística é
  reproduzida como voz da narradora.
- **Exemplo gerado (cap-01):** *"a beleza é sempre a casca de algum estrago"*; *"Quem cava uma cova
  joga a terra para longe, para ter espaço de descer"*. Cap-02: *"Um homem que chama de inútil o
  cemitério da própria patroa ou é honesto demais ou é hábil demais"*.
- **Métrica:** 4-5/cap (régua) contra alvo ≤2. Real (não FP na maioria).

### 3.2 Personificação de abstração — ALVO SECUNDÁRIO (cuidado com FP)
- **Exemplo gerado (cap-01):** *"a terra me convencer de que pertenço a ela"*; *"é a própria terra
  que desmente"*. Parte é metáfora afetiva do fio da narradora (legítima no hoover); parte é
  personificação real de abstração. **A fronteira aqui é fina e é EXATAMENTE onde não se pode
  exagerar:** barrar toda "terra que desmente" mataria a voz. O protocolo LLM separa.
- **Métrica:** 0.3-2.7/1000. Meta hoover ≤1/1000, medida por LLM (a régua marginaliza).

### 3.3 Frase-sanfona — ALVO (mas régua superconta)
- **Exemplo gerado (cap-02):** *"Recuso o pensamento fácil — não são de minha mãe, são prova —,
  porque uma mulher que veio vender uma casa apre[ssa]…"* (reformulação encadeada real).
- **FP típico da régua (cap-01):** *"A terra dos dois lados da estrada é boa — argila vermelha,
  funda, o tipo de solo que segura água no verão…"* — é enumeração descritiva legítima, NÃO
  reformulação da mesma percepção. A régua conta como sanfona; o LLM não.
- **Métrica:** 10-17 régua (a maioria FP); alvo ≤1 medido por LLM.

### 3.4 O que NÃO é alvo (confirmação por evidência)
- **Interioridade contínua:** pipe-01/02 têm dial 2.4-25% e muita cópula/percepção — é a VOZ da
  narradora contida que vaza. **Nenhum piso de declarativa/diálogo deve pesar sobre isso.** A prova
  de que não é o problema: os capítulos que a análise literária da auditoria dan-brown julgou
  melhores no hoover importado (imp-03, decl 68%) e os piores (pipe-01, decl 43%) têm o MESMO nível
  de gnômico (5). O gnômico não correlaciona com "menos declarativa" — logo o inimigo não é a
  interioridade.
- **Metáfora sentimental isolada:** feature. Só a CADEIA de metáforas (2+ em <300 palavras) é tique.

---

## 4. O achado central desta auditoria: a infra está ferindo o hoover AGORA

Diferente da auditoria dan-brown (que mirava fazer o dan-brown MAIS transparente), aqui o risco é o
inverso: **a infra de transparência, criada para o dan-brown, foi para produção skill-agnóstica e
agora empurra o hoover na direção errada.** Três pontos exatos:

1. **`craft-agentes.ts:139-158` — `ADENDO_TRANSPARENCIA`.** Injetado por `garantirPropulsaoRevisor`
   em TODO `livro-revisor.md` (skill-agnóstico). Contém: *"Piso de transparência: a maioria das
   frases é declarativa simples; interioridade ≤1-2 linhas por beat; metáfora elaborada ≈≤1 por
   página"*. Para um revisor hoover, isto é uma ordem de cortar a interioridade e a metáfora do
   gênero. **Os 4 alvos (gnômico/personificação/sanfona/narrador-invisível) DEVEM ficar; o piso e os
   tetos de interioridade/metáfora NÃO.**
2. **`maneirismo.ts:1044-1064` (`diagnosticarTransparencia`) + espelho `livro_runner.py:2199-2233`.**
   Emitem para o prompt do revisor os sinais `declarativas <50%`, `diálogo <15%`, `metáfora
   elaborada` — que disparam de fato nos capítulos hoover reais (pipe-01/02). Cada linha empurra o
   revisor a reprovar interioridade/metáfora.
3. **Consequência medida:** pipe-01 (decl 42.9%, dial 2.4%) e pipe-02 (decl 48.1%) disparam o sinal
   de piso; imp-03 (metaf 1.94) dispara o sinal de metáfora. Um revisor hoover recebe hoje 2-3
   sinais que pedem para matar a voz do gênero.

**A correção, portanto, tem DUAS metades:** (a) reforçar os 4 alvos de ornamento no hoover (em
SINAL); (b) **remover do hoover o piso/tetos de transparência** que não são dele — cirurgicamente,
sem alterar uma vírgula do que o dan-brown recebe (o dan-brown, ausente do mapa por-skill, continua
com o bloco/sinais integrais).

---

## 5. Régua hoover (pré-aprovada — validada contra a evidência, mantida)

A evidência CONFIRMA a régua pré-aprovada; não há contradição que exija escalar ao autor.

**ALVO (reduzir, em modo SINAL):** gnômico ≤2/cap · personificação de abstração ≤1/1000 ·
frase-sanfona ≤1/cap · repetição de assinatura cross-capítulo = 0 verbatim · muletas dentro das
cotas de cadência hoover já existentes (`ORC_CADENCIA_POR_SKILL["hoover-mcfadden"]`).

**PROTEGIDO (não penalizar, nenhum piso/teto):** interioridade contínua (livre — é a voz) ·
primeira pessoa presente emocional · metáfora sentimental isolada (teto generoso; só a CADEIA de
metáfora é defeito) · NENHUM piso de frases declarativas · NENHUM piso de diálogo forçado · ritmo
lírico permitido.

**Anti-repetição** cross-capítulo (`detectar_repeticao_cross` / `detectarRepeticaoCrossCapitulo`) é
UNIVERSAL por construção e já roda para hoover em `_recontagem_cap` — prioridade explícita do autor,
confirmada ativa.

### 5.1 Spec-gate — 3 exemplos positivos (P = tique) / negativos (N = legítimo) por detector, no contexto hoover

- **Gnômico (D1):**
  - P: *"a beleza é sempre a casca de algum estrago"* (máxima-lente genérica).
  - P: *"Um homem que chama de inútil o cemitério da própria patroa ou é honesto demais ou é hábil"*
    (máxima definitória de sujeito genérico).
  - N: *"Marcus nunca, em onze anos, lavou um copo às onze da noite"* (observação concreta, datada,
    de indivíduo nomeado — NÃO é máxima).
- **Personificação de abstração (D2):**
  - P: *"a razão decidiu por mim antes de eu escolher"* (abstração + verbo de agência humana).
  - P: *"a culpa me obrigou a ficar"* (abstração-agente).
  - N: *"meu peito apertou quando ele entrou"* (reação física sentida em 1ª pessoa — interioridade,
    NÃO personificação); N: *"é a própria terra que desmente"* como imagem afetiva ISOLADA no fio
    da narradora (fronteira — o LLM pesa; barrar toda ocorrência mataria a voz).
- **Frase-sanfona (D3):**
  - P: *"não era medo, era outra coisa — não exatamente pânico, mas o parente pobre do pânico, o que
    fica na soleira"* (mesma percepção reformulada 3×).
  - P: escada "de que… de que… de que…" (3 apostos reformulando a mesma ideia).
  - N: *"A terra dos dois lados é boa — argila vermelha, funda, o tipo de solo que segura água"*
    (enumeração descritiva concreta, cada item novo — NÃO reformulação); N: interioridade de 8
    linhas encadeadas com AVANÇO emocional (cada frase acrescenta, não repete) — legítima no hoover.
- **Metáfora (D7, protegido no hoover):**
  - N: *"o medo era um copo cheio até a borda que eu carregava sem derramar"* (metáfora sentimental
    ISOLADA — feature, não penalizar).
  - P: *"o medo era um copo cheio, uma corda esticada, um relógio sem ponteiros"* (CADEIA de 3
    metáforas em <300 palavras — só ISTO é tique no hoover).
  - N: interioridade lírica de um parágrafo sem nenhuma metáfora encadeada — livre.

---

## 6. Plano de correção (o que será feito — detalhado na fase CORRIGIR)

1. **`craft-agentes.ts`:** tornar `garantirPropulsaoRevisor` skill-aware; para skills intimistas
   (hoover), injetar um `ADENDO_TRANSPARENCIA_INTIMISTA` com os 4 alvos de ornamento MAS trocando o
   "Piso de transparência" por uma cláusula de PROTEÇÃO (interioridade livre, 1ª pessoa emocional é
   feature, metáfora isolada livre, só a cadeia é defeito). Threadar `skill` de `jobs.ts:487`.
   Dan-brown (fora do mapa) mantém o bloco integral — zero regressão.
2. **`maneirismo.ts`:** adicionar hoover a `ORC_TRANSPARENCIA_POR_SKILL` em modo SINAL
   (`bloqueia:false`), com flags que desligam os sinais protegidos (piso declarativa, piso diálogo,
   densidade de metáfora — mantendo só a CADEIA). Gnômico ≤2, personif, sanfona seguem sinalizando.
   Espelhar em `livro_runner.py::_sinais_transparencia` (skill-aware, idioma do special-case hoover
   que já existe em `_streak_guarda:1457`).
3. **Patch skill hoover** (`worker/skill-patches/hoover-mcfadden/voz-e-oficio.md`): NOMEAR os 3
   tiques na seção "Padrões a evitar", sem tocar em interioridade/metáfora/calor.
4. **Anti-repetição:** confirmar ativo para hoover (já é — `_recontagem_cap`); nenhuma mudança
   necessária além de teste.
5. Idempotência provada + testes; suíte verde; **regressão dan-brown** (detectores nos caps
   canônicos + vitest) obrigatória.

**Promoção a bloqueio:** NÃO. Todos os detectores hoover permanecem em SINAL — a promoção a cota
dura exige protocolo LLM com zero FP nos controles (D1/D3 têm FP alto, provado no benchmark
dan-brown). Manter SINAL respeita a lição de julho (FP-loop).
