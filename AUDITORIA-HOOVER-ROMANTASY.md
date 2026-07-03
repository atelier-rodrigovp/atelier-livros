# AUDITORIA-HOOVER-ROMANTASY — da assinatura emergente à garantia de engenharia

**Data:** 2026-07-03. **Método:** FASE A read-only, 2 subagentes opus em paralelo (um por
skill), consolidado pelo orquestrador. Réplica da `AUDITORIA-DAN-BROWN.md` (mesmo formato:
vereditos + tabelas + specs) para as skills `hoover-mcfadden` e `skill-romantasy`. Nada foi
editado no repo além deste arquivo; prova gerada em scratch FORA do repo
(`scratchpad/audit-hoover/`, `scratchpad/audit-romantasy/`); o job vivo `e45d6f6e` e todos os
WORK_DIRs reais foram deixados intocados. Cota: throttle-check passou; as duas skills geraram a
prova no próprio output opus dos subagentes (zero disparo do binário de escrita — nenhuma
competição de cota com a produção).

**Veredito em uma linha:** o diagnóstico do dan-brown se repete idêntico nas duas skills. As
skills são excelentes NO PAPEL (docs de autor + modelos ricos que já contêm o gênero inteiro),
mas a **corrente de produção** entrega só ~5–6 bullets de craft e **os dois trilhos
determinísticos — `EXIGENCIAS_ESTRUTURAIS_POR_SKILL` e `EXIGE_SPEC_POR_SKILL` — não têm entrada
para nenhuma das duas** (`exigencias-skill.ts:79-81`; `livro_runner.py:747-749`). Resultado: só a
**VOZ** é garantida por engenharia (cadência + muletas via `maneirismo.ts`), e **mesmo essa está
mis-calibrada para a romantasy**. Todas as assinaturas ESTRUTURAIS (relógios, POV, custo da
magia, slow burn, fair-play do twist/romance, ganchos, densidade) são **EMERGENTES ou AUSENTES**
na fiação — saíram bem na página por iniciativa do opus, exatamente o que "emergente dá, emergente
tira".

O que a página provou de bom (n=3 por skill, escritor = o subagente opus, teste controlado — não
o runner completo de produção) e o que a fiação NÃO garante estão separados abaixo, com trechos.

---

## 1. Vereditos

### hoover-mcfadden — "as assinaturas do thriller-romance são fiadas?": **NÃO (só a voz)**

hoover **não é rotação multi-POV** como dan-brown — é **POV único (Helena, 1ª pessoa presente) +
fio-M de memória intercalado**. O eixo de fiação, portanto, não é "rotação de fios", é **matriz de
relógios + regras da narradora + tabela de pistas + marcação DIA/HORA + piso de densidade**.

- **GARANTIDA (1):** cadência "curta e cheia" — `ORC_CADENCIA_POR_SKILL["hoover-mcfadden"]`
  (`maneirismo.ts:273-278`, calibrado: staccatoFrac 0.55, fragEnfase 20, colados 8) + bloco de
  craft/orçamento no perfil. Prova: caps 2–3 gerados dão `cadenciaAcima:[]` (não estouram). O
  único trilho realmente wired e bem calibrado para a voz da skill.
- **GARANTIDA-mas-firing:** higiene de muletas — o gate de muleta wired reprovaria todos os caps
  (e o próprio capítulo-exemplo da skill): "coisa" estoura em 100% (cap-01=7, exemplo=7; alvo ≈1).
  Cobre voz, não estrutura.
- **EMERGENTE:** 3 relógios (A janela cirúrgica / B doença da narradora / C antagonista) — na
  página A move (semanas→dias, cap1→cap3) e B escala, mas saiu do bullet + premissa, **sem matriz
  com dono+deadline na corrente e sem gate**; narradora não-confiável fair-play; fair-play do twist
  (sementes plantadas mas Tabela de Pistas é doc de autor, não chega ao escritor nem é checada);
  gancho/corte no pico; custo emocional; presente + DIA/HORA (meus caps ✓, mas o **exemplar da
  skill está em pretérito** — nada força a pessoa verbal).
- **AUSENTE na fiação:** o **fio-M de memória** (itálico, sem título, voz secundária, 11
  fragmentos) — nenhum trilho conhece sua existência; 100% dependente do autor/arquiteto/lembrança
  do escritor.

Achado colateral forte: a **vitrine da skill (`01-Capitulo-01-A-primeira-consulta.md`) viola 3
invariantes do próprio cânone v1.0** — pretérito (o cânone fixa 1ª pessoa **presente**), nome
"Tomás Reis" (canônico é "Tomas Adler") e 849 palavras (piso duro é 2.000). A própria demonstração
seria reprovada pelo próprio revisor. Prova de que não existe trilho forçando conformidade.

### skill-romantasy — "as convenções do gênero são fiadas?": **NÃO (e a voz está mis-calibrada)**

O gênero inteiro que a auditoria dan-brown teve de fiar **já existe como MODELO** na skill: o
`modelo-Estrutura-do-Livro.md` traz a escada de slow burn de 8 degraus, a tabela de custo de magia
e a matriz de capítulos (colunas POV/Marco/Relógio/Gancho); o `modelo-spec-capitulo.md` cobra "por
que esta cabeça?", "degrau atual", "custo pago (plantado)", "fair-play duplo". **O buraco é
idêntico ao do dan-brown pré-SPEC-DB: é tudo modelo que o arquiteto pode ou não preencher bem, sem
nenhum gate determinístico** — e, pior que a dan-brown, romantasy **nem entrou** nos dois
mecanismos genéricos.

- **GARANTIDA:** craft na caneta (`CRAFT_POR_SKILL["skill-romantasy"]` v2 + orçamento injetados no
  perfil).
- **GARANTIDA-mas-MIS-CALIBRADA:** o gate de cadência roda, porém com o `ORC_CADENCIA` **default
  (longo)**, porque romantasy **não está** em `ORC_CADENCIA_POR_SKILL`. Medido: os 3 caps dão
  `cadenciaAcima=true`, mas o `staccatoPct` foi BAIXO (16–23%, bem abaixo do alvo 35%) — não é
  excesso de staccato; o que estoura é a **contagem de fragmentos de ênfase** (7/4/5 vs alvo 2),
  que é a **frase-soco BookTok, a assinatura do gênero**. O orçamento longo criminaliza a voz
  correta — mesmíssimo caso que fez o hoover ganhar ORC próprio.
- **EMERGENTE:** POV duplo com alternância motivada (saiu com ganho real, mas nada impede 2–3 caps
  no mesmo amante); magia de custo pago em cena + escala (custo pago e crescente na página foi
  iniciativa do opus; tabela poder→preço vive só no modelo, sem gate → "poder novo conveniente"
  passa); slow burn por marcos; gancho cruel; fair-play duplo; frase-soco.
- **PARCIALMENTE GARANTIDA:** piso de palavras (determinístico SE a banda estiver na Estrutura;
  senão só checklist-LLM — cap-03 saiu com 923 palavras).
- **AUSENTE na fiação:** exigências estruturais (matriz POV / custo-magia / escada-burn) — gate
  100% inerte.

**Pendência anterior CONFIRMADA (n=3):** os moldes de IA reincidem — fragmento de ênfase estoura
nos 3, "coisa" estoura nos 3, anáfora em 2/3. Magnitudes menores que o teste n=1 (lá anáfora 5 /
colados 7; aqui anáfora ≤3 / colados 1 par), mas a direção é inequívoca e persistente.

---

## 2. Tabelas de evidência

### hoover — assinatura → onde a corrente garante vs deixa ao acaso

| Assinatura | Vive na skill | Corrente GARANTE | Deixa ao acaso |
|---|---|---|---|
| 3 relógios (dono+deadline) | Bíblia §4 + Mapa | nada (craft: "mantenha 2–3 visíveis") | arquiteto/spec/revisor; sem matriz, sem gate |
| Narradora não-confiável fair-play | Bíblia §3+§6 | nada (craft genérico) | sem doc "regras da narradora" na corrente |
| Fair-play do twist (semente→paga) | Mapa "Tabela de Pistas" | nada | tabela é doc de autor; revelação sem pista não é barrada |
| Gancho / corte no pico | SKILL + voz-e-oficio | parcial (gates de cadência) | sem gate de gancho |
| Cadência "curta e cheia" | voz-e-oficio + Bíblia §2 | **GARANTIDA** (ORC próprio + orçamento) | — |
| Piso densidade 2.000 | SKILL + checklist | parcial (piso atado à Estrutura, não ao 2.000 da skill) | se projeto não seta piso≥2000, vira só revisor-LLM |
| Presente + DIA/HORA no topo | Bíblia §2.1/§2.3 | nada determinístico | sem gate de pessoa verbal / DIA-HORA |
| Fio-M de memória | Bíblia §2.2 + Estrutura | **nada** | totalmente emergente |

### hoover — prova na página (detector, orçamento hoover)

| Arquivo | Palavras | staccato% (alvo 55) | `cadenciaAcima` (orç. hoover) | muletas |
|---|---|---|---|---|
| cap-01 | 956 | 37.1 ✓ | anáfora 7/2, fragEnfase 22/20 (marginal) | **coisa 7** |
| cap-02 | 926 | 32.7 ✓ | **[] passa** | coisa 3 |
| cap-03 | 843 | 35.6 ✓ | **[] passa** | coisa 2 |
| exemplo-skill | 849 | 37.0 ✓ | clipeNeg 4/3, anáfora 3/2 (marginal) | coisa 5 |

Relógios rastreáveis na página: A "Semanas. Não meses" (cap-01) → "Onde eu disse semanas, agora
leio dias. Poucos." (cap-03). B "coisa fina passar por trás das costelas" (cap-01) → "o número…
não é o dele. É o meu." (cap-03). Ganchos variados: "Ele não podia saber dela. / Ninguém podia."
(01) · "…me deixou com tanto frio." (02) · "É o meu. E eu ainda não o medi." (03).

### romantasy — assinatura → onde a corrente garante vs deixa ao acaso

| Assinatura | Vive na skill | Corrente GARANTE | Deixa ao acaso |
|---|---|---|---|
| POV duplo, alternância motivada | SKILL + voz-e-oficio + spec model | craft (alvo qualitativo) | sem matriz de POV; `EXIGE_SPEC` sem romantasy; nada mede "2 caps no mesmo amante" |
| Magia de custo, paga + crescente | SKILL + arquitetura + Bíblia | craft ("preço crescente") | sem tabela/gate; escala é iniciativa do modelo |
| Slow burn por marcos | SKILL + Estrutura model (escada 1–8) | modelo (se preenchido) | nenhum gate; não reprova estagnação/resolução precoce |
| Gancho cruel variado | SKILL + voz-e-oficio | checklist-LLM | runner sem gate de gancho |
| Fair-play duplo (trama E romance) | SKILL + Estrutura ("Tabela de Pistas") | modelos + checklist | sem registro verificado (dan-brown tem dossiê+revisor) |
| Cadência do gênero (frase-soco) | voz-e-oficio | gate roda **mas com ORC default longo** | **descasamento**: romantasy fora de `ORC_CADENCIA_POR_SKILL` |
| Craft na caneta | — | **GARANTIDA** | — |
| Exigências (matriz/spec) | modelos | — | **`EXIGENCIAS`/`EXIGE_SPEC` sem romantasy → gate inerte** |

### romantasy — prova na página (detector, ORC default)

```
cap-01 (1147p) cadenciaAcima=true — fragEnfase 7/2, anáfora 2/1, colados 2/1, coisa 4/1
cap-02 (1096p) cadenciaAcima=true — fragEnfase 4/2, anáfora 3/1, símile-andaime 4/1, coisa 3/1; maneirismos por10k=54.7 ACIMA
cap-03 ( 923p) cadenciaAcima=true — fragEnfase 5/2, colados 1/0, coisa 2/1
```
staccatoPct medido: 16–23% (BAIXO — a voz não é staccata demais; o que estoura é a contagem de
fragmentos de ênfase, i.e., a frase-soco do gênero). POV com ganho real na alternância; custo da
magia pago em cena e escalando ("Trocara a mãe pelo irmão sem saber que estava trocando", cap-01 →
feitiço partilhado que cobra a memória da própria amada, cap-03); marcos de burn subindo por
mérito (faísca → vulnerabilidade → primeiro toque com carga + ruptura cruel).

---

## 3. SPECS (mecanismo GENÉRICO por skill — hoover/romantasy = 2ª e 3ª entradas populadas)

Reutilizam o trilho existente (`EXIGENCIAS_ESTRUTURAIS_POR_SKILL` + espelho `EXIGE_SPEC_POR_SKILL`
no runner + normalizadores idempotentes por marcador + `ORC_CADENCIA_POR_SKILL`). **Skill sem
entrada continua NO-OP absoluto** — o teste "sem entrada = inerte" e os cenários dan-brown seguem
passando. Nenhum mecanismo paralelo.

### Decisão de design a aprovar (afeta HM1 e RM1)

A interface atual `ExigenciasSkill` tem `dossie: boolean` (1 arquivo de fundação: `dossie-factual.md`).
hoover precisa de **docs de fundação diferentes** (matriz-de-relógios, regras-da-narradora) e
romantasy de **seções marcadas na Estrutura** (matriz-POV, custo-magia, escada-burn). Proposta:
**generalizar** — adicionar um campo opcional `docsFundacao?: {arquivo?: string, marcador?: string,
descricao: string}[]` que o normalizador verifica por presença (arquivo existe OU marcador na
Estrutura) e **SINALIZA ausência** (nunca gera — quem gera é o arquiteto/fundação, como já é com a
MATRIZ-FIOS e o dossiê do dan-brown). `dossie: boolean` do dan-brown fica intacto (back-compat;
seus testes não mudam). Alternativa mais conservadora: campos hoover/romantasy específicos sem
tocar a interface — mais feio, menos reutilizável. **Recomendo a generalização.**

---

### SPEC-HM1 — Fundação da hoover: relógios + regras da narradora + pistas (assinaturas emergentes → fiadas)
- **OBJETIVO:** projeto hoover nasce (e projeto vivo ganha) exigências determinísticas de fundação:
  (a) `matriz-de-relogios.md` — os 3 relógios nomeados, cada um com **dono, ponto de partida,
  deadline e posição-alvo ao fim de cada ato** (a Bíblia §4 já é isto; a fiação só exige/verifica);
  (b) `regras-da-narradora.md` — tabela "o que Helena omite/distorce / de quem / em que ato o
  leitor pode saber" + régua de fair-play (= Bíblia §3+§6); (c) seção marcada `<!-- TABELA-PISTAS
  v1 -->` (semente→pagamento) semeada com ≥3 pistas do Ato I.
- **ARQUIVOS:** `worker/src/exigencias-skill.ts` (entrada `hoover-mcfadden` + generalização
  `docsFundacao` + teste); `blocoNotasExecucao` na Estrutura (marcador `<!-- RELOGIOS-NARRADORA v1
  -->`: DIA/HORA avança em toda spec; ≥1 relógio move por capítulo; nenhuma revelação sem pista
  registrada; piso 2.000 para caps de Helena, fragmentos-M isentos; **presente/1ª pessoa —
  pretérito é defeito**); fiação em `jobs.ts` (dois pontos dos normalizadores) + `promptFundacao`
  no `criar_fundacao`; patch do arquiteto p/ projeto novo.
- **MUDANÇA (hoover):** `fios:{min:1,max:2}` (fio-Helena + fio-M), `maxCapsMesmoFio:6` (cadência do
  fragmento-M, não rotação de POV), `dossie:false`, `docsFundacao:[matriz-de-relogios,
  regras-da-narradora, marcador TABELA-PISTAS]`.
- **DoD:** testes verdes; sweep num projeto hoover sintético → normalizador injeta RELOGIOS-NARRADORA
  e SINALIZA os docs ausentes; skill sem entrada = no-op provado. Prova na página (FASE B): re-gerar
  os 3 caps com a fundação corrigida → cada relógio declarado e movendo, DIA/HORA no topo, presente.
- **RISCO:** inflar fundação de quem não precisa (mitigado: opt-in por skill); doc de autor já
  existente conflitar (mitigado: seção aditiva marcada, warn-não-gera).

### SPEC-HM2 — Spec-arquivo + gate por capítulo da hoover
- **OBJETIVO:** capítulo hoover só é escrito com `specs/Spec-Capitulo-NN.md` completa: **Dia/Hora
  corrente**, **Relógios** (posição de A/B/C + qual avança aqui e como), **Pistas** (`Planta:
  <ID>` / `Paga: <ID>`), **Narradora** (o que Helena omite/enquadra), **Gancho** (tipo, diferente
  dos 2 anteriores). Gate determinístico + bounded.
- **ARQUIVOS:** `worker/skill-patches/livro-do-zero-ao-epub/assets/livro_runner.py`
  (`EXIGE_SPEC_POR_SKILL["hoover-mcfadden"] = dict(campos=["Dia/Hora","Relógios","Pistas","Gancho",
  "Narradora"], max_mesmo_fio=6)`); `exigencias-skill.ts` `blocoSpecEditor` (formato completo
  injetado no `livro-editor.md`, marcador `<!-- SPEC-COMPLETA v1 -->`); patch do template de spec
  do arquiteto. **Gates determinísticos extra viáveis no runner:** presença de cabeçalho DIA/HORA
  no topo do capítulo (regex) e **piso = 2.000** para caps de Helena (amarrado ao piso da skill,
  não à config genérica). "Relógio moveu?"/"pista tem semente?" ficam com o revisor-LLM, mas o
  **campo de spec força a declaração**.
- **DoD:** unit tests (spec ok passa; sem Dia/Hora ou sem Relógios reprova; skill sem entrada =
  inerte; dan-brown intacto); py_compile + paridade patch↔instalado. Prova na página (FASE B):
  próximo capítulo hoover nasce com Spec-Capitulo-NN.md completa e gateada.
- **RISCO:** custo de 1 call curta do editor-haiku por capítulo (barato); falso positivo em fio-M
  legítimo repetido (mitigado: `max_mesmo_fio=6` + linha de justificativa; bounded).

### SPEC-RM1 — Fundação da romantasy: matriz POV + tabela de custo + escada de slow burn
- **OBJETIVO:** projeto romantasy nasce com 3 seções marcadas na Estrutura: `<!-- MATRIZ-POV v1 -->`
  (os 2 amantes, o que cada cabeça sabe/esconde, regra de alternância), `<!-- CUSTO-MAGIA v1 -->`
  (poder → preço → escala por ato, "cada uso cobra mais"), `<!-- ESCADA-BURN v1 -->` (os 8 degraus
  do modelo já existente, ancorados a capítulos-alvo). O gênero inteiro já está no
  `modelo-Estrutura-do-Livro.md` — a fiação exige/verifica.
- **ARQUIVOS:** `worker/src/exigencias-skill.ts` (entrada `skill-romantasy`: `fios:{min:2,max:2}`
  — POV duplo exato, `maxCapsMesmoFio:2`, `dossie:false`, `docsFundacao:[3 marcadores acima]`);
  `blocoNotasExecucao` (`<!-- ROTACAO-POV v1 -->`: nunca 2 caps seguidos no mesmo amante sem
  `Justificativa de POV:`; troca só com ganho, nunca recontando cena); `promptFundacao` +
  patch do arquiteto; fiação em `jobs.ts`.
- **DoD:** testes verdes; sweep → ROTACAO-POV injetada + SINALIZA seções ausentes; no-op provado.
  Prova na página (FASE B): 3 caps com fundação corrigida → POV declarado c/ justificativa, custo
  escalando declarado, degrau de burn por capítulo.
- **RISCO:** igual HM1 (opt-in mitiga).

### SPEC-RM2 — Spec-arquivo + gate por capítulo da romantasy
- **OBJETIVO:** capítulo só escrito com spec completa: **Ponto de vista** (qual amante + por quê),
  **Degrau slow burn** (nº + movido por mérito/como, ou repouso), **Custo de magia** (se uso
  decisivo: preço plantado pago + escala vs. anteriores), **Marco de relação** (planta/paga),
  **Gancho** (tipo, diferente dos 2 anteriores). Guarda: 2 caps no mesmo amante sem justificativa
  reprova.
- **ARQUIVOS:** runner `EXIGE_SPEC_POR_SKILL["skill-romantasy"] = dict(campos=["Ponto de vista",
  "Degrau slow burn","Custo de magia"], max_mesmo_fio=2)` — reaproveita `gate_spec_capitulo` +
  `_fio_da_spec` (adaptar regex do fio para "Ponto de vista"/"POV"); `blocoSpecEditor`
  (SPEC-COMPLETA); patch do template de spec. Item novo de revisor `<!-- CUSTO-ESCALA v1 -->`:
  "toda solução mágica decisiva pagou o preço plantado E o custo escalou (ou foi partilhado com
  preço); magia grátis = deus-ex, edição obrigatória."
- **DoD:** unit tests (spec ok passa; sem Ponto de vista reprova; 3º cap no mesmo amante sem
  justificativa reprova; skill sem entrada = inerte; dan-brown intacto); py_compile + paridade.
- **RISCO:** falso positivo em POV repetido legítimo (mitigado: justificativa + bounded).

### SPEC-RM3 — ORC de cadência próprio da romantasy (moldes de IA reincidiram — CONFIRMADO n=3)
- **OBJETIVO:** corrigir o descasamento medido — a frase-soco/fragmento de ênfase é a assinatura
  BookTok do gênero (staccatoPct baixo, 16–23%), mas o `ORC_CADENCIA` default (longo) a
  criminaliza. Espelhar a solução do hoover, **mais suave** (romantasy é curta-média + períodos
  líricos, menos staccata).
- **ARQUIVOS:** `worker/src/maneirismo.ts` `ORC_CADENCIA_POR_SKILL["skill-romantasy"] =
  {...ORC_CADENCIA, fragEnfase:6, fragColados:1, anafora:2}` (staccatoFrac fica no default 0.35 —
  romantasy NÃO estourou staccato; italico/retorica/epigrama no default). **MANTER FIXAS** (molde
  de IA em qualquer skill, não voz): muleta **"coisa"** (≤1) e **símile-andaime** "como se/como
  quando" (≤1) — ambas estouraram e são muletas reais. Espelho no runner + teste de paridade.
  Reforço no `CRAFT_POR_SKILL["skill-romantasy"]`: 1–2 linhas de alvo positivo (custo escala; burn
  sobe só com mérito; troca de POV só com info nova) + anti-"coisa" explícito. O bloco de orçamento
  no perfil (via `craft-skill.ts`, que já lê `orcCadenciaParaSkill`) passa a refletir os números
  certos automaticamente.
- **DoD:** teste de paridade TS↔py do ORC; re-rodar o detector nos 3 caps de teste → `fragEnfase`
  deixa de estourar a voz correta, mas "coisa"/símile continuam pegando. Prova na página (FASE B).
- **RISCO:** afrouxar demais e deixar staccato de IA passar (mitigado: só fragEnfase/colados/anáfora
  sobem, com folga menor que o hoover; staccatoFrac intacto).

---

## 4. Anexo — esqueleto atualizado das outras skills (registrar; NÃO implementar agora)

Refinado pelo que se aprendeu (o eixo de fiação varia por skill; nem tudo é "rotação de fios"):

- **vesper:** léxico canônico como arquivo-fonte (`léxico-canonico.md`) — o revisor confere termo a
  termo; **docsFundacao** = mapa de revelação progressiva (o que o leitor sabe por livro/ato).
  camposSpec: PdV/beat/marco + "termos canônicos tocados". Guarda: termo fora do léxico = aviso
  (não bloqueia). Provável ORC próprio se a voz VÉSPER for longa (herda o default — verificar).
- **skill-jk-rowling:** **docsFundacao** = registro plantar-e-pagar (semente→pagamento, cap X→cap
  Y). camposSpec: "sementes a plantar/pagar neste capítulo". Guarda: pagamento sem semente
  registrada = aviso ao revisor. Sem gate de rotação (POV não é o eixo). ORC: a voz é "a respiração"
  (longa encadeada) — o default provavelmente serve; confirmar na página antes de assumir.

**Padrão que emergiu das 3 auditorias:** cada skill tem um EIXO de assinatura distinto —
dan-brown = rotação de fios + dossiê factual; hoover = relógios + narradora + pistas + DIA/HORA;
romantasy = POV duplo + custo-escala + slow burn; vesper = léxico + revelação; jk = plantar-e-pagar.
O mecanismo genérico (`EXIGENCIAS`/`EXIGE_SPEC`/`docsFundacao`/ORC próprio) comporta todos; o que
muda é a entrada populada.

---

## 5. Correções fora do mecanismo (apontadas pela evidência — decidir à parte)

- **hoover:** regravar `01-Capitulo-01-A-primeira-consulta.md` em presente, ≥2.000 palavras, nome
  "Tomas Adler" — ou marcá-lo explicitamente como amostra pré-v1.0 (hoje viola 3 invariantes do
  próprio cânone). Enriquecer `CRAFT_POR_SKILL["hoover-mcfadden"]` com os 3 relógios nomeados + a
  regra DIA/HORA (hoje os 6 bullets são genéricos demais).

---

## 6. Fronteiras e estado (para a decisão de aprovação)

- FASE A foi **read-only** (só este arquivo no repo + scratch fora dele). Nada aplicado.
- Prova é **n=3 por skill, escritor = subagente opus** (teste controlado, não o runner completo de
  produção). Robusta para os vereditos de fiação (que independem do n: os trilhos ou têm entrada ou
  não têm — e não têm) e para a cadência (3/3 consistentes). Honesta sobre o limite: não substitui a
  prova de produção, que vem na FASE B (re-gerar com fundação/specs novas).
- **Não implementar sem aprovação.** Ações irreversíveis reservadas para depois e mediante
  confirmação citando o estado do `e45d6f6e`: `instalar-skills.ps1`, restart do worker, qualquer
  escrita em WORK_DIR real ou Supabase, git push.

---

## 7. FASE B — APLICADA (2026-07-03)

As 5 SPECs foram implementadas e verificadas **no repo** (nada em produção ainda — install +
restart são o portão irreversível, abaixo). Decisões do usuário honradas: (1) escopo = todas
as 5; (2) interface generalizada com `docsFundacao?` (presença/sinalização, nunca geração;
`dossie:boolean` intacto); (3) craft enriquecido + vitrine da hoover neutralizada já.

**Mudanças (in-repo, reversíveis, sem push):**
- `worker/src/exigencias-skill.ts`: entradas `hoover-mcfadden` (HM1/HM2) e `skill-romantasy`
  (RM1/RM2); interface + `DocFundacao`, `marcadorNotas`, `blocoRevisor`/`marcadorRevisor`;
  `normalizarExigenciasSkill` com loop `docsFundacao` genérico; `garantirBlocoRevisorSkill`.
- `worker/src/maneirismo.ts` + runner `CAD_POR_SKILL`: ORC próprio da romantasy (RM3).
- runner `livro_runner.py`: `EXIGE_SPEC_POR_SKILL` (hoover/romantasy), `_sem_acento` (matching
  robusto), `_fio_da_spec`/justificativa aceitam "Ponto de vista"/"Justificativa de POV".
- `worker/src/craft-skill.ts`: crafts hoover (3 relógios nomeados + DIA/HORA) e romantasy (RM3).
- `worker/skill-patches/hoover-mcfadden/01-Capitulo-01-A-primeira-consulta.md`: banner
  "AMOSTRA PRÉ-v1.0 — NÃO normativa" (conteúdo idêntico ao original, só o banner no topo).
- `worker/src/exigencias-skill.test.ts`: opt-in reflete 3 entradas; cenários hoover/romantasy;
  "sem entrada = inerte" e dan-brown **preservados**.

**DoD verde:** vitest 138 testes (falha única = `hidratar.test.ts`, ambiental por env Supabase
ausente, **pré-existente** e provada com `git stash`); `tsc --noEmit` = 0; gate funcional py
(hoover accent-insensitive, rotação de POV romantasy, dan-brown regressão, skill inerte = 13/13);
sweep sintético (injeta blocos + SINALIZA docs ausentes sem gerar + idempotente + no-op sem
entrada = 14/14); `py_compile` do runner OK; paridade TS↔py do ORC por inspeção.

**PENDENTE (portão irreversível — aguarda confirmação):** `pwsh worker/skill-patches/instalar-skills.ps1`
(propaga o runner patcheado + o banner da hoover para `~/.claude/skills/`) e **restart do worker**
(código no HEAD ≠ produção). A **prova na página antes/depois** (re-gerar 3 caps por skill com a
fundação corrigida) roda em seguida, com prioridade hoover se a cota apertar.
