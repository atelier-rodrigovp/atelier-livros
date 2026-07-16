import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { access, readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { safeResolveWithin } from "./path-safety.js";

export type ReconciliationMode = "off" | "audit" | "apply";
export type LegacyStage = "GATE_FUNDACAO" | "SPEC_CAPITULO" | "REVISAO_CAPITULO";
export type DetectorResult = "approved" | "recoverable" | "blocked" | "inconsistent";

export interface LegacyJob {
  id: string;
  tipo: string;
  project_id: string | null;
  status: string;
  payload?: Record<string, any> | null;
  progresso?: Record<string, any> | null;
  erro?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
}

export interface LegacyProject {
  id: string;
  briefing?: Record<string, any> | null;
}

export interface ArtifactAssessment {
  result: DetectorResult;
  hash: string;
  target: number | null;
  reason: string;
  blockers: string[];
}

export interface ReconciliationPlan {
  job: LegacyJob;
  project: LegacyProject;
  stage: LegacyStage;
  assessment: ArtifactAssessment;
  detectorVersion: string;
  strategy: "deterministic_revalidation" | "bounded_editorial_recovery";
}

export interface ReconciliationDecision {
  jobId: string;
  projectId: string | null;
  eligible: boolean;
  reason: string;
  plan?: ReconciliationPlan;
}

const AUTHOR_DECISION = /DECISAO_AUTORAL|DECISÃO_AUTORAL|EXCECAO_AUTORAL|EXCEÇÃO_AUTORAL|AMBIGUIDADE_AUTORAL/i;
const OPERATIONAL_BREAKER = /CIRCUIT_BREAKER_OPERACIONAL|CONFLITO_CONCORRENCIA|HASH_PROTEGIDO|STORAGE_DISCO_DIVERGENTE/i;
const SUPPORTED_TYPES = new Set(["criar_fundacao", "escrever_livro"]);
export const FOUNDATION_REQUIRED_FILES = ["briefing.md", "Biblia-da-Obra.md", "Mapa-de-Personagens.md", "Estrutura-do-Livro.md", "ESTADO_LIVRO.json"];

export function reconciliationMode(value = process.env.LEGACY_RECONCILIATION_MODE): ReconciliationMode {
  const mode = String(value ?? "audit").trim().toLowerCase();
  return mode === "apply" || mode === "off" ? mode : "audit";
}

export function reconciliationAllowlist(value = process.env.LEGACY_RECONCILIATION_PROJECTS): Set<string> | null {
  const ids = String(value ?? "").split(",").map((v) => v.trim()).filter(Boolean);
  return ids.length ? new Set(ids) : null;
}

export function shouldGenerateFoundation(payload?: Record<string, any> | null): boolean {
  return !payload?.reconciliacao_legada;
}

export function stageFromJob(job: LegacyJob): LegacyStage | null {
  const pg = job.progresso ?? {};
  const raw = String(pg.quality_stage ?? pg.stage ?? job.erro ?? "").toUpperCase();
  if (raw.includes("GATE_FUNDACAO")) return "GATE_FUNDACAO";
  if (raw.includes("SPEC_CAPITULO")) return "SPEC_CAPITULO";
  if (raw.includes("REVISAO_CAPITULO")) return "REVISAO_CAPITULO";
  return null;
}

export function targetFromState(job: LegacyJob, estado?: Record<string, any> | null): number | null {
  const pg = job.progresso ?? {};
  const candidates = [pg.quality_cap, pg.correcao?.capitulo, estado?.quality_cap];
  for (const value of candidates) {
    const n = Number(value);
    if (Number.isInteger(n) && n > 0) return n;
  }
  const capAtual = Number(pg.cap_atual ?? estado?.cap_atual);
  return Number.isInteger(capAtual) && capAtual >= 0 && stageFromJob(job) === "SPEC_CAPITULO" ? capAtual + 1 : null;
}

function blockerList(job: LegacyJob): string[] {
  const pg = job.progresso ?? {};
  return Array.isArray(pg.quality_blockers) ? pg.quality_blockers.map(String) : [];
}

function signature(blockers: string[]): string {
  return [...blockers].sort().join("|");
}

function workflowKey(job: LegacyJob): string {
  return `${job.project_id}:${job.tipo === "criar_fundacao" ? "foundation" : "writing"}`;
}

/** Pure policy: only the newest paused job per project/workflow can be resumed. */
export function planLegacyReconciliation(input: {
  jobs: LegacyJob[];
  projects: LegacyProject[];
  assessments: Map<string, ArtifactAssessment>;
  detectorVersion: string;
  globalEnabled: boolean;
  allowlist?: Set<string> | null;
}): ReconciliationDecision[] {
  const projects = new Map(input.projects.map((p) => [p.id, p]));
  const active = new Set(input.jobs.filter((j) => j.status === "queued" || j.status === "running").map(workflowKey));
  const paused = input.jobs.filter((j) => j.status === "paused" && SUPPORTED_TYPES.has(j.tipo));
  const latest = new Map<string, LegacyJob>();
  for (const job of paused) {
    const key = workflowKey(job);
    const previous = latest.get(key);
    if (!previous || String(job.created_at ?? "") > String(previous.created_at ?? "")) latest.set(key, job);
  }

  return paused.map((job): ReconciliationDecision => {
    const fail = (reason: string): ReconciliationDecision => ({ jobId: job.id, projectId: job.project_id, eligible: false, reason });
    if (!input.globalEnabled) return fail("worker_global_disabled");
    if (!job.project_id) return fail("project_missing");
    if (input.allowlist && !input.allowlist.has(job.project_id)) return fail("outside_allowlist");
    const project = projects.get(job.project_id);
    if (!project) return fail("project_missing");
    if (project.briefing?.producao_pausada === true) return fail("project_manually_paused");
    if (latest.get(workflowKey(job))?.id !== job.id) return fail("historical_job");
    if (active.has(workflowKey(job))) return fail("equivalent_job_active");
    const stage = stageFromJob(job);
    if (!stage) return fail("unsupported_stage");
    const blockers = blockerList(job);
    const diagnostic = `${job.erro ?? ""} ${blockers.join(" ")}`;
    if (AUTHOR_DECISION.test(diagnostic)) return fail("author_decision_pending");
    if (OPERATIONAL_BREAKER.test(diagnostic)) return fail("operational_breaker");
    const assessment = input.assessments.get(job.id);
    if (!assessment) return fail("artifacts_not_assessed");
    if (assessment.result === "inconsistent") return fail("storage_disk_inconsistent");
    if (assessment.result !== "approved" && String(job.progresso?.quality_categoria ?? "") === "circuit_breaker") {
      return fail("quality_circuit_breaker_still_failing");
    }
    const prior = job.progresso?.reconciliacao_legada;
    if (prior?.detector_version === input.detectorVersion && prior?.hash_reconciliado === assessment.hash &&
        prior?.blockers_signature === signature(assessment.blockers)) return fail("already_reconciled_same_evidence");
    const strategy = assessment.result === "approved" ? "deterministic_revalidation" : "bounded_editorial_recovery";
    return {
      jobId: job.id,
      projectId: job.project_id,
      eligible: true,
      reason: assessment.reason,
      plan: { job, project, stage, assessment, detectorVersion: input.detectorVersion, strategy },
    };
  });
}

async function shaFiles(dir: string, files: string[]): Promise<string> {
  const entries = [] as Array<{ name: string; content: Uint8Array }>;
  for (const file of files) entries.push({ name: file, content: await readFile(path.join(dir, file)) });
  return hashNamedContents(entries);
}

export function hashNamedContents(entries: Array<{ name: string; content: Uint8Array }>): string {
  const h = createHash("sha256");
  for (const entry of [...entries].sort((a, b) => a.name.localeCompare(b.name))) {
    h.update(entry.name).update("\0").update(entry.content).update("\0");
  }
  return h.digest("hex");
}

async function readState(dir: string): Promise<Record<string, any> | null> {
  try { return JSON.parse(await readFile(path.join(dir, "ESTADO_LIVRO.json"), "utf8")); } catch { return null; }
}

const fileExists = async (file: string) => access(file).then(() => true).catch(() => false);

function runDetector(cmd: string, args: string[], timeoutMs = 30_000): Promise<{ code: number; out: string; err: string }> {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { shell: false });
    let out = ""; let err = "";
    child.stdout.on("data", (d) => { out += d.toString(); });
    child.stderr.on("data", (d) => { err += d.toString(); });
    const timer = setTimeout(() => child.kill("SIGTERM"), timeoutMs);
    child.on("error", (e) => { clearTimeout(timer); resolve({ code: -1, out, err: err + String(e) }); });
    child.on("close", (code) => { clearTimeout(timer); resolve({ code: code ?? -1, out, err }); });
  });
}

export async function assessLegacyArtifacts(job: LegacyJob, options: { workDir?: string; pythonBin?: string; runnerPath?: string } = {}): Promise<ArtifactAssessment> {
  if (!job.project_id) return { result: "blocked", hash: "", target: null, reason: "project_missing", blockers: [] };
  const dir = safeResolveWithin(options.workDir ?? process.env.WORK_DIR ?? "./atelier-work", job.project_id);
  const pythonBin = options.pythonBin ?? process.env.PY_BIN ?? "python";
  const runnerPath = options.runnerPath ?? process.env.RUNNER_PATH ?? "";
  const stage = stageFromJob(job);
  const blockers = blockerList(job);
  if (stage === "GATE_FUNDACAO") {
    const required = FOUNDATION_REQUIRED_FILES;
    const missing = [] as string[];
    for (const file of required) if (!(await fileExists(path.join(dir, file)))) missing.push(file);
    if (missing.length) return { result: "blocked", hash: "", target: null, reason: `missing:${missing.join(",")}`, blockers };
    return {
      result: "recoverable",
      hash: await shaFiles(dir, required),
      target: null,
      reason: "existing_foundation_ready_for_current_gate",
      blockers,
    };
  }
  if (stage !== "SPEC_CAPITULO" && stage !== "REVISAO_CAPITULO") {
    return { result: "blocked", hash: "", target: null, reason: "unsupported_stage", blockers };
  }
  const estado = await readState(dir);
  const target = targetFromState(job, estado);
  if (!target) return { result: "blocked", hash: "", target: null, reason: "target_not_found", blockers };

  if (stage === "SPEC_CAPITULO") {
    const spec = path.join("specs", `Spec-Capitulo-${String(target).padStart(2, "0")}.md`);
    if (!(await fileExists(path.join(dir, spec)))) return { result: "blocked", hash: "", target, reason: "spec_missing", blockers };
    const script = "import json,runpy,sys; ns=runpy.run_path(sys.argv[1],run_name='legacy_detector'); print(json.dumps({'reason':ns['gate_spec_capitulo'](sys.argv[2],int(sys.argv[3]))},ensure_ascii=False))";
    if (!runnerPath) return { result: "blocked", hash: await shaFiles(dir, [spec]), target, reason: "runner_path_missing", blockers };
    const detected = await runDetector(pythonBin, ["-c", script, runnerPath, dir, String(target)]);
    if (detected.code !== 0) return { result: "blocked", hash: await shaFiles(dir, [spec]), target, reason: `detector_error:${detected.err.slice(-180)}`, blockers };
    let reason: string | null = null;
    try { reason = JSON.parse(detected.out.trim().split(/\r?\n/).at(-1) ?? "{}").reason ?? null; } catch { reason = "detector_output_invalid"; }
    return { result: reason ? "recoverable" : "approved", hash: await shaFiles(dir, [spec]), target, reason: reason ?? "current_detector_approved", blockers };
  }

  const chapter = path.join("manuscrito", `capitulo-${String(target).padStart(2, "0")}.md`);
  const quality = path.join("quality", `capitulo-${String(target).padStart(2, "0")}.json`);
  if (!(await fileExists(path.join(dir, chapter))) || !(await fileExists(path.join(dir, quality)))) {
    return { result: "blocked", hash: "", target, reason: "chapter_or_quality_state_missing", blockers };
  }
  const chapterHash = await shaFiles(dir, [chapter]);
  let q: any = null;
  try { q = JSON.parse(await readFile(path.join(dir, quality), "utf8")); } catch {}
  const text = await readFile(path.join(dir, chapter));
  const rawHash = createHash("sha256").update(text).digest("hex");
  const approved = ["approved", "approved_with_exception"].includes(String(q?.status)) && q?.textHash === rawHash;
  return { result: approved ? "approved" : "recoverable", hash: chapterHash, target, reason: approved ? "current_quality_state_approved" : "current_revision_still_failing", blockers };
}

export function reconciliationPatch(plan: ReconciliationPlan, workerId: string, now = new Date().toISOString()) {
  const previous = plan.job.progresso ?? {};
  const blockersSignature = signature(plan.assessment.blockers);
  const phase = plan.stage === "GATE_FUNDACAO" ? "RECONCILIACAO_FUNDACAO" : plan.stage === "SPEC_CAPITULO" ? "RECONCILIACAO_SPEC" : "RECONCILIACAO_REVISAO";
  const metadata = {
    estado: "queued",
    reconciliado_em: now,
    reconciliado_por: workerId,
    detector_version: plan.detectorVersion,
    hash_reconciliado: plan.assessment.hash,
    blockers_signature: blockersSignature,
    tentativa: 0,
    estrategia: plan.strategy,
    resultado: "queued",
    motivo: plan.assessment.reason,
    job_origem: plan.job.id,
    job_retomada: plan.job.id,
    rollback_ref: {
      status: plan.job.status,
      erro: plan.job.erro ?? null,
      updated_at: plan.job.updated_at ?? null,
      quality_categoria: previous.quality_categoria ?? null,
    },
  };
  return {
    status: "queued",
    erro: null,
    locked_by: null,
    locked_at: null,
    payload: { ...(plan.job.payload ?? {}), reconciliacao_legada: metadata },
    progresso: {
      ...previous,
      fase: phase,
      etapa: plan.stage === "GATE_FUNDACAO" ? "reavaliando fundação existente" : `revalidando ${plan.stage === "SPEC_CAPITULO" ? "spec" : "capítulo"} ${plan.assessment.target ?? ""}`.trim(),
      quality_status: "auto_correcao",
      quality_stage: plan.stage,
      quality_cap: plan.assessment.target,
      quality_categoria: "recuperavel_qualidade",
      reconciliacao_legada: metadata,
    },
  };
}

export function finalizeReconciliationData(
  payload: Record<string, any> | null | undefined,
  progress: Record<string, any> | null | undefined,
  result: "approved" | "paused" | "error",
  now = new Date().toISOString()
): { payload?: Record<string, any>; progresso?: Record<string, any> } {
  const metadata = progress?.reconciliacao_legada ?? payload?.reconciliacao_legada;
  if (!metadata) return {};
  const completed = {
    ...metadata,
    estado: result === "approved" ? "done" : result,
    resultado: result,
    concluido_em: now,
  };
  return {
    payload: { ...(payload ?? {}), reconciliacao_legada: completed },
    progresso: { ...(progress ?? {}), reconciliacao_legada: completed },
  };
}

export async function listTryTargets(dir: string, stage: LegacyStage): Promise<number[]> {
  const sub = stage === "SPEC_CAPITULO" ? "specs" : "review";
  const regex = stage === "SPEC_CAPITULO" ? /^_spec-(\d+)\.try$/ : /^_revcap-(\d+)\.try$/;
  const files = await readdir(path.join(dir, sub)).catch(() => [] as string[]);
  return files.map((f) => Number(regex.exec(f)?.[1])).filter((n) => Number.isInteger(n) && n > 0);
}
