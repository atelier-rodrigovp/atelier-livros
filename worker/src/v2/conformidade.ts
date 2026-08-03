// Engine V2 — conformidade FICHA → PROSA (fatia G).
//
// O buraco que este módulo fecha: a engine verificava se o capítulo estava bem
// escrito (sinais, cotas, gates universais) e se era factualmente coerente
// (auditor), mas NUNCA se ele cumpriu a própria ficha. Um capítulo competente,
// bonito e sem contradição, que simplesmente não entrega a virada planejada,
// passava.
//
// Desenho em duas camadas, porque nenhuma sozinha basta:
//
// 1. DETERMINÍSTICA — o que dá para conferir sem julgamento: o capítulo cita o
//    local, o tempo, o POV; tem diálogo quando a ficha promete; menciona os
//    objetos/fatos obrigatórios. Barato e sem falso positivo semântico.
// 2. SEMÂNTICA hash-bound — objetivo, obstáculo, ação decisiva, virada, mudança
//    de estado, gancho, marco de arco e promessa tocada. Julgada por papel, com
//    EVIDÊNCIA LOCALIZÁVEL obrigatória: uma afirmação de conformidade sem trecho
//    citado que exista no texto não sustenta aprovação.

import type { SceneSpec } from "./tipos.js";

/** Itens da ficha que precisam aparecer na prosa. */
export const ITENS_CONFORMIDADE = [
  "objetivo",
  "obstaculo",
  "acao_decisiva",
  "virada",
  "mudanca_estado",
  "gancho",
  "informacao_nova",
  "marco_arco",
  "promessa",
] as const;

export type ItemConformidade = (typeof ITENS_CONFORMIDADE)[number];

export interface AfirmacaoConformidade {
  item: ItemConformidade;
  cumprido: boolean;
  /** Trecho LITERAL do capítulo que sustenta a afirmação. */
  trecho: string;
  /** Por que este trecho cumpre (ou por que o item não foi cumprido). */
  justificativa: string;
}

export interface ParecerConformidade {
  schema: "conformidade-ficha-prosa/v1";
  afirmacoes: AfirmacaoConformidade[];
}

export type MotivoInvalidez =
  | "trecho_vazio"
  | "trecho_ausente_no_texto"
  | "justificativa_vazia"
  | "item_nao_avaliado"
  | "item_desconhecido";

export interface ProblemaConformidade {
  item: string;
  motivo: MotivoInvalidez | "nao_cumprido";
  detalhe: string;
}

/** Normaliza para comparar trecho × texto sem tropeçar em espaço e aspas. */
function normalizar(t: string): string {
  return t
    .toLowerCase()
    .replace(/[“”«»„]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * O trecho citado existe mesmo no capítulo? É o que separa evidência de
 * alegação. Aceita citação parcial (o papel pode encurtar), mas exige que a
 * sequência apareça — nada de paráfrase passando por citação.
 */
export function trechoExisteNoTexto(trecho: string, texto: string): boolean {
  const t = normalizar(trecho);
  if (t.length < 12) return false; // citação curta demais não localiza nada
  return normalizar(texto).includes(t);
}

/** Itens que a ficha efetivamente exige deste capítulo. */
export function itensExigidos(ficha: SceneSpec): ItemConformidade[] {
  const exigidos: ItemConformidade[] = [
    "objetivo",
    "obstaculo",
    "acao_decisiva",
    "virada",
    "mudanca_estado",
    "gancho",
    "informacao_nova",
  ];
  if ((ficha.marcos_arco ?? []).length) exigidos.push("marco_arco");
  if ((ficha.promessas_tocadas ?? []).length) exigidos.push("promessa");
  return exigidos;
}

export interface ResultadoConformidade {
  /** false = o capítulo não cumpriu a própria ficha. */
  conforme: boolean;
  problemas: ProblemaConformidade[];
  /** Afirmações válidas (trecho existe e justificativa não é vazia). */
  validadas: AfirmacaoConformidade[];
}

/**
 * Confere o parecer de conformidade contra a ficha e contra o TEXTO REAL.
 *
 * Três formas de reprovar, todas com evidência:
 * - item exigido pela ficha que o parecer nem avaliou;
 * - item declarado cumprido com trecho que não existe no capítulo;
 * - item declarado NÃO cumprido (o capítulo não entrega o que a ficha planejou).
 */
export function conferirConformidade(
  parecer: ParecerConformidade,
  ficha: SceneSpec,
  texto: string
): ResultadoConformidade {
  const problemas: ProblemaConformidade[] = [];
  const validadas: AfirmacaoConformidade[] = [];
  const exigidos = itensExigidos(ficha);
  const porItem = new Map(parecer.afirmacoes.map((a) => [a.item, a]));

  for (const item of exigidos) {
    const a = porItem.get(item);
    if (!a) {
      problemas.push({ item, motivo: "item_nao_avaliado", detalhe: `a ficha exige "${item}" e o parecer não o avaliou` });
      continue;
    }
    if (!a.justificativa?.trim()) {
      problemas.push({ item, motivo: "justificativa_vazia", detalhe: `"${item}" sem justificativa` });
      continue;
    }
    if (!a.cumprido) {
      problemas.push({
        item,
        motivo: "nao_cumprido",
        detalhe: `o capítulo não cumpre "${item}" previsto na ficha: ${a.justificativa}`,
      });
      continue;
    }
    if (!a.trecho?.trim()) {
      problemas.push({ item, motivo: "trecho_vazio", detalhe: `"${item}" declarado cumprido sem citar trecho` });
      continue;
    }
    if (!trechoExisteNoTexto(a.trecho, texto)) {
      problemas.push({
        item,
        motivo: "trecho_ausente_no_texto",
        detalhe: `"${item}" cita um trecho que não existe no capítulo: ${JSON.stringify(a.trecho.slice(0, 80))}`,
      });
      continue;
    }
    validadas.push(a);
  }

  // Afirmações extras são ruído de saída do modelo, não falha da PROSA. O gate
  // continua fail-closed para cada item exigido acima (inclusive item omitido),
  // mas não reprova um capítulo porque o julgador acrescentou uma linha que a
  // ficha não pediu.

  return { conforme: problemas.length === 0, problemas, validadas };
}

// ---------------------------------------------------------------------------
// Camada determinística — barata, sem julgamento, sem falso positivo semântico
// ---------------------------------------------------------------------------

export interface SinalConformidade {
  sinal: string;
  presente: boolean;
  detalhe: string;
}

/** Palavras distintivas de um campo da ficha (nomes próprios e substantivos). */
function termosDistintivos(campo: string): string[] {
  const vazias = new Set(["para", "pelo", "pela", "que", "com", "sem", "dos", "das", "uma", "seu", "sua", "não", "the"]);
  return [...new Set(normalizar(campo).split(/[^a-zà-ú0-9]+/).filter((t) => t.length > 3 && !vazias.has(t)))];
}

/** Fração dos termos do campo que aparecem no texto. */
export function cobertura(campo: string, texto: string): number {
  const termos = termosDistintivos(campo);
  if (!termos.length) return 1;
  const alvo = normalizar(texto);
  return termos.filter((t) => alvo.includes(t)).length / termos.length;
}

/**
 * Sinais determinísticos. NÃO bloqueiam sozinhos — alimentam o papel que julga a
 * conformidade semântica, para que ele saiba onde olhar (mesma política dos
 * sinais editoriais: detector com falso positivo não bloqueia).
 */
export function medirConformidade(ficha: SceneSpec, texto: string): SinalConformidade[] {
  const alvo = normalizar(texto);
  const sinais: SinalConformidade[] = [];
  const cobre = (nome: string, campo: string, minimo = 0.34) => {
    const c = cobertura(campo, texto);
    sinais.push({
      sinal: nome,
      presente: c >= minimo,
      detalhe: `${Math.round(c * 100)}% dos termos de "${campo.slice(0, 60)}" aparecem no capítulo`,
    });
  };
  cobre("local_citado", ficha.local);
  cobre("pov_citado", ficha.pov, 0.5);
  cobre("objetivo_presente", ficha.objetivo);
  cobre("obstaculo_presente", ficha.obstaculo);
  cobre("acao_presente", ficha.acao_fisica);
  cobre("virada_presente", ficha.virada);
  cobre("informacao_nova_presente", ficha.informacao_nova);
  cobre("gancho_presente", ficha.gancho?.descricao ?? "");

  for (const fato of ficha.fatos_obrigatorios ?? []) {
    sinais.push({
      sinal: "fato_obrigatorio",
      presente: cobertura(fato, texto) >= 0.34,
      detalhe: `fato "${fato.slice(0, 50)}"`,
    });
  }
  sinais.push({
    sinal: "tem_dialogo",
    presente: /(^|\n)\s*[—–-]\s|["“][^"”]{8,}["”]/.test(texto),
    detalhe: "presença de fala marcada",
  });
  sinais.push({
    sinal: "capitulo_nao_vazio",
    presente: alvo.split(" ").length > 120,
    detalhe: `${alvo.split(" ").length} palavras`,
  });
  return sinais;
}

/** Resumo dos sinais para entrar no prompt de quem julga a conformidade. */
export function resumoConformidade(sinais: SinalConformidade[]): string {
  const ausentes = sinais.filter((s) => !s.presente);
  if (!ausentes.length) return "Sinais determinísticos: todos os elementos da ficha têm eco no texto.";
  return [
    "Sinais determinísticos — elementos da ficha SEM eco claro no texto (verifique com atenção):",
    ...ausentes.map((s) => `- ${s.sinal}: ${s.detalhe}`),
  ].join("\n");
}

/** Valida a saída JSON do papel de conformidade. */
export function validarParecerConformidade(obj: unknown): ParecerConformidade {
  if (typeof obj !== "object" || obj === null) throw new Error("parecer de conformidade não é objeto");
  const o = obj as Record<string, unknown>;
  if (!Array.isArray(o.afirmacoes)) throw new Error("esperado { afirmacoes: [...] }");
  const afirmacoes = (o.afirmacoes as unknown[]).map((a, i) => {
    const x = a as Record<string, unknown>;
    if (typeof x?.item !== "string") throw new Error(`afirmacoes[${i}].item inválido`);
    if (typeof x?.cumprido !== "boolean") throw new Error(`afirmacoes[${i}].cumprido inválido`);
    if (typeof x?.trecho !== "string") throw new Error(`afirmacoes[${i}].trecho inválido`);
    if (typeof x?.justificativa !== "string") throw new Error(`afirmacoes[${i}].justificativa inválida`);
    return {
      item: x.item as ItemConformidade,
      cumprido: x.cumprido,
      trecho: x.trecho,
      justificativa: x.justificativa,
    };
  }).filter((a) => (ITENS_CONFORMIDADE as readonly string[]).includes(a.item));
  return { schema: "conformidade-ficha-prosa/v1", afirmacoes };
}
