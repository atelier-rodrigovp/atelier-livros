// Engine V2 — executor da migração V1 → V2 de um projeto real.
// Lê o layout V1 no WORK_DIR (somente leitura), materializa o estado canônico V2
// (migrarProjetoV1, idempotente) e imprime o relatório. Só marca o projeto como
// engine_mode='v2' com a flag explícita --marcar-v2 (e nunca com divergência de
// aprovação não reconhecida). --reverter desfaz o que veio da migração.
//
// Uso (de worker/):
//   npx tsx scripts/v2-migrar.ts <project_id> [--marcar-v2] [--reverter]

import "dotenv/config";
import { migrarProjetoV1, reverterMigracao } from "../src/v2/migracao.js";
import { criarPersistencia } from "../src/v2/persistencia.js";
import { carregarContrato, MAPA_SKILL_V1_V2 } from "../src/v2/contrato.js";

async function main(): Promise<void> {
  const projectId = process.argv[2];
  if (!projectId || projectId.startsWith("--")) {
    console.error("uso: npx tsx scripts/v2-migrar.ts <project_id> [--marcar-v2] [--reverter]");
    process.exit(2);
  }
  const marcarV2 = process.argv.includes("--marcar-v2");
  const reverter = process.argv.includes("--reverter");

  const { sb, OWNER } = await import("../src/supabase.js");
  const { projDir } = await import("../src/lib.js");
  const { data: proj, error } = await sb
    .from("projects")
    .select("id,titulo,skill_escrita,engine_mode,total_capitulos")
    .eq("owner", OWNER)
    .eq("id", projectId)
    .single();
  if (error || !proj) throw new Error(`projeto ${projectId} não encontrado: ${error?.message ?? ""}`);

  const dirProjeto = projDir(projectId);
  const { persistencia, migracaoPendente } = await criarPersistencia({ dirProjeto });
  console.log(`projeto: ${(proj as { titulo?: string }).titulo} (${projectId})`);
  console.log(`dir: ${dirProjeto} · persistência: ${migracaoPendente ? "disco (DDL pendente)" : "supabase"}`);

  if (reverter) {
    const r = await reverterMigracao({ projectId, dirProjeto, persistencia });
    console.log(`reversão: capítulos removidos do estado V2: ${r.capitulosRemovidos.join(", ") || "(nenhum)"}`);
    return;
  }

  const skillV1 = (proj as { skill_escrita?: string }).skill_escrita ?? "";
  const skillId = MAPA_SKILL_V1_V2[skillV1] ?? skillV1;
  const contrato = carregarContrato(skillId);

  const rel = await migrarProjetoV1({
    projectId,
    dirProjeto,
    persistencia,
    skill: { id: contrato.contrato.id, versao: contrato.contrato.versao, hash: contrato.hash },
  });

  const porStatus = new Map<string, number>();
  for (const c of rel.capitulos) porStatus.set(c.destino, (porStatus.get(c.destino) ?? 0) + 1);
  console.log(`\nfase: ${rel.fase} · capítulos no relatório: ${rel.capitulos.length} · idempotente: ${rel.idempotente}`);
  for (const [st, n] of [...porStatus.entries()].sort()) console.log(`  ${st}: ${n}`);
  console.log(`fundação: ${Object.keys(rel.fundacao.docs).length} docs com hash${rel.fundacao.ausentes.length ? ` · ausentes: ${rel.fundacao.ausentes.join(", ")}` : ""}`);
  if (rel.divergencias.length) {
    console.log(`\ndivergências (${rel.divergencias.length}):`);
    for (const d of rel.divergencias.slice(0, 20)) console.log(`  - ${d}`);
    if (rel.divergencias.length > 20) console.log(`  … +${rel.divergencias.length - 20}`);
  }
  console.log(`relatório: ${dirProjeto}\\engine-v2\\migracao-relatorio.json`);

  if (marcarV2) {
    const { error: e2 } = await sb.from("projects").update({ engine_mode: "v2" }).eq("owner", OWNER).eq("id", projectId);
    if (e2) throw new Error(`falha ao marcar engine_mode='v2': ${e2.message}`);
    console.log(`\nprojects.engine_mode = 'v2' gravado. Rollback: UPDATE projects SET engine_mode='claude_code' WHERE id='${projectId}';`);
  } else {
    console.log(`\n(engine_mode não alterado — use --marcar-v2 para ativar a V2 neste projeto)`);
  }
}

main().catch((e) => {
  console.error("MIGRAÇÃO FALHOU:", e instanceof Error ? e.message : e);
  process.exit(1);
});
