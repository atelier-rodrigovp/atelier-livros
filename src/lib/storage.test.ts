// "Erro de Storage nunca vira sucesso visual" (auditoria de fiação, fase 2).
//
// `downloadText` devolvia "" tanto para documento vazio quanto para falha de
// rede. O Leitor então renderizava um capítulo em branco — a pior forma de erro,
// porque parece conteúdo. Estes testes fixam a distinção.

import { describe, expect, it, vi, beforeEach } from "vitest";

const download = vi.fn();
vi.mock("./supabase", () => ({
  supabase: { storage: { from: () => ({ download }) } },
}));

const { downloadText } = await import("./storage");

beforeEach(() => download.mockReset());

describe("downloadText distingue vazio de falha", () => {
  it("sucesso devolve o texto e erro nulo", async () => {
    download.mockResolvedValue({ data: { text: async () => "# Capítulo 1" }, error: null });
    expect(await downloadText("manuscritos", "k")).toEqual({ texto: "# Capítulo 1", erro: null });
  });

  it("documento REALMENTE vazio é sucesso com texto vazio", async () => {
    download.mockResolvedValue({ data: { text: async () => "" }, error: null });
    const r = await downloadText("manuscritos", "k");
    expect(r.texto).toBe("");
    expect(r.erro).toBeNull();
  });

  it("erro do Storage vira ERRO, não texto vazio", async () => {
    download.mockResolvedValue({ data: null, error: { message: "Object not found" } });
    const r = await downloadText("manuscritos", "k");
    expect(r.texto).toBe("");
    expect(r.erro).toBe("Object not found");
  });

  it("erro sem mensagem ainda é erro", async () => {
    download.mockResolvedValue({ data: null, error: { message: "" } });
    expect((await downloadText("manuscritos", "k")).erro).toBeTruthy();
  });

  it("resposta sem dado e sem erro também não é sucesso", async () => {
    download.mockResolvedValue({ data: null, error: null });
    expect((await downloadText("manuscritos", "k")).erro).toBeTruthy();
  });
});
