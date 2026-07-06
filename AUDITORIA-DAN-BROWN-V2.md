# AUDITORIA DAN-BROWN v2 — "O Índice dos Abduzidos" está usando a skill de verdade?

**Data:** 2026-07-03. **Método:** auditoria **read-only** na máquina (WORK_DIR + Supabase + logs
reais). Nada editado em capítulo/spec/prosa; só leitura + detector + 2 subagentes opus de leitura
de página. Projeto `53abdade…`, job `e45d6f6e`, skill `skill-dan-brown`, 20/60 capítulos válidos
(21 no disco). **Regra de ouro #1 respeitada: o veredito é da PÁGINA, não do marcador.**

**Veredito em uma linha:** o gate estrutural (`a582cc6`) **funcionou de verdade** — estava vivo em
produção (não é "commit ≠ produção") e a banda pós-gate é **mensuravelmente mais limpa E continua
viva** (não virou "competente e sem sangue"). Mas ele só alcança o **nível-palavra/spec**; a muleta
que o Rodrigo sente **migrou um andar acima** — para a **arquitetura de frase** e para a **assinatura
verbatim entre capítulos**, ambas cegas ao detector — e a **montagem ficou POV-monótona** (7 caps de
Helena seguidos que o gate autoriza por checar o CAMPO "Justificativa de fio", não a experiência).

---

## Fase 1 — Linha do tempo forense (o gate estava vivo?)

- **Nascimento do gate:** commit `a582cc6` em **2026-07-02 18:17:51 -03**. **Primeiro disparo real:**
  `runner.log` → `[2026-07-02 18:46:01] GATE SPEC cap 10: spec ausente → pedindo SPEC COMPLETA`.
  O gate firou **por capítulo, de 10 a 21** (12 disparos comprovados no log, o último cap 21 às
  09:19 de 07-03). **NÃO é o caso P0-3 "commit ≠ produção"** — desta vez o worker estava rodando o
  código pós-`a582cc6` e o log prova cada disparo.

| Banda | Caps | Spec-arquivo | Gate ativo na escrita | mtime da prosa |
|---|---|---|---|---|
| **PRÉ-GATE** | 1–8 | **nenhuma** | não (gate não existia) | 06-30 → 07-02 12:43 |
| **Transição** | 9 | sim (retrofit 07-02 12:48) | mal ativado (spec já existia) | 07-02 18:44 |
| **PÓS-GATE** | 10–21 | sim (gate criou cada uma) | **sim (disparo por cap no log)** | 07-02 18:48 → 07-03 09:46 |

> Nota: caps 1 e 4 foram re-tocados em 07-02 18:30 (retrofit da fundação, banda pré-gate).

## Fase 2 — Conformidade estrutural (o que o gate cobra)

- **Campos:** specs 10–21 trazem `Fio de POV`; `Dia/Hora corrente` presente em 11,13–18,20,21.
  **`Spec-Capitulo-12` NÃO tem o campo `Dia/Hora`** — e mesmo assim a prosa entrega o relógio
  (ver Fase 4). O gate valida campo, não a experiência.
- **Rotação de fios — o defeito estrutural:** sequência 09→21 = **H H H C H H H H H H H C H**.
  **Caps 13–19 = 7 capítulos consecutivos de Helena.** O gate **permitiu** porque as specs 13–18
  trazem `Justificativa de fio:` — mas montagem paralela (assinatura dan-brown) fica **achatada**:
  o livro é Helena-pesado com dois respiros de Cole (12, 20). O gate checa o CAMPO, não a monotonia
  acumulada.
- **Relógio comprimido coerente, com 1 deslize tipo-O-2:** a linha do tempo avança
  (QUARTA N+1 → QUINTA N+2 → SEXTA N+3 → SÁBADO N+5 → SEGUNDA N+7), **mas** spec-16 = "SEXTA DIA
  **N+3**" e spec-17 = "SEXTA DIA **N+4**" — mesma sexta, contador de dia pula. O gate não faz
  aritmética, então passa.
- **Drift de cânone nas specs (não vaza):** spec-12 "Cole **Brandt**", spec-16 "Helena **Caires**"
  (cânone: Braddock/Whitmore). A prosa só usa primeiro nome ⇒ **nada vaza à página**, mas o campo
  gateado carrega o drift.
- **Dossiê:** `dossie-factual.md` com **24 VERIFICADO / 0 HIPÓTESE**.

## Fase 3 — Cadência/Regra 4 na PROSA (detector, ORC default dan-brown)

Queda forte e inequívoca pré→pós-gate:

| Banda | "coisa" | maneirismos/10k | cadenciaAcima |
|---|---|---|---|
| **Pré-gate (1–8)** | 7,2,**10**,3,2,0,7,1 | 16–**54** | pesado (fragEnfase até **22**, símile-andaime, itálico 15) |
| **Pós-gate (10–21)** | 0–2 (quase todo 0) | **0–26** | leve; **caps 12,13,21 PASSAM 100%** |

- Os tiques clássicos de IA (staccato empilhado, itálico em enxurrada, "coisa", símile-andaime)
  **sumiram** no pós-gate. O resíduo é anáfora leve (2–4) e a **antítese "não X, mas Y" / "Não X.
  Y."**, que **atravessa as duas bandas** — o gate não a pega (não é campo de spec).

## Fase 4 — Leitura de página (6 capítulos, trecho citado)

### Banda pré-gate — o retrofit entregou a VOZ, não o MOTOR
- **cap 1 (Cole, cold open):** competente **e vivo**. **O-1 corrigido e confirmado** — §31 lê
  "deserto de Nevada, ao norte de Nellis" (não "costa de Nevada"). Interioridade real (§55 "Curadores
  não perguntam o que estão curando — curam"). Falha só no motor: **sem relógio sentido**, fecho
  meditativo em vez de corte-no-pico.
- **cap 5 (Helena) — o ELO FRACO:** miolo linear room-bound (uma mulher apertando play num gravador),
  **relógio declarado-não-sentido** (§9 "faltam poucas horas" e ignorado), corte mole, e a antítese/
  anáfora no pico da mecanicidade (§51 "Não é que ela esqueceu — é que não tem o quê esquecer").
  Interioridade-sem-evento: "bem escrito e chato". **É o caso-prova de por que o gate existe.**
- **cap 9 (Helena) — o mais forte:** relógio **SENTIDO** (o sino/os "onze minutos" perdidos), corte-
  no-pico honesto (§51-53 "parou de ser a pessoa que faz as contas. // Virou uma das linhas"),
  interioridade-**com**-evento. Fair-play impecável (o lapso é vivido em tempo real).

**Veredito da banda pré-gate:** o retrofit da fundação pôs o **DELTA** na página (voz, fair-play,
disciplina factual — O-1 aplicado no funil normal) mas **não o MOTOR** (montagem/corte/relógio
ficaram emergentes). Onde o beat se autopropulsiona (cap 1, 9) o capítulo honra o thriller; onde não
(cap 5), o buraco aparece. Ordenação: **cap 9 > cap 1 > cap 5**.

### Banda pós-gate — mais limpa E ainda viva, mas a muleta subiu de nível
- **cap 12 (Cole):** PASSA forte. Voz de Cole = léxico administrativo-cartorial (§17 "do modo como
  se apaga um registro duplicado") — caracterização, não rótulo. Corte no pico (§47 "começou, ali, o
  próprio arquivo"). Relógio sentido mesmo **sem o campo Dia/Hora na spec** (§43 "cinquenta minutos").
  Fatos VERIFICADOS (Woodbridge/I-95).
- **cap 16 (Helena):** PASSA, e distingue o POV por **tempo verbal** (narrado em **presente**, contra
  o passado de Cole). Fidelidade factual excelente (§49 Blue Book "12.618 casos… 701… dez-1969" bate
  exato com o dossiê). **DOIS defeitos:** gancho difuso (espalhado por §89-93) e um **vazamento de
  léxico estrangeiro sobrevivente** — §89 "já **llegou** há quanto tempo?" (híbrido ES/PT; **só no
  cap-16**; SPEC-08 deveria zerar).
- **cap 20 (Cole) — o melhor relógio dos três:** corrida assintótica Cole-vs-Liu com o tempo como
  variável viva (§53 "papel às 9h, juiz ao meio-dia, homens às 15h"). Interioridade real (§43 *"Eu
  sou um nome na lista."*). Anáfora justificada no clímax.

**A muleta que MIGROU (confirmada e verificada na página):**
1. **Arquitetura de frase** — a **escada silogística "A vira B, B vira C"** (Cole: §7/§11/§13) e o
   **molde definicional "é a definição de X"** (Helena: cap-16 §35/§91). Repetição de SINTAXE, cega
   ao detector.
2. **Frase-assinatura VERBATIM entre capítulos** — *"A mão soube antes da cabeça"* em **cap-12 §37 E
   cap-20 §31** (verificado). O detector não cruza capítulos, então passa.
3. **Sistemas metafóricos reusados como tique** — "a conta/soma que fecha" (Cole, 3×+); "o corredor
   recua um metro" (Helena, cap-16 §59→§83).

## Fase 5 — Conclusão honesta, por banda

- **Pré-gate (1–9):** a skill **está na página no DELTA** (voz/fair-play/factual), mas a estrutura
  (montagem/corte/relógio) foi **emergente e desigual** — forte onde o beat propulsiona (1, 9),
  fraca onde não (5). O retrofit da fundação **não bastou** para o motor; foi exatamente esse buraco
  que o gate passou a cobrar.
- **Pós-gate (10–21):** o gate **entregou o que promete** — spec conforme → prosa que executa a
  craft, **mensuravelmente mais limpa (detector) e ainda viva (interioridade real, POVs distintos,
  relógio de primeira no cap 20)**. **NÃO é "competente e sem sangue".** Mas os campos que ele checa
  **não alcançam**: (a) a **repetição de arquitetura-de-frase** e a **assinatura verbatim entre
  capítulos**; (b) a **monotonia de POV no nível-livro** (7 caps de Helena que a "Justificativa de
  fio" legaliza); (c) um **vazamento de léxico** ("llegou") que a lista SPEC-08 não cobre; (d) o
  **deslize de contador de dia** (SEXTA N+3 vs N+4). **O próximo aperto de parafuso é para lá — não
  para "adicionar sangue".**

---

## Opções de remediação (NÃO aplicadas — decisão do Rodrigo)

**Do molde (durável, alinhado à regra "consertar no molde"):**
1. **Detector cross-capítulo** — n-gramas de 4–8 palavras repetidos ENTRE capítulos (pega "a mão
   soube antes da cabeça") + heurística de **arquitetura de frase** (escada silogística "A→B, B→C";
   molde definicional "é a definição de"). Hoje `maneirismo.ts` só mede dentro do capítulo. Alimenta
   o revisor/DESMANEIRISMO.
2. **Guarda de monotonia de POV no nível-livro** — além do gate por-capítulo (que aceita
   justificativa), um aviso book-wide quando um fio domina > N de M capítulos recentes; entra na
   fase REVIEW/DESMANEIRISMO, não bloqueia por capítulo.
3. **Estender a lista de léxico estrangeiro** (`MULETAS` em `maneirismo.ts`, SPEC-08) com
   `llegou/llegó/llegar` e formas híbridas ES/PT correlatas (alvo 0).
4. **Gate de aritmética de Dia/Hora** (opcional) — checar que o contador `DIA N+k` é monotônico e
   coerente com o dia-da-semana declarado.

**Da instância (pontual, se quiser subir a qualidade já):**
5. **Reescrita cirúrgica dirigida** só dos trechos citados: cap-5 (miolo linear/corte mole), a
   frase-assinatura repetida (cap-12 §37 ↔ cap-20 §31), o "llegou" (cap-16 §89), o deslize N+3/N+4
   (spec-16/17). NÃO uma reescrita do livro.
6. **Uma passada de re-revisão** com `--revisor-craft-opus` (`REVISOR_CRAFT_OPUS=1`) nos capítulos
   com defeito citado (5, 12, 16, 20), elevando o veredito de propulsão a opus.
7. **Nada** — se a leitura de que "mais limpo e ainda vivo já é bom o suficiente" bastar; a banda
   pós-gate sustenta essa posição melhor que a pré-gate.

**Recomendação (não aplicada):** #1 + #3 são baratos, duráveis e atacam a causa medida (a muleta subiu de nível; a lista de léxico tem 1 gap). #2 endereça o
único defeito estrutural real do pós-gate. A reescrita de instância (#5) fica para depois, dirigida
pelos trechos citados aqui, não como varredura.
