// Impressão do CÓDIGO — a régua única pela qual a evidência externa caduca.
//
// Ficava dentro de `scripts/prontidao.ts`, privada. Saiu de lá porque o gate do
// CI (`v2-verificar-release.ts --pre-canary`) também precisa dela: enquanto a
// régua morava num script, o CI não tinha como conferir evidência vencida — e
// foi por isso que ele passou verde em 2026-08-01 com as cinco evidências já
// caducas.
//
// Não inclui o commit: a evidência caduca por fingerprint, não por HEAD — senão
// commitar um README invalidaria uma verificação remota que continua valendo.
//
// DUAS CORREÇÕES em relação à versão anterior, ambas para tirar falso positivo
// sem tirar rigor:
//
//   1. EOL normalizado antes de hashear. Lia-se os bytes do disco, e o checkout
//      converte fim de linha (`.gitattributes` só protegia
//      `worker/calibration/**`). Resultado: 4 dos 11 `.sql` divergiam do blob do
//      git sem `git status` acusar nada, e `migrations_source_hash` acendia
//      sozinho. Fim de linha não é mudança de migração.
//   2. Caminho RELATIVO à raiz, com `/`. Antes o caminho absoluto entrava no
//      hash, então o mesmo código em outro diretório dava outro hash.
//
// O que NÃO mudou: conteúdo diferente, nome diferente ou arquivo a mais/a menos
// continuam mudando o hash. É exatamente o que o gate precisa pegar.

import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { DIR_EVIDENCIAS, validarEvidencia, type FingerprintsCodigo, type TipoEvidencia } from "./evidencia-externa.js";

/** Todos os arquivos sob `dir` cujo NOME casa com o filtro, recursivamente. */
export function listarArquivos(dir: string, filtro: RegExp): string[] {
  if (!existsSync(dir)) return [];
  const saida: string[] = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) saida.push(...listarArquivos(p, filtro));
    else if (filtro.test(e.name)) saida.push(p);
  }
  return saida;
}

/** CRLF e CR viram LF. Só isso — nenhum outro byte é tocado. */
function normalizarEol(buf: Buffer): string {
  return buf.toString("utf8").replace(/\r\n?/g, "\n");
}

/**
 * Hash estável de um conjunto de arquivos: identidade = caminho relativo à raiz
 * (com `/`) + conteúdo com EOL normalizado.
 */
export function hashDeArquivos(raiz: string, arquivos: string[]): string {
  const h = createHash("sha256");
  const relativos = arquivos
    .map((a) => ({ chave: path.relative(raiz, a).split(path.sep).join("/"), caminho: a }))
    .sort((a, b) => (a.chave < b.chave ? -1 : a.chave > b.chave ? 1 : 0));
  for (const { chave, caminho } of relativos) {
    h.update(chave);
    try {
      h.update(normalizarEol(readFileSync(caminho)));
    } catch {
      h.update("<ausente>");
    }
  }
  return h.digest("hex").slice(0, 16);
}

/** As quatro impressões que uma evidência externa carimba. */
export function fingerprintsAtuais(raiz: string, dirWorker: string): FingerprintsCodigo {
  return {
    migrations_source_hash: hashDeArquivos(raiz, listarArquivos(path.join(raiz, "supabase"), /\.sql$/)),
    contratos_hash: hashDeArquivos(raiz, listarArquivos(path.join(dirWorker, "skills-v2"), /contrato\.json$/)),
    worker_hash: hashDeArquivos(
      raiz,
      listarArquivos(path.join(dirWorker, "src"), /\.ts$/).filter((f) => !/\.test\.ts$/.test(f))
    ),
    interface_hash: hashDeArquivos(
      raiz,
      listarArquivos(path.join(raiz, "src"), /\.tsx?$/).filter((f) => !/\.test\.tsx?$/.test(f))
    ),
  };
}

export const TIPOS_EVIDENCIA_EXTERNA: { tipo: TipoEvidencia; rotulo: string }[] = [
  { tipo: "migracoes_remotas", rotulo: "migrações aplicadas e verificadas no banco real" },
  { tipo: "integracao_real", rotulo: "fluxo real interface → worker → Storage com download conferido" },
  { tipo: "ui_autenticada", rotulo: "interface autenticada: abertura e download dos documentos V2" },
  { tipo: "provedor_real", rotulo: "smoke do provedor real (sem escrita literária)" },
  { tipo: "papeis_reais", rotulo: "11 papéis com modelo real e cascata em duas passadas" },
];

export interface AvaliacaoEvidencia {
  tipo: TipoEvidencia;
  rotulo: string;
  /** false = presente e inválida; null = ausente (nunca "aprovada por omissão"). */
  valida: boolean | null;
  motivos: string[];
  /** Commit que a evidência diz ter testado, quando legível. */
  testouCommit?: string;
}

/**
 * Confere TODAS as evidências externas contra o código atual, com a MESMA régua
 * de `validarEvidencia` — nunca uma segunda.
 */
export function avaliarEvidenciasExternas(opts: {
  raiz: string;
  dirWorker: string;
  ambiente: "local" | "staging" | "producao";
  supabaseProjectRef: string;
  fingerprints?: FingerprintsCodigo;
}): AvaliacaoEvidencia[] {
  const fingerprints = opts.fingerprints ?? fingerprintsAtuais(opts.raiz, opts.dirWorker);
  const dir = path.join(opts.raiz, DIR_EVIDENCIAS);
  return TIPOS_EVIDENCIA_EXTERNA.map(({ tipo, rotulo }) => {
    const arquivo = path.join(dir, `${tipo}.json`);
    if (!existsSync(arquivo)) {
      return { tipo, rotulo, valida: null, motivos: [`sem evidência em ${DIR_EVIDENCIAS}/${tipo}.json`] };
    }
    let doc: unknown;
    try {
      doc = JSON.parse(readFileSync(arquivo, "utf8"));
    } catch (e) {
      return { tipo, rotulo, valida: false, motivos: [`evidência ilegível: ${(e as Error).message}`] };
    }
    const v = validarEvidencia(doc, {
      tipo,
      ambiente: opts.ambiente,
      supabase_project_ref: opts.supabaseProjectRef,
      fingerprints,
    });
    return {
      tipo,
      rotulo,
      valida: v.valida,
      motivos: v.motivos,
      testouCommit: String((doc as { tested_code_commit?: string }).tested_code_commit ?? ""),
    };
  });
}
