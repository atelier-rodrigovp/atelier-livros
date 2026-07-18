// Conserta os AGENTES GERADOS (.claude/agents/livro-escritor.md e livro-revisor.md)
// para fechar a corrente da craft — o ponto que a auditoria independente achou:
//  - o escritor (opus) era mandado "não reler a fundação; o digest basta", e a VOZ
//    chegava comprimida a ~2 linhas por um haiku. O Opus escrevia de um bilhete.
//  - o revisor só tinha checklist de DEFEITO; "competente e chato" passava.
//
// Aqui, deterministicamente (espelha normalizarVozRegra4/craft-skill): injeta, idempotente
// (marcador), no escritor um bloco de LEITURA DE CRAFT por capítulo que PREVALECE sobre
// qualquer "não releia"; e no revisor um VEREDITO DE PROPULSÃO ("isto está vivo?") que
// reprova, não só checa defeito. Roda após criar_fundacao, no início de escrever_livro e
// num sweep — cobre projetos vivos e novos. Não reescreve a prosa do agente; só anexa.
import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

export const MARCADOR_CRAFT_LEITURA = "<!-- CRAFT-LEITURA v1 -->";
export const MARCADOR_PROPULSAO = "<!-- PROPULSAO v1 -->";

// SPEC-06: os NÚMEROS vivem no perfil (### ORÇAMENTO DE PÁGINA, por skill) — o
// agente só aponta para lá (fonte única; nada de duplicar número em dois lugares).
export const LINHA_ORCAMENTO =
  "**CUMPRA o `### ORÇAMENTO DE PÁGINA` do `perfil-de-voz.md`** — são os números por " +
  "capítulo que o gate mede (muletas, moldes, cota de ritmo). Alvo positivo: uma imagem " +
  "forte vale mais que três.";

export const BLOCO_CRAFT_LEITURA = `
${MARCADOR_CRAFT_LEITURA}

## CRAFT — LEITURA OBRIGATÓRIA POR CAPÍTULO (PREVALECE sobre qualquer "não releia")

Esta seção **SUPERA** qualquer instrução anterior de "não reler a fundação / o digest basta".
Há DOIS canais, e eles NÃO se misturam:
- **FATOS / continuidade** (relógios, pistas, MCL, quem-está-em-cena): use o **digest**
  (\`contexto/contexto-cap-NN.md\`). Não invente fato fora dele.
- **VOZ / TÉCNICA** (motor + regras): a CADA capítulo, **LEIA E APLIQUE direto da fonte** —
  NUNCA de um resumo comprimido por haiku:
  1. o bloco \`## CRAFT DA SKILL\` do \`perfil-de-voz.md\` (motor + regras desta skill);
  2. os arquivos de craft da sua \`skill_escrita\` em \`~/.claude/skills/<skill_escrita>/references/\`
     — para \`skill-dan-brown\`: \`voz-e-oficio.md\` (as 5 regras) e \`metamodelo-thriller.md\` (o motor).

Escreva DESTA craft: propulsão, montagem/**corte de cena no pico**, exposição **dramatizada**
(por conflito/descoberta/perda, nunca palestra), interioridade com **CUSTO em ação** (não
sensação sobre sensação), gancho honesto, **sem coincidência**, ritmo variado sob a cota.
Voz genérica ou "bem escrito e chato" é reprovação — o revisor vai cobrar propulsão.

${LINHA_ORCAMENTO}

<!-- /CRAFT-LEITURA -->`;

// SPEC-07: critérios do revisor INLINE antigo que o Fix C (delegação) tinha perdido —
// paridade plena. Também é o ponto de upgrade de blocos v1 já injetados.
export const ADENDO_PARIDADE = `### PARIDADE COM A REVISÃO INLINE (critérios que NÃO podem se perder)
Fonte adicional OBRIGATÓRIA: o \`perfil-de-voz.md\` (voz + \`## CRAFT DA SKILL\` + \`### ORÇAMENTO DE PÁGINA\`).
- **Voz fora do perfil:** prosa que não soa como o perfil (registro, lente, léxico, cadência) é edição obrigatória — cite a linha.
- **Continuidade dura vs ledger:** nenhum fato do capítulo pode contradizer o \`estado/estado-narrativo.md\` (nomes, datas, geografia, relógios, quem-sabe-o-quê). Contradição = reprovação, não nota de rodapé.
- **Moldes nomeados (corte/dramatize mesmo fora das contagens):** símile-andaime ("como se"/"como quem"), eco de negação ("Não havia X… Havia Y"), antítese-haver, anáfora/staccato colado, decoração-sem-evento.
- **Token estrangeiro/typo de geração:** palavra fora do PT-BR ("ninguño", "pero", "entonces") ou typo — aponte a linha e corrija na edição.`;

// FASE 8 (Motif Ledger / Semantic Repetition): pergunta ADICIONAL ao veredito de
// propulsão — o beat central deste capítulo é ECO REDUNDANTE de um anterior? O runner
// injeta os BEATS CENTRAIS recentes (do motif_ledger) no prompt de revisão.
export const ADENDO_MOTIF = `### BEAT CENTRAL — eco redundante? (Semantic Repetition)
Você recebe os BEATS CENTRAIS dos últimos capítulos (listados no prompt de revisão, se houver).
O beat DESTE capítulo repete a MESMA ideia/conflito nuclear de um beat anterior só com
ROUPAGEM diferente — mesma ideia, SEM evolução (sugestão→prova→custo→escolha→consequência)?
Se sim, é **ECO REDUNDANTE**: REPROVE e devolva edição que faça a ideia EVOLUIR (novo ângulo,
custo, ou consequência), não reafirme o que o leitor já sabe. Classifique a função do beat:
introdução / reforço / virada / pagamento / eco-redundante.`;

// REDUNDÂNCIA CONCEITUAL entre capítulos (defesa em profundidade — independe dos gates
// determinísticos). Diferente do eco de BEAT (ADENDO_MOTIF): aqui um PERSONAGEM reexplica,
// no capítulo seguinte, um argumento/decisão/lógica que a interioridade do capítulo anterior
// já ESGOTOU — mesma lógica, palavras diferentes. Padrão que os gates de repetição
// (n-grama/semantic-repetition) NÃO pegam, porque não há frase repetida, só a IDEIA. O
// padrão é descrito de forma GENÉRICA (o caso que o calibrou não é hardcoded).
export const ADENDO_REDUNDANCIA_CONCEITUAL = `### REDUNDÂNCIA CONCEITUAL entre capítulos (mesma lógica, roupagem nova)
Um PERSONAGEM (ou a narração no fio dele) reexplica um argumento, uma justificativa moral, uma
decisão ou uma "lógica de plano" que a interioridade de um capítulo ANTERIOR já esgotou? Ex.:
o antagonista medita "por que faço isto e como o plano funciona" no cap N (câmera interna), e no
cap N+1 verbaliza/re-narra a MESMA lógica com outras palavras — o leitor não ganha ângulo, custo
nem consequência novos, só ouve de novo. Isso NÃO é pego pelas contagens de repetição (não há
frase repetida, só a ideia). Se acontecer: **REPROVE a metade redundante** e devolva edição que a
COMPRIMA (referência curta ao já sabido) e gaste o espaço em material novo (reação do outro lado,
prova, virada). Preserve o que for genuinamente novo no capítulo.`;

// CLÁUSULA CAUSAL-GNÔMICA (tique novo — mecanismo CONSULTIVO, não gate). Medição contra
// corpus real (caps 30–36 do Índice): um detector determinístico teria ~44–45% de
// falso-positivo (não separa aforismo de causal concreto legítimo sem semântica) — gerar
// regen a essa taxa é pior que não ter gate. Por isso mora AQUI (revisor), não na cota
// Regra 4. O contador informativo (maneirismo.ts::contarCausalGnomico) só SINALIZA densidade.
export const ADENDO_CAUSAL_GNOMICO = `### CLÁUSULA CAUSAL-GNÔMICA repetida (tique de aforismo)
Molde: uma cláusula (em geral iniciada por "porque", ou uma cópula) que RESOLVE a frase numa
abstração quase-aforística — "…porque esperar era uma maneira de mentir para si mesma", "…é só
medo com aparência de método", "…estava tudo errado do jeito certo", "…porque nunca houve o que
tocar". Cada uma isolada pode estar BOA; o tique é a REPETIÇÃO — se o mesmo capítulo fecha frases
em aforismo causal/paradoxal **mais de 2 vezes**, é maneirismo, ainda que nenhuma frase sozinha
seja defeito. Ao notar (o prompt pode trazer uma contagem-sinal): peça VARIAÇÃO — deixe 1–2 fechos
gnômicos por capítulo e resolva os demais em imagem concreta, ação ou consequência, não em máxima.`;

// INTERIORIDADE-SEM-EVENTO como GATILHO DE REPROVAÇÃO (skill-agnóstico — vale para
// QUALQUER skill_escrita: o `livro-revisor` de todo projeto herda este bloco). A auditoria
// achou capítulos "bem escritos e chatos": majoritariamente cópula/percepção, quase sem
// diálogo, nenhum evento/decisão-com-consequência. O detector determinístico
// (maneirismo.ts::interioridadeSemEvento — também sem parâmetro de skill) SINALIZA; aqui o
// veredito PESA: introspecção decorativa sem evento é REPROVAÇÃO, não "abertura legítima".
// Genérico de propósito — nada aqui condiciona por skill.
export const ADENDO_INTERIORIDADE = `### INTERIORIDADE-SEM-EVENTO — reprova, não é "abertura contemplativa"
Um capítulo pode estar tecnicamente bem escrito e mesmo assim MORTO: majoritariamente
cópula/percepção (ser/estar/parecer/sentir/lembrar/pensar), quase sem diálogo, e **nada
ACONTECE** — nenhuma decisão com consequência, virada, pista ou ação; só sensação sobre
sensação. O prompt de revisão pode trazer um SINAL determinístico (interioridade-sem-evento:
% de estática alta + diálogo quase nulo). Se o capítulo é isso: **REPROVE** e devolva revisão
dirigida que ANCORE a interioridade num evento (uma escolha que custa, uma ação que muda a
cena, uma pista decifrada sob pressão) — a interioridade fica, mas pendurada num
acontecimento. NÃO confunda com interioridade REAL ancorada em decisão/ação (essa passa):
o teste é "algo mudou na cena por causa disto?". Vale para toda voz — a intimista/lírica
também precisa de evento; densidade de sentimento não substitui acontecimento. E a interioridade
mora num CORPO: ancore-a em detalhe físico/sensorial concreto (o que os olhos do POV veem,
o que a mão toca) — é a camada que mais some no capítulo raso, junto com a própria interioridade.`;

// VARIEDADE DE TIPO DE GANCHO (consultivo — skill-agnóstico). Skills com gancho tipado
// (hoover-mcfadden, romantasy) pedem NÃO repetir o mesmo tipo de gancho 3 capítulos seguidos
// (virada / pergunta / soco emocional / relógio). Um classificador determinístico
// (maneirismo.ts::classificarGanchoFinal) acerta pergunta/relógio com alta confiança, mas a
// fronteira virada×soco é fuzzy (~50%) — por isso é SINAL consultivo, não gate. O prompt de
// revisão pode trazer a sequência recente de tipos; o revisor julga a monotonia de fecho.
export const ADENDO_VARIEDADE_GANCHO = `### VARIEDADE DE GANCHO — o mesmo tipo de fecho 3× seguidos é mesmice
Se a skill tipa o gancho de fim (virada / pergunta / soco emocional / relógio), o capítulo NÃO
deve fechar no MESMO tipo dos 2 anteriores. O prompt pode trazer um SINAL com a sequência
recente de tipos (classificação heurística — trate como pista, não veredito). Se os últimos 3
fecham igual (ex.: três perguntas retóricas seguidas, três socos emocionais seguidos): peça um
tipo de gancho DIFERENTE, sem enfraquecer a tensão. Não confunda variar o TIPO com enfraquecer
o gancho — todo capítulo ainda fecha em gancho honesto.`;

// TRANSPARÊNCIA (AUDITORIA-ESTILO-DANBROWN.md, CR3/CR4): o veredito tinha eixo
// único (propulsão) — "mais vivo" sem contrapeso vira mais carga retórica. Este
// adendo cria o SEGUNDO eixo com o mesmo peso. As cotas são as aprovadas pelo
// autor (gnômico ≤2, personificação ≤2, sanfona ≤1). Sinais determinísticos
// chegam pelo prompt (maneirismo.ts::diagnosticarTransparencia, modo SINAL).
export const ADENDO_TRANSPARENCIA = `### TRANSPARÊNCIA — segundo eixo do veredito (mesmo peso que "está vivo?")
Um capítulo pode estar vivo e mesmo assim OPACO: a frase se admira em vez de mostrar o
evento. Julgue TAMBÉM:
- **Fecho gnômico/máxima** (frases que resolvem em aforismo geral: "X é uma forma de Y",
  "Homens que X já Y"): **≤2 por capítulo**. Acima disso REPROVE e converta os demais em
  imagem concreta, ação ou consequência — vale também para fala de personagem que só
  fala em epigrama.
- **Personificação de abstração/corpo-agente** ("a razão decidiu", "a mão soube antes da
  cabeça", "a cidade indiferente"): **≤2 por capítulo**, nunca duas na mesma página. O
  padrão é agente humano + verbo concreto.
- **Frase-sanfona** (a mesma percepção reformulada 2+ vezes em apostos ou "não X — Y"
  encadeados): diga UMA vez, a melhor. **≤1 por capítulo.**
- **Narrador invisível:** o narrador não opina nem decora — adjetivo moral/estético em
  objeto físico ("facho honesto", "papel estúpido") é edição obrigatória.
- **Piso de transparência:** a maioria das frases é declarativa simples (SVO, sem
  subordinação dupla); interioridade ≤1-2 linhas por beat, colada a estímulo externo;
  metáfora elaborada ≈≤1 por página, nunca em cadeia.
Reprovação por OPACIDADE tem o MESMO peso que reprovação por capítulo morto. "Vivo" se
prova por evento e corte — não por carga retórica. O prompt pode trazer contagens-sinal
determinísticas (SINAIS DE TRANSPARENCIA); trate como pista forte e confirme na leitura.`;

// TRANSPARÊNCIA — variante INTIMISTA (AUDITORIA-HOOVER.md, CR4). As skills de voz
// emocional em 1ª pessoa (hoover-mcfadden) sofrem com os MESMOS 4 tiques de IA
// (aforismo, personificação de abstração, frase-sanfona, adjetivo moral em objeto) —
// esses ficam. MAS o "piso de transparência" do dan-brown (maioria declarativa,
// interioridade ≤1-2 linhas, metáfora ≤1/página) MATA o gênero: interioridade contínua
// É a voz, 1ª pessoa emocional é feature, metáfora sentimental isolada é feature. Aqui o
// piso vira PROTEÇÃO explícita; só a CADEIA de metáfora é defeito. Mesmo cabeçalho do bloco
// default (o revisor não precisa saber que existem duas variantes), sentinela própria p/
// idempotência/troca. NÃO regride o dan-brown (que fica fora do mapa de skills intimistas).
const _SENTINELA_INTIMISTA = "<!-- transp-intimista -->";
export const ADENDO_TRANSPARENCIA_INTIMISTA = `### TRANSPARÊNCIA — segundo eixo do veredito (mesmo peso que "está vivo?")
${_SENTINELA_INTIMISTA}
Esta é uma voz INTIMISTA em 1ª pessoa (emoção crua, narradora não-confiável). Um capítulo
pode estar vivo e mesmo assim OPACO — mas OPACIDADE aqui é **cara de IA**, não interioridade.
Julgue TAMBÉM, cortando só o ornamento de IA:
- **Fecho gnômico/máxima** (frases que resolvem em aforismo geral: "a beleza é sempre a
  superfície de algo enterrado", "Um X que Y é Z"): **≤2 por capítulo**. Acima disso REPROVE
  e converta os demais em imagem concreta, ação ou consequência — inclusive fala/pensamento
  da narradora que só fala em epigrama.
- **Personificação de ABSTRAÇÃO** ("a razão decidiu", "a culpa me obrigou", "a memória sabia
  antes"): abstração + verbo de agência humana é edição. **Não confunda** com (a) reação
  física sentida em 1ª pessoa ("meu peito apertou") nem (b) uma imagem afetiva ISOLADA do fio
  da narradora — essas são a VOZ e ficam. O tique é a abstração-agente empilhada.
- **Frase-sanfona** (a MESMA percepção reformulada 2+ vezes em apostos ou "não X — Y"
  encadeados): diga UMA vez, a melhor. **≤1 por capítulo.** NÃO confunda com enumeração
  descritiva concreta (cada item novo) nem com interioridade que AVANÇA (cada frase acrescenta).
- **Narrador honesto:** adjetivo moral/estético gratuito em objeto físico ("facho honesto",
  "papel estúpido") é edição — mas o julgamento afetivo da narradora sobre pessoas/relações é a voz.
- **PROTEGIDO — NÃO penalize, NÃO imponha piso/teto:** interioridade contínua (é a voz — pode
  ocupar o capítulo inteiro), 1ª pessoa presente emocional, metáfora sentimental ISOLADA (teto
  generoso — só a CADEIA de 2+ metáforas em poucas linhas é defeito), ritmo lírico. **NÃO existe
  piso de frase declarativa nem piso de diálogo aqui** — densidade de sentimento sem evento você
  já cobra pelo adendo de interioridade-sem-evento; não a cobre de novo como "pouca declarativa".
Reprovação por ORNAMENTO DE IA tem o MESMO peso que reprovação por capítulo morto — mas a régua
é o ornamento (os 4 acima), NUNCA a interioridade ou a metáfora emocional. O prompt pode trazer
contagens-sinal (SINAIS DE TRANSPARENCIA, já filtradas para esta voz); trate como pista e confirme.`;

// Skills de voz intimista/emocional em 1ª pessoa: recebem a variante que protege
// interioridade/metáfora. Data-driven (uma linha por skill; default = bloco dan-brown).
export const SKILLS_INTIMISTAS: Record<string, true> = { "hoover-mcfadden": true };

/** O adendo de transparência correto para a skill (intimista protege a voz; default = dan-brown). */
export function adendoTransparenciaParaSkill(skill?: string | null): string {
  return skill && SKILLS_INTIMISTAS[skill] ? ADENDO_TRANSPARENCIA_INTIMISTA : ADENDO_TRANSPARENCIA;
}

// O bloco é montado por skill: o adendo de transparência é o único que varia
// (intimista protege interioridade/metáfora; default = dan-brown). Todo o resto é comum.
export function blocoPropulsao(skill?: string | null): string {
  return `
${MARCADOR_PROPULSAO}

## VEREDITO DE PROPULSÃO — "ISTO ESTÁ VIVO?" (reprova, não só checklist de defeito)

Além do checklist de conformidade acima, **JULGUE a craft**. Um capítulo competente mas
MORTO é **REPROVAÇÃO**, não aprovação. Pergunte:
- O capítulo **corta no PICO** ou afrouxa no fim?
- O **relógio** é sentido na página (urgência real), ou só mencionado?
- Algo **ACONTECE** (evento/virada/pista) — há montagem/avanço — ou é interioridade decorativa?
- **Cada parágrafo avança a cena ou só decora?** Sensação sobre sensação sem evento → cortar/dramatizar.
- A exposição é **dramatizada** (conflito/descoberta/perda) ou explicativa/palestra?
- O capítulo **puxa o próximo** (gancho honesto que cria pergunta)?

Se "bem escrito e CHATO": **REPROVE** e devolva edições que **INJETAM propulsão** (dramatize,
corte no pico, encadeie a caça às pistas) — não só cortam tique. Preserve sentido e voz.

${ADENDO_PARIDADE}

${adendoTransparenciaParaSkill(skill)}

${ADENDO_MOTIF}

${ADENDO_REDUNDANCIA_CONCEITUAL}

${ADENDO_CAUSAL_GNOMICO}

${ADENDO_INTERIORIDADE}

${ADENDO_VARIEDADE_GANCHO}

<!-- /PROPULSAO -->`;
}
// Compat: bloco default (dan-brown / skills não-intimistas).
export const BLOCO_PROPULSAO = blocoPropulsao();

// Best-effort: neutraliza a linha blanket "não releia a fundação / o digest basta" (no que
// tange à VOZ). O bloco anexado é a garantia; isto remove a contradição mais comum.
function neutralizarNaoReleia(conteudo: string): string {
  return (conteudo ?? "").replace(
    /^.*\bn[ãa]o\s+relei[ a][^\n]*fundaç[ãa]o[^\n]*$/gim,
    "Use o digest para FATOS/continuidade; a VOZ/TÉCNICA você lê a CADA capítulo da craft (ver seção CRAFT — LEITURA OBRIGATÓRIA abaixo)."
  );
}

export function garantirCraftLeituraEscritor(conteudo: string): { texto: string; mudou: boolean } {
  const t = conteudo ?? "";
  if (t.includes(MARCADOR_CRAFT_LEITURA)) {
    // upgrade: bloco v1 sem a linha do orçamento (SPEC-06) ganha a linha in-place.
    if (t.includes("ORÇAMENTO DE PÁGINA")) return { texto: t, mudou: false };
    return { texto: t.replace("<!-- /CRAFT-LEITURA -->", `${LINHA_ORCAMENTO}\n\n<!-- /CRAFT-LEITURA -->`), mudou: true };
  }
  const base = neutralizarNaoReleia(t);
  return { texto: base.replace(/\s*$/, "") + "\n\n" + BLOCO_CRAFT_LEITURA + "\n", mudou: true };
}

export function garantirPropulsaoRevisor(conteudo: string, skill?: string | null): { texto: string; mudou: boolean } {
  const t = conteudo ?? "";
  const intimista = !!(skill && SKILLS_INTIMISTAS[skill]);
  if (t.includes(MARCADOR_PROPULSAO)) {
    let texto = t, mudou = false;
    // upgrade SPEC-07: bloco v1 (sem o adendo de paridade) ganha o adendo in-place.
    if (!texto.includes("PARIDADE COM A REVISÃO INLINE")) {
      texto = texto.replace("<!-- /PROPULSAO -->", `${ADENDO_PARIDADE}\n\n<!-- /PROPULSAO -->`);
      mudou = true;
    }
    // upgrade FASE 8: bloco sem o adendo de transparência ganha in-place (variante da skill).
    if (!texto.includes("TRANSPARÊNCIA — segundo eixo do veredito")) {
      texto = texto.replace("<!-- /PROPULSAO -->", `${adendoTransparenciaParaSkill(skill)}\n\n<!-- /PROPULSAO -->`);
      mudou = true;
    } else {
      // AUDITORIA-HOOVER (CR4): TROCA idempotente da variante de transparência quando a
      // skill não bate com o bloco já injetado. Match por texto exato do adendo constante
      // (a string antiga some após a troca ⇒ idempotente).
      const temIntimista = texto.includes(_SENTINELA_INTIMISTA);
      if (intimista && !temIntimista && texto.includes(ADENDO_TRANSPARENCIA)) {
        texto = texto.replace(ADENDO_TRANSPARENCIA, ADENDO_TRANSPARENCIA_INTIMISTA);
        mudou = true;
      } else if (!intimista && temIntimista && texto.includes(ADENDO_TRANSPARENCIA_INTIMISTA)) {
        texto = texto.replace(ADENDO_TRANSPARENCIA_INTIMISTA, ADENDO_TRANSPARENCIA);
        mudou = true;
      }
    }
    if (!texto.includes("BEAT CENTRAL — eco redundante")) {
      texto = texto.replace("<!-- /PROPULSAO -->", `${ADENDO_MOTIF}\n\n<!-- /PROPULSAO -->`);
      mudou = true;
    }
    // upgrade: redundância conceitual entre capítulos (defesa em profundidade da cegueira editorial).
    if (!texto.includes("REDUNDÂNCIA CONCEITUAL entre capítulos")) {
      texto = texto.replace("<!-- /PROPULSAO -->", `${ADENDO_REDUNDANCIA_CONCEITUAL}\n\n<!-- /PROPULSAO -->`);
      mudou = true;
    }
    // upgrade: cláusula causal-gnômica (tique consultivo).
    if (!texto.includes("CLÁUSULA CAUSAL-GNÔMICA repetida")) {
      texto = texto.replace("<!-- /PROPULSAO -->", `${ADENDO_CAUSAL_GNOMICO}\n\n<!-- /PROPULSAO -->`);
      mudou = true;
    }
    // upgrade: interioridade-sem-evento como gatilho de reprovação (skill-agnóstico).
    if (!texto.includes("INTERIORIDADE-SEM-EVENTO — reprova")) {
      texto = texto.replace("<!-- /PROPULSAO -->", `${ADENDO_INTERIORIDADE}\n\n<!-- /PROPULSAO -->`);
      mudou = true;
    }
    // upgrade: variedade de tipo de gancho (consultivo).
    if (!texto.includes("VARIEDADE DE GANCHO")) {
      texto = texto.replace("<!-- /PROPULSAO -->", `${ADENDO_VARIEDADE_GANCHO}\n\n<!-- /PROPULSAO -->`);
      mudou = true;
    }
    return { texto, mudou };
  }
  return { texto: t.replace(/\s*$/, "") + "\n\n" + blocoPropulsao(skill) + "\n", mudou: true };
}

export interface CraftAgentesAjuste { escritor: boolean; revisor: boolean }

export async function normalizarCraftNosAgentes(agentsDir: string, skill?: string | null): Promise<CraftAgentesAjuste> {
  let arquivos: string[];
  try {
    arquivos = await readdir(agentsDir);
  } catch {
    return { escritor: false, revisor: false };
  }
  const out: CraftAgentesAjuste = { escritor: false, revisor: false };
  const passo = async (nome: string, fn: (c: string) => { texto: string; mudou: boolean }): Promise<boolean> => {
    if (!arquivos.includes(nome)) return false;
    const full = path.join(agentsDir, nome);
    const { texto, mudou } = fn(await readFile(full, "utf8"));
    if (mudou) await writeFile(full, texto, "utf8");
    return mudou;
  };
  out.escritor = await passo("livro-escritor.md", garantirCraftLeituraEscritor);
  out.revisor = await passo("livro-revisor.md", (c) => garantirPropulsaoRevisor(c, skill));
  return out;
}
