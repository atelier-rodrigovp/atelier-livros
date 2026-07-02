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
  if ((conteudo ?? "").includes(MARCADOR_PROPULSAO)) return { texto: conteudo, mudou: false };
  return { texto: (conteudo ?? "").replace(/\s*$/, "") + "\n\n" + BLOCO_PROPULSAO + "\n", mudou: true };
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
