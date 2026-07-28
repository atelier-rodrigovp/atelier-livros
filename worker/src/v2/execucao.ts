// Execução de comandos externos e captura do HEAD.
//
// Dois defeitos moravam aqui, com o mesmo formato: falha silenciosa virando
// string plausível.
//
// 1. No Windows o código acrescentava `.cmd` a QUALQUER executável. Funciona
//    para `npm`/`npx`, que de fato são shims `.cmd`; quebra para `git`, que é
//    um `.exe`. O spawn falhava, o erro era engolido e o commit da evidência
//    virava `"desconhecido"` — um carimbo que passa por identificação.
//
// 2. Código de saída era descartado quando havia stdout. Comando que falhou com
//    saída parcial passava por sucesso.
//
// Aqui o código de saída é dado de primeira classe e o HEAD tem só dois
// desfechos: um SHA de 40 hexadígitos, ou exceção.

import { execFileSync } from "node:child_process";

export interface ResultadoComando {
  ok: boolean;
  /** Código de saída. `null` só quando o processo nem chegou a existir. */
  code: number | null;
  stdout: string;
  stderr: string;
}

/**
 * Executáveis que no Windows são shims `.cmd` e precisam do sufixo. Tudo que
 * não está aqui é binário real e vai pelo nome puro.
 */
const SHIMS_WINDOWS = new Set(["npm", "npx", "pnpm", "yarn", "tsc", "vitest", "eslint"]);

export function nomeExecutavel(exe: string, plataforma: string = process.platform): string {
  if (plataforma !== "win32") return exe;
  return SHIMS_WINDOWS.has(exe) ? `${exe}.cmd` : exe;
}

export function rodarComando(cwd: string, exe: string, args: string[]): ResultadoComando {
  // `shell: true` só onde é necessário (shims .cmd). Para binário real ele é
  // desnecessário e ainda reintroduz o problema de argumento com espaço.
  const usaShell = nomeExecutavel(exe) !== exe;
  try {
    const stdout = execFileSync(nomeExecutavel(exe), args, {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      maxBuffer: 64 * 1024 * 1024,
      shell: usaShell,
    });
    return { ok: true, code: 0, stdout, stderr: "" };
  } catch (e) {
    const err = e as { status?: number; stdout?: string; stderr?: string; message?: string };
    return {
      ok: false,
      code: typeof err.status === "number" ? err.status : null,
      stdout: err.stdout ?? "",
      stderr: err.stderr ?? err.message ?? "",
    };
  }
}

export class ErroHead extends Error {}

const SHA_COMPLETO = /^[0-9a-f]{40}$/;

/**
 * O commit em que a verificação rodou. Não existe valor de fallback: evidência
 * que não sabe contra qual código rodou não é evidência, e `"desconhecido"`
 * carimbado num documento de certificação é pior que erro — parece dado.
 */
export function capturarHead(cwd: string): string {
  const r = rodarComando(cwd, "git", ["rev-parse", "HEAD"]);
  if (!r.ok) {
    throw new ErroHead(`não foi possível obter o HEAD (código ${r.code ?? "sem processo"}): ${r.stderr.trim().slice(0, 200)}`);
  }
  const sha = r.stdout.trim();
  if (!SHA_COMPLETO.test(sha)) {
    throw new ErroHead(`git rev-parse HEAD devolveu algo que não é um SHA: ${JSON.stringify(sha.slice(0, 60))}`);
  }
  return sha;
}

/** Worktree suja invalida a evidência: o código testado não é o do commit. */
export function worktreeLimpa(cwd: string, caminhos: string[]): { limpa: boolean; sujos: string[] } {
  const r = rodarComando(cwd, "git", ["status", "--porcelain", "--", ...caminhos]);
  if (!r.ok) throw new ErroHead(`não foi possível ler o status da worktree: ${r.stderr.trim().slice(0, 200)}`);
  const sujos = r.stdout
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => l.replace(/^\S+\s+/, ""));
  return { limpa: sujos.length === 0, sujos };
}
