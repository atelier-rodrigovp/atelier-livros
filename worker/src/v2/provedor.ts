// Engine V2 — abstração de provedor de modelo (F3).
// O núcleo nunca conhece nome de modelo: recebe { capacidade, modelo } resolvidos pela config.
// Provedor primário: claude CLI (plano MAX). A interface permite religar provedores hosted
// no futuro sem tocar o núcleo (decisão D3).

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
    public readonly codigo: "PROVEDOR_FALHOU" | "PROVEDOR_TIMEOUT" | "PROVEDOR_SAIDA_VAZIA",
    mensagem: string,
    public readonly detalhe?: unknown
  ) {
    super(mensagem);
  }
}

/**
 * Provedor via claude CLI não-interativo (`claude -p`).
 * Papéis V2 são chamadas puras de texto: o modelo NUNCA usa ferramentas nem toca disco
 * (o gravador determinístico é quem persiste). Por isso não passamos permission-mode
 * de edição — o prompt é autocontido e a saída volta no stdout.
 */
export class ProvedorClaudeCli implements ProvedorModelo {
  nome = "claude-cli";
  constructor(private readonly bin: string, private readonly cwd?: string) {}

  async chamar(c: ChamadaModelo): Promise<RespostaModelo> {
    // Import tardio: lib.ts arrasta supabase/.env; testes com ProvedorMock ficam puros.
    const { run } = await import("../lib.js");
    const args = ["-p", c.prompt, "--model", c.modelo, "--output-format", "json"];
    const r = await run(this.bin, args, { cwd: this.cwd, timeoutMs: c.timeoutMs ?? 600000 });
    if (r.code !== 0) {
      throw new ErroProvedor("PROVEDOR_FALHOU", `claude CLI rc=${r.code}: ${r.err.slice(0, 400)}`, { code: r.code });
    }
    const texto = r.out.trim();
    if (!texto) throw new ErroProvedor("PROVEDOR_SAIDA_VAZIA", "claude CLI retornou saída vazia");
    // Envelope --output-format json: { result, usage: { input_tokens, output_tokens }, ... }
    try {
      const env = JSON.parse(texto) as {
        result?: string;
        usage?: { input_tokens?: number; output_tokens?: number };
        is_error?: boolean;
        subtype?: string;
      };
      if (typeof env.result === "string") {
        if (env.is_error) {
          throw new ErroProvedor("PROVEDOR_FALHOU", `claude CLI is_error (${env.subtype ?? "?"}): ${env.result.slice(0, 400)}`, env);
        }
        return {
          texto: env.result,
          tokensIn: env.usage?.input_tokens,
          tokensOut: env.usage?.output_tokens,
          bruto: env,
        };
      }
    } catch (e) {
      if (e instanceof ErroProvedor) throw e;
      // stdout não era o envelope JSON — trata como texto cru (versões antigas do CLI)
    }
    return { texto };
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
    return r;
  }
}
