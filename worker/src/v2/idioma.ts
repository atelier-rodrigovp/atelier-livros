// Engine V2 — gate de IDIOMA e VARIANTE (fatia J).
//
// O idioma já era dado de primeira classe (briefing → pacote → prosa), mas
// ninguém verificava o resultado. Uma premissa ambientada em Portugal puxa o
// modelo para pt-PT sem aviso, e o livro sai numa variante que o autor não pediu.
//
// Desenho: o DETECTOR é determinístico e é SINAL, nunca juiz único. O
// julgamento distingue narração de diálogo intencional, personagem estrangeiro
// e citação — coisas que um detector de marcadores não sabe separar. O parecer é
// hash-bound como qualquer outro.

export interface MarcadorVariante {
  variante: string;
  /** Expressões que só (ou quase só) existem nesta variante. */
  padroes: RegExp[];
}

/**
 * Marcadores conservadores: cada um é uma construção que praticamente não
 * aparece na outra variante. Nada de vocabulário ambíguo — falso positivo aqui
 * viraria reprovação de prosa correta.
 */
export const MARCADORES: MarcadorVariante[] = [
  {
    variante: "pt-PT",
    padroes: [
      /\best[áa]s a (?:fazer|ver|dizer|falar|pensar|olhar)\b/gi,
      /\bestou a (?:fazer|ver|dizer|falar|pensar|olhar)\b/gi,
      /\bcasa de banho\b/gi,
      /\bautocarro\b/gi,
      /\btelem[óo]vel\b/gi,
      /\bcomboio\b/gi,
      /\bfrigor[íi]fico\b/gi,
      /\bpequeno-almo[çc]o\b/gi,
      /\brapariga\b/gi,
      /\bapelido\b/gi,
      /\bec(?:r|)[ãa]\b/gi,
    ],
  },
  {
    variante: "pt-BR",
    padroes: [
      /\bestá (?:fazendo|vendo|dizendo|falando|pensando|olhando)\b/gi,
      /\bbanheiro\b/gi,
      /\b[ôo]nibus\b/gi,
      /\bcelular\b/gi,
      /\btrem\b/gi,
      /\bgeladeira\b/gi,
      /\bcaf[ée] da manh[ãa]\b/gi,
      /\bsobrenome\b/gi,
      /\btela do computador\b/gi,
    ],
  },
];

export interface OcorrenciaVariante {
  variante: string;
  trecho: string;
  /** `narracao` ou `dialogo` — decidido pela posição no texto, não por adivinhação. */
  contexto: "narracao" | "dialogo";
}

/** Linhas de diálogo: travessão no início ou fala entre aspas. */
function ehLinhaDeDialogo(linha: string): boolean {
  const t = linha.trim();
  return /^[—–-]\s/.test(t) || /^["“][^"”]{4,}/.test(t);
}

/** Mede marcadores de variante, separando narração de diálogo. */
export function medirVariante(texto: string): OcorrenciaVariante[] {
  const out: OcorrenciaVariante[] = [];
  for (const linha of texto.split(/\n/)) {
    if (!linha.trim() || linha.trim().startsWith("#")) continue;
    const contexto = ehLinhaDeDialogo(linha) ? "dialogo" : "narracao";
    for (const m of MARCADORES) {
      for (const re of m.padroes) {
        for (const achado of linha.matchAll(re)) {
          out.push({ variante: m.variante, contexto, trecho: linha.trim().slice(0, 140) });
        }
      }
    }
  }
  return out;
}

export interface SinalIdioma {
  /** Variante-alvo declarada pelo projeto. */
  alvo: string;
  /** Ocorrências de OUTRAS variantes na NARRAÇÃO — é o que importa. */
  divergentesNarracao: OcorrenciaVariante[];
  /** Ocorrências em DIÁLOGO: podem ser intencionais (personagem de outro país). */
  divergentesDialogo: OcorrenciaVariante[];
  /** Ocorrências que confirmam o alvo. */
  conformes: OcorrenciaVariante[];
}

/** Compara duas tags de idioma: "pt-BR" ≠ "pt-PT", mas "pt" casa com "pt-BR". */
export function mesmaVariante(a: string, b: string): boolean {
  const na = a.trim().toLowerCase();
  const nb = b.trim().toLowerCase();
  if (na === nb) return true;
  const [ba] = na.split("-");
  const [bb] = nb.split("-");
  // Só a base declarada (ex.: "pt") casa com qualquer variante dela.
  return (na === ba && bb === ba) || (nb === bb && ba === bb);
}

export function medirIdioma(texto: string, alvo: string): SinalIdioma {
  const ocorrencias = medirVariante(texto);
  const conformes = ocorrencias.filter((o) => mesmaVariante(o.variante, alvo));
  const divergentes = ocorrencias.filter((o) => !mesmaVariante(o.variante, alvo));
  return {
    alvo,
    conformes,
    divergentesNarracao: divergentes.filter((o) => o.contexto === "narracao"),
    divergentesDialogo: divergentes.filter((o) => o.contexto === "dialogo"),
  };
}

/** Resumo para o prompt de quem julga. O detector informa; não decide. */
export function resumoIdioma(s: SinalIdioma): string {
  if (!s.divergentesNarracao.length && !s.divergentesDialogo.length) {
    return `SINAIS DE IDIOMA: nenhuma marca de variante estranha a ${s.alvo}.`;
  }
  const linhas = [`SINAIS DE IDIOMA (alvo: ${s.alvo}) — o detector aponta, você julga:`];
  if (s.divergentesNarracao.length) {
    linhas.push(`- NARRAÇÃO com marcas de outra variante (${s.divergentesNarracao.length}):`);
    for (const o of s.divergentesNarracao.slice(0, 6)) linhas.push(`  · [${o.variante}] "${o.trecho}"`);
  }
  if (s.divergentesDialogo.length) {
    linhas.push(`- DIÁLOGO com marcas de outra variante (${s.divergentesDialogo.length}) — pode ser personagem de outra origem:`);
    for (const o of s.divergentesDialogo.slice(0, 6)) linhas.push(`  · [${o.variante}] "${o.trecho}"`);
  }
  return linhas.join("\n");
}

// ---------------------------------------------------------------------------
// Parecer do julgamento de idioma (hash-bound, como os demais)
// ---------------------------------------------------------------------------

export interface ParecerIdioma {
  schema: "parecer-idioma/v1";
  /** A NARRAÇÃO está na variante-alvo? */
  narracao_conforme: boolean;
  /** Divergências que o julgamento considerou INTENCIONAIS e por quê. */
  intencionais: { trecho: string; motivo: string }[];
  /** Divergências INJUSTIFICADAS, com o trecho. */
  injustificadas: { trecho: string; detalhe: string }[];
}

export type VereditoIdioma =
  | { passou: true; observacao?: string }
  | { passou: false; motivo: string; evidencia: string };

/**
 * Decisão final. O detector sozinho NUNCA reprova (falso positivo em citação e
 * em personagem estrangeiro seria inevitável); o julgamento sozinho também não
 * basta — ele precisa apontar o trecho. Reprova quando o julgamento afirma
 * divergência injustificada COM evidência, ou quando declara a narração fora do
 * alvo.
 */
export function decidirIdioma(sinal: SinalIdioma, parecer: ParecerIdioma): VereditoIdioma {
  const comEvidencia = parecer.injustificadas.filter((i) => i.trecho?.trim().length >= 8);
  if (comEvidencia.length) {
    return {
      passou: false,
      motivo: `narração fora da variante-alvo (${sinal.alvo}): ${comEvidencia.length} divergência(s) injustificada(s)`,
      evidencia: comEvidencia.slice(0, 4).map((i) => `"${i.trecho}" — ${i.detalhe}`).join(" · "),
    };
  }
  if (!parecer.narracao_conforme) {
    return {
      passou: false,
      motivo: `o julgamento declara a narração fora de ${sinal.alvo}`,
      evidencia:
        sinal.divergentesNarracao.slice(0, 4).map((o) => `[${o.variante}] "${o.trecho}"`).join(" · ") ||
        "sem trecho citado pelo detector",
    };
  }
  if (parecer.intencionais.length) {
    return {
      passou: true,
      observacao: `${parecer.intencionais.length} divergência(s) aceita(s) como intencionais: ${parecer.intencionais
        .map((i) => i.motivo)
        .slice(0, 3)
        .join("; ")}`,
    };
  }
  return { passou: true };
}

export function validarParecerIdioma(obj: unknown): ParecerIdioma {
  if (typeof obj !== "object" || obj === null) throw new Error("parecer de idioma não é objeto");
  const o = obj as Record<string, unknown>;
  if (typeof o.narracao_conforme !== "boolean") throw new Error("narracao_conforme deve ser boolean");
  const lista = (v: unknown, nome: string, campos: string[]) => {
    if (!Array.isArray(v)) throw new Error(`${nome} deve ser array`);
    return (v as unknown[]).map((x, i) => {
      const r = x as Record<string, unknown>;
      for (const c of campos) {
        if (typeof r?.[c] !== "string") throw new Error(`${nome}[${i}].${c} inválido`);
      }
      return r as never;
    });
  };
  return {
    schema: "parecer-idioma/v1",
    narracao_conforme: o.narracao_conforme,
    intencionais: lista(o.intencionais ?? [], "intencionais", ["trecho", "motivo"]),
    injustificadas: lista(o.injustificadas ?? [], "injustificadas", ["trecho", "detalhe"]),
  };
}
