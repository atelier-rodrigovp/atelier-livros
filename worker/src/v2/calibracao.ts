// Calibração reproduzível dos detectores/cotas da Engine V2.
//
// O corpus, os rótulos e os hashes são versionados. A derivação usa apenas o
// split "calibracao"; o split "holdout" só decide se a candidata pode avançar
// para o laboratório cego. Nenhuma cota é alterada automaticamente.

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { carregarContrato } from "./contrato.js";
import { ehSinalEscalar, normalizarNomeSinal } from "./revisor.js";
import { medirSinais, type SinalMedido } from "./sinais.js";

export const SCHEMA_CORPUS_CALIBRACAO = "calibration-corpus/v1" as const;
export const SCHEMA_ROTULOS_CALIBRACAO = "detector-labels/v1" as const;

export type SplitCalibracao = "calibracao" | "holdout";
export type RotuloOcorrencia = "violacao" | "legitima";
export type StatusRotulacao = "pendente_humano" | "validado_humano";

export interface AmostraCalibracao {
  id: string;
  skill: string;
  split: SplitCalibracao;
  classe: "aprovada" | "contraste";
  arquivo: string;
  sha256: string;
  origem: string;
  rotulos: {
    arquivo: string;
    status: StatusRotulacao;
    revisor?: string;
    revisado_em?: string;
    pacote_sha256?: string;
  };
}

export interface CorpusCalibracao {
  schema: typeof SCHEMA_CORPUS_CALIBRACAO;
  versao: string;
  descricao: string;
  amostras: AmostraCalibracao[];
}

export interface RotuloSinal {
  sinal: string;
  atestacao_humana?: {
    declaracao: string;
    revisor: string;
    revisado_em: string;
    pacote_sha256: string;
  };
  ocorrencias: {
    indice_detector: number;
    trecho: string;
    rotulo: RotuloOcorrencia;
    justificativa: string;
  }[];
  nao_detectadas: {
    trecho: string;
    justificativa: string;
  }[];
}

export interface RotulosAmostra {
  schema: typeof SCHEMA_ROTULOS_CALIBRACAO;
  amostra_id: string;
  texto_sha256: string;
  sinais: RotuloSinal[];
}

export interface MatrizBinaria {
  tp: number;
  fp: number;
  tn: number;
  fn: number;
  precisao: number;
  recall: number;
  f1: number;
  acuracia_balanceada: number;
}

export interface ResultadoSinalCalibrado {
  sinal: string;
  cota_ativa?: number;
  cota_candidata?: number;
  amostras_calibracao: number;
  amostras_holdout: number;
  detector: {
    tp: number;
    fp: number;
    fn: number;
    precisao: number;
    recall: number;
  };
  classificacao_calibracao?: MatrizBinaria;
  classificacao_holdout_ativa?: MatrizBinaria;
  classificacao_holdout_candidata?: MatrizBinaria;
  decisao: "promover_para_lab" | "manter_ativa" | "dados_insuficientes" | "rotulacao_pendente";
  motivos: string[];
}

export interface ResultadoSkillCalibracao {
  skill: string;
  contrato_versao: string;
  contrato_hash: string;
  sinais: ResultadoSinalCalibrado[];
  pronta_para_lab: boolean;
}

export interface ResultadoCalibracao {
  schema: "calibration-result/v1";
  corpus_versao: string;
  corpus_hash: string;
  skills: ResultadoSkillCalibracao[];
  pendencias: string[];
}

interface AmostraCarregada {
  meta: AmostraCalibracao;
  texto: string;
  sinais: SinalMedido[];
  rotulos: RotulosAmostra;
}

interface LinhaSinal {
  split: SplitCalibracao;
  bruto: number;
  positiva: boolean;
  tpDetector: number;
  fpDetector: number;
  fnDetector: number;
}

function sha256(texto: string): string {
  return createHash("sha256").update(texto, "utf8").digest("hex");
}

function jsonCanonico(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(jsonCanonico).join(",")}]`;
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    return `{${Object.keys(o).sort().map((k) => `${JSON.stringify(k)}:${jsonCanonico(o[k])}`).join(",")}}`;
  }
  return JSON.stringify(v);
}

function resolverRelativo(base: string, relativo: string, campo: string): string {
  if (path.isAbsolute(relativo)) throw new Error(`${campo}: caminho absoluto proibido (${relativo})`);
  const resolvido = path.resolve(base, relativo);
  const prefixo = path.resolve(base) + path.sep;
  if (!resolvido.startsWith(prefixo)) throw new Error(`${campo}: caminho escapa do corpus (${relativo})`);
  return resolvido;
}

function ehOcorrencia(s: SinalMedido): boolean {
  return typeof s.valor === "number" && s.sinal !== "gancho_final" && !ehSinalEscalar(s.sinal);
}

function normalizarTrecho(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

function validarRotulos(
  amostra: AmostraCalibracao,
  texto: string,
  sinais: SinalMedido[],
  rotulos: RotulosAmostra
): void {
  if (rotulos.schema !== SCHEMA_ROTULOS_CALIBRACAO) throw new Error(`${amostra.id}: schema de rótulos inválido`);
  if (rotulos.amostra_id !== amostra.id) throw new Error(`${amostra.id}: arquivo de rótulos aponta para ${rotulos.amostra_id}`);
  if (rotulos.texto_sha256 !== amostra.sha256) throw new Error(`${amostra.id}: hash dos rótulos difere do corpus`);
  if (amostra.rotulos.status === "validado_humano") {
    if (
      !amostra.rotulos.revisor?.trim() ||
      !amostra.rotulos.revisado_em ||
      !Number.isFinite(Date.parse(amostra.rotulos.revisado_em)) ||
      !/^[a-f0-9]{64}$/.test(amostra.rotulos.pacote_sha256 ?? "")
    ) {
      throw new Error(`${amostra.id}: validação humana sem revisor, data ou hash do pacote`);
    }
  }

  const medidos = sinais.filter(ehOcorrencia);
  for (const medido of medidos) {
    const candidatos = rotulos.sinais.filter(
      (r) => normalizarNomeSinal(r.sinal) === normalizarNomeSinal(medido.sinal)
    );
    if (candidatos.length !== 1) {
      throw new Error(`${amostra.id}: sinal ${medido.sinal} exige exatamente um bloco de rótulos`);
    }
    const bloco = candidatos[0];
    if (amostra.rotulos.status === "validado_humano") {
      const atestacao = bloco.atestacao_humana;
      if (
        !atestacao?.declaracao.trim() ||
        atestacao.revisor !== amostra.rotulos.revisor ||
        atestacao.revisado_em !== amostra.rotulos.revisado_em ||
        atestacao.pacote_sha256 !== amostra.rotulos.pacote_sha256
      ) {
        throw new Error(`${amostra.id}/${medido.sinal}: atestação humana ausente ou inconsistente`);
      }
    }
    const esperadas = medido.exemplos.map(normalizarTrecho);
    if (
      esperadas.length !== bloco.ocorrencias.length ||
      bloco.ocorrencias.some(
        (o, i) => o.indice_detector !== i + 1 || normalizarTrecho(o.trecho) !== esperadas[i]
      )
    ) {
      throw new Error(`${amostra.id}/${medido.sinal}: rótulos não cobrem exatamente as ocorrências do detector`);
    }
    for (const [i, o] of bloco.ocorrencias.entries()) {
      if ((o.rotulo !== "violacao" && o.rotulo !== "legitima") || !o.justificativa.trim()) {
        throw new Error(`${amostra.id}/${medido.sinal}: ocorrência ${i + 1} sem rótulo/justificativa`);
      }
    }
    for (const [i, perdida] of bloco.nao_detectadas.entries()) {
      if (!perdida.trecho.trim() || !perdida.justificativa.trim()) {
        throw new Error(`${amostra.id}/${medido.sinal}: não_detectada ${i + 1} incompleta`);
      }
      if (!normalizarTrecho(texto).includes(normalizarTrecho(perdida.trecho))) {
        throw new Error(`${amostra.id}/${medido.sinal}: não_detectada não existe literalmente no texto`);
      }
      if (esperadas.includes(normalizarTrecho(perdida.trecho))) {
        throw new Error(`${amostra.id}/${medido.sinal}: não_detectada já consta nas ocorrências do detector`);
      }
    }
  }
}

export function carregarCorpusCalibracao(dirCorpus: string): {
  corpus: CorpusCalibracao;
  amostras: AmostraCarregada[];
  corpusHash: string;
} {
  const manifestPath = path.join(dirCorpus, "corpus.json");
  const corpus = JSON.parse(readFileSync(manifestPath, "utf8")) as CorpusCalibracao;
  if (corpus.schema !== SCHEMA_CORPUS_CALIBRACAO) throw new Error(`schema de corpus inválido: ${String(corpus.schema)}`);
  if (!corpus.versao || !Array.isArray(corpus.amostras) || corpus.amostras.length === 0) {
    throw new Error("corpus sem versão ou amostras");
  }
  const ids = new Set<string>();
  const amostras: AmostraCarregada[] = [];
  for (const meta of corpus.amostras) {
    if (ids.has(meta.id)) throw new Error(`amostra duplicada: ${meta.id}`);
    ids.add(meta.id);
    const arquivo = resolverRelativo(dirCorpus, meta.arquivo, `${meta.id}.arquivo`);
    const rotulosPath = resolverRelativo(dirCorpus, meta.rotulos.arquivo, `${meta.id}.rotulos.arquivo`);
    const texto = readFileSync(arquivo, "utf8");
    const hash = sha256(texto);
    if (hash !== meta.sha256) throw new Error(`${meta.id}: hash divergente (manifesto ${meta.sha256}; arquivo ${hash})`);
    const contrato = carregarContrato(meta.skill);
    const sinais = medirSinais(texto, contrato.contrato);
    const rotulos = JSON.parse(readFileSync(rotulosPath, "utf8")) as RotulosAmostra;
    validarRotulos(meta, texto, sinais, rotulos);
    amostras.push({ meta, texto, sinais, rotulos });
  }
  return { corpus, amostras, corpusHash: sha256(jsonCanonico(corpus)) };
}

function matriz(linhas: LinhaSinal[], cota: number): MatrizBinaria {
  let tp = 0, fp = 0, tn = 0, fn = 0;
  for (const l of linhas) {
    const previu = l.bruto > cota;
    if (previu && l.positiva) tp++;
    else if (previu) fp++;
    else if (l.positiva) fn++;
    else tn++;
  }
  const precisao = tp + fp ? tp / (tp + fp) : 0;
  const recall = tp + fn ? tp / (tp + fn) : 0;
  const f1 = precisao + recall ? (2 * precisao * recall) / (precisao + recall) : 0;
  const tpr = recall;
  const tnr = tn + fp ? tn / (tn + fp) : 0;
  return { tp, fp, tn, fn, precisao, recall, f1, acuracia_balanceada: (tpr + tnr) / 2 };
}

function escolherCota(linhas: LinhaSinal[]): { cota?: number; matriz?: MatrizBinaria; motivo?: string } {
  const positivas = linhas.filter((l) => l.positiva).length;
  const negativas = linhas.length - positivas;
  if (linhas.length < 2 || positivas === 0 || negativas === 0) {
    return { motivo: "split de calibração precisa de ≥2 amostras e das duas classes" };
  }
  const max = Math.max(...linhas.map((l) => l.bruto), 0);
  const candidatas = Array.from({ length: max + 1 }, (_, cota) => ({ cota, matriz: matriz(linhas, cota) }))
    .filter((x) => x.matriz.recall >= 0.8)
    .sort((a, b) =>
      b.matriz.acuracia_balanceada - a.matriz.acuracia_balanceada ||
      b.matriz.precisao - a.matriz.precisao ||
      a.cota - b.cota
    );
  if (!candidatas.length) return { motivo: "nenhuma cota atingiu recall mínimo de 0,80 no split de calibração" };
  return candidatas[0];
}

function linhasPorSinal(amostras: AmostraCarregada[], sinal: string): LinhaSinal[] {
  return amostras.map((a) => {
    const medido = a.sinais.find((s) => normalizarNomeSinal(s.sinal) === normalizarNomeSinal(sinal))!;
    const bloco = a.rotulos.sinais.find((s) => normalizarNomeSinal(s.sinal) === normalizarNomeSinal(sinal))!;
    const tpDetector = bloco.ocorrencias.filter((o) => o.rotulo === "violacao").length;
    const fpDetector = bloco.ocorrencias.filter((o) => o.rotulo === "legitima").length;
    const fnDetector = bloco.nao_detectadas.length;
    return {
      split: a.meta.split,
      bruto: Number(medido.valor),
      positiva: tpDetector + fnDetector > 0,
      tpDetector,
      fpDetector,
      fnDetector,
    };
  });
}

export function analisarCalibracao(dirCorpus: string): ResultadoCalibracao {
  const { corpus, amostras, corpusHash } = carregarCorpusCalibracao(dirCorpus);
  const pendencias: string[] = [];
  const skills: ResultadoSkillCalibracao[] = [];

  for (const skill of [...new Set(amostras.map((a) => a.meta.skill))].sort()) {
    const contrato = carregarContrato(skill);
    const amostrasSkill = amostras.filter((a) => a.meta.skill === skill);
    const pendentes = amostrasSkill.filter((a) => a.meta.rotulos.status !== "validado_humano");
    const nomes = [...new Set(amostrasSkill.flatMap((a) => a.sinais.filter(ehOcorrencia).map((s) => s.sinal)))];
    const resultados: ResultadoSinalCalibrado[] = [];

    for (const sinal of nomes) {
      const medidoExemplo = amostrasSkill[0].sinais.find(
        (s) => normalizarNomeSinal(s.sinal) === normalizarNomeSinal(sinal)
      )!;
      const cotaAtiva = medidoExemplo.cota?.max;
      const motivos: string[] = [];
      if (pendentes.length > 0) {
        motivos.push(`rótulos humanos pendentes: ${pendentes.map((a) => a.meta.id).join(", ")}`);
        resultados.push({
          sinal,
          cota_ativa: cotaAtiva,
          amostras_calibracao: amostrasSkill.filter((a) => a.meta.split === "calibracao").length,
          amostras_holdout: amostrasSkill.filter((a) => a.meta.split === "holdout").length,
          detector: { tp: 0, fp: 0, fn: 0, precisao: 0, recall: 0 },
          decisao: "rotulacao_pendente",
          motivos,
        });
        continue;
      }

      const linhas = linhasPorSinal(amostrasSkill, sinal);
      const calibracao = linhas.filter((l) => l.split === "calibracao");
      const holdout = linhas.filter((l) => l.split === "holdout");
      const detectorTp = linhas.reduce((s, l) => s + l.tpDetector, 0);
      const detectorFp = linhas.reduce((s, l) => s + l.fpDetector, 0);
      const detectorFn = linhas.reduce((s, l) => s + l.fnDetector, 0);
      const detectorPrecisao = detectorTp + detectorFp ? detectorTp / (detectorTp + detectorFp) : 0;
      const detectorRecall = detectorTp + detectorFn ? detectorTp / (detectorTp + detectorFn) : 0;
      const escolhida = escolherCota(calibracao);

      if (holdout.length < 1) motivos.push("holdout vazio");
      if (escolhida.motivo) motivos.push(escolhida.motivo);
      const ativaHoldout = cotaAtiva != null && holdout.length ? matriz(holdout, cotaAtiva) : undefined;
      const candidataHoldout = escolhida.cota != null && holdout.length ? matriz(holdout, escolhida.cota) : undefined;
      let decisao: ResultadoSinalCalibrado["decisao"] = "dados_insuficientes";
      if (escolhida.cota != null && candidataHoldout) {
        const naoRegrediu = !ativaHoldout ||
          (candidataHoldout.f1 >= ativaHoldout.f1 && candidataHoldout.recall >= ativaHoldout.recall);
        if (candidataHoldout.precisao >= 0.75 && candidataHoldout.recall >= 0.8 && naoRegrediu) {
          decisao = escolhida.cota === cotaAtiva ? "manter_ativa" : "promover_para_lab";
        } else {
          decisao = "manter_ativa";
          if (candidataHoldout.precisao < 0.75) motivos.push("precisão no holdout abaixo de 0,75");
          if (candidataHoldout.recall < 0.8) motivos.push("recall no holdout abaixo de 0,80");
          if (!naoRegrediu) motivos.push("candidata regride F1/recall contra a cota ativa");
        }
      }

      resultados.push({
        sinal,
        cota_ativa: cotaAtiva,
        cota_candidata: escolhida.cota,
        amostras_calibracao: calibracao.length,
        amostras_holdout: holdout.length,
        detector: {
          tp: detectorTp,
          fp: detectorFp,
          fn: detectorFn,
          precisao: detectorPrecisao,
          recall: detectorRecall,
        },
        classificacao_calibracao: escolhida.matriz,
        classificacao_holdout_ativa: ativaHoldout,
        classificacao_holdout_candidata: candidataHoldout,
        decisao,
        motivos,
      });
    }

    if (pendentes.length) pendencias.push(`${skill}: ${pendentes.length} amostra(s) aguardam validação humana`);
    const pronta = resultados.length > 0 && resultados.every(
      (r) => r.decisao === "promover_para_lab" || r.decisao === "manter_ativa"
    );
    if (!pronta && !pendentes.length) pendencias.push(`${skill}: calibração/holdout insuficiente em ao menos um sinal`);
    skills.push({
      skill,
      contrato_versao: contrato.contrato.versao,
      contrato_hash: contrato.hash,
      sinais: resultados,
      pronta_para_lab: pronta,
    });
  }

  return {
    schema: "calibration-result/v1",
    corpus_versao: corpus.versao,
    corpus_hash: corpusHash,
    skills,
    pendencias,
  };
}
