// Reconciliação de órfãos — achado A1.
//
// O caso que importa aqui é o NEGATIVO: o reconciliador não pode tentar
// reescrever run concluído. Já está provado contra o banco que o trigger
// `engine_runs_congelar` recusa `update` quando o status anterior é ok, falha ou
// cancelado. Forçar seria pedir para o histórico ceder.

import { describe, expect, it } from "vitest";
import { decidirReconciliacao, erroDeOrfao, type RunEmAberto } from "./reconciliar-runs.js";
import { EXECUCAO_POR_PAPEL } from "./tipos.js";

const AGORA = Date.parse("2026-07-29T12:00:00.000Z");
const TIMEOUTS = Object.fromEntries(
  Object.entries(EXECUCAO_POR_PAPEL).map(([p, e]) => [p, e.timeoutMs])
) as Record<string, number>;

const run = (over: Partial<RunEmAberto> = {}): RunEmAberto => ({
  id: "r1",
  papel: "arquiteto_enredo",
  status: "running",
  started_at: "2026-07-27T15:37:50.936Z",
  ...over,
});

const decidir = (runs: RunEmAberto[], folga = 2) =>
  decidirReconciliacao(runs, { agora: AGORA, timeoutPorPapel: TIMEOUTS, folga });

describe("órfão de verdade é encerrado", () => {
  it("run preso há 44h passa muito do timeout do papel", () => {
    const [d] = decidir([run()]);
    expect(d.acao).toBe("encerrar");
    expect(d.motivo).toContain("orfao_reconciliado");
  });

  it("o erro registrado diz que a duração NÃO mede trabalho", () => {
    const [d] = decidir([run()]);
    const erro = erroDeOrfao(d as never);
    expect(erro.codigo).toBe("ORFAO_RECONCILIADO");
    expect(erro.mensagem).toMatch(/NÃO mede trabalho/);
  });

  it("cada papel usa o próprio timeout, não um número global", () => {
    // contextualizador (120 s) vira órfão muito antes de arquiteto_enredo (1200 s).
    const inicio = new Date(AGORA - 500_000).toISOString();
    const [ctx] = decidir([run({ papel: "contextualizador", started_at: inicio })]);
    const [arq] = decidir([run({ papel: "arquiteto_enredo", started_at: inicio })]);
    expect(ctx.acao).toBe("encerrar");
    expect(arq.acao).toBe("manter");
  });
});

describe("run que ainda pode terminar é MANTIDO", () => {
  it("dentro do timeout × folga, não se toca", () => {
    const [d] = decidir([run({ started_at: new Date(AGORA - 60_000).toISOString() })]);
    expect(d.acao).toBe("manter");
  });

  it("exatamente no limite ainda é mantido (encerrar exige ultrapassar)", () => {
    const limite = EXECUCAO_POR_PAPEL.arquiteto_enredo.timeoutMs * 2;
    const [d] = decidir([run({ started_at: new Date(AGORA - limite + 1).toISOString() })]);
    expect(d.acao).toBe("manter");
  });

  it("data ilegível não vira encerramento por acidente", () => {
    const [d] = decidir([run({ started_at: "não é data" })]);
    expect(d.acao).toBe("manter");
  });
});

describe("histórico congelado: RECUSA, não força", () => {
  it.each(["ok", "falha", "cancelado"])("run em %s é recusado", (status) => {
    const [d] = decidir([run({ status })]);
    expect(d.acao).toBe("recusar");
    expect(d.motivo).toMatch(/não reescreve run concluído/);
  });

  it("a recusa nomeia o status encontrado, para o operador entender", () => {
    const [d] = decidir([run({ status: "ok" })]);
    expect(d.motivo).toContain('"ok"');
  });

  it("nenhum run concluído aparece como encerrável, em lote misto", () => {
    const ds = decidir([run({ id: "a" }), run({ id: "b", status: "ok" }), run({ id: "c", status: "falha" })]);
    expect(ds.filter((d) => d.acao === "encerrar").map((d) => d.id)).toEqual(["a"]);
    expect(ds.filter((d) => d.acao === "recusar")).toHaveLength(2);
  });
});
