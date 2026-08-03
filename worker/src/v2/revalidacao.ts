// Engine V2 — revalidação TRANSITIVA (fatia K).
//
// A meta-nota já revalida a VIZINHANÇA de um capítulo reescrito (N−1 e N+1).
// Isso cobre continuidade local e mais nada: se o capítulo 4 muda o que Marina
// sabe, o capítulo 11 — que depende desse conhecimento — continua aprovado com
// uma premissa que deixou de valer.
//
// Duas distinções que o módulo impõe:
//
// 1. REABRIR ≠ REESCREVER. Reabrir é invalidar a aprovação e REAVALIAR. Só
//    reescreve o que a reavaliação reprovar. Reescrever a cauda inteira por
//    precaução é o oposto de continuidade: é ruído novo em texto que estava bom.
// 2. Dependência é por CANAL nomeado (fio, promessa, pista, personagem,
//    conhecimento, cronologia, objeto, localização, causalidade), não por
//    proximidade. Vizinho não é sinônimo de dependente.

import type { EntradaMemoria } from "./memoria-prosa.js";
import type { SceneSpec } from "./tipos.js";

export type CanalDependencia =
  | "fio"
  | "promessa"
  | "pista"
  | "personagem"
  | "conhecimento"
  | "cronologia"
  | "objeto"
  | "localizacao"
  | "causalidade";

export interface Aresta {
  de: number;
  para: number;
  canal: CanalDependencia;
  /** O que liga os dois capítulos (id da promessa, nome do fio, enunciado…). */
  chave: string;
}

export interface GrafoDependencias {
  arestas: Aresta[];
  /** Capítulos considerados na construção. */
  capitulos: number[];
}

function norm(t: string): string {
  return t.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim();
}

/**
 * Constrói o grafo a partir das FICHAS (o plano) e da MEMÓRIA DA PROSA (a
 * página). Uma aresta `de → para` significa: `para` depende do que `de`
 * estabeleceu.
 */
export function construirGrafo(entrada: {
  fichas: { capitulo: number; ficha: SceneSpec }[];
  memoria: EntradaMemoria[];
}): GrafoDependencias {
  const arestas: Aresta[] = [];
  const capitulos = [...new Set(entrada.fichas.map((f) => f.capitulo))].sort((a, b) => a - b);
  const push = (de: number, para: number, canal: CanalDependencia, chave: string) => {
    if (de >= para) return; // dependência é sempre do passado para o futuro
    if (arestas.some((a) => a.de === de && a.para === para && a.canal === canal && a.chave === chave)) return;
    arestas.push({ de, para, canal, chave });
  };

  // --- FIOS: capítulo que avança um fio depende do anterior do MESMO fio ------
  const porFio = new Map<string, number[]>();
  for (const { capitulo, ficha } of entrada.fichas) {
    for (const fio of ficha.fios_avancados ?? []) {
      const lista = porFio.get(norm(fio)) ?? [];
      lista.push(capitulo);
      porFio.set(norm(fio), lista);
    }
  }
  for (const [fio, caps] of porFio) {
    const ordenados = [...caps].sort((a, b) => a - b);
    for (let i = 1; i < ordenados.length; i++) push(ordenados[i - 1], ordenados[i], "fio", fio);
  }

  // --- PROMESSAS: quem paga/reforça depende de quem plantou ------------------
  const plantios = new Map<string, number>();
  for (const { capitulo, ficha } of entrada.fichas) {
    for (const t of ficha.promessas_tocadas ?? []) {
      if (t.acao === "planta" && !plantios.has(t.id)) plantios.set(t.id, capitulo);
    }
  }
  for (const { capitulo, ficha } of entrada.fichas) {
    for (const t of ficha.promessas_tocadas ?? []) {
      if (t.acao === "planta") continue;
      const plantio = plantios.get(t.id);
      if (plantio !== undefined) push(plantio, capitulo, "promessa", t.id);
    }
  }

  // --- PERSONAGEM (POV) e LOCALIZAÇÃO ---------------------------------------
  const porPov = new Map<string, number[]>();
  const porLocal = new Map<string, number[]>();
  for (const { capitulo, ficha } of entrada.fichas) {
    const pov = norm(ficha.pov ?? "");
    if (pov) porPov.set(pov, [...(porPov.get(pov) ?? []), capitulo]);
    const local = norm(ficha.local ?? "");
    if (local) porLocal.set(local, [...(porLocal.get(local) ?? []), capitulo]);
  }
  for (const [pov, caps] of porPov) {
    const ord = [...caps].sort((a, b) => a - b);
    for (let i = 1; i < ord.length; i++) push(ord[i - 1], ord[i], "personagem", pov);
  }
  for (const [local, caps] of porLocal) {
    const ord = [...caps].sort((a, b) => a - b);
    for (let i = 1; i < ord.length; i++) push(ord[i - 1], ord[i], "localizacao", local);
  }

  // --- CRONOLOGIA: a linha do tempo é encadeada ------------------------------
  const comTempo = entrada.fichas.filter((f) => (f.ficha.tempo ?? "").trim()).map((f) => f.capitulo).sort((a, b) => a - b);
  for (let i = 1; i < comTempo.length; i++) push(comTempo[i - 1], comTempo[i], "cronologia", "linha do tempo");

  // --- MEMÓRIA DA PROSA: conhecimento, pista, objeto, causalidade ------------
  // Um capítulo posterior que MENCIONA o que outro estabeleceu depende dele.
  const canalDoTipo: Partial<Record<EntradaMemoria["tipo"], CanalDependencia>> = {
    conhecimento: "conhecimento",
    pista: "pista",
    objeto: "objeto",
    revelacao: "conhecimento",
    fato: "causalidade",
    mudanca_relacao: "personagem",
    condicao_fisica: "personagem",
    localizacao: "localizacao",
  };
  for (const m of entrada.memoria) {
    const canal = canalDoTipo[m.tipo];
    if (!canal) continue;
    const termos = norm(m.enunciado).split(" ").filter((t) => t.length > 4);
    if (termos.length < 2) continue;
    for (const { capitulo, ficha } of entrada.fichas) {
      if (capitulo <= m.capitulo) continue;
      const texto = norm(
        [ficha.objetivo, ficha.obstaculo, ficha.informacao_nova, ficha.virada, ficha.acao_fisica, ...(ficha.fatos_obrigatorios ?? [])].join(" ")
      );
      const casados = termos.filter((t) => texto.includes(t)).length;
      if (casados >= Math.max(2, Math.ceil(termos.length * 0.5))) {
        push(m.capitulo, capitulo, canal, m.enunciado.slice(0, 60));
      }
    }
  }

  return { arestas, capitulos };
}

export interface CapituloAfetado {
  capitulo: number;
  /** Por que este capítulo depende do que mudou. */
  motivos: { canal: CanalDependencia; chave: string; via: number }[];
  /** 1 = depende direto; 2 = depende de quem depende; … */
  distancia: number;
}

/**
 * Fecho transitivo a partir do capítulo alterado. É aqui que o capítulo 11
 * aparece quando o 4 muda — o que a revalidação de vizinhança nunca via.
 */
export function capitulosAfetados(
  grafo: GrafoDependencias,
  alterado: number,
  opts: { profundidadeMaxima?: number } = {}
): CapituloAfetado[] {
  const maxProf = opts.profundidadeMaxima ?? 4;
  const encontrados = new Map<number, CapituloAfetado>();
  let fronteira = [alterado];
  for (let distancia = 1; distancia <= maxProf && fronteira.length; distancia++) {
    const proxima: number[] = [];
    for (const origem of fronteira) {
      for (const a of grafo.arestas.filter((x) => x.de === origem)) {
        if (a.para === alterado) continue;
        const existente = encontrados.get(a.para);
        if (existente) {
          if (!existente.motivos.some((m) => m.canal === a.canal && m.chave === a.chave && m.via === origem)) {
            existente.motivos.push({ canal: a.canal, chave: a.chave, via: origem });
          }
          continue;
        }
        encontrados.set(a.para, {
          capitulo: a.para,
          motivos: [{ canal: a.canal, chave: a.chave, via: origem }],
          distancia,
        });
        proxima.push(a.para);
      }
    }
    fronteira = proxima;
  }
  return [...encontrados.values()].sort((a, b) => a.capitulo - b.capitulo);
}

// ---------------------------------------------------------------------------
// Política de reabertura
// ---------------------------------------------------------------------------

/** Acima disto, a cascata deixa de ser automática e vira decisão do autor. */
export const TETO_PROPAGACAO = 5;

export type AcaoRevalidacao =
  | { acao: "nenhuma"; motivo: string }
  | { acao: "reabrir"; capitulos: CapituloAfetado[]; motivo: string }
  | { acao: "decisao_humana"; capitulos: CapituloAfetado[]; motivo: string };

/**
 * Decide o que fazer com os afetados. NUNCA devolve "reescrever": reabrir é
 * invalidar a aprovação e reavaliar; a reescrita só acontece se a reavaliação
 * reprovar.
 */
export function decidirRevalidacao(
  afetados: CapituloAfetado[],
  opts: { teto?: number } = {}
): AcaoRevalidacao {
  const teto = opts.teto ?? TETO_PROPAGACAO;
  if (!afetados.length) return { acao: "nenhuma", motivo: "nenhum capítulo depende do que mudou" };
  if (afetados.length > teto) {
    return {
      acao: "decisao_humana",
      capitulos: afetados,
      motivo: `${afetados.length} capítulos afetados (teto ${teto}) — reabrir tudo automaticamente seria refazer meio livro`,
    };
  }
  return {
    acao: "reabrir",
    capitulos: afetados,
    motivo: `${afetados.length} capítulo(s) dependem do que mudou; a aprovação deles é invalidada e eles serão REAVALIADOS`,
  };
}

export interface ResultadoReavaliacao {
  capitulo: number;
  /** true = continua válido com o texto que já tem. */
  continuaValido: boolean;
  problemas: string[];
}

export interface PlanoDeAcao {
  /** Reavaliados e aprovados: NÃO são reescritos. */
  mantidos: number[];
  /** Reprovados na reavaliação: só estes vão para reescrita. */
  reescrever: number[];
}

/**
 * Traduz o resultado da reavaliação em ação. O ponto da fatia: capítulo que
 * continua válido é MANTIDO, com o texto original intacto.
 */
export function planejarAposReavaliacao(resultados: ResultadoReavaliacao[]): PlanoDeAcao {
  return {
    mantidos: resultados.filter((r) => r.continuaValido).map((r) => r.capitulo).sort((a, b) => a - b),
    reescrever: resultados.filter((r) => !r.continuaValido).map((r) => r.capitulo).sort((a, b) => a - b),
  };
}

export interface ExecutorRevalidacao {
  /** Julga o texto existente sem reescrevê-lo. */
  reavaliar: (capitulo: number) => Promise<ResultadoReavaliacao>;
  /** Só é chamado para um capítulo que a reavaliação reprovou. */
  reescrever: (capitulo: number, problemas: string[]) => Promise<ResultadoReavaliacao>;
}

export type ResultadoOndaRevalidacao =
  | {
      status: "concluida";
      resultados: ResultadoReavaliacao[];
      mantidos: number[];
      reescritos: number[];
    }
  | {
      status: "decisao_humana";
      resultados: ResultadoReavaliacao[];
      mantidos: number[];
      reescritos: number[];
      motivo: string;
    };

/**
 * Consumidor executável do plano transitivo. Primeiro reavalia todos os textos
 * como estão; só depois chama o escritor para os reprovados. O breaker é
 * conferido antes de cada reescrita e nenhuma reprovação residual vira sucesso.
 */
export async function executarOndaRevalidacao(
  afetados: CapituloAfetado[],
  executor: ExecutorRevalidacao
): Promise<ResultadoOndaRevalidacao> {
  const resultados: ResultadoReavaliacao[] = [];
  for (const afetado of afetados) {
    resultados.push(await executor.reavaliar(afetado.capitulo));
  }
  const plano = planejarAposReavaliacao(resultados);
  const reescritos: number[] = [];
  const estado: EstadoCascata = { reescritasNaOnda: 0, jaReabertos: [] };

  for (const capitulo of plano.reescrever) {
    const breaker = avaliarCascata(estado, capitulo);
    if (!breaker.continua) {
      return {
        status: "decisao_humana",
        resultados,
        mantidos: plano.mantidos,
        reescritos,
        motivo: breaker.motivo,
      };
    }
    const inicial = resultados.find((r) => r.capitulo === capitulo)!;
    const corrigido = await executor.reescrever(capitulo, inicial.problemas);
    resultados.push(corrigido);
    estado.reescritasNaOnda += 1;
    estado.jaReabertos.push(capitulo);
    if (!corrigido.continuaValido) {
      return {
        status: "decisao_humana",
        resultados,
        mantidos: plano.mantidos,
        reescritos,
        motivo:
          `capítulo ${capitulo} continuou inválido após reescrita transitiva: ` +
          (corrigido.problemas.join(" · ") || "sem diagnóstico"),
      };
    }
    reescritos.push(capitulo);
  }

  return { status: "concluida", resultados, mantidos: plano.mantidos, reescritos };
}

// ---------------------------------------------------------------------------
// Circuit breaker de cascata
// ---------------------------------------------------------------------------

export interface EstadoCascata {
  /** Reescritas já feitas nesta onda de propagação. */
  reescritasNaOnda: number;
  /** Capítulos já reabertos, para não reabrir em círculo. */
  jaReabertos: number[];
}

export const MAX_REESCRITAS_POR_ONDA = 3;

export type DecisaoCascata =
  | { continua: true }
  | { continua: false; motivo: string };

/**
 * Uma reescrita reabre dependentes, que podem ser reescritos e reabrir mais.
 * Sem freio, uma correção no capítulo 4 refaz o livro. O breaker corta e devolve
 * a decisão ao autor.
 */
export function avaliarCascata(estado: EstadoCascata, proximo: number): DecisaoCascata {
  if (estado.jaReabertos.includes(proximo)) {
    return { continua: false, motivo: `capítulo ${proximo} já foi reaberto nesta onda — cascata em ciclo` };
  }
  if (estado.reescritasNaOnda >= MAX_REESCRITAS_POR_ONDA) {
    return {
      continua: false,
      motivo: `${estado.reescritasNaOnda} reescritas nesta onda de propagação (máx ${MAX_REESCRITAS_POR_ONDA}) — a decisão passa ao autor`,
    };
  }
  return { continua: true };
}
