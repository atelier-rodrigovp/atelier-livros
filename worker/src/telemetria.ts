// Telemetria de tokens/tempo por AGENTE e por PROJETO — verdade do disco.
//
// O `claude` headless não expõe usage no stdout (o runner usa texto puro), mas os
// transcripts (~/.claude/projects/<cwd>/**/*.jsonl) registram, por mensagem:
// model, isSidechain (subagente vs orquestrador) e usage (input/cache/output). As
// chamadas Task trazem subagent_type (livro-escritor/revisor/editor/…). Este módulo
// agrega isso (não muda a invocação do claude — instrumentação não-invasiva) + os
// sinais de THROUGHPUT do runner.log (restarts, hard-fails de 32k, calls sem rc) e
// persiste schema-free numa linha `jobs` (tipo='telemetria', status='paused', nunca
// reivindicada pelo picker) para o painel de observabilidade ler.
//
// Distinção que o painel precisa manter (o prompt do usuário):
//   TOKEN  = tokens por capítulo → quantos caps a cota semanal do Max rende.
//   TEMPO  = capítulos por hora  → sofre com serialização e restarts.
import { readdir, readFile, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";

export interface Usage {
  input: number;
  cache_creation: number;
  cache_read: number;
  output: number;
  msgs: number;
}
export function usageZero(): Usage {
  return { input: 0, cache_creation: 0, cache_read: 0, output: 0, msgs: 0 };
}
export function acumular(dst: Usage, u: Record<string, unknown>): void {
  dst.input += Number(u.input_tokens ?? 0) || 0;
  dst.cache_creation += Number(u.cache_creation_input_tokens ?? 0) || 0;
  dst.cache_read += Number(u.cache_read_input_tokens ?? 0) || 0;
  dst.output += Number(u.output_tokens ?? 0) || 0;
  dst.msgs += 1;
}

export type Tier = "opus" | "sonnet" | "haiku" | "outro";
export function tier(model: string | undefined): Tier {
  const m = (model || "").toLowerCase();
  if (m.includes("opus")) return "opus";
  if (m.includes("sonnet")) return "sonnet";
  if (m.includes("haiku")) return "haiku";
  return "outro";
}

// Preço-proxy (USD/Mtok) — só para RANQUEAR custo relativo entre papéis, não é fatura.
// cache_read ≈ 0.1× input; cache_creation ≈ 1.25× input.
const PRECO: Record<Tier, { in: number; out: number }> = {
  opus: { in: 15, out: 75 },
  sonnet: { in: 3, out: 15 },
  haiku: { in: 0.8, out: 4 },
  outro: { in: 0, out: 0 },
};
export function custoProxy(t: Tier, u: Usage): number {
  const p = PRECO[t];
  const inp = u.input + u.cache_creation * 1.25 + u.cache_read * 0.1;
  return (inp * p.in + u.output * p.out) / 1_000_000;
}

// Papel inferido de uma mensagem: subagente (por subagent_type quando conhecido, senão
// por tier) ou orquestrador/inline (por tier). subagentAtivo = o último subagent_type
// spawnado por Task antes desta mensagem sidechain (aproximação — o transcript não
// carimba o papel em cada linha).
export function papel(isSidechain: boolean, t: Tier, subagentAtivo: string | null): string {
  if (isSidechain) return subagentAtivo ? subagentAtivo : `subagente:${t}`;
  return `orquestrador/inline:${t}`;
}

export interface Telemetria {
  gerado_em: string;
  transcripts: number;
  totais: Usage;
  custo_proxy_usd: number;
  por_modelo: Record<string, Usage & { custo_usd: number }>;
  por_papel: Record<string, Usage & { custo_usd: number }>;
  spawns: Record<string, number>; // subagent_type -> nº de Task
  cache: { read: number; creation: number; fresco: number };
  // Sinais de THROUGHPUT (runner.log)
  throughput: {
    restarts: number; // "runner v2 iniciado"
    calls: number; // "Disparando Claude"
    rc0: number;
    rc1: number;
    sem_rc: number; // calls sem "Claude rc=" → mortas no meio
    hard_fail_32k: number; // "32000 output token"
    pausas_falso_limite: number; // do worker (passado pelo caller)
  };
  // Destaque do gargalo (papel com maior custo-proxy)
  gargalo: { papel: string; custo_usd: number; pct_output: number } | null;
}

const RX_USAGE = /"usage"/;
const RX_SUBTYPE = /"subagent_type":"([^"]+)"/g;

// Agrega um transcript JSONL (conteúdo em linhas). Puro (recebe texto, não lê disco).
export function agregarTranscript(
  conteudo: string,
  acc: {
    totais: Usage;
    porModelo: Record<string, Usage>;
    porPapel: Record<string, Usage>;
    spawns: Record<string, number>;
  }
): void {
  let subagentAtivo: string | null = null;
  for (const linha of conteudo.split("\n")) {
    if (!linha) continue;
    // Rastreia o subagent_type spawnado (aparece em tool_use Task antes das linhas sidechain)
    if (linha.includes('"subagent_type"')) {
      RX_SUBTYPE.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = RX_SUBTYPE.exec(linha))) {
        subagentAtivo = m[1];
        acc.spawns[m[1]] = (acc.spawns[m[1]] ?? 0) + 1;
      }
    }
    if (!RX_USAGE.test(linha)) continue;
    let d: any;
    try {
      d = JSON.parse(linha);
    } catch {
      continue;
    }
    if (d.type !== "assistant") continue;
    const u = d.message?.usage;
    if (!u) continue;
    const t = tier(d.message?.model);
    const side = Boolean(d.isSidechain);
    acumular(acc.totais, u);
    const mk = (rec: Record<string, Usage>, key: string) => (rec[key] ??= usageZero());
    acumular(mk(acc.porModelo, t), u);
    acumular(mk(acc.porPapel, papel(side, t, side ? subagentAtivo : null)), u);
  }
}

// Extrai os sinais de throughput do runner.log (contagens de regex).
export function sinaisRunnerLog(log: string): Telemetria["throughput"] {
  const cont = (rx: RegExp) => (log.match(rx) || []).length;
  const calls = cont(/Disparando Claude/g);
  const rc0 = cont(/Claude rc=0/g);
  const rc1 = cont(/Claude rc=1/g);
  return {
    restarts: cont(/runner v2 iniciado/g),
    calls,
    rc0,
    rc1,
    sem_rc: Math.max(0, calls - rc0 - rc1),
    hard_fail_32k: cont(/32000 output token/g),
    pausas_falso_limite: 0,
  };
}

// Deriva o nome da pasta de transcript a partir do cwd absoluto (Claude Code troca
// todo não-alfanumérico por '-'). Ex.: C:\Users\Rodrigo Paiva\atelier-work\<id>
//   → C--Users-Rodrigo-Paiva-atelier-work-<id>
export function pastaTranscript(cwdAbs: string): string {
  return cwdAbs.replace(/[^a-zA-Z0-9]/g, "-");
}

// Coleta a telemetria de UM projeto: lê os transcripts do cwd do runner + o runner.log.
// projetoDir = pasta de trabalho (WORK_DIR/<id>). Retorna null se não há transcripts.
export async function coletarTelemetria(
  projetoDir: string,
  extras?: { pausasFalsoLimite?: number }
): Promise<Telemetria | null> {
  const cwdAbs = path.resolve(projetoDir);
  const dir = path.join(os.homedir(), ".claude", "projects", pastaTranscript(cwdAbs));
  if (!existsSync(dir)) return null;

  const acc = {
    totais: usageZero(),
    porModelo: {} as Record<string, Usage>,
    porPapel: {} as Record<string, Usage>,
    spawns: {} as Record<string, number>,
  };
  let n = 0;
  const walk = async (d: string): Promise<void> => {
    let ents: string[] = [];
    try {
      ents = await readdir(d);
    } catch {
      return;
    }
    for (const e of ents) {
      const full = path.join(d, e);
      let s;
      try {
        s = await stat(full);
      } catch {
        continue;
      }
      if (s.isDirectory()) await walk(full);
      else if (e.endsWith(".jsonl")) {
        n++;
        agregarTranscript(await readFile(full, "utf8").catch(() => ""), acc);
      }
    }
  };
  await walk(dir);
  if (n === 0) return null;

  const log = await readFile(path.join(projetoDir, "runner.log"), "utf8").catch(() => "");
  const throughput = sinaisRunnerLog(log);
  throughput.pausas_falso_limite = extras?.pausasFalsoLimite ?? 0;

  const conCusto = (rec: Record<string, Usage>) => {
    const out: Record<string, Usage & { custo_usd: number }> = {};
    for (const [k, u] of Object.entries(rec)) {
      const t = k.includes("opus") ? "opus" : k.includes("sonnet") ? "sonnet" : k.includes("haiku") ? "haiku" : "outro";
      out[k] = { ...u, custo_usd: Number(custoProxy(t as Tier, u).toFixed(2)) };
    }
    return out;
  };
  const porPapel = conCusto(acc.porPapel);
  const totOut = acc.totais.output || 1;
  let gargalo: Telemetria["gargalo"] = null;
  for (const [p, u] of Object.entries(porPapel)) {
    if (!gargalo || u.custo_usd > gargalo.custo_usd) {
      gargalo = { papel: p, custo_usd: u.custo_usd, pct_output: Number(((100 * u.output) / totOut).toFixed(1)) };
    }
  }

  return {
    gerado_em: new Date().toISOString(),
    transcripts: n,
    totais: acc.totais,
    custo_proxy_usd: Number(Object.values(porPapel).reduce((s, u) => s + u.custo_usd, 0).toFixed(2)),
    por_modelo: conCusto(acc.porModelo),
    por_papel: porPapel,
    spawns: acc.spawns,
    cache: { read: acc.totais.cache_read, creation: acc.totais.cache_creation, fresco: acc.totais.input },
    throughput,
    gargalo,
  };
}
