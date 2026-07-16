import { describe, expect, it } from "vitest";
import {
  planLegacyReconciliation,
  reconciliationMode,
  reconciliationPatch,
  finalizeReconciliationData,
  shouldGenerateFoundation,
  targetFromState,
  type ArtifactAssessment,
  type LegacyJob,
  type LegacyProject,
} from "./reconciliacao-legada.js";

const project: LegacyProject = { id: "p1", briefing: {} };
const assessment: ArtifactAssessment = {
  result: "approved", hash: "hash-v1", target: 49,
  reason: "current_detector_approved", blockers: ["fio C ausente"],
};
const paused = (patch: Partial<LegacyJob> = {}): LegacyJob => ({
  id: "j1", tipo: "escrever_livro", project_id: "p1", status: "paused",
  payload: {}, created_at: "2026-07-16T10:00:00Z", updated_at: "2026-07-16T10:01:00Z",
  erro: "SPEC_CAPITULO", progresso: { quality_stage: "SPEC_CAPITULO", quality_status: "blocked_quality", quality_cap: 49, quality_blockers: ["fio C ausente"] },
  ...patch,
});

function decide(job = paused(), opts: { jobs?: LegacyJob[]; projects?: LegacyProject[]; enabled?: boolean; assessment?: ArtifactAssessment } = {}) {
  return planLegacyReconciliation({
    jobs: opts.jobs ?? [job], projects: opts.projects ?? [project],
    assessments: new Map([[job.id, opts.assessment ?? assessment]]),
    detectorVersion: "v2", globalEnabled: opts.enabled ?? true,
  }).find((d) => d.jobId === job.id)!;
}

describe("reconciliação legada", () => {
  it("nasce em audit e só aplica por configuração explícita", () => {
    expect(reconciliationMode(undefined)).toBe("audit");
    expect(reconciliationMode("apply")).toBe("apply");
    expect(reconciliationMode("qualquer-coisa")).toBe("audit");
  });

  it("quality_cap vence cap_atual e ESTADO_LIVRO", () => {
    expect(targetFromState(paused({ progresso: { quality_stage: "SPEC_CAPITULO", quality_cap: 49, cap_atual: 48 } }), { quality_cap: 50 })).toBe(49);
  });

  it("retoma spec aprovada pelo detector atual sem tentativa editorial", () => {
    const d = decide();
    expect(d.eligible).toBe(true);
    expect(d.plan?.strategy).toBe("deterministic_revalidation");
    expect(reconciliationPatch(d.plan!, "w1").progresso.reconciliacao_legada.tentativa).toBe(0);
  });

  it("blocker real recuperável entra no orçamento editorial limitado", () => {
    const d = decide(paused(), { assessment: { ...assessment, result: "recoverable", reason: "spec ainda reprova" } });
    expect(d.eligible).toBe(true);
    expect(d.plan?.strategy).toBe("bounded_editorial_recovery");
  });

  it("não retoma decisão autoral nem circuit breaker ainda reprovado", () => {
    expect(decide(paused({ erro: "DECISAO_AUTORAL pendente" })).reason).toBe("author_decision_pending");
    const breaker = paused({ progresso: { quality_stage: "SPEC_CAPITULO", quality_categoria: "circuit_breaker" } });
    expect(decide(breaker, { assessment: { ...assessment, result: "blocked" } }).reason).toBe("quality_circuit_breaker_still_failing");
  });

  it("respeita pausa global, pausa do projeto e job equivalente ativo", () => {
    expect(decide(paused(), { enabled: false }).reason).toBe("worker_global_disabled");
    expect(decide(paused(), { projects: [{ id: "p1", briefing: { producao_pausada: true } }] }).reason).toBe("project_manually_paused");
    const active = paused({ id: "j2", status: "running", created_at: "2026-07-16T11:00:00Z" });
    expect(decide(paused(), { jobs: [paused(), active] }).reason).toBe("equivalent_job_active");
  });

  it("ignora job histórico e divergência disco/Storage", () => {
    const newer = paused({ id: "j2", created_at: "2026-07-16T11:00:00Z" });
    expect(decide(paused(), { jobs: [paused(), newer] }).reason).toBe("historical_job");
    expect(decide(paused(), { assessment: { ...assessment, result: "inconsistent" } }).reason).toBe("storage_disk_inconsistent");
  });

  it("restart com mesmo detector, hash e blockers é no-op", () => {
    const job = paused({ progresso: {
      quality_stage: "SPEC_CAPITULO", quality_blockers: ["fio C ausente"],
      reconciliacao_legada: { detector_version: "v2", hash_reconciliado: "hash-v1", blockers_signature: "fio C ausente" },
    } });
    expect(decide(job).reason).toBe("already_reconciled_same_evidence");
  });

  it("dois workers só vencem uma atualização condicional", async () => {
    const plan = decide().plan!;
    let status = "paused";
    const atomicClaim = async () => {
      await Promise.resolve();
      if (status !== "paused") return false;
      status = reconciliationPatch(plan, "worker").status;
      return true;
    };
    const results = await Promise.all([atomicClaim(), atomicClaim()]);
    expect(results.filter(Boolean)).toHaveLength(1);
    expect(status).toBe("queued");
  });

  it("fundação legada nunca passa pelo gerador", () => {
    expect(shouldGenerateFoundation({})).toBe(true);
    expect(shouldGenerateFoundation({ reconciliacao_legada: { detector_version: "v2" } })).toBe(false);
  });

  it("conclusão fecha o ledger no payload e no progresso", () => {
    const initial = { reconciliacao_legada: { estado: "queued", resultado: "queued", job_origem: "j1" } };
    const done = finalizeReconciliationData(initial, initial, "approved", "2026-07-16T12:00:00Z");
    expect(done.payload?.reconciliacao_legada).toMatchObject({ estado: "done", resultado: "approved" });
    expect(done.progresso?.reconciliacao_legada.concluido_em).toBe("2026-07-16T12:00:00Z");
  });
});
