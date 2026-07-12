import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import path from "node:path";
import { verifySkillManifest, type SkillManifest } from "./skill-manifest.js";

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
});
