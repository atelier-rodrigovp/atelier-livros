// Evidência de verificação EXTERNA — o que um teste local não pode provar.
//
// ONDE VIVE (decisão, não híbrido): FORA do Git, em `.evidencias/` (ignorado).
// A v1 dizia "documento versionado" e se contradizia: a evidência apontava para
// o HEAD X, commitá-la criava o HEAD Y e o próprio prontidão a invalidava no
// commit seguinte. Pior: o remoto é PÚBLICO, e evidência carrega project id,
// caminhos de Storage e logs de execução.
//
// COMO CADUCA: não por commit, e sim por FINGERPRINT do código. A evidência
// registra `tested_code_commit` para rastreabilidade e guarda o hash das fontes
// que ela de fato exercitou (migrations, contratos, worker, interface). Mudou
// qualquer uma, a evidência morre sozinha. Commitar documentação depois não a
// invalida — e mexer no worker, sim. É o que se quer nos dois casos.
//
// COMO É PRODUZIDA: só pelo gerador (`gerador-evidencia.ts`), a partir de
// execução real com código de saída capturado. JSON escrito à mão não passa:
// sem passos com `exit_code`, sem log e sem introspecção do banco, a validação
// recusa.

import { createHash } from "node:crypto";
import { PAPEIS_ENGINE_V2, type Papel } from "./tipos.js";

export const SCHEMA_EVIDENCIA = "evidencia-externa/v2";

/** Onde as evidências vivem. Relativo à raiz do repo, fora do versionamento. */
export const DIR_EVIDENCIAS = ".evidencias";

export type TipoEvidencia =
  | "migracoes_remotas"
  | "integracao_real"
  | "ui_autenticada"
  | "provedor_real"
  | "papeis_reais";

export type ResultadoEvidencia = "aprovado" | "reprovado";

/** Tipos que tocam o banco e por isso devem trazer introspecção real. */
export const TIPOS_COM_REMOTO: TipoEvidencia[] = ["migracoes_remotas", "integracao_real"];

/** Tipos que baixam artefato e por isso devem provar o que baixaram. */
export const TIPOS_COM_ARTEFATO: TipoEvidencia[] = ["integracao_real", "ui_autenticada"];

export interface ArtefatoEvidencia {
  nome: string;
  /** Hash do conteúdo REALMENTE baixado, não do que se esperava. */
  hash: string;
  /** Bytes recebidos — pega download que "abriu" e veio vazio. */
  bytes: number;
}

export interface PassoEvidencia {
  passo: string;
  /** Comando executado, já sanitizado. */
  comando?: string;
  /** Código de saída real. `null` só quando o processo nem existiu. */
  exit_code: number | null;
  resultado: ResultadoEvidencia;
  /** Saída sanitizada. Passo sem log não comprova execução. */
  log: string;
}

/**
 * Impressão do CÓDIGO que a verificação exercitou. É por aqui que a evidência
 * caduca — não pelo commit, que muda a cada arquivo de documentação.
 */
export interface FingerprintsCodigo {
  /** Hash dos arquivos .sql locais (a FONTE das migrations). */
  migrations_source_hash: string;
  contratos_hash: string;
  worker_hash: string;
  interface_hash: string;
}

/**
 * O que foi observado NO BANCO REAL. Separado das fontes de propósito: hash de
 * arquivo .sql local não diz nada sobre o schema que está no Supabase — a v1
 * chamava um de outro, e isso é o tipo de erro que certifica o que não existe.
 */
export interface EstadoRemoto {
  /** Hash do dump/introspecção normalizado do banco. */
  remote_schema_hash: string;
  /** Migrations efetivamente observadas como aplicadas. */
  migrations_applied: string[];
  tabelas: string[];
  /** Colunas relevantes no formato schema.tabela.coluna:tipo. */
  columns: string[];
  /** Constraints relevantes no formato schema.tabela.constraint:tipo. */
  constraints: string[];
  policies: string[];
  triggers: string[];
  indexes: string[];
}

/** Linha real observada em `engine_runs`; nunca mock/fixture. */
export interface RunRealEvidencia {
  papel: Papel;
  run_id: string;
  project_id: string;
  alvo: string;
  status: "ok";
  model_provider: string;
  model_name: string;
  parent_run_id: string | null;
  output_hash: string;
  started_at: string;
  finished_at: string;
}

/** Duas passadas reais, sobre o mesmo alvo e no projeto exclusivo de prova. */
export interface CascataRealEvidencia {
  project_id: string;
  alvo: string;
  triagem_run_id: string;
  decisao_run_id: string;
  gatilho: string;
  veredito_triagem: string;
  veredito_consolidado: string;
}

export interface ExecucoesReaisEvidencia {
  papeis: RunRealEvidencia[];
  cascata: CascataRealEvidencia;
}

export interface EvidenciaExterna {
  schema: typeof SCHEMA_EVIDENCIA;
  tipo: TipoEvidencia;
  executado_em: string;
  ambiente: "local" | "staging" | "producao";
  /** Ref do projeto Supabase. Evidência de outro projeto é recusada. */
  supabase_project_ref: string;
  /** Projeto de livro usado na verificação. */
  project_id: string;
  /** Identificador técnico do executor. Nunca e-mail nem nome. */
  executor_ref: string;
  /** Commit que estava em HEAD quando rodou. Rastreabilidade, não chave. */
  tested_code_commit: string;
  /** A verificação exige worktree limpa nos caminhos que ela exercita. */
  worktree_limpa: boolean;
  fingerprints: FingerprintsCodigo;
  remoto: EstadoRemoto | null;
  /** Obrigatório apenas em `papeis_reais`; observado por consulta ao ledger. */
  execucoes_reais?: ExecucoesReaisEvidencia;
  passos: PassoEvidencia[];
  artefatos: ArtefatoEvidencia[];
  erros: string[];
  resultado: ResultadoEvidencia;
}

export interface ValidacaoEvidencia {
  valida: boolean;
  motivos: string[];
}

const CAMPOS_FINGERPRINT: (keyof FingerprintsCodigo)[] = [
  "migrations_source_hash",
  "contratos_hash",
  "worker_hash",
  "interface_hash",
];

/**
 * Remove o que não pode chegar a um arquivo de log. O remoto é público e a
 * evidência circula: chave de service role, token e e-mail não passam daqui.
 */
export function sanitizarLog(texto: string): string {
  return texto
    .replace(/\b(eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,})\b/g, "<jwt-removido>")
    .replace(/\b(sb[ps]?_[A-Za-z0-9_-]{16,})\b/gi, "<chave-removida>")
    .replace(/\b(SUPABASE_SERVICE_ROLE|SERVICE_ROLE_KEY|ANON_KEY|ANTHROPIC_API_KEY)\s*[=:]\s*\S+/gi, "$1=<removido>")
    .replace(/https?:\/\/[A-Za-z0-9-]+\.supabase\.(co|in)\S*/g, "<url-supabase-removida>")
    .replace(/\b[\w.+-]+@[\w-]+\.[\w.]+\b/g, "<email-removido>")
    .replace(/\b(Bearer|apikey)\s+\S+/gi, "$1 <removido>");
}

/** Sinais de que um segredo escapou para dentro da evidência. */
const SEGREDO = [/eyJ[A-Za-z0-9_-]{10,}\./, /\bsb[ps]?_[A-Za-z0-9_-]{16,}/i, /[\w.+-]+@[\w-]+\.[\w.]+/, /\.supabase\.(co|in)/];

export function contemSegredo(valor: string): boolean {
  return SEGREDO.some((r) => r.test(valor));
}

export interface EsperadoEvidencia {
  tipo: TipoEvidencia;
  ambiente: EvidenciaExterna["ambiente"];
  supabase_project_ref: string;
  fingerprints: FingerprintsCodigo;
}

/**
 * Uma evidência só vale para o ambiente e o projeto pedidos e para o CÓDIGO
 * atual. Qualquer divergência a invalida — nunca "aproveita" a antiga.
 */
export function validarEvidencia(ev: unknown, esperado: EsperadoEvidencia): ValidacaoEvidencia {
  const motivos: string[] = [];
  if (!ev || typeof ev !== "object") return { valida: false, motivos: ["evidência ausente ou não é um objeto"] };
  const e = ev as Partial<EvidenciaExterna>;

  if (e.schema !== SCHEMA_EVIDENCIA) motivos.push(`schema inesperado: ${String(e.schema)}`);
  if (e.tipo !== esperado.tipo) motivos.push(`tipo ${String(e.tipo)} não atesta ${esperado.tipo}`);

  // Falha NUNCA vira aprovação: resultado, passos e erros precisam concordar.
  if (e.resultado !== "aprovado") motivos.push(`resultado é ${String(e.resultado)}`);
  if (Array.isArray(e.erros) && e.erros.length > 0) motivos.push(`${e.erros.length} erro(s) registrados`);

  // Execução real deixa rastro: passo sem código de saída e sem log é
  // afirmação, não verificação. É o que separa isto de um JSON artesanal.
  if (!Array.isArray(e.passos) || e.passos.length === 0) {
    motivos.push("nenhum passo registrado — evidência não comprova execução");
  } else {
    for (const p of e.passos) {
      if (!p || typeof p !== "object") {
        motivos.push("passo malformado");
        continue;
      }
      if (p.resultado !== "aprovado") motivos.push(`passo não aprovado: ${p.passo}`);
      if (p.exit_code !== 0) motivos.push(`passo '${p.passo}' com exit_code ${String(p.exit_code)}`);
      if (!p.log || !String(p.log).trim()) motivos.push(`passo '${p.passo}' sem log — execução não comprovada`);
    }
  }

  if (e.ambiente !== esperado.ambiente) motivos.push(`ambiente ${String(e.ambiente)} ≠ ${esperado.ambiente}`);
  if (e.supabase_project_ref !== esperado.supabase_project_ref) {
    motivos.push(`projeto Supabase ${String(e.supabase_project_ref)} ≠ ${esperado.supabase_project_ref}`);
  }
  if (!e.project_id) motivos.push("project_id ausente");
  if (!e.executor_ref) motivos.push("executor_ref ausente");
  if (!e.executado_em || Number.isNaN(Date.parse(e.executado_em))) motivos.push("executado_em ausente ou inválido");

  // HEAD desconhecido não certifica. A v1 aceitava a string "desconhecido"
  // porque a captura do git falhava calada no Windows.
  if (!e.tested_code_commit || !/^[0-9a-f]{40}$/.test(String(e.tested_code_commit))) {
    motivos.push(`tested_code_commit ausente ou não é um SHA: ${String(e.tested_code_commit)}`);
  }
  if (e.worktree_limpa !== true) motivos.push("worktree não estava limpa na execução");

  // O coração da caducidade: a evidência morre quando o código que ela mediu muda.
  const fp = e.fingerprints;
  if (!fp || typeof fp !== "object") motivos.push("fingerprints ausentes");
  else {
    for (const campo of CAMPOS_FINGERPRINT) {
      if (!fp[campo]) {
        motivos.push(`fingerprints.${campo} ausente`);
        continue;
      }
      if (fp[campo] !== esperado.fingerprints[campo]) {
        motivos.push(`fingerprints.${campo} mudou desde a verificação`);
      }
    }
  }

  // Verificação que toca o banco precisa trazer o que VIU lá, não o hash dos
  // .sql locais. Eram campos diferentes chamados pelo mesmo nome na v1.
  if (TIPOS_COM_REMOTO.includes(esperado.tipo)) {
    const r = e.remoto;
    if (!r || typeof r !== "object") {
      motivos.push("sem introspecção do banco real (remoto ausente)");
    } else {
      if (!r.remote_schema_hash) motivos.push("remote_schema_hash ausente");
      if (r.remote_schema_hash === fp?.migrations_source_hash) {
        motivos.push("remote_schema_hash igual ao hash das fontes — não houve introspecção real");
      }
      if (!Array.isArray(r.migrations_applied) || r.migrations_applied.length === 0) {
        motivos.push("nenhuma migration observada como aplicada");
      }
      if (!Array.isArray(r.tabelas) || r.tabelas.length === 0) motivos.push("nenhuma tabela observada");
      if (!Array.isArray(r.columns) || r.columns.length === 0) motivos.push("nenhuma coluna observada");
      if (!Array.isArray(r.constraints) || r.constraints.length === 0) motivos.push("nenhuma constraint observada");
      if (!Array.isArray(r.policies) || r.policies.length === 0) motivos.push("nenhuma policy observada");
      if (!Array.isArray(r.triggers) || r.triggers.length === 0) motivos.push("nenhum trigger observado");
      if (!Array.isArray(r.indexes) || r.indexes.length === 0) motivos.push("nenhum índice observado");
    }
  }

  if (TIPOS_COM_ARTEFATO.includes(esperado.tipo)) {
    if (!Array.isArray(e.artefatos) || e.artefatos.length === 0) motivos.push("nenhum artefato baixado registrado");
    else {
      for (const a of e.artefatos) {
        if (!a?.hash) motivos.push(`artefato ${a?.nome ?? "?"} sem hash`);
        if (!a?.bytes) motivos.push(`artefato ${a?.nome ?? "?"} com 0 byte`);
      }
    }
  }

  if (esperado.tipo === "papeis_reais") {
    const x = e.execucoes_reais;
    if (!x || typeof x !== "object" || !Array.isArray(x.papeis)) {
      motivos.push("execuções reais dos papéis ausentes");
    } else {
      const esperados = new Set<string>(PAPEIS_ENGINE_V2);
      const vistos = new Set<string>();
      const porRun = new Map<string, RunRealEvidencia>();
      for (const run of x.papeis) {
        if (!run || typeof run !== "object") {
          motivos.push("run real malformado");
          continue;
        }
        if (!esperados.has(run.papel)) motivos.push(`papel inesperado: ${String(run.papel)}`);
        if (vistos.has(run.papel)) motivos.push(`papel duplicado na evidência: ${run.papel}`);
        vistos.add(run.papel);
        const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
        if (!uuid.test(run.run_id ?? "")) motivos.push(`${run.papel}: run_id inválido`);
        if (!uuid.test(run.project_id ?? "")) motivos.push(`${run.papel}: project_id inválido`);
        if (run.status !== "ok") motivos.push(`${run.papel}: status ${String(run.status)} não comprova sucesso real`);
        if (!run.alvo?.trim()) motivos.push(`${run.papel}: alvo ausente`);
        const provedor = run.model_provider?.toLowerCase() ?? "";
        if (!provedor.includes("claude") || provedor.includes("mock") || provedor.includes("fixture")) {
          motivos.push(`${run.papel}: provedor não comprova modelo real (${run.model_provider || "ausente"})`);
        }
        // O ledger legado gravava os aliases fechados aceitos pelo próprio worker
        // (`opus`, `sonnet`, `haiku`). Eles continuam sendo Claude real quando o
        // provedor também é Claude; qualquer outro apelido ou híbrido é recusado.
        const modelo = run.model_name?.trim() ?? "";
        const modeloClaudeReal = /^claude-/i.test(modelo) || /^(?:opus|sonnet|haiku)$/i.test(modelo);
        if (!modeloClaudeReal || /mock|fixture/i.test(modelo)) {
          motivos.push(`${run.papel}: modelo não comprova Claude real (${run.model_name || "ausente"})`);
        }
        if (!/^[0-9a-f]{64}$/i.test(run.output_hash ?? "")) motivos.push(`${run.papel}: output_hash inválido`);
        if (!Number.isFinite(Date.parse(run.started_at)) || !Number.isFinite(Date.parse(run.finished_at))) {
          motivos.push(`${run.papel}: timestamps inválidos`);
        }
        porRun.set(run.run_id, run);
      }
      for (const papel of PAPEIS_ENGINE_V2) {
        if (!vistos.has(papel)) motivos.push(`papel sem execução real: ${papel}`);
      }
      if (x.papeis.length !== PAPEIS_ENGINE_V2.length) {
        motivos.push(`esperadas ${PAPEIS_ENGINE_V2.length} execuções, recebidas ${x.papeis.length}`);
      }

      const cascata = x.cascata;
      if (!cascata || typeof cascata !== "object") {
        motivos.push("cascata real ausente");
      } else {
        const triagem = porRun.get(cascata.triagem_run_id);
        const decisao = porRun.get(cascata.decisao_run_id);
        if (triagem?.papel !== "revisor_literario") motivos.push("cascata: triagem_run_id não aponta para revisor_literario");
        if (decisao?.papel !== "revisor_decisao") motivos.push("cascata: decisao_run_id não aponta para revisor_decisao");
        if (!triagem || !decisao || triagem.project_id !== cascata.project_id || decisao.project_id !== cascata.project_id) {
          motivos.push("cascata: as duas passadas não pertencem ao projeto declarado");
        }
        if (!triagem || !decisao || triagem.alvo !== cascata.alvo || decisao.alvo !== cascata.alvo) {
          motivos.push("cascata: as duas passadas não julgaram o mesmo alvo");
        }
        if (!triagem || !decisao || decisao.parent_run_id !== triagem.run_id) {
          motivos.push("cascata: decisão não aponta para a triagem como parent_run_id");
        }
        if (cascata.project_id !== e.project_id) motivos.push("cascata: projeto não é o projeto exclusivo da evidência");
        if (!cascata.gatilho?.trim()) motivos.push("cascata: gatilho ausente");
        if (!cascata.veredito_triagem?.trim() || !cascata.veredito_consolidado?.trim()) {
          motivos.push("cascata: vereditos ausentes");
        }
      }
    }
  }

  // Segredo dentro da evidência é defeito de segurança, não detalhe.
  const bruto = JSON.stringify(e);
  if (contemSegredo(bruto)) motivos.push("a evidência contém credencial, URL de projeto ou e-mail — recusada");

  return { valida: motivos.length === 0, motivos };
}

/** Hash canônico de uma introspecção, para virar `remote_schema_hash`. */
export function hashIntrospeccao(dump: Omit<EstadoRemoto, "remote_schema_hash">): string {
  const canonico = JSON.stringify({
    migrations_applied: [...dump.migrations_applied].sort(),
    tabelas: [...dump.tabelas].sort(),
    columns: [...dump.columns].sort(),
    constraints: [...dump.constraints].sort(),
    policies: [...dump.policies].sort(),
    triggers: [...dump.triggers].sort(),
    indexes: [...dump.indexes].sort(),
  });
  return createHash("sha256").update(canonico).digest("hex").slice(0, 32);
}
