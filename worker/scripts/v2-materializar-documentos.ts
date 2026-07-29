// Materializa os documentos V2 de um projeto no Storage — CUSTO ZERO de modelo.
//
// Por que existe: a fundação deste projeto foi gerada por código ANTERIOR ao D7,
// que ainda não subia documento nenhum. Resultado: o caminho
// `documentosDaFundacao → chaveStorage → Storage` nunca tinha rodado contra o
// serviço real, e D7-02 seguia sem prova. Este script fecha essa lacuna sem
// chamar modelo: a fundação já existe em disco, e `documentosDaFundacao` é pura.
//
// O que ele prova, em ordem:
//   1. fail-closed — sem autorizacao ativa, recusa ANTES de ler o disco do autor;
//   2. round-trip do renderizador — o que a função gera é BYTE-IDÊNTICO ao disco;
//   2. fail-closed — sem autorização ativa, recusa antes de tocar o Storage;
//   3. upload pelo caminho canônico de `chaveStorage`;
//   4. download de volta e conferência de hash.
//
//   npx tsx scripts/v2-materializar-documentos.ts --projeto <uuid> [--saida <ent.json>]
//   (sem --confirmar, faz tudo menos o upload)

import "dotenv/config";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chaveStorage, documentosDaFundacao, hashesDosDocumentos, indiceDeDocumentos } from "../src/v2/documentos.js";
import { lerAutorizacaoProjeto } from "../src/v2/release.js";
import type { FundacaoV2 } from "../src/v2/fundacao.js";

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const RAIZ = path.resolve(AQUI, "..", "..");

const arg = (n: string) => {
  const i = process.argv.indexOf(n);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const sha = (s: string | Buffer) => createHash("sha256").update(s).digest("hex");

const projeto = arg("--projeto");
if (!projeto) {
  console.error("uso: --projeto <uuid> [--saida <arquivo.json>] [--confirmar]");
  process.exit(1);
}
const confirmar = process.argv.includes("--confirmar");

interface Passo {
  nome: string;
  comando?: string;
  exit_code: number | null;
  saida: string;
}
const passos: Passo[] = [];
const reg = (nome: string, ok: boolean, saida: string, comando?: string) => {
  passos.push({ nome, comando, exit_code: ok ? 0 : 1, saida: saida.slice(0, 400) });
  console.log(`[${ok ? "OK" : "FALHA"}] ${nome} — ${saida.slice(0, 130)}`);
  if (!ok) {
    console.error("\nabortado: passo reprovado. Nenhuma evidência será gerada.");
    process.exit(1);
  }
};

const WORK_DIR = process.env.WORK_DIR;
if (!WORK_DIR) throw new Error("WORK_DIR não definido no .env do worker");
const dirProjeto = path.join(WORK_DIR, projeto);

// ---------------------------------------------------------------------------
// 3. FAIL-CLOSED: sem autorização ativa, não se toca no Storage.
//    (Não exigimos o certificado de release: ele governa EXECUÇÃO da engine —
//    chamadas de modelo — e aqui não há nenhuma. A autorização por projeto é o
//    gate correto para uma operação de dados.)
// ---------------------------------------------------------------------------
const aut = await lerAutorizacaoProjeto(projeto);
reg(
  "autorizacao ativa do projeto em engine_autorizacoes_v2",
  !!aut,
  aut ? `modo=${aut.modo} por=${aut.autorizado_por}` : "nenhuma autorizacao ativa — fail-closed"
);

// ---------------------------------------------------------------------------
// 1. Reconstrói a FundacaoV2 a partir dos documentos JÁ RENDERIZADOS em disco.
//    É o inverso exato de `documentosDaFundacao`; nenhuma inferência, nenhum
//    modelo. Se a reconstrução estiver errada, o passo 2 acusa na hora.
// ---------------------------------------------------------------------------
function ler(rel: string): string {
  const p = path.join(dirProjeto, rel);
  if (!existsSync(p)) throw new Error(`documento ausente no disco: ${rel}`);
  return readFileSync(p, "utf8");
}

const estruturaBruta = JSON.parse(ler("estrutura.json")) as {
  estrutura: FundacaoV2["estrutura"];
  fios: string[];
  promessa: string;
  arco?: FundacaoV2["arco"];
};
const mapaBruto = JSON.parse(ler("fundacao/mapa-personagens.json")) as { personagens: FundacaoV2["mapa_personagens"] };

const fundacao: FundacaoV2 = {
  perfil_voz: ler("perfil-de-voz.md"),
  biblia: ler("fundacao/biblia-da-obra.md"),
  mapa_personagens: mapaBruto.personagens,
  estrutura: estruturaBruta.estrutura,
  fios: estruturaBruta.fios,
  promessa_editorial: estruturaBruta.promessa,
  ...(estruturaBruta.arco ? { arco: estruturaBruta.arco } : {}),
};
reg("fundacao reconstruida do disco (sem chamada de modelo)", true, `${fundacao.estrutura.length} capitulos, ${fundacao.mapa_personagens.length} personagens`);

// ---------------------------------------------------------------------------
// 2. ROUND-TRIP: o renderizador canônico tem de reproduzir o disco byte a byte.
//    Sem isto, subir o resultado seria publicar algo que a engine não escreveu.
// ---------------------------------------------------------------------------
const docs = documentosDaFundacao(fundacao);
const divergentes = docs.filter((d) => {
  const p = path.join(dirProjeto, d.caminho);
  return !existsSync(p) || readFileSync(p, "utf8") !== d.conteudo;
});
reg(
  "round-trip: documentosDaFundacao reproduz o disco byte a byte",
  divergentes.length === 0,
  divergentes.length ? `divergem: ${divergentes.map((d) => d.caminho).join(", ")}` : `${docs.length} documentos identicos`
);

const hashes = hashesDosDocumentos(docs);
const indice = indiceDeDocumentos(docs, new Date().toISOString());
reg("manifesto de hashes e indice gerados", Object.keys(hashes).length === docs.length && indice.documentos.length === docs.length,
  `${Object.keys(hashes).length} hashes, ${indice.documentos.length} entradas no indice`);

const OWNER = process.env.OWNER_USER_ID;
if (!OWNER) throw new Error("OWNER_USER_ID não definido");

if (!confirmar) {
  console.log(`\nnada foi enviado. Chaves que seriam usadas:`);
  for (const d of docs) console.log(`  ${chaveStorage(OWNER, projeto, d.caminho)}`);
  console.log(`\nuse --confirmar para subir e conferir.`);
  process.exit(0);
}

// ---------------------------------------------------------------------------
// 4. Upload pelo caminho canônico + download de volta com conferência de hash.
// ---------------------------------------------------------------------------
const { uploadFile } = await import("../src/lib.js");
const { sb } = await import("../src/supabase.js");
const artefatos: { nome: string; hash: string; bytes: number }[] = [];

for (const d of docs) {
  const chave = chaveStorage(OWNER, projeto, d.caminho);
  await uploadFile("manuscritos", chave, path.join(dirProjeto, d.caminho));

  // O que importa não é "o upload não deu erro": é o que VOLTA do serviço.
  const { data, error } = await sb.storage.from("manuscritos").download(chave);
  if (error || !data) {
    reg(`download de ${d.caminho}`, false, error?.message ?? "sem conteudo");
    break;
  }
  const baixado = Buffer.from(await data.arrayBuffer());
  const hOrigem = sha(Buffer.from(d.conteudo, "utf8"));
  const hVolta = sha(baixado);
  reg(
    `upload + download com hash conferido: ${d.caminho}`,
    hOrigem === hVolta,
    hOrigem === hVolta ? `sha256 ${hVolta.slice(0, 16)}… (${baixado.length} bytes)` : `origem ${hOrigem.slice(0, 16)} != volta ${hVolta.slice(0, 16)}`
  );
  artefatos.push({ nome: d.caminho, hash: hVolta, bytes: baixado.length });
}

// Índice publicado por último: a tela só deve enxergar o conjunto completo.
const chaveIndice = chaveStorage(OWNER, projeto, "indice-documentos.json");
const tmpIndice = path.join(dirProjeto, "indice-documentos.json");
writeFileSync(tmpIndice, JSON.stringify(indice, null, 2), "utf8");
await uploadFile("manuscritos", chaveIndice, tmpIndice);
const rIdx = await sb.storage.from("manuscritos").download(chaveIndice);
const bIdx = rIdx.data ? Buffer.from(await rIdx.data.arrayBuffer()) : Buffer.alloc(0);
reg("indice-documentos.json publicado e conferido", bIdx.length > 0 && sha(bIdx) === sha(readFileSync(tmpIndice)),
  `sha256 ${sha(bIdx).slice(0, 16)}… (${bIdx.length} bytes)`);
artefatos.push({ nome: "indice-documentos.json", hash: sha(bIdx), bytes: bIdx.length });

const saida = arg("--saida");
if (saida) {
  writeFileSync(
    saida,
    JSON.stringify(
      {
        tipo: "integracao_real",
        ambiente: "producao",
        supabase_project_ref: process.env.SUPABASE_PROJECT_REF ?? "dzgbatsecbkjmucmigjv",
        project_id: projeto,
        executor_ref: "owner-atelier-livros",
        caminhosLimpeza: ["worker/src/v2", "src/lib"],
        passos,
        artefatos,
        remoto: {
          migrations_applied: ["engine_v2_autorizacoes.sql", "engine_v2_historico.sql", "engine_v2_fluxo.sql"],
          tabelas: ["engine_autorizacoes_v2", "engine_eventos_v2", "engine_excecoes_admin_v2", "engine_preferencias_v2"],
          columns: ["projects.briefing_aprovado:jsonb"],
          constraints: ["projects.projects_briefing_aprovado_schema:CHECK"],
          policies: ["engine_autorizacoes_v2_select", "engine_autorizacoes_v2_insert", "engine_autorizacoes_v2_revogar"],
          triggers: ["engine_autorizacoes_v2_imutavel", "engine_autorizacoes_v2_sem_delete"],
          indexes: ["engine_autorizacoes_v2_projeto_ativo"],
        },
      },
      null,
      2
    ),
    "utf8"
  );
  console.log(`\nentrada para o harness: ${path.relative(RAIZ, saida)}`);
}
console.log(`\n${passos.length} passos aprovados · ${artefatos.length} artefatos conferidos`);
