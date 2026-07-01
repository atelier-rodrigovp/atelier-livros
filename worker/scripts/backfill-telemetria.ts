// Popula a telemetria (tokens/tempo por agente + throughput) de TODOS os projetos
// com transcript no disco — para o painel de observabilidade já nascer com histórico.
// Idempotente (upsert da linha jobs tipo='telemetria').
//
// Uso (a partir de worker/):  npx tsx scripts/backfill-telemetria.ts [<project_id>]
import { readdir } from "node:fs/promises";
import { sb, OWNER } from "../src/supabase.js";
import { projDir } from "../src/lib.js";
import { coletarTelemetria } from "../src/telemetria.js";

const WORK_DIR = process.env.WORK_DIR || "./atelier-work";

async function persistir(projectId: string): Promise<boolean> {
  const tel = await coletarTelemetria(projDir(projectId));
  if (!tel) return false;
  const { data: ex } = await sb.from("jobs").select("id").eq("owner", OWNER)
    .eq("project_id", projectId).eq("tipo", "telemetria").limit(1);
  if (ex?.length) await sb.from("jobs").update({ payload: tel }).eq("id", (ex[0] as any).id);
  else await sb.from("jobs").insert({ owner: OWNER, project_id: projectId, tipo: "telemetria", status: "paused", payload: tel });
  const g = tel.gargalo;
  console.log(`✓ ${projectId} — $${tel.custo_proxy_usd} · out ${(tel.totais.output / 1e6).toFixed(2)}M · ` +
    `restarts ${tel.throughput.restarts} · 32k-fail ${tel.throughput.hard_fail_32k}` +
    (g ? ` · gargalo ${g.papel} (${g.pct_output}% out)` : ""));
  return true;
}

async function main() {
  const alvo = process.argv[2];
  let ids: string[];
  if (alvo) ids = [alvo];
  else {
    try {
      ids = (await readdir(WORK_DIR)).filter((n) => /^[0-9a-f-]{36}$/.test(n));
    } catch {
      console.error(`WORK_DIR não encontrado: ${WORK_DIR}`);
      process.exit(1);
    }
  }
  let ok = 0;
  for (const id of ids) if (await persistir(id)) ok++;
  console.log(`\nConcluído. ${ok}/${ids.length} projeto(s) com telemetria.`);
}
main();
