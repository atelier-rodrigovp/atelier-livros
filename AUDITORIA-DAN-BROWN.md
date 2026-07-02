# AUDITORIA-DAN-BROWN — montagem paralela e textura factual (H1/H2)

**Data:** 2026-07-02 (tarde). **Método:** FASE A read-only no projeto vivo `53abdade`
("O Índice dos Abduzidos", 9 caps no disco ao fim da coleta), 2 subagentes em paralelo
(FIAÇÃO: fundação→specs→gerador; PÁGINA: caps 1–8), consolidado pelo orquestrador.
Nada foi editado. Referências da craft: `metamodelo-thriller.md` §2 (montagem) e §8
(precisão factual / "o espaço guarda o segredo").

**Veredito em uma linha:** as duas hipóteses estavam MEIO certas — a página é melhor
que o esperado (3 fios reais, cortes no pico corretos, ~40 fatos verificáveis), mas
tudo o que funciona veio de **iniciativa emergente do modelo**, não da fiação: a
fábrica não garante fios, o formato de spec instalado **dropa** Montagem/Dia-Hora/
Forma/factual, specs-arquivo nem existiram em 8 de 9 caps, e a única "fonte" factual
é 1 parágrafo sem fontes (com erro interno). O que emergente dá, emergente tira: o
miolo linear (caps 4–6), o bug de linha do tempo (quinta→terça) e a "costa de Nevada"
são exatamente o custo de não ter fiação.

---

## 1. Vereditos

### H1 — "a montagem paralela morre na fundação/estrutura": **PARCIAL**

**Refutada onde a hipótese apontava, confirmada um elo adiante.**

- **Fundação: mais forte que a hipótese.** 3 fios com personagem+função+relógio-dono
  (`Estrutura-do-Livro.md:4-5`: R1 Cole/extermínio, R2 Reyland/cooptação, R3 Helena/
  cognitivo) e coluna POV por capítulo com rotação planejada (`:15-29`; Notas A.4 `:108`:
  "Alternar 2–4 fios… Cortar no pico"). Mapa de Entrelaçamento por bloco
  (`Mapa-de-Personagens.md:164-173`).
- **Página: a macro funciona.** 3 POVs em 8 caps (Cole, Helena, Sam); cross-cutting
  intra-capítulo exemplar no cap 3 (4 cortes Helena↔Cole); cortes de fio no pico
  corretos em 3→4 e 7→8 (trechos no §3 do anexo B). Fatos: o padrão Dan Brown existe.
- **ONDE CONFIRMA (a cadeia de transporte):**
  1. A coluna POV da Estrutura foi **iniciativa emergente** — o template do arquiteto
     só exige `tier` (`arquiteto-de-enredo/SKILL.md:183`); a entrevista não pergunta
     fios/montagem/localidade (blocos 1–8, `:65-103`; grep "montagem|localidade" = 0).
  2. O formato de spec que o arquiteto instala no `livro-editor` **dropa** Montagem
     (corte de/para), Dia/Hora, Forma e Notas factuais que o template da skill tem
     (`livro-editor.md:26-42` vs `modelo-spec-capitulo.md:10,43-45,51-57`).
  3. **Specs-arquivo não existem**: 1 em 9 caps (`specs/Spec-Capitulo-09.md`, nascida
     hoje); o prompt do runner manda ler "a LINHA do Capitulo {n} em Estrutura"
     (`livro_runner.py:436-437`) e não menciona `specs/` nem o portão "nenhum capítulo
     sem spec" do Runbook da skill (`Runbook:37-39,200-201`).
  4. **Nenhum fio tem localidade própria formalizada** (tabela sem coluna de local;
     `contexto-cap-1.md:65`: "Local da morte: **definir na escrita**").
  5. **Dia/Hora não é campo em lugar nenhum** (Estrutura sem coluna; `estado.json` sem
     o `dia_hora_corrente` que o Runbook exige `:105`) → custo na página: **cap 4 diz
     "quinta-feira", caps 6–7 dizem "terça"** — indefensável.
  6. **Montagem intra-capítulo não é planejada**: ledger FORMAS RECENTES prova caps
     saindo "Cena única" (`estado-narrativo.md:359-365`); o miolo 4–6 roda 3 caps no
     mesmo POV e quase na mesma sala, com o antagonista fora da página por 4 caps
     (Helena é câmera em 5 caps seguidos contando o 3).

### H2 — "a textura factual morre por falta de fonte": **PARCIAL (fiação CONFIRMADA)**

- **Página: refutada como "mundo genérico".** ~40 ocorrências de fatos REAIS
  verificáveis (~28 distintos): geografia do norte da Virgínia correta e coerente
  (Spotsylvania↔DC 90min; King Street descendo ao cais; Springfield/Woodbridge/I-95),
  ciência de memória real (reconsolidação, *Nature Human Behaviour*, H₀, criptomnésia),
  Nellis/A-10, zolpidem+anti-hipertensivos. Tudo do conhecimento paramétrico do opus.
- **ONDE CONFIRMA:**
  1. **Fonte: 1 parágrafo** (`Biblia-da-Obra.md:169-174`, 5 âncoras sem fontes) — que
     contém erro interno ("linha **Loretta**/Elizabeth Loftus") — sintoma de fato
     paramétrico não verificado DENTRO do próprio doc de precisão.
  2. Campo "Notas de precisão factual" existe **só no template da skill**; nunca chegou
     a nenhuma spec/digest real (0 em 9 caps). Entrevista do arquiteto não pede
     pesquisa; a regra dele é proibição sem provisão (`SKILL.md:298`).
  3. **Fato-como-PISTA (§8) ausente**: os fatos reais são ambiente/verossimilhança;
     toda pista central (espiral de 7 pontos, o Índice) é ficção pura — "o espaço
     guarda o segredo" não acontece.
  4. Custo já visível: **"costa de Nevada"** (cap 1 — Nevada não tem litoral) e o
     grupo japonês pseudo-real — exatamente o risco de paramétrico sem dossiê.

### Achados operacionais do manuscrito (fora das specs; corrigir em revisão)

- O-1: "costa de Nevada" (capitulo-01.md) — 1 edição cirúrgica.
- O-2: linha do tempo quinta (cap 4) → terça (caps 6–7) — decidir o dia canônico e
  editar 1–2 menções. Ambos são para um job `revisar` dirigido (ou o REESCRITA
  pós-review), não para as specs estruturais.

---

## 2. Tabelas (evidência consolidada)

### Página: cap × POV × localidade × tempo × fatos (Subagente B)

| Cap | POV | Localidade | Dia/hora | Fatos reais |
|---|---|---|---|---|
| 1 | Cole | Spotsylvania VA | noite, "outono" | 5 REAIS; 1 PSEUDO ("costa de Nevada") |
| 2 | Helena | Lisboa | janeiro, ~16h | 7 REAIS |
| 3 | **Helena↔Cole** (4 cortes) | motel Route 1/Alexandria | tarde | 4 REAIS (Nellis, A-10) |
| 4 | Helena | ruas/carro Alexandria | ~22h; "quinta-feira" | 3–4 REAIS |
| 5 | Helena | hotel Alexandria | manhã | 3 REAIS; 1 PSEUDO (grupo japonês) |
| 6 | Helena | hotel (mesma sala) | "terça-feira" (!) | 5 REAIS |
| 7 | **Sam↔Helena** | King Street/cais | tarde de terça | 11 REAIS (geografia correta) |
| 8 | Cole | Springfield VA | 5h10 | 3 REAIS |

Métricas: 3 POVs; ~7 cenários/2 âncoras; máx. 3 caps puros no mesmo POV (4–6; 5 com
o cap 3); ~40 fatos REAIS vs 2 PSEUDO.

### Fiação: o que cada capítulo recebeu (Subagente A)

Nenhum cap 1–8 teve spec-arquivo; campo de localidade: inexistente; campo Dia/Hora:
inexistente; campo factual: 0 preenchidos em 9. A "spec" real = linha da Estrutura +
digest (prova: `contexto-cap-1.md:25` cita literalmente a coluna Beat).

### Mapa "onde cada elo quebra"

| Elo | Quebra | Evidência |
|---|---|---|
| Entrevista → fios/montagem/local | não pergunta | `arquiteto/SKILL.md:65-103` |
| Template Estrutura → POV/Dia-Hora/local | só exige `tier` | `arquiteto/SKILL.md:183` |
| Template spec skill → formato do projeto | arquiteto instala podado | `livro-editor.md:26-42` |
| Portão "sem spec não escreve" → runner | prompt lê a LINHA; specs/ ignorado | `livro_runner.py:436-453` |
| `dia_hora_corrente` → estado.json | campo omitido | `Runbook:105` vs estado.json |
| Precisão factual → spec/digest | campo nunca preenchido; fonte = 1 § c/ erro | `Biblia:169-174` |
| Montagem intra-cap → prosa | tudo "Cena única" | `estado-narrativo.md:359-365` |

---

## 3. SPECS (mecanismo GENÉRICO por skill; dan-brown = 1ª entrada populada)

Padrão: novo `worker/src/exigencias-skill.ts` com
`EXIGENCIAS_ESTRUTURAIS_POR_SKILL: Record<string, ExigenciasSkill>` (mesmo molde de
`CRAFT_POR_SKILL`/`ORC_CADENCIA_POR_SKILL`): skill sem entrada = **no-op absoluto**.
Roda após `criar_fundacao`, no início de `escrever_livro` e em sweep — idempotente
por marcador, como os normalizadores existentes.

### SPEC-DB1 — Matriz de fios na fundação (H1, elos 1–2 e 4)
- **OBJETIVO:** projeto com skill exigente nasce (e projeto vivo ganha) uma seção
  determinística `<!-- MATRIZ-FIOS v1 -->` na fundação: 2–4 fios, cada um com
  personagem, **localidade-base**, função, relógio-dono e ponto de convergência; e a
  instrução de rotação (nunca 3 caps seguidos no mesmo fio sem justificativa nas
  Notas de Execução).
- **ARQUIVOS:** `worker/src/exigencias-skill.ts` (+ teste); fiação em `jobs.ts` (dois
  pontos onde os normalizadores já rodam); `worker/skill-patches/arquiteto-de-enredo/SKILL.md`
  (entrevista bloco 5 ganha sub-pergunta condicional por skill exigente: fios/
  localidades/montagem; template de Estrutura `:183` passa a exigir colunas
  POV + Dia/Hora quando a skill exigir) + `instalar-skills.ps1` na fronteira.
- **MUDANÇA (dan-brown):** entrada com `fios: {min:2, max:4, camposPorFio:[personagem,
  localidadeBase, funcao, relogio, convergencia]}` + texto do bloco injetável. Para
  projeto VIVO sem matriz: o bloco é gerado a partir do que a fundação JÁ define
  (H/C/R do 53abdade têm personagem+função+relógio; falta localidade-base e regra de
  rotação) — injeção aditiva, **zero retcon**. RETROFIT do Índice: OPCIONAL e só
  desenhado (anexo C) — não aplicar sem aprovação separada.
- **DoD:** testes verdes; sweep no 53abdade → grep `MATRIZ-FIOS v1` na fundação com
  os 3 fios e localidades-base preenchidas dos dados existentes; skill sem entrada
  (jk etc.) → no-op provado em teste.
- **RISCO:** inflar a fundação de projetos que não precisam (mitigado: opt-in por
  skill); conflito com prosa existente da Estrutura (mitigado: seção aditiva marcada,
  nunca edita a tabela).

### SPEC-DB2 — Spec-arquivo obrigatória com rotação + Dia/Hora (H1, elos 3, 5–6)
- **OBJETIVO:** capítulo de skill exigente só é escrito com `specs/Spec-Capitulo-NN.md`
  presente e completa (Fio de POV, Dia/Hora corrente, Montagem corte-de/para, Forma
  anti-mesmice, Notas factuais); rotação cobrada por guarda determinística.
- **ARQUIVOS:** `worker/skill-patches/livro-do-zero-ao-epub/assets/livro_runner.py`
  (prompt de escrita manda o `livro-editor` materializar a spec ANTES do escritor +
  `gate_spec_capitulo(projeto, n, skill)`: determinístico, barato — spec existe? tem
  `Fio de POV`? tem `Dia/Hora`? o fio ≠ o dos 3 caps anteriores OU há linha
  `Justificativa de fio:`? Se falhar: 1 re-geração dirigida da spec (bounded via
  marcador, filosofia "bounded, não bloqueia"; 2ª passada aceita com aviso alto);
  `worker/src/exigencias-skill.ts` (formato de spec completo injetado no
  `livro-editor.md` gerado, marcador `<!-- SPEC-COMPLETA v1 -->`, upgrade in-place —
  padrão craft-agentes); patch do arquiteto (template de spec `:404-405` ganha os
  campos para projetos novos).
- **DoD:** unit tests do parser/guarda (spec ok passa; sem Dia/Hora reprova; 4º cap
  consecutivo do mesmo fio sem justificativa reprova; skill sem entrada = gate
  inerte); sweep no 53abdade → `livro-editor.md` com o formato completo (grep dos 5
  campos); py_compile + paridade patch↔instalado na fronteira. Prova na página (FASE
  B): próximo capítulo do Índice nasce com Spec-Capitulo-NN.md completa.
- **RISCO:** custo extra por capítulo (1 call curta do editor-haiku para a spec —
  barato); guarda com falso positivo em fio legítimo repetido (mitigado: linha de
  justificativa escapa; bounded).

### SPEC-DB3 — Dossiê factual verificado (H2)
- **OBJETIVO:** `dossie-factual.md` na fundação como ÚNICA fonte de "real": fatos por
  locação/tema com status `VERIFICADO (fonte)` ou `HIPÓTESE`; a spec puxa 2–3 fatos
  por capítulo (campo Notas factuais); o escritor usa SÓ o dossiê (ou marca hipótese
  na prosa); o revisor checa "fato usado consta no dossiê?".
- **ARQUIVOS:** `worker/src/exigencias-skill.ts` (exigência `dossie: true` na entrada
  dan-brown + instrução no prompt de `criar_fundacao` em `jobs.ts`: compilar o dossiê
  na fundação — com WebSearch quando disponível na sessão; SEM fonte citável ⇒ entra
  como HIPÓTESE, nunca como VERIFICADO); runner (`prompt_escrita_capitulo` manda ler
  o dossiê; o gate da SPEC-DB2 já cobra o campo na spec); `craft-agentes.ts` (item no
  revisor: "fato real usado ≠ inventado — confira contra dossie-factual.md").
- **RETROFIT do Índice (aplicação a partir do próximo capítulo, mediante aprovação):**
  gerar dossiê retroativo dos temas/locais já estabelecidos (Blue Book, Roswell,
  NARA, AARO, Stargate/SRI, geografia N-Virgínia + Lisboa, ciência da memória/
  Elizabeth Loftus) — 1 job de fundação com pesquisa; corrigir de tabela o erro
  "Loretta/" da Bíblia.
- **DoD:** testes verdes (no-op p/ skill sem dossiê); sweep/criação → dossiê presente
  com ≥N fatos e TODOS com status; prova na página (FASE B): re-gerar 1 capítulo de
  teste com fundação corrigida → ≥2 fatos do dossiê na prosa E ≥2 POVs no plano de
  specs (DoD combinada com DB1/DB2).
- **RISCO:** dossiê paramétrico disfarçado de verificado (mitigado: sem fonte ⇒
  HIPÓTESE, e o revisor trata HIPÓTESE como "marcar na prosa"); crescimento do prompt
  (o dossiê entra por referência de arquivo, não inline no digest).

### Anexo C — retrofit OPCIONAL do Índice (só desenho; não aplicar)
1. MATRIZ-FIOS derivada do existente: H (Helena — Alexandria/hotel→movimento), C
   (Cole — estrada/depósitos N-Virgínia), R (Reyland — Washington institucional,
   ainda sem cena própria: a Estrutura já o promete no cap 33), Sam (apoio — Old
   Town). 2. Regra de rotação ativa do cap 10 em diante (a Estrutura já prevê C nos
   caps 12/20/26 e R no 33 — a guarda da DB2 só IMPÕE o que já está planejado).
3. Dossiê retroativo (lista acima). 4. Correções O-1/O-2 num `revisar` dirigido.

### Anexo D — esqueleto de exigências das outras skills (não implementar agora)
- **hoover-mcfadden:** 3 relógios nomeados com dono+deadline na fundação; "regras da
  narradora não-confiável" (o que ela omite/distorce e QUANDO o leitor pode saber) +
  fair-play do twist como campo de spec; guarda: capítulo sem relógio movido reprova.
- **skill-romantasy:** matriz POV duplo (alternância obrigatória com justificativa);
  sistema de magia com TABELA de custo (poder→preço crescente) na fundação; marcos de
  slow burn por bloco de caps; guarda: 2 caps seguidos no mesmo amante sem
  justificativa reprova a spec.
- **vesper:** léxico canônico como arquivo-fonte (o revisor confere termo a termo);
  mapa de revelação progressiva (o que o leitor sabe por livro/ato) como doc de
  fundação; guarda: termo fora do léxico = aviso.
- **skill-jk-rowling:** registro plantar-e-pagar (semente→pagamento planejado, cap X
  →cap Y) na fundação + campo de spec "sementes a plantar/pagar neste capítulo";
  guarda: pagamento sem semente registrada = aviso ao revisor.

---

## 4. Estado pendente da sessão (não faz parte desta auditoria)
- Fronteira da FASE C aguardando escolha (a) parada controlada / (b) saída natural —
  **pausa do picker ATIVA**: se o run atual terminar antes da decisão, a produção
  fica parada até aplicarmos o pacote.
- Senha real do app a trocar no Supabase Auth (docs já com `<SENHA_DO_APP>`).
- Sem push (aguardando autorização).
