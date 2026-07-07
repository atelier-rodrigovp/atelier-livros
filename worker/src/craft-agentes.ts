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

export const BLOCO_PROPULSAO = `
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

${ADENDO_MOTIF}

${ADENDO_REDUNDANCIA_CONCEITUAL}

${ADENDO_CAUSAL_GNOMICO}

<!-- /PROPULSAO -->`;

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

export function garantirPropulsaoRevisor(conteudo: string): { texto: string; mudou: boolean } {
  const t = conteudo ?? "";
  if (t.includes(MARCADOR_PROPULSAO)) {
    let texto = t, mudou = false;
    // upgrade SPEC-07: bloco v1 (sem o adendo de paridade) ganha o adendo in-place.
    if (!texto.includes("PARIDADE COM A REVISÃO INLINE")) {
      texto = texto.replace("<!-- /PROPULSAO -->", `${ADENDO_PARIDADE}\n\n<!-- /PROPULSAO -->`);
      mudou = true;
    }
    // upgrade FASE 8: bloco sem o adendo de motif/eco-redundante ganha in-place.
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
    return { texto, mudou };
  }
  return { texto: t.replace(/\s*$/, "") + "\n\n" + BLOCO_PROPULSAO + "\n", mudou: true };
}

export interface CraftAgentesAjuste { escritor: boolean; revisor: boolean }

export async function normalizarCraftNosAgentes(agentsDir: string): Promise<CraftAgentesAjuste> {
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
  out.revisor = await passo("livro-revisor.md", garantirPropulsaoRevisor);
  return out;
}
