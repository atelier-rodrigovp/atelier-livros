// Engine V2 — migração V1 → V2.
// Lê o layout V1 do projeto no WORK_DIR (SOMENTE leitura — nunca modifica/apaga
// arquivos V1) e materializa o estado canônico V2. Grava apenas:
//   1. estado canônico via persistência (lock otimista, sem gravação se idêntico);
//   2. relatório em <dirProjeto>/engine-v2/migracao-relatorio.json (escrita atômica).
// Aprovação só migra como "aprovado"/"aprovado_com_excecao" com EVIDÊNCIA:
// quality/capitulo-NN.json approved* E textHash == sha256 do arquivo ATUAL.
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import { hashText } from "../quality-state.js";
import { hashArquivo, hashJsonCanonico } from "./hash.js";
import type { PersistenciaV2 } from "./persistencia.js";
import {
  ENGINE_V2_VERSION,
  type CapituloEstado,
  type CapituloStatusV2,
  type EstadoCanonico,
  type EstadoCanonicoDoc,
} from "./tipos.js";

export const CODIGO_BLOQUEIO_LEGADO = "LEGADO_BLOQUEADO";
const REVIEW_ID_LEGADO = "legado:quality-state";
const RELATORIO_REL = "engine-v2/migracao-relatorio.json";

export interface RelatorioMigracao {
  projectId: string;
  executadaEm: string;
  capitulos: {
    numero: number;
    origem: { arquivo: boolean; qualityState: string | null; marcadorDone: boolean };
    destino: CapituloStatusV2;
    motivo: string;
  }[];
  fundacao: { docs: Record<string, string>; ausentes: string[] }; // doc → sha256
  divergencias: string[]; // ex.: quality aprovado mas hash não bate com o arquivo atual
  totalCapitulos?: number;
  fase: EstadoCanonicoDoc["fase"];
  idempotente: boolean; // true se nada mudou em relação à migração anterior
}

// ---------------------------------------------------------------------------
// Leitura do layout V1 (só leitura)
// ---------------------------------------------------------------------------

interface EstadoLivroV1 {
  fase_atual?: string;
  total_capitulos_previstos?: number;
  capitulos_aprovados?: number;
}

/** Campos do quality/capitulo-NN.json que a migração consome (QualityState V1). */
interface QualityV1 {
  status?: string;
  textHash?: string;
  reason?: string;
  evaluatedAt?: string;
}

const DOCS_FUNDACAO = ["Biblia-da-Obra.md", "Estrutura-do-Livro.md", "Mapa-de-Personagens.md", "perfil-de-voz.md"];

const FASE_V1_PARA_V2: Record<string, EstadoCanonicoDoc["fase"]> = {
  ESTRUTURA: "estrutura",
  ESCRITA: "escrita",
  CONSOLIDACAO: "revisao_final",
  REVIEW: "revisao_final",
  REESCRITA: "revisao_final",
  DESMANEIRISMO: "revisao_final",
  EPUB: "revisao_final",
  CONCLUIDO: "concluido",
};

function lerJsonSeguro<T>(caminho: string, aoFalhar?: (mensagem: string) => void): T | null {
  if (!existsSync(caminho)) return null;
  try {
    return JSON.parse(readFileSync(caminho, "utf8")) as T;
  } catch (e) {
    aoFalhar?.(`arquivo ilegível (${path.basename(caminho)}): ${e instanceof Error ? e.message : String(e)}`);
    return null;
  }
}

/** capitulo-NN.md em manuscrito/ (preferido) ou na raiz — trata os dois layouts. */
function descobrirCapitulos(dirProjeto: string): Map<number, string> {
  const mapa = new Map<number, string>();
  for (const base of [path.join(dirProjeto, "manuscrito"), dirProjeto]) {
    if (!existsSync(base)) continue;
    for (const nome of readdirSync(base)) {
      const m = /^capitulo-(\d{2,})\.md$/.exec(nome);
      if (!m) continue;
      const numero = Number(m[1]);
      if (!mapa.has(numero)) mapa.set(numero, path.join(base, nome));
    }
  }
  return mapa;
}

/** Doc de fundação na raiz do projeto ou em fundacao/ — trata os dois layouts. */
function hashDocFundacao(dirProjeto: string, nome: string): string | null {
  return hashArquivo(path.join(dirProjeto, nome)) ?? hashArquivo(path.join(dirProjeto, "fundacao", nome));
}

function gravarJsonAtomico(caminho: string, conteudo: unknown): void {
  mkdirSync(path.dirname(caminho), { recursive: true });
  const tmp = `${caminho}.tmp`;
  writeFileSync(tmp, JSON.stringify(conteudo, null, 2), "utf8");
  renameSync(tmp, caminho);
}

// ---------------------------------------------------------------------------
// Marca de origem: um capítulo "veio da migração" quando NÃO tem review_id V2
// real e carrega uma das assinaturas legadas. É este o critério do rollback.
// ---------------------------------------------------------------------------

function veioDaMigracao(cap: CapituloEstado): boolean {
  if (cap.review_id) return false; // aprovação V2 real — nunca é da migração
  if (cap.status === "legado_sem_evidencia") return true;
  if (cap.aprovacao?.review_id === REVIEW_ID_LEGADO) return true;
  if (cap.status === "bloqueado" && cap.bloqueio?.codigo === CODIGO_BLOQUEIO_LEGADO) return true;
  return false;
}

function clonarDoc(doc: EstadoCanonicoDoc): EstadoCanonicoDoc {
  return JSON.parse(JSON.stringify(doc)) as EstadoCanonicoDoc;
}

/** Compara docs ignorando o timestamp volátil migracao.em. */
function docsIguais(a: EstadoCanonicoDoc, b: EstadoCanonicoDoc): boolean {
  const normalizar = (doc: EstadoCanonicoDoc) => {
    const c = clonarDoc(doc);
    if (c.migracao) c.migracao.em = "";
    return c;
  };
  return hashJsonCanonico(normalizar(a)) === hashJsonCanonico(normalizar(b));
}

// ---------------------------------------------------------------------------
// Migração
// ---------------------------------------------------------------------------

export async function migrarProjetoV1(opts: {
  projectId: string;
  dirProjeto: string; // raiz V1 do projeto no WORK_DIR
  persistencia: PersistenciaV2;
  skill?: { id: string; versao: string; hash: string };
}): Promise<RelatorioMigracao> {
  const { projectId, dirProjeto, persistencia } = opts;
  const agora = new Date().toISOString();
  const divergencias: string[] = [];
  const relCapitulos: RelatorioMigracao["capitulos"] = [];

  const estadoLivro = lerJsonSeguro<EstadoLivroV1>(path.join(dirProjeto, "ESTADO_LIVRO.json"), (m) =>
    divergencias.push(`ESTADO_LIVRO.json: ${m}`)
  );
  const arquivos = descobrirCapitulos(dirProjeto);

  // Estado V2 existente: base do doc novo (estado V2 real NUNCA é rebaixado).
  const existente = await persistencia.lerEstado(projectId);
  const doc: EstadoCanonicoDoc = existente
    ? clonarDoc(existente.doc)
    : { schema: "engine-state/v1", fase: "fundacao", capitulos: {}, bloqueios: [] };

  // Bloqueios legados anteriores saem e são recalculados (preservando "desde").
  const bloqueiosLegadosAnteriores = new Map(
    doc.bloqueios.filter((b) => b.codigo === CODIGO_BLOQUEIO_LEGADO).map((b) => [b.alvo, b])
  );
  doc.bloqueios = doc.bloqueios.filter((b) => b.codigo !== CODIGO_BLOQUEIO_LEGADO);

  // -------------------------------------------------------------------------
  // Capítulos com arquivo no disco (verdade no disco)
  // -------------------------------------------------------------------------
  for (const numero of [...arquivos.keys()].sort((a, b) => a - b)) {
    const texto = readFileSync(arquivos.get(numero)!, "utf8");
    const hash = hashText(texto);
    const palavras = texto.split(/\s+/).filter(Boolean).length;
    const nn = String(numero).padStart(2, "0");
    const quality = lerJsonSeguro<QualityV1>(path.join(dirProjeto, "quality", `capitulo-${nn}.json`), (m) =>
      divergencias.push(`capitulo ${numero}: ${m}`)
    );
    const marcadorDone = existsSync(path.join(dirProjeto, "review", `_revcap-${nn}.done`));
    const chave = String(numero);
    const anterior = doc.capitulos[chave];
    const status = quality?.status ?? null;

    let candidato: CapituloEstado;
    let motivo: string;

    if (quality && (status === "approved" || status === "approved_with_exception")) {
      if (quality.textHash === hash) {
        // Evidência real: parecer aprovado hash-bound conferido no arquivo ATUAL.
        candidato = {
          status: status === "approved" ? "aprovado" : "aprovado_com_excecao",
          text_hash: hash,
          palavras,
          aprovacao: {
            review_id: REVIEW_ID_LEGADO, // origem documentada; nunca inventa review V2
            text_hash: hash,
            em: quality.evaluatedAt ?? anterior?.aprovacao?.em ?? agora,
          },
        };
        motivo = `quality-state "${status}" com textHash conferido no arquivo atual`;
      } else {
        candidato = { status: "legado_sem_evidencia", text_hash: hash, palavras };
        motivo = "quality-state aprovado, mas textHash difere do arquivo atual";
        divergencias.push(
          `capitulo ${numero}: quality aprovado para hash ${quality.textHash ?? "(ausente)"}, mas o arquivo atual tem hash ${hash}`
        );
      }
    } else if (status === "blocked_quality" || status === "blocked") {
      const detalhe = quality?.reason?.trim() ? quality.reason : `quality-state "${status}" sem reason`;
      const desde = anterior?.bloqueio?.codigo === CODIGO_BLOQUEIO_LEGADO ? anterior.bloqueio.desde : agora;
      candidato = {
        status: "bloqueado",
        text_hash: hash,
        palavras,
        bloqueio: { codigo: CODIGO_BLOQUEIO_LEGADO, detalhe, desde },
      };
      motivo = `quality-state "${status}" migrado como bloqueio legado`;
    } else {
      candidato = { status: "legado_sem_evidencia", text_hash: hash, palavras };
      motivo = quality
        ? `quality-state "${status}" não comprova aprovação`
        : marcadorDone
          ? "sem quality-state; marcador _revcap.done não é evidência de parecer"
          : "arquivo sem quality-state";
    }

    const origem = { arquivo: true, qualityState: status, marcadorDone };

    // Não-rebaixamento: estado V2 real (review_id V2) nunca é tocado pela migração.
    if (anterior && !veioDaMigracao(anterior)) {
      if (anterior.status !== candidato.status || anterior.text_hash !== candidato.text_hash) {
        divergencias.push(
          `capitulo ${numero}: estado V2 existente ("${anterior.status}") preservado; o V1 indicaria "${candidato.status}"`
        );
      }
      relCapitulos.push({ numero, origem, destino: anterior.status, motivo: "estado V2 preexistente preservado (não rebaixado)" });
      continue;
    }

    doc.capitulos[chave] = candidato;
    if (candidato.status === "bloqueado" && candidato.bloqueio) {
      const alvo = `capitulo:${numero}`;
      doc.bloqueios.push({
        codigo: CODIGO_BLOQUEIO_LEGADO,
        alvo,
        detalhe: candidato.bloqueio.detalhe,
        desde: bloqueiosLegadosAnteriores.get(alvo)?.desde ?? candidato.bloqueio.desde,
        status_anterior: "legado_sem_evidencia",
      });
    }
    relCapitulos.push({ numero, origem, destino: candidato.status, motivo });
  }

  // Capítulo contado no ESTADO_LIVRO mas sem arquivo → só divergência (não entra no doc).
  const contados = typeof estadoLivro?.capitulos_aprovados === "number" ? estadoLivro.capitulos_aprovados : 0;
  for (let n = 1; n <= contados; n++) {
    if (!arquivos.has(n)) {
      divergencias.push(
        `capitulo ${n}: contado no ESTADO_LIVRO (capitulos_aprovados=${contados}) mas sem arquivo no disco`
      );
    }
  }

  // -------------------------------------------------------------------------
  // Fase, totais, fundação, skill
  // -------------------------------------------------------------------------
  const faseV1 = estadoLivro?.fase_atual;
  let fase: EstadoCanonicoDoc["fase"];
  if (faseV1 && FASE_V1_PARA_V2[faseV1]) {
    fase = FASE_V1_PARA_V2[faseV1];
  } else {
    if (faseV1) divergencias.push(`fase_atual V1 desconhecida ("${faseV1}"); aplicado fallback`);
    fase = arquivos.size > 0 ? "escrita" : "fundacao";
  }
  if (existente?.doc.migracao && existente.doc.fase !== fase) {
    // Re-migração: a fase V2 pode ter avançado depois da 1ª migração — não regride.
    divergencias.push(`fase V2 existente ("${existente.doc.fase}") preservada; o V1 mapearia "${fase}"`);
    fase = existente.doc.fase;
  }
  doc.fase = fase;

  if (typeof estadoLivro?.total_capitulos_previstos === "number") {
    doc.total_capitulos = estadoLivro.total_capitulos_previstos;
  }
  if (opts.skill) doc.skill = opts.skill;

  const docsFundacao: Record<string, string> = {};
  const ausentes: string[] = [];
  for (const nome of DOCS_FUNDACAO) {
    const h = hashDocFundacao(dirProjeto, nome);
    if (h) docsFundacao[nome] = h;
    else ausentes.push(nome);
  }
  if (Object.keys(docsFundacao).length > 0) {
    doc.fundacao = {
      versao: doc.fundacao?.versao ?? "v1-migracao",
      hash: hashJsonCanonico(docsFundacao),
      docs: docsFundacao,
    };
  }

  doc.migracao = { origem: "v1", em: agora, relatorio_path: RELATORIO_REL, divergencias: divergencias.length };

  // -------------------------------------------------------------------------
  // Idempotência: doc idêntico ao persistido (módulo migracao.em) → NÃO grava.
  // -------------------------------------------------------------------------
  const idempotente = existente !== null && docsIguais(doc, existente.doc);
  if (!idempotente) {
    const estado: EstadoCanonico = {
      project_id: projectId,
      engine_version: existente?.engine_version ?? ENGINE_V2_VERSION,
      versao: existente?.versao ?? 0,
      doc,
    };
    await persistencia.gravarEstado(estado);
  }

  const relatorio: RelatorioMigracao = {
    projectId,
    executadaEm: agora,
    capitulos: relCapitulos,
    fundacao: { docs: docsFundacao, ausentes },
    divergencias,
    ...(doc.total_capitulos !== undefined ? { totalCapitulos: doc.total_capitulos } : {}),
    fase: doc.fase,
    idempotente,
  };

  // Relatório-arquivo preserva o histórico (ex.: reversões anteriores).
  const relAbs = path.join(dirProjeto, RELATORIO_REL);
  const relAnterior = lerJsonSeguro<{ historico?: unknown[] }>(relAbs);
  gravarJsonAtomico(relAbs, {
    ...relatorio,
    ...(Array.isArray(relAnterior?.historico) ? { historico: relAnterior.historico } : {}),
  });

  return relatorio;
}

// ---------------------------------------------------------------------------
// Rollback lógico: remove do doc SÓ o que veio da migração (sem review_id V2),
// limpa doc.migracao e registra a reversão no relatório-arquivo. V1 intocado.
// ---------------------------------------------------------------------------

export async function reverterMigracao(opts: {
  projectId: string;
  dirProjeto: string;
  persistencia: PersistenciaV2;
}): Promise<{ capitulosRemovidos: number[] }> {
  const existente = await opts.persistencia.lerEstado(opts.projectId);
  if (!existente) return { capitulosRemovidos: [] };

  const doc = clonarDoc(existente.doc);
  const removidos: number[] = [];
  for (const [chave, cap] of Object.entries(doc.capitulos)) {
    if (veioDaMigracao(cap)) {
      delete doc.capitulos[chave];
      removidos.push(Number(chave));
    }
  }
  removidos.sort((a, b) => a - b);
  const bloqueiosAntes = doc.bloqueios.length;
  doc.bloqueios = doc.bloqueios.filter((b) => b.codigo !== CODIGO_BLOQUEIO_LEGADO);
  const haviaMigracao = doc.migracao !== undefined;
  delete doc.migracao;

  if (removidos.length > 0 || haviaMigracao || doc.bloqueios.length !== bloqueiosAntes) {
    await opts.persistencia.gravarEstado({
      project_id: opts.projectId,
      engine_version: existente.engine_version,
      versao: existente.versao,
      doc,
    });
  }

  const relAbs = path.join(opts.dirProjeto, RELATORIO_REL);
  const relatorio = lerJsonSeguro<Record<string, unknown>>(relAbs);
  if (relatorio) {
    const historico = Array.isArray(relatorio.historico) ? relatorio.historico : [];
    historico.push({ evento: "reversao", em: new Date().toISOString(), capitulos_removidos: removidos });
    gravarJsonAtomico(relAbs, { ...relatorio, historico });
  }

  return { capitulosRemovidos: removidos };
}
