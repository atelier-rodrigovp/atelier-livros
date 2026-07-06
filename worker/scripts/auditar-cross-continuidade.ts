// Sweep READ-ONLY dos 3 gaps da AUDITORIA-DAN-BROWN-V2 contra um projeto já escrito.
// (1) reconstrói o ledger cross-capítulo dos capitulo-NN.md; (2) roda os 3 checks e
// REPORTA violações (não reescreve prosa/spec); (3) grava o ledger em disco (único
// artefato que cria). Uso: npx tsx worker/scripts/auditar-cross-continuidade.ts [<project_id>]
import { readFileSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import path from "node:path";
import {
  detectarRepeticaoCrossCapitulo, entradasLedgerDoCapitulo, contarMuletas,
  checarDiaHoraSequencia, type EntradaLedger,
} from "../src/maneirismo.js";
import { avaliarRotacaoFio, exigenciasParaSkill } from "../src/exigencias-skill.js";

const WORK = process.env.WORK_DIR || "C:/Users/Rodrigo Paiva/atelier-work";
const PID = process.argv[2] || "53abdade-554d-47e2-bd14-955de3ffc41e";
const dir = path.join(WORK, PID);
if (!existsSync(dir)) { console.error("projeto não encontrado:", dir); process.exit(1); }

const capPath = (n: number) => path.join(dir, "manuscrito", `capitulo-${String(n).padStart(2, "0")}.md`);
const specPath = (n: number) => path.join(dir, "specs", `Spec-Capitulo-${String(n).padStart(2, "0")}.md`);
const ler = (p: string) => { try { return readFileSync(p, "utf8"); } catch { return ""; } };

// nº do maior capítulo no disco
const caps = readdirSync(path.join(dir, "manuscrito")).map((f) => /capitulo-(\d+)\.md/.exec(f)?.[1]).filter(Boolean).map(Number);
const total = caps.length ? Math.max(...caps) : 0;
const skill = (() => { try { return JSON.parse(ler(path.join(dir, "ESTADO_LIVRO.json"))).skill_escrita || ""; } catch { return ""; } })();
const ex = exigenciasParaSkill(skill) ?? {};
console.log(`# SWEEP ${PID}  skill=${skill}  caps=${total}\n`);

const fioDaSpec = (t: string): string => {
  const m = /(?:Fio de POV|POV\s*\/\s*fio|Ponto de vista)[^:\n]*:\s*\**\s*([^\n*]+)/i.exec(t || "");
  return m ? m[1].trim() : "";
};
const diaHoraLinha = (t: string): string => (t || "").split("\n").find((l) => /Dia\/Hora corrente/i.test(l)) || "";

// ---- gap 1: repetição cross-capítulo + monta ledger ----
console.log("## gap 1 — repetição verbatim cross-capítulo");
let ledger: EntradaLedger[] = [];
let g1 = 0;
for (let n = 1; n <= total; n++) {
  const txt = ler(capPath(n));
  if (!txt) continue;
  const hits = detectarRepeticaoCrossCapitulo(txt, ledger.map((e) => ({ numero: e.capitulo, trecho: e.trecho_original })));
  for (const h of hits) { console.log(`  cap-${n} ${h.tipo} (${h.score}) vs cap-${h.capituloAnterior}: "${h.trecho}"`); g1++; }
  ledger = ledger.concat(entradasLedgerDoCapitulo(n, txt));
}
console.log(`  → ${g1} repetições cross-capítulo\n`);

// ---- gap 2: monotonia de POV (por capítulo, config da skill) ----
console.log("## gap 2 — monotonia de POV/fio");
const fios: string[] = [];
for (let n = 1; n <= total; n++) fios.push(fioDaSpec(ler(specPath(n))));
console.log(`  sequência de fios: [${fios.map((f, i) => f ? `${i + 1}:${f.slice(0, 12)}` : "").filter(Boolean).join(", ")}]`);
let g2 = 0;
for (let n = 1; n <= total; n++) {
  const m = avaliarRotacaoFio(fios, n, ex as any);
  for (const motivo of m) { console.log(`  cap-${n}: ${motivo}`); g2++; }
}
console.log(`  → ${g2} violações de monotonia\n`);

// ---- gap 3a: léxico estrangeiro (llegou/…) ----
console.log("## gap 3a — léxico estrangeiro");
let g3a = 0;
for (let n = 1; n <= total; n++) {
  const est = contarMuletas(ler(capPath(n))).filter((x) => x.termo.includes("estrangeiro") && x.acima);
  for (const e of est) { console.log(`  cap-${n}: ${e.termo} = ${e.n} (alvo ${e.alvo})`); g3a++; }
}
console.log(`  → ${g3a} capítulos com léxico estrangeiro\n`);

// ---- gap 3b: aritmética de Dia/Hora ----
console.log("## gap 3b — aritmética de Dia/Hora");
const specsDH = [];
for (let n = 1; n <= total; n++) { const l = diaHoraLinha(ler(specPath(n))); if (l) specsDH.push({ numero: n, diaHoraLinha: l }); }
const dhBad = checarDiaHoraSequencia(specsDH);
for (const b of dhBad) console.log(`  cap-${b.capitulo}: ${b.motivo}`);
console.log(`  → ${dhBad.length} inconsistências de Dia/Hora\n`);

// ---- grava o ledger (único artefato criado) ----
const ledgerPath = path.join(dir, "assinaturas-cross-capitulo.json");
writeFileSync(ledgerPath, JSON.stringify(ledger, null, 0), "utf8");
console.log(`ledger cross-capítulo gravado: ${ledgerPath} (${ledger.length} entradas)`);
console.log(`\nRESUMO: gap1=${g1} gap2=${g2} gap3a=${g3a} gap3b=${dhBad.length}`);
