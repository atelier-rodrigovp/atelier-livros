// Engine V2 — integração no dispatch do worker (D2 / padrão ADR-EZC-001).
// UM único ponto de desvio antes do dispatch V1: projetos com engine_mode='v2'
// e tipo suportado rodam o pipeline V2; todo o resto segue byte-idêntico na V1.
// engine_mode ausente/nulo/desconhecido → V1 (fail-safe, nunca fallback silencioso ao contrário).

import path from "node:path";
import { promises as fs } from "node:fs";
import { hashText } from "../quality-state.js";
import type { Job } from "../jobs.js"; // import type: não executa jobs.ts
import { Gravador } from "./gravador.js";
import { criarPersistencia, type PersistenciaV2 } from "./persistencia.js";
import { carregarContrato, lerOficioSkill, MAPA_SKILL_V1_V2 } from "./contrato.js";
import { escreverCapitulo, type DepsPipeline } from "./pipeline.js";
import { mapaModelosDoAmbiente } from "./config.js";
import { ProvedorClaudeCli, type ProvedorModelo } from "./provedor.js";
import { hashJsonCanonico } from "./hash.js";
import { compilarPacote, type SecaoContexto } from "./compilador.js";
import { executarPapel } from "./papeis.js";
import { tarefaCanarioVoz, tarefaEditorEstrutural, tarefaRevisorCanario } from "./tarefas.js";
import { gerarFundacaoV2, materializarFundacao } from "./fundacao.js";
import { autorizarFundacao, type BriefingAprovado } from "./briefing-aprovacao.js";
import { compararPremissas, decidirComPremissaAlterada, invalidarPorPremissa } from "./canario-snapshot.js";
import { documentosDaFundacao } from "./documentos.js";
import { parsearArco } from "./arco.js";
import { avaliarFechamentoLivro } from "./fechamento.js";
import { escreverCapituloComEscada } from "./correcao.js";
import { reconstruirLedger } from "./ledger.js";
import {
  briefingParaFundacao,
  decisoesAvulsas,
  instrucoesDoBriefing,
  preferenciasDoBriefing,
  resolverIdioma,
  type BriefingAutor,
} from "./briefing.js";
import { garantirEdicaoOrigem, marcarEdicaoEmRevisao, sincronizarCapitulosAprovados } from "./capitulos-db.js";
import { gravarCustoV2Projeto } from "./custo-persistencia.js";
import {
  aplicarEdicaoEstrutural,
  fundirTextosCapitulos,
  planejarEdicaoEstrutural,
  reverterEdicaoEstrutural,
  validarPropostas,
  type PlanoEstrutural,
} from "./estrutural.js";
import { fundirFichas, PersistenciaEstadoIsolado } from "./estrutural-staging.js";
import { executarMeta9 } from "./meta9.js";
import { resolverTotalCapitulos } from "./total-capitulos.js";
import { medirSinais, resumoSinais } from "./sinais.js";
import { exigirReleaseAtual, lerAutorizacaoProjeto, type OperacaoV2 } from "./release.js";
import { conferirParecer, exigirDisposicaoCompleta, validarParecer } from "./revisor.js";
import {
  ErroEngine,
  type ArcoFundacao,
  type ContratoCompilado,
  type EstadoCanonico,
  type MapaModelos,
  type Parecer,
  type SceneSpec,
} from "./tipos.js";

interface ProjetoFundacaoRow {
  id: string;
  titulo: string;
  skill_escrita: string | null;
  total_capitulos: number | null;
  idioma_origem: string | null;
  briefing: BriefingAutor;
  briefing_aprovado: BriefingAprovado | null;
}

function registro(valor: unknown, nome: string): Record<string, unknown> {
  if (!valor || typeof valor !== "object" || Array.isArray(valor)) {
    throw new ErroEngine({
      codigo: "DADO_BANCO_INVALIDO",
      classe: "configuracao",
      mensagem: `${nome} não é um objeto`,
    });
  }
  return valor as Record<string, unknown>;
}

/**
 * Fronteira tipada do banco. O cast antigo inventava `briefing_aprovado` mesmo
 * sem a coluna existir/ser selecionada; aqui ausência é erro visível.
 */
export function lerProjetoFundacao(valor: unknown): ProjetoFundacaoRow {
  const o = registro(valor, "projects");
  if (!Object.prototype.hasOwnProperty.call(o, "briefing_aprovado")) {
    throw new ErroEngine({
      codigo: "COLUNA_BRIEFING_APROVADO_AUSENTE",
      classe: "configuracao",
      mensagem:
        "projects.briefing_aprovado não foi retornado; aplique supabase/engine_v2_fluxo.sql e selecione a coluna explicitamente",
    });
  }
  const briefing = registro(o.briefing ?? {}, "projects.briefing") as BriefingAutor;
  let aprovacao: BriefingAprovado | null = null;
  if (o.briefing_aprovado != null) {
    const a = registro(o.briefing_aprovado, "projects.briefing_aprovado");
    const snapshot = registro(a.briefing, "projects.briefing_aprovado.briefing") as BriefingAutor;
    if (
      a.schema !== "briefing-aprovado/v1" ||
      typeof a.hash !== "string" ||
      !/^[0-9a-f]{64}$/.test(a.hash) ||
      typeof a.aprovado_por !== "string" ||
      !a.aprovado_por.trim() ||
      typeof a.aprovado_em !== "string"
    ) {
      throw new ErroEngine({
        codigo: "BRIEFING_APROVACAO_INVALIDA",
        classe: "configuracao",
        mensagem: "projects.briefing_aprovado tem estrutura inválida",
      });
    }
    aprovacao = {
      schema: "briefing-aprovado/v1",
      hash: a.hash,
      aprovado_por: a.aprovado_por,
      aprovado_em: a.aprovado_em,
      briefing: snapshot,
    };
  }
  if (typeof o.id !== "string" || typeof o.titulo !== "string") {
    throw new ErroEngine({
      codigo: "DADO_BANCO_INVALIDO",
      classe: "configuracao",
      mensagem: "projects.id/titulo ausentes",
    });
  }
  return {
    id: o.id,
    titulo: o.titulo,
    skill_escrita: typeof o.skill_escrita === "string" ? o.skill_escrita : null,
    total_capitulos: typeof o.total_capitulos === "number" ? o.total_capitulos : null,
    idioma_origem: typeof o.idioma_origem === "string" ? o.idioma_origem : null,
    briefing,
    briefing_aprovado: aprovacao,
  };
}

/** Tipos de job que a V2 sabe executar (os demais permanecem na V1 mesmo em modo v2). */
export const TIPOS_V2 = new Set([
  "escrever_livro",
  "criar_fundacao",
  "laboratorio_v2",
  "revisar",
  "refinar_fundacao",
  "avaliar",
]);

/**
 * Controle determinístico usado pelos dois engines. Entrevista não produz prosa
 * nem fundação e não deve ser anunciada como vazamento para a V1 só porque o
 * handler histórico vive em jobs.ts.
 */
export const TIPOS_COMPARTILHADOS_V1_V2 = new Set(["entrevistar"]);

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
/**
 * Resultado do roteamento. `continuar` = a execução parou num CHECKPOINT limpo e
 * ainda há trabalho: o job deve voltar para a fila em vez de ser dado como
 * concluído. É o que torna a escrita encadeada (nem um job monolítico de 12
 * capítulos, nem uma parada definitiva depois do primeiro).
 */
export interface ResultadoRoteado {
  continuar?: { motivo: string; proximoCapitulo: number; progresso: Record<string, unknown> };
}

export async function executarJobRoteado(
  job: Job,
  hb: (extra?: Record<string, unknown>) => Promise<void>,
  executarV1: (job: Job, hb: (extra?: Record<string, unknown>) => Promise<void>) => Promise<void>
): Promise<ResultadoRoteado | void> {
  if (job.tipo === "laboratorio_v2") {
    // Job exclusivo V2 (não existe na V1) — dispensa engine_mode.
    const { executarLaboratorio } = await import("./lab/job.js");
    return executarLaboratorio(job as unknown as Parameters<typeof executarLaboratorio>[0]);
  }
  if (job.tipo === "canario_voz") {
    // Job exclusivo V2 (wizard): cena curta de amostra da voz antes da fundação.
    return executarCanarioVoz(job);
  }
  if (job.project_id && TIPOS_COMPARTILHADOS_V1_V2.has(job.tipo)) {
    const modo = await engineModeDoProjeto(job.project_id);
    if (modo === "v2") {
      registrarHandlerCompartilhado(job);
      return executarV1(job, hb);
    }
  }
  if (job.project_id && TIPOS_V2.has(job.tipo)) {
    const modo = await engineModeDoProjeto(job.project_id);
    if (modo === "v2") {
      // Custo por papel/capítulo é agregado ao FIM de toda execução V2, inclusive
      // quando ela falha: o trabalho que falhou consumiu cota igual, e um custo
      // que só existisse no caminho feliz mediria o livro pela metade.
      try {
        if (job.tipo === "criar_fundacao") return await executarFundacaoV2Job(job);
        if (job.tipo === "refinar_fundacao") return await executarRefinarFundacaoV2(job);
        if (job.tipo === "avaliar") return await executarAvaliarV2(job);
        if (job.tipo === "revisar") {
          // Revisão V2 opera na edição de ORIGEM; tradução segue o pipeline V1.
          if (await edicaoEhTraducao(job.edition_id)) {
            registrarDesvioV1(job, "revisão de tradução não tem pipeline V2");
            return await executarV1(job, hb);
          }
          return await executarRevisarV2(job);
        }
        return await executarEscritaV2(job);
      } finally {
        await gravarCustoV2Projeto(job.project_id);
      }
    }
  }
  // Projeto V2 cujo TIPO de job não tem implementação V2 (gerar_epub, traduzir,
  // gerar_capa…) cai aqui legitimamente — mas nunca em silêncio. Rota calada é
  // como um livro V2 seria montado por código V1 sem ninguém notar.
  if (job.project_id && !TIPOS_V2.has(job.tipo) && !TIPOS_COMPARTILHADOS_V1_V2.has(job.tipo)) {
    const modo = await engineModeDoProjeto(job.project_id).catch(() => "desconhecido");
    if (modo === "v2") registrarDesvioV1(job, `tipo '${job.tipo}' não tem implementação V2`);
  }
  return executarV1(job, hb);
}

/** Toda vez que um projeto V2 executa por código V1, isso vai para o log. */
export function registrarDesvioV1(job: Pick<Job, "id" | "tipo">, motivo: string): void {
  console.log(`[engine-v2] job ${job.id} (${job.tipo}) roteado para a V1 — ${motivo}`);
}

/** Handler comum não é desvio: deixa explícito que nenhum engine de prosa atuou. */
export function registrarHandlerCompartilhado(job: Pick<Job, "id" | "tipo">): void {
  console.log(`[engine-v2] job ${job.id} (${job.tipo}) executado pelo handler compartilhado V1/V2 — controle determinístico, sem prosa`);
}

async function atualizarProgresso(jobId: string, progresso: Record<string, unknown>): Promise<void> {
  const { sb, OWNER } = await import("../supabase.js");
  const { data } = await sb.from("jobs").select("progresso").eq("owner", OWNER).eq("id", jobId).single();
  const atual = ((data as { progresso?: Record<string, unknown> } | null)?.progresso ?? {}) as Record<string, unknown>;
  await sb.from("jobs").update({ progresso: { ...atual, ...progresso } }).eq("owner", OWNER).eq("id", jobId);
}

interface FusaoPrevalidada {
  origens: number[];
  destino: number;
  conteudo: string;
  textHash: string;
  palavras: number;
  reviewId: string;
  ficha: SceneSpec;
}

function contarPalavras(texto: string): number {
  return texto.split(/\s+/).filter(Boolean).length;
}

export async function prepararEdicaoEstrutural(opts: {
  plano: PlanoEstrutural;
  total: number;
  deps: DepsPipeline;
  persistencia: PersistenciaV2;
  estado: EstadoCanonico;
  dirProjeto: string;
  jobId: string;
}): Promise<{
  fichasOriginais: Map<number, SceneSpec>;
  fichasFinais: Map<number, SceneSpec>;
  fusoes: FusaoPrevalidada[];
  conteudosFusao: Record<number, string>;
}> {
  const previa = planejarEdicaoEstrutural(opts.plano.propostas, opts.total);
  const fichasOriginais = new Map<number, SceneSpec>();
  for (let cap = 1; cap <= opts.total; cap++) {
    const ficha = await opts.persistencia.lerFichaMaisRecente(opts.deps.projectId, cap);
    if (!ficha) {
      throw new ErroEngine({
        codigo: "EDICAO_ESTRUTURAL_FICHA_AUSENTE",
        classe: "qualidade",
        mensagem: `edição estrutural: ficha canônica do capítulo ${cap} ausente; nenhuma renumeração foi aplicada`,
      });
    }
    fichasOriginais.set(cap, ficha);
  }

  const fusoes: FusaoPrevalidada[] = [];
  const conteudosFusao: Record<number, string> = {};
  for (const fusao of previa.fusoes) {
    const textos = await Promise.all(
      fusao.origens.map((cap) =>
        fs.readFile(path.join(opts.deps.dirManuscrito, `capitulo-${String(cap).padStart(2, "0")}.md`), "utf8")
      )
    );
    const textoBase = fundirTextosCapitulos(textos);
    const ficha = fundirFichas(
      fusao.origens.map((cap) => fichasOriginais.get(cap)!),
      fusao.destino
    );
    const dirStaging = path.join(
      opts.dirProjeto,
      "engine-v2",
      "edicoes-candidatas",
      opts.jobId,
      `fusao-${fusao.origens.join("-")}`,
      "manuscrito"
    );
    await fs.mkdir(dirStaging, { recursive: true });
    const persistenciaIsolada = new PersistenciaEstadoIsolado(opts.persistencia, opts.estado);
    const gravadorIsolado = new Gravador({
      persistencia: persistenciaIsolada,
      projectId: opts.deps.projectId,
    });
    const resultado = await escreverCapitulo(
      {
        ...opts.deps,
        gravador: gravadorIsolado,
        persistencia: persistenciaIsolada,
        dirManuscrito: dirStaging,
      },
      fusao.destino,
      { fichaExistente: ficha, textoBase }
    );
    if (resultado.status !== "aprovado" || !resultado.reviewId || !resultado.textHash) {
      throw new ErroEngine({
        codigo: "FUSAO_NAO_APROVADA",
        classe: "qualidade",
        mensagem: `fusão ${fusao.origens.join("+")} terminou "${resultado.status}" no staging; manuscrito canônico preservado`,
        detalhe: { origens: fusao.origens, destino: fusao.destino, problemas: resultado.problemas },
      });
    }
    const caminhoCandidato = path.join(dirStaging, `capitulo-${String(fusao.destino).padStart(2, "0")}.md`);
    const conteudo = await fs.readFile(caminhoCandidato, "utf8");
    if (hashText(conteudo) !== resultado.textHash) {
      throw new ErroEngine({
        codigo: "GATE_ESTADO_INCONSISTENTE",
        classe: "tecnica",
        mensagem: `fusão ${fusao.origens.join("+")}: hash do staging diverge do review aprovado`,
      });
    }
    conteudosFusao[fusao.origemPrincipal] = conteudo;
    fusoes.push({
      origens: fusao.origens,
      destino: fusao.destino,
      conteudo,
      textHash: resultado.textHash,
      palavras: contarPalavras(conteudo),
      reviewId: resultado.reviewId,
      ficha,
    });
  }

  const fusaoPorLider = new Map(previa.fusoes.map((f) => [f.origemPrincipal, f]));
  const fichaFusaoPorDestino = new Map(fusoes.map((f) => [f.destino, f.ficha]));
  const fichasFinais = new Map<number, SceneSpec>();
  for (const [origemS, destino] of Object.entries(previa.mapa)) {
    const origem = Number(origemS);
    const fusao = fusaoPorLider.get(origem);
    fichasFinais.set(
      destino,
      fusao
        ? fichaFusaoPorDestino.get(destino)!
        : { ...structuredClone(fichasOriginais.get(origem)!), capitulo: destino }
    );
  }
  return { fichasOriginais, fichasFinais, fusoes, conteudosFusao };
}

/**
 * Contexto compartilhado dos jobs V2 que operam num projeto COM fundação
 * (escrever_livro, revisar): projeto, contrato, release, persistência, perfil,
 * briefing (camadas 3/7), fundação e edição de origem — caminho ÚNICO.
 */
async function prepararProjetoV2(job: Job, operacao: OperacaoV2 = "escrita"): Promise<{
  proj: Record<string, unknown>;
  contrato: ReturnType<typeof carregarContrato>;
  release: ReturnType<typeof exigirReleaseAtual>;
  dirProjeto: string;
  persistencia: PersistenciaV2;
  migracaoPendente: boolean;
  gravador: Gravador;
  estado: EstadoCanonico;
  deps: DepsPipeline;
  docsFactuais: { titulo: string; texto: string; fonte: string }[];
  editionId: string;
}> {
  const { sb, OWNER } = await import("../supabase.js");
  const { projDir, CLAUDE_BIN } = await import("../lib.js");
  const projectId = job.project_id!;
  const { data: proj, error } = await sb
    .from("projects")
    // `piso_palavras` e `paginas_alvo` são colunas da V1 e NÃO entram aqui: na V2
    // a faixa de palavras vem do contrato da skill (`faixa_palavras`), que é quem
    // o medidor de sinais lê. Selecioná-las dava a impressão de que decidiam algo.
    .select("id,titulo,skill_escrita,total_capitulos,meta_nota,idioma_origem,briefing")
    .eq("owner", OWNER)
    .eq("id", projectId)
    .single();
  if (error || !proj) {
    throw new ErroEngine({ codigo: "PROJETO_AUSENTE", classe: "configuracao", mensagem: `projeto ${projectId} não encontrado: ${error?.message ?? ""}` });
  }

  const skillV1 = (proj as { skill_escrita?: string }).skill_escrita ?? "";
  const skillId = MAPA_SKILL_V1_V2[skillV1] ?? skillV1;
  const contrato = carregarContrato(skillId); // skill desconhecida/contrato inválido = falha clara AQUI, antes do escritor
  // Ofício da skill (SKILL.md + references verbatim): ausente = erro de
  // configuração AQUI, antes do escritor — mesma política do contrato.
  const oficio = lerOficioSkill(contrato.contrato.id);
  const release = exigirReleaseAtual(contrato.contrato.id, projectId, await lerAutorizacaoProjeto(projectId), operacao);

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

  // Ledger de revelações: livros começados antes desta versão têm capítulos
  // aprovados e nenhum ledger. Reconstrói UMA vez, das fichas já persistidas
  // (derivação pura — o resultado é o mesmo que a aprovação teria gravado).
  if (!estado.doc.ledger_revelacoes) {
    const fichas = await persistencia.lerFichasMaisRecentes(projectId);
    const reconstruido = reconstruirLedger(fichas, (cap) => {
      const s = estado.doc.capitulos[String(cap)]?.status;
      return s === "aprovado" || s === "aprovado_com_excecao";
    });
    estado.doc.ledger_revelacoes = reconstruido;
    await persistencia.gravarEstado(estado);
    console.log(`[engine-v2] ledger de revelações reconstruído: ${reconstruido.length} entrada(s) de ${fichas.length} ficha(s)`);
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

  // Briefing do autor: decisões da entrevista + decisões avulsas = camada 3;
  // preferências = camada 7; idioma resolvido pela precedência da spec.
  const briefing = ((proj as { briefing?: BriefingAutor }).briefing ?? {}) as BriefingAutor;
  const instrucoesAutor = [...instrucoesDoBriefing(briefing), ...decisoesAvulsas(briefing)];
  const preferencias = preferenciasDoBriefing(briefing);
  const idioma = resolverIdioma(proj as { idioma_origem?: string | null; briefing?: BriefingAutor });

  // Fundação da obra (bíblia/mapa/estrutura) para as seções camada 6 do pipeline.
  const lerPrimeiro = async (...caminhos: string[]): Promise<string> => {
    for (const c of caminhos) {
      try {
        const t = await fs.readFile(c, "utf8");
        if (t.trim()) return t;
      } catch { /* tenta o próximo layout */ }
    }
    return "";
  };
  const biblia = await lerPrimeiro(
    path.join(dirProjeto, "fundacao", "biblia-da-obra.md"),
    path.join(dirProjeto, "biblia-da-obra.md")
  );
  const mapaPersonagens = await lerPrimeiro(
    path.join(dirProjeto, "fundacao", "mapa-personagens.json"),
    path.join(dirProjeto, "mapa-personagens.json")
  );
  let estruturaFundacao: { capitulo: number; fio: string; resumo_estrutural: string }[] | undefined;
  let arcoFundacao: ArcoFundacao | undefined;
  try {
    const cru = JSON.parse(await lerPrimeiro(path.join(dirProjeto, "estrutura.json")) || "null") as
      | { estrutura?: { capitulo: number; fio: string; resumo_estrutural: string }[] }
      | null;
    if (Array.isArray(cru?.estrutura)) estruturaFundacao = cru.estrutura;
    // `arco` só existe na fundação v3; ausente = v2, e os gates de arco são no-op.
    arcoFundacao = parsearArco(cru) ?? undefined;
  } catch { /* estrutura ausente/ilegível: seções ficam vazias (fundação antiga) */ }

  // Edição de ORIGEM: o livro V2 existe para a plataforma (Leitor/tradução/
  // capa/EPUB/venda) — Quebra 3 da auditoria. Sem edição não há chapters.
  const editionId = job.edition_id ?? (await garantirEdicaoOrigem(projectId, idioma));

  const deps: DepsPipeline = {
    gravador,
    persistencia,
    provedor: new ProvedorClaudeCli(CLAUDE_BIN, dirProjeto),
    mapa: mapaModelosDoAmbiente(),
    contrato,
    perfil: { texto: perfilTexto, skillId: contrato.contrato.id, hash: hashJsonCanonico(perfilTexto), validado: true },
    oficio: { skillId: oficio.skillId, texto: oficio.texto, hash: oficio.hash },
    dirManuscrito: path.join(dirProjeto, "manuscrito"),
    projectId,
    editionId,
    jobId: job.id,
    docsFactuais,
    instrucoesAutor,
    preferencias,
    idioma,
    fundacao: { biblia, mapaPersonagens, estrutura: estruturaFundacao, arco: arcoFundacao },
  };

  return { proj: proj as Record<string, unknown>, contrato, release, dirProjeto, persistencia, migracaoPendente, gravador, estado, deps, docsFactuais, editionId };
}

/** Executa escrever_livro no pipeline V2, capítulo a capítulo, retomável. */
/**
 * Capítulos por execução. `0` (default) = escreve até o fim do livro numa única
 * execução, com checkpoint durável por capítulo. Valor > 0 encadeia: a execução
 * para no checkpoint e o job volta à fila para continuar do capítulo seguinte —
 * útil quando o ambiente derruba processos longos.
 */
export function capsPorExecucao(env: Record<string, string | undefined> = process.env): number {
  const bruto = Number(env.V2_CAPS_POR_EXECUCAO ?? 0);
  return Number.isFinite(bruto) && bruto > 0 ? Math.floor(bruto) : 0;
}

/**
 * Encadear ou seguir no mesmo job? Decisão pura, no checkpoint do capítulo `n`.
 * Nunca encadeia no último capítulo (aí a execução tem de seguir para o
 * fechamento) e nunca encadeia com lote desligado (livro inteiro numa execução).
 */
export function devolverAFilaNoCheckpoint(opts: {
  lote: number;
  novosCaps: number;
  capitulo: number;
  total: number;
}): boolean {
  return opts.lote > 0 && opts.novosCaps >= opts.lote && opts.capitulo < opts.total;
}

/**
 * D5 — o livro está COMPLETO? Só quando todo capítulo de 1..N está aprovado.
 * `done` derivado de "a execução retornou sem erro" é falso positivo: com
 * `max_novos_caps=1`, um livro de 12 capítulos aparecia concluído no primeiro.
 */
export function livroCompleto(opts: {
  total: number;
  statusPorCapitulo: Record<string, { status?: string } | undefined>;
}): boolean {
  if (!opts.total || opts.total < 1) return false;
  for (let n = 1; n <= opts.total; n++) {
    const s = opts.statusPorCapitulo[String(n)]?.status;
    if (s !== "aprovado" && s !== "aprovado_com_excecao") return false;
  }
  return true;
}

/**
 * Parada por limite de lote (`max_novos_caps`). Retorna o próximo capítulo a
 * escrever, ou null quando não há motivo para parar. Nunca "encerra" o livro:
 * parar por lote e concluir o livro são coisas diferentes.
 */
export function pararPorLoteDeNovos(opts: {
  maxNovosCaps: number;
  novosCaps: number;
  proximoCapitulo: number;
  total: number;
}): { motivo: string; proximoCapitulo: number } | null {
  if (!Number.isFinite(opts.maxNovosCaps) || opts.novosCaps < opts.maxNovosCaps) return null;
  if (opts.proximoCapitulo > opts.total) return null; // nada a continuar
  return {
    motivo: `max_novos_caps=${opts.maxNovosCaps} atingido; livro incompleto (${opts.proximoCapitulo - 1}/${opts.total})`,
    proximoCapitulo: opts.proximoCapitulo,
  };
}

export async function executarEscritaV2(job: Job): Promise<ResultadoRoteado | void> {
  const { proj, contrato, release, dirProjeto, persistencia, migracaoPendente, gravador, estado, deps, docsFactuais, editionId } =
    await prepararProjetoV2(job);
  const projectId = job.project_id!;

  const resolucaoTotal = resolverTotalCapitulos({
    projeto: (proj as { total_capitulos?: number }).total_capitulos,
    canonico: estado.doc.total_capitulos,
    payload: Number((job.payload as { total?: number })?.total ?? 0),
    migrado: estado.doc.migracao?.origem === "v1",
  });
  if (!resolucaoTotal) {
    throw new ErroEngine({ codigo: "TOTAL_CAPITULOS_INDEFINIDO", classe: "configuracao", mensagem: "total de capítulos não definido no projeto nem no payload" });
  }
  const total = resolucaoTotal.total;

  await atualizarProgresso(job.id, {
    engine: "v2",
    engine_version: estado.engine_version,
    skill: contrato.contrato.id,
    skill_versao: contrato.contrato.versao,
    release_commit: release.codigo_commit,
    migracao_pendente: migracaoPendente,
    fase: "ESCRITA",
    total,
    total_origem: resolucaoTotal.origem,
    ...(resolucaoTotal.divergenciaProjeto
      ? {
          total_divergencia: resolucaoTotal.divergenciaProjeto,
          aviso: `total da tabela projects (${resolucaoTotal.divergenciaProjeto.projeto}) difere do canônico migrado (${resolucaoTotal.divergenciaProjeto.canonico}); escrita limitada ao canônico`,
        }
      : {}),
  });

  // PREMISSAS (fatia L): a base sob a qual os artefatos foram construídos. Se
  // mudou — canário, briefing, idioma, skill, contrato, total, documentos — o
  // que dependia dela está INVALIDADO e a execução para até o autor decidir.
  const premissasAgora = {
    canario_hash: estado.doc.canario_snapshot?.hash ?? "",
    briefing_hash: hashJsonCanonico((proj as { briefing?: unknown }).briefing ?? {}),
    idioma: deps.idioma ?? "pt-BR",
    skill_id: contrato.contrato.id,
    skill_hash: contrato.hash,
    contrato_hash: contrato.contrato.versao,
    total_capitulos: total,
    docs: estado.doc.fundacao?.docs ?? {},
  };
  const invalidacao = invalidarPorPremissa(
    estado.doc.premissas ? compararPremissas(estado.doc.premissas, premissasAgora) : []
  );
  const escolhaAutor = (job.payload as { premissa_alterada?: "reconstruir" | "migrar" })?.premissa_alterada;
  const decisaoPremissa = decidirComPremissaAlterada(invalidacao, escolhaAutor);
  if (decisaoPremissa.acao === "bloquear") {
    await gravador.registrarInvalidacao({
      artefatos: decisaoPremissa.invalidacao.artefatos,
      mudancas: decisaoPremissa.invalidacao.mudancas,
      motivo: decisaoPremissa.invalidacao.motivo,
      em: new Date().toISOString(),
    });
    await atualizarProgresso(job.id, {
      quality_status: "aguardando_decisao",
      invalidacao: decisaoPremissa.invalidacao.artefatos,
      resumo: decisaoPremissa.invalidacao.motivo,
    });
    throw new ErroEngine({
      codigo: "PREMISSA_ALTERADA",
      classe: "configuracao",
      mensagem: decisaoPremissa.invalidacao.motivo,
      detalhe: { mudancas: decisaoPremissa.invalidacao.mudancas },
    });
  }
  await gravador.registrarPremissas(premissasAgora);

  // Retomada: capítulos já aprovados em execuções anteriores ficam duráveis
  // ANTES de escrever o próximo (idempotente; hash-bound).
  await sincronizarCapitulosAprovados({ projectId, editionId, dirManuscrito: deps.dirManuscrito, estado });

  // Escrita incremental controlada (ex.: prova de 1 capítulo num livro migrado):
  // payload.max_novos_caps limita quantos capítulos NOVOS esta execução escreve.
  // O limite de LOTE (V2_CAPS_POR_EXECUCAO) é outra coisa: não encerra o livro,
  // encadeia — ao atingi-lo a execução para no checkpoint e o job volta à fila.
  const maxNovosCaps = Number((job.payload as { max_novos_caps?: number })?.max_novos_caps ?? 0) || Infinity;
  const lote = capsPorExecucao();
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
    // D5 — `max_novos_caps` LIMITA O LOTE, não encerra o livro. Antes, atingir o
    // limite fazia `return` limpo e o worker marcava o job como `done`: um livro
    // de 12 capítulos com max_novos_caps=1 aparecia CONCLUÍDO no capítulo 1.
    // Agora devolve o job à fila, com o próximo capítulo declarado.
    const paradaLote = pararPorLoteDeNovos({ maxNovosCaps, novosCaps, proximoCapitulo: n, total });
    if (paradaLote) {
      const progresso = {
        fase: "ESCRITA",
        etapa: `lote de ${maxNovosCaps} capítulo(s) novo(s) concluído — execução encadeada continua no capítulo ${n}`,
        cap_atual: n - 1,
        proximo_capitulo: n,
        ...(legadosPulados.length ? { aviso_legado: `capítulos legado preservados (não reescritos): ${legadosPulados.join(", ")}` } : {}),
      };
      await atualizarProgresso(job.id, progresso);
      return { continuar: { ...paradaLote, progresso } };
    }

    // Gates de repetição recebem TODOS os capítulos anteriores completos. O
    // pacote do modelo continua pequeno: só a cauda de N-1 entra como contexto
    // de continuidade. Garantia determinística não pode degradar com a janela.
    const anteriores: { numero: number; trecho: string }[] = [];
    const trechos: { titulo: string; texto: string; fonte: string }[] = [];
    for (let anterior = 1; anterior < n; anterior++) {
      const prev = path.join(deps.dirManuscrito, `capitulo-${String(anterior).padStart(2, "0")}.md`);
      try {
        const t = await fs.readFile(prev, "utf8");
        anteriores.push({ numero: anterior, trecho: t });
        if (anterior === n - 1) {
          trechos.push({
            titulo: `FINAL DO CAPÍTULO ${anterior} (continuidade imediata)`,
            texto: t.split(/\n{2,}/).slice(-3).join("\n\n"),
            fonte: `capitulo-${anterior}`,
          });
        }
      } catch {
        /* arquivo ausente: estado/hash-bound e contextualizador continuam fail-closed */
      }
    }

    await atualizarProgresso(job.id, { cap_atual: n, etapa: `capitulo ${n}/${total}` });
    const r = await escreverCapituloComEscada({
      deps,
      gravador,
      capitulo: n,
      opts: { anteriores, trechosAnteriores: trechos },
      onProgresso: (p) => atualizarProgresso(job.id, p),
    });
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

    // CHECKPOINT: capítulo aprovado vira durável AGORA (chapters + Storage). A
    // reprovação do N+1 nunca oculta o N aprovado (mesma lição do contrato de
    // progresso V1), e a retomada — por queda, cota ou encadeamento — parte daqui.
    await sincronizarCapitulosAprovados({
      projectId,
      editionId,
      dirManuscrito: deps.dirManuscrito,
      estado: await gravador.carregarEstado(),
    });
    await atualizarProgresso(job.id, {
      checkpoint: { capitulo: n, total, em: new Date().toISOString() },
      cap_concluido: n,
    });

    // Encadeamento: lote cheio e livro incompleto → para no checkpoint e devolve
    // o job à fila. Nunca "concluído": o trabalho continua na próxima execução.
    if (devolverAFilaNoCheckpoint({ lote, novosCaps, capitulo: n, total })) {
      const progresso = {
        fase: "ESCRITA",
        etapa: `checkpoint no capítulo ${n}/${total} — execução encadeada continua no ${n + 1}`,
        cap_atual: n,
        proximo_capitulo: n + 1,
      };
      await atualizarProgresso(job.id, progresso);
      return {
        continuar: {
          motivo: `lote de ${lote} capítulo(s) concluído no checkpoint do capítulo ${n}`,
          proximoCapitulo: n + 1,
          progresso,
        },
      };
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

  // ---------------------------------------------------------------------------
  // GATE DE FECHAMENTO — promessa plantada e nunca paga.
  // Roda UMA vez, com o livro inteiro escrito, e é gate do LIVRO: o capítulo que
  // apenas planta uma promessa válida (a pagar lá na frente) nunca é reprovado
  // por ele durante a escrita. Fundação v2 (sem `arco`) = no-op com aviso.
  // ---------------------------------------------------------------------------
  const fechamento = await avaliarFechamentoLivro({
    projectId,
    total,
    arco: deps.fundacao?.arco,
    estado: await gravador.carregarEstado(),
    persistencia,
  });
  if (!fechamento.passou) {
    const falho = fechamento.gates.find((g) => !g.passou)!;
    await atualizarProgresso(job.id, {
      quality_status: "bloqueado",
      quality_gate: falho.gate,
      quality_blockers: [`${falho.gate}: ${falho.evidencia ?? "sem evidência"}`],
    });
    await gravador.registrarBloqueio(`GATE_${falho.gate}`, "livro", falho.evidencia ?? "");
    throw new ErroEngine({
      codigo: "LIVRO_FECHAMENTO_BLOQUEADO",
      classe: "qualidade",
      mensagem: `fechamento bloqueado por ${falho.gate}: ${falho.evidencia}`,
    });
  }
  if (fechamento.naoAplicavel) {
    await atualizarProgresso(job.id, { aviso_arco: fechamento.naoAplicavel });
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
      metaProjeto: (proj as { meta_nota?: number | null }).meta_nota,
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
  const haOperacaoReal = plano.propostas.some((p) => p.tipo !== "nenhuma");
  let relatorioEd = aplicarEdicaoEstrutural({
    dirManuscrito: deps.dirManuscrito,
    propostas: [{ tipo: "nenhuma", capitulos: [], justificativa: "prévia sem mutação" }],
    total,
  });

  if (!haOperacaoReal) {
    // Ainda registra que o editor rodou; retomadas não pedem um novo julgamento.
    await gravador.aplicarMapaCapitulos({}, {
      edicao: {
        run_id: runIdEd,
        propostas: plano.propostas.length,
        aplicadas: 0,
        detalhe: [],
      },
    });
  } else {
    // Fusão é validada em staging com ledger real e estado isolado. Corte e
    // reordenação também exigem fichas canônicas para não trocar spec após renumerar.
    const preparacao = await prepararEdicaoEstrutural({
      plano,
      total,
      deps,
      persistencia,
      estado: estadoPosEscrita,
      dirProjeto,
      jobId: job.id,
    });
    relatorioEd = aplicarEdicaoEstrutural({
      dirManuscrito: deps.dirManuscrito,
      propostas: plano.propostas,
      total,
      conteudosFusao: preparacao.conteudosFusao,
    });

    const specsPersistidas: { destino: number; versao: number; hash: string }[] = [];
    try {
      for (const [destino, ficha] of [...preparacao.fichasFinais.entries()].sort((a, b) => a[0] - b[0])) {
        const versao = (await persistencia.maiorVersaoSpec(projectId, destino)) + 1;
        const hash = hashJsonCanonico(ficha);
        await persistencia.inserirSpec({
          project_id: projectId,
          edition_id: job.edition_id ?? null,
          capitulo: destino,
          versao,
          hash,
          status: "validada",
          ficha,
          origem_run_id: runIdEd,
        });
        specsPersistidas.push({ destino, versao, hash });
      }
      const specsPorDestino = new Map(specsPersistidas.map((s) => [s.destino, s]));
      await gravador.aplicarMapaCapitulos(relatorioEd.mapa, {
        edicao: {
          run_id: runIdEd,
          propostas: plano.propostas.length,
          aplicadas: relatorioEd.aplicadas.length,
          detalhe: relatorioEd.aplicadas,
        },
        specs: specsPersistidas,
        fusoes: preparacao.fusoes.map((f) => {
          const spec = specsPorDestino.get(f.destino)!;
          return {
            origens: f.origens,
            destino: f.destino,
            text_hash: f.textHash,
            palavras: f.palavras,
            review_id: f.reviewId,
            spec_versao: spec.versao,
            spec_hash: spec.hash,
          };
        }),
      });
    } catch (erro) {
      // Compensação: restaura arquivos e reinsere as fichas originais em versão
      // superior, neutralizando qualquer spec parcial já persistida.
      if (relatorioEd.assinatura && relatorioEd.arquivoOriginais) {
        reverterEdicaoEstrutural({
          dirManuscrito: deps.dirManuscrito,
          assinatura: relatorioEd.assinatura,
          arquivoOriginais: relatorioEd.arquivoOriginais,
          totalOriginal: total,
          totalFinal: relatorioEd.totalFinal,
        });
      }
      for (const [capitulo, ficha] of preparacao.fichasOriginais) {
        const versao = (await persistencia.maiorVersaoSpec(projectId, capitulo)) + 1;
        await persistencia.inserirSpec({
          project_id: projectId,
          edition_id: job.edition_id ?? null,
          capitulo,
          versao,
          hash: hashJsonCanonico(ficha),
          status: "validada",
          ficha,
          origem_run_id: runIdEd,
        });
      }
      throw new ErroEngine({
        codigo: "EDICAO_ESTRUTURAL_REVERTIDA",
        classe: "tecnica",
        mensagem: `edição estrutural falhou na promoção e os arquivos/fichas originais foram restaurados: ${erro instanceof Error ? erro.message : String(erro)}`,
      });
    }
  }
  await atualizarProgresso(job.id, {
    fase: "EDICAO_ESTRUTURAL",
    propostas: plano.propostas.length,
    aplicadas: relatorioEd.aplicadas.length,
    total_final: relatorioEd.totalFinal,
    fusoes: relatorioEd.fusoes,
  });
  // Renumeração/fusão aplicada: a plataforma reflete o manuscrito vigente
  // (ressincroniza hashes novos e remove capítulos além do total final).
  await sincronizarCapitulosAprovados({
    projectId,
    editionId,
    dirManuscrito: deps.dirManuscrito,
    estado: await gravador.carregarEstado(),
    totalFinal: relatorioEd.totalFinal,
  });

  // ---------------------------------------------------------------------------
  // PARTE B — Meta-nota (bestseller): consolida, avalia e reescreve até a meta.
  // ---------------------------------------------------------------------------
  await executarMeta9Integrada(job, {
    gravador, persistencia, deps, contrato, dirProjeto, projectId, docsFactuais,
    metaProjeto: (proj as { meta_nota?: number | null }).meta_nota,
  });
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
    metaProjeto?: number | null;
    /** 1 = avaliar e sair (diagnóstico da rota `avaliar`), sem reescrita. */
    maxIteracoes?: number;
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
    instrucoesAutor: ctx.deps.instrucoesAutor,
    preferencias: ctx.deps.preferencias,
    idioma: ctx.deps.idioma,
    fundacao: ctx.deps.fundacao,
    // Meta do projeto (coluna meta_nota) é a fonte; payload permanece como override explícito.
    meta: (job.payload as { meta_nota?: number })?.meta_nota ?? (ctx.metaProjeto ?? 9),
    maxIteracoes: ctx.maxIteracoes ?? (job.payload as { max_iteracoes?: number })?.max_iteracoes ?? 3,
    reportarEtapa: async (etapa, dados) => {
      if (etapa === "CONSOLIDACAO") await atualizarProgresso(job.id, { fase: "CONSOLIDACAO" });
      else if (etapa === "AVALIACAO") await atualizarProgresso(job.id, { fase: "AVALIACAO", ...(dados ?? {}) });
      else if (etapa === "CONCLUIDO") await atualizarProgresso(job.id, { fase: "CONCLUIDO", ...(dados ?? {}) });
    },
  });
  // A meta-nota pode ter reescrito capítulos: os hashes finais aprovados viram
  // a versão durável, e a edição de origem entra em revisão quando conclui.
  if (ctx.deps.editionId) {
    const estadoFinal = await ctx.gravador.carregarEstado();
    await sincronizarCapitulosAprovados({
      projectId: ctx.projectId,
      editionId: ctx.deps.editionId,
      dirManuscrito: ctx.deps.dirManuscrito,
      estado: estadoFinal,
    });
    if (estadoFinal.doc.fase === "concluido") await marcarEdicaoEmRevisao(ctx.deps.editionId);
  }
}

/**
 * `avaliar` no V2 — o botão "Avaliar" caía no caminho V1 e não funcionava em
 * livro V2. Aqui ele é DIAGNÓSTICO: consolida, avalia pelas dimensões da
 * meta-nota e grava o relatório. NUNCA reescreve (maxIteracoes = 1: avalia e sai
 * antes de qualquer rodada de reescrita) — quem reescreve é `escrever_livro`.
 */
export async function executarAvaliarV2(job: Job): Promise<void> {
  const ctx = await prepararProjetoV2(job, "avaliacao");
  const estado = await ctx.gravador.carregarEstado();
  const total = estado.doc.total_capitulos ?? 0;
  const aprovados = Object.values(estado.doc.capitulos).filter(
    (c) => c.status === "aprovado" || c.status === "aprovado_com_excecao"
  ).length;
  // Avaliar um livro pela metade daria uma nota sobre um manuscrito incompleto —
  // e a meta-nota muda a FASE do livro, o que num livro em escrita seria regressão.
  if (!total || aprovados < total) {
    throw new ErroEngine({
      codigo: "AVALIACAO_LIVRO_INCOMPLETO",
      classe: "configuracao",
      mensagem: `avaliação exige o livro inteiro aprovado: ${aprovados} de ${total || "?"} capítulo(s)`,
    });
  }
  await atualizarProgresso(job.id, { engine: "v2", fase: "AVALIACAO", etapa: "diagnóstico (sem reescrita)" });
  await executarMeta9Integrada(job, {
    gravador: ctx.gravador,
    persistencia: ctx.persistencia,
    deps: ctx.deps,
    contrato: ctx.contrato,
    dirProjeto: ctx.dirProjeto,
    projectId: job.project_id!,
    docsFactuais: ctx.docsFactuais,
    metaProjeto: (ctx.proj as { meta_nota?: number | null }).meta_nota,
    maxIteracoes: 1,
  });
}

/**
 * criar_fundacao no pipeline V2 (roteado por engine_mode, como escrever_livro):
 * arquiteto_enredo gera a fundação mínima (fundacao.ts, caminho único com o
 * canário); o módulo materializa disco + estado + fases. Idempotente: fundação
 * já materializada (perfil no disco + estado.fundacao) não re-roda o modelo.
 */
export async function executarFundacaoV2Job(job: Job): Promise<void> {
  const { sb, OWNER } = await import("../supabase.js");
  const { projDir, CLAUDE_BIN } = await import("../lib.js");
  const projectId = job.project_id!;
  const { data, error } = await sb
    .from("projects")
    .select("id,titulo,skill_escrita,total_capitulos,idioma_origem,briefing,briefing_aprovado")
    .eq("owner", OWNER)
    .eq("id", projectId)
    .single();
  if (error || !data) {
    throw new ErroEngine({ codigo: "PROJETO_AUSENTE", classe: "configuracao", mensagem: `projeto ${projectId} não encontrado: ${error?.message ?? ""}` });
  }
  const proj = lerProjetoFundacao(data);
  const skillV1 = proj.skill_escrita ?? "";
  const contrato = carregarContrato(MAPA_SKILL_V1_V2[skillV1] ?? skillV1);
  const release = exigirReleaseAtual(contrato.contrato.id, projectId, await lerAutorizacaoProjeto(projectId), "fundacao");
  const dirProjeto = projDir(projectId);
  await fs.mkdir(dirProjeto, { recursive: true }); // cwd do CLI precisa existir antes do provedor
  const { persistencia } = await criarPersistencia({ dirProjeto });
  const gravador = new Gravador({ persistencia, projectId });

  const totalCaps = proj.total_capitulos ?? 0;
  if (!totalCaps || totalCaps < 1) {
    throw new ErroEngine({ codigo: "TOTAL_CAPITULOS_INDEFINIDO", classe: "configuracao", mensagem: "criar_fundacao V2 exige total_capitulos definido no projeto (wizard)" });
  }

  // Idempotência: fundação já materializada não re-roda o arquiteto.
  const estado = await gravador.carregarEstado();
  let perfilExistente = "";
  try {
    perfilExistente = await fs.readFile(path.join(dirProjeto, "perfil-de-voz.md"), "utf8");
  } catch { /* primeira execução */ }
  if (estado.doc.fundacao && perfilExistente.trim()) {
    await atualizarProgresso(job.id, { engine: "v2", fase: "FUNDACAO", etapa: "fundação já materializada (idempotente)" });
    return;
  }

  // Briefing COMPLETO da entrevista chega ao arquiteto (não só a ideia central).
  // Fatia E — o briefing precisa estar COMPLETO, sem conflito e APROVADO pelo
  // autor. Antes, a fundação era gerada do que estivesse gravado, inclusive
  // contraditório, e nada registrava que o autor tinha visto aquilo.
  const briefingBruto = proj.briefing;
  const autorizacaoBriefing = autorizarFundacao(
    briefingBruto,
    proj.briefing_aprovado,
    {
      idioma_origem: proj.idioma_origem,
      total_capitulos: proj.total_capitulos,
      skill_escrita: proj.skill_escrita,
    }
  );
  if (!autorizacaoBriefing.permitido) {
    throw new ErroEngine({
      codigo: "BRIEFING_NAO_APROVADO",
      classe: "configuracao",
      mensagem: `fundação bloqueada — ${autorizacaoBriefing.motivo}: ${autorizacaoBriefing.detalhe}`,
      detalhe: { motivo: autorizacaoBriefing.motivo },
    });
  }
  const briefingFundacao = briefingParaFundacao(proj);
  if (!briefingFundacao.premissa) {
    throw new ErroEngine({ codigo: "BRIEFING_AUSENTE", classe: "configuracao", mensagem: "criar_fundacao V2 exige briefing.ideia_central" });
  }

  const depsF = {
    gravador,
    persistencia,
    provedor: new ProvedorClaudeCli(CLAUDE_BIN, dirProjeto),
    mapa: mapaModelosDoAmbiente(),
    contrato,
    dirProjeto,
    jobId: job.id,
    // D7: sem estes, os documentos ficam só no disco do worker e a interface
    // não abre nenhum deles.
    ownerId: OWNER,
    projectId,
  };
  await atualizarProgresso(job.id, {
    engine: "v2",
    fase: "FUNDACAO",
    skill: contrato.contrato.id,
    skill_versao: contrato.contrato.versao,
    release_commit: release.codigo_commit,
  });
  const { fundacao, runId, portao } = await gerarFundacaoV2(depsF, { ...briefingFundacao, totalCapitulos: totalCaps });
  await materializarFundacao(depsF, fundacao, totalCaps, portao);
  await atualizarProgresso(job.id, {
    fase: "FUNDACAO",
    etapa: "fundação materializada",
    fios: fundacao.fios,
    fundacao_run: runId,
    fundacao_schema: fundacao.arco ? "v3" : "v2",
    // D7 — índice dos documentos materializados: é o que a tela do projeto usa
    // para saber o que existe e o que abrir (antes ela adivinhava nomes da V1).
    documentos: documentosDaFundacao(fundacao).map((d) => ({ titulo: d.titulo, caminho: d.caminho, origem: d.origem })),
    portao_retries: portao.retries,
    ...(portao.reprovacoes.length ? { portao_reprovacoes: portao.reprovacoes } : {}),
    ...(portao.avisos.length ? { portao_avisos: portao.avisos } : {}),
  });
}

/** Edição de tradução (existe e não é origem)? Traduções seguem o pipeline V1. */
async function edicaoEhTraducao(editionId?: string | null): Promise<boolean> {
  if (!editionId) return false;
  const { sb, OWNER } = await import("../supabase.js");
  const { data } = await sb.from("editions").select("is_origem").eq("owner", OWNER).eq("id", editionId).maybeSingle();
  return data != null && (data as { is_origem?: boolean }).is_origem === false;
}

/**
 * Registra uma decisão do autor no briefing (camada 3 do compilador) — usada
 * pelos jobs revisar/refinar_fundacao para que a instrução sobreviva ao job e
 * alcance TODO pacote futuro do projeto.
 */
export async function registrarDecisaoAutor(projectId: string, texto: string, origem: string): Promise<void> {
  const { sb, OWNER } = await import("../supabase.js");
  const { data, error } = await sb.from("projects").select("briefing").eq("owner", OWNER).eq("id", projectId).single();
  if (error) throw new ErroEngine({ codigo: "PROJETO_AUSENTE", classe: "configuracao", mensagem: `registrarDecisaoAutor: ${error.message}` });
  const briefing = ((data as { briefing?: Record<string, unknown> } | null)?.briefing ?? {}) as Record<string, unknown>;
  const decisoes = Array.isArray(briefing.decisoes_autor) ? briefing.decisoes_autor : [];
  const nova = { texto: texto.trim(), em: new Date().toISOString(), origem };
  const { error: erroUpdate } = await sb
    .from("projects")
    .update({ briefing: { ...briefing, decisoes_autor: [...decisoes, nova] } })
    .eq("owner", OWNER)
    .eq("id", projectId);
  if (erroUpdate) throw new ErroEngine({ codigo: "DECISAO_NAO_REGISTRADA", classe: "infra", mensagem: erroUpdate.message });
}

/**
 * refinar_fundacao no pipeline V2: a instrução do autor vira decisão camada 3
 * persistida E a fundação é regenerada com o briefing completo + instrução
 * (sempre re-roda: refino é pedido explícito, não idempotência).
 */
export async function executarRefinarFundacaoV2(job: Job): Promise<void> {
  const { sb, OWNER } = await import("../supabase.js");
  const { projDir, CLAUDE_BIN } = await import("../lib.js");
  const projectId = job.project_id!;
  const instrucoes = String((job.payload as { instrucoes?: string })?.instrucoes ?? "").trim();
  if (!instrucoes) {
    throw new ErroEngine({ codigo: "INSTRUCOES_AUSENTES", classe: "configuracao", mensagem: "refinar_fundacao V2 exige payload.instrucoes" });
  }
  await registrarDecisaoAutor(projectId, instrucoes, "refinar_fundacao");

  const { data, error } = await sb
    .from("projects")
    .select("id,titulo,skill_escrita,total_capitulos,idioma_origem,briefing,briefing_aprovado")
    .eq("owner", OWNER)
    .eq("id", projectId)
    .single();
  if (error || !data) {
    throw new ErroEngine({ codigo: "PROJETO_AUSENTE", classe: "configuracao", mensagem: `projeto ${projectId} não encontrado: ${error?.message ?? ""}` });
  }
  const proj = lerProjetoFundacao(data);
  const skillV1 = proj.skill_escrita ?? "";
  const contrato = carregarContrato(MAPA_SKILL_V1_V2[skillV1] ?? skillV1);
  const release = exigirReleaseAtual(contrato.contrato.id, projectId, await lerAutorizacaoProjeto(projectId), "fundacao");
  const totalCaps = proj.total_capitulos ?? 0;
  if (!totalCaps || totalCaps < 1) {
    throw new ErroEngine({ codigo: "TOTAL_CAPITULOS_INDEFINIDO", classe: "configuracao", mensagem: "refinar_fundacao V2 exige total_capitulos definido no projeto" });
  }
  const dirProjeto = projDir(projectId);
  await fs.mkdir(dirProjeto, { recursive: true }); // cwd do CLI precisa existir antes do provedor
  const { persistencia } = await criarPersistencia({ dirProjeto });
  const gravador = new Gravador({ persistencia, projectId });
  // Fatia E — o briefing precisa estar COMPLETO, sem conflito e APROVADO pelo
  // autor. Antes, a fundação era gerada do que estivesse gravado, inclusive
  // contraditório, e nada registrava que o autor tinha visto aquilo.
  const briefingBruto = proj.briefing;
  const autorizacaoBriefing = autorizarFundacao(
    briefingBruto,
    proj.briefing_aprovado,
    {
      idioma_origem: proj.idioma_origem,
      total_capitulos: proj.total_capitulos,
      skill_escrita: proj.skill_escrita,
    }
  );
  if (!autorizacaoBriefing.permitido) {
    throw new ErroEngine({
      codigo: "BRIEFING_NAO_APROVADO",
      classe: "configuracao",
      mensagem: `fundação bloqueada — ${autorizacaoBriefing.motivo}: ${autorizacaoBriefing.detalhe}`,
      detalhe: { motivo: autorizacaoBriefing.motivo },
    });
  }
  const briefingFundacao = briefingParaFundacao(proj);
  const detalhes = [briefingFundacao.detalhes, `- Instruções de refino do autor: ${instrucoes}`].filter(Boolean).join("\n");

  const depsF = {
    gravador,
    persistencia,
    provedor: new ProvedorClaudeCli(CLAUDE_BIN, dirProjeto),
    mapa: mapaModelosDoAmbiente(),
    contrato,
    dirProjeto,
    jobId: job.id,
    // D7: sem estes, os documentos ficam só no disco do worker e a interface
    // não abre nenhum deles.
    ownerId: OWNER,
    projectId,
  };
  await atualizarProgresso(job.id, {
    engine: "v2",
    fase: "REFINAR_FUNDACAO",
    skill: contrato.contrato.id,
    release_commit: release.codigo_commit,
  });
  const { fundacao, runId, portao } = await gerarFundacaoV2(depsF, { ...briefingFundacao, detalhes, totalCapitulos: totalCaps });
  await materializarFundacao(depsF, fundacao, totalCaps, portao);
  await atualizarProgresso(job.id, {
    fase: "REFINAR_FUNDACAO",
    etapa: "fundação refinada e materializada",
    fundacao_run: runId,
    fundacao_schema: fundacao.arco ? "v3" : "v2",
    // D7 — índice dos documentos materializados: é o que a tela do projeto usa
    // para saber o que existe e o que abrir (antes ela adivinhava nomes da V1).
    documentos: documentosDaFundacao(fundacao).map((d) => ({ titulo: d.titulo, caminho: d.caminho, origem: d.origem })),
    portao_retries: portao.retries,
  });
}

/**
 * revisar no pipeline V2 (edição de origem): a instrução do autor vira decisão
 * camada 3 persistida e a meta-nota re-roda sobre o manuscrito aprovado —
 * avaliação, reescrita dirigida e ressincronização de chapters, caminho único.
 */
export async function executarRevisarV2(job: Job): Promise<void> {
  const projectId = job.project_id!;
  const instrucoes = String((job.payload as { instrucoes?: string })?.instrucoes ?? "").trim();
  if (instrucoes) await registrarDecisaoAutor(projectId, instrucoes, "revisar");

  const { proj, contrato, release, dirProjeto, persistencia, gravador, estado, deps, docsFactuais } =
    await prepararProjetoV2(job);
  if (instrucoes) {
    // O registro acima é lido nas PRÓXIMAS execuções; nesta, injeta em memória.
    deps.instrucoesAutor = [
      ...(deps.instrucoesAutor ?? []),
      { texto: instrucoes, camada: "decisao_autor" as const, fonte: "autor:revisar" },
    ];
  }
  const fase = estado.doc.fase;
  if (!["revisao_final", "consolidacao", "avaliacao", "concluido"].includes(fase)) {
    throw new ErroEngine({
      codigo: "REVISAO_SEM_LIVRO",
      classe: "configuracao",
      mensagem: `revisar V2 exige livro com capítulos aprovados (fase atual: ${fase}) — conclua a escrita antes`,
    });
  }
  await atualizarProgresso(job.id, {
    engine: "v2",
    fase: "REVISAO",
    skill: contrato.contrato.id,
    release_commit: release.codigo_commit,
  });
  await executarMeta9Integrada(job, {
    gravador, persistencia, deps, contrato, dirProjeto, projectId, docsFactuais,
    metaProjeto: (proj as { meta_nota?: number | null }).meta_nota,
  });
}

/**
 * Canário de voz (wizard, F4): UMA cena curta de amostra na skill escolhida, antes
 * da fundação. O texto vai para jobs.progresso.canario_voz (a UI lê de lá) e uma
 * cópia de auditoria fica em <dirProjeto>/canario-voz.md. Nenhum capítulo é criado.
 */
export async function revisarCanarioVoz(opts: {
  gravador: Gravador;
  provedor: ProvedorModelo;
  mapa: MapaModelos;
  jobId?: string | null;
  contrato: ContratoCompilado;
  perfil: { texto: string; skillId: string; hash: string; validado: boolean };
  texto: string;
}): Promise<{
  parecer: Parecer;
  runId: string;
  problemasProtocolo: string[];
}> {
  // A amostra é deliberadamente curta; "palavras" pertence à faixa de um
  // capítulo completo e seria um falso bloqueio inevitável no wizard.
  const sinais = medirSinais(opts.texto, opts.contrato.contrato).filter((s) => s.sinal !== "palavras");
  const pacote = compilarPacote({
    papel: "revisor_literario",
    alvo: "canario-voz",
    contrato: opts.contrato,
    perfil: opts.perfil,
    fatos: [{ titulo: "TEXTO A AVALIAR", texto: opts.texto, fonte: "canario-voz" }],
  });
  if (!pacote.ok) {
    throw new ErroEngine({
      codigo: "CANARIO_REVISAO_BLOQUEADA",
      classe: "configuracao",
      mensagem: `revisão do canário bloqueada: ${pacote.bloqueios.map((b) => `${b.codigo}: ${b.detalhe}`).join(" · ")}`,
    });
  }
  const revisao = await executarPapel<Parecer>({
    gravador: opts.gravador,
    provedor: opts.provedor,
    mapa: opts.mapa,
    jobId: opts.jobId ?? null,
    papel: "revisor_literario",
    alvo: "canario-voz",
    pacote: pacote.pacote!,
    tarefa: tarefaRevisorCanario(resumoSinais(sinais), opts.contrato.contrato),
    parse: (t) => exigirDisposicaoCompleta(validarParecer(extrairJson(t)), sinais),
  });
  const conferencia = conferirParecer(revisao.valor, sinais);
  return {
    parecer: { ...revisao.valor, verdict: conferencia.verdictEfetivo },
    runId: revisao.runId,
    problemasProtocolo: conferencia.problemas,
  };
}

export async function executarCanarioVoz(job: Job): Promise<void> {
  const { sb, OWNER } = await import("../supabase.js");
  const { projDir, CLAUDE_BIN } = await import("../lib.js");
  const projectId = job.project_id;
  if (!projectId) {
    throw new ErroEngine({ codigo: "PROJETO_AUSENTE", classe: "configuracao", mensagem: "canario_voz sem project_id" });
  }
  const { data: proj, error } = await sb
    .from("projects")
    .select("id,titulo,skill_escrita,idioma_origem,briefing")
    .eq("owner", OWNER)
    .eq("id", projectId)
    .single();
  if (error || !proj) {
    throw new ErroEngine({ codigo: "PROJETO_AUSENTE", classe: "configuracao", mensagem: `projeto ${projectId} não encontrado: ${error?.message ?? ""}` });
  }

  const payloadCanario = job.payload as { skill_escrita?: string; ajuste_autor?: string };
  const idiomaCanario = resolverIdioma(proj as { idioma_origem?: string | null; briefing?: BriefingAutor });
  const skillV1 = payloadCanario?.skill_escrita
    ?? (proj as { skill_escrita?: string }).skill_escrita
    ?? "";
  const skillId = MAPA_SKILL_V1_V2[skillV1] ?? skillV1;
  const contrato = carregarContrato(skillId);

  const briefing = ((proj as { briefing?: Record<string, unknown> }).briefing ?? {}) as { ideia_central?: string };
  const ideia = (briefing.ideia_central ?? "").trim() || `um livro na família ${contrato.contrato.familia_editorial}`;

  const dirProjeto = projDir(projectId);
  // Projeto recém-criado ainda não tem pasta: o CLI spawna com cwd=dirProjeto
  // e um cwd inexistente vira ENOENT (falso "infra") — cria ANTES do provedor.
  await fs.mkdir(dirProjeto, { recursive: true });
  const { persistencia } = await criarPersistencia({ dirProjeto });
  const gravador = new Gravador({ persistencia, projectId });
  const provedor = new ProvedorClaudeCli(CLAUDE_BIN, dirProjeto);
  const mapa = mapaModelosDoAmbiente();

  // Perfil sintético: ainda não há fundação — o canário demonstra a VOZ do contrato.
  const perfilCanario = {
    texto: `Amostra de voz pré-fundação. Ideia central do autor: ${ideia}`,
    skillId: contrato.contrato.id,
    hash: hashJsonCanonico(ideia),
    validado: true,
  };
  const comp = compilarPacote({
    papel: "escritor",
    alvo: "canario-voz",
    contrato,
    perfil: perfilCanario,
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
    provedor,
    mapa,
    jobId: job.id,
    papel: "escritor",
    alvo: "canario-voz",
    pacote: comp.pacote!,
    tarefa: tarefaCanarioVoz(ideia, contrato.contrato, payloadCanario.ajuste_autor, idiomaCanario),
    parse: (t) => {
      const limpo = t.trim();
      if (!limpo) throw new Error("cena vazia");
      return limpo;
    },
  });

  const revisao = await revisarCanarioVoz({
    gravador,
    provedor,
    mapa,
    jobId: job.id,
    contrato,
    perfil: perfilCanario,
    texto: r.valor,
  });
  const parecer = revisao.parecer;
  const textHash = hashText(r.valor);

  // Cópia de auditoria no disco (worker escreve; modelo nunca toca disco).
  await fs.mkdir(dirProjeto, { recursive: true });
  await fs.writeFile(path.join(dirProjeto, "canario-voz.md"), r.valor, "utf8");
  await fs.writeFile(
    path.join(dirProjeto, "canario-voz.avaliacao.json"),
    JSON.stringify({
      schema: "canario-voz/v1",
      skill_id: contrato.contrato.id,
      contrato_versao: contrato.contrato.versao,
      text_hash: textHash,
      escritor_run_id: r.runId,
      revisor_run_id: revisao.runId,
      parecer,
      problemas_protocolo: revisao.problemasProtocolo,
    }, null, 2),
    "utf8"
  );

  await atualizarProgresso(job.id, {
    fase: "CANARIO_VOZ",
    canario_voz: {
      texto: r.valor,
      skill_id: contrato.contrato.id,
      contrato_versao: contrato.contrato.versao,
      hash: textHash,
      escritor_run_id: r.runId,
      revisor_run_id: revisao.runId,
      verdict: parecer.verdict,
      parecer,
      problemas_protocolo: revisao.problemasProtocolo,
      ajuste_autor: payloadCanario.ajuste_autor?.trim() || null,
    },
  });
}

/** Extrai JSON da resposta do modelo (aceita cerca ```json ... ```). Lança se inválido. */
function extrairJson(texto: string): unknown {
  const m = texto.match(/```(?:json)?\s*([\s\S]*?)```/);
  return JSON.parse((m ? m[1] : texto).trim());
}
