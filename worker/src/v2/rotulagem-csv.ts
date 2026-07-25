// Ponte auditável entre o corpus versionado e uma revisão humana em planilha.
//
// A planilha não é fonte de verdade. Na importação, cada campo de identidade é
// confrontado com o corpus e cada ocorrência precisa continuar exatamente na
// posição produzida pelo detector. Só rótulos e justificativas humanas podem
// mudar; falsos negativos precisam citar literalmente o texto da amostra.

import { createHash } from "node:crypto";
import { cpSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  carregarCorpusCalibracao,
  type CorpusCalibracao,
  type RotuloOcorrencia,
  type RotulosAmostra,
} from "./calibracao.js";
import { ehSinalEscalar, normalizarNomeSinal } from "./revisor.js";

const COLUNAS = [
  "amostra_id",
  "skill",
  "split",
  "classe",
  "arquivo",
  "texto_sha256",
  "tipo",
  "sinal",
  "indice_detector",
  "trecho",
  "rotulo",
  "justificativa",
] as const;

const MARCADOR_JUSTIFICATIVA = "SUBSTITUIR POR JUSTIFICATIVA HUMANA ESPECÍFICA";
const MARCADOR_ATESTACAO = "SUBSTITUIR POR ATESTAÇÃO HUMANA DE REVISÃO INTEGRAL DESTE SINAL";

type Coluna = typeof COLUNAS[number];
type LinhaCsv = Record<Coluna, string>;

export interface FiltroExportacaoRotulos {
  amostra?: string;
  skill?: string;
  incluirValidadas?: boolean;
}

export interface ResultadoValidacaoRotulos {
  amostras: string[];
  ocorrencias: number;
  falsasNegativas: number;
  atestacoes: number;
  revisor: string;
  revisadoEm: string;
  pacoteSha256: string;
  corpusAtualizado: CorpusCalibracao;
  rotulosAtualizados: Map<string, RotulosAmostra>;
}

function normalizarTrecho(texto: string): string {
  return texto.replace(/\s+/g, " ").trim();
}

function ehSinalDeOcorrencia(sinal: { sinal: string; valor: unknown }): boolean {
  return typeof sinal.valor === "number" &&
    sinal.sinal !== "gancho_final" &&
    !ehSinalEscalar(sinal.sinal);
}

function escaparCsv(valor: string): string {
  if (!/[;"\r\n]/.test(valor)) return valor;
  return `"${valor.replace(/"/g, '""')}"`;
}

export function serializarCsv(linhas: LinhaCsv[]): string {
  const todas = [
    COLUNAS.join(";"),
    ...linhas.map((linha) => COLUNAS.map((coluna) => escaparCsv(linha[coluna])).join(";")),
  ];
  return "\uFEFF" + todas.join("\r\n") + "\r\n";
}

export function parsearCsv(conteudo: string): LinhaCsv[] {
  const texto = conteudo.replace(/^\uFEFF/, "");
  const registros: string[][] = [];
  let registro: string[] = [];
  let campo = "";
  let entreAspas = false;

  for (let i = 0; i < texto.length; i++) {
    const char = texto[i];
    if (entreAspas) {
      if (char === '"' && texto[i + 1] === '"') {
        campo += '"';
        i++;
      } else if (char === '"') {
        entreAspas = false;
      } else {
        campo += char;
      }
      continue;
    }
    if (char === '"') {
      if (campo.length > 0) throw new Error(`CSV inválido: aspas no meio do campo da linha ${registros.length + 1}`);
      entreAspas = true;
    } else if (char === ";") {
      registro.push(campo);
      campo = "";
    } else if (char === "\r" || char === "\n") {
      if (char === "\r" && texto[i + 1] === "\n") i++;
      registro.push(campo);
      campo = "";
      if (registro.some((valor) => valor.length > 0)) registros.push(registro);
      registro = [];
    } else {
      campo += char;
    }
  }
  if (entreAspas) throw new Error("CSV inválido: campo entre aspas não foi fechado");
  if (campo.length > 0 || registro.length > 0) {
    registro.push(campo);
    if (registro.some((valor) => valor.length > 0)) registros.push(registro);
  }
  const cabecalho = registros.shift();
  if (!cabecalho || cabecalho.join("\u0000") !== COLUNAS.join("\u0000")) {
    throw new Error(`cabeçalho CSV inválido; esperado: ${COLUNAS.join(";")}`);
  }
  return registros.map((valores, indice) => {
    if (valores.length !== COLUNAS.length) {
      throw new Error(`CSV inválido: linha ${indice + 2} tem ${valores.length} coluna(s), esperado ${COLUNAS.length}`);
    }
    return Object.fromEntries(COLUNAS.map((coluna, i) => [coluna, valores[i]])) as LinhaCsv;
  });
}

function linhaBase(
  meta: ReturnType<typeof carregarCorpusCalibracao>["amostras"][number]["meta"],
  tipo: string,
  sinal: string
): LinhaCsv {
  return {
    amostra_id: meta.id,
    skill: meta.skill,
    split: meta.split,
    classe: meta.classe,
    arquivo: meta.arquivo,
    texto_sha256: meta.sha256,
    tipo,
    sinal,
    indice_detector: "",
    trecho: "",
    rotulo: "",
    justificativa: "",
  };
}

export function exportarRotulosCsv(
  dirCorpus: string,
  filtro: FiltroExportacaoRotulos = {}
): { csv: string; amostras: number; ocorrencias: number; atestacoes: number } {
  const carregado = carregarCorpusCalibracao(dirCorpus);
  const amostras = carregado.amostras.filter((amostra) =>
    (!filtro.amostra || amostra.meta.id === filtro.amostra) &&
    (!filtro.skill || amostra.meta.skill === filtro.skill) &&
    (filtro.incluirValidadas || amostra.meta.rotulos.status === "pendente_humano")
  );
  if (amostras.length === 0) throw new Error("nenhuma amostra corresponde aos filtros de exportação");

  const linhas: LinhaCsv[] = [];
  let ocorrencias = 0;
  let atestacoes = 0;
  for (const amostra of amostras) {
    for (const medido of amostra.sinais.filter(ehSinalDeOcorrencia)) {
      const bloco = amostra.rotulos.sinais.find(
        (item) => normalizarNomeSinal(item.sinal) === normalizarNomeSinal(medido.sinal)
      );
      if (!bloco) throw new Error(`${amostra.meta.id}/${medido.sinal}: bloco de rótulos ausente`);
      for (const ocorrencia of bloco.ocorrencias) {
        const linha = linhaBase(amostra.meta, "detectada", medido.sinal);
        linha.indice_detector = String(ocorrencia.indice_detector);
        linha.trecho = ocorrencia.trecho;
        linha.rotulo = ocorrencia.rotulo;
        linha.justificativa = MARCADOR_JUSTIFICATIVA;
        linhas.push(linha);
        ocorrencias++;
      }
      for (const perdida of bloco.nao_detectadas) {
        const linha = linhaBase(amostra.meta, "nao_detectada", medido.sinal);
        linha.trecho = perdida.trecho;
        linha.rotulo = "violacao";
        linha.justificativa = perdida.justificativa;
        linhas.push(linha);
      }
      const atestacao = linhaBase(amostra.meta, "atestacao", medido.sinal);
      atestacao.rotulo = "validado";
      atestacao.justificativa = MARCADOR_ATESTACAO;
      linhas.push(atestacao);
      atestacoes++;
    }
  }
  return { csv: serializarCsv(linhas), amostras: amostras.length, ocorrencias, atestacoes };
}

function validarJustificativa(valor: string, contexto: string): string {
  const limpa = valor.trim();
  if (
    limpa.length < 12 ||
    limpa === MARCADOR_JUSTIFICATIVA ||
    limpa === MARCADOR_ATESTACAO ||
    /PR[ÉE]-?R[ÓO]TULO|AUTOM[AÁ]TIC[OA]|SUBSTITUIR/i.test(limpa)
  ) {
    throw new Error(`${contexto}: justificativa humana específica ausente`);
  }
  return limpa;
}

function chaveOcorrencia(amostra: string, sinal: string, indice: number): string {
  return `${amostra}\u0000${normalizarNomeSinal(sinal)}\u0000${indice}`;
}

function validarIdentidade(linha: LinhaCsv, meta: CorpusCalibracao["amostras"][number], numero: number): void {
  const fixos: [Coluna, string][] = [
    ["skill", meta.skill],
    ["split", meta.split],
    ["classe", meta.classe],
    ["arquivo", meta.arquivo],
    ["texto_sha256", meta.sha256],
  ];
  for (const [coluna, esperado] of fixos) {
    if (linha[coluna] !== esperado) {
      throw new Error(`${meta.id}: linha ${numero} alterou ${coluna}; esperado "${esperado}"`);
    }
  }
}

export function validarRotulosCsv(
  dirCorpus: string,
  conteudo: string,
  revisor: string,
  revisadoEm = new Date().toISOString()
): ResultadoValidacaoRotulos {
  const nomeRevisor = revisor.trim();
  if (nomeRevisor.length < 3) throw new Error("informe o nome do revisor humano (mínimo de 3 caracteres)");
  if (!Number.isFinite(Date.parse(revisadoEm))) throw new Error("data de revisão inválida");
  const pacoteSha256 = createHash("sha256").update(conteudo, "utf8").digest("hex");

  const carregado = carregarCorpusCalibracao(dirCorpus);
  const linhas = parsearCsv(conteudo);
  if (linhas.length === 0) throw new Error("planilha de rótulos vazia");
  const metas = new Map(carregado.corpus.amostras.map((meta) => [meta.id, meta]));
  const idsImportados = new Set(linhas.map((linha) => linha.amostra_id));
  if (idsImportados.has("")) throw new Error("há linha sem amostra_id");

  const rotulosAtualizados = new Map<string, RotulosAmostra>();
  let totalOcorrencias = 0;
  let totalFalsasNegativas = 0;
  let totalAtestacoes = 0;

  for (const id of [...idsImportados].sort()) {
    const meta = metas.get(id);
    const amostra = carregado.amostras.find((item) => item.meta.id === id);
    if (!meta || !amostra) throw new Error(`amostra desconhecida na planilha: ${id}`);
    if (meta.rotulos.status === "validado_humano") {
      throw new Error(`${id}: amostra já está validada; a importação não pode sobrescrevê-la`);
    }
    const linhasAmostra = linhas.filter((linha) => linha.amostra_id === id);
    linhasAmostra.forEach((linha, indice) => validarIdentidade(linha, meta, indice + 2));
    const sinaisMedidos = amostra.sinais.filter(ehSinalDeOcorrencia);
    const nomesSinais = new Set(sinaisMedidos.map((sinal) => sinal.sinal));

    for (const linha of linhasAmostra) {
      if (!nomesSinais.has(linha.sinal)) {
        throw new Error(`${id}: sinal desconhecido na planilha: ${linha.sinal}`);
      }
      if (!["detectada", "nao_detectada", "atestacao"].includes(linha.tipo)) {
        throw new Error(`${id}/${linha.sinal}: tipo inválido "${linha.tipo}"`);
      }
    }

    const novosSinais = sinaisMedidos.map((medido) => {
      const sinalNormalizado = normalizarNomeSinal(medido.sinal);
      const blocoOriginal = amostra.rotulos.sinais.find(
        (item) => normalizarNomeSinal(item.sinal) === sinalNormalizado
      )!;
      const linhasSinal = linhasAmostra.filter(
        (linha) => normalizarNomeSinal(linha.sinal) === sinalNormalizado
      );
      const detectadas = linhasSinal.filter((linha) => linha.tipo === "detectada");
      const atestacoes = linhasSinal.filter((linha) => linha.tipo === "atestacao");
      const perdidas = linhasSinal.filter((linha) => linha.tipo === "nao_detectada");
      if (atestacoes.length !== 1) {
        throw new Error(`${id}/${medido.sinal}: exige exatamente uma atestação de busca por falsos negativos`);
      }
      const atestacao = atestacoes[0];
      if (
        atestacao.rotulo !== "validado" ||
        atestacao.indice_detector ||
        atestacao.trecho
      ) {
        throw new Error(`${id}/${medido.sinal}: atestação foi estruturalmente alterada`);
      }
      const declaracao = validarJustificativa(
        atestacao.justificativa,
        `${id}/${medido.sinal}/atestação`
      );
      totalAtestacoes++;

      if (detectadas.length !== blocoOriginal.ocorrencias.length) {
        throw new Error(
          `${id}/${medido.sinal}: planilha tem ${detectadas.length} ocorrência(s), detector exige ${blocoOriginal.ocorrencias.length}`
        );
      }
      const vistas = new Set<string>();
      const ocorrencias = blocoOriginal.ocorrencias.map((original) => {
        const chave = chaveOcorrencia(id, medido.sinal, original.indice_detector);
        const candidatas = detectadas.filter(
          (linha) => chaveOcorrencia(id, linha.sinal, Number(linha.indice_detector)) === chave
        );
        if (candidatas.length !== 1 || vistas.has(chave)) {
          throw new Error(`${id}/${medido.sinal}: ocorrência ${original.indice_detector} ausente ou duplicada`);
        }
        vistas.add(chave);
        const linha = candidatas[0];
        if (linha.indice_detector !== String(original.indice_detector)) {
          throw new Error(`${id}/${medido.sinal}: índice da ocorrência ${original.indice_detector} foi alterado`);
        }
        if (linha.trecho !== original.trecho) {
          throw new Error(`${id}/${medido.sinal}: trecho da ocorrência ${original.indice_detector} foi alterado`);
        }
        if (linha.rotulo !== "violacao" && linha.rotulo !== "legitima") {
          throw new Error(`${id}/${medido.sinal}: rótulo inválido na ocorrência ${original.indice_detector}`);
        }
        totalOcorrencias++;
        return {
          indice_detector: original.indice_detector,
          trecho: original.trecho,
          rotulo: linha.rotulo as RotuloOcorrencia,
          justificativa: validarJustificativa(
            linha.justificativa,
            `${id}/${medido.sinal}/ocorrência ${original.indice_detector}`
          ),
        };
      });

      const trechosDetectados = new Set(blocoOriginal.ocorrencias.map((item) => normalizarTrecho(item.trecho)));
      const trechosPerdidos = new Set<string>();
      const naoDetectadas = perdidas.map((linha, indice) => {
        if (linha.indice_detector || linha.rotulo !== "violacao") {
          throw new Error(`${id}/${medido.sinal}: não_detectada ${indice + 1} foi estruturalmente alterada`);
        }
        const trecho = linha.trecho.trim();
        const trechoNormalizado = normalizarTrecho(trecho);
        if (!trechoNormalizado || !normalizarTrecho(amostra.texto).includes(trechoNormalizado)) {
          throw new Error(`${id}/${medido.sinal}: não_detectada ${indice + 1} não existe literalmente no texto`);
        }
        if (trechosDetectados.has(trechoNormalizado) || trechosPerdidos.has(trechoNormalizado)) {
          throw new Error(`${id}/${medido.sinal}: não_detectada ${indice + 1} já foi registrada`);
        }
        trechosPerdidos.add(trechoNormalizado);
        totalFalsasNegativas++;
        return {
          trecho,
          justificativa: validarJustificativa(
            linha.justificativa,
            `${id}/${medido.sinal}/não_detectada ${indice + 1}`
          ),
        };
      });
      return {
        sinal: blocoOriginal.sinal,
        atestacao_humana: {
          declaracao,
          revisor: nomeRevisor,
          revisado_em: revisadoEm,
          pacote_sha256: pacoteSha256,
        },
        ocorrencias,
        nao_detectadas: naoDetectadas,
      };
    });

    rotulosAtualizados.set(id, {
      schema: amostra.rotulos.schema,
      amostra_id: id,
      texto_sha256: amostra.rotulos.texto_sha256,
      sinais: novosSinais,
    });
  }

  const corpusAtualizado: CorpusCalibracao = structuredClone(carregado.corpus);
  for (const meta of corpusAtualizado.amostras) {
    if (!rotulosAtualizados.has(meta.id)) continue;
    meta.rotulos.status = "validado_humano";
    meta.rotulos.revisor = nomeRevisor;
    meta.rotulos.revisado_em = revisadoEm;
    meta.rotulos.pacote_sha256 = pacoteSha256;
  }
  return {
    amostras: [...rotulosAtualizados.keys()].sort(),
    ocorrencias: totalOcorrencias,
    falsasNegativas: totalFalsasNegativas,
    atestacoes: totalAtestacoes,
    revisor: nomeRevisor,
    revisadoEm,
    pacoteSha256,
    corpusAtualizado,
    rotulosAtualizados,
  };
}

function resolverDentroDoCorpus(dirCorpus: string, relativo: string): string {
  const base = path.resolve(dirCorpus);
  const destino = path.resolve(base, relativo);
  if (!destino.startsWith(base + path.sep)) throw new Error(`caminho escapa do corpus: ${relativo}`);
  return destino;
}

export function aplicarRotulosValidados(
  dirCorpus: string,
  resultado: ResultadoValidacaoRotulos
): void {
  const base = path.resolve(dirCorpus);
  const staging = mkdtempSync(path.join(tmpdir(), "rotulagem-v2-validacao-"));
  try {
    cpSync(base, staging, { recursive: true });
    for (const [id, rotulos] of resultado.rotulosAtualizados) {
      const meta = resultado.corpusAtualizado.amostras.find((item) => item.id === id)!;
      writeFileSync(
        resolverDentroDoCorpus(staging, meta.rotulos.arquivo),
        JSON.stringify(rotulos, null, 2) + "\n",
        "utf8"
      );
    }
    writeFileSync(path.join(staging, "corpus.json"), JSON.stringify(resultado.corpusAtualizado, null, 2) + "\n", "utf8");
    carregarCorpusCalibracao(staging);

    const temporarios: { temporario: string; destino: string }[] = [];
    for (const [id, rotulos] of resultado.rotulosAtualizados) {
      const meta = resultado.corpusAtualizado.amostras.find((item) => item.id === id)!;
      const destino = resolverDentroDoCorpus(base, meta.rotulos.arquivo);
      const temporario = `${destino}.rotulagem.tmp`;
      writeFileSync(temporario, JSON.stringify(rotulos, null, 2) + "\n", "utf8");
      temporarios.push({ temporario, destino });
    }
    const corpusDestino = path.join(base, "corpus.json");
    const corpusTemporario = `${corpusDestino}.rotulagem.tmp`;
    writeFileSync(corpusTemporario, JSON.stringify(resultado.corpusAtualizado, null, 2) + "\n", "utf8");

    // O manifesto é promovido por último: uma falha intermediária mantém a
    // calibração fechada, ainda com status pendente_humano.
    for (const arquivo of temporarios) renameSync(arquivo.temporario, arquivo.destino);
    renameSync(corpusTemporario, corpusDestino);
    carregarCorpusCalibracao(base);
  } finally {
    rmSync(staging, { recursive: true, force: true });
  }
}

export const INSTRUCOES_ROTULAGEM = {
  marcadorJustificativa: MARCADOR_JUSTIFICATIVA,
  marcadorAtestacao: MARCADOR_ATESTACAO,
  colunas: COLUNAS,
} as const;
