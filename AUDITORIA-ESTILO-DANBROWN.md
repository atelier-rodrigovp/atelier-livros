# AUDITORIA — Por que a engine produz "IA cara" em vez de Dan Brown

**Data:** 2026-07-17 · **Modo:** somente-leitura (nenhum arquivo alterado além deste relatório)
**Corpus:** projeto dan-brown `53abdade` (52 caps; 8 medidos por script + 5 lidos integralmente), dan-brown `e75f4810` (fundação), hoover importado `38faf7e0` (62 caps; 3 medidos), hoover-pipeline `cae6a074` (2 caps; ambos medidos e lidos).
**Baseline "Texto I" (pastiche ChatGPT):** não encontrado no WORK_DIR — comparação feita apenas contra o perfil-alvo, como previsto.

---

## 1. Sumário executivo

**Resposta direta à pergunta do autor ("por que tantas interioridades e metáforas?"), em 5 frases:**
Porque a fundação de cada projeto — gerada pelo arquiteto-de-enredo sob a exigência de "assinatura de voz nota ≥8" — entrega ao escritor parágrafos-modelo que já contêm aforismo, personificação e símile, e o escritor é mandado imitá-los a cada capítulo enquanto o revisor é mandado impor essa mesma voz ("voz fora do perfil = edição obrigatória"). A skill dan-brown agrava: ela define a prosa transparente do Dan Brown real como defeito a corrigir ("prosa de manual", "trocamos o motor de prosa") e seus próprios exemplos "corretos" personificam abstrações. Os gates automáticos só contam tiques baratos (staccato, "coisa", itálico, fragmento, antítese) — personificação, aforismo, frase-sanfona e metáfora encadeada não têm detector bloqueante, então o modelo desloca a "vistosidade" exatamente para onde ninguém mede. Os prompts de correção empurram na direção errada: mandam literalmente "fundir frases curtas numa frase mais longa" e nunca mandam simplificar. E não existe, em nenhuma camada do sistema, uma única instrução que exija o que define Dan Brown: frase declarativa simples, narrador invisível, interioridade de 1 linha, exposição em diálogo.

**As 5 causas-raiz, em ordem de impacto:**

| # | Causa-raiz | Onde mora | Evidência-síntese |
|---|---|---|---|
| CR1 | **A fundação ensina o tique.** O gate de ambição do arquiteto ("assinatura positiva ≥8") produz perfis-de-voz cujos parágrafos-modelo e "modo de VER" são fábricas de aforismo/personificação — e escritor imita, revisor impõe. | `arquiteto-de-enredo/SKILL.md` (≡ patch) + `perfil-de-voz.md` de cada projeto | Perfil hoover-pipeline prescreve "a beleza é sempre a superfície de algo enterrado"; cap-01 sai com "a beleza é sempre a casca de algum estrago" (§2.1) |
| CR2 | **A skill dan-brown manda não escrever como Dan Brown.** O "delta" chama a prosa transparente dele de defeito e exemplifica a "correção" com personificação e sanfona. | `~/.claude/skills/skill-dan-brown/` (SKILL.md + voz-e-oficio.md) | "Mantemos o motor; **trocamos o motor de prosa**" (SKILL.md:29); exemplar "correto": "foi **a memória que resistiu**" (§2.2) |
| CR3 | **Rede de detecção assimétrica (seleção artificial).** Gates bloqueantes cobrem só tiques baratos; os 6 tiques caros não têm detector (o único que tem — fecho gnômico — é consultivo). Não existe piso de frase simples nem teto de metáfora. | `maneirismo.ts`, `voz-regra4.ts`, `livro_runner.py::_recontagem_cap` | Cap-37 aprovado com **21 fechos gnômicos** (10,7/1000 palavras) contra "cota" declarada de ≤2 (§3) |
| CR4 | **O vetor de correção aponta para o ornamento.** Prompts de conserto mandam "FUNDA as frases curtas coladas numa frase mais longa" e "revelação respira em frase longa e encadeada"; nenhum degrau da escada pede simplificação; o veredito do revisor tem eixo único (propulsão) sem contrapeso anti-vistosidade. | `livro_runner.py:1959`, `voz-regra4.ts`, `craft-agentes.ts::BLOCO_PROPULSAO`, `escada-correcao.ts` | Consertar staccato fundindo frases = trocar tique barato detectável por sanfona indetectável (§2.4) |
| CR5 | **Prior do modelo-base sem contrapeso.** O ornamento gnômico é o atrator default do LLM: o corpus hoover **importado** (pré-pipeline, sem nenhum bloco injetado) já exibe o mesmo fenótipo (personificação 10,8/1000). O pipeline não o suprime (CR3) e o alimenta (CR1/CR2/CR4). | corpus `38faf7e0` vs `cae6a074` | Hoover-pipeline sai com gnômico **maior** (6,0/1000) que o dan-brown (4,7/1000), apesar de a skill hoover pedir "sem floreio" (§5) |

**Veredito causa-raiz vs. sintoma (Fable):** o sintoma visível ("interioridade e metáfora demais") é o **resíduo de um processo de seleção**: o sistema poda com precisão numérica os tiques do Dan Brown real (fragmento, itálico, retórica — os instrumentos da transparência) e deixa sem medição os tiques do "literário de workshop" — enquanto fundação e skill fornecem exemplares desse segundo registro como padrão-ouro. Não é um ator defeituoso; é o gradiente do sistema inteiro apontando para lá.

---

## 2. Cadeia causal por padrão de tique

Formato: **instrução (arquivo:linha, citação) → mecanismo → exemplo gerado → métrica**.

### 2.1 Fecho gnômico / narrador aforista (o tique dominante)

- **Instrução (fundação):** `arquiteto-de-enredo/SKILL.md:145-150` — *"Voz: assinatura positiva — 'você reconheceria de olhos vendados?' … Só 'não-genérica' (defesa negativa) é 6–7, **não** 8"*; `:469-524` (Referência C, **agnóstica de gênero**) manda o perfil ter "2-3 parágrafos-modelo que demonstram a assinatura". Confirmado idêntico no patch versionado (`worker/skill-patches/arquiteto-de-enredo/SKILL.md`, diff vazio).
- **Instrução (perfil gerado, dan-brown `e75f4810`):** parágrafos-modelo §2 — *"O sistema não exigia crueldade. Exigia continuidade."* e *"A verdade não importava. Importava de quem era a voz que a dizia."* — **o molde "eco de negação" que o próprio revisor é mandado cortar** (`craft-agentes.ts:55`), exemplificado como padrão-ouro.
- **Instrução (perfil gerado, hoover-pipeline `cae6a074`):** seção "modo de VER" — *"**a beleza é sempre a superfície de algo enterrado**"* (aforismo prescrito como lente da narradora); modelo B fecha em *"É mais barato acreditar do que perguntar."*
- **Mecanismo:** o escritor lê o perfil a cada capítulo (`CRAFT-LEITURA v1`, `craft-agentes.ts:25-47`: "LEIA E APLIQUE direto da fonte"); o revisor é obrigado a impor a voz do perfil (`ADENDO_PARIDADE`, `craft-agentes.ts:53`: "prosa que não soa como o perfil … é edição obrigatória"). O detector de gnômico existe (`maneirismo.ts::contarCausalGnomico`, L414-431) mas é **consultivo por decisão explícita** (`craft-agentes.ts:85-89`: ~44-45% de falso-positivo) — nunca bloqueia.
- **Exemplo gerado:** cap-01 hoover-pipeline: *"a beleza é sempre a casca de algum estrago"* (reprodução quase literal da lente do perfil). Cap-37 dan-brown: *"Homens que atendiam depressa demais já tinham decidido ter medo"*; *"Guardar é uma forma de lembrar, e nós não construímos este programa para que os operadores se lembrem"*; *"a decisão é difícil de tomar e fácil de justificar"*.
- **Métrica:** dan-brown 4,74/1000 palavras (cap-37: **10,67** = 21 num capítulo); hoover-pipeline **6,01/1000** (o mais alto dos três projetos). "Cota" declarada no bloco do revisor: ≤2 por capítulo.

### 2.2 Personificação de abstração / corpo-agente

- **Instrução (skill):** `skill-dan-brown/references/voz-e-oficio.md:99-102`, exemplar "Depois" da Regra 3 (interioridade real): *"As mãos dele sabiam o desenho de cor; foi **a memória que resistiu** … a gravura na pedra **não pedia licença**"*; Regra 5 "Depois" (:167-171): *"a vantagem que **o próprio medo lhe comprara**"*. 3 dos 5 exemplares padrão-ouro personificam abstrações.
- **Instrução (fundação):** perfil 53abdade §2 modelo C: *"a emenda estava lá, **sob o polegar da memória**, lisa demais para ser natural"*.
- **Mecanismo:** `CRAFT-LEITURA` manda ler `voz-e-oficio.md` diretamente a cada capítulo (`craft-agentes.ts:37-38` e `livro_runner.py:623`); nenhum detector cobre personificação (`maneirismo.ts` — ausente da lista completa de detectores, ver tabela §4 do sub-relatório de gates).
- **Exemplo gerado:** cap-37: *"a mandíbula fez o que a cabeça ainda não tinha feito. Travou."*; *"a cidade seguia acesa, indiferente à aritmética que se fazia sobre ela"*; cap-38: *"O papel, ao menos, era estúpido. Não mudava de opinião."*; cap-36: *"a mão no corrimão já tinha decidido antes dela"*.
- **Métrica:** dan-brown 5,31/1000; hoover importado 10,82/1000; hoover-pipeline 4,99/1000 (contagem manual frase a frase; regex de lista fechada subdetecta — ver §8, limitações).

### 2.3 Frase-sanfona / reformulação encadeada

- **Instrução:** `voz-e-oficio.md:114-115`: *"uma [cena] de revelação pode **respirar numa frase mais longa e encadeada**"*; replicada no bloco injetado pela engine (`craft-skill.ts:38`: "revelação respira em frase longa") e na régua do perfil (`voz-regra4.ts`, seção §5 injetada — confirmado no diff `e75f4810/perfil-de-voz.md.orig.bak` → atual: *"revelação respira numa frase mais longa e encadeada. **Funda frases curtas coladas**"*).
- **Mecanismo:** a única métrica de comprimento existente pune o oposto (staccato = frases curtas demais); não há teto de subordinação/aposto nem piso de frase simples. O prompt de conserto do gate (`livro_runner.py:1949-1971`) manda *"FUNDA as frases curtas coladas numa frase mais longa onde for revelação"*.
- **Exemplo gerado:** cap-37: *"Cada objeto ali dentro era um voto — pequeno, mudo, arquivado no escuro — de que ele ainda achava que aquelas pessoas tinham existido, de que existir merecia um traço deixado no mundo, de que apagar não era o mesmo que nunca ter havido."* (escada de 4 apostos); cap-38: *"Nenhuma soma gradual, nenhum dado empilhado sobre o outro: de golpe, tudo… largou a forma antiga e caiu, ao mesmo tempo, na forma nova."*
- **Métrica:** reformulação ~9,97/1000 (dan-brown) e 11,14/1000 (hoover-pipeline); % de frases declarativas simples no dan-brown: **média 42,7%, chegando a 16-31% nos caps 10/20/30** (frase média de 21-27 palavras nesses capítulos) — o perfil-alvo pede maioria declarativa.

### 2.4 Interioridade ensaística (bloco de reflexão sem evento)

- **Instrução (skill):** `voz-e-oficio.md:82-88` (Regra 3): *"o portão de interioridade pergunta: **o que isto custou ao POV por dentro?**"* — um beat introspectivo elaborado exigido por capítulo; `SKILL.md:244`: "interioridade real" como invariante da obra.
- **Instrução (spec):** `53abdade/specs/Spec-Capitulo-38.md:8,26`: *"ritmo **respirado/contemplativo** … não diálogo-confronto, mas **monólogo-interno-com-evidência**"* — o editor (haiku) autorizou registro introspectivo por spec.
- **Mecanismo:** o contrapeso existe mas ataca outro eixo: `ADENDO_INTERIORIDADE` (`craft-agentes.ts:106-118`) reprova interioridade **sem evento**, não interioridade **em excesso ancorado** — cap-38 tem evento (a ligação, a carta), logo passa, mesmo sendo ~70 linhas de ruminação.
- **Exemplo gerado:** cap-38 quase inteiro (nota literária 3,5/10 — "Dan Brown dramatiza a mesma revelação em 3 frases e um corte; aqui ela é ruminada por 70 linhas"); cap-05: parágrafo-ensaio sobre confabulação; cap-22: ensaio sobre reconsolidação de memória.
- **Métrica indireta:** % de diálogo — dan-brown média 7,7%, com **caps 10, 20 e 30 em 0%** de diálogo. Dan Brown real expõe em diálogo (professor explica andando); capítulos inteiros sem uma fala são a assinatura métrica da interioridade ensaística.

### 2.5 Adjetivo avaliativo em objeto físico (tique real, mas menor)

- **Instrução:** nenhuma instrução direta o pede; nenhum detector o pune (`craft-skill.ts:45` só veta adjetivo "genérico"). É efeito colateral do registro "assinatura literária" (CR1/CR5).
- **Exemplo gerado:** cap-36: *"um facho amarelo e honesto"*; cap-38: *"O papel, ao menos, era estúpido"*; hoover-03: *"Não é um nódulo educado"*.
- **Métrica:** 0,36-1,14/1000 em todos os projetos — presente, porém 5-10× mais raro que gnômico/personificação. **A hipótese do autor está confirmada em espécie, mas este tique é secundário em frequência.**

---

## 3. Tabela de métricas por capítulo vs. perfil-alvo

Método: métricas 1-4/7-10 por script Python (heurísticas documentadas no sub-relatório; script em scratchpad, fora do repo); personificação/adjetivo/gnômico por leitura-classificação LLM frase a frase (regex de lista fechada demonstrou falso-negativo massivo e foi descartada para essas três).

| Capítulo | Palavras | Frase média (palavras) | % declarativas simples | Reform./1000 | Personif./1000 | AdjAval./1000 | Gnômico/1000 | % diálogo | Gancho final |
|---|---|---|---|---|---|---|---|---|---|
| **Alvo Dan Brown** | 1.300-2.200 | curta/média | **maioria** | baixo | ~0 | 0 | ~0 | alto (exposição em diálogo) | externo |
| db-01 | 2.071 | 11,4 | 64,1 | 9,2 | 3,38 | 0,48 | 4,35 | 11,6 | externo |
| db-10 | 1.818 | **27,1** | **16,4** | 12,1 | — | — | — | **0,0** | externo |
| db-20 | 2.146 | 23,3 | 28,3 | 13,1 | — | — | — | **0,0** | misto (lírico) |
| db-30 | 2.520 | 21,2 | 31,1 | 9,5 | — | — | — | **0,0** | externo |
| db-36 | 1.891 | 15,6 | 52,1 | 12,2 | 7,40 | 1,06 | 1,59 | 7,9 | externo |
| db-37 | 1.969 | 16,4 | 45,0 | 7,1 | 4,57 | 0,00 | **10,67** | 4,0 | lírico |
| db-38 | 2.551 | 18,0 | 38,7 | 9,4 | 5,88 | 0,78 | 2,35 | 3,0 | misto (lírico) |
| db-45 | 2.345 | 11,3 | 65,7 | 7,3 | — | — | — | 35,0 | externo c/ imagem |
| **média dan-brown** | 2.164 | 18,1 | **42,7** | 10,0 | **5,31** | 0,58 | **4,74** | **7,7** | — |
| hoover-imp-03 | 2.626 | 9,5 | 70,8 | 11,0 | **11,42** | 1,14 | 3,81 | 11,7 | externo |
| hoover-imp-20 | 721 | 13,6 | 66,0 | 16,6 | — | — | — | 0,0 | lírico |
| hoover-imp-40 | 2.348 | 12,2 | 58,9 | 7,2 | 10,22 | 0,85 | 3,83 | 0,0 | externo (relógio) |
| **média hoover importado** | 1.898 | 11,8 | 65,2 | 11,6 | **10,82** | 1,00 | 3,82 | 3,9 | — |
| hoover-pipe-01 | 2.770 | 16,4 | 43,2 | 10,8 | 6,50 | 0,36 | 5,42 | 1,8 | externo |
| hoover-pipe-02 | 2.883 | 12,9 | 56,1 | 11,5 | 3,47 | 0,35 | **6,59** | 18,0 | externo c/ moldura |
| **média hoover-pipeline** | 2.827 | 14,7 | 49,7 | 11,1 | 4,99 | 0,36 | **6,01** | 9,9 | — |

Leituras da tabela:
- **Desvio nº 1 (diálogo):** três capítulos dan-brown com 0% de diálogo — impossível no Dan Brown real. A exposição migrou inteira para narração/interioridade.
- **Desvio nº 2 (frase):** metade dos capítulos dan-brown abaixo de 50% de declarativas simples; caps 10/20/30 na faixa 16-31% com frase média de 21-27 palavras.
- **Desvio nº 3 (gnômico):** todos os projetos entre 1,6 e 10,7/1000 contra alvo ~0 e "cota" interna de ≤2/capítulo (≈1/1000).
- **Ganchos:** majoritariamente externos e honestos — **o motor Brown funciona**; o problema é a superfície da frase. Notas de aderência da análise literária: cap-36 6,0 > cap-22 5,0 > cap-05 4,5 > cap-37 4,0 > cap-38 3,5 — quanto mais físico o capítulo, mais perto do alvo; quanto mais mental, mais longe.

---

## 4. O papel de cada ator

| Ator | Contribuição para o problema | Evidência |
|---|---|---|
| **Arquiteto (fundação)** | **Principal.** Sob o gate "assinatura positiva ≥8" (nota alta exige "digital sintática" demonstrável), gera parágrafos-modelo e "modo de VER" ornamentados que contradizem as próprias cotas do perfil. A Bíblia ainda institui "Cap 1 vira padrão-ouro" (`Biblia-da-Obra.md:146`) — se o cap-01 sai ornamentado, vira régua de todo o livro. | Modelos com "sob o polegar da memória" (53abdade), "Exigia continuidade." (e75f4810), aforismo-lente reproduzido no cap-01 (cae6a074) |
| **Escritor** | Executor fiel de instruções contraditórias: o texto normativo dos agentes é anti-ornamento ("mate o clichê", "propulsão"), mas os EXEMPLOS que ele é mandado imitar (perfil §2 + exemplares "Depois" da skill, relidos a cada capítulo via CRAFT-LEITURA) ensinam o registro gnômico-personificado. Exemplo vence norma. | `livro-escritor.md:12-16,40-61`; `voz-e-oficio.md` exemplares |
| **Revisor** | Reprova só o contável; carimba "vivo" em capítulos ornamentados (runner.log: "REPROVADO… cadencia anafora 2x" e nunca "personificação/aforismo demais" — 18 reprovações, todas por tique contável). O `ADENDO_PARIDADE` o obriga a IMPOR a voz do perfil — quando o perfil é ornamentado, o revisor vira guardião do ornamento. O veredito de propulsão tem eixo único: "competente mas morto = reprovação" sem contrapeso anti-vistosidade. | `runner.log:33,237,748,2045,2354,2790`; `craft-agentes.ts:53,134-163` |
| **Editor (specs)** | Majoritariamente neutro (estrutura). Falha pontual: Spec-38 pediu "respirado/contemplativo… monólogo-interno-com-evidência", colidindo com a recalibração transparente do perfil (`perfil-de-voz.md:21`, 53abdade). | `Spec-Capitulo-38.md:8,26` |
| **Escada de correção** | Nunca pede simplificação em nenhum degrau; degrau 6 escala o veredito de propulsão a opus (reforço do eixo único). Todos os blockers reais do ledger são tiques contáveis/estruturais. | `escada-correcao.ts:22-30`; `correcao-ledger.json` (caps 38/40/48/49) |
| **DESMANEIRISMO + gate de maneirismo** | Poda com sucesso os tiques baratos (as reprovações funcionam), mas os prompts de conserto orientam "desadense com sintaxe variada" e "funda as curtas numa frase mais longa" — resolvendo staccato produz-se sanfona. Capítulo ornamentado dentro das cotas de tique é aprovado (`_recontagem_cap` = moldes+muletas+cadência+repetição, nada mais). | `livro_runner.py:1879-1892,1949-1971,2117-2132` |
| **Fundação (Bíblia/briefing)** | O autor NÃO pediu prosa literária — briefing pede "cinematográfico, página-vira" (`briefing.md:25`). A camada normativa da Bíblia é alinhada; o dano entra pelos modelos (acima). | `briefing.md:25`; `Biblia-da-Obra.md:136` |

---

## 5. Cross-skill: compartilhada, local ou mista?

**Veredito: MISTA, com dominância de causa COMPARTILHADA.** Consertar só a skill dan-brown **não** resolve — o hoover continuaria doente.

**Evidência de causa compartilhada (infra):**
1. O único projeto hoover gerado pelo pipeline atual (`cae6a074`) exibe o fenótipo **mais forte** no tique dominante (gnômico 6,01/1000 > dan-brown 4,74) — apesar de a skill hoover pedir explicitamente o contrário (*"Prosa enxuta e veloz — frases diretas… sem floreio"*, `hoover-mcfadden/SKILL.md:49-50`; *"metáfora… com extrema parcimônia"*, `voz-e-oficio.md:166-175`). A skill local está inocentada; a infra (arquiteto + gates + revisor) não.
2. A receita do arquiteto é **agnóstica de gênero por construção** (`SKILL.md:475`) — a mesma "assinatura positiva" com travessão-revelação/fragmento/parágrafos-modelo é aplicada a qualquer skill.
3. Os blocos injetados (CRAFT-LEITURA, PROPULSAO, COTA-CADENCIA, GUARDA-MODELOS) são idênticos em estrutura entre projetos e todos partilham a mesma assimetria: medem tiques baratos, não medem os caros.
4. O corpus hoover **importado** (pré-pipeline, sem nenhum bloco injetado, sem perfil) já mostra o fenótipo (personificação 10,8/1000) — o prior do modelo-base é o atrator; sem contrapeso ativo, qualquer skill converge para lá.

**Evidência de causa local (skill-dan-brown):**
5. Só a skill dan-brown enquadra o estilo-alvo como defeito a superar ("prosa de manual", "a qualidade que Dan Brown é cobrado por não ter") e fornece exemplares "Depois" ornamentados — nenhuma das outras skills tem um "delta anti-autor" equivalente (`craft-skill.ts`: jk-rowling pede calor, hoover pede contenção, romantasy pede frase-soco com pontaria, vesper pede fidelidade "antes de qualquer floreio").
6. Nota: o bloco por-skill de jk-rowling incentiva narrador opinativo ("humor e afeto no narrador", `craft-skill.ts:43-46`) — legítimo para essa skill, mas sem teto.

**Risco por skill:** hoover-mcfadden — já contaminado (comprovado em cae6a074). jk-rowling/romantasy/vesper — mesma infra, mesmo risco; nenhum projeto de pipeline com corpus suficiente para medir (vesper importado não foi medido).

**Ressalva metodológica:** o corpus hoover de pipeline tem só 2 capítulos (o projeto é recente); as médias hoover-pipeline têm n baixo. A direção, porém, é consistente com todas as outras evidências.

---

## 6. Recomendações priorizadas

### P0 — corta a fonte (maior efeito esperado)

**P0-1. Desornamentar a receita de fundação (arquiteto) e os perfis vivos.**
- *Onde:* `worker/skill-patches/arquiteto-de-enredo/SKILL.md` (Referência C, :469-524, e gate de Voz, :145-150) + sweep re-idempotente nos `perfil-de-voz.md` existentes (novo normalizador, mesmo padrão dos atuais).
- *Mudança exata:* redefinir "assinatura positiva" como **lente + léxico + ritmo** (o que a POV nota primeiro, famílias de palavras, cadência) e **proibir nos parágrafos-modelo e no "modo de VER"**: máxima/aforismo, personificação de abstração, símile-andaime, eco de negação — os modelos devem passar no próprio ORÇAMENTO DE PÁGINA do perfil (hoje o violam). Exigir que ≥1 modelo seja um parágrafo de ação/diálogo puro declarativo.
- *Efeito esperado:* queda direta de gnômico e personificação (o escritor imita o que vê); é a única mudança que age sobre TODAS as skills de uma vez.
- *Risco:* a nota de "Voz" do gate de ambição cair para 6-7 com a nova definição — recalibrar o gate junto (assinatura por lente/léxico também é "reconhecível de olhos vendados").

**P0-2. Novo contrato do revisor (substituto do veredito de eixo único).**
- *Onde:* `craft-agentes.ts` — novo `ADENDO_TRANSPARENCIA` no `BLOCO_PROPULSAO` (mesmo mecanismo de upgrade in-place já usado pelos outros adendos).
- *Mudança exata:* veredito passa a ser DUPLO — "isto está vivo?" **E** "isto está transparente?". Operacionalizar o segundo: (a) ≤2 fechos gnômicos/capítulo (o sinal `contarCausalGnomico` já chega ao prompt — promover de consultivo a **reprovação** acima de 4-5, margem sobre os ~44% de falso-positivo); (b) personificação de abstração/corpo-agente: apontar e reduzir a ≤2/capítulo; (c) interioridade >1 parágrafo contínuo sem evento novo = comprimir; (d) narrador não opina ("adjetivo moral em objeto = edição"); (e) reprovação por opacidade tem o MESMO peso que reprovação por morte. Nota: o texto atual do PROPULSAO já é anti-decorativo — o que falta não é intenção, é o **eixo e o peso**.
- *Efeito esperado:* fecha o gradiente "mais vivo = mais carga retórica"; o revisor passa a podar o que hoje carimba de "vivo".
- *Risco:* sobre-poda de voz legítima em skills calorosas (jk-rowling) — parametrizar tetos por skill via `ORC_CADENCIA_POR_SKILL` (mecanismo já existe).

**P0-3. Novos detectores no gate de maneirismo (fechar a assimetria).**
- *Onde:* `worker/src/maneirismo.ts` + espelho em `livro_runner.py::_recontagem_cap` + tetos no `### ORÇAMENTO DE PÁGINA` (`voz-regra4.ts`/`craft-skill.ts`).
- *Mudança exata:* (a) **piso de frases declarativas simples** — ≥50% por capítulo (heurística: ≤15 palavras, ≤1 vírgula, sem travessão interno — validada nesta auditoria; dan-brown real ficaria confortável, caps 10/20/30 atuais reprovariam); (b) **teto de reformulação/sanfona** — frases com ≥3 vírgulas-aposto ou ≥2 apostos por travessão: ≤6/1000; (c) **piso de diálogo por skill** — dan-brown: reprovar capítulo com <5% de diálogo salvo exceção declarada na spec (0% três vezes no corpus atual); (d) **personificação de abstração** — lista aberta de sujeitos abstratos+corpo + verbo de ação: usar como SINAL forte ao revisor (não gate duro; a contagem por regex subdetecta — ver limitações — mas mesmo o piso detectado já discrimina); (e) **gnômico**: manter o contador atual, subir de sinal para reprovação acima de teto folgado (≥5).
- *Efeito esperado:* torna o fenótipo "IA cara" tão custoso quanto o staccato — remove a rota de fuga da seleção artificial.
- *Risco:* falso-positivo em (b)/(d); mitigar começando como sinal-forte + reprovação só em combinação (ex.: sanfona alta E declarativas baixas).

### P1 — corrige a skill e o vetor de correção

**P1-1. Reposicionar o "delta" da skill-dan-brown.**
- *Onde:* `~/.claude/skills/skill-dan-brown/SKILL.md` + `references/voz-e-oficio.md` (e versionar o patch em `worker/skill-patches/`, que hoje não tem subpasta dan-brown).
- *Mudança exata:* manter o delta ESTRUTURAL (fair-play, exposição dramatizada, sem coincidência, interioridade com custo) e **remover o delta de PROSA**: apagar/reescrever "prosa de manual", "trocamos o motor de prosa", "a qualidade que Dan Brown é cobrado por não ter"; declarar explicitamente: *"a prosa transparente e declarativa É a técnica, não o defeito — o leitor lê através da frase para o evento"*; **substituir os exemplares "Depois" das Regras 3/4/5** (que personificam abstrações) por exemplares transparentes com interioridade de 1 linha ancorada; acrescentar a rubrica operacional (maioria declarativa, metáfora ≤1/página nunca em cadeia, narrador invisível, exposição em diálogo).
- *Efeito esperado:* o escritor que relê `voz-e-oficio.md` a cada capítulo (CRAFT-LEITURA) passa a calibrar o ouvido pelo registro certo.
- *Risco:* baixo — o motor estrutural (o que já funciona) não é tocado.

**P1-2. Inverter o vetor dos prompts de correção.**
- *Onde:* `livro_runner.py:1949-1971` (prompt do gate), `:2117-2132` (DESMANEIRISMO), `voz-regra4.ts` (§5 injetado: "Funda frases curtas coladas"), `craft-skill.ts:38` ("revelação respira em frase longa").
- *Mudança exata:* substituir "funda as curtas numa frase mais longa" por "resolva o staccato variando com frases médias declarativas (SVO); NÃO empilhe subordinadas nem apostos"; acrescentar à escada uma diretiva de SIMPLIFICAÇÃO para blockers dos novos detectores (P0-3): "reescreva o trecho em frases declarativas; corte a máxima; a imagem vira ação".
- *Efeito esperado:* correção deixa de converter tique barato em tique caro.

**P1-3. Travar o campo "Modo" das specs.** Editor não pode pedir "contemplativo/monólogo-interno" em skill de página-vira; validar o campo contra vocabulário permitido por skill em `exigencias-skill.ts` (que hoje valida só estrutura). Efeito: elimina autorizações pontuais de ornamento como a Spec-38.

### P2 — higiene e verificação

- **P2-1.** Atualizar `CLAUDE.md` do repo: a descrição do PROPULSAO ("is this alive? does it sing?") está desatualizada — o bloco real não contém "canta"; a documentação enganosa custou tempo de diagnóstico.
- **P2-2.** "Cap 1 padrão-ouro" (`Biblia-da-Obra.md:146`): só promover o cap-01 a régua depois de passar o novo eixo de transparência — hoje o mecanismo propaga o defeito.
- **P2-3.** Reter versões pré-correção dos capítulos (hoje `hash_antes/hash_depois` no ledger, texto descartado; `capitulos-em-revisao/` vazio) — sem isso, a hipótese "reescritas ficam mais ornamentadas" segue não-verificável (ver §7).
- **P2-4.** Benchmark A/B de validação: 1 capítulo com contrato novo vs. atual, medido pelas métricas desta auditoria. Metas sugeridas para "soa como Dan Brown": declarativas ≥55%; gnômico ≤1/1000 (~≤2/cap); personificação ≤1,5/1000; reformulação ≤6/1000; diálogo ≥15% (média do livro); frase média ≤15 palavras.

---

## 7. O que NÃO é causa (hipóteses refutadas ou não sustentadas)

1. **"O revisor 'isso canta?' recompensa ornamento" — REFUTADA na forma literal.** O bloco PROPULSAO real (`craft-agentes.ts:134-163`) não contém "canta" e suas seis perguntas medem evento/estrutura; vários adendos são ativamente anti-decorativos (interioridade-sem-evento, causal-gnômico). O que se confirma é a forma fraca: eixo único sem contrapeso (CR4). A frase "does it sing?" existe só na documentação desatualizada do CLAUDE.md.
2. **"Os blocos injetados pela engine pedem ornamento" — REFUTADA.** CRAFT-SKILL dan-brown diz "prosa FUNCIONAL… NÃO lírica-contemplativa"; CRAFT-LEITURA pede propulsão e exposição dramatizada. O discurso normativo da engine é alinhado; o dano entra pelos exemplares e pela assimetria de medição.
3. **"O autor pediu prosa literária no briefing" — REFUTADA.** `briefing.md:25` pede "cinematográfico, página-vira"; a Bíblia declara "não 'literária genérica'".
4. **"A skill hoover-mcfadden pede ornamento" — REFUTADA.** Ela pede o oposto ("sem floreio", "nunca o período longo de VÉSPER") — e o output sai ornamentado mesmo assim (prova da causa compartilhada).
5. **"As reescritas da escada ficaram MAIS ornamentadas que os originais" — INCONCLUSIVA por falta de artefato.** Não existem `.orig.bak` de capítulos nem `capitulos-em-revisao/` preenchido no 53abdade; o ledger guarda só hashes. Confirmada apenas a DIREÇÃO nos textos dos prompts ("funda as curtas…"). Ver P2-3.
6. **"Adjetivo avaliativo em objeto físico é um tique dominante" — PARCIAL.** Existe ("facho honesto", "papel estúpido") mas é raro (0,36-1,14/1000); os dominantes são gnômico, personificação e sanfona. Detector dedicado é P0-3(d), não prioridade isolada.
7. **"Interioridade real tratada como qualidade pelo revisor nos JSONs de quality" — NÃO SUSTENTADA como formulada.** Os JSONs de `quality/` são saída do detector determinístico (sem juízo de prosa); o carimbo "vivo" vive no runner.log e coexiste com reprovações por tique. O problema não é elogio explícito ao ornamento — é cegueira ao ornamento.

---

## 8. Ledger de hipóteses, fatias e modelos

### Hipóteses

| Hipótese | Veredito | Evidência-chave |
|---|---|---|
| H1: gates cobrem só tiques baratos | **CONFIRMADA** | Tabela detector×tique (fatia normalizadores); `_recontagem_cap` = 4 detectores baratos; cap-37 aprovado com 21 gnômicos |
| H2: veredito do revisor recompensa ornamento | **CONFIRMADA em forma fraca / refutada na literal** | PROPULSAO sem contrapeso de vistosidade; "canta" inexistente no código |
| H3: correção empurra para ornamento | **CONFIRMADA na direção; inconclusiva em intensidade** | Prompts "funda frases"; sem pares antes/depois em disco |
| H4 (emergente): fundação ensina o tique via assinatura ≥8 | **CONFIRMADA** | Reprodução quase literal do aforismo-lente do perfil no cap-01 hoover-pipeline; modelos violam as próprias cotas em 3 projetos |
| H5 (emergente): prior do modelo-base como atrator | **CONFIRMADA** | Corpus importado pré-pipeline com o mesmo fenótipo (10,8 personif./1000) |
| Cross-skill: compartilhada vs local | **MISTA, dominante compartilhada** | §5 |

### Registro modelo-por-fatia

| Fatia | Modelo executor | Observação |
|---|---|---|
| Orquestração, leituras críticas em 1ª mão (PROPULSAO, craft-skill, cap-37, perfis cae6a074/e75f4810, diff .orig.bak), reconciliação causal, veredito, priorização, redação deste relatório | **Fable (orquestrador)** | conforme topologia |
| Análise crítica da skill-dan-brown (SKILL.md + 4 references + runbook + assets + patch) | **Opus** (sub-agente) | |
| Normalizadores + gates + escada + DESMANEIRISMO (7 arquivos + runner 2541 linhas) | **Opus** (sub-agente) | |
| Artefatos reais do 53abdade (agentes, perfil, Bíblia, reviews, ledger, specs) | **Opus** (sub-agente) | |
| Análise literária comparativa (caps 05/22/36/37/38 integrais) | **Opus** (sub-agente) | |
| Métricas quantitativas (script Python no scratchpad; 13 capítulos; 2ª rodada com releitura manual após falso-negativo de regex) | **Sonnet** (sub-agente, 2 rodadas) | |
| Cross-skill + arquiteto + varredura hoover | **Sonnet** (sub-agente) | |

Disponibilidade de spawn verificada na prática: todos os 6 sub-agentes despacharam com o override de modelo solicitado (4 Opus, 2 Sonnet); nenhuma degradação necessária. Total: 6 agentes, 7 execuções (1 follow-up) — dentro do orçamento de ~10.

### Limitações e inconclusivos

- **Pares antes/depois de reescrita inexistentes em disco** → H3 forte não verificável (P2-3 propõe retenção).
- **Regex de personificação/adjetivo subdetecta** (lista fechada deu ~0 contra 3-30 por capítulo na releitura manual); os números manuais têm zona cinzenta declarada de ±2-3 itens/capítulo — não muda nenhum ranking.
- **Hoover-pipeline tem só 2 capítulos** (n baixo); hoover importado não atravessou o pipeline atual (serve como baseline de prior, não como prova contra os normalizadores).
- **Baseline "Texto I" (pastiche) ausente** do WORK_DIR — comparação de contraste não realizada.
- **Razão interioridade/ação do script é piso não-confiável** (só verbos explícitos; estilo indireto livre não capturado) — por isso o desvio de interioridade foi quantificado via % de diálogo e análise literária, não por essa métrica.
- Capítulos do 38faf7e0 têm numeração de arquivo deslocada +2 do cabeçalho interno (capitulo-03.md = "Capítulo 1") — registrado, sem impacto nas conclusões.
