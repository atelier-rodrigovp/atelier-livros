// Engine V2 — PROVA LITERÁRIA: a medição da qualidade DO LIVRO.
//
// Por que existe: a prontidão media exaustivamente o SISTEMA (fiação, mutação,
// regressão, migrações, papéis) e NADA sobre o livro. O estado `prova_literaria`
// era a string "PROVA_LITERARIA_NAO_EXECUTADA" escrita literalmente, e os outros
// dois valores do tipo não tinham produtor nenhum no repositório.
//
// O que este módulo NÃO faz, de propósito:
//   - não abre uma segunda via de avaliação: reusa `avaliarLivro` da meta-nota,
//     que compila o pacote, executa o papel `revisor_literario` e grava no
//     ledger pelo mesmo caminho de provedor do resto da V2;
//   - não deixa o modelo somar a própria nota: nota agregada e piso saem de
//     `derivarNotaEFloor`, e o veredito de `atingiuMeta` (meta9.ts). O validador
//     RECALCULA os dois e recusa o artefato se o gravado divergir.
//
// COMO CADUCA (fail-closed): a prova vale para um CÓDIGO e um TEXTO. Gerada em
// outro SHA, ou apontando para um manuscrito cujo sha256 não é o que está no
// disco, ela morre e o estado volta a NAO_EXECUTADA. Ausência nunca vira
// aprovação — o estado APROVADA exige evidência positiva e corrente.

import { mkdirSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import { hashText } from "../quality-state.js";
import { capitulosAprovados } from "./capitulos-db.js";
import type { Gravador } from "./gravador.js";
import {
  DIMENSOES_LIVRO,
  FLOOR_MINIMO_APROVACAO,
  atingiuMeta,
  avaliarLivro,
  consolidarManuscrito,
  derivarNotaEFloor,
  lerCapitulos,
  type AvaliacaoLivro,
  type DepsMeta9,
  type DimensaoAvaliada,
} from "./meta9.js";
import type { PersistenciaV2 } from "./persistencia.js";
import type { ProvedorModelo } from "./provedor.js";
import { ErroEngine, type ContratoCompilado, type MapaModelos } from "./tipos.js";

export const SCHEMA_PROVA_LITERARIA = "prova-literaria/v1";

/** Onde a prova vive. Fora do versionamento, como `.evidencias/`. */
export const DIR_PROVA_LITERARIA = ".prova-literaria";

export type EstadoProvaLiteraria =
  | "PROVA_LITERARIA_APROVADA"
  | "PROVA_LITERARIA_REPROVADA"
  | "PROVA_LITERARIA_NAO_EXECUTADA";

export interface ProvaLiteraria {
  schema: typeof SCHEMA_PROVA_LITERARIA;
  project_id: string;
  edition_id: string | null;
  executado_em: string;
  /** SHA do código que produziu a prova. Diferente do HEAD = prova vencida. */
  tested_code_commit: string;
  /** sha256 do manuscrito REALMENTE avaliado (não do que se esperava avaliar). */
  manuscrito_sha256: string;
  manuscrito_palavras: number;
  total_capitulos: number;
  meta: number;
  floor_minimo: number;
  /** Nota e evidência por dimensão, íntegras como o avaliador as devolveu. */
  dimensoes: Record<string, DimensaoAvaliada>;
  /** Média ponderada — CALCULADA AQUI, nunca lida do modelo. */
  nota: number;
  /** Menor nota entre as majors — CALCULADA AQUI. */
  floor: { dimensao: string; nota: number };
  aprovada: boolean;
  /** Relatório textual íntegro: nada truncado, nada resumido. */
  relatorio: string;
  /** Runs do ledger que produziram a avaliação. */
  runs: string[];
  modelo: { provider: string; name: string };
}

export interface ValidacaoProva {
  valida: boolean;
  motivos: string[];
}

export interface EsperadoProva {
  /** HEAD atual do repositório. */
  head: string;
  /** sha256 do manuscrito no disco; `null` quando não há manuscrito a conferir. */
  manuscrito_sha256: string | null;
}

/** Caminho canônico da prova de um projeto. */
export function arquivoProva(raiz: string, projectId: string): string {
  return path.join(raiz, DIR_PROVA_LITERARIA, `${projectId}.json`);
}

/** Relatório legível montado a partir da avaliação — íntegro, sem corte. */
export function renderizarRelatorio(av: AvaliacaoLivro, meta: number): string {
  const linhas: string[] = [];
  linhas.push(`# Prova literária — nota ${av.nota} (meta ${meta}) · piso ${av.floor.nota} em ${av.floor.dimensao}`);
  linhas.push("");
  linhas.push("## Dimensões");
  for (const d of DIMENSOES_LIVRO) {
    const dim = av.dimensoes[d.chave];
    const marca = d.major ? "major" : "modificador";
    linhas.push(`- ${d.chave} (${marca}, peso ${d.peso}): ${dim.nota}/10 — ${dim.evidencia}`);
  }
  linhas.push("");
  if (av.pontos_fortes.length) {
    linhas.push("## Pontos fortes");
    for (const p of av.pontos_fortes) linhas.push(`- ${p}`);
    linhas.push("");
  }
  if (av.pontos_fracos.length) {
    linhas.push("## Pontos fracos");
    for (const p of av.pontos_fracos) linhas.push(`- ${p}`);
    linhas.push("");
  }
  if (av.capitulos_a_reescrever.length) {
    linhas.push("## Capítulos apontados para reescrita");
    for (const c of av.capitulos_a_reescrever) {
      linhas.push(`- capítulo ${c.capitulo}`);
      for (const p of c.problemas) linhas.push(`  - problema: ${p}`);
      for (const i of c.instrucoes) linhas.push(`  - instrução: ${i}`);
    }
    linhas.push("");
  }
  linhas.push("## Resumo");
  linhas.push(av.resumo);
  return linhas.join("\n");
}

/**
 * Uma prova só vale para o CÓDIGO e o TEXTO atuais. Qualquer divergência a
 * invalida — e a nota gravada é sempre reconferida contra as dimensões, para que
 * um artefato editado à mão não consiga aprovar nada.
 */
export function validarProvaLiteraria(v: unknown, esperado: EsperadoProva): ValidacaoProva {
  const motivos: string[] = [];
  if (!v || typeof v !== "object") return { valida: false, motivos: ["prova ausente ou não é um objeto"] };
  const p = v as Partial<ProvaLiteraria>;

  if (p.schema !== SCHEMA_PROVA_LITERARIA) motivos.push(`schema inesperado: ${String(p.schema)}`);
  if (!p.project_id) motivos.push("project_id ausente");
  if (!p.executado_em || Number.isNaN(Date.parse(p.executado_em))) motivos.push("executado_em ausente ou inválido");

  // SHA desconhecido não certifica nada.
  if (!p.tested_code_commit || !/^[0-9a-f]{40}$/.test(String(p.tested_code_commit))) {
    motivos.push(`tested_code_commit ausente ou não é um SHA: ${String(p.tested_code_commit)}`);
  } else if (p.tested_code_commit !== esperado.head) {
    motivos.push(`prova gerada no commit ${p.tested_code_commit.slice(0, 7)}, HEAD está em ${esperado.head.slice(0, 7)}`);
  }

  // Nota velha não vale para texto novo.
  if (!p.manuscrito_sha256 || !/^[0-9a-f]{64}$/.test(String(p.manuscrito_sha256))) {
    motivos.push("manuscrito_sha256 ausente ou inválido");
  } else if (esperado.manuscrito_sha256 === null) {
    motivos.push("manuscrito avaliado não está no disco — nada a conferir");
  } else if (p.manuscrito_sha256 !== esperado.manuscrito_sha256) {
    motivos.push("manuscrito mudou desde a avaliação (sha256 divergente)");
  }

  // O coração do A3: nota e piso são RECALCULADOS. Se o gravado diverge, alguém
  // (modelo ou mão humana) somou a própria nota — e isso invalida a prova.
  const dims = p.dimensoes;
  if (!dims || typeof dims !== "object") {
    motivos.push("dimensões ausentes");
  } else {
    const faltando = DIMENSOES_LIVRO.filter((d) => {
      const dim = dims[d.chave];
      return !dim || typeof dim.nota !== "number" || dim.nota < 1 || dim.nota > 10 || !String(dim.evidencia ?? "").trim();
    });
    if (faltando.length) {
      motivos.push(`dimensões inválidas ou sem evidência: ${faltando.map((d) => d.chave).join(", ")}`);
    } else {
      const { nota, floor } = derivarNotaEFloor(dims);
      if (p.nota !== nota) motivos.push(`nota gravada ${String(p.nota)} ≠ nota derivada das dimensões ${nota}`);
      if (p.floor?.nota !== floor.nota || p.floor?.dimensao !== floor.dimensao) {
        motivos.push(`piso gravado ${String(p.floor?.nota)} em ${String(p.floor?.dimensao)} ≠ piso derivado ${floor.nota} em ${floor.dimensao}`);
      }
      if (typeof p.meta !== "number") motivos.push("meta ausente");
      else {
        const aprovada = nota >= p.meta && floor.nota >= FLOOR_MINIMO_APROVACAO;
        if (p.aprovada !== aprovada) motivos.push(`veredito gravado ${String(p.aprovada)} ≠ veredito derivado ${aprovada}`);
      }
    }
  }

  if (!String(p.relatorio ?? "").trim()) motivos.push("relatório ausente — nota sem relatório não é prova");
  if (!Array.isArray(p.runs) || p.runs.length === 0) motivos.push("nenhum run registrado — a avaliação não passou pelo ledger");

  return { valida: motivos.length === 0, motivos };
}

/**
 * Estado formal derivado da prova. FAIL-CLOSED: ausente, vencida, inválida ou
 * sobre outro texto => NAO_EXECUTADA. APROVADA exige prova válida E aprovada.
 */
export function derivarEstadoProvaLiteraria(
  v: unknown | null,
  esperado: EsperadoProva
): { estado: EstadoProvaLiteraria; motivos: string[] } {
  if (v === null || v === undefined) {
    return { estado: "PROVA_LITERARIA_NAO_EXECUTADA", motivos: ["prova ausente — nenhum artefato encontrado"] };
  }
  const val = validarProvaLiteraria(v, esperado);
  if (!val.valida) return { estado: "PROVA_LITERARIA_NAO_EXECUTADA", motivos: val.motivos };
  const p = v as ProvaLiteraria;
  // Reprovação é FATO e continua visível: reprovada nunca vira "não executada".
  return {
    estado: p.aprovada ? "PROVA_LITERARIA_APROVADA" : "PROVA_LITERARIA_REPROVADA",
    motivos: p.aprovada ? [] : [`nota ${p.nota} (meta ${p.meta}), piso ${p.floor.nota} em ${p.floor.dimensao}`],
  };
}

// ---------------------------------------------------------------------------
// Produtor
// ---------------------------------------------------------------------------

export interface DepsProvaLiteraria {
  gravador: Gravador;
  persistencia: PersistenciaV2;
  provedor: ProvedorModelo;
  mapa: MapaModelos;
  contrato: ContratoCompilado;
  perfil: { texto: string; skillId: string; hash: string; validado: boolean };
  dirProjeto: string;
  dirManuscrito: string;
  projectId: string;
  editionId?: string | null;
  jobId?: string | null;
  /** HEAD do repositório no momento da prova. */
  head: string;
  meta: number;
  /** Override explícito; por padrão sai do estado canônico. */
  totalCapitulos?: number;
  /** Raiz onde gravar o artefato. Sem isto, a prova só é devolvida. */
  raizArtefato?: string;
  docsFactuais?: DepsMeta9["docsFactuais"];
}

function gravarAtomico(caminho: string, conteudo: string): void {
  mkdirSync(path.dirname(caminho), { recursive: true });
  const tmp = `${caminho}.tmp`;
  writeFileSync(tmp, conteudo, "utf8");
  renameSync(tmp, caminho);
}

/**
 * Consolida o manuscrito, avalia o livro inteiro pelo caminho de provedor da V2
 * e devolve a prova assinada. Não reescreve nada — é medição, não correção.
 */
export async function executarProvaLiteraria(deps: DepsProvaLiteraria): Promise<ProvaLiteraria> {
  if (!/^[0-9a-f]{40}$/.test(deps.head)) {
    throw new ErroEngine({
      codigo: "PROVA_LITERARIA_SEM_HEAD",
      classe: "configuracao",
      mensagem: `prova literária exige o SHA do código: recebido "${deps.head}"`,
    });
  }

  const estado = await deps.gravador.carregarEstado();
  const aprovados = capitulosAprovados(estado);
  const total = deps.totalCapitulos ?? estado.doc.total_capitulos ?? aprovados.length;
  if (!total) {
    throw new ErroEngine({
      codigo: "PROVA_LITERARIA_SEM_CAPITULOS",
      classe: "configuracao",
      mensagem: "prova literária sem total de capítulos definido",
    });
  }
  // Avaliar um livro pela metade produziria uma nota sobre manuscrito
  // incompleto — que é pior que nota nenhuma, porque parece medição.
  if (aprovados.length < total) {
    throw new ErroEngine({
      codigo: "PROVA_LITERARIA_LIVRO_INCOMPLETO",
      classe: "configuracao",
      mensagem: `prova literária exige o livro inteiro aprovado: ${aprovados.length} de ${total} capítulo(s)`,
    });
  }

  const consolidado = consolidarManuscrito(deps.dirManuscrito, deps.dirProjeto, total);
  const capitulos = lerCapitulos(deps.dirManuscrito, total);

  const depsMeta9: DepsMeta9 = {
    gravador: deps.gravador,
    persistencia: deps.persistencia,
    provedor: deps.provedor,
    mapa: deps.mapa,
    contrato: deps.contrato,
    perfil: deps.perfil,
    dirProjeto: deps.dirProjeto,
    dirManuscrito: deps.dirManuscrito,
    projectId: deps.projectId,
    editionId: deps.editionId ?? null,
    jobId: deps.jobId ?? null,
    meta: deps.meta,
    docsFactuais: deps.docsFactuais,
  };

  const manuscritoTexto = capitulos.map((c) => c.texto.trim()).join("\n\n") + "\n";
  const { av, runId } = await avaliarLivro(depsMeta9, deps.meta, capitulos, manuscritoTexto, consolidado.palavras);

  // Nota e piso vêm de `derivarNotaEFloor` dentro de `validarAvaliacaoLivro`; o
  // veredito vem de `atingiuMeta`. Nada aqui soma, arredonda ou normaliza.
  const prova: ProvaLiteraria = {
    schema: SCHEMA_PROVA_LITERARIA,
    project_id: deps.projectId,
    edition_id: deps.editionId ?? null,
    executado_em: new Date().toISOString(),
    tested_code_commit: deps.head,
    manuscrito_sha256: consolidado.hash,
    manuscrito_palavras: consolidado.palavras,
    total_capitulos: total,
    meta: deps.meta,
    floor_minimo: FLOOR_MINIMO_APROVACAO,
    dimensoes: av.dimensoes,
    nota: av.nota,
    floor: av.floor,
    aprovada: atingiuMeta(av, deps.meta),
    relatorio: renderizarRelatorio(av, deps.meta),
    runs: [runId],
    modelo: { provider: deps.provedor.nome, name: deps.mapa.julgamento },
  };

  if (deps.raizArtefato) {
    gravarAtomico(arquivoProva(deps.raizArtefato, deps.projectId), JSON.stringify(prova, null, 2));
  }
  return prova;
}
