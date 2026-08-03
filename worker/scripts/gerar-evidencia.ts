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
import { gerarEvidencia } from "../src/v2/gerador-evidencia.js";
import { fingerprintsAtuais } from "../src/v2/fingerprints.js";
import type {
  ArtefatoEvidencia,
  EstadoRemoto,
  ExecucoesReaisEvidencia,
  TipoEvidencia,
} from "../src/v2/evidencia-externa.js";

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const RAIZ = path.resolve(AQUI, "..", "..");
const DIR_WORKER = path.resolve(AQUI, "..");

function arg(nome: string): string | undefined {
  const i = process.argv.indexOf(nome);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

// A impressão do código vem de `fingerprintsAtuais` — a MESMA função que a
// prontidão e o gate do CI usam para LER. Este arquivo já teve uma cópia local
// da receita, com o comentário "Mesma receita do prontidao.ts": era verdade até
// o PASSO 1 mudar a régua do leitor (caminho relativo + EOL normalizado) e não a
// daqui. O resultado seria evidência nascendo inválida nos QUATRO campos, com a
// mensagem "fingerprints.* mudou desde a verificação" — indistinguível de código
// que mudou de verdade. Escritor e leitor agora compartilham uma implementação
// só, e um teste quebra se uma segunda voltar a aparecer.

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
  fingerprints: fingerprintsAtuais(RAIZ, DIR_WORKER),
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
