// PROVA LITERÁRIA — mede a qualidade DO LIVRO e assina o resultado.
//
// Por que existe: a prontidão media o SISTEMA em três níveis e o estado
// `prova_literaria` era uma string constante. Não havia, no repositório inteiro,
// nada que produzisse APROVADA ou REPROVADA. Este script é esse produtor.
//
// O que ele faz, nesta ordem:
//   1. fail-closed — sem autorização ativa do projeto, recusa ANTES de tocar o
//      disco do autor ou gastar cota;
//   2. consolida o manuscrito da V2 (o mesmo `consolidarManuscrito` que a
//      meta-nota usa, e o mesmo texto que `capitulos-db` sincroniza ao Storage);
//   3. avalia o livro inteiro pelo papel `revisor_literario`, no MESMO caminho
//      de provedor do resto da V2 (`executarPapel` → ledger `engine_runs`);
//   4. grava `.prova-literaria/<project_id>.json` assinado com sha256 do
//      manuscrito avaliado e o SHA do código.
//
// A nota agregada e o piso saem de `derivarNotaEFloor` — o modelo NUNCA soma a
// própria nota, e o validador recalcula os dois ao ler.
//
// ATENÇÃO: este comando CONSOME COTA de modelo (é uma avaliação real de livro).
// Sem `--confirmar` ele faz tudo menos a chamada: valida autorização, consolida
// o manuscrito e informa o que seria avaliado.
//
//   npx tsx scripts/v2-prova-literaria.ts --projeto <uuid> [--edicao <uuid>]
//                                         [--meta 9] [--confirmar]

import "dotenv/config";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { mapaModelosDoAmbiente } from "../src/v2/config.js";
import { carregarContrato } from "../src/v2/contrato.js";
import { capturarHead, worktreeLimpa } from "../src/v2/execucao.js";
import { Gravador } from "../src/v2/gravador.js";
import { consolidarManuscrito } from "../src/v2/meta9.js";
import { criarPersistencia } from "../src/v2/persistencia.js";
import { ProvedorClaudeCli } from "../src/v2/provedor.js";
import { arquivoProva, executarProvaLiteraria } from "../src/v2/prova-literaria.js";
import { exigirReleaseAtual, lerAutorizacaoProjeto } from "../src/v2/release.js";
import { capitulosAprovados } from "../src/v2/capitulos-db.js";

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const RAIZ = path.resolve(AQUI, "..", "..");

const arg = (n: string): string | undefined => {
  const i = process.argv.indexOf(n);
  return i >= 0 ? process.argv[i + 1] : undefined;
};

const projectId = arg("--projeto");
if (!projectId) {
  console.error("uso: --projeto <uuid> [--edicao <uuid>] [--meta 9] [--confirmar]");
  process.exit(1);
}
const editionId = arg("--edicao") ?? null;
const confirmar = process.argv.includes("--confirmar");

// Mapa de skill da V1 para o id de contrato da V2 (mesma tabela da integração).
const MAPA_SKILL_V1_V2: Record<string, string> = {
  "skill-dan-brown": "dan-brown",
  "hoover-mcfadden": "hoover-mcfadden",
  "skill-jk-rowling": "jk-rowling",
  "skill-romantasy": "romantasy",
  "vesper-escritor-de-capitulos": "vesper",
};

async function main(): Promise<void> {
  const { sb, OWNER } = await import("../src/supabase.js");
  const { projDir, CLAUDE_BIN } = await import("../src/lib.js");

  const { data: proj, error } = await sb
    .from("projects")
    .select("id,titulo,skill_escrita,total_capitulos,meta_nota")
    .eq("owner", OWNER)
    .eq("id", projectId)
    .single();
  if (error || !proj) throw new Error(`projeto ${projectId} não encontrado: ${error?.message ?? ""}`);

  const p = proj as { titulo?: string; skill_escrita?: string; total_capitulos?: number | null; meta_nota?: number | null };
  const skillId = MAPA_SKILL_V1_V2[p.skill_escrita ?? ""] ?? p.skill_escrita ?? "";
  const contrato = carregarContrato(skillId);

  // Fail-closed ANTES de qualquer leitura pesada ou chamada de modelo. A prova
  // é uma operação de avaliação: projeto sem autorização ativa não roda.
  exigirReleaseAtual(contrato.contrato.id, projectId, await lerAutorizacaoProjeto(projectId!), "avaliacao");

  const dirProjeto = projDir(projectId!);
  const dirManuscrito = path.join(dirProjeto, "manuscrito");
  const { persistencia } = await criarPersistencia({ dirProjeto });
  const gravador = new Gravador({ persistencia, projectId: projectId! });

  const estado = await gravador.carregarEstado();
  const aprovados = capitulosAprovados(estado);
  const total = estado.doc.total_capitulos ?? p.total_capitulos ?? aprovados.length;

  // Perfil de voz (layout `fundacao/` ou raiz), como na integração.
  let perfilTexto = "";
  for (const c of [path.join(dirProjeto, "fundacao", "perfil-de-voz.md"), path.join(dirProjeto, "perfil-de-voz.md")]) {
    try {
      perfilTexto = await readFile(c, "utf8");
      if (perfilTexto.trim()) break;
    } catch {
      /* tenta o próximo layout */
    }
  }
  if (!perfilTexto.trim()) throw new Error(`perfil-de-voz.md não encontrado em ${dirProjeto}`);

  const meta = Number(arg("--meta") ?? p.meta_nota ?? 9);
  const head = capturarHead(RAIZ);
  // Worktree suja invalida o SHA: o código avaliador não seria o do commit.
  const { limpa, sujos } = worktreeLimpa(RAIZ, ["worker/src", "worker/scripts", "worker/skills-v2"]);

  console.log(`projeto: ${p.titulo ?? projectId}`);
  console.log(`skill: ${contrato.contrato.id}@${contrato.contrato.versao} · meta: ${meta}`);
  console.log(`capítulos aprovados: ${aprovados.length}/${total}`);
  console.log(`código: ${head.slice(0, 7)} ${limpa ? "(worktree limpa)" : `+ ${sujos.length} MODIFICADO(S)`}`);

  if (!limpa) {
    console.error("\nabortado: worktree suja nos caminhos do worker — a prova carimbaria um SHA que não é o código em execução.");
    console.error(`  modificados: ${sujos.slice(0, 5).join(", ")}`);
    process.exit(1);
  }

  // Consolidação é determinística e não custa cota: roda sempre, inclusive no
  // ensaio, para que o autor veja EXATAMENTE o que seria avaliado.
  const consolidado = consolidarManuscrito(dirManuscrito, dirProjeto, total);
  console.log(`manuscrito: ${consolidado.palavras} palavras · sha256 ${consolidado.hash.slice(0, 12)}…`);

  if (!confirmar) {
    console.log("\nensaio (sem --confirmar): nenhuma chamada de modelo foi feita, nenhuma prova gravada.");
    console.log(`a prova seria gravada em ${arquivoProva(RAIZ, projectId!)}`);
    return;
  }

  const prova = await executarProvaLiteraria({
    gravador,
    persistencia,
    provedor: new ProvedorClaudeCli(CLAUDE_BIN!, dirProjeto),
    mapa: mapaModelosDoAmbiente(),
    contrato,
    perfil: { texto: perfilTexto, skillId: contrato.contrato.id, hash: "perfil-de-voz.md", validado: true },
    dirProjeto,
    dirManuscrito,
    projectId: projectId!,
    editionId,
    head,
    meta,
    totalCapitulos: total,
    raizArtefato: RAIZ,
  });

  console.log("");
  console.log(prova.relatorio);
  console.log("");
  console.log(`veredito: ${prova.aprovada ? "APROVADA" : "REPROVADA"} — nota ${prova.nota} (meta ${prova.meta}), piso ${prova.floor.nota} em ${prova.floor.dimensao}`);
  console.log(`prova gravada em ${arquivoProva(RAIZ, projectId!)}`);
}

main().catch((e) => {
  console.error(`PROVA LITERÁRIA FALHOU: ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
});
