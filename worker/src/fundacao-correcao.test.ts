import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { executarLoopCorrecaoFundacao, FUNDACAO_CORRECAO_LEDGER } from "./fundacao-correcao.js";
import { decideQualityState } from "./quality-state.js";

const dirs: string[] = [];
afterEach(async () => { for (const d of dirs.splice(0)) await rm(d, { recursive: true, force: true }); });
const gate = (hash: string, blockers: string[]) => ({ state: decideQualityState({
  text: hash, detectorVersion: "test", skillVersion: "test", stage: "GATE_FUNDACAO",
  attempts: 1, maxAttempts: 1,
  blockers: blockers.map((code) => ({ code, message: code, severity: "high" as const })),
}) });

describe("loop autônomo da fundação", () => {
  it("corrige blocker mecânico e persiste ledger auditável", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "fundacao-loop-")); dirs.push(dir);
    let n = 0;
    const r = await executarLoopCorrecaoFundacao({ dir, projeto: "p1",
      avaliar: async () => n ? gate("depois", []) : gate("antes", ["AGENTE_AUSENTE:livro-editor.md"]),
      corrigir: async (e) => { expect(e).toBe("normalizadores_deterministicos"); n++; return [".claude/agents/livro-editor.md"]; },
    });
    expect(r.state.status).toBe("approved");
    expect(r.ledger.tentativas[0]).toMatchObject({ resultado: "aprovado", arquivos_alterados: [".claude/agents/livro-editor.md"] });
    expect(JSON.parse(await readFile(path.join(dir, FUNDACAO_CORRECAO_LEDGER), "utf8")).encerramento).toBe("aprovado");
  });

  it("não repete estratégia no mesmo hash e abre circuit breaker", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "fundacao-loop-")); dirs.push(dir);
    let calls = 0;
    const r = await executarLoopCorrecaoFundacao({ dir, projeto: "p2", maxTentativas: 3,
      avaliar: async () => gate("imutavel", ["PROTAGONISTA_INCOERENTE"]),
      corrigir: async () => { calls++; return []; },
    });
    expect(r.categoria).toBe("circuit_breaker");
    expect(calls).toBe(1);
    expect(r.ledger.diagnostico).toContain("Nenhum gate foi contornado");
  });

  it("pausa imediatamente apenas para blocker autoral explícito", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "fundacao-loop-")); dirs.push(dir);
    const r = await executarLoopCorrecaoFundacao({ dir, projeto: "p3",
      avaliar: async () => gate("h", ["DECISAO_AUTORAL:TITULO"]),
      corrigir: async () => { throw new Error("não deveria corrigir"); },
    });
    expect(r.categoria).toBe("decisao_autoral");
    expect(r.ledger.tentativas).toHaveLength(0);
  });
});
