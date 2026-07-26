// Engine V2 — abstração de provedor de modelo (F3).
// O núcleo nunca conhece nome de modelo: recebe { capacidade, modelo } resolvidos pela config.
// Provedor primário: claude CLI (plano MAX). A interface permite religar provedores hosted
// no futuro sem tocar o núcleo (decisão D3).

import { spawn } from "node:child_process";
import { LimiteMaxError, limiteMaxRetryAt } from "../limite-max.js";
import type { ClasseCapacidade, Papel } from "./tipos.js";

export interface ChamadaModelo {
  papel: Papel;
  capacidade: ClasseCapacidade;
  modelo: string;                 // nome concreto vindo da config (nunca hardcoded no núcleo)
  prompt: string;                 // pacote compilado (F4) — o provedor não adiciona nada
  timeoutMs?: number;
}

export interface RespostaModelo {
  texto: string;
  /** ID exato reportado pelo provedor, nunca o alias solicitado. */
  modeloExecutado?: string;
  tokensIn?: number;
  tokensOut?: number;
  truncado?: boolean;
  bruto?: unknown;                // envelope original (telemetria/depuração)
}

export interface ProvedorModelo {
  nome: string;
  chamar(c: ChamadaModelo): Promise<RespostaModelo>;
}

export class ErroProvedor extends Error {
  constructor(
    public readonly codigo:
      | "PROVEDOR_FALHOU"
      | "PROVEDOR_TIMEOUT"
      | "PROVEDOR_SAIDA_VAZIA"
      | "PROVEDOR_MODELO_DIVERGENTE",
    mensagem: string,
    public readonly detalhe?: unknown
  ) {
    super(mensagem);
  }
}

/**
 * Extrai a mensagem de erro REAL da saída do claude CLI. Com `--output-format
 * json`, mesmo um `rc != 0` traz um envelope `{...,"result":"..."}` no stdout, e
 * o `result` (que carrega "You've hit your session limit") vem DEPOIS de `usage`
 * — um slice ingênuo do stdout bruto o perde e o throttle escapa da
 * classificação (gap do rc=1: 2 tentativas de job queimadas no canário romantasy).
 * Preferimos o `result` parseado; caímos no bruto só quando não há envelope.
 */
export function extrairMensagemCli(err: string, out: string): string {
  if (out && out.trim()) {
    try {
      const env = JSON.parse(out.trim()) as { result?: unknown };
      if (typeof env.result === "string" && env.result.trim()) return env.result;
    } catch {
      /* stdout não era envelope JSON — usa o bruto */
    }
  }
  return (err || out || "").trim();
}

/**
 * Classifica uma saída de erro do claude CLI: limite do plano Max vira
 * LimiteMaxError (o loop do worker pausa com retry_at SEM contar tentativa —
 * antes virava PROVEDOR_FALHOU genérico e o recuperador re-enfileirava em
 * loop quente até o reset). Qualquer outro erro vira ErroProvedor. Pura/testável.
 */
export function classificarErroCli(mensagem: string, detalhe?: unknown): Error {
  const retryAt = limiteMaxRetryAt(mensagem);
  if (retryAt) {
    return new LimiteMaxError(`claude CLI: ${mensagem.slice(0, 200)}`, retryAt);
  }
  return new ErroProvedor("PROVEDOR_FALHOU", mensagem, detalhe);
}

/** Chamada deliberadamente sem ferramentas: o modelo recebe texto e devolve texto. */
export function argumentosClaudeCli(modelo: string): string[] {
  return ["-p", "--model", modelo, "--output-format", "json", "--tools", ""];
}

/**
 * O JSON final do Claude Code informa os modelos realmente usados em
 * `modelUsage`. Como cada papel V2 roda sem ferramentas/subagentes, deve existir
 * exatamente um ID e ele deve ser o pin solicitado. Ausência, fallback ou
 * mistura de modelos falha fechado.
 */
export function exigirModeloExecutado(
  envelope: { modelUsage?: Record<string, unknown> },
  solicitado: string
): string {
  const executados = Object.keys(envelope.modelUsage ?? {});
  if (executados.length !== 1 || executados[0] !== solicitado) {
    throw new ErroProvedor(
      "PROVEDOR_MODELO_DIVERGENTE",
      `modelo solicitado ${solicitado}; executado(s): ${executados.length ? executados.join(", ") : "não informado"}`,
      { solicitado, executados }
    );
  }
  return executados[0];
}

/**
 * Provedor via claude CLI não-interativo (`claude -p`).
 * Papéis V2 são chamadas puras de texto: o modelo NUNCA usa ferramentas nem toca disco
 * (o gravador determinístico é quem persiste). O prompt vai por STDIN — argv no Windows
 * estoura ~32k chars e o CLI espera stdin quando spawnado sem TTY.
 */
export class ProvedorClaudeCli implements ProvedorModelo {
  nome = "claude-cli";
  constructor(private readonly bin: string, private readonly cwd?: string) {}

  private executar(args: string[], stdin: string, timeoutMs: number): Promise<{ code: number; out: string; err: string }> {
    return new Promise((resolve) => {
      const p = spawn(this.bin, args, { cwd: this.cwd, shell: false, env: { ...process.env, PYTHONUTF8: "1" } });
      let out = "";
      let err = "";
      p.stdout.setEncoding("utf8");
      p.stderr.setEncoding("utf8");
      p.stdout.on("data", (c: string) => (out += c));
      p.stderr.on("data", (c: string) => (err += c));
      const timer = setTimeout(() => {
        try { p.kill(); } catch { /* já morreu */ }
        resolve({ code: -1, out, err: `timeout após ${timeoutMs}ms` });
      }, timeoutMs);
      p.on("close", (code) => {
        clearTimeout(timer);
        resolve({ code: code ?? -1, out, err });
      });
      p.on("error", (e) => {
        clearTimeout(timer);
        resolve({ code: -1, out, err: String(e) });
      });
      p.stdin.write(stdin, "utf8");
      p.stdin.end();
    });
  }

  async chamar(c: ChamadaModelo): Promise<RespostaModelo> {
    const args = argumentosClaudeCli(c.modelo);
    const timeoutMs = c.timeoutMs ?? 600000;
    const r = await this.executar(args, c.prompt, timeoutMs);
    if (r.code === -1 && /timeout/.test(r.err)) {
      throw new ErroProvedor("PROVEDOR_TIMEOUT", `claude CLI: ${r.err}`);
    }
    if (r.code !== 0) {
      const msg = extrairMensagemCli(r.err, r.out);
      throw classificarErroCli(`claude CLI rc=${r.code}: ${msg.slice(0, 400)}`, { code: r.code });
    }
    const texto = r.out.trim();
    if (!texto) throw new ErroProvedor("PROVEDOR_SAIDA_VAZIA", "claude CLI retornou saída vazia");
    // Envelope --output-format json: { result, usage: { input_tokens, output_tokens }, is_error, ... }
    try {
      const env = JSON.parse(texto) as {
        result?: string;
        usage?: { input_tokens?: number; output_tokens?: number };
        modelUsage?: Record<string, unknown>;
        is_error?: boolean;
        subtype?: string;
      };
      if (typeof env.result === "string") {
        if (env.is_error) {
          throw classificarErroCli(`claude CLI is_error (${env.subtype ?? "?"}): ${env.result.slice(0, 400)}`, env);
        }
        const modeloExecutado = exigirModeloExecutado(env, c.modelo);
        return {
          texto: env.result,
          modeloExecutado,
          tokensIn: env.usage?.input_tokens,
          tokensOut: env.usage?.output_tokens,
          bruto: env,
        };
      }
    } catch (e) {
      if (e instanceof ErroProvedor || e instanceof LimiteMaxError) throw e;
      // stdout não era o envelope JSON — trata como texto cru (versões antigas do CLI)
    }
    throw new ErroProvedor(
      "PROVEDOR_MODELO_DIVERGENTE",
      "claude CLI não retornou envelope JSON auditável com modelUsage",
      { solicitado: c.modelo }
    );
  }
}

/** Provedor de teste: respostas roteirizadas por papel (fila FIFO). */
export class ProvedorMock implements ProvedorModelo {
  nome = "mock";
  chamadas: ChamadaModelo[] = [];
  private filas = new Map<string, RespostaModelo[]>();

  enfileirar(papel: Papel, resposta: RespostaModelo | string) {
    const lista = this.filas.get(papel) ?? [];
    lista.push(typeof resposta === "string" ? { texto: resposta } : resposta);
    this.filas.set(papel, lista);
  }

  async chamar(c: ChamadaModelo): Promise<RespostaModelo> {
    this.chamadas.push(c);
    const lista = this.filas.get(c.papel);
    const r = lista?.shift();
    if (!r) throw new ErroProvedor("PROVEDOR_FALHOU", `mock sem resposta enfileirada para papel ${c.papel}`);
    return { ...r, modeloExecutado: r.modeloExecutado ?? c.modelo };
  }
}
