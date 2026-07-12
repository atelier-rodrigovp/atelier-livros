import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";

export interface SkillManifest {
  manifestVersion: string;
  generatedAt: string;
  compatibility: string;
  requiredTests: string[];
  files: Array<{ path: string; sha256: string }>;
}

export interface SkillManifestResult {
  ok: boolean;
  manifestVersion: string;
  checked: number;
  differences: Array<{ path: string; reason: "source-mismatch" | "installed-missing" | "installed-mismatch"; expected: string; actual?: string }>;
}

const sha256 = (buf: Buffer) => createHash("sha256").update(buf).digest("hex");

export async function verifySkillManifest(
  manifest: SkillManifest,
  sourceRoot: string,
  installedRoot: string,
  load: (p: string) => Promise<Buffer> = async (p) => readFile(p)
): Promise<SkillManifestResult> {
  const differences: SkillManifestResult["differences"] = [];
  for (const f of manifest.files) {
    let sourceHash = "";
    try { sourceHash = sha256(await load(path.join(sourceRoot, ...f.path.split("/")))); } catch { sourceHash = "missing"; }
    if (sourceHash !== f.sha256) differences.push({ path: f.path, reason: "source-mismatch", expected: f.sha256, actual: sourceHash });
    let installedHash: string | undefined;
    try { installedHash = sha256(await load(path.join(installedRoot, ...f.path.split("/")))); } catch { /* explicit missing below */ }
    if (!installedHash) differences.push({ path: f.path, reason: "installed-missing", expected: f.sha256 });
    else if (installedHash !== f.sha256) differences.push({ path: f.path, reason: "installed-mismatch", expected: f.sha256, actual: installedHash });
  }
  return { ok: differences.length === 0, manifestVersion: manifest.manifestVersion, checked: manifest.files.length, differences };
}
