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

// Marcador de idempotência: bloco gerido por este passo. Não duplicar.
export const MARCADOR = "<!-- COTA-CADENCIA v1 -->";
export const MARCADOR_FIM = "<!-- /COTA-CADENCIA -->";
// Injeções ANTERIORES (sem marcador): edição cirúrgica manual em "A Espiral" e a 1ª
// versão deste passo. Reconhecidas para NÃO duplicar.
const RE_LEGADO = /cota de tiques|nunca dois colados|RITMO[ \w]*E COTA DE TIQUES/i;

function jaTemCota(texto: string): boolean {
  const t = texto ?? "";
  return t.includes(MARCADOR) || RE_LEGADO.test(t);
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

export interface VozAjuste { arquivo: string; mudou: boolean }

// Garante a política de cadência na fundação de um projeto (idempotente via MARCADOR).
export async function normalizarVozRegra4(projDir: string): Promise<VozAjuste[]> {
  const alvos: Array<[string, (c: string) => { texto: string; mudou: boolean }]> = [
    ["perfil-de-voz.md", garantirRegra4NoPerfil],
    ["Estrutura-do-Livro.md", garantirCadenciaNaEstrutura],
  ];
  const ajustes: VozAjuste[] = [];
  for (const [nome, fn] of alvos) {
    const full = path.join(projDir, nome);
    let conteudo: string;
    try {
      conteudo = await readFile(full, "utf8");
    } catch {
      continue; // arquivo ausente: nada a fazer
    }
    const { texto, mudou } = fn(conteudo);
    if (mudou) await writeFile(full, texto, "utf8");
    ajustes.push({ arquivo: nome, mudou });
  }
  return ajustes;
}
