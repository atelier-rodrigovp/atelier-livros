// Auditoria antivazamento: varre os capítulos JÁ gerados (disco + Storage),
// remove meta-texto com `sanitizarCapitulo`, faz backup do original e regrava
// limpo. Gera um relatório do que foi encontrado. NÃO apaga obras.
//
// Uso (a partir de worker/):  npx tsx scripts/auditar-vazamentos.ts [--dry-run] [<project_id>]
//   --dry-run: SÓ RELATA (nenhuma escrita em disco/Storage) — auditoria segura.
//   <project_id>: restringe o disco a um projeto (amostra).
import "dotenv/config";
import { sb, OWNER } from "../src/supabase.js";
import { sanitizarCapitulo, metaResidual } from "../src/sanitize.js";
import { readdir, readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";

const DRY_RUN = process.argv.includes("--dry-run");
const ALVO_PROJETO = process.argv.slice(2).find((a) => !a.startsWith("--"));
const WORK_DIR = process.env.WORK_DIR || "./atelier-work";
const BUCKET = "manuscritos";
const BACKUP_DIR = path.join(process.cwd(), "audit-backup");
const EH_CAP = (f: string) => /^capitulo-\d{2}\.md$/.test(f) || f === "MANUSCRITO-MESTRE.md";

interface Achado { escopo: "disco" | "storage"; alvo: string; removidos: string[]; residual: string | null; }
const achados: Achado[] = [];
const edicoesAfetadas = new Set<string>();

async function auditarDisco() {
  let dirs: string[] = [];
  try { dirs = await readdir(WORK_DIR); } catch { return; }
  if (ALVO_PROJETO) dirs = dirs.filter((d) => d.startsWith(ALVO_PROJETO));
  for (const d of dirs) {
    const manus = path.join(WORK_DIR, d, "manuscrito");
    let files: string[] = [];
    try { files = (await readdir(manus)).filter(EH_CAP); } catch { continue; }
    for (const f of files) {
      const file = path.join(manus, f);
      const orig = await readFile(file, "utf8");
      const { texto, removidos } = sanitizarCapitulo(orig);
      if (!removidos.length) continue;
      if (!DRY_RUN) {
        await writeFile(file + ".orig.bak", orig, "utf8");
        await writeFile(file, texto, "utf8");
      }
      achados.push({ escopo: "disco", alvo: `${d}/manuscrito/${f}`, removidos, residual: metaResidual(texto) });
    }
  }
}

async function auditarStorage() {
  const { data: chs } = await sb.from("chapters").select("storage_path,edition_id").eq("owner", OWNER);
  const { data: arts } = await sb.from("artifacts").select("storage_path,edition_id").eq("owner", OWNER).eq("tipo", "manuscrito");
  const alvos = [
    ...(chs ?? []).map((c: any) => ({ key: c.storage_path, ed: c.edition_id })),
    ...(arts ?? []).map((a: any) => ({ key: a.storage_path, ed: a.edition_id })),
  ].filter((x) => x.key && (!ALVO_PROJETO || String(x.key).includes(ALVO_PROJETO)));

  for (const { key, ed } of alvos) {
    const { data: blob, error } = await sb.storage.from(BUCKET).download(key);
    if (error || !blob) continue;
    const orig = Buffer.from(await blob.arrayBuffer()).toString("utf8");
    const { texto, removidos } = sanitizarCapitulo(orig);
    if (!removidos.length) continue;
    if (!DRY_RUN) {
      const bkp = path.join(BACKUP_DIR, key);
      await mkdir(path.dirname(bkp), { recursive: true });
      await writeFile(bkp, orig, "utf8");
      await sb.storage.from(BUCKET).upload(key, Buffer.from(texto, "utf8"), { upsert: true, contentType: "text/markdown" });
    }
    if (ed) edicoesAfetadas.add(ed);
    achados.push({ escopo: "storage", alvo: key, removidos, residual: metaResidual(texto) });
  }
}

await auditarDisco();
await auditarStorage();

console.log(`\n===== RELATÓRIO DE AUDITORIA ANTIVAZAMENTO${DRY_RUN ? " (DRY-RUN — nada gravado)" : ""} =====`);
if (!achados.length) {
  console.log("Nenhum vazamento encontrado. ✓");
} else {
  console.log(`${achados.length} arquivo(s) ${DRY_RUN ? "COM vazamento (nada foi alterado)" : "limpos (backup do original preservado)"}:\n`);
  for (const a of achados) {
    console.log(`[${a.escopo}] ${a.alvo}`);
    for (const r of a.removidos) console.log(`   - ${r}`);
    if (a.residual) console.log(`   ⚠ RESÍDUO após limpeza: ${a.residual}`);
  }
  if (edicoesAfetadas.size) {
    console.log(`\nEdições com texto limpo no Storage (regenerar EPUB destas): ${[...edicoesAfetadas].join(", ")}`);
  }
}
console.log("================================================\n");
