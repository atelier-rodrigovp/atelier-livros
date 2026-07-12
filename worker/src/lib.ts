// Helpers compartilhados pelos executores: processos, filesystem, Storage e DB.
import { spawn } from "node:child_process";
import { readFile, readdir, stat } from "node:fs/promises";
import { createReadStream } from "node:fs";
import path from "node:path";
import { sb, OWNER } from "./supabase.js";
import { comRetrySb } from "./retry.js";
import { assertSafeSegment, safeResolveWithin } from "./path-safety.js";

export const WORK_DIR = process.env.WORK_DIR || "./atelier-work";
export const CLAUDE_BIN = process.env.CLAUDE_BIN || "claude";
export const PY_BIN = process.env.PY_BIN || "python";
export const RUNNER_PATH = process.env.RUNNER_PATH || "";
export const MODEL = process.env.MODEL || "opus"; // PESADO: escritor (subagente), REVIEW/REESCRITA inline, jobs interativos
// Orquestrador da escrita longa: só roteia/delega a prosa ao subagente escritor
// (opus, via frontmatter). Sonnet aqui economiza Max sem rebaixar a prosa. As fases
// inline pesadas (ESTRUTURA/REVIEW/REESCRITA) o runner sobe para MODEL via --model-pesado.
export const MODEL_ORQUESTRADOR = process.env.MODEL_ORQUESTRADOR || "sonnet";
export const CLAUDE_PERMISSION_MODE = process.env.CLAUDE_PERMISSION_MODE || "acceptEdits";

// Pasta de trabalho de um projeto (verdade do disco).
export function projDir(projectId: string) {
  return safeResolveWithin(WORK_DIR, projectId);
}

// Caminho no Storage: sempre prefixado pelo owner (casa com as RLS de storage.sql).
export function storageKey(...parts: string[]) {
  return [assertSafeSegment(OWNER, "owner"), ...parts.map((p) => assertSafeSegment(p, "storage key"))].join("/");
}

export interface RunResult {
  code: number;
  out: string;
  err: string;
}

// Executa um processo; opcionalmente faz streaming de stdout/stderr linha a linha.
export function run(
  cmd: string,
  args: string[],
  opts: { cwd?: string; onLine?: (line: string) => void; timeoutMs?: number } = {}
): Promise<RunResult> {
  return new Promise((resolve) => {
    const p = spawn(cmd, args, { cwd: opts.cwd, shell: false });
    let out = "";
    let err = "";
    let buf = "";
    const handle = (chunk: string) => {
      if (!opts.onLine) return;
      buf += chunk;
      let i;
      while ((i = buf.indexOf("\n")) >= 0) {
        opts.onLine(buf.slice(0, i));
        buf = buf.slice(i + 1);
      }
    };
    p.stdout.on("data", (d) => {
      const s = d.toString();
      out += s;
      handle(s);
    });
    p.stderr.on("data", (d) => (err += d.toString()));
    let timer: NodeJS.Timeout | undefined;
    if (opts.timeoutMs) {
      timer = setTimeout(() => p.kill("SIGTERM"), opts.timeoutMs);
    }
    p.on("close", (code) => {
      if (timer) clearTimeout(timer);
      if (buf && opts.onLine) opts.onLine(buf);
      resolve({ code: code ?? -1, out, err });
    });
    p.on("error", (e) => {
      if (timer) clearTimeout(timer);
      resolve({ code: -1, out, err: err + String(e) });
    });
  });
}

// Invoca o Claude Code headless (uma fase/uma tarefa) numa pasta de projeto.
export async function runClaude(
  prompt: string,
  cwd: string,
  onLine?: (l: string) => void
): Promise<RunResult> {
  return run(
    CLAUDE_BIN,
    ["-p", prompt, "--permission-mode", CLAUDE_PERMISSION_MODE, "--model", MODEL],
    { cwd, onLine }
  );
}

export async function readText(p: string): Promise<string> {
  try {
    return await readFile(p, "utf8");
  } catch {
    return "";
  }
}

export function countWords(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

// Lista capítulos válidos (capitulo-NN.md com >= piso palavras) — verdade do disco.
export async function chaptersOnDisk(
  manuscritoDir: string,
  piso: number
): Promise<{ numero: number; palavras: number; file: string }[]> {
  const res: { numero: number; palavras: number; file: string }[] = [];
  let files: string[] = [];
  try {
    files = await readdir(manuscritoDir);
  } catch {
    return res;
  }
  for (const f of files.sort()) {
    const m = /^capitulo-(\d{2})\.md$/.exec(f);
    if (!m) continue;
    const full = path.join(manuscritoDir, f);
    const w = countWords(await readText(full));
    if (w >= piso) res.push({ numero: Number(m[1]), palavras: w, file: full });
  }
  return res;
}

const CONTENT_TYPES: Record<string, string> = {
  ".md": "text/markdown; charset=utf-8",
  ".json": "application/json",
  ".epub": "application/epub+zip",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".pdf": "application/pdf",
  ".html": "text/html; charset=utf-8",
  ".csv": "text/csv",
};

// Sobe um arquivo local para um bucket (service_role ignora RLS). upsert=true —
// idempotente, então falha de REDE re-tenta com backoff (blip não aborta o job).
export async function uploadFile(
  bucket: string,
  key: string,
  localPath: string
): Promise<void> {
  const body = await readFile(localPath);
  const ext = path.extname(localPath).toLowerCase();
  const { error } = await comRetrySb(
    () =>
      sb.storage.from(bucket).upload(key, body, {
        contentType: CONTENT_TYPES[ext] ?? "application/octet-stream",
        upsert: true,
      }),
    { tentativas: 5, rotulo: `upload ${bucket}/${key}` }
  );
  if (error) throw new Error(`upload ${bucket}/${key}: ${error.message}`);
}

// URL assinada (download temporário). Default 7 dias.
export async function signedUrl(
  bucket: string,
  key: string,
  expiresSec = 60 * 60 * 24 * 7
): Promise<string | null> {
  const { data } = await sb.storage.from(bucket).createSignedUrl(key, expiresSec);
  return data?.signedUrl ?? null;
}

export async function exists(p: string): Promise<boolean> {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}

export { createReadStream };
