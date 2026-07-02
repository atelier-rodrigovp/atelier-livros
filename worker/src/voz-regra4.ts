// Política de CADÊNCIA (Regra 4 da skill) embutida na FUNDAÇÃO como ALVO POSITIVO.
// O arquiteto-de-enredo gera perfil-de-voz.md / Estrutura-do-Livro.md por prosa (e o
// SKILL.md tem encoding corrompido — não editar), então a cota numérica (fragmento
// ≤1–2 nunca colado, itálico ≤2–3, retórica ≤1–2) e o anti-muleta "coisa" saíam
// não-determinísticos (faltavam). O detector (maneirismo.ts) ENFORCE no gate; este
// passo dá ao escritor a cota DE ANTEMÃO (escreve limpo de primeira, sem
// staccato-depois-reescreve). Idempotente via MARCADOR.
//
// Os números abaixo BATEM com os orçamentos do detector (worker/src/maneirismo.ts):
//   perfil "fragmento ≤1–2, nunca colado"  ↔  ORC_CADENCIA.fragEnfase=2 / fragColados alvo 0
//   perfil "itálico ≤2–3"                  ↔  ORC_CADENCIA.italico=3
//   perfil "retórica ≤1–2"                 ↔  ORC_CADENCIA.retorica=2
//   perfil "anáfora/clipe: não repetir"    ↔  ORC_CADENCIA.anafora=1 / clipeNeg=1
//   perfil "coisa ~≤1/cap"                 ↔  MULETAS "coisa/coisas" orc10k=4 (~1/cap)
// Assim o ALVO que o escritor recebe é o MESMO que o gate cobra.
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { contarMuletas, type MuletaContagem } from "./maneirismo.js";

// Marcador de idempotência: bloco gerido por este passo. Não duplicar.
export const MARCADOR = "<!-- COTA-CADENCIA v1 -->";
export const MARCADOR_FIM = "<!-- /COTA-CADENCIA -->";
// Injeções ANTERIORES (sem marcador): edição cirúrgica manual em "A Espiral" e a 1ª
// versão deste passo. Reconhecidas para NÃO duplicar — mas SÓ quando o legado é
// COMPLETO: o arquiteto v6.3 emite nativamente uma cota PARCIAL ("Cota de tiques…
// nunca dois colados", sem anáfora/clipe nem orçamento de "coisa") que casava com o
// regex antigo e SUPRIMIA a injeção — o escritor de projeto novo só descobria
// anáfora/clipe/"coisa" quando o gate reprovava (cap 6 do Índice: tiques 40→17
// pagos no micro-loop). Completo = núcleo + (anáfora OU clipe) + orçamento "coisa".
const RE_LEGADO_NUCLEO = /cota de tiques|nunca dois colados|RITMO[ \w]*E COTA DE TIQUES/i;
const RE_LEGADO_ANAFORA_CLIPE = /an[áa]fora|clipe de nega[çc]/i;
const RE_LEGADO_COISA = /["“”']?coisas?["“”']?\*{0,2}:?[^\n]{0,60}(≤\s*~?1|no m[áa]ximo\s+\*{0,2}~?\s*1|~1\s*(\/|por)\s*cap)/i;

function jaTemCota(texto: string): boolean {
  const t = texto ?? "";
  if (t.includes(MARCADOR)) return true;
  return RE_LEGADO_NUCLEO.test(t) && RE_LEGADO_ANAFORA_CLIPE.test(t) && RE_LEGADO_COISA.test(t);
}

export const SECAO_REGRA4_PERFIL =
  `${MARCADOR}

## RITMO E COTA DE TIQUES (Regra 4 — régua DURA, alvo POSITIVO)

A voz depende de **ritmo variado**. O defeito a matar é a cadência repetitiva
(sempre frase curta + fragmento + pergunta retórica) e o **staccato colado** —
frases muito curtas em sequência, que viram caricatura. Não se proíbe o fragmento
(ele é bisturi); **dosa-se** e **alterna-se o comprimento da frase de propósito**.

**Alvo positivo:** ação pode ser curta e seca; **revelação respira numa frase mais
longa e encadeada**. Funda frases curtas coladas quando a cena pede continuidade;
corte seco só no soco. Reação física ancorada neste corpo, nesta cena — nunca o
clichê de prateleira.

**Cota por capítulo (o Revisor cobra por NÚMERO — bate com o detector determinístico):**
- **Fragmento de ênfase (frase de 1–3 palavras):** no máximo **1–2**, e **NUNCA dois colados**.
- **Pensamento em itálico:** no máximo **2–3**, cada um para um golpe real de reconhecimento.
- **Pergunta retórica suspensa:** no máximo **1–2**.
- **Ritmo variado conscientemente:** alterne o comprimento da frase; a revelação pode
  respirar numa frase longa e encadeada; **nunca o mesmo molde dois capítulos seguidos**.
- **Sem clipe de negação nem anáfora:** não repita "Não X." curto como remate
  ("Não precisava. Não precisavam."); não abra frases consecutivas com a mesma palavra
  ("Davam datas. Davam horas."); nada de staccato denso nem epigrama antitético em série.

**Orçamento de muletas (troque pelo referente concreto — objeto, ideia, gesto):**
- **"coisa"/"coisas":** no máximo **~1 por capítulo**.
- Apertado também: **"algo", "meio que", "simplesmente", "de repente", "na verdade",
  "parecia que", "de certa forma/maneira"**.

Estourar a cota é reprovação estética: o capítulo é marcado para reescrita de ritmo
(funde/encadeia as frases), preservando sentido e voz. Um detector determinístico
mede isto a cada capítulo — não é questão de impressão.
${MARCADOR_FIM}`;

export const POLITICA_CADENCIA_ESTRUTURA =
  `${MARCADOR}\n` +
  `- **Regra 4 (cadência — política dura):** o capítulo é REPROVADO esteticamente se ` +
  `estourar a cota — ritmo VARIADO por capítulo (alterne frase longa encadeada e curta), ` +
  `com ≤2–3 pensamentos em itálico, ≤1–2 perguntas retóricas, ≤1–2 fragmentos de ênfase ` +
  `**e nunca dois colados**; sem staccato denso, anáfora colada ou clipe de negação ` +
  `repetido; "coisa" ≤1/cap (troque pelo referente). Instrução = **variar o ritmo** ` +
  `(fundir frases curtas, encadear na revelação), não só cortar. Ver \`perfil-de-voz.md\`.\n` +
  MARCADOR_FIM;

// perfil-de-voz.md: anexa a seção da cota ao fim, se ainda não existir.
export function garantirRegra4NoPerfil(conteudo: string): { texto: string; mudou: boolean } {
  if (jaTemCota(conteudo)) return { texto: conteudo, mudou: false };
  return { texto: (conteudo ?? "").replace(/\s*$/, "") + "\n\n" + SECAO_REGRA4_PERFIL + "\n", mudou: true };
}

// Estrutura-do-Livro.md: injeta o bullet de cadência no topo da seção "NOTAS DE
// EXECUÇÃO" (logo após o cabeçalho); se a seção não existir, cria uma.
export function garantirCadenciaNaEstrutura(conteudo: string): { texto: string; mudou: boolean } {
  if (jaTemCota(conteudo)) return { texto: conteudo, mudou: false };
  const t = conteudo ?? "";
  const m = /(?:^|\n)#+\s*NOTAS DE EXECU[ÇC][ÃA]O[^\n]*\n/i.exec(t);
  if (m) {
    const idx = m.index + m[0].length;
    return { texto: t.slice(0, idx) + POLITICA_CADENCIA_ESTRUTURA + "\n\n" + t.slice(idx), mudou: true };
  }
  return { texto: t.replace(/\s*$/, "") + "\n\n## NOTAS DE EXECUÇÃO (cadência)\n\n" + POLITICA_CADENCIA_ESTRUTURA + "\n", mudou: true };
}

// ---------------------------------------------------------------------------
// BLINDAGEM DOS PARÁGRAFOS-MODELO (§2 do perfil): os modelos são ALVO de TÉCNICA
// que o escritor IMITA — se um deles contiver muleta ("coisa") ou staccato, o
// escritor reproduz o defeito. O gate de cadência roda nos CAPÍTULOS, não no perfil,
// então a §2 não é coberta. Aqui: (1) injeta uma linha de GUARDA idempotente e
// (2) ESCANEIA os modelos por muleta e SINALIZA (não reescreve a prosa do autor).
// ---------------------------------------------------------------------------
export const MARCADOR_GUARDA = "<!-- GUARDA-MODELOS v1 -->";

export const LINHA_GUARDA =
  `${MARCADOR_GUARDA}\n` +
  `> **Guarda:** os parágrafos-modelo abaixo são ALVO de TÉCNICA — emule o ritmo, a ` +
  `lente e o léxico; **não copie** o conteúdo e **não reproduza muleta** ("coisa", ` +
  `"algo", "de repente"…) nem staccato colado neles. Um modelo limpo faz parte da regra.`;

// Região da §2 PARÁGRAFOS-MODELO (do cabeçalho até a próxima '## ' ou o fim).
function regiaoModelos(conteudo: string): { idxApos: number; corpo: string } | null {
  const t = conteudo ?? "";
  const m = /##\s*\d*\.?\s*PAR[ÁA]GRAFOS-MODELO[^\n]*\n/i.exec(t);
  if (!m) return null;
  const idxApos = m.index + m[0].length;
  const rest = t.slice(idxApos);
  const next = /\n##\s/.exec(rest);
  return { idxApos, corpo: next ? rest.slice(0, next.index) : rest };
}

// Injeta a linha de guarda logo após o cabeçalho da §2, se ainda não houver.
export function garantirGuardaModelos(conteudo: string): { texto: string; mudou: boolean } {
  const t = conteudo ?? "";
  if (t.includes(MARCADOR_GUARDA) || /n[ãa]o\s+reproduz\w*\s+muleta/i.test(t)) return { texto: t, mudou: false };
  const reg = regiaoModelos(t);
  if (!reg) return { texto: t, mudou: false }; // sem §2: não inventa seção
  return { texto: t.slice(0, reg.idxApos) + LINHA_GUARDA + "\n" + t.slice(reg.idxApos), mudou: true };
}

// Escaneia SÓ as linhas de prosa-modelo (blockquote '>') da §2 por muleta. Ignora a
// linha de guarda (que cita "coisa"/"algo" como exemplo) e o marcador.
export function escanearMuletasNosModelos(conteudoPerfil: string): MuletaContagem[] {
  const reg = regiaoModelos(conteudoPerfil);
  if (!reg) return [];
  const prosa = reg.corpo
    .split("\n")
    .filter((l) => /^\s*>/.test(l) && !/^\s*>\s*\*\*Guarda/i.test(l) && !l.includes("GUARDA-MODELOS"))
    .map((l) => l.replace(/^\s*>\s?/, ""))
    .join(" ");
  return contarMuletas(prosa); // já vem filtrado (n>0) e ordenado
}

export interface VozAjuste { arquivo: string; mudou: boolean; aviso?: string }

// Garante a cota de cadência + a guarda dos modelos na fundação (idempotente) e
// SINALIZA muleta nos parágrafos-modelo (sem reescrever prosa).
export async function normalizarVozRegra4(projDir: string): Promise<VozAjuste[]> {
  const ajustes: VozAjuste[] = [];

  // perfil-de-voz.md: cota (fim) + guarda dos modelos (§2) + scan de muleta.
  const perfilPath = path.join(projDir, "perfil-de-voz.md");
  const perfil0 = await lerOuNull(perfilPath);
  if (perfil0 != null) {
    let perfil = perfil0;
    let mudou = false;
    for (const fn of [garantirRegra4NoPerfil, garantirGuardaModelos]) {
      const r = fn(perfil);
      perfil = r.texto;
      mudou = mudou || r.mudou;
    }
    if (mudou) await writeFile(perfilPath, perfil, "utf8");
    const hits = escanearMuletasNosModelos(perfil);
    ajustes.push({
      arquivo: "perfil-de-voz.md",
      mudou,
      aviso: hits.length
        ? `muleta nos parágrafos-modelo (§2): ${hits.map((h) => `${h.termo} ${h.n}×`).join(", ")} — revisar à mão (não reescrevo prosa do autor)`
        : undefined,
    });
  }

  // Estrutura-do-Livro.md: política dura de cadência nas Notas de Execução.
  const estPath = path.join(projDir, "Estrutura-do-Livro.md");
  const est0 = await lerOuNull(estPath);
  if (est0 != null) {
    const { texto, mudou } = garantirCadenciaNaEstrutura(est0);
    if (mudou) await writeFile(estPath, texto, "utf8");
    ajustes.push({ arquivo: "Estrutura-do-Livro.md", mudou });
  }

  return ajustes;
}

async function lerOuNull(p: string): Promise<string | null> {
  try {
    return await readFile(p, "utf8");
  } catch {
    return null;
  }
}
