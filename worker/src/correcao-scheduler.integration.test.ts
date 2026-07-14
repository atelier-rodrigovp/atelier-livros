// Integração scheduler↔correção automática (SG4/SG5, cenários 3, 9, 13, 14):
// usa as funções REAIS do scheduler (escolherProximo da fila pesada, claimJobAtomic)
// e o handler REAL de bloqueio (tratarBloqueioQualidade) sobre uma tabela de jobs
// em memória que emula a atomicidade do claim_job (RPC SQL). Prova a transição
// completa sem clique: running → bloqueio → queued+retry_at → invisível ao picker
// até retry_at → reivindicado sozinho depois → running de novo.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { escolherProximo, type JobFila } from "./fila.js";
import { claimJobAtomic } from "./claim.js";
import { tratarBloqueioQualidade } from "./correcao-fluxo.js";

interface Row extends JobFila {
  status: string;
  erro?: string | null;
  locked_by?: string | null;
}

// Emula a atomicidade do claim_job (supabase/reliability.sql): só vence quem
// ainda vê status='queued' — check-and-set síncrono, um vencedor por vez.
function fakeClaimClient(tabela: Map<string, Row>) {
  return {
    rpc: async (_name: string, args: Record<string, unknown>) => {
      const row = tabela.get(String(args.p_job_id));
      if (!row || row.status !== "queued") return { data: [], error: null };
      row.status = "running";
      row.locked_by = String(args.p_worker);
      return { data: [{ ...row }], error: null };
    },
  };
}

let dir: string;
const PID = "proj-sched";

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "correcao-sched-"));
  await mkdir(path.join(dir, "manuscrito"), { recursive: true });
  await mkdir(path.join(dir, "review"), { recursive: true });
  await writeFile(path.join(dir, "manuscrito", "capitulo-38.md"), "# Cap 38\n\n" + "palavra ".repeat(40) + "\n", "utf8");
  await writeFile(path.join(dir, "review", "_revcap-38.try"), "x", "utf8");
  await writeFile(path.join(dir, "ESTADO_LIVRO.json"), JSON.stringify({ fase_atual: "ESCRITA", quality_stage: "REVISAO_CAPITULO", quality_cap: 38 }), "utf8");
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("scheduler + correção automática (funções reais)", () => {
  it("cenário 9: dois workers disputam o mesmo job → exatamente um efetiva o claim", async () => {
    const tabela = new Map<string, Row>([["j1", { id: "j1", project_id: PID, status: "queued", created_at: "2026-07-14T02:00:00Z" }]]);
    const client = fakeClaimClient(tabela);
    const [a, b] = await Promise.all([
      claimJobAtomic(client as any, "j1", "owner", "worker-A"),
      claimJobAtomic(client as any, "j1", "owner", "worker-B"),
    ]);
    expect([a, b].filter(Boolean)).toHaveLength(1);
    expect(tabela.get("j1")!.status).toBe("running");
  });

  it("cenários 3+14: bloqueio → queued+retry_at; picker REAL ignora até a janela e reivindica sozinho depois", async () => {
    const t0 = Date.parse("2026-07-14T12:00:00Z");
    const tabela = new Map<string, Row>([["j1", { id: "j1", project_id: PID, status: "running", created_at: "2026-07-14T02:00:00Z", locked_by: "w" }]]);

    // Job bloqueia por qualidade → handler REAL decide o reagendamento (sem clique).
    const r = await tratarBloqueioQualidade({
      jobId: "j1",
      jobTipo: "escrever_livro",
      projectId: PID,
      payload: {},
      stage: "REVISAO_CAPITULO",
      blockers: ["molde antitese 'nao X, mas Y' 2x"],
      mensagem: "time esgotou o orcamento",
      progressoAtual: { cap_atual: 38, total: 60 },
      agora: t0,
      dirOverride: dir,
    } as any);
    expect(r.patch.status).toBe("queued");
    const retryAt = (r.patch.progresso as any).retry_at as string;
    const row = tabela.get("j1")!;
    Object.assign(row, { status: r.patch.status, erro: r.patch.erro, progresso: { retry_at: retryAt }, locked_by: null });

    // Antes da janela: o picker pesado REAL (fila.ts) NÃO seleciona o job —
    // "aguardando nova tentativa" não consome nada em loop (SG5).
    const antes = escolherProximo([row], new Map(), new Set(), t0);
    expect(antes).toBeNull();

    // Depois da janela: o MESMO picker seleciona e o claim efetiva — retomada
    // 100% do scheduler, nenhum clique humano no caminho (cenário 19).
    const depois = escolherProximo([row], new Map(), new Set(), Date.parse(retryAt) + 1000);
    expect(depois?.id).toBe("j1");
    const claimed = await claimJobAtomic(fakeClaimClient(tabela) as any, "j1", "owner", "worker-A");
    expect(claimed?.id).toBe("j1");
    expect(tabela.get("j1")!.status).toBe("running");
  });

  it("cenário 14 (quota): job aguardando reset do Max fica invisível ao picker até o retry_at", () => {
    const t0 = Date.parse("2026-07-14T12:00:00Z");
    const row: Row = {
      id: "j2", project_id: PID, status: "queued", created_at: "2026-07-14T02:00:00Z",
      progresso: { retry_at: new Date(t0 + 35 * 60_000).toISOString() },
    };
    expect(escolherProximo([row], new Map(), new Set(), t0)).toBeNull();
    expect(escolherProximo([row], new Map(), new Set(), t0 + 36 * 60_000)?.id).toBe("j2");
  });

  it("cenário 13 (pausa por projeto): produção pausada exclui o job mesmo com retry_at vencido", () => {
    const t0 = Date.parse("2026-07-14T12:00:00Z");
    const row: Row = { id: "j3", project_id: PID, status: "queued", created_at: "2026-07-14T02:00:00Z" };
    const proj = new Map([[PID, { prioridade: 0, pausada: true }]]);
    expect(escolherProximo([row], proj, new Set(), t0)).toBeNull();
  });

  it("exclusão de concorrência: projeto já rodando nunca ganha 2º job simultâneo (SG4)", () => {
    const t0 = Date.parse("2026-07-14T12:00:00Z");
    const row: Row = { id: "j4", project_id: PID, status: "queued", created_at: "2026-07-14T02:00:00Z" };
    expect(escolherProximo([row], new Map(), new Set([PID]), t0)).toBeNull();
  });
});
