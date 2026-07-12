import { describe, expect, it } from "vitest";
import { deriveWritingStatus } from "./operationalStatus";

describe("estado operacional honesto", () => {
  it("não chama running de execução quando worker está offline", () => expect(deriveWritingStatus({ status: "running" }, false).label).toContain("Órfão"));
  it("separa bloqueio de qualidade", () => expect(deriveWritingStatus({ status: "paused", progresso: { quality_status: "blocked_quality", quality_stage: "gate", quality_blockers: ["x"] } }, false).label).toBe("Bloqueado por qualidade"));
  it("separa bloqueio de infraestrutura", () => expect(deriveWritingStatus({ status: "paused", progresso: { quality_status: "blocked_infrastructure" } }, false).label).toBe("Bloqueado por infraestrutura"));
  it("não exibe retry vencido como pausa futura", () => expect(deriveWritingStatus({ status: "queued", progresso: { retry_at: "2026-07-11T10:00:00Z" } }, false, Date.parse("2026-07-11T12:00:00Z")).label).toBe("Retomada vencida"));
  it("execução real exige heartbeat ativo", () => expect(deriveWritingStatus({ status: "running" }, true).label).toBe("Executando agora"));
});
