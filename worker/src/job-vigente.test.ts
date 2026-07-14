import { describe, it, expect } from "vitest";
import { selecionarJobVigenteEscrita, jobsEscritaSubstituidos, ehJobVigenteEscrita } from "./job-vigente.js";
import type { JobLite } from "./job-vigente.js";

const j = (id: string, tipo: string, status: string, created_at: string, progresso: any = {}): JobLite => ({ id, tipo, status, created_at, progresso });

describe("job-vigente (S6/1.5)", () => {
  const jobs: JobLite[] = [
    j("old-write", "escrever_livro", "paused", "2026-07-08T15:53:00Z", { quality_status: "blocked_quality", quality_stage: "GATE_CAPITULO" }),
    j("cur-write", "escrever_livro", "paused", "2026-07-13T14:37:00Z", { quality_status: "blocked_quality", quality_stage: "REVISAO_CAPITULO" }),
    j("telem", "telemetria", "paused", "2026-07-01T11:12:00Z", {}),
    j("qedit", "qualidade_editorial", "paused", "2026-07-06T12:29:00Z", {}),
  ];

  it("vigente = escrever_livro mais recente", () => {
    expect(selecionarJobVigenteEscrita(jobs)?.id).toBe("cur-write");
  });

  it("jobs de outros tipos nunca são o vigente de escrita", () => {
    expect(selecionarJobVigenteEscrita([j("t", "telemetria", "paused", "2026-07-20T00:00:00Z")])).toBeNull();
  });

  it("escrever_livro pausado antigo é 'substituído', não vigente (não contamina)", () => {
    expect(ehJobVigenteEscrita(jobs, "old-write")).toBe(false);
    expect(ehJobVigenteEscrita(jobs, "cur-write")).toBe(true);
    expect(jobsEscritaSubstituidos(jobs).map((x) => x.id)).toEqual(["old-write"]);
  });

  it("sem jobs de escrita → null", () => {
    expect(selecionarJobVigenteEscrita([j("t", "telemetria", "done", "2026-07-01T00:00:00Z")])).toBeNull();
  });
});
