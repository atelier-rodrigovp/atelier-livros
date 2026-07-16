import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { verifySkillManifest, type SkillManifest } from "./skill-manifest.js";
import manifestReal from "../skill-patches/manifest.json";

// ETAPA 0c (rodada final): drift do manifest morre AQUI, na suíte — não na
// partida do worker. Editou arquivo coberto ⇒ rode
// `npx tsx worker/scripts/gerar-manifest.ts`.
describe("manifest bate com os arquivos versionados do repo", () => {
  const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "skill-patches");
  for (const f of manifestReal.files) {
    it(`hash de ${f.path} corresponde ao manifest ${manifestReal.manifestVersion}`, () => {
      const bytes = readFileSync(path.join(raiz, ...f.path.split("/")));
      const atual = createHash("sha256").update(Buffer.from(bytes.toString("utf8").replace(/\r\n/g, "\n"))).digest("hex");
      expect(atual).toBe(f.sha256);
    });
  }
});

const hash = (s: string) => createHash("sha256").update(Buffer.from(s)).digest("hex");
const manifest: SkillManifest = { manifestVersion: "1", generatedAt: "now", compatibility: "test", requiredTests: [], files: [{ path: "skill/a.txt", sha256: hash("igual") }] };

describe("skill manifest", () => {
  it("aprova somente repo e instalação idênticos ao manifest", async () => {
    const r = await verifySkillManifest(manifest, "repo", "installed", async () => Buffer.from("igual"));
    expect(r.ok).toBe(true);
  });
  it("detecta divergência instalada sem alterar a skill", async () => {
    const r = await verifySkillManifest(manifest, "repo", "installed", async (p) => Buffer.from(p.startsWith(path.join("repo", "skill")) ? "igual" : "diferente"));
    expect(r.ok).toBe(false);
    expect(r.differences[0].reason).toBe("installed-mismatch");
  });
  it("considera LF e CRLF equivalentes em arquivos textuais", async () => {
    const m: SkillManifest = { ...manifest, files: [{ path: "skill/doc.md", sha256: hash("a\nb\n") }] };
    const r = await verifySkillManifest(m, "repo", "installed", async (p) =>
      Buffer.from(p.startsWith(path.join("repo", "skill")) ? "a\nb\n" : "a\r\nb\r\n")
    );
    expect(r.ok).toBe(true);
  });
});
