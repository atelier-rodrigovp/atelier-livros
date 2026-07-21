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
import { compilarPacote, type SecaoContexto } from "./compilador.js";
import { executarPapel } from "./papeis.js";
import { tarefaCanarioVoz, tarefaEditorEstrutural } from "./tarefas.js";
import { aplicarEdicaoEstrutural, validarPropostas, type PlanoEstrutural } from "./estrutural.js";
import { executarMeta9 } from "./meta9.js";
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
  if (job.tipo === "canario_voz") {
    // Job exclusivo V2 (wizard): cena curta de amostra da voz antes da fundação.
    return executarCanarioVoz(job);
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
    .select("id,titulo,skill_escrita,total_capitulos,piso_palavras,briefing")
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

  // Docs factuais do contrato (ex.: dossie-factual.md do dan-brown, matriz-de-relogios
  // do hoover): quando existem no projeto, entram VERBATIM no pacote do revisor e do
  // auditor — antes o auditor julgava contradição sem o dossiê (gap admitido na F9).
  const docsFactuais: { titulo: string; texto: string; fonte: string }[] = [];
  for (const doc of contrato.contrato.estruturas_exigidas?.docs ?? []) {
    for (const c of [path.join(dirProjeto, "fundacao", doc), path.join(dirProjeto, doc)]) {
      try {
        const t = await fs.readFile(c, "utf8");
        if (t.trim()) {
          docsFactuais.push({ titulo: `DOC FACTUAL: ${doc}`, texto: t, fonte: doc });
          break;
        }
      } catch {
        /* doc ausente neste layout — tenta o próximo; ausência é sinalizada pelos gates de fundação */
      }
    }
  }

  // Decisões explícitas do autor (wizard) = camada 3 do compilador (decisao_autor).
  const briefing = ((proj as { briefing?: Record<string, unknown> }).briefing ?? {}) as {
    decisoes_autor?: { texto?: string; em?: string }[];
  };
  const instrucoesAutor = (briefing.decisoes_autor ?? [])
    .filter((d) => typeof d?.texto === "string" && d.texto.trim())
    .map((d) => ({
      texto: d.texto!.trim(),
      camada: "decisao_autor" as const,
      fonte: `autor:${d.em ?? "briefing"}`,
    }));

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
    docsFactuais,
    instrucoesAutor,
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

  // Escrita incremental controlada (ex.: prova de 1 capítulo num livro migrado):
  // payload.max_novos_caps limita quantos capítulos NOVOS esta execução escreve.
  const maxNovosCaps = Number((job.payload as { max_novos_caps?: number })?.max_novos_caps ?? 0) || Infinity;
  let novosCaps = 0;
  const legadosPulados: number[] = [];

  for (let n = 1; n <= total; n++) {
    const atual = estado.doc.capitulos[String(n)];
    if (atual && (atual.status === "aprovado" || atual.status === "aprovado_com_excecao")) continue; // retomável
    if (atual && atual.status === "legado_sem_evidencia") {
      // Capítulo migrado da V1 sem evidência: NUNCA sobrescrever a prosa do autor.
      // Reescrevê-lo é decisão humana (UI), não efeito colateral de escrever_livro.
      legadosPulados.push(n);
      continue;
    }
    if (novosCaps >= maxNovosCaps) {
      await atualizarProgresso(job.id, {
        fase: "ESCRITA",
        etapa: `limite de ${maxNovosCaps} capítulo(s) novo(s) atingido — job encerrado sem revisão final`,
        ...(legadosPulados.length ? { aviso_legado: `capítulos legado preservados (não reescritos): ${legadosPulados.join(", ")}` } : {}),
      });
      return;
    }

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
    novosCaps++;

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

  // Livro migrado com capítulos legado pulados: o manuscrito NÃO está todo
  // aprovado pela V2 — revisão final/meta-nota exigiria reescrever prosa do
  // autor sem decisão humana. Encerra honesto, com o aviso no progresso.
  if (legadosPulados.length > 0) {
    await atualizarProgresso(job.id, {
      fase: "ESCRITA",
      etapa: "capítulos novos concluídos; capítulos legado preservados (revisão final aguarda decisão do autor)",
      aviso_legado: `capítulos legado preservados (não reescritos): ${legadosPulados.join(", ")}`,
    });
    return;
  }

  // Retomabilidade: um job re-executado com a meta-nota já em curso NUNCA pode
  // tentar regredir a fase (avaliacao → revisao_final é transição inválida) nem
  // re-rodar o editor estrutural (cada retomada geraria um plano novo).
  const estadoPosEscrita = await gravador.carregarEstado();
  if (estadoPosEscrita.doc.fase === "concluido") {
    await atualizarProgresso(job.id, { fase: "CONCLUIDO", etapa: "já concluído (retomada)" });
    return;
  }
  if (estadoPosEscrita.doc.fase === "escrita") {
    await gravador.mudarFase("revisao_final");
  }
  await atualizarProgresso(job.id, { fase: "REVISAO_FINAL", etapa: "capítulos aprovados" });

  // ---------------------------------------------------------------------------
  // PARTE A — Editor estrutural (propõe corte/reordenação; o pipeline aplica no disco).
  // Pulado na retomada quando o estado já registra uma edição estrutural.
  // ---------------------------------------------------------------------------
  if (estadoPosEscrita.doc.edicao_estrutural) {
    await atualizarProgresso(job.id, { fase: "EDICAO_ESTRUTURAL", etapa: "já aplicada (retomada)" });
    return executarMeta9Integrada(job, {
      gravador, persistencia, deps, contrato, dirProjeto, projectId, docsFactuais,
    });
  }
  const secoesCaps: SecaoContexto[] = [];
  for (let n = 1; n <= total; n++) {
    const ficha = await persistencia.lerFichaMaisRecente(projectId, n);
    if (ficha) {
      secoesCaps.push({ titulo: `CAPÍTULO ${n} — FICHA`, texto: JSON.stringify(ficha, null, 2), fonte: `spec:${n}` });
    } else {
      // Sem ficha persistida: usa as primeiras ~150 palavras da prosa como resumo estrutural.
      let resumo = "";
      try {
        const t = await fs.readFile(path.join(deps.dirManuscrito, `capitulo-${String(n).padStart(2, "0")}.md`), "utf8");
        resumo = t.split(/\s+/).filter(Boolean).slice(0, 150).join(" ");
      } catch {
        /* capítulo ausente no disco: seção fica vazia */
      }
      secoesCaps.push({ titulo: `CAPÍTULO ${n} — ABERTURA`, texto: resumo, fonte: `capitulo:${n}` });
    }
  }

  const compEd = compilarPacote({ papel: "editor_estrutural", alvo: "livro", contrato, perfil: deps.perfil, fatos: secoesCaps });
  if (!compEd.ok) {
    throw new ErroEngine({
      codigo: "EDICAO_ESTRUTURAL_BLOQUEADA",
      classe: "qualidade",
      mensagem: `edição estrutural bloqueada na compilação: ${compEd.bloqueios.map((b) => `${b.codigo}: ${b.detalhe}`).join(" · ")}`,
    });
  }
  let plano: PlanoEstrutural;
  let runIdEd: string;
  try {
    const r = await executarPapel<PlanoEstrutural>({
      gravador,
      provedor: deps.provedor,
      mapa: deps.mapa,
      jobId: job.id,
      editionId: job.edition_id ?? null,
      papel: "editor_estrutural",
      alvo: "livro",
      pacote: compEd.pacote!,
      tarefa: tarefaEditorEstrutural(total, contrato.contrato),
      parse: (t) => validarPropostas(extrairJson(t), total),
    });
    plano = r.valor;
    runIdEd = r.runId;
  } catch (e) {
    // Erro de schema após os retries do executor → qualidade (não silencioso).
    if (e instanceof ErroEngine && e.codigo === "FORA_DO_SCHEMA") {
      throw new ErroEngine({ codigo: "EDICAO_ESTRUTURAL_SCHEMA", classe: "qualidade", mensagem: e.message });
    }
    throw e;
  }
  const relatorioEd = aplicarEdicaoEstrutural({ dirManuscrito: deps.dirManuscrito, propostas: plano.propostas, total });
  await gravador.registrarEdicaoEstrutural({
    run_id: runIdEd,
    propostas: plano.propostas.length,
    aplicadas: relatorioEd.aplicadas.length,
    detalhe: relatorioEd.aplicadas,
  });
  await gravador.aplicarMapaCapitulos(relatorioEd.mapa);
  await atualizarProgresso(job.id, {
    fase: "EDICAO_ESTRUTURAL",
    propostas: plano.propostas.length,
    aplicadas: relatorioEd.aplicadas.length,
  });

  // ---------------------------------------------------------------------------
  // PARTE B — Meta-nota (bestseller): consolida, avalia e reescreve até a meta.
  // ---------------------------------------------------------------------------
  await executarMeta9Integrada(job, { gravador, persistencia, deps, contrato, dirProjeto, projectId, docsFactuais });
}

/** Chamada da meta-nota compartilhada entre o fluxo normal e a retomada. */
async function executarMeta9Integrada(
  job: Job,
  ctx: {
    gravador: Gravador;
    persistencia: Awaited<ReturnType<typeof criarPersistencia>>["persistencia"];
    deps: DepsPipeline;
    contrato: ReturnType<typeof carregarContrato>;
    dirProjeto: string;
    projectId: string;
    docsFactuais: { titulo: string; texto: string; fonte: string }[];
  }
): Promise<void> {
  await executarMeta9({
    gravador: ctx.gravador,
    persistencia: ctx.persistencia,
    provedor: ctx.deps.provedor,
    mapa: ctx.deps.mapa,
    contrato: ctx.contrato,
    perfil: ctx.deps.perfil,
    dirProjeto: ctx.dirProjeto,
    dirManuscrito: ctx.deps.dirManuscrito,
    projectId: ctx.projectId,
    editionId: job.edition_id ?? null,
    jobId: job.id,
    docsFactuais: ctx.docsFactuais,
    meta: (job.payload as { meta_nota?: number })?.meta_nota ?? 9,
    maxIteracoes: (job.payload as { max_iteracoes?: number })?.max_iteracoes ?? 3,
    reportarEtapa: async (etapa, dados) => {
      if (etapa === "CONSOLIDACAO") await atualizarProgresso(job.id, { fase: "CONSOLIDACAO" });
      else if (etapa === "AVALIACAO") await atualizarProgresso(job.id, { fase: "AVALIACAO", ...(dados ?? {}) });
      else if (etapa === "CONCLUIDO") await atualizarProgresso(job.id, { fase: "CONCLUIDO", ...(dados ?? {}) });
    },
  });
}

/**
 * Canário de voz (wizard, F4): UMA cena curta de amostra na skill escolhida, antes
 * da fundação. O texto vai para jobs.progresso.canario_voz (a UI lê de lá) e uma
 * cópia de auditoria fica em <dirProjeto>/canario-voz.md. Nenhum capítulo é criado.
 */
export async function executarCanarioVoz(job: Job): Promise<void> {
  const { sb, OWNER } = await import("../supabase.js");
  const { projDir, CLAUDE_BIN } = await import("../lib.js");
  const projectId = job.project_id;
  if (!projectId) {
    throw new ErroEngine({ codigo: "PROJETO_AUSENTE", classe: "configuracao", mensagem: "canario_voz sem project_id" });
  }
  const { data: proj, error } = await sb
    .from("projects")
    .select("id,titulo,skill_escrita,briefing")
    .eq("owner", OWNER)
    .eq("id", projectId)
    .single();
  if (error || !proj) {
    throw new ErroEngine({ codigo: "PROJETO_AUSENTE", classe: "configuracao", mensagem: `projeto ${projectId} não encontrado: ${error?.message ?? ""}` });
  }

  const skillV1 = (job.payload as { skill_escrita?: string })?.skill_escrita
    ?? (proj as { skill_escrita?: string }).skill_escrita
    ?? "";
  const skillId = MAPA_SKILL_V1_V2[skillV1] ?? skillV1;
  const contrato = carregarContrato(skillId);

  const briefing = ((proj as { briefing?: Record<string, unknown> }).briefing ?? {}) as { ideia_central?: string };
  const ideia = (briefing.ideia_central ?? "").trim() || `um livro na família ${contrato.contrato.familia_editorial}`;

  const dirProjeto = projDir(projectId);
  const { persistencia } = await criarPersistencia({ dirProjeto });
  const gravador = new Gravador({ persistencia, projectId });

  // Perfil sintético: ainda não há fundação — o canário demonstra a VOZ do contrato.
  const comp = compilarPacote({
    papel: "escritor",
    alvo: "canario-voz",
    contrato,
    perfil: {
      texto: `Amostra de voz pré-fundação. Ideia central do autor: ${ideia}`,
      skillId: contrato.contrato.id,
      hash: hashJsonCanonico(ideia),
      validado: true,
    },
  });
  if (!comp.ok) {
    throw new ErroEngine({
      codigo: "CANARIO_VOZ_BLOQUEADO",
      classe: "configuracao",
      mensagem: `canário de voz bloqueado na compilação: ${comp.bloqueios.map((b) => `${b.codigo}: ${b.detalhe}`).join(" · ")}`,
    });
  }
  const r = await executarPapel<string>({
    gravador,
    provedor: new ProvedorClaudeCli(CLAUDE_BIN, dirProjeto),
    mapa: mapaModelosDoAmbiente(),
    jobId: job.id,
    papel: "escritor",
    alvo: "canario-voz",
    pacote: comp.pacote!,
    tarefa: tarefaCanarioVoz(ideia, contrato.contrato),
    parse: (t) => {
      const limpo = t.trim();
      if (!limpo) throw new Error("cena vazia");
      return limpo;
    },
  });

  // Cópia de auditoria no disco (worker escreve; modelo nunca toca disco).
  await fs.mkdir(dirProjeto, { recursive: true });
  await fs.writeFile(path.join(dirProjeto, "canario-voz.md"), r.valor, "utf8");

  await atualizarProgresso(job.id, {
    fase: "CANARIO_VOZ",
    canario_voz: {
      texto: r.valor,
      skill_id: contrato.contrato.id,
      contrato_versao: contrato.contrato.versao,
      hash: hashJsonCanonico(r.valor),
    },
  });
}

/** Extrai JSON da resposta do modelo (aceita cerca ```json ... ```). Lança se inválido. */
function extrairJson(texto: string): unknown {
  const m = texto.match(/```(?:json)?\s*([\s\S]*?)```/);
  return JSON.parse((m ? m[1] : texto).trim());
}
