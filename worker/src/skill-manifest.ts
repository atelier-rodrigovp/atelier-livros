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

// Git guarda os patches em LF, mas o checkout e o Copy-Item do worker no
// Windows podem materializá-los em CRLF. Para arquivos textuais isso não é
// drift da skill; binários continuam comparados byte a byte.
const TEXT_EXTENSIONS = new Set([".md", ".py", ".json", ".txt", ".yaml", ".yml"]);
/**
 * Hash canônico de arquivo de skill: texto é normalizado para LF ANTES do hash.
 * Exportado para o GERADOR do manifest usar a MESMA canonicalização — o manifest
 * 1.0.9 nasceu com hash sobre CRLF bruto e reprovava o próprio arquivo fonte.
 */
export const sha256Skill = (buf: Buffer, filePath: string): string => {
  const canonical = TEXT_EXTENSIONS.has(path.extname(filePath).toLowerCase())
    ? Buffer.from(buf.toString("utf8").replace(/\r\n/g, "\n"), "utf8")
    : buf;
  return createHash("sha256").update(canonical).digest("hex");
};
const sha256 = sha256Skill;

export async function verifySkillManifest(
  manifest: SkillManifest,
  sourceRoot: string,
  installedRoot: string,
  load: (p: string) => Promise<Buffer> = async (p) => readFile(p)
): Promise<SkillManifestResult> {
  const differences: SkillManifestResult["differences"] = [];
  for (const f of manifest.files) {
    let sourceHash = "";
    try { sourceHash = sha256(await load(path.join(sourceRoot, ...f.path.split("/"))), f.path); } catch { sourceHash = "missing"; }
    if (sourceHash !== f.sha256) differences.push({ path: f.path, reason: "source-mismatch", expected: f.sha256, actual: sourceHash });
    let installedHash: string | undefined;
    try { installedHash = sha256(await load(path.join(installedRoot, ...f.path.split("/"))), f.path); } catch { /* explicit missing below */ }
    if (!installedHash) differences.push({ path: f.path, reason: "installed-missing", expected: f.sha256 });
    else if (installedHash !== f.sha256) differences.push({ path: f.path, reason: "installed-mismatch", expected: f.sha256, actual: installedHash });
  }
  return { ok: differences.length === 0, manifestVersion: manifest.manifestVersion, checked: manifest.files.length, differences };
}
