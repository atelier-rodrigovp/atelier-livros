// Calibração de cotas da Engine V2 (contratos 1.1.0) a partir de corpus aprovado.
// Roda os detectores REAIS (medirSinais, o mesmo caminho do pipeline) sobre as
// amostras do manifest v2-calibracao-corpus.json e imprime, por skill e sinal:
// valores por capítulo (grupo aprovado e contraste), p90 e máximo do aprovado,
// e a cota vigente do contrato. A DERIVAÇÃO da cota é decisão registrada no
// relatório (docs/engine-v2/calibracao-cotas-1.1.0.md) — este script só mede.
//
// Uso: npx tsx worker/scripts/v2-calibrar-cotas.ts [--json <saida.json>]

import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { carregarContrato } from "../src/v2/contrato.js";
import { medirSinais } from "../src/v2/sinais.js";

const aqui = path.dirname(fileURLToPath(import.meta.url));
const manifestPath = path.join(aqui, "v2-calibracao-corpus.json");

interface Amostra { skill: string; grupo: "aprovado" | "contraste"; caminho: string; origem: string }
interface Medicao {
  skill: string; grupo: string; arquivo: string; hash: string; palavras: number; origem: string;
  sinais: Record<string, number | string>;
}

function p90(valores: number[]): number {
  const v = [...valores].sort((a, b) => a - b);
  if (!v.length) return NaN;
  const idx = Math.ceil(0.9 * v.length) - 1;
  return v[Math.max(0, idx)];
}

function main(): void {
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as { amostras: Amostra[] };
  const medicoes: Medicao[] = [];

  for (const a of manifest.amostras) {
    const texto = readFileSync(a.caminho, "utf8");
    const contrato = carregarContrato(a.skill);
    const sinais = medirSinais(texto, contrato.contrato);
    const porSinal: Record<string, number | string> = {};
    for (const s of sinais) porSinal[s.sinal] = s.valor;
    medicoes.push({
      skill: a.skill,
      grupo: a.grupo,
      arquivo: path.basename(path.dirname(path.dirname(a.caminho))) + "/" + path.basename(a.caminho),
      hash: createHash("sha256").update(texto, "utf8").digest("hex").slice(0, 12),
      palavras: Number(porSinal["palavras"] ?? 0),
      origem: a.origem,
      sinais: porSinal,
    });
  }

  const skills = [...new Set(medicoes.map((m) => m.skill))];
  for (const skill of skills) {
    const contrato = carregarContrato(skill);
    const doSkill = medicoes.filter((m) => m.skill === skill);
    const aprovadas = doSkill.filter((m) => m.grupo === "aprovado");
    const nomesSinais = [...new Set(doSkill.flatMap((m) => Object.keys(m.sinais)))].filter((s) => s !== "gancho_final");

    console.log(`\n===== ${skill} (contrato ${contrato.contrato.versao}) — aprovadas n=${aprovadas.length} =====`);
    for (const m of doSkill) {
      console.log(`  [${m.grupo}] ${m.arquivo} (${m.palavras} palavras, sha ${m.hash})`);
    }
    console.log(`  ${"sinal".padEnd(28)} | aprovado (valores → p90 / máx) | contraste | cota 1.0.0`);
    for (const nome of nomesSinais) {
      const aprovVals = aprovadas.map((m) => Number(m.sinais[nome])).filter((v) => !Number.isNaN(v));
      const contrVals = doSkill.filter((m) => m.grupo === "contraste").map((m) => Number(m.sinais[nome])).filter((v) => !Number.isNaN(v));
      const cotaRegra = contrato.contrato.regras.find((r) => r.tipo === "cota" && (r.id.includes(nome.replace("_pct", "").replace("cadencia.", "")) || false));
      const cotaStr = cotaRegra?.cota ? `${cotaRegra.cota.min != null ? `mín ${cotaRegra.cota.min}` : ""}${cotaRegra.cota.max != null ? `máx ${cotaRegra.cota.max}` : ""}` : "—";
      const fmt = (vs: number[]) => (vs.length ? `${vs.join(", ")} → p90 ${p90(vs)} / máx ${Math.max(...vs)}` : "—");
      console.log(`  ${nome.padEnd(28)} | ${fmt(aprovVals).padEnd(30)} | ${contrVals.join(", ") || "—"} | ${cotaStr}`);
    }
  }

  const outJson = process.argv.indexOf("--json");
  if (outJson >= 0 && process.argv[outJson + 1]) {
    writeFileSync(process.argv[outJson + 1], JSON.stringify(medicoes, null, 2), "utf8");
    console.log(`\nmedições gravadas em ${process.argv[outJson + 1]}`);
  }
}

main();
