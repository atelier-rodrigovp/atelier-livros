import { describe, expect, it } from "vitest";
import { executePublicationTransaction, type PublicationTransactionIO } from "./publication-transaction.js";

const files = [
  { kind: "chapter" as const, bucket: "manuscritos" as const, localPath: "cap1", filename: "capitulo-01.md", numero: 1, titulo: "Um", palavras: 4 },
  { kind: "manuscript" as const, bucket: "manuscritos" as const, localPath: "master", filename: "MANUSCRITO-MESTRE.md" },
  { kind: "epub" as const, bucket: "epubs" as const, localPath: "book", filename: "livro.epub" },
];
const contents: Record<string, string> = { cap1: "capítulo aprovado", master: "capítulo aprovado", book: "epub-bytes" };
function fake(opts: { failUploadOnce?: string; failPromoteOnce?: boolean } = {}) {
  const uploads = new Map<string, number>(); let promoted = 0; let uploadFailed = false; let promoteFailed = false;
  const io: PublicationTransactionIO = {
    read: async (p) => Buffer.from(contents[p]),
    writeManifest: async () => {},
    upload: async (_b, key) => { if (opts.failUploadOnce && key.includes(opts.failUploadOnce) && !uploadFailed) { uploadFailed = true; throw new Error("upload falhou"); } uploads.set(key, (uploads.get(key) ?? 0) + 1); },
    promote: async () => { if (opts.failPromoteOnce && !promoteFailed) { promoteFailed = true; throw new Error("db falhou"); } promoted++; },
  };
  return { io, uploads, get promoted() { return promoted; } };
}
const input = { owner: "o", projectId: "p", editionId: "e", files };

describe("publicação por staging + promoção atômica", () => {
  it("só promove depois de todos os uploads", async () => {
    const f = fake(); const m = await executePublicationTransaction(input, f.io);
    expect(f.uploads.size).toBe(3); expect(f.promoted).toBe(1); expect(m.id).toHaveLength(24);
  });
  it("falha de upload nunca promove status", async () => {
    const f = fake({ failUploadOnce: "MANUSCRITO" });
    await expect(executePublicationTransaction(input, f.io)).rejects.toThrow("upload falhou");
    expect(f.promoted).toBe(0);
  });
  it("falha do banco mantém staging retomável e sem promoção parcial", async () => {
    const f = fake({ failPromoteOnce: true });
    await expect(executePublicationTransaction(input, f.io)).rejects.toThrow("db falhou");
    expect(f.promoted).toBe(0);
    const firstKeys = [...f.uploads.keys()];
    const m = await executePublicationTransaction(input, f.io);
    expect(f.promoted).toBe(1); expect([...f.uploads.keys()]).toEqual(firstKeys); expect(m.id).toHaveLength(24);
  });
  it("mesmo conteúdo gera a mesma versão e chaves", async () => {
    const a = fake(); const b = fake();
    expect((await executePublicationTransaction(input, a.io)).id).toBe((await executePublicationTransaction(input, b.io)).id);
  });
});
