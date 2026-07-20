// Engine V2 — relatório do laboratório (F7): versão anterior vs candidata,
// métricas por skill, regressões e decisão de release. Nunca aprova release
// que melhora uma skill destruindo outra.

import path from "node:path";
import { promises as fs } from "node:fs";
import type { AvaliacaoCega } from "./avaliar.js";
import type { AmostraLab, ExecucaoLab } from "./rodar.js";

export interface RelatorioLab {
  execucaoId: string;
  anterior?: string;
  metricas: Record<string, { porSkill: Record<string, number> }>;
  distinguibilidade?: number;
  matrizConfusao?: Record<string, Record<string, number>>;
  regressoes: string[];
  vazamentos: string[];
  decisao: "aprovar" | "rejeitar" | "pendente";
}

const METRICAS = ["gnomico", "personificacao", "sanfona", "metafora_elaborada", "palavras", "dialogo_pct"] as const;

function mediaSinal(amostras: AmostraLab[], sinal: string): number {
  const valores = amostras
    .map((a) => a.sinais.find((s) => s.sinal === sinal)?.valor)
    .filter((v): v is number => typeof v === "number");
  if (!valores.length) return 0;
  return valores.reduce((s, v) => s + v, 0) / valores.length;
}

function foraDaCotaTotal(amostras: AmostraLab[]): number {
  return amostras.reduce((s, a) => s + a.sinais.filter((x) => x.fora_da_cota).length, 0);
}

export function compararExecucoes(
  atual: ExecucaoLab,
  avaliacao: AvaliacaoCega | null,
  anterior: ExecucaoLab | null
): RelatorioLab {
  const skills = atual.skills.map((s) => s.id);
  const metricas: RelatorioLab["metricas"] = {};
  for (const m of METRICAS) {
    metricas[m] = { porSkill: {} };
    for (const sk of skills) {
      metricas[m].porSkill[sk] = mediaSinal(atual.amostras.filter((a) => a.skillId === sk), m);
    }
  }
  metricas["fora_da_cota"] = { porSkill: {} };
  for (const sk of skills) {
    metricas["fora_da_cota"].porSkill[sk] = foraDaCotaTotal(atual.amostras.filter((a) => a.skillId === sk));
  }

  // Vazamentos determinísticos: gate de POV falho = voz estruturalmente fora do contrato.
  const vazamentos: string[] = [];
  for (const a of atual.amostras) {
    const pov = a.gates.find((g) => g.gate === "pov_impossivel" && !g.passou);
    if (pov) vazamentos.push(`${a.id}: POV fora do contrato (${pov.evidencia ?? ""})`);
  }

  // Regressões contra a execução anterior: métrica de tique piorou >30% em QUALQUER skill,
  // ou distinguibilidade caiu >0,15 (quando ambas as execuções têm avaliação).
  const regressoes: string[] = [];
  if (anterior) {
    const METRICAS_TIQUE = ["gnomico", "personificacao", "sanfona", "metafora_elaborada"] as const;
    for (const sk of skills) {
      const antes = anterior.amostras.filter((a) => a.skillId === sk);
      const agora = atual.amostras.filter((a) => a.skillId === sk);
      if (!antes.length || !agora.length) continue;
      for (const m of METRICAS_TIQUE) {
        const va = mediaSinal(antes, m);
        const vb = mediaSinal(agora, m);
        if (va > 0 ? vb > va * 1.3 : vb > 1) {
          regressoes.push(`${sk}: ${m} piorou (${va.toFixed(2)} → ${vb.toFixed(2)})`);
        }
      }
    }
  }

  let decisao: RelatorioLab["decisao"];
  if (regressoes.length > 0 || vazamentos.length > 0) decisao = "rejeitar";
  else if (!avaliacao) decisao = "pendente";
  else decisao = "aprovar";

  return {
    execucaoId: atual.id,
    anterior: anterior?.id,
    metricas,
    distinguibilidade: avaliacao?.distinguibilidade,
    matrizConfusao: avaliacao?.matrizConfusao,
    regressoes,
    vazamentos,
    decisao,
  };
}

export async function gravarRelatorio(dirSaida: string, relatorio: RelatorioLab): Promise<string> {
  const caminho = path.join(dirSaida, relatorio.execucaoId, "relatorio.json");
  await fs.mkdir(path.dirname(caminho), { recursive: true });
  const tmp = `${caminho}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(relatorio, null, 2), "utf8");
  await fs.rename(tmp, caminho);
  return caminho;
}

/** Localiza a execução mais recente (por executadaEm) em dirSaida, exceto a excluída. */
export async function execucaoAnterior(dirSaida: string, excetoId?: string): Promise<ExecucaoLab | null> {
  let entradas: string[] = [];
  try {
    entradas = await fs.readdir(dirSaida);
  } catch {
    return null;
  }
  let melhor: ExecucaoLab | null = null;
  for (const e of entradas) {
    if (e === excetoId) continue;
    try {
      const raw = await fs.readFile(path.join(dirSaida, e, "execucao.json"), "utf8");
      const exec = JSON.parse(raw) as ExecucaoLab;
      if (!melhor || exec.executadaEm > melhor.executadaEm) melhor = exec;
    } catch {
      /* diretório sem execucao.json: ignora */
    }
  }
  return melhor;
}
