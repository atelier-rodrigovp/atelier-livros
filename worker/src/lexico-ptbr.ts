// LÉXICO PT-BR → perfil-de-voz.md. A FASE -1 da AUDITORIA-DAN-BROWN-V2 mediu
// contaminação de português de PORTUGAL (telemóvel/ecrã/… + colocação pronominal)
// forçando rodadas caríssimas de revisão (cap-31: 9 rodadas / 1h29). A correção
// durável é na INSTRUÇÃO da fundação — o gate/muleta é rede de segurança, não a 1ª
// linha. Padrão de voz-regra4.ts/craft-skill.ts: idempotente por marcador, roda após
// criar_fundacao e no início de escrever_livro. UNIVERSAL (toda prosa do Atelier é pt-BR).
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

export const MARCADOR_LEXICO_PTBR = "<!-- LEXICO-PTBR v1 -->";
export const MARCADOR_LEXICO_PTBR_FIM = "<!-- /LEXICO-PTBR -->";

// NB linguística: pt-BR usa PRÓCLISE (pronome ANTES do verbo, inclusive em início de
// frase); a ÊNCLISE sistemática ("Chamou-me") é a marca de pt-PT. O prompt do Rodrigo
// pedia o contrário por engano — aqui vai o correto.
export const BLOCO_LEXICO_PTBR =
  `${MARCADOR_LEXICO_PTBR}\n\n## ESCREVA EM PORTUGUÊS DO BRASIL (pt-BR, nunca pt-PT)\n\n` +
  "> A prosa é **português do Brasil**. NÃO use vocabulário nem colocação pronominal de " +
  "Portugal. Se um termo pt-PT escapar, TROQUE:\n\n" +
  "- **Vocabulário (pt-PT → pt-BR):** telemóvel → celular · ecrã → tela · autocarro → ônibus · " +
  "casa de banho → banheiro · comboio → trem · frigorífico → geladeira · pequeno-almoço → " +
  "café da manhã · rapariga → moça/garota · apelido → sobrenome · fixe → legal/bacana · " +
  "portátil → notebook · sande → sanduíche · autoclismo → descarga · talho → açougue.\n" +
  "- **Colocação pronominal — use PRÓCLISE (pt-BR):** o pronome vem ANTES do verbo, inclusive " +
  "em início de frase — **\"Me chamou\"**, **\"Se virou\"**, **\"Te disse\"**. A ênclise " +
  "sistemática (**\"Chamou-me\"**, **\"Virou-se\"**) e a mesóclise (**\"Chamar-me-ia\"**) são " +
  "marcas de pt-PT — evite. Ênclise só quando o pt-BR de fato a pede (após pausa forte/imperativo).\n" +
  "- **Regência/gerúndio:** pt-BR usa gerúndio (\"estou fazendo\"), não \"estou a fazer\" (pt-PT).\n\n" +
  MARCADOR_LEXICO_PTBR_FIM;

export function temLexicoPtbr(conteudo: string): boolean {
  return (conteudo ?? "").includes(MARCADOR_LEXICO_PTBR);
}

// Injeta o bloco no fim do perfil, se ainda não existir. Idempotente.
export function garantirLexicoPtbr(conteudo: string): { texto: string; mudou: boolean } {
  const t = conteudo ?? "";
  if (temLexicoPtbr(t)) return { texto: t, mudou: false };
  return { texto: t.replace(/\s*$/, "") + "\n\n" + BLOCO_LEXICO_PTBR + "\n", mudou: true };
}

export interface LexicoAjuste { arquivo: string; mudou: boolean }

// Garante o bloco no perfil-de-voz.md de um projeto (idempotente). No-op se o
// perfil não existir (não inventa arquivo).
export async function normalizarLexicoPtbr(projDir: string): Promise<LexicoAjuste> {
  const perfilPath = path.join(projDir, "perfil-de-voz.md");
  let conteudo: string;
  try {
    conteudo = await readFile(perfilPath, "utf8");
  } catch {
    return { arquivo: "perfil-de-voz.md", mudou: false };
  }
  const { texto, mudou } = garantirLexicoPtbr(conteudo);
  if (mudou) await writeFile(perfilPath, texto, "utf8");
  return { arquivo: "perfil-de-voz.md", mudou };
}
