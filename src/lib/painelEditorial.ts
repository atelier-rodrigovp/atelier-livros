// Inteligência editorial da tela do projeto (fatia O).
//
// A tela mostrava fase, capítulo atual e blockers em texto corrido. Tudo o que a
// engine passou a saber — promessas abertas, pistas sem payoff, ledger, marcos
// pendentes, estratégias de correção já tentadas, capítulos afetados por
// reescrita, artefatos invalidados — não chegava ao autor.
//
// Este módulo transforma o estado canônico em painéis. É lógica pura: a tela
// renderiza o que sai daqui, e o que sai daqui é testável sem navegador.

export interface EstadoV2Painel {
  fase?: string;
  capitulos?: Record<string, { status?: string; text_hash?: string }>;
  ledger_revelacoes?: { id: string; capitulo: number; enunciado: string }[];
  memoria_prosa?: {
    id: string;
    tipo: string;
    capitulo: number;
    enunciado: string;
    trecho: string;
    origem: string;
    estado: string;
    paga_em?: number;
  }[];
  conflitos_ficha_prosa?: { capitulo: number; campo: string; valorFicha: string; valorProsa: string }[];
  correcoes?: Record<string, { estrategia: string; hipotese: string; resultado: string; gate: string; criado_em: string }[]>;
  circuit_breaker?: { capitulo: number; motivo: string; tentativas: number }[];
  revalidacoes?: { origem: number; acao: string; afetados: { capitulo: number; motivos: string[] }[] }[];
  invalidacao?: { artefatos: string[]; motivo: string };
  bloqueios?: { codigo: string; alvo: string; detalhe: string }[];
  premissas?: { total_capitulos?: number };
  canario_snapshot?: { hash: string; aprovado_por: string; aprovado_em: string };
}

// ---------------------------------------------------------------------------
// Promessas e pistas
// ---------------------------------------------------------------------------

export interface ItemPromessa {
  id: string;
  enunciado: string;
  origem: "fundacao" | "ficha" | "prosa";
  plantada_em: number;
  estado: "aberta" | "reforcada" | "paga";
  paga_em?: number;
  /** Trecho da prosa que a sustenta, quando veio da página. */
  trecho?: string;
}

export function promessasEPistas(estado: EstadoV2Painel): ItemPromessa[] {
  const out: ItemPromessa[] = [];
  for (const m of estado.memoria_prosa ?? []) {
    if (m.tipo !== "promessa" && m.tipo !== "pista") continue;
    out.push({
      id: m.id,
      enunciado: m.enunciado,
      origem: m.origem === "ficha" ? "ficha" : "prosa",
      plantada_em: m.capitulo,
      estado: m.estado === "paga" ? "paga" : "aberta",
      paga_em: m.paga_em,
      trecho: m.trecho,
    });
  }
  return out.sort((a, b) => a.plantada_em - b.plantada_em);
}

export function promessasAbertas(estado: EstadoV2Painel): ItemPromessa[] {
  return promessasEPistas(estado).filter((p) => p.estado !== "paga");
}

// ---------------------------------------------------------------------------
// Correções tentadas e não-progresso
// ---------------------------------------------------------------------------

export interface PainelCorrecao {
  capitulo: number;
  tentativas: { estrategia: string; hipotese: string; resultado: string; gate: string }[];
  /** Estratégias que ainda não foram tentadas neste capítulo. */
  naoTentadas: string[];
  semProgresso: boolean;
  circuitBreaker?: { motivo: string; tentativas: number };
}

export const TODAS_ESTRATEGIAS = [
  "correcao_cirurgica",
  "reescrita_orientada",
  "reficha",
  "reescrita_integral",
  "julgamento_alternativo",
];

export function painelDeCorrecoes(estado: EstadoV2Painel): PainelCorrecao[] {
  const out: PainelCorrecao[] = [];
  for (const [chave, tentativas] of Object.entries(estado.correcoes ?? {})) {
    const capitulo = Number(chave);
    const usadas = new Set(tentativas.map((t) => t.estrategia));
    const breaker = (estado.circuit_breaker ?? []).find((c) => c.capitulo === capitulo);
    out.push({
      capitulo,
      tentativas: tentativas.map((t) => ({
        estrategia: t.estrategia,
        hipotese: t.hipotese,
        resultado: t.resultado,
        gate: t.gate,
      })),
      naoTentadas: TODAS_ESTRATEGIAS.filter((e) => !usadas.has(e)),
      semProgresso: tentativas.length >= 2 && tentativas.slice(-2).every((t) => t.resultado === "persistiu"),
      ...(breaker ? { circuitBreaker: { motivo: breaker.motivo, tentativas: breaker.tentativas } } : {}),
    });
  }
  return out.sort((a, b) => a.capitulo - b.capitulo);
}

// ---------------------------------------------------------------------------
// Motivo estruturado do bloqueio
// ---------------------------------------------------------------------------

export interface MotivoBloqueio {
  codigo: string;
  alvo: string;
  detalhe: string;
  /** Ação que o autor pode tomar a partir daqui. */
  acao?: AcaoDirigida;
}

export type AcaoDirigida =
  | "aceitar_excecao"
  | "reconstruir_ficha"
  | "reescrever_capitulo"
  | "reconstruir_fundacao"
  | "revisar_briefing"
  | "autorizar_projeto";

const ACAO_POR_CODIGO: { padrao: RegExp; acao: AcaoDirigida }[] = [
  { padrao: /BRIEFING/i, acao: "revisar_briefing" },
  { padrao: /PROJETO_V2_NAO_AUTORIZADO|CANARIO_NAO_COBRE/i, acao: "autorizar_projeto" },
  { padrao: /FUNDACAO|PREMISSA_ALTERADA/i, acao: "reconstruir_fundacao" },
  { padrao: /ficha|spec|conformidade|arco/i, acao: "reconstruir_ficha" },
  { padrao: /sinal|cota|maneirismo|repeticao/i, acao: "aceitar_excecao" },
  { padrao: /QUALIDADE|CAPITULO|GATE_/i, acao: "reescrever_capitulo" },
];

export function acaoParaBloqueio(codigo: string, detalhe = ""): AcaoDirigida | undefined {
  const alvo = `${codigo} ${detalhe}`;
  return ACAO_POR_CODIGO.find((r) => r.padrao.test(alvo))?.acao;
}

export function motivosDeBloqueio(estado: EstadoV2Painel): MotivoBloqueio[] {
  return (estado.bloqueios ?? []).map((b) => ({
    codigo: b.codigo,
    alvo: b.alvo,
    detalhe: b.detalhe,
    acao: acaoParaBloqueio(b.codigo, b.detalhe),
  }));
}

// ---------------------------------------------------------------------------
// Reescrita e propagação
// ---------------------------------------------------------------------------

export interface PainelReescrita {
  origem: number;
  acao: string;
  afetados: { capitulo: number; motivos: string[] }[];
  /** Texto honesto sobre o que acontece com os afetados. */
  explicacao: string;
}

/**
 * A interface prometia que capítulo aprovado nunca é reescrito. O Meta9 pode
 * reescrevê-lo. Aqui a explicação diz o que de fato acontece: os dependentes são
 * REABERTOS e REAVALIADOS; só o que reprovar é reescrito.
 */
export function painelDeReescritas(estado: EstadoV2Painel): PainelReescrita[] {
  return (estado.revalidacoes ?? []).map((r) => ({
    origem: r.origem,
    acao: r.acao,
    afetados: r.afetados,
    explicacao:
      r.acao === "decisao_humana"
        ? `A reescrita do capítulo ${r.origem} afeta ${r.afetados.length} capítulos — acima do teto de propagação. Nada foi alterado: a decisão é sua.`
        : r.acao === "reabrir"
          ? `A reescrita do capítulo ${r.origem} reabriu ${r.afetados.length} capítulo(s) dependente(s). Reabrir significa REAVALIAR: só é reescrito o que a reavaliação reprovar.`
          : `A reescrita do capítulo ${r.origem} não afetou nenhum outro capítulo.`,
  }));
}

/** Texto da política de reescrita — o que a tela pode afirmar sem mentir. */
export const POLITICA_REESCRITA =
  "Capítulos aprovados podem ser reescritos pela avaliação de livro (meta-nota) quando a nota exigir. " +
  "Toda reescrita reabre os capítulos que dependem dela, e os dependentes são REAVALIADOS — só é reescrito o que reprovar. " +
  "A melhor versão aprovada é preservada e restaurada se a tentativa não melhorar o livro.";

// ---------------------------------------------------------------------------
// Painel consolidado
// ---------------------------------------------------------------------------

export interface PainelEditorial {
  promessasAbertas: ItemPromessa[];
  promessasPagas: ItemPromessa[];
  ledger: { id: string; capitulo: number; enunciado: string }[];
  conflitos: { capitulo: number; campo: string; valorFicha: string; valorProsa: string }[];
  correcoes: PainelCorrecao[];
  bloqueios: MotivoBloqueio[];
  reescritas: PainelReescrita[];
  invalidacao?: { artefatos: string[]; motivo: string };
  canario?: { hash: string; aprovado_por: string; aprovado_em: string };
  /** Ações oferecidas ao autor, derivadas do que está bloqueado. */
  acoes: AcaoDirigida[];
}

export function montarPainel(estado: EstadoV2Painel | null | undefined): PainelEditorial {
  const e = estado ?? {};
  const todas = promessasEPistas(e);
  const bloqueios = motivosDeBloqueio(e);
  const acoes = [...new Set(bloqueios.map((b) => b.acao).filter((a): a is AcaoDirigida => Boolean(a)))];
  if (e.invalidacao && !acoes.includes("reconstruir_fundacao")) acoes.push("reconstruir_fundacao");
  return {
    promessasAbertas: todas.filter((p) => p.estado !== "paga"),
    promessasPagas: todas.filter((p) => p.estado === "paga"),
    ledger: e.ledger_revelacoes ?? [],
    conflitos: e.conflitos_ficha_prosa ?? [],
    correcoes: painelDeCorrecoes(e),
    bloqueios,
    reescritas: painelDeReescritas(e),
    ...(e.invalidacao ? { invalidacao: e.invalidacao } : {}),
    ...(e.canario_snapshot ? { canario: e.canario_snapshot } : {}),
    acoes,
  };
}

/** O painel tem algo a mostrar? (evita render de caixa vazia) */
export function painelTemConteudo(p: PainelEditorial): boolean {
  return Boolean(
    p.promessasAbertas.length ||
      p.promessasPagas.length ||
      p.ledger.length ||
      p.conflitos.length ||
      p.correcoes.length ||
      p.bloqueios.length ||
      p.reescritas.length ||
      p.invalidacao ||
      p.canario
  );
}
