// Política de CADÊNCIA (Regra 4 da skill) embutida na fundação como ALVO POSITIVO.
// O arquiteto-de-enredo gera perfil-de-voz.md / Estrutura-do-Livro.md por prosa, então
// a cota numérica (fragmento ≤1–2 nunca colado, itálico ≤2–3, retórica ≤1–2) e o
// anti-muleta "coisa" saíam não-determinísticos (faltavam). O detector de cadência
// (maneirismo.ts) ENFORCE no gate; este passo dá ao escritor a cota DE ANTEMÃO
// (menos reescrita). Idempotente: não duplica se a seção já existe.
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

// Detecta a presença da política (cobre tanto a injeção deste passo quanto a edição
// cirúrgica manual feita em projetos anteriores, ex.: "RITMO VARIADO E COTA DE TIQUES").
function temRegra4(texto: string): boolean {
  return /cota de tiques|nunca dois colados|RITMO[ \w]*E COTA DE TIQUES|Regra 4/i.test(texto ?? "");
}

export const SECAO_REGRA4_PERFIL = `
---

## RITMO E COTA DE TIQUES (Regra 4 — régua DURA, alvo POSITIVO)

A voz depende de **ritmo variado**. O defeito a matar é a cadência repetitiva
(sempre frase curta + fragmento + pergunta retórica) e o **staccato colado** —
frases muito curtas em sequência, que viram caricatura. Não se proíbe o fragmento
(ele é bisturi); **dosa-se** e **alterna-se o comprimento da frase de propósito**.

**Alvo positivo:** ação pode ser curta e seca; **revelação respira numa frase mais
longa e encadeada**. Funda frases curtas coladas quando a cena pede continuidade;
corte seco só no soco. Reação física ancorada neste corpo, nesta cena — nunca o
clichê de prateleira.

**Cota por capítulo (o Revisor cobra por NÚMERO):**
- **Pensamento em itálico:** no máximo **2–3**, cada um para um golpe real.
- **Pergunta retórica suspensa:** no máximo **1–2**.
- **Fragmento de ênfase (1–3 palavras):** no máximo **1–2**, e **NUNCA dois colados**.
- **Sem** staccato denso, **anáfora colada** ("Davam datas. Davam horas."),
  **clipe de negação** repetido ("Não precisava. Não precisavam.") ou **epigrama
  antitético** em série.

**Anti-muleta:** "coisa"/"coisas" no máximo **1 por capítulo** — troque pelo
referente concreto (objeto, ideia, gesto). Idem "algo", "de repente", "na verdade".

Estourar a cota é reprovação estética: o capítulo é marcado para reescrita de ritmo
(funde/encadeia as frases), preservando sentido e voz. Um detector determinístico
mede isto a cada capítulo — não é questão de impressão.
`;

export const POLITICA_CADENCIA_ESTRUTURA =
  `- **Regra 4 (cadência — política dura):** ritmo VARIADO por capítulo (alterne ` +
  `frase longa encadeada e curta), com cota de tiques: ≤2–3 pensamentos em itálico, ` +
  `≤1–2 perguntas retóricas, ≤1–2 fragmentos de ênfase **e nunca dois colados**; sem ` +
  `staccato denso, anáfora colada ou clipe de negação repetido; "coisa" ≤1/cap (troque ` +
  `pelo referente). Ver \`perfil-de-voz.md\`. O motor mede por capítulo e marca para ` +
  `reescrita de ritmo quem estourar (funde/encadeia, preservando sentido e voz).`;

// perfil-de-voz.md: anexa a seção Regra 4 ao fim, se ainda não existir.
export function garantirRegra4NoPerfil(conteudo: string): { texto: string; mudou: boolean } {
  if (temRegra4(conteudo)) return { texto: conteudo, mudou: false };
  return { texto: (conteudo ?? "").replace(/\s*$/, "") + "\n" + SECAO_REGRA4_PERFIL + "\n", mudou: true };
}

// Estrutura-do-Livro.md: injeta o bullet de cadência no topo da seção "NOTAS DE
// EXECUÇÃO" (logo após o cabeçalho); se a seção não existir, cria uma.
export function garantirCadenciaNaEstrutura(conteudo: string): { texto: string; mudou: boolean } {
  if (temRegra4(conteudo)) return { texto: conteudo, mudou: false };
  const t = conteudo ?? "";
  const m = /(?:^|\n)#+\s*NOTAS DE EXECU[ÇC][ÃA]O[^\n]*\n/i.exec(t);
  if (m) {
    const idx = m.index + m[0].length;
    return { texto: t.slice(0, idx) + POLITICA_CADENCIA_ESTRUTURA + "\n\n" + t.slice(idx), mudou: true };
  }
  return { texto: t.replace(/\s*$/, "") + "\n\n## NOTAS DE EXECUÇÃO (cadência)\n\n" + POLITICA_CADENCIA_ESTRUTURA + "\n", mudou: true };
}

export interface VozAjuste { arquivo: string; mudou: boolean }

// Garante a política de cadência na fundação de um projeto (idempotente).
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
