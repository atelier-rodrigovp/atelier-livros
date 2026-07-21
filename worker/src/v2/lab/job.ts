// Engine V2 — handler do job "laboratorio_v2" (F7).
// Roda o laboratório com o provedor real, faz a avaliação cega e publica o
// relatório em jobs.progresso (a UI lê de lá; amostras cegas SEM a skill para
// a avaliação humana às cegas).

import path from "node:path";
import { DiscoPersistencia } from "../persistencia.js";
import { mapaModelosDoAmbiente } from "../config.js";
import { ProvedorClaudeCli } from "../provedor.js";
import { MAPA_SKILL_V1_V2 } from "../contrato.js";
import { rodarLab } from "./rodar.js";
import { avaliarCego } from "./avaliar.js";
import { compararExecucoes, execucaoAnterior, gravarRelatorio } from "./relatorio.js";
import type { CategoriaCena } from "./cenas.js";

interface JobLab {
  id: string;
  payload?: unknown;
}

interface PayloadLab {
  skills?: string[];
  categorias?: CategoriaCena[];
  avaliar?: boolean;
}

export async function executarLaboratorio(job: JobLab): Promise<void> {
  const { sb, OWNER } = await import("../../supabase.js");
  const { CLAUDE_BIN, WORK_DIR } = await import("../../lib.js");

  const progresso = async (p: Record<string, unknown>) => {
    const { data } = await sb.from("jobs").select("progresso").eq("owner", OWNER).eq("id", job.id).single();
    const atual = ((data as { progresso?: Record<string, unknown> } | null)?.progresso ?? {}) as Record<string, unknown>;
    await sb.from("jobs").update({ progresso: { ...atual, ...p } }).eq("owner", OWNER).eq("id", job.id);
  };

  const payload = (job.payload ?? {}) as PayloadLab;
  const skills = payload.skills?.length ? payload.skills : Object.values(MAPA_SKILL_V1_V2);
  const dirSaida = path.join(WORK_DIR, "lab-v2");
  const provedor = new ProvedorClaudeCli(CLAUDE_BIN);
  const mapa = mapaModelosDoAmbiente();
  const persistencia = new DiscoPersistencia(dirSaida);

  await progresso({ fase: "LAB", etapa: `escrevendo amostras (${skills.length} skills × cenas)` });
  const anterior = await execucaoAnterior(dirSaida);
  const exec = await rodarLab({ skills, categorias: payload.categorias, provedor, mapa, dirSaida, persistencia });

  let avaliacao = null;
  if (payload.avaliar !== false) {
    await progresso({ etapa: `avaliação cega (${exec.amostras.length} amostras)` });
    avaliacao = await avaliarCego(exec, { provedor, mapa, persistencia });
  }

  const relatorio = compararExecucoes(exec, avaliacao, anterior && anterior.id !== exec.id ? anterior : null);
  const relPath = await gravarRelatorio(dirSaida, relatorio);

  await progresso({
    fase: "LAB",
    etapa: "concluído",
    lab_relatorio: relatorio,
    lab_execucao_id: exec.id,
    lab_relatorio_path: relPath,
    // Versões dos contratos desta execução (a UI mostra "dan-brown@1.1.0 …").
    lab_skills: exec.skills,
    // Amostras cegas para avaliação HUMANA: sem skillId (a UI revela só depois do palpite).
    lab_cegas: [...exec.amostras]
      .sort((a, b) => a.textoHash.localeCompare(b.textoHash))
      .map((a) => ({ amostraId: a.id.replace(/^[^:]+:/, "amostra:"), hash: a.textoHash, categoria: a.categoria, texto: a.texto.slice(0, 2000) })),
    // Gabarito separado (a UI só consulta após o palpite do usuário).
    lab_gabarito: Object.fromEntries(exec.amostras.map((a) => [a.textoHash, a.skillId])),
  });
}
