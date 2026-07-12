import { describe, expect, it } from "vitest";
import { claimJobAtomic } from "./claim.js";

describe("distributed claim contract", () => {
  it("retorna o job entregue pela função transacional", async () => {
    const client = { rpc: async () => ({ data: [{ id: "j1", tipo: "x", payload: {}, project_id: "p", edition_id: null }], error: null }) };
    expect((await claimJobAtomic(client, "j1", "owner", "w1"))?.id).toBe("j1");
  });
  it("perdedor da corrida recebe null", async () => {
    const client = { rpc: async () => ({ data: [], error: null }) };
    expect(await claimJobAtomic(client, "j1", "owner", "w2")).toBeNull();
  });
  it("não degrada para claim local se a migração estiver ausente", async () => {
    const client = { rpc: async () => ({ data: null, error: { message: "function not found" } }) };
    await expect(claimJobAtomic(client, "j1", "owner", "w1")).rejects.toThrow("fallback local é proibido");
  });
});
