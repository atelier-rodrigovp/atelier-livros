// Engine V2 — integração no dispatch do worker (D2 / padrão ADR-EZC-001).
// UM único ponto de desvio antes do dispatch V1: projetos com engine_mode='v2'
// e tipo suportado rodam o pipeline V2; todo o resto segue byte-idêntico na V1.
// engine_mode ausente/nulo/desconhecido → V1 (fail-safe, nunca fallback silencioso ao contrário).

import path from "node:path";
import { promises as fs } from "node:fs";
import type { Job } from "../jobs.js"; // import type: não executa jobs.ts
import { Gravador } from "./gravador.js";
import { criarPersistencia } from "./persistencia.js";
import { carregarContrato, MAPA_SKILL_V1_V2 } from "./contrato.js";
import { escreverCapitulo, type DepsPipeline } from "./pipeline.js";
import { mapaModelosDoAmbiente } from "./config.js";
import { ProvedorClaudeCli } from "./provedor.js";
import { hashJsonCanonico } from "./hash.js";
import { ErroEngine } from "./tipos.js";

/** Tipos de job que a V2 sabe executar (os demais permanecem na V1 mesmo em modo v2). */
export const TIPOS_V2 = new Set(["escrever_livro", "laboratorio_v2"]);

export async function engineModeDoProjeto(projectId: string): Promise<string> {
  const { sb, OWNER } = await import("../supabase.js");
  const { data, error } = await sb
    .from("projects")
    .select("engine_mode")
    .eq("owner", OWNER)
    .eq("id", projectId)
    .maybeSingle();
  if (error) {
    // Coluna/linha inacessível → fail-safe V1 (42703 = coluna inexistente).
    if (error.code === "42703") return "claude_code";
    throw error;
  }
  return (data as { engine_mode?: string } | null)?.engine_mode || "claude_code";
}

/**
 * Ponto único de roteamento. `executarV1` é injetado (não importamos jobs.ts aqui
 * para evitar ciclo de import e para manter a V1 byte-idêntica).
 */
export async function executarJobRoteado(
  job: Job,
  hb: (extra?: Record<string, unknown>) => Promise<void>,
  executarV1: (job: Job, hb: (extra?: Record<string, unknown>) => Promise<void>) => Promise<void>
): Promise<void> {
  if (job.tipo === "laboratorio_v2") {
    // Job exclusivo V2 (não existe na V1) — dispensa engine_mode.
    const { executarLaboratorio } = await import("./lab/job.js");
    return executarLaboratorio(job as unknown as Parameters<typeof executarLaboratorio>[0]);
  }
  if (job.project_id && TIPOS_V2.has(job.tipo)) {
    const modo = await engineModeDoProjeto(job.project_id);
    if (modo === "v2") return executarEscritaV2(job);
  }
  return executarV1(job, hb);
}

async function atualizarProgresso(jobId: string, progresso: Record<string, unknown>): Promise<void> {
  const { sb, OWNER } = await import("../supabase.js");
  const { data } = await sb.from("jobs").select("progresso").eq("owner", OWNER).eq("id", jobId).single();
  const atual = ((data as { progresso?: Record<string, unknown> } | null)?.progresso ?? {}) as Record<string, unknown>;
  await sb.from("jobs").update({ progresso: { ...atual, ...progresso } }).eq("owner", OWNER).eq("id", jobId);
}

/** Executa escrever_livro no pipeline V2, capítulo a capítulo, retomável. */
export async function executarEscritaV2(job: Job): Promise<void> {
  const { sb, OWNER } = await import("../supabase.js");
  const { projDir, CLAUDE_BIN } = await import("../lib.js");
  const projectId = job.project_id!;
  const { data: proj, error } = await sb
    .from("projects")
    .select("id,titulo,skill_escrita,total_capitulos,piso_palavras")
    .eq("owner", OWNER)
    .eq("id", projectId)
    .single();
  if (error || !proj) {
    throw new ErroEngine({ codigo: "PROJETO_AUSENTE", classe: "configuracao", mensagem: `projeto ${projectId} não encontrado: ${error?.message ?? ""}` });
  }

  const skillV1 = (proj as { skill_escrita?: string }).skill_escrita ?? "";
  const skillId = MAPA_SKILL_V1_V2[skillV1] ?? skillV1;
  const contrato = carregarContrato(skillId); // skill desconhecida/contrato inválido = falha clara AQUI, antes do escritor

  const dirProjeto = projDir(projectId);
  const { persistencia, migracaoPendente } = await criarPersistencia({ dirProjeto });
  const gravador = new Gravador({ persistencia, projectId });

  // Perfil do livro: perfil-de-voz.md (layout fundacao/ ou raiz).
  const candidatos = [path.join(dirProjeto, "fundacao", "perfil-de-voz.md"), path.join(dirProjeto, "perfil-de-voz.md")];
  let perfilTexto = "";
  for (const c of candidatos) {
    try {
      perfilTexto = await fs.readFile(c, "utf8");
      if (perfilTexto.trim()) break;
    } catch {
      /* tenta o próximo layout */
    }
  }
  if (!perfilTexto.trim()) {
    throw new ErroEngine({ codigo: "PERFIL_AUSENTE", classe: "configuracao", mensagem: `perfil-de-voz.md não encontrado em ${dirProjeto} — gere a fundação antes da escrita V2` });
  }

  const estado = await gravador.carregarEstado();
  const total = (proj as { total_capitulos?: number }).total_capitulos ?? estado.doc.total_capitulos ?? Number((job.payload as { total?: number })?.total ?? 0);
  if (!total || total < 1) {
    throw new ErroEngine({ codigo: "TOTAL_CAPITULOS_INDEFINIDO", classe: "configuracao", mensagem: "total de capítulos não definido no projeto nem no payload" });
  }

  const deps: DepsPipeline = {
    gravador,
    persistencia,
    provedor: new ProvedorClaudeCli(CLAUDE_BIN, dirProjeto),
    mapa: mapaModelosDoAmbiente(),
    contrato,
    perfil: { texto: perfilTexto, skillId: contrato.contrato.id, hash: hashJsonCanonico(perfilTexto), validado: true },
    dirManuscrito: path.join(dirProjeto, "manuscrito"),
    projectId,
    editionId: job.edition_id ?? null,
    jobId: job.id,
  };

  await atualizarProgresso(job.id, {
    engine: "v2",
    engine_version: estado.engine_version,
    skill: contrato.contrato.id,
    skill_versao: contrato.contrato.versao,
    migracao_pendente: migracaoPendente,
    fase: "ESCRITA",
    total,
  });

  for (let n = 1; n <= total; n++) {
    const atual = estado.doc.capitulos[String(n)];
    if (atual && (atual.status === "aprovado" || atual.status === "aprovado_com_excecao")) continue; // retomável

    // Trechos anteriores estritamente relevantes: cauda do capítulo anterior (gancho/continuidade local).
    const anteriores: { numero: number; trecho: string }[] = [];
    const trechos: { titulo: string; texto: string; fonte: string }[] = [];
    if (n > 1) {
      const prev = path.join(deps.dirManuscrito, `capitulo-${String(n - 1).padStart(2, "0")}.md`);
      try {
        const t = await fs.readFile(prev, "utf8");
        anteriores.push({ numero: n - 1, trecho: t });
        trechos.push({ titulo: `FINAL DO CAPÍTULO ${n - 1} (continuidade imediata)`, texto: t.split(/\n{2,}/).slice(-3).join("\n\n"), fonte: `capitulo-${n - 1}` });
      } catch {
        /* capítulo anterior fora do disco: o contextualizador cobre a continuidade */
      }
    }

    await atualizarProgresso(job.id, { cap_atual: n, etapa: `capitulo ${n}/${total}` });
    const r = await escreverCapitulo(deps, n, { anteriores, trechosAnteriores: trechos });

    if (r.status === "bloqueado" || r.status === "reprovado" || r.status === "necessita_decisao_humana") {
      await atualizarProgresso(job.id, {
        quality_status: r.status,
        quality_cap: n,
        quality_blockers: [...r.gatesFalhos.map((g) => `${g.gate}: ${g.evidencia ?? ""}`), ...r.problemas].slice(0, 8),
      });
      throw new ErroEngine({
        codigo: "CAPITULO_BLOQUEADO",
        classe: "qualidade",
        mensagem: `capítulo ${n} terminou em ${r.status} (${r.problemas[0] ?? r.gatesFalhos[0]?.gate ?? "sem detalhe"})`,
      });
    }
  }

  await gravador.mudarFase("revisao_final");
  await atualizarProgresso(job.id, { fase: "REVISAO_FINAL", etapa: "capítulos aprovados" });
}
