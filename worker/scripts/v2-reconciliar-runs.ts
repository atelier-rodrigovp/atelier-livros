// Encerra runs presos em `running` — achado A1.
//
// Roda POR COMANDO, nunca em background: encerrar run é escrita no histórico, e
// escrita no histórico não acontece por mágica de daemon.
//
//   npx tsx scripts/v2-reconciliar-runs.ts             (inventário, não escreve)
//   npx tsx scripts/v2-reconciliar-runs.ts --confirmar (encerra os órfãos)

import "dotenv/config";
import { decidirReconciliacao, erroDeOrfao, type RunEmAberto } from "../src/v2/reconciliar-runs.js";
import { EXECUCAO_POR_PAPEL } from "../src/v2/tipos.js";

const confirmar = process.argv.includes("--confirmar");
const { sb, OWNER } = await import("../src/supabase.js");

const { data, error } = await sb
  .from("engine_runs")
  .select("id,papel,status,started_at")
  .eq("owner", OWNER)
  .eq("status", "running")
  .order("started_at", { ascending: true });

if (error) {
  console.error(`falha ao ler engine_runs: ${error.message}`);
  process.exit(1);
}

const runs = (data ?? []) as RunEmAberto[];
const timeoutPorPapel = Object.fromEntries(
  Object.entries(EXECUCAO_POR_PAPEL).map(([p, e]) => [p, e.timeoutMs])
) as Record<string, number>;

const decisoes = decidirReconciliacao(runs, { agora: Date.now(), timeoutPorPapel });

// Inventário por papel — o número que faltava para saber o tamanho do problema.
const porPapel = new Map<string, number>();
for (const r of runs) porPapel.set(r.papel, (porPapel.get(r.papel) ?? 0) + 1);
console.log(`runs em 'running': ${runs.length}`);
for (const [papel, n] of [...porPapel].sort((a, b) => b[1] - a[1])) console.log(`  ${papel}: ${n}`);

const encerrar = decisoes.filter((d) => d.acao === "encerrar");
const manter = decisoes.filter((d) => d.acao === "manter");
const recusar = decisoes.filter((d) => d.acao === "recusar");
console.log(`\nencerrar: ${encerrar.length} · manter: ${manter.length} · recusar: ${recusar.length}`);
for (const d of encerrar) console.log(`  [ORFAO] ${d.id.slice(0, 8)} ${d.papel} — ${d.motivo}`);
for (const d of recusar) console.log(`  [RECUSA] ${d.id.slice(0, 8)} ${d.papel} — ${d.motivo}`);

if (!confirmar) {
  console.log("\nnada foi escrito. Use --confirmar para encerrar os órfãos.");
  process.exit(0);
}

let ok = 0;
for (const d of encerrar) {
  const erro = erroDeOrfao(d as never);
  // `finished_at` = agora, e não a hora que o processo morreu: ninguém sabe qual
  // foi. Por isso o erro diz, com todas as letras, que esta duração não mede
  // trabalho — para nenhuma média futura tratá-la como se medisse.
  const { error: e } = await sb
    .from("engine_runs")
    .update({ status: "falha", finished_at: new Date().toISOString(), erro })
    .eq("owner", OWNER)
    .eq("id", d.id)
    .eq("status", "running"); // guarda extra: se virou concluído entre a leitura e agora, não toca
  if (e) console.log(`  [FALHA] ${d.id.slice(0, 8)}: ${e.message}`);
  else {
    ok++;
    console.log(`  [ENCERRADO] ${d.id.slice(0, 8)} ${d.papel}`);
  }
}
console.log(`\n${ok}/${encerrar.length} órfãos encerrados`);
