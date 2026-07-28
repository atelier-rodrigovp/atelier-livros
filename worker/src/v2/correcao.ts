// Engine V2 — controlador de correção (fatia C).
//
// O que ele NÃO é: um alias do fluxo V1. A V1 corrige um runner Python opaco por
// marcadores de arquivo; a V2 tem gates nomeados, hash por versão de texto e
// papéis separados — o que permite uma escada que escolhe AÇÃO por BLOCKER, e não
// por número de tentativa.
//
// Invariantes:
// - o estado é por (projeto, capítulo, gate, hash do texto de entrada);
// - duas tentativas nunca repetem a mesma ESTRATÉGIA sobre o mesmo texto — e
//   estratégia diferente significa AÇÃO CORRETIVA diferente, não a mesma
//   instrução reescrita com outras palavras;
// - ausência de progresso (o texto não muda, ou volta a um texto já visto) para a
//   escada antes do orçamento acabar;
// - falha local de qualidade JAMAIS reinicia o livro: a retomada é no capítulo.
// - nada aqui é importado pelo caminho V1.

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import type { Gravador } from "./gravador.js";
import { escreverCapitulo, type DepsPipeline, type ResultadoCapitulo } from "./pipeline.js";
import type { ErroEstruturado, EstrategiaCorrecao, SceneSpec, TentativaCorrecao } from "./tipos.js";

/** Texto vigente do capítulo no disco (a verdade da engine), ou null. */
export function lerTextoDoDisco(dirManuscrito: string, capitulo: number): string | null {
  const caminho = path.join(dirManuscrito, `capitulo-${String(capitulo).padStart(2, "0")}.md`);
  return existsSync(caminho) ? readFileSync(caminho, "utf8") : null;
}

export type { TentativaCorrecao };

// ---------------------------------------------------------------------------
// Classificação
// ---------------------------------------------------------------------------

export type ClasseFalha = "qualidade" | "infraestrutura" | "cota" | "decisao_humana" | "configuracao";

/**
 * Classe da falha a partir do erro estruturado da engine. A classe decide QUEM
 * resolve: a escada (qualidade), o backoff (infraestrutura), o relógio (cota) ou
 * o autor (decisão humana / configuração).
 */
export function classificarFalha(erro: Pick<ErroEstruturado, "codigo" | "classe">): ClasseFalha {
  const codigo = erro.codigo.toUpperCase();
  if (/COTA|LIMITE_MAX|RATE_LIMIT|QUOTA/.test(codigo)) return "cota";
  if (/DECISAO_HUMANA|DECISAO_AUTORAL|LEGADO_SEM_EVIDENCIA/.test(codigo)) return "decisao_humana";
  switch (erro.classe) {
    case "qualidade":
      return "qualidade";
    case "tecnica":
      return "infraestrutura";
    case "configuracao":
      return "configuracao";
    default:
      return "infraestrutura";
  }
}

// ---------------------------------------------------------------------------
// Estratégias — cada uma muda a AÇÃO CORRETIVA
// ---------------------------------------------------------------------------

/**
 * Cada estratégia muda a AÇÃO CORRETIVA:
 * - `correcao_cirurgica`: correções pontuais nos trechos citados;
 * - `reescrita_orientada`: reescreve a superfície preservando eventos e fatos;
 * - `reficha`: regenera a FICHA e reescreve a partir dela (a causa é o plano);
 * - `reescrita_integral`: escreve o capítulo do zero com contexto ampliado;
 * - `julgamento_alternativo`: mesmo texto, juiz alternativo.
 */
export type Estrategia = EstrategiaCorrecao;

/** Ordem de escalada. Uma estratégia só é tentada depois das anteriores. */
export const ORDEM_ESTRATEGIAS: Estrategia[] = [
  "correcao_cirurgica",
  "reescrita_orientada",
  "reficha",
  "reescrita_integral",
  "julgamento_alternativo",
];

/**
 * O CAMINHO DE EXECUÇÃO de cada estratégia. Isto é o que separa "estratégia
 * diferente" de "mesma instrução com outras palavras": duas estratégias que
 * chamam os mesmos papéis, com as mesmas entradas, são a mesma tentativa
 * repetida — mesmo que o texto produzido tenha hash novo.
 */
export type AcaoEstrategia =
  /** Parte do texto reprovado e corrige os trechos citados. Não gera prosa nova. */
  | "corrige_texto"
  /** Parte do texto reprovado e reescreve a superfície, preservando eventos. */
  | "reescreve_superficie"
  /** Descarta a ficha, gera uma versão nova e escreve a partir dela. */
  | "regenera_ficha"
  /** Descarta o texto e escreve o capítulo do zero, com a mesma ficha. */
  | "reescreve_do_zero"
  /** NÃO chama o escritor: rejulga o mesmo texto com o juiz alternativo. */
  | "rejulga_mesmo_texto";

export const ACAO_DA_ESTRATEGIA: Record<Estrategia, AcaoEstrategia> = {
  correcao_cirurgica: "corrige_texto",
  reescrita_orientada: "reescreve_superficie",
  reficha: "regenera_ficha",
  reescrita_integral: "reescreve_do_zero",
  julgamento_alternativo: "rejulga_mesmo_texto",
};

export const HIPOTESE: Record<Estrategia, string> = {
  correcao_cirurgica: "o defeito está localizado em trechos citados e não contamina a cena",
  reescrita_orientada: "o defeito é difuso na superfície (cadência, cota, repetição de construção) e não nos eventos",
  reficha: "a prosa cumpre a ficha, mas a ficha é que não cumpre a função dramática do capítulo",
  reescrita_integral: "o capítulo inteiro parte de uma premissa errada; corrigir por partes só recicla o defeito",
  julgamento_alternativo: "o texto pode estar adequado e o veredito ser do juiz; um segundo julgamento decide",
};

/**
 * Degrau INICIAL a partir do blocker. Começar sempre no degrau 1 desperdiça
 * tentativas: uma cota de cadência estourada no capítulo inteiro nunca se resolve
 * por correção cirúrgica, e uma ficha que não cumpre a função nunca se resolve
 * mexendo na prosa.
 */
export function estrategiaInicial(blocker: string): Estrategia {
  const b = blocker.toLowerCase();
  if (/promessa|arco|marco|conformidade_ficha|funcao_dramatica|spec|virada|gancho/.test(b)) return "reficha";
  if (/repeticao|revelacao_repetida|maneirismo|cadencia|cota|sinal_|densidade/.test(b)) return "reescrita_orientada";
  if (/truncado|artefato_ausente|fora_do_schema|contradicao|conhecimento|pov/.test(b)) return "correcao_cirurgica";
  return "correcao_cirurgica";
}

// ---------------------------------------------------------------------------
// Ledger de tentativas
// ---------------------------------------------------------------------------

export const ORCAMENTO_TENTATIVAS = 5;

/** Estratégias já gastas sobre ESTE texto (mesmo hash de entrada). */
export function estrategiasTentadas(historico: TentativaCorrecao[], hashEntrada: string): Set<Estrategia> {
  return new Set(historico.filter((t) => t.hash_entrada === hashEntrada).map((t) => t.estrategia));
}

/**
 * Ausência de progresso — duas leituras, ambas independentes do orçamento:
 * 1. duas tentativas seguidas em que o texto NÃO mudou (saída = entrada);
 * 2. o texto voltou a um hash já visto antes (a escada está em ciclo).
 */
export function semProgresso(historico: TentativaCorrecao[]): { parou: boolean; motivo?: string } {
  const ultimas = historico.slice(-2);
  if (
    ultimas.length === 2 &&
    ultimas.every((t) => t.hash_saida !== null && t.hash_saida === t.hash_entrada)
  ) {
    return { parou: true, motivo: "duas tentativas seguidas não alteraram o texto" };
  }
  const vistos = new Set<string>();
  for (const t of historico) {
    if (t.hash_saida === null) continue;
    if (vistos.has(t.hash_saida)) {
      return { parou: true, motivo: `o texto voltou a uma versão já tentada (${t.hash_saida.slice(0, 12)})` };
    }
    vistos.add(t.hash_saida);
  }
  return { parou: false };
}

// ---------------------------------------------------------------------------
// Decisão
// ---------------------------------------------------------------------------

export type AcaoCorrecao =
  | "retentar"
  | "circuit_breaker"
  | "decisao_humana"
  | "aguardar_cota"
  | "retry_infraestrutura";

export interface DecisaoCorrecao {
  acao: AcaoCorrecao;
  /** Presente apenas em `retentar`. */
  estrategia?: Estrategia;
  hipotese?: string;
  motivo: string;
  /** Número desta tentativa para o capítulo (1-based). */
  tentativa: number;
  /** Capítulo em que a execução deve retomar — nunca o começo do livro. */
  retomarEm: number;
}

export interface EntradaDecisao {
  erro: Pick<ErroEstruturado, "codigo" | "classe">;
  capitulo: number;
  /** Blockers nomeados pelos gates/parecer, em ordem de gravidade. */
  blockers: string[];
  /** Hash do texto que falhou (versão do capítulo). */
  hashEntrada: string;
  /** Tentativas anteriores DESTE capítulo (todas as versões de texto). */
  historico: TentativaCorrecao[];
  orcamento?: number;
}

/**
 * Próximo passo da escada. Função pura: mesma entrada, mesma decisão — o que
 * torna a política auditável e testável sem provedor, banco ou disco.
 */
export function decidirCorrecao(entrada: EntradaDecisao): DecisaoCorrecao {
  const orcamento = entrada.orcamento ?? ORCAMENTO_TENTATIVAS;
  const tentativa = entrada.historico.length + 1;
  const base = { tentativa, retomarEm: entrada.capitulo };

  const classe = classificarFalha(entrada.erro);
  if (classe === "cota") {
    return { ...base, acao: "aguardar_cota", motivo: "cota do plano atingida — pausa limpa, retomada no reset (não conta tentativa)" };
  }
  if (classe === "infraestrutura") {
    return { ...base, acao: "retry_infraestrutura", motivo: `falha de infraestrutura (${entrada.erro.codigo}) — backoff, sem consumir a escada de qualidade` };
  }
  if (classe === "decisao_humana" || classe === "configuracao") {
    return { ...base, acao: "decisao_humana", motivo: `${entrada.erro.codigo} exige decisão do autor — a escada não decide por ele` };
  }

  const progresso = semProgresso(entrada.historico);
  if (progresso.parou) {
    return { ...base, acao: "circuit_breaker", motivo: `sem progresso: ${progresso.motivo}` };
  }
  if (entrada.historico.length >= orcamento) {
    return { ...base, acao: "circuit_breaker", motivo: `orçamento de ${orcamento} tentativas esgotado no capítulo ${entrada.capitulo}` };
  }

  const blocker = entrada.blockers[0] ?? entrada.erro.codigo;
  const inicial = estrategiaInicial(blocker);
  const gastas = estrategiasTentadas(entrada.historico, entrada.hashEntrada);
  // Nunca repetir estratégia sobre o mesmo texto; escala a partir do degrau
  // inicial do blocker e dá a volta para cobrir os degraus anteriores.
  const daInicial = ORDEM_ESTRATEGIAS.slice(ORDEM_ESTRATEGIAS.indexOf(inicial));
  const antesDaInicial = ORDEM_ESTRATEGIAS.slice(0, ORDEM_ESTRATEGIAS.indexOf(inicial));
  const proxima = [...daInicial, ...antesDaInicial].find((e) => !gastas.has(e));
  if (!proxima) {
    return { ...base, acao: "circuit_breaker", motivo: `todas as estratégias já foram tentadas sobre esta versão do capítulo ${entrada.capitulo}` };
  }

  return {
    ...base,
    acao: "retentar",
    estrategia: proxima,
    hipotese: HIPOTESE[proxima],
    motivo: `blocker "${blocker}" → estratégia ${proxima} (tentativa ${tentativa}/${orcamento})`,
  };
}

/** Backoff da retomada automática (mesma curva do V1: 90s × 2^n, teto 30min). */
export function proximaTentativaEm(tentativa: number, agoraMs: number): string {
  const delay = Math.min(90_000 * Math.pow(2, Math.max(0, tentativa - 1)), 30 * 60_000);
  return new Date(agoraMs + delay).toISOString();
}

// ---------------------------------------------------------------------------
// Execução da escada (o único lugar que a aplica em produção)
// ---------------------------------------------------------------------------

/** Blockers nomeados de um capítulo reprovado, em ordem de gravidade. */
export function blockersDoResultado(r: ResultadoCapitulo): string[] {
  return [...r.gatesFalhos.map((g) => `${g.gate}: ${g.evidencia ?? ""}`), ...r.problemas].filter(Boolean);
}

export interface ContextoTentativa {
  /** Texto reprovado da tentativa anterior (do disco). */
  textoAnterior: string | null;
  /** Ficha vigente do capítulo. */
  fichaVigente: SceneSpec | null;
  blockers: string[];
}

/**
 * Traduz a estratégia no CAMINHO DE EXECUÇÃO concreto. É aqui que as estratégias
 * deixam de ser rótulos: cada uma monta um conjunto DIFERENTE de opções para
 * `escreverCapitulo`, chamando papéis diferentes com entradas diferentes.
 *
 * Antes desta função, `correcao_cirurgica` e `reescrita_integral` produziam
 * exatamente a mesma execução (gerar ficha → contextualizar → escrever do zero),
 * e `julgamento_alternativo` chamava o escritor sem necessidade nenhuma.
 */
export function opcoesPorEstrategia(
  estrategia: Estrategia,
  ctx: ContextoTentativa,
  base: Parameters<typeof escreverCapitulo>[2] = {}
): Parameters<typeof escreverCapitulo>[2] {
  const correcoes = ctx.blockers.map((b) => ({
    local: b.split(":")[0] ?? "capítulo inteiro",
    problema: b,
    instrucao: "elimine a causa nomeada, preservando o que já estava correto",
  }));
  // Sem texto ou sem ficha no disco não há de onde partir: qualquer estratégia
  // baseada no anterior degrada para escrever do zero (honesto e explícito).
  const temBase = Boolean(ctx.textoAnterior && ctx.fichaVigente);

  switch (ACAO_DA_ESTRATEGIA[estrategia]) {
    case "corrige_texto":
      return temBase
        ? {
            ...base,
            fichaExistente: ctx.fichaVigente!,
            textoBase: ctx.textoAnterior!,
            reescritaDirigida: { correcoes },
          }
        : { ...base };
    case "reescreve_superficie":
      return temBase
        ? {
            ...base,
            fichaExistente: ctx.fichaVigente!,
            textoBase: ctx.textoAnterior!,
            reescritaDirigida: {
              correcoes: [
                ...correcoes,
                {
                  local: "capítulo inteiro",
                  problema: "o defeito é difuso na superfície do capítulo",
                  instrucao:
                    "reescreva a superfície preservando eventos, fatos, diálogo e estrutura — mude a construção das frases, não o que acontece",
                },
              ],
            },
          }
        : { ...base };
    case "regenera_ficha":
      // Sem fichaExistente: o arquiteto de cena produz uma VERSÃO NOVA da ficha,
      // e o capítulo é escrito a partir dela. Sem textoBase: a prosa velha morre.
      return { ...base, fichaExistente: undefined, textoBase: undefined, reescritaDirigida: undefined };
    case "reescreve_do_zero":
      // Mantém a ficha (o plano não é a causa) e joga a prosa fora.
      return {
        ...base,
        ...(ctx.fichaVigente ? { fichaExistente: ctx.fichaVigente } : {}),
        textoBase: undefined,
        reescritaDirigida: undefined,
      };
    case "rejulga_mesmo_texto":
      // NÃO chama o escritor: mesmo texto, mesma ficha, juiz alternativo (o
      // pipeline troca o modelo de julgamento quando vê esta estratégia).
      return temBase
        ? { ...base, fichaExistente: ctx.fichaVigente!, textoBase: ctx.textoAnterior!, reescritaDirigida: undefined }
        : { ...base };
  }
}

export interface EntradaEscada {
  deps: DepsPipeline;
  gravador: Gravador;
  capitulo: number;
  opts?: Parameters<typeof escreverCapitulo>[2];
  onProgresso?: (p: Record<string, unknown>) => Promise<void>;
  orcamento?: number;
  agoraMs?: () => number;
}

/**
 * Escreve o capítulo e, se ele for reprovado, sobe a escada de correção com uma
 * ESTRATÉGIA DIFERENTE a cada tentativa, persistindo cada uma antes de tentar a
 * seguinte (o ledger sobrevive à queda do worker).
 *
 * O que esta função NUNCA faz: reiniciar o livro, repetir estratégia sobre o
 * mesmo texto, ou insistir depois que o texto parou de mudar.
 */
export async function escreverCapituloComEscada(entrada: EntradaEscada): Promise<ResultadoCapitulo> {
  const { deps, gravador, capitulo } = entrada;
  const orcamento = entrada.orcamento ?? ORCAMENTO_TENTATIVAS;
  const agora = entrada.agoraMs ?? (() => Date.now());

  const estadoInicial = await gravador.carregarEstado();
  let historico = [...(estadoInicial.doc.correcoes?.[String(capitulo)] ?? [])];

  let resultado = await escreverCapitulo(deps, capitulo, entrada.opts);

  for (;;) {
    if (resultado.status === "aprovado" || resultado.status === "aprovado_com_excecao") return resultado;

    const blockers = blockersDoResultado(resultado);
    const hashEntrada = resultado.textHash ?? "sem-texto";
    const decisao = decidirCorrecao({
      erro: { codigo: blockers[0] ?? "CAPITULO_BLOQUEADO", classe: "qualidade" },
      capitulo,
      blockers,
      hashEntrada,
      historico,
      orcamento,
    });

    if (decisao.acao !== "retentar") {
      if (decisao.acao === "circuit_breaker") {
        await gravador.registrarCircuitBreaker(capitulo, decisao.motivo, historico.length);
      }
      await entrada.onProgresso?.({
        correcao_acao: decisao.acao,
        correcao_motivo: decisao.motivo,
        correcao_tentativas: historico.length,
        quality_cap: capitulo,
      });
      return resultado;
    }

    const tentativa: TentativaCorrecao = {
      capitulo,
      gate: blockers[0] ?? "desconhecido",
      estrategia: decisao.estrategia!,
      hipotese: decisao.hipotese!,
      instrucao: decisao.motivo,
      hash_entrada: hashEntrada,
      hash_saida: null,
      resultado: "persistiu",
      criado_em: new Date(agora()).toISOString(),
    };
    await gravador.registrarTentativaCorrecao(tentativa);
    historico = [...historico, tentativa];
    await entrada.onProgresso?.({
      correcao_acao: "retentar",
      correcao_estrategia: decisao.estrategia,
      correcao_tentativa: decisao.tentativa,
      correcao_motivo: decisao.motivo,
      quality_cap: capitulo,
    });

    const anterior = resultado;
    // O caminho de execução muda por estratégia: corrigir o texto, reescrever a
    // superfície, regenerar a ficha, escrever do zero ou só rejulgar.
    const ctx: ContextoTentativa = {
      textoAnterior: lerTextoDoDisco(deps.dirManuscrito, capitulo),
      fichaVigente: await deps.persistencia.lerFichaMaisRecente(deps.projectId, capitulo),
      blockers,
    };
    resultado = await escreverCapitulo(deps, capitulo, {
      ...opcoesPorEstrategia(decisao.estrategia!, ctx, entrada.opts),
      correcaoDirigida: {
        estrategia: decisao.estrategia!,
        blockers,
        hipotese: decisao.hipotese!,
        tentativa: decisao.tentativa,
      },
    });
    // Fecha a tentativa com o hash produzido: é o que `semProgresso` lê para
    // decidir se a escada está andando ou girando em falso.
    const fechada: TentativaCorrecao = {
      ...tentativa,
      hash_saida: resultado.textHash ?? null,
      resultado:
        resultado.status === "aprovado" || resultado.status === "aprovado_com_excecao"
          ? "resolvido"
          : blockersDoResultado(resultado).length > blockersDoResultado(anterior).length
            ? "piorou"
            : "persistiu",
    };
    historico[historico.length - 1] = fechada;
    await gravador.registrarTentativaCorrecao(fechada);
  }
}
