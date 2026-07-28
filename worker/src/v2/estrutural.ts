// Engine V2 — edição estrutural determinística (fechamento do loop).
// O editor_estrutural PROPÕE (corte de capítulo redundante ou reordenação); ESTE módulo
// aplica de forma determinística (move/renumera arquivos no disco). Nenhum modelo é
// chamado aqui — o módulo é puro e testável (mesmo estilo de validarSaidaAuditor).

import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import { hashText } from "../quality-state.js";
import { hashJsonCanonico } from "./hash.js";

export type TipoProposta = "nenhuma" | "corte" | "fusao" | "reordenacao";

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
  assinatura?: string;
  arquivoOriginais?: string;
  fusoes: {
    origens: number[];
    origemPrincipal: number;
    destino: number;
    textHash: string;
    palavras: number;
  }[];
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
    if (tipo !== "nenhuma" && tipo !== "corte" && tipo !== "fusao" && tipo !== "reordenacao") {
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
    if (tipo === "fusao") {
      if (capitulos.length < 2) throw new Error(`propostas[${i}]: fusao exige ao menos 2 capítulos`);
      const ordenados = [...capitulos].sort((a, b) => a - b);
      if (ordenados.some((n, j) => n !== capitulos[j])) {
        throw new Error(`propostas[${i}]: fusao exige capítulos em ordem crescente`);
      }
      for (let j = 1; j < capitulos.length; j++) {
        if (capitulos[j] !== capitulos[j - 1] + 1) {
          throw new Error(`propostas[${i}]: fusao só aceita capítulos adjacentes`);
        }
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

  const usadosEmFusao = new Set<number>();
  for (const p of propostas.filter((x) => x.tipo === "fusao")) {
    for (const cap of p.capitulos) {
      if (usadosEmFusao.has(cap)) throw new Error(`capítulo ${cap} aparece em mais de uma fusão`);
      if (cortados.has(cap)) throw new Error(`capítulo ${cap} não pode ser cortado e fundido no mesmo plano`);
      usadosEmFusao.add(cap);
    }
  }

  // A permutação é validada contra o conjunto PÓS-CORTE/PÓS-FUSÃO. Em uma
  // fusão, o primeiro número identifica a unidade sobrevivente.
  const absorvidos = new Set<number>();
  for (const p of propostas.filter((x) => x.tipo === "fusao")) {
    p.capitulos.slice(1).forEach((n) => absorvidos.add(n));
  }
  const sobreviventes = new Set<number>();
  for (let n = 1; n <= totalCaps; n++) {
    if (!cortados.has(n) && !absorvidos.has(n)) sobreviventes.add(n);
  }

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
function derivarOperacoes(
  propostas: PropostaEstrutural[],
  total: number
): { cortados: Set<number>; fusoes: number[][]; ordemFinal: number[] } {
  const cortados = new Set<number>();
  for (const p of propostas) if (p.tipo === "corte") for (const c of p.capitulos) cortados.add(c);
  const fusoes = propostas.filter((p) => p.tipo === "fusao").map((p) => [...p.capitulos]);
  const absorvidos = new Set(fusoes.flatMap((caps) => caps.slice(1)));

  const sobreviventes: number[] = [];
  for (let n = 1; n <= total; n++) {
    if (!cortados.has(n) && !absorvidos.has(n)) sobreviventes.push(n);
  }

  const reord = propostas.find((p) => p.tipo === "reordenacao");
  const ordemFinal = reord?.nova_ordem ? [...reord.nova_ordem] : sobreviventes;
  return { cortados, fusoes, ordemFinal };
}

export function planejarEdicaoEstrutural(
  propostas: PropostaEstrutural[],
  total: number
): {
  mapa: Record<number, number>;
  totalFinal: number;
  fusoes: { origens: number[]; origemPrincipal: number; destino: number }[];
} {
  const { fusoes, ordemFinal } = derivarOperacoes(propostas, total);
  const mapa: Record<number, number> = {};
  ordemFinal.forEach((antigo, idx) => (mapa[antigo] = idx + 1));
  return {
    mapa,
    totalFinal: ordemFinal.length,
    fusoes: fusoes.map((origens) => ({
      origens,
      origemPrincipal: origens[0],
      destino: mapa[origens[0]],
    })),
  };
}

function lerManifesto(dir: string): { aplicados: { assinatura: string; totalFinal: number; arquivoOriginais?: string }[] } {
  const caminho = path.join(dir, MANIFESTO);
  if (!existsSync(caminho)) return { aplicados: [] };
  try {
    return JSON.parse(readFileSync(caminho, "utf8")) as { aplicados: { assinatura: string; totalFinal: number; arquivoOriginais?: string }[] };
  } catch {
    return { aplicados: [] };
  }
}

function contarPalavras(t: string): number {
  return t.split(/\s+/).filter(Boolean).length;
}

function semCabecalhoCapitulo(texto: string): string {
  const linhas = texto.replace(/\r\n/g, "\n").split("\n");
  const primeira = linhas.findIndex((l) => l.trim().length > 0);
  if (primeira >= 0 && /^#{1,6}\s+\S/.test(linhas[primeira])) {
    linhas.splice(primeira, 1);
  }
  return linhas.join("\n").trim();
}

/**
 * Reescreve o NÚMERO no cabeçalho `## Capítulo N` da prosa quando a edição
 * estrutural renumera o arquivo. Antes, a edição só renomeava `capitulo-NN.md`:
 * o arquivo virava o capítulo 7 e a primeira linha continuava dizendo
 * "## Capítulo 9" — o leitor lia a numeração errada no EPUB.
 *
 * Conservador de propósito: só troca o NÚMERO, na primeira linha de cabeçalho,
 * preservando o nível de `#`, a palavra usada ("Capítulo"/"Cap."), maiúsculas,
 * acento e qualquer subtítulo depois do número. Cabeçalho ausente ou sem número
 * é devolvido intacto (a prosa nunca é inventada aqui).
 */
export function renumerarCabecalhoCapitulo(texto: string, novo: number): string {
  const crlf = texto.includes("\r\n");
  const linhas = texto.replace(/\r\n/g, "\n").split("\n");
  const i = linhas.findIndex((l) => l.trim().length > 0);
  if (i < 0) return texto;
  const re = /^(\s*#{1,6}\s+(?:cap[íi]tulo|cap\.?)\s*)(\d+)(\b.*)$/i;
  const m = linhas[i].match(re);
  if (!m) return texto;
  linhas[i] = `${m[1]}${novo}${m[3]}`;
  const saida = linhas.join("\n");
  return crlf ? saida.replace(/\n/g, "\r\n") : saida;
}

/** Combinação mecânica conservadora: preserva toda a prosa e remove só cabeçalhos duplicados. */
export function fundirTextosCapitulos(textos: string[]): string {
  if (textos.length < 2) throw new Error("fusão exige ao menos dois textos");
  const partes = [textos[0].trim(), ...textos.slice(1).map(semCabecalhoCapitulo)];
  return partes.join("\n\n").trim() + "\n";
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
  /** Conteúdo já aprovado pelo pipeline para cada líder de fusão (primeiro capítulo). */
  conteudosFusao?: Record<number, string>;
}): RelatorioEdicao {
  const { dirManuscrito, propostas, total } = entrada;
  const { cortados, fusoes, ordemFinal } = derivarOperacoes(propostas, total);

  // No-op puro: sem corte e sem reordenação efetiva.
  const houveReordenacao = propostas.some((p) => p.tipo === "reordenacao");
  if (cortados.size === 0 && fusoes.length === 0 && !houveReordenacao) {
    return { aplicadas: [], mapa: {}, totalFinal: total, fusoes: [] };
  }

  // Idempotência por assinatura do plano.
  const hashesFusao = Object.fromEntries(
    Object.entries(entrada.conteudosFusao ?? {}).map(([k, v]) => [k, hashText(v)])
  );
  const assinatura = hashJsonCanonico({ propostas, total, hashesFusao });
  const manifesto = lerManifesto(dirManuscrito);
  const jaAplicado = manifesto.aplicados.find((a) => a.assinatura === assinatura);
  if (jaAplicado) {
    // Segunda aplicação do MESMO plano = no-op documentado (estado já foi re-keado na 1ª).
    return {
      aplicadas: [],
      mapa: {},
      totalFinal: jaAplicado.totalFinal,
      assinatura,
      arquivoOriginais: jaAplicado.arquivoOriginais,
      fusoes: [],
    };
  }

  const aplicadas: string[] = [];
  const originais = new Map<number, string>();
  for (let n = 1; n <= total; n++) {
    const arquivo = path.join(dirManuscrito, nomeCapitulo(n));
    if (!existsSync(arquivo)) throw new Error(`edição estrutural: ${nomeCapitulo(n)} ausente no disco`);
    originais.set(n, readFileSync(arquivo, "utf8"));
  }
  for (const grupo of fusoes) {
    if (!entrada.conteudosFusao?.[grupo[0]]) {
      throw new Error(`fusão ${grupo.join("+")}: conteúdo pré-validado do capítulo líder ${grupo[0]} ausente`);
    }
  }

  // Mapa número antigo sobrevivente → novo = posição 1-based em ordemFinal.
  const mapa: Record<number, number> = {};
  ordemFinal.forEach((antigo, idx) => (mapa[antigo] = idx + 1));
  const totalFinal = ordemFinal.length;
  const arquivoOriginais = path.join("_edicoes", assinatura, "originais").replaceAll("\\", "/");
  const dirOriginais = path.join(dirManuscrito, arquivoOriginais);
  if (existsSync(dirOriginais) && readdirSync(dirOriginais).length > 0) {
    throw new Error(`arquivo de edição já existe sem manifesto: ${dirOriginais}`);
  }
  mkdirSync(dirOriginais, { recursive: true });

  const temporarios: string[] = [];
  try {
    // Prepara todas as saídas antes de mover qualquer original.
    for (const [idx, antigo] of ordemFinal.entries()) {
      const novo = idx + 1;
      const fusao = fusoes.find((f) => f[0] === antigo);
      const bruto = fusao ? entrada.conteudosFusao![antigo] : originais.get(antigo)!;
      // A prosa acompanha a renumeração: o arquivo vira capitulo-07.md E o
      // cabeçalho vira "## Capítulo 7". Antes só o arquivo era renomeado.
      // A renumeração do cabeçalho é CONSEQUÊNCIA da reordenação/corte, não uma
      // operação estrutural própria: não entra em `aplicadas` (que audita as
      // operações) para o rastro não virar 39 linhas de ruído num livro de 40.
      const conteudo = novo === antigo ? bruto : renumerarCabecalhoCapitulo(bruto, novo);
      const tmp = path.join(dirManuscrito, `.${nomeCapitulo(novo)}.${assinatura}.tmp-struct`);
      writeFileSync(tmp, conteudo, "utf8");
      temporarios.push(tmp);
    }

    // Arquiva TODOS os originais; rollback e auditoria não dependem de inferência.
    for (let n = 1; n <= total; n++) {
      renameSync(path.join(dirManuscrito, nomeCapitulo(n)), path.join(dirOriginais, nomeCapitulo(n)));
    }
    for (const [idx, tmp] of temporarios.entries()) {
      renameSync(tmp, path.join(dirManuscrito, nomeCapitulo(idx + 1)));
    }
  } catch (erro) {
    for (let n = 1; n <= totalFinal; n++) {
      const parcial = path.join(dirManuscrito, nomeCapitulo(n));
      if (existsSync(parcial)) unlinkSync(parcial);
    }
    for (const tmp of temporarios) if (existsSync(tmp)) unlinkSync(tmp);
    for (let n = 1; n <= total; n++) {
      const salvo = path.join(dirOriginais, nomeCapitulo(n));
      if (existsSync(salvo)) renameSync(salvo, path.join(dirManuscrito, nomeCapitulo(n)));
    }
    throw erro;
  }

  for (const c of [...cortados].sort((a, b) => a - b)) {
    aplicadas.push(`corte: capítulo ${c} → ${arquivoOriginais}/`);
  }
  const fusoesAplicadas = fusoes.map((origens) => {
    const origemPrincipal = origens[0];
    const destino = mapa[origemPrincipal];
    const texto = entrada.conteudosFusao![origemPrincipal];
    aplicadas.push(`fusão: capítulos ${origens.join("+")} → ${destino}`);
    return {
      origens,
      origemPrincipal,
      destino,
      textHash: hashText(texto),
      palavras: contarPalavras(texto),
    };
  });
  for (const [antigoS, novo] of Object.entries(mapa)) {
    const antigo = Number(antigoS);
    if (antigo !== novo) aplicadas.push(`reordenação: capítulo ${antigo} → ${novo}`);
  }

  manifesto.aplicados.push({ assinatura, totalFinal, arquivoOriginais });
  gravarManifestoAtomico(dirManuscrito, manifesto);

  return { aplicadas, mapa, totalFinal, assinatura, arquivoOriginais, fusoes: fusoesAplicadas };
}

/**
 * Compensação de falha entre disco/banco: preserva a edição produzida em
 * `_edicoes/<assinatura>/revertido/` e restaura os arquivos originais.
 */
export function reverterEdicaoEstrutural(entrada: {
  dirManuscrito: string;
  assinatura: string;
  arquivoOriginais: string;
  totalOriginal: number;
  totalFinal: number;
}): void {
  const { dirManuscrito, assinatura, arquivoOriginais, totalOriginal, totalFinal } = entrada;
  const dirOriginais = path.join(dirManuscrito, arquivoOriginais);
  if (!existsSync(dirOriginais)) throw new Error(`rollback estrutural: originais ausentes em ${dirOriginais}`);
  const baseRevertido = path.join(dirManuscrito, "_edicoes", assinatura, "revertido");
  let dirRevertido = baseRevertido;
  for (let tentativa = 2; existsSync(dirRevertido) && readdirSync(dirRevertido).length > 0; tentativa++) {
    dirRevertido = `${baseRevertido}-${tentativa}`;
  }
  mkdirSync(dirRevertido, { recursive: true });

  for (let n = 1; n <= totalFinal; n++) {
    const atual = path.join(dirManuscrito, nomeCapitulo(n));
    if (existsSync(atual)) {
      const destino = path.join(dirRevertido, nomeCapitulo(n));
      if (existsSync(destino)) unlinkSync(destino);
      renameSync(atual, destino);
    }
  }
  for (let n = 1; n <= totalOriginal; n++) {
    const salvo = path.join(dirOriginais, nomeCapitulo(n));
    if (!existsSync(salvo)) throw new Error(`rollback estrutural: ${nomeCapitulo(n)} ausente no arquivo`);
    renameSync(salvo, path.join(dirManuscrito, nomeCapitulo(n)));
  }
  const manifesto = lerManifesto(dirManuscrito);
  manifesto.aplicados = manifesto.aplicados.filter((a) => a.assinatura !== assinatura);
  gravarManifestoAtomico(dirManuscrito, manifesto);
}

/** Utilitário de teste/inspeção: lista os capitulo-NN.md presentes, ordenados. */
export function listarCapitulos(dirManuscrito: string): string[] {
  if (!existsSync(dirManuscrito)) return [];
  return readdirSync(dirManuscrito)
    .filter((f) => /^capitulo-\d+\.md$/.test(f))
    .sort();
}
