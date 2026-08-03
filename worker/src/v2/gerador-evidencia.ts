// Gerador de evidência externa.
//
// A única forma legítima de produzir um arquivo em `.evidencias/`. Não existe
// parâmetro que diga "aprovado": o resultado é DERIVADO dos códigos de saída dos
// passos que realmente rodaram. Se qualquer passo falha, o gerador não escreve
// arquivo nenhum — não há evidência parcial, nem evidência de execução que
// morreu no meio.
//
// Gravação atômica (tmp + rename) porque um arquivo truncado por interrupção
// seria lido depois como evidência válida-mas-incompleta.

import { renameSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import path from "node:path";
import { capturarHead, worktreeLimpa } from "./execucao.js";
import {
  DIR_EVIDENCIAS,
  SCHEMA_EVIDENCIA,
  hashIntrospeccao,
  sanitizarLog,
  TIPOS_COM_ARTEFATO,
  TIPOS_COM_REMOTO,
  type ArtefatoEvidencia,
  type EstadoRemoto,
  type EvidenciaExterna,
  type ExecucoesReaisEvidencia,
  type FingerprintsCodigo,
  type PassoEvidencia,
  type TipoEvidencia,
} from "./evidencia-externa.js";

/** Um passo executável. O gerador chama; ninguém informa o resultado. */
export interface PassoExecutavel {
  nome: string;
  comando?: string;
  /** Executa e devolve código de saída e saída bruta. */
  executar: () => Promise<{ exit_code: number | null; saida: string }> | { exit_code: number | null; saida: string };
}

export interface OpcoesGerador {
  tipo: TipoEvidencia;
  ambiente: EvidenciaExterna["ambiente"];
  supabase_project_ref: string;
  project_id: string;
  executor_ref: string;
  raiz: string;
  fingerprints: FingerprintsCodigo;
  /** Caminhos que precisam estar limpos para a evidência valer. */
  caminhosLimpeza: string[];
  passos: PassoExecutavel[];
  /** Introspecção do banco real; obrigatória para tipos que tocam o banco. */
  introspectar?: () => Promise<Omit<EstadoRemoto, "remote_schema_hash">>;
  /** Baixa artefatos e devolve nome/hash/bytes do que REALMENTE veio. */
  baixarArtefatos?: () => Promise<ArtefatoEvidencia[]>;
  /** Ledger observado; obrigatório para a prova dos 11 papéis e da cascata. */
  execucoesReais?: () => Promise<ExecucoesReaisEvidencia>;
  agora?: () => string;
}

export class ErroGerador extends Error {}

export interface ResultadoGeracao {
  caminho: string;
  evidencia: EvidenciaExterna;
}

export async function gerarEvidencia(opts: OpcoesGerador): Promise<ResultadoGeracao> {
  // 1. Worktree limpa ANTES de qualquer coisa: se o código na máquina não é o do
  //    commit, a evidência já nasce apontando para algo que não foi testado.
  const limpeza = worktreeLimpa(opts.raiz, opts.caminhosLimpeza);
  if (!limpeza.limpa) {
    throw new ErroGerador(
      `worktree suja em ${limpeza.sujos.length} caminho(s): ${limpeza.sujos.slice(0, 5).join(", ")} — commite ou reverta antes de gerar evidência`
    );
  }

  // 2. HEAD real. `capturarHead` lança em vez de devolver rótulo.
  const commit = capturarHead(opts.raiz);

  // 3. Passos. Um erro aqui aborta: evidência não sai de execução incompleta.
  const passos: PassoEvidencia[] = [];
  const erros: string[] = [];
  for (const p of opts.passos) {
    let exit_code: number | null = null;
    let saida = "";
    try {
      const r = await p.executar();
      exit_code = r.exit_code;
      saida = r.saida;
    } catch (e) {
      exit_code = null;
      saida = e instanceof Error ? e.message : String(e);
    }
    const log = sanitizarLog(saida).trim();
    const passo: PassoEvidencia = {
      passo: p.nome,
      comando: p.comando ? sanitizarLog(p.comando) : undefined,
      exit_code,
      // Derivado do código de saída. Não há caminho para afirmar aprovação.
      resultado: exit_code === 0 ? "aprovado" : "reprovado",
      // Passo sem saída não comprova execução; registramos isso explicitamente
      // em vez de gravar string vazia, que a validação rejeitaria sem dizer por quê.
      log: log || `(sem saída; exit_code=${String(exit_code)})`,
    };
    passos.push(passo);
    if (exit_code !== 0) {
      erros.push(`passo '${p.nome}' falhou com exit_code ${String(exit_code)}`);
      throw new ErroGerador(
        `execução reprovada no passo '${p.nome}' (exit_code ${String(exit_code)}) — nenhuma evidência foi escrita`
      );
    }
  }

  // 4. Introspecção real do banco, quando o tipo exige.
  let remoto: EstadoRemoto | null = null;
  if (TIPOS_COM_REMOTO.includes(opts.tipo)) {
    if (!opts.introspectar) throw new ErroGerador(`${opts.tipo} exige introspecção do banco real`);
    const dump = await opts.introspectar();
    remoto = { ...dump, remote_schema_hash: hashIntrospeccao(dump) };
    if (!remoto.migrations_applied.length) {
      throw new ErroGerador("introspecção não observou nenhuma migration aplicada");
    }
  }

  // 5. Artefatos realmente baixados, quando o tipo exige.
  let artefatos: ArtefatoEvidencia[] = [];
  if (TIPOS_COM_ARTEFATO.includes(opts.tipo)) {
    if (!opts.baixarArtefatos) throw new ErroGerador(`${opts.tipo} exige download de artefato`);
    artefatos = await opts.baixarArtefatos();
    if (!artefatos.length) throw new ErroGerador("nenhum artefato baixado — download não comprovado");
    const vazio = artefatos.find((a) => !a.bytes);
    if (vazio) throw new ErroGerador(`artefato '${vazio.nome}' veio com 0 byte — download falhou`);
  }

  let execucoes_reais: ExecucoesReaisEvidencia | undefined;
  if (opts.tipo === "papeis_reais") {
    if (!opts.execucoesReais) throw new ErroGerador("papeis_reais exige consulta do ledger engine_runs");
    execucoes_reais = await opts.execucoesReais();
    if (!execucoes_reais.papeis.length) throw new ErroGerador("ledger não observou nenhuma execução real");
  }

  const evidencia: EvidenciaExterna = {
    schema: SCHEMA_EVIDENCIA,
    tipo: opts.tipo,
    executado_em: (opts.agora ?? (() => new Date().toISOString()))(),
    ambiente: opts.ambiente,
    supabase_project_ref: opts.supabase_project_ref,
    project_id: opts.project_id,
    executor_ref: opts.executor_ref,
    tested_code_commit: commit,
    worktree_limpa: true,
    fingerprints: opts.fingerprints,
    remoto,
    execucoes_reais,
    passos,
    artefatos,
    erros,
    // Só chega aqui se todo passo saiu com 0 — qualquer falha já lançou acima.
    resultado: "aprovado",
  };

  const dir = path.join(opts.raiz, DIR_EVIDENCIAS);
  mkdirSync(dir, { recursive: true });
  const destino = path.join(dir, `${opts.tipo}.json`);
  const tmp = `${destino}.tmp`;
  // Atômico: um arquivo truncado por interrupção seria lido depois como
  // evidência incompleta, e "incompleta" é justamente o que não pode certificar.
  writeFileSync(tmp, JSON.stringify(evidencia, null, 2), "utf8");
  try {
    renameSync(tmp, destino);
  } catch (e) {
    rmSync(tmp, { force: true });
    throw new ErroGerador(`não foi possível gravar a evidência: ${e instanceof Error ? e.message : String(e)}`);
  }
  return { caminho: destino, evidencia };
}
