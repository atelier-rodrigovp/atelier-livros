// Política de MODELO POR PAPEL dos subagentes livro-* e a normalização do
// frontmatter `model:` dos arquivos .claude/agents/*.md gerados na fundação.
//
// Porquê: no Claude Code, um subagente SEM `model:` no frontmatter HERDA o modelo
// do pai (o orquestrador, que pode ser opus). O arquiteto-de-enredo gera os agentes
// por prosa, então o `model:` saía não-determinístico (o editor já apareceu em opus,
// encarecendo o micro-loop por capítulo à toa). Aqui o worker PINA os modelos por
// papel de forma determinística, independente do que o LLM-arquiteto emitiu.
import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

// Papel → modelo. Escritor SEMPRE opus (a prosa nasce nele). Editor é tarefa barata
// (aplicar edições cirúrgicas + gravar estado-narrativo) → haiku.
export const MODELO_POR_AGENTE: Record<string, string> = {
  "livro-escritor": "opus",
  "livro-revisor": "sonnet",
  "livro-editor": "haiku",
  "livro-contextualizador": "haiku",
  "livro-arquiteto-comercial": "sonnet",
};

export interface ModeloAjuste {
  agente: string;
  de: string | null; // modelo anterior (null = não tinha linha model:)
  para: string;
  mudou: boolean;
}

// Reescreve o `model:` do frontmatter para `modelo`. Se houver frontmatter mas
// faltar a linha `model:`, insere (logo após `name:`). Sem frontmatter (`---`),
// devolve intacto — não inventa cabeçalho num arquivo inesperado.
export function aplicarModeloFrontmatter(
  conteudo: string,
  modelo: string
): { texto: string; mudou: boolean; modeloAnterior: string | null } {
  const m = /^---\r?\n([\s\S]*?)\r?\n---/.exec(conteudo);
  if (!m) return { texto: conteudo, mudou: false, modeloAnterior: null };
  const bloco = m[0];
  const fm = m[1];
  const reModel = /^([ \t]*)model:[ \t]*(.*)$/m;
  const achou = reModel.exec(fm);
  if (achou) {
    const anterior = achou[2].trim() || null;
    const novoFm = fm.replace(reModel, (_x, ind: string) => `${ind}model: ${modelo}`);
    if (novoFm === fm) return { texto: conteudo, mudou: false, modeloAnterior: anterior };
    return { texto: conteudo.replace(bloco, bloco.replace(fm, novoFm)), mudou: true, modeloAnterior: anterior };
  }
  // Sem linha model: insere após name:, ou no topo do frontmatter se não houver name:.
  const comName = /^(name:.*)$/m;
  const novoFm = comName.test(fm)
    ? fm.replace(comName, (x) => `${x}\nmodel: ${modelo}`)
    : `model: ${modelo}\n${fm}`;
  return { texto: conteudo.replace(bloco, bloco.replace(fm, novoFm)), mudou: true, modeloAnterior: null };
}

// Normaliza todos os agentes livro-* de uma pasta .claude/agents. Idempotente.
// Devolve o relatório do que (e de quê para quê) mudou.
export async function normalizarModelosAgentes(agentsDir: string): Promise<ModeloAjuste[]> {
  let arquivos: string[] = [];
  try {
    arquivos = await readdir(agentsDir);
  } catch {
    return [];
  }
  const ajustes: ModeloAjuste[] = [];
  for (const [agente, modelo] of Object.entries(MODELO_POR_AGENTE)) {
    const f = `${agente}.md`;
    if (!arquivos.includes(f)) continue;
    const full = path.join(agentsDir, f);
    const conteudo = await readFile(full, "utf8");
    const { texto, mudou, modeloAnterior } = aplicarModeloFrontmatter(conteudo, modelo);
    if (mudou) await writeFile(full, texto, "utf8");
    ajustes.push({ agente, de: modeloAnterior, para: modelo, mudou });
  }
  return ajustes;
}
