// Hidrata o WORK_DIR de TODOS os livros importados (projects.briefing.importado=true)
// a partir do banco/Storage: capítulos→capitulo-NN.md, fundação, ESTADO_LIVRO semeado,
// MANUSCRITO-MESTRE consolidado. Idempotente. Reporta quais ficaram "prontos p/ avaliar"
// e quais estão "sem fundação Atelier" (refinar pede reconstrução).
//
// Uso (a partir de worker/):  npx tsx scripts/hidratar-importados.ts [<project_id>]
import "dotenv/config";
import { sb } from "../src/supabase.js";
import { hidratarWorkDir } from "../src/hidratar.js";

async function main() {
  const alvo = process.argv[2];
  let projetos: { id: string; titulo: string }[];
  if (alvo) {
    const { data } = await sb.from("projects").select("id,titulo").eq("id", alvo).maybeSingle();
    projetos = data ? [data as any] : [];
  } else {
    const { data } = await sb.from("projects").select("id,titulo,briefing").order("titulo");
    projetos = (data ?? []).filter((p: any) => p.briefing?.importado === true).map((p: any) => ({ id: p.id, titulo: p.titulo }));
  }
  if (!projetos.length) {
    console.log("Nenhum projeto importado encontrado.");
    return;
  }
  const prontos: string[] = [];
  const semFundacao: string[] = [];
  for (const p of projetos) {
    try {
      const r = await hidratarWorkDir(p.id);
      const tag = r.temFundacao ? "pronto p/ avaliar+refinar" : "pronto p/ avaliar (SEM fundação → refinar pede reconstrução)";
      console.log(`✓ ${p.titulo}\n   ${r.capitulos} caps (baixou ${r.baixados}) · fundação=${r.temFundacao ? "sim" : "não"} · mestre=${r.mestre} · estado=${r.estadoSemeado ? "semeado" : "—"} · ${tag}`);
      (r.temFundacao ? prontos : semFundacao).push(p.titulo);
    } catch (e) {
      console.error(`✗ ${p.titulo}: ${(e as Error).message}`);
    }
  }
  console.log(`\n===== RESUMO =====`);
  console.log(`Prontos p/ avaliar+refinar (${prontos.length}): ${prontos.join(", ") || "—"}`);
  console.log(`Avaliar OK, sem fundação p/ refinar (${semFundacao.length}): ${semFundacao.join(", ") || "—"}`);
}

main();
