// Engine V2 — edição estrutural determinística (fechamento do loop).
// O editor_estrutural PROPÕE (corte de capítulo redundante ou reordenação); ESTE módulo
// aplica de forma determinística (move/renumera arquivos no disco). Nenhum modelo é
// chamado aqui — o módulo é puro e testável (mesmo estilo de validarSaidaAuditor).

import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import { hashJsonCanonico } from "./hash.js";

export type TipoProposta = "nenhuma" | "corte" | "reordenacao";

export interface PropostaEstrutural {
  tipo: TipoProposta;
  capitulos: number[];
  nova_ordem?: number[];
  justificativa: string;
}

export interface PlanoEstrutural {
  schema: "structural-edit/v1";
  propostas: PropostaEstrutural[];
}

export interface RelatorioEdicao {
  aplicadas: string[];
  /** número antigo → número novo, apenas para capítulos SOBREVIVENTES (cortados ausentes). */
  mapa: Record<number, number>;
  totalFinal: number;
}

const MANIFESTO = "_edicao-estrutural.json"; // marca planos já aplicados (idempotência)

function nomeCapitulo(n: number): string {
  return `capitulo-${String(n).padStart(2, "0")}.md`;
}

function inteiroPositivo(v: unknown, contexto: string): number {
  if (typeof v !== "number" || !Number.isInteger(v) || v < 1) {
    throw new Error(`${contexto}: esperado inteiro ≥ 1, recebido ${JSON.stringify(v)}`);
  }
  return v;
}

/**
 * Validação estrita do JSON do editor estrutural (schema "structural-edit/v1").
 * - "reordenacao" exige nova_ordem = permutação COMPLETA do conjunto pós-corte (1..N menos cortados);
 * - "corte" só referencia capítulos existentes (1..totalCaps), sem duplicatas entre cortes;
 * - no máximo uma reordenação (duas seriam operações conflitantes);
 * - na ausência de operação real, um `[{tipo:"nenhuma"}]` é válido (no-op).
 */
export function validarPropostas(obj: unknown, totalCaps: number): PlanoEstrutural {
  if (typeof obj !== "object" || obj === null) throw new Error("plano estrutural não é objeto");
  const o = obj as Record<string, unknown>;
  if (o.schema !== "structural-edit/v1") throw new Error(`schema inválido: ${String(o.schema)}`);
  if (!Array.isArray(o.propostas) || o.propostas.length === 0) throw new Error("propostas deve ser lista não-vazia");

  const propostas: PropostaEstrutural[] = [];
  const cortados = new Set<number>();
  let reordenacoes = 0;

  for (let i = 0; i < o.propostas.length; i++) {
    const p = o.propostas[i] as Record<string, unknown>;
    const tipo = p?.tipo;
    if (tipo !== "nenhuma" && tipo !== "corte" && tipo !== "reordenacao") {
      throw new Error(`propostas[${i}].tipo inválido: ${String(tipo)}`);
    }
    if (typeof p.justificativa !== "string" || !p.justificativa.trim()) {
      throw new Error(`propostas[${i}].justificativa deve ser string não-vazia`);
    }
    if (!Array.isArray(p.capitulos)) throw new Error(`propostas[${i}].capitulos deve ser lista`);
    const capitulos = (p.capitulos as unknown[]).map((c, j) => {
      const n = inteiroPositivo(c, `propostas[${i}].capitulos[${j}]`);
      if (n > totalCaps) throw new Error(`propostas[${i}].capitulos[${j}]: capítulo ${n} não existe (total ${totalCaps})`);
      return n;
    });
    if (new Set(capitulos).size !== capitulos.length) throw new Error(`propostas[${i}].capitulos tem duplicata`);

    if (tipo === "corte") {
      if (capitulos.length === 0) throw new Error(`propostas[${i}]: corte sem capítulos`);
      for (const c of capitulos) {
        if (cortados.has(c)) throw new Error(`capítulo ${c} cortado mais de uma vez`);
        cortados.add(c);
      }
    }
    if (tipo === "reordenacao") reordenacoes++;

    const proposta: PropostaEstrutural = { tipo, capitulos, justificativa: p.justificativa };
    if (tipo === "reordenacao") {
      if (!Array.isArray(p.nova_ordem)) throw new Error(`propostas[${i}]: reordenacao exige nova_ordem`);
      proposta.nova_ordem = (p.nova_ordem as unknown[]).map((c, j) => inteiroPositivo(c, `propostas[${i}].nova_ordem[${j}]`));
    }
    propostas.push(proposta);
  }

  if (reordenacoes > 1) throw new Error("mais de uma reordenação no mesmo plano (operações conflitantes)");

  // A permutação é validada contra o conjunto PÓS-CORTE (capítulos sobreviventes).
  const sobreviventes = new Set<number>();
  for (let n = 1; n <= totalCaps; n++) if (!cortados.has(n)) sobreviventes.add(n);

  const reord = propostas.find((p) => p.tipo === "reordenacao");
  if (reord?.nova_ordem) {
    const ordem = reord.nova_ordem;
    if (ordem.length !== sobreviventes.size) {
      throw new Error(`nova_ordem tem ${ordem.length} itens; esperado ${sobreviventes.size} (permutação incompleta)`);
    }
    const vistos = new Set<number>();
    for (const n of ordem) {
      if (!sobreviventes.has(n)) throw new Error(`nova_ordem referencia capítulo ${n} inexistente ou cortado`);
      if (vistos.has(n)) throw new Error(`nova_ordem tem duplicata do capítulo ${n}`);
      vistos.add(n);
    }
  }

  return { schema: "structural-edit/v1", propostas };
}

/** Deriva conjunto de cortes e ordem final (em números ANTIGOS) a partir do plano validado. */
function derivarOperacoes(propostas: PropostaEstrutural[], total: number): { cortados: Set<number>; ordemFinal: number[] } {
  const cortados = new Set<number>();
  for (const p of propostas) if (p.tipo === "corte") for (const c of p.capitulos) cortados.add(c);

  const sobreviventes: number[] = [];
  for (let n = 1; n <= total; n++) if (!cortados.has(n)) sobreviventes.push(n);

  const reord = propostas.find((p) => p.tipo === "reordenacao");
  const ordemFinal = reord?.nova_ordem ? [...reord.nova_ordem] : sobreviventes;
  return { cortados, ordemFinal };
}

function lerManifesto(dir: string): { aplicados: { assinatura: string; totalFinal: number }[] } {
  const caminho = path.join(dir, MANIFESTO);
  if (!existsSync(caminho)) return { aplicados: [] };
  try {
    return JSON.parse(readFileSync(caminho, "utf8")) as { aplicados: { assinatura: string; totalFinal: number }[] };
  } catch {
    return { aplicados: [] };
  }
}

function gravarManifestoAtomico(dir: string, conteudo: unknown): void {
  const caminho = path.join(dir, MANIFESTO);
  const tmp = `${caminho}.tmp`;
  writeFileSync(tmp, JSON.stringify(conteudo, null, 2), "utf8");
  renameSync(tmp, caminho);
}

/**
 * Aplica a edição estrutural de forma DETERMINÍSTICA (não chama modelo):
 * - corte: move capitulo-NN.md para <dirManuscrito>/_cortados/;
 * - reordenação: renumera arquivos em DUAS passadas (tudo → *.tmp-reord, depois nomes finais)
 *   para não colidir (ex.: troca 1↔2).
 * Idempotência: um manifesto registra a assinatura do plano; reaplicar o MESMO plano é no-op
 * (evita corromper o manuscrito ao rodar duas vezes). "nenhuma" também é no-op.
 */
export function aplicarEdicaoEstrutural(entrada: {
  dirManuscrito: string;
  propostas: PropostaEstrutural[];
  total: number;
}): RelatorioEdicao {
  const { dirManuscrito, propostas, total } = entrada;
  const { cortados, ordemFinal } = derivarOperacoes(propostas, total);

  // No-op puro: sem corte e sem reordenação efetiva.
  const houveReordenacao = propostas.some((p) => p.tipo === "reordenacao");
  if (cortados.size === 0 && !houveReordenacao) {
    return { aplicadas: [], mapa: {}, totalFinal: total };
  }

  // Idempotência por assinatura do plano.
  const assinatura = hashJsonCanonico({ propostas, total });
  const manifesto = lerManifesto(dirManuscrito);
  const jaAplicado = manifesto.aplicados.find((a) => a.assinatura === assinatura);
  if (jaAplicado) {
    // Segunda aplicação do MESMO plano = no-op documentado (estado já foi re-keado na 1ª).
    return { aplicadas: [], mapa: {}, totalFinal: jaAplicado.totalFinal };
  }

  const aplicadas: string[] = [];
  const cortadosDir = path.join(dirManuscrito, "_cortados");

  // 1. Cortes: liberam os nomes antigos antes da renumeração.
  if (cortados.size > 0) {
    mkdirSync(cortadosDir, { recursive: true });
    for (const c of [...cortados].sort((a, b) => a - b)) {
      const origem = path.join(dirManuscrito, nomeCapitulo(c));
      if (!existsSync(origem)) {
        throw new Error(`corte: ${nomeCapitulo(c)} ausente no disco (manuscrito inconsistente ou plano já aplicado)`);
      }
      const destino = path.join(cortadosDir, nomeCapitulo(c));
      if (existsSync(destino)) unlinkSync(destino);
      renameSync(origem, destino);
      aplicadas.push(`corte: capítulo ${c} → _cortados/`);
    }
  }

  // 2. Renumeração (mapa número antigo → novo = posição 1-based em ordemFinal).
  const mapa: Record<number, number> = {};
  ordemFinal.forEach((antigo, idx) => (mapa[antigo] = idx + 1));

  const renomeados = ordemFinal
    .map((antigo, idx) => ({ antigo, novo: idx + 1 }))
    .filter((r) => r.antigo !== r.novo);

  if (renomeados.length > 0) {
    // Passada A: cada sobrevivente → capitulo-<novo>.md.tmp-reord (nomes novos são únicos).
    for (const { antigo, novo } of renomeados) {
      const origem = path.join(dirManuscrito, nomeCapitulo(antigo));
      if (!existsSync(origem)) {
        throw new Error(`reordenação: ${nomeCapitulo(antigo)} ausente no disco (manuscrito inconsistente ou plano já aplicado)`);
      }
      renameSync(origem, path.join(dirManuscrito, `${nomeCapitulo(novo)}.tmp-reord`));
    }
    // Passada B: os temporários assumem os nomes finais.
    for (const { antigo, novo } of renomeados) {
      renameSync(path.join(dirManuscrito, `${nomeCapitulo(novo)}.tmp-reord`), path.join(dirManuscrito, nomeCapitulo(novo)));
      aplicadas.push(`reordenação: capítulo ${antigo} → ${novo}`);
    }
  }

  const totalFinal = ordemFinal.length;
  manifesto.aplicados.push({ assinatura, totalFinal });
  gravarManifestoAtomico(dirManuscrito, manifesto);

  return { aplicadas, mapa, totalFinal };
}

/** Utilitário de teste/inspeção: lista os capitulo-NN.md presentes, ordenados. */
export function listarCapitulos(dirManuscrito: string): string[] {
  if (!existsSync(dirManuscrito)) return [];
  return readdirSync(dirManuscrito)
    .filter((f) => /^capitulo-\d+\.md$/.test(f))
    .sort();
}
