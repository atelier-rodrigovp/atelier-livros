// Reconciliação de runs órfãos — achado A1.
//
// `engine_runs` acumula linhas presas em `running`: 11 hoje, em 6 papéis, a mais
// antiga com 196 horas. Elas nunca terminaram e nunca foram marcadas como falha,
// então contaminam qualquer contagem de duração ou de taxa de sucesso.
//
// FRONTEIRA DO HISTÓRICO IMUTÁVEL, confirmada contra o banco: o trigger
// `engine_runs_congelar` levanta exceção quando `old.status in ('ok','falha',
// 'cancelado')`. Run em `running` transiciona; run concluído, não. Este módulo
// só propõe transição para os primeiros — e, se topar com um concluído, REPORTA
// em vez de tentar forçar (o banco recusaria, e forçar seria pedir para o
// histórico ceder).
//
// Lógica pura de propósito: o caso negativo precisa ser testável sem banco.

export interface RunEmAberto {
  id: string;
  papel: string;
  status: string;
  started_at: string;
}

export type DecisaoReconciliacao =
  | { acao: "encerrar"; id: string; papel: string; idadeMs: number; motivo: string }
  | { acao: "manter"; id: string; papel: string; idadeMs: number; motivo: string }
  | { acao: "recusar"; id: string; papel: string; motivo: string };

export interface OpcoesReconciliacao {
  agora: number;
  /** Timeout do papel; a folga evita encerrar run que ainda pode terminar. */
  timeoutPorPapel: Record<string, number>;
  /** Multiplicador sobre o timeout antes de considerar órfão. */
  folga?: number;
}

const TIMEOUT_PADRAO_MS = 600_000;

/**
 * Decide, run a run, sem tocar em nada. Um run só é órfão quando passou do
 * timeout do próprio papel com folga — não basta estar velho, porque `running`
 * legítimo existe enquanto o worker trabalha.
 */
export function decidirReconciliacao(runs: RunEmAberto[], opts: OpcoesReconciliacao): DecisaoReconciliacao[] {
  const folga = opts.folga ?? 2;
  return runs.map((r) => {
    // O trigger do banco recusaria; recusar aqui deixa o motivo legível em vez
    // de virar exceção de Postgres no meio de um laço.
    if (r.status !== "running") {
      return {
        acao: "recusar" as const,
        id: r.id,
        papel: r.papel,
        motivo: `run em status "${r.status}" é histórico congelado — o reconciliador não reescreve run concluído`,
      };
    }
    const idadeMs = opts.agora - Date.parse(r.started_at);
    const limite = (opts.timeoutPorPapel[r.papel] ?? TIMEOUT_PADRAO_MS) * folga;
    if (!Number.isFinite(idadeMs) || idadeMs < limite) {
      return {
        acao: "manter" as const,
        id: r.id,
        papel: r.papel,
        idadeMs,
        motivo: `há ${Math.round(idadeMs / 1000)}s; ainda dentro de ${Math.round(limite / 1000)}s (timeout do papel × ${folga})`,
      };
    }
    return {
      acao: "encerrar" as const,
      id: r.id,
      papel: r.papel,
      idadeMs,
      motivo: `orfao_reconciliado: preso em running há ${Math.round(idadeMs / 3_600_000)}h, acima de ${Math.round(limite / 1000)}s`,
    };
  });
}

/** O erro que o gravador registra no run encerrado. Vocabulário fixo. */
export function erroDeOrfao(d: Extract<DecisaoReconciliacao, { acao: "encerrar" }>) {
  return {
    codigo: "ORFAO_RECONCILIADO",
    classe: "infra" as const,
    mensagem:
      `run encerrado pelo reconciliador: ${d.motivo}. ` +
      `A duração desta linha NÃO mede trabalho — o processo nunca reportou fim.`,
  };
}
