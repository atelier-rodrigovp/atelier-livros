import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { QualityState } from "./quality-state.js";

export const FUNDACAO_CORRECAO_LEDGER = path.join("quality", "fundacao-correcao-ledger.json");
export const MAX_TENTATIVAS_FUNDACAO = 3;

export type CategoriaFundacao = "mecanico" | "editorial_recuperavel" | "decisao_autoral" | "circuit_breaker";
export type EstrategiaFundacao = "normalizadores_deterministicos" | "refino_editorial_dirigido";

export interface TentativaFundacao {
  tentativa: number;
  categoria: CategoriaFundacao;
  estrategia: EstrategiaFundacao;
  blockers_antes: string[];
  hash_antes: string;
  hash_depois: string;
  arquivos_alterados: string[];
  resultado: "aprovado" | "reprovado";
  executada_em: string;
}

export interface LedgerFundacao {
  versao: 1;
  projeto: string;
  tentativas: TentativaFundacao[];
  encerramento: "aprovado" | "decisao_autoral" | "circuit_breaker" | null;
  diagnostico: string | null;
}

const RE_MECANICO = /^(AGENTE_AUSENTE|CRAFT_|VOZ_NAO_REGISTRADA|SKILL_INCOERENTE)/;
const RE_AUTORAL = /DECISAO_AUTORAL|EXCECAO_AUTORAL|AMBIGUIDADE_AUTORAL/;

export function classificarFundacao(blockers: string[]): CategoriaFundacao {
  if (blockers.some((b) => RE_AUTORAL.test(b))) return "decisao_autoral";
  return blockers.every((b) => RE_MECANICO.test(b)) ? "mecanico" : "editorial_recuperavel";
}

async function carregar(dir: string, projeto: string): Promise<LedgerFundacao> {
  try {
    const l = JSON.parse(await readFile(path.join(dir, FUNDACAO_CORRECAO_LEDGER), "utf8"));
    if (l?.versao === 1 && Array.isArray(l.tentativas)) return l;
  } catch { /* primeiro ciclo */ }
  return { versao: 1, projeto, tentativas: [], encerramento: null, diagnostico: null };
}

async function salvar(dir: string, ledger: LedgerFundacao): Promise<void> {
  const p = path.join(dir, FUNDACAO_CORRECAO_LEDGER);
  await mkdir(path.dirname(p), { recursive: true });
  await writeFile(p, JSON.stringify(ledger, null, 2) + "\n", "utf8");
}

export interface ResultadoGateFundacao { state: QualityState }
export interface ContextoLoopFundacao {
  dir: string;
  projeto: string;
  avaliar: () => Promise<ResultadoGateFundacao>;
  corrigir: (estrategia: EstrategiaFundacao, blockers: string[]) => Promise<string[]>;
  maxTentativas?: number;
  agora?: () => string;
}

export interface ResultadoLoopFundacao extends ResultadoGateFundacao {
  categoria: CategoriaFundacao;
  ledger: LedgerFundacao;
}

export async function executarLoopCorrecaoFundacao(ctx: ContextoLoopFundacao): Promise<ResultadoLoopFundacao> {
  const max = ctx.maxTentativas ?? MAX_TENTATIVAS_FUNDACAO;
  const agora = ctx.agora ?? (() => new Date().toISOString());
  const ledger = await carregar(ctx.dir, ctx.projeto);
  let gate = await ctx.avaliar();

  if (gate.state.status === "approved") {
    ledger.encerramento = "aprovado";
    ledger.diagnostico = null;
    await salvar(ctx.dir, ledger);
    return { ...gate, categoria: "mecanico", ledger };
  }

  for (let n = ledger.tentativas.length + 1; n <= max; n++) {
    const blockers = gate.state.blockers.map((b) => b.code);
    const categoria = classificarFundacao(blockers);
    if (categoria === "decisao_autoral") {
      ledger.encerramento = "decisao_autoral";
      ledger.diagnostico = `Decisão autoral explícita requerida: ${blockers.join(", ")}`;
      await salvar(ctx.dir, ledger);
      return { ...gate, categoria, ledger };
    }
    const estrategia: EstrategiaFundacao =
      categoria === "mecanico" && n === 1 ? "normalizadores_deterministicos" : "refino_editorial_dirigido";
    const repetida = ledger.tentativas.some((t) =>
      t.hash_antes === gate.state.textHash && t.estrategia === estrategia &&
      t.blockers_antes.join("|") === blockers.join("|")
    );
    if (repetida) break;

    const hashAntes = gate.state.textHash;
    const alterados = await ctx.corrigir(estrategia, blockers);
    gate = await ctx.avaliar();
    ledger.tentativas.push({
      tentativa: n,
      categoria,
      estrategia,
      blockers_antes: blockers,
      hash_antes: hashAntes,
      hash_depois: gate.state.textHash,
      arquivos_alterados: [...new Set(alterados)].sort(),
      resultado: gate.state.status === "approved" ? "aprovado" : "reprovado",
      executada_em: agora(),
    });
    if (gate.state.status === "approved") {
      ledger.encerramento = "aprovado";
      ledger.diagnostico = null;
      await salvar(ctx.dir, ledger);
      return { ...gate, categoria, ledger };
    }
    await salvar(ctx.dir, ledger);
  }

  ledger.encerramento = "circuit_breaker";
  ledger.diagnostico =
    `Correção automática interrompida sem aprovação após ${ledger.tentativas.length}/${max} tentativa(s). ` +
    `Blockers residuais: ${gate.state.blockers.map((b) => b.code).join(", ")}. ` +
    "Nenhum gate foi contornado.";
  await salvar(ctx.dir, ledger);
  return { ...gate, categoria: "circuit_breaker", ledger };
}
