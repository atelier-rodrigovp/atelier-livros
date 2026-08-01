// Harness de evidência externa — a única forma legítima de escrever em `.evidencias/`.
//
// Recebe os PASSOS já executados (com código de saída real) por um arquivo de
// entrada e delega ao gerador, que decide o resultado. Não existe parâmetro que
// afirme aprovação: se algum passo trouxer código != 0, nada é escrito.
//
//   npx tsx scripts/gerar-evidencia.ts --entrada <arquivo.json>
//
// O arquivo de entrada é produzido pela execução real (aplicação de migrations,
// download autenticado, smoke do provedor) e contém apenas fatos observados.

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { readdirSync } from "node:fs";
import { gerarEvidencia } from "../src/v2/gerador-evidencia.js";
import type {
  ArtefatoEvidencia,
  EstadoRemoto,
  ExecucoesReaisEvidencia,
  FingerprintsCodigo,
  TipoEvidencia,
} from "../src/v2/evidencia-externa.js";

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const RAIZ = path.resolve(AQUI, "..", "..");
const DIR_WORKER = path.resolve(AQUI, "..");

function arg(nome: string): string | undefined {
  const i = process.argv.indexOf(nome);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

function listar(dir: string, filtro: RegExp): string[] {
  if (!existsSync(dir)) return [];
  const saida: string[] = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) saida.push(...listar(p, filtro));
    else if (filtro.test(e.name)) saida.push(p);
  }
  return saida;
}

function hashDe(arquivos: string[]): string {
  const h = createHash("sha256");
  for (const a of arquivos.sort()) {
    h.update(a);
    try {
      h.update(readFileSync(a));
    } catch {
      h.update("<ausente>");
    }
  }
  return h.digest("hex").slice(0, 16);
}

/** Mesma receita do `prontidao.ts`: a evidência caduca junto com o código. */
function fingerprints(): FingerprintsCodigo {
  return {
    migrations_source_hash: hashDe(listar(path.join(RAIZ, "supabase"), /\.sql$/)),
    contratos_hash: hashDe(listar(path.join(DIR_WORKER, "skills-v2"), /contrato\.json$/)),
    worker_hash: hashDe(listar(path.join(DIR_WORKER, "src"), /\.ts$/).filter((f) => !/\.test\.ts$/.test(f))),
    interface_hash: hashDe(listar(path.join(RAIZ, "src"), /\.tsx?$/).filter((f) => !/\.test\.tsx?$/.test(f))),
  };
}

interface Entrada {
  tipo: TipoEvidencia;
  ambiente: "local" | "staging" | "producao";
  supabase_project_ref: string;
  project_id: string;
  executor_ref: string;
  caminhosLimpeza: string[];
  passos: { nome: string; comando?: string; exit_code: number | null; saida: string }[];
  remoto?: Omit<EstadoRemoto, "remote_schema_hash">;
  artefatos?: ArtefatoEvidencia[];
  execucoes_reais?: ExecucoesReaisEvidencia;
}

const caminho = arg("--entrada");
if (!caminho || !existsSync(caminho)) {
  console.error("uso: npx tsx scripts/gerar-evidencia.ts --entrada <arquivo.json>");
  process.exit(1);
}

const e = JSON.parse(readFileSync(caminho, "utf8")) as Entrada;

const r = await gerarEvidencia({
  tipo: e.tipo,
  ambiente: e.ambiente,
  supabase_project_ref: e.supabase_project_ref,
  project_id: e.project_id,
  executor_ref: e.executor_ref,
  raiz: RAIZ,
  fingerprints: fingerprints(),
  caminhosLimpeza: e.caminhosLimpeza,
  // Os passos já rodaram: o harness apenas transporta o código de saída real.
  // Nenhum deles é re-executado aqui, e nenhum pode ser "declarado" aprovado.
  passos: e.passos.map((p) => ({
    nome: p.nome,
    comando: p.comando,
    executar: () => ({ exit_code: p.exit_code, saida: p.saida }),
  })),
  introspectar: e.remoto ? async () => e.remoto! : undefined,
  baixarArtefatos: e.artefatos ? async () => e.artefatos! : undefined,
  execucoesReais: e.execucoes_reais ? async () => e.execucoes_reais! : undefined,
});

console.log(`evidência gravada: ${path.relative(RAIZ, r.caminho)}`);
console.log(`  commit testado: ${r.evidencia.tested_code_commit.slice(0, 7)}`);
console.log(`  passos: ${r.evidencia.passos.length} · artefatos: ${r.evidencia.artefatos.length}`);
