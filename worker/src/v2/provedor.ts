// Engine V2 — abstração de provedor de modelo (F3).
// O núcleo nunca conhece nome de modelo: recebe { capacidade, modelo } resolvidos pela config.
// Provedor primário: claude CLI (plano MAX). A interface permite religar provedores hosted
// no futuro sem tocar o núcleo (decisão D3).

import { spawn, spawnSync } from "node:child_process";
import { LimiteMaxError, limiteMaxRetryAt } from "../limite-max.js";
import type { ClasseCapacidade, EsforcoModelo, Papel } from "./tipos.js";

export interface ChamadaModelo {
  papel: Papel;
  capacidade: ClasseCapacidade;
  modelo: string;                 // nome concreto vindo da config (nunca hardcoded no núcleo)
  prompt: string;                 // pacote compilado (F4) — o provedor não adiciona nada
  timeoutMs?: number;
  /** Nivel de esforco do CLI para este papel (EXECUCAO_POR_PAPEL). */
  esforco?: EsforcoModelo;
}

export interface RespostaModelo {
  texto: string;
  /** ID exato reportado pelo provedor, nunca o alias solicitado. */
  modeloExecutado?: string;
  tokensIn?: number;
  tokensOut?: number;
  truncado?: boolean;
  /** Duracao da CHAMADA, medida no spawn (nao inferida de finished_at). */
  duracaoMs?: number;
  bruto?: unknown;                // envelope original (telemetria/depuração)
}

export interface ProvedorModelo {
  nome: string;
  chamar(c: ChamadaModelo): Promise<RespostaModelo>;
  /** Versão do binário, gravada no run. Opcional: mocks não precisam. */
  versao?(): string;
}

export class ErroProvedor extends Error {
  constructor(
    public readonly codigo:
      | "PROVEDOR_FALHOU"
      | "PROVEDOR_TIMEOUT"
      | "PROVEDOR_SAIDA_VAZIA"
      | "PROVEDOR_MODELO_DIVERGENTE"
      // Esforço pedido não foi aplicado, ou o CLI não conhece a flag. É
      // configuração, não instabilidade: repetir a chamada não resolve.
      | "PROVEDOR_CONFIGURACAO",
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
export function argumentosClaudeCli(modelo: string, esforco?: EsforcoModelo): string[] {
  const base = ["-p", "--model", modelo, "--output-format", "json", "--tools", ""];
  // `--effort` e opcional no argumento para nao quebrar chamadas antigas, mas
  // todo papel passa o seu: ver EXECUCAO_POR_PAPEL.
  return esforco ? [...base, "--effort", esforco] : base;
}

/** O CLI AVISA e segue quando o nivel e invalido; para a engine isso e erro. */
const SEPARADOR_LINHA = new RegExp("\r?\n");
const RE_ESFORCO_IGNORADO = /Unknown --effort value/i;
/** CLI antigo nao conhece a flag: nao pode cair em silencio no comportamento velho. */
const RE_FLAG_DESCONHECIDA = /(?:unknown|unrecognized|invalid) option[^\r\n]*--effort/i;

/**
 * Falha fechado no esforco.
 *
 * O CLI responde `Unknown --effort value 'x' — ignoring it` e CONTINUA rodando.
 * Sem esta checagem, a engine roda no esforco padrao acreditando que roda em
 * `high`, e ninguem descobre — mesma familia do Storage que devolvia string
 * vazia para falha e para conteudo vazio.
 */
export function conferirEsforcoAplicado(saida: string, esforco: EsforcoModelo | undefined, versaoCli: string): void {
  if (!esforco) return;
  if (RE_FLAG_DESCONHECIDA.test(saida)) {
    throw new ErroProvedor(
      "PROVEDOR_CONFIGURACAO",
      `o CLI instalado (${versaoCli}) nao conhece a flag --effort; a Engine V2 exige um CLI que a aceite (>= 2.1). ` +
        `Atualize o Claude Code ou remova o esforco de EXECUCAO_POR_PAPEL — rodar no padrao em silencio nao e opcao.`
    );
  }
  if (RE_ESFORCO_IGNORADO.test(saida)) {
    throw new ErroProvedor(
      "PROVEDOR_CONFIGURACAO",
      `o CLI (${versaoCli}) ignorou --effort ${esforco} e usou o padrao. Valores aceitos: low, medium, high, xhigh, max. ` +
        `O run e invalido: nao da para afirmar em que esforco a saida foi produzida.`
    );
  }
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

  private _versao?: string;
  /**
   * Versao do CLI, resolvida uma vez por processo e gravada no run: sem ela nao
   * da para dizer, depois, com que binario um capitulo foi produzido.
   */
  versao(): string {
    if (this._versao) return this._versao;
    try {
      const r = spawnSync(this.bin, ["--version"], { encoding: "utf8", timeout: 15_000 });
      this._versao = (r.stdout ?? "").trim().split(SEPARADOR_LINHA)[0] || "desconhecida";
    } catch {
      this._versao = "desconhecida";
    }
    return this._versao;
  }

  private executar(args: string[], stdin: string, timeoutMs: number): Promise<{ code: number; out: string; err: string; duracaoMs: number }> {
    // Cronometro do SPAWN. `finished_at` e carimbo de ciclo de vida da linha e
    // ja saiu 27 min depois do trabalho real (run 889f9fc9); a medicao precisa
    // da duracao da CHAMADA, tomada aqui, nas duas pontas do processo.
    const t0 = Date.now();
    return new Promise((resolve) => {
      // CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: sem ela o CLI dispara chamadas
      // internas (haiku, ex.: título de sessão) que aparecem no modelUsage e
      // reprovariam exigirModeloExecutado (exatamente 1 modelo = o pin).
      const p = spawn(this.bin, args, {
        cwd: this.cwd,
        shell: false,
        env: { ...process.env, PYTHONUTF8: "1", CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: "1" },
      });
      let out = "";
      let err = "";
      p.stdout.setEncoding("utf8");
      p.stderr.setEncoding("utf8");
      p.stdout.on("data", (c: string) => (out += c));
      p.stderr.on("data", (c: string) => (err += c));
      const timer = setTimeout(() => {
        try { p.kill(); } catch { /* já morreu */ }
        resolve({ code: -1, out, err: `timeout após ${timeoutMs}ms`, duracaoMs: Date.now() - t0 });
      }, timeoutMs);
      p.on("close", (code) => {
        clearTimeout(timer);
        resolve({ code: code ?? -1, out, err, duracaoMs: Date.now() - t0 });
      });
      p.on("error", (e) => {
        clearTimeout(timer);
        resolve({ code: -1, out, err: String(e), duracaoMs: Date.now() - t0 });
      });
      p.stdin.write(stdin, "utf8");
      p.stdin.end();
    });
  }

  async chamar(c: ChamadaModelo): Promise<RespostaModelo> {
    const args = argumentosClaudeCli(c.modelo, c.esforco);
    const timeoutMs = c.timeoutMs ?? 600000;
    const r = await this.executar(args, c.prompt, timeoutMs);
    // Antes de qualquer classificacao de erro: o esforco pedido foi aplicado?
    // Um run em esforco errado e invalido mesmo tendo terminado com sucesso.
    conferirEsforcoAplicado(`${r.err}
${r.out}`, c.esforco, this.versao());
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
          duracaoMs: r.duracaoMs,
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
    if (r) return { ...r, modeloExecutado: r.modeloExecutado ?? c.modelo };
    // Papéis com resposta AUTOMÁTICA quando a suíte não os está exercitando.
    // Só vale para julgamento estrutural cuja resposta "tudo conforme" é
    // derivável do próprio prompt — e a fila SEMPRE tem prioridade, então um
    // teste que quer exercitar o papel continua no controle.
    const automatica = respostaAutomatica(c);
    if (automatica) return { texto: automatica, modeloExecutado: c.modelo };
    throw new ErroProvedor("PROVEDOR_FALHOU", `mock sem resposta enfileirada para papel ${c.papel}`);
  }
}

/**
 * Resposta derivada do PRÓPRIO PROMPT, para o papel de conformidade ficha→prosa.
 * Monta um parecer conforme citando um trecho que de fato existe no capítulo que
 * o prompt carrega — nada é inventado, e um teste que precise reprovar a
 * conformidade enfileira a sua resposta e essa aqui nem roda.
 */
function respostaAutomatica(c: ChamadaModelo): string | null {
  // Extrator de memória: "nada além do que a ficha já previa" é a resposta
  // honesta quando a suíte não está exercitando a extração. Quem testa a
  // memória derivada da prosa enfileira a sua e esta nem roda.
  if (c.papel === "extrator_memoria") return JSON.stringify({ entradas: [], divergencias: [] });
  // Decisao da cascata: o delta VAZIO ("a triagem acertou") e a resposta neutra,
  // e o veredito sugerido sai do parecer da triagem que o PROPRIO prompt carrega
  // -- nao e opiniao do mock. Assim a suite que nao esta exercitando a cascata
  // segue com o mesmo julgamento de antes, e quem testa a decisao enfileira a
  // sua resposta e esta nem roda.
  if (c.papel === "revisor_decisao") {
    const veredito = /"verdict"\s*:\s*"([a-z_]+)"/.exec(`${c.prompt ?? ""}`)?.[1];
    if (!veredito) return null;
    return JSON.stringify({
      schema: "delta-decisao/v1",
      derrubar: [],
      acrescentar: [],
      veredito_sugerido: veredito,
      observacao: "delta vazio: a triagem acertou (resposta automatica do mock)",
    });
  }
  if (c.papel !== "conformidade_ficha") return null;
  const prompt = `${c.prompt ?? ""}`;
  // Só a lista "Itens a verificar" — as REGRAS DURAS da tarefa também começam
  // com `- "campo":` e entravam como se fossem itens ("trecho", "cumprido"…).
  const bloco = /Itens a verificar:\n([\s\S]*?)\n\s*\n/.exec(prompt)?.[1] ?? "";
  const itens = [...bloco.matchAll(/^- "([a-z_]+)":/gm)].map((m) => m[1]);
  if (!itens.length) return null;
  // Âncora na SEÇÃO do pacote: o compilador renderiza cada seção como
  // "## TÍTULO", e o texto do capítulo vive em "## TEXTO A AVALIAR". Sem a
  // âncora, a linha mais longa acabava sendo uma regra da própria tarefa — e um
  // trecho inexistente invalidaria a afirmação (corretamente, mas inutilmente).
  const depois = prompt.split(/^##\s+TEXTO A AVALIAR[^\n]*$/m)[1];
  // Corta na próxima SEÇÃO do pacote — títulos de seção são maiúsculos. O texto
  // do capítulo abre com "## Capítulo N", que NÃO é seção: cortar em qualquer
  // "## " deixava o corpo vazio e o trecho vinha da tarefa.
  const corpo = depois?.split(/^##\s+[A-ZÀ-Ú0-9][A-ZÀ-Ú0-9 ()\-—]{3,}$/m)[0];
  if (!corpo?.trim()) return null;
  const trecho = corpo
    .split(/\n|(?<=[.!?])\s+/)
    .map((f) => f.trim())
    .filter((f) => f.length > 24 && !f.startsWith("#") && !f.startsWith("-"))
    .sort((a, b) => b.length - a.length)[0];
  if (!trecho) return null;
  return JSON.stringify({
    afirmacoes: itens.map((item) => ({
      item,
      cumprido: true,
      trecho,
      justificativa: `o capítulo entrega "${item}" no trecho citado`,
    })),
  });
}
