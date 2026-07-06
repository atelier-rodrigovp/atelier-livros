// FASE 7 — Commercial Blocker Report (sweep READ-ONLY da prosa). Por capítulo, roda os
// checks editoriais determinísticos (POV monotonia, Dia/Hora, léxico, cross-capítulo) e
// consolida {chapter, approved, issues, rewrite_instructions}. Persiste em
// estado-editorial.json.commercial_blockers + linha `jobs` schema-free (tipo=
// 'qualidade_editorial', status='paused') p/ a UI ler sem tocar o WORK_DIR. NÃO reescreve
// prosa. Uso: [WORK_DIR=<real>] npx tsx worker/scripts/relatorio-editorial.ts [<project_id>]
import { readFileSync, readdirSync, existsSync } from "node:fs";
import path from "node:path";
import {
  detectarRepeticaoCrossCapitulo, entradasLedgerDoCapitulo, contarMuletas,
  checarDiaHoraSequencia, type EntradaLedger,
} from "../src/maneirismo.js";
import { avaliarRotacaoFio, exigenciasParaSkill } from "../src/exigencias-skill.js";
import {
  lerEstadoEditorial, gravarEstadoEditorial, consolidarBlocker, registrarBlocker,
  type EstadoEditorial,
} from "../src/estado-editorial.js";

const WORK = process.env.WORK_DIR || "C:/Users/Rodrigo Paiva/atelier-work";
const PID = process.argv[2] || "53abdade-554d-47e2-bd14-955de3ffc41e";
const dir = path.join(WORK, PID);
if (!existsSync(dir)) { console.error("projeto não encontrado:", dir); process.exit(1); }

const capPath = (n: number) => path.join(dir, "manuscrito", `capitulo-${String(n).padStart(2, "0")}.md`);
const specPath = (n: number) => path.join(dir, "specs", `Spec-Capitulo-${String(n).padStart(2, "0")}.md`);
const ler = (p: string) => { try { return readFileSync(p, "utf8"); } catch { return ""; } };
const total = (() => {
  const ns = readdirSync(path.join(dir, "manuscrito")).map((f) => /capitulo-(\d+)\.md/.exec(f)?.[1]).filter(Boolean).map(Number);
  return ns.length ? Math.max(...ns) : 0;
})();
const skill = (() => { try { return JSON.parse(ler(path.join(dir, "ESTADO_LIVRO.json"))).skill_escrita || ""; } catch { return ""; } })();
const ex = exigenciasParaSkill(skill) ?? {};
const fioDaSpec = (t: string) => /(?:Fio de POV|POV\s*\/\s*fio|Ponto de vista)[^:\n]*:\s*\**\s*([^\n*]+)/i.exec(t || "")?.[1]?.trim() || "";
const diaHoraLinha = (t: string) => (t || "").split("\n").find((l) => /Dia\/Hora corrente/i.test(l)) || "";

const fios: string[] = [];
for (let n = 1; n <= total; n++) fios.push(fioDaSpec(ler(specPath(n))));
const specsDH = [] as { numero: number; diaHoraLinha: string }[];
for (let n = 1; n <= total; n++) { const l = diaHoraLinha(ler(specPath(n))); if (l) specsDH.push({ numero: n, diaHoraLinha: l }); }
const dhBad = new Map(checarDiaHoraSequencia(specsDH).map((b) => [b.capitulo, b.motivo]));

let estado: EstadoEditorial = await lerEstadoEditorial(dir);
let ledger: EntradaLedger[] = [];
let comIssue = 0;
console.log(`# RELATÓRIO EDITORIAL ${PID}  skill=${skill}  caps=${total}\n`);
for (let n = 1; n <= total; n++) {
  const txt = ler(capPath(n));
  if (!txt) continue;
  const issues: string[] = [];
  for (const m of avaliarRotacaoFio(fios, n, ex as any)) issues.push(m);
  if (dhBad.has(n)) issues.push(`Dia/Hora: ${dhBad.get(n)}`);
  for (const mu of contarMuletas(txt).filter((x) => (x.termo.includes("estrangeiro") || x.termo.includes("PT-PT")) && x.acima)) issues.push(`léxico ${mu.termo} = ${mu.n}`);
  for (const r of detectarRepeticaoCrossCapitulo(txt, ledger.map((e) => ({ numero: e.capitulo, trecho: e.trecho_original })))) issues.push(`repetição cross-cap "${r.trecho}" (= cap ${r.capituloAnterior})`);
  ledger = ledger.concat(entradasLedgerDoCapitulo(n, txt));
  const report = consolidarBlocker(n, issues);
  estado = registrarBlocker(estado, report);
  if (issues.length) { comIssue++; console.log(`cap-${n}: ${issues.length} issue(s) → ${JSON.stringify(report.rewrite_instructions)}`); for (const i of issues) console.log(`    - ${i}`); }
}
// Escrita no WORK_DIR é OPT-IN (default OFF): evita corrida com o runner num projeto VIVO.
if (process.env.WRITE_ESTADO === "1") { await gravarEstadoEditorial(dir, estado); console.log("estado-editorial.json atualizado (WRITE_ESTADO=1)."); }
console.log(`\n${comIssue}/${total} capítulos com issue. ${estado.commercial_blockers.length} BlockerReports consolidados${process.env.WRITE_ESTADO === "1" ? "" : " (não gravados no WORK_DIR — read-only)"}.`);

// Linha `jobs` schema-free p/ a UI (best-effort; pula se não houver credenciais).
try {
  const { sb, OWNER } = await import("../src/supabase.js");
  const payload = { project_id: PID, commercial_blockers: estado.commercial_blockers, atualizado_em: new Date().toISOString() };
  const { data: ex0 } = await sb.from("jobs").select("id").eq("owner", OWNER).eq("tipo", "qualidade_editorial").eq("project_id", PID).limit(1);
  if (ex0 && ex0.length) await sb.from("jobs").update({ payload }).eq("id", (ex0[0] as any).id);
  else await sb.from("jobs").insert({ owner: OWNER, project_id: PID, tipo: "qualidade_editorial", status: "paused", payload });
  console.log("linha jobs 'qualidade_editorial' atualizada (UI pode ler).");
} catch (e) {
  console.log("(jobs row não escrita — sem credenciais/ambiente; estado-editorial.json tem os dados)");
}
