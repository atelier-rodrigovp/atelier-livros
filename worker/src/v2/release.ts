// Certificação técnica da Engine V2.
//
// O laboratório e os canários produzem evidência, mas não ativam produção por
// si. Fundação e escrita só podem usar uma skill quando este certificado casa
// com os contratos e com o corpus calibrado presentes no checkout atual.

import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { hashText } from "../quality-state.js";
import { analisarCalibracao, type ResultadoCalibracao } from "./calibracao.js";
import { MODELOS_V2_FIXOS } from "./config.js";
import { carregarContrato } from "./contrato.js";
import { hashJsonCanonico } from "./hash.js";
import { falhasAvaliacaoCega, type RelatorioLab } from "./lab/relatorio.js";
import { ordenarAmostrasCegas, type AvaliacaoCega } from "./lab/avaliar.js";
import type { ExecucaoLab } from "./lab/rodar.js";
import { ENGINE_V2_VERSION, ErroEngine, type MapaModelos } from "./tipos.js";

export const SCHEMA_CERTIFICADO_RELEASE_V2 = "engine-v2-release/v2" as const;
export const SCHEMA_AVALIACAO_HUMANA_RELEASE = "human-blind-evaluation/v1" as const;

export interface AvaliacaoHumanaRelease {
  schema: typeof SCHEMA_AVALIACAO_HUMANA_RELEASE;
  lab_execucao_id: string;
  job_id?: string;
  por: string;
  em: string;
  palpites: Record<string, string>;
  gabarito: Record<string, string>;
}

export interface CertificadoReleaseV2 {
  schema: typeof SCHEMA_CERTIFICADO_RELEASE_V2;
  status: "certificado";
  engine_version: string;
  runtime_hash: string;
  emitido_por: string;
  emitido_em: string;
  codigo_commit: string;
  modelos: MapaModelos;
  skills: { id: string; versao: string; hash: string }[];
  calibracao: {
    corpus_versao: string;
    corpus_hash: string;
  };
  canarios: {
    evidencia_hash: string;
    capitulos_por_skill: Record<string, number>;
  };
  laboratorio: {
    execucao_id: string;
    execucao_hash: string;
    avaliacao_automatica_hash: string;
    relatorio_hash: string;
  };
  avaliacao_humana: {
    evidencia_hash: string;
    por: string;
    em: string;
    acertos: number;
    total: number;
    distinguibilidade: number;
  };
}

interface CapituloFinalCanario {
  capitulo?: number;
  status?: string;
  text_hash?: string;
  review_id?: string | null;
  hash_confere?: boolean;
}

interface RelatorioCanario {
  erro?: string;
  skill?: { id?: string; versao?: string; hash?: string } | string;
  aprovados_plenos?: number;
  total_capitulos?: number;
  criterio_3de3?: boolean;
  capitulos_estado_final?: CapituloFinalCanario[];
  modelos?: MapaModelos;
}

export interface EvidenciasParaCertificar {
  canarios: unknown;
  execucaoLab: ExecucaoLab;
  avaliacaoAutomatica: AvaliacaoCega;
  relatorioLab: RelatorioLab;
  avaliacaoHumana: AvaliacaoHumanaRelease;
  calibracao: ResultadoCalibracao;
  emitidoPor: string;
  emitidoEm: string;
  codigoCommit: string;
  hashes: {
    canarios: string;
    execucaoLab: string;
    avaliacaoAutomatica: string;
    relatorioLab: string;
    avaliacaoHumana: string;
  };
}

export interface EstadoAtualRelease {
  engineVersion: string;
  runtimeHash: string;
  modelos: MapaModelos;
  skills: { id: string; versao: string; hash: string }[];
  calibracao: {
    corpusVersao: string;
    corpusHash: string;
    prontaPorSkill: Record<string, boolean>;
    pendencias: string[];
  };
}

function skillDoCanario(relatorio: RelatorioCanario): string {
  return typeof relatorio.skill === "string" ? relatorio.skill : relatorio.skill?.id ?? "";
}

function mapaModelosIgual(a: Partial<MapaModelos> | null | undefined, b: MapaModelos): boolean {
  return !!a &&
    a.raciocinio === b.raciocinio &&
    a.fatos === b.fatos &&
    a.prosa === b.prosa &&
    a.julgamento === b.julgamento &&
    Object.keys(a).length === 4;
}

function validarCanarios(
  bruto: unknown,
  skills: EstadoAtualRelease["skills"],
  modelos: MapaModelos
): { erros: string[]; capitulosPorSkill: Record<string, number> } {
  const erros: string[] = [];
  const capitulosPorSkill: Record<string, number> = {};
  if (!Array.isArray(bruto)) {
    return { erros: ["canários: resumo precisa ser um array"], capitulosPorSkill };
  }
  for (const skill of skills) {
    const encontrados = (bruto as RelatorioCanario[]).filter((item) => skillDoCanario(item) === skill.id);
    if (encontrados.length !== 1) {
      erros.push(`canários/${skill.id}: exige exatamente um relatório, encontrou ${encontrados.length}`);
      continue;
    }
    const rel = encontrados[0];
    if (!mapaModelosIgual(rel.modelos, modelos)) {
      erros.push(`canários/${skill.id}: modelos não correspondem aos pins do release`);
    }
    const skillMeta = typeof rel.skill === "object" ? rel.skill : undefined;
    if (rel.erro) erros.push(`canários/${skill.id}: ${rel.erro}`);
    if (skillMeta?.versao !== skill.versao || skillMeta?.hash !== skill.hash) {
      erros.push(`canários/${skill.id}: contrato não corresponde ao checkout atual`);
    }
    const total = Number(rel.total_capitulos ?? 0);
    const caps = Array.isArray(rel.capitulos_estado_final) ? rel.capitulos_estado_final : [];
    if (!Number.isInteger(total) || total < 2) {
      erros.push(`canários/${skill.id}: exige ao menos 2 capítulos`);
    }
    if (
      rel.criterio_3de3 !== true ||
      rel.aprovados_plenos !== total ||
      caps.length !== total ||
      caps.some((cap) =>
        cap.status !== "aprovado" ||
        cap.hash_confere !== true ||
        !/^[0-9a-f]{64}$/.test(cap.text_hash ?? "") ||
        !cap.review_id?.trim()
      )
    ) {
      erros.push(`canários/${skill.id}: capítulos não estão 100% aprovados plenos e hash-bound`);
    }
    capitulosPorSkill[skill.id] = total;
  }
  const extras = (bruto as RelatorioCanario[])
    .map(skillDoCanario)
    .filter((id) => id && !skills.some((skill) => skill.id === id));
  if (extras.length) erros.push(`canários: skills inesperadas (${[...new Set(extras)].join(", ")})`);
  return { erros, capitulosPorSkill };
}

function validarLaboratorio(
  execucao: ExecucaoLab,
  avaliacao: AvaliacaoCega,
  relatorio: RelatorioLab,
  skills: EstadoAtualRelease["skills"],
  corpusHash: string,
  modelos: MapaModelos
): string[] {
  const erros: string[] = [];
  if (execucao.engineVersion !== ENGINE_V2_VERSION) erros.push("laboratório: engine_version divergente");
  if (!mapaModelosIgual(execucao.modelos, modelos)) {
    erros.push("laboratório: modelos não correspondem aos pins do release");
  }
  const idCalculado = hashJsonCanonico({
    modelos: execucao.modelos,
    amostras: execucao.amostras.map((amostra) => ({
      skill: amostra.skillId,
      categoria: amostra.categoria,
      texto: amostra.textoHash,
    })),
  }).slice(0, 12);
  if (execucao.id !== idCalculado) erros.push("laboratório: id da execução não corresponde ao conteúdo");
  if (execucao.id !== avaliacao.labExecucaoId || execucao.id !== relatorio.execucaoId) {
    erros.push("laboratório: execução, avaliação e relatório não apontam para o mesmo id");
  }
  const idsAmostras = new Set<string>();
  const hashesAmostras = new Set<string>();
  for (const amostra of execucao.amostras) {
    if (idsAmostras.has(amostra.id)) erros.push(`laboratório: amostra duplicada ${amostra.id}`);
    if (hashesAmostras.has(amostra.textoHash)) erros.push(`laboratório: texto duplicado ${amostra.textoHash}`);
    idsAmostras.add(amostra.id);
    hashesAmostras.add(amostra.textoHash);
    const skill = skills.find((item) => item.id === amostra.skillId);
    if (!skill || amostra.skillVersao !== skill.versao || amostra.contratoHash !== skill.hash) {
      erros.push(`laboratório/${amostra.id}: contrato da amostra diverge`);
    }
    if (!amostra.texto.trim() || hashText(amostra.texto) !== amostra.textoHash) {
      erros.push(`laboratório/${amostra.id}: texto vazio ou hash adulterado`);
    }
    if (!amostra.runId?.trim()) erros.push(`laboratório/${amostra.id}: run_id ausente`);
    if (
      amostra.modeloSolicitado !== modelos.prosa ||
      amostra.modeloExecutado !== modelos.prosa
    ) {
      erros.push(`laboratório/${amostra.id}: escritor não executou no modelo de prosa fixo`);
    }
    for (const gate of amostra.gates.filter((item) => !item.passou)) {
      erros.push(`laboratório/${amostra.id}: gate ${gate.gate} falhou`);
    }
  }
  for (const skill of skills) {
    const meta = execucao.skills.find((item) => item.id === skill.id);
    if (!meta || meta.versao !== skill.versao || meta.hash !== skill.hash) {
      erros.push(`laboratório/${skill.id}: contrato não corresponde ao checkout atual`);
    }
    const amostras = execucao.amostras.filter((item) => item.skillId === skill.id);
    if (amostras.length < 3) erros.push(`laboratório/${skill.id}: exige ao menos 3 amostras`);
  }
  if (execucao.skills.length !== skills.length) erros.push("laboratório: conjunto de skills difere do certificado");
  if (avaliacao.porAmostra.length !== execucao.amostras.length) {
    erros.push("laboratório/cego: avaliação não cobre todas as amostras");
  }
  if (avaliacao.modeloAvaliador !== modelos.julgamento) {
    erros.push("laboratório/cego: avaliador solicitado não corresponde ao modelo de julgamento fixo");
  }
  const avaliadas = new Set<string>();
  for (const item of avaliacao.porAmostra) {
    const amostra = execucao.amostras.find((candidata) => candidata.id === item.amostraId);
    if (!amostra || avaliadas.has(item.amostraId)) {
      erros.push(`laboratório/cego: amostra ausente ou duplicada ${item.amostraId}`);
      continue;
    }
    avaliadas.add(item.amostraId);
    if (
      item.skillReal !== amostra.skillId ||
      item.acertou !== (item.skillAdivinhada === amostra.skillId)
    ) {
      erros.push(`laboratório/cego/${item.amostraId}: skillReal/acertou inconsistente`);
    }
    if (!skills.some((skill) => skill.id === item.skillAdivinhada)) {
      erros.push(`laboratório/cego/${item.amostraId}: palpite fora das skills`);
    }
    if (item.modeloExecutado !== modelos.julgamento) {
      erros.push(`laboratório/cego/${item.amostraId}: avaliador não executou no modelo de julgamento fixo`);
    }
    if (
      !item.runId?.trim() ||
      !item.saidaBruta?.trim() ||
      item.saidaBrutaHash !== hashJsonCanonico(item.saidaBruta)
    ) {
      erros.push(`laboratório/cego/${item.amostraId}: saída bruta ausente ou hash adulterado`);
    }
    if (
      item.aderencia < 0 ||
      item.aderencia > 5 ||
      Object.values(item.notas).some((nota) => nota < 0 || nota > 5)
    ) {
      erros.push(`laboratório/cego/${item.amostraId}: notas fora de 0-5`);
    }
  }
  if (relatorio.decisao !== "aprovar") erros.push(`laboratório: decisão automática é ${relatorio.decisao}`);
  if (!relatorio.calibracao?.pronta || relatorio.calibracao.corpusHash !== corpusHash) {
    erros.push("laboratório: calibração ausente, pendente ou com hash divergente");
  }
  if (relatorio.falhasCalibracao?.length) erros.push(...relatorio.falhasCalibracao.map((item) => `laboratório/calibração: ${item}`));
  if (relatorio.regressoes?.length) erros.push(...relatorio.regressoes.map((item) => `laboratório/regressão: ${item}`));
  if (relatorio.vazamentos?.length) erros.push(...relatorio.vazamentos.map((item) => `laboratório/vazamento: ${item}`));
  erros.push(...falhasAvaliacaoCega(avaliacao).map((item) => `laboratório/cego: ${item}`));
  return erros;
}

function validarHumana(
  evidencia: AvaliacaoHumanaRelease,
  execucao: ExecucaoLab,
  skills: string[]
): { erros: string[]; acertos: number; total: number; distinguibilidade: number } {
  const erros: string[] = [];
  if (evidencia.schema !== SCHEMA_AVALIACAO_HUMANA_RELEASE) erros.push("avaliação humana: schema inválido");
  if (evidencia.lab_execucao_id !== execucao.id) erros.push("avaliação humana: lab_execucao_id divergente");
  if (evidencia.por.trim().length < 3) erros.push("avaliação humana: revisor ausente");
  if (!Number.isFinite(Date.parse(evidencia.em))) erros.push("avaliação humana: data inválida");

  const esperadas = ordenarAmostrasCegas(execucao).amostras.map((amostra, indice) => ({
    id: `A-${String(indice + 1).padStart(2, "0")}-${amostra.textoHash.slice(0, 12)}`,
    skill: amostra.skillId,
  }));
  const idsEsperados = new Set(esperadas.map((item) => item.id));
  const idsPalpites = Object.keys(evidencia.palpites ?? {});
  const idsGabarito = Object.keys(evidencia.gabarito ?? {});
  if (
    idsPalpites.length !== esperadas.length ||
    idsGabarito.length !== esperadas.length ||
    idsPalpites.some((id) => !idsEsperados.has(id)) ||
    idsGabarito.some((id) => !idsEsperados.has(id))
  ) {
    erros.push("avaliação humana: amostras ausentes, extras ou duplicadas");
  }
  let acertos = 0;
  for (const esperada of esperadas) {
    const gabarito = evidencia.gabarito?.[esperada.id];
    const palpite = evidencia.palpites?.[esperada.id];
    if (gabarito !== esperada.skill) erros.push(`avaliação humana/${esperada.id}: gabarito adulterado`);
    if (!skills.includes(palpite)) erros.push(`avaliação humana/${esperada.id}: palpite inválido`);
    if (palpite === esperada.skill) acertos++;
  }
  const total = esperadas.length;
  const distinguibilidade = total ? acertos / total : 0;
  if (distinguibilidade < 0.8) {
    erros.push(`avaliação humana: distinguibilidade ${(distinguibilidade * 100).toFixed(1)}% abaixo de 80%`);
  }
  return { erros, acertos, total, distinguibilidade };
}

export function estadoAtualRelease(
  skillsIds: string[],
  calibracao: ResultadoCalibracao,
  workerDir = workerDirPadrao()
): EstadoAtualRelease {
  const skills = skillsIds.map((id) => {
    const contrato = carregarContrato(id);
    return { id, versao: contrato.contrato.versao, hash: contrato.hash };
  });
  const prontaPorSkill = Object.fromEntries(
    skillsIds.map((id) => [id, calibracao.skills.find((skill) => skill.skill === id)?.pronta_para_lab === true])
  );
  return {
    engineVersion: ENGINE_V2_VERSION,
    runtimeHash: calcularHashRuntimeV2(workerDir),
    modelos: { ...MODELOS_V2_FIXOS },
    skills,
    calibracao: {
      corpusVersao: calibracao.corpus_versao,
      corpusHash: calibracao.corpus_hash,
      prontaPorSkill,
      pendencias: calibracao.pendencias,
    },
  };
}

export function criarCertificadoRelease(
  evidencias: EvidenciasParaCertificar,
  estado: EstadoAtualRelease
): CertificadoReleaseV2 {
  const erros: string[] = [];
  if (evidencias.emitidoPor.trim().length < 3) erros.push("emissor do certificado ausente");
  if (!Number.isFinite(Date.parse(evidencias.emitidoEm))) erros.push("data de emissão inválida");
  if (!/^[0-9a-f]{40}$/.test(evidencias.codigoCommit)) erros.push("codigo_commit precisa ser SHA-1 Git completo");
  if (estado.engineVersion !== ENGINE_V2_VERSION) erros.push("engine version atual inválida");
  if (estado.calibracao.pendencias.length > 0 || Object.values(estado.calibracao.prontaPorSkill).some((pronta) => !pronta)) {
    erros.push(...(estado.calibracao.pendencias.length
      ? estado.calibracao.pendencias.map((item) => `calibração: ${item}`)
      : ["calibração: uma ou mais skills não estão prontas"]));
  }
  if (
    evidencias.calibracao.corpus_hash !== estado.calibracao.corpusHash ||
    evidencias.calibracao.corpus_versao !== estado.calibracao.corpusVersao
  ) {
    erros.push("calibração: resultado fornecido não corresponde ao estado atual");
  }

  if (!mapaModelosIgual(estado.modelos, MODELOS_V2_FIXOS)) {
    erros.push("mapa de modelos atual diverge dos pins compilados");
  }
  const canarios = validarCanarios(evidencias.canarios, estado.skills, estado.modelos);
  erros.push(...canarios.erros);
  erros.push(...validarLaboratorio(
    evidencias.execucaoLab,
    evidencias.avaliacaoAutomatica,
    evidencias.relatorioLab,
    estado.skills,
    estado.calibracao.corpusHash,
    estado.modelos
  ));
  const humana = validarHumana(
    evidencias.avaliacaoHumana,
    evidencias.execucaoLab,
    estado.skills.map((skill) => skill.id)
  );
  erros.push(...humana.erros);
  for (const [nome, hash] of Object.entries(evidencias.hashes)) {
    if (!/^[0-9a-f]{64}$/.test(hash)) erros.push(`hash de evidência inválido: ${nome}`);
  }
  if (erros.length) {
    throw new Error(`release V2 não certificável:\n- ${[...new Set(erros)].join("\n- ")}`);
  }

  return {
    schema: SCHEMA_CERTIFICADO_RELEASE_V2,
    status: "certificado",
    engine_version: estado.engineVersion,
    runtime_hash: estado.runtimeHash,
    emitido_por: evidencias.emitidoPor.trim(),
    emitido_em: evidencias.emitidoEm,
    codigo_commit: evidencias.codigoCommit,
    modelos: { ...estado.modelos },
    skills: estado.skills,
    calibracao: {
      corpus_versao: estado.calibracao.corpusVersao,
      corpus_hash: estado.calibracao.corpusHash,
    },
    canarios: {
      evidencia_hash: evidencias.hashes.canarios,
      capitulos_por_skill: canarios.capitulosPorSkill,
    },
    laboratorio: {
      execucao_id: evidencias.execucaoLab.id,
      execucao_hash: evidencias.hashes.execucaoLab,
      avaliacao_automatica_hash: evidencias.hashes.avaliacaoAutomatica,
      relatorio_hash: evidencias.hashes.relatorioLab,
    },
    avaliacao_humana: {
      evidencia_hash: evidencias.hashes.avaliacaoHumana,
      por: evidencias.avaliacaoHumana.por,
      em: evidencias.avaliacaoHumana.em,
      acertos: humana.acertos,
      total: humana.total,
      distinguibilidade: humana.distinguibilidade,
    },
  };
}

export function validarCertificadoContraEstado(
  certificado: CertificadoReleaseV2,
  estado: EstadoAtualRelease,
  skillId?: string
): string[] {
  const erros: string[] = [];
  if (certificado.schema !== SCHEMA_CERTIFICADO_RELEASE_V2 || certificado.status !== "certificado") {
    return ["certificado ausente ou com schema/status inválido"];
  }
  if (certificado.engine_version !== estado.engineVersion) erros.push("versão da engine mudou após certificação");
  if (certificado.runtime_hash !== estado.runtimeHash) erros.push("código do runtime mudou após certificação");
  if (!mapaModelosIgual(certificado.modelos, estado.modelos)) {
    erros.push("modelos fixos mudaram após certificação");
  }
  if (!/^[0-9a-f]{40}$/.test(certificado.codigo_commit)) erros.push("commit certificado inválido");
  if (certificado.emitido_por?.trim().length < 3 || !Number.isFinite(Date.parse(certificado.emitido_em))) {
    erros.push("emissor ou data do certificado inválidos");
  }
  if (
    certificado.calibracao.corpus_versao !== estado.calibracao.corpusVersao ||
    certificado.calibracao.corpus_hash !== estado.calibracao.corpusHash
  ) {
    erros.push("corpus de calibração mudou após certificação");
  }
  if (estado.calibracao.pendencias.length || Object.values(estado.calibracao.prontaPorSkill).some((pronta) => !pronta)) {
    erros.push("calibração atual não está pronta");
  }
  for (const skill of estado.skills) {
    const certificada = certificado.skills.find((item) => item.id === skill.id);
    if (!certificada || certificada.versao !== skill.versao || certificada.hash !== skill.hash) {
      erros.push(`contrato ${skill.id} mudou ou não foi certificado`);
    }
    if (!Number.isInteger(certificado.canarios?.capitulos_por_skill?.[skill.id]) ||
        certificado.canarios.capitulos_por_skill[skill.id] < 2) {
      erros.push(`canários certificados de ${skill.id} são insuficientes`);
    }
  }
  if (certificado.skills.length !== estado.skills.length) erros.push("conjunto de skills certificado diverge do checkout");
  if (skillId && !certificado.skills.some((skill) => skill.id === skillId)) {
    erros.push(`skill ${skillId} não consta no certificado`);
  }
  if (
    certificado.avaliacao_humana.total <= 0 ||
    certificado.avaliacao_humana.acertos / certificado.avaliacao_humana.total < 0.8
  ) {
    erros.push("avaliação humana certificada abaixo de 80%");
  }
  const hashes = [
    certificado.canarios?.evidencia_hash,
    certificado.laboratorio?.execucao_hash,
    certificado.laboratorio?.avaliacao_automatica_hash,
    certificado.laboratorio?.relatorio_hash,
    certificado.avaliacao_humana?.evidencia_hash,
  ];
  if (hashes.some((hash) => !/^[0-9a-f]{64}$/.test(hash ?? ""))) {
    erros.push("hashes das evidências certificadas são inválidos");
  }
  if (!certificado.laboratorio?.execucao_id?.trim()) erros.push("execução de laboratório ausente");
  return erros;
}

function workerDirPadrao(): string {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
}

function listarFontesRuntime(diretorio: string): string[] {
  const arquivos: string[] = [];
  for (const entrada of readdirSync(diretorio, { withFileTypes: true })) {
    const absoluto = path.join(diretorio, entrada.name);
    if (entrada.isDirectory()) arquivos.push(...listarFontesRuntime(absoluto));
    else if (entrada.isFile() && entrada.name.endsWith(".ts") && !entrada.name.endsWith(".test.ts")) {
      arquivos.push(absoluto);
    }
  }
  return arquivos;
}

export function calcularHashRuntimeV2(workerDir = workerDirPadrao()): string {
  const base = path.resolve(workerDir);
  const fontes = listarFontesRuntime(path.join(base, "src"));
  const arquivos = [
    ...fontes,
    path.join(base, "package.json"),
    path.join(base, "package-lock.json"),
  ];
  const entradas = arquivos
    .map((arquivo) => ({
      arquivo: path.relative(base, arquivo).replace(/\\/g, "/"),
      hash: hashJsonCanonico(readFileSync(arquivo, "utf8").replace(/\r\n/g, "\n")),
    }))
    .sort((a, b) => a.arquivo < b.arquivo ? -1 : a.arquivo > b.arquivo ? 1 : 0);
  return hashJsonCanonico(entradas);
}

function pathsPadrao(): { workerDir: string; corpus: string; certificado: string } {
  const workerDir = workerDirPadrao();
  return {
    workerDir,
    corpus: path.join(workerDir, "calibration", "v1"),
    certificado: path.join(workerDir, "release", "engine-v2.json"),
  };
}

export function verificarReleaseAtual(skillId?: string, overrides: {
  corpusDir?: string;
  certificadoPath?: string;
  skills?: string[];
} = {}): { ok: boolean; erros: string[]; certificado?: CertificadoReleaseV2; estado: EstadoAtualRelease } {
  const padrao = pathsPadrao();
  const skills = overrides.skills ?? ["dan-brown", "hoover-mcfadden", "romantasy"];
  const calibracao = analisarCalibracao(overrides.corpusDir ?? padrao.corpus);
  const estado = estadoAtualRelease(skills, calibracao, padrao.workerDir);
  const certificadoPath = overrides.certificadoPath ?? padrao.certificado;
  if (!existsSync(certificadoPath)) {
    const pendencias = estado.calibracao.pendencias.length
      ? estado.calibracao.pendencias.map((item) => `calibração: ${item}`)
      : Object.entries(estado.calibracao.prontaPorSkill)
        .filter(([, pronta]) => !pronta)
        .map(([skill]) => `calibração: ${skill} ainda não está pronta`);
    return {
      ok: false,
      erros: [`certificado não encontrado em ${certificadoPath}`, ...pendencias],
      estado,
    };
  }
  let certificado: CertificadoReleaseV2;
  try {
    certificado = JSON.parse(readFileSync(certificadoPath, "utf8")) as CertificadoReleaseV2;
  } catch (erro) {
    return { ok: false, erros: [`certificado ilegível: ${(erro as Error).message}`], estado };
  }
  let erros: string[];
  try {
    erros = validarCertificadoContraEstado(certificado, estado, skillId);
  } catch (erro) {
    erros = [`certificado com estrutura inválida: ${(erro as Error).message}`];
  }
  return { ok: erros.length === 0, erros, certificado, estado };
}

/**
 * Autorização de projeto — DADO, não código.
 *
 * Antes era `PROJETOS_CANARIO_V2`, um Set de UUIDs hardcoded: na prática, o autor
 * não conseguia rodar um livro seu sem editar o fonte e reiniciar o worker. Agora
 * vive em `engine_autorizacoes_v2` (ver supabase/engine_v2_autorizacoes.sql).
 *
 * Duas garantias SEPARADAS, e uma nunca cobre a outra:
 * - CERTIFICADO: a versão do código está calibrada e provada;
 * - AUTORIZAÇÃO: este projeto específico pode rodar.
 */
export interface AutorizacaoProjetoV2 {
  project_id: string;
  modo: "producao" | "canario";
  autorizado_por: string;
  motivo: string;
}

/** Liberação de canário: substitui o certificado APENAS no modo canário. */
export interface LiberacaoCanarioV2 {
  schema: "engine-v2-liberacao-canario/v1";
  modo: "canario";
  codigo_commit: string; // rótulo auditável no progresso (não é commit certificado)
  project_id: string;
  skill: string;
  autorizado_por: string;
  motivo: string;
}

/**
 * Decide se este projeto pode executar. Função PURA: recebe a autorização já
 * lida do banco, para permanecer testável sem Supabase.
 *
 * Ordem das recusas (importa para a mensagem que o autor lê):
 * 1. sem autorização → PROJETO_V2_NAO_AUTORIZADO, mesmo com certificado válido;
 * 2. autorização de produção → exige certificado válido;
 * 3. autorização de canário → dispensa o certificado, e SÓ ela dispensa.
 */
export function exigirReleaseAtual(
  skillId: string,
  projectId?: string | null,
  autorizacao?: AutorizacaoProjetoV2 | null
): CertificadoReleaseV2 | LiberacaoCanarioV2 {
  if (projectId) {
    if (!autorizacao) {
      throw new ErroEngine({
        codigo: "PROJETO_V2_NAO_AUTORIZADO",
        classe: "configuracao",
        mensagem:
          `projeto ${projectId} não tem autorização ativa para a Engine V2. ` +
          `Autorize-o na tela do projeto (ou insira uma linha em engine_autorizacoes_v2). ` +
          `Autorização não substitui certificado: um projeto de produção também exige release certificado.`,
        detalhe: { project_id: projectId, skill: skillId },
      });
    }
    if (autorizacao.modo === "canario") {
      return {
        schema: "engine-v2-liberacao-canario/v1",
        modo: "canario",
        codigo_commit: "canario-sem-certificado",
        project_id: projectId,
        skill: skillId,
        autorizado_por: autorizacao.autorizado_por,
        motivo: autorizacao.motivo,
      };
    }
  }
  let verificacao: ReturnType<typeof verificarReleaseAtual>;
  try {
    verificacao = verificarReleaseAtual(skillId);
  } catch (erro) {
    // A verificação em si falhou (ex.: corpus ilegível ou com hash divergente por
    // CRLF do checkout). Continua FAIL-CLOSED, mas com a mensagem do gate — nunca
    // um erro cru que esconda que a escrita V2 está bloqueada por certificação.
    throw new ErroEngine({
      codigo: "RELEASE_V2_NAO_CERTIFICADA",
      classe: "configuracao",
      mensagem: `Engine V2 bloqueada para fundação/escrita: verificação do release falhou: ${erro instanceof Error ? erro.message : String(erro)}`,
      detalhe: { skill: skillId },
    });
  }
  if (!verificacao.ok || !verificacao.certificado) {
    throw new ErroEngine({
      codigo: "RELEASE_V2_NAO_CERTIFICADA",
      classe: "configuracao",
      mensagem: `Engine V2 bloqueada para fundação/escrita: ${verificacao.erros.join(" · ")}`,
      detalhe: {
        skill: skillId,
        corpus_hash: verificacao.estado.calibracao.corpusHash,
        pendencias: verificacao.estado.calibracao.pendencias,
      },
    });
  }
  return verificacao.certificado;
}

export function hashEvidenciaJson(valor: unknown): string {
  return hashJsonCanonico(valor);
}

/**
 * Lê a autorização ATIVA do projeto. Tabela ausente (migração não aplicada) =
 * FAIL-CLOSED com mensagem que diz exatamente o que fazer — nunca um fallback
 * silencioso para "autorizado", que era justamente o risco de tirar a lista do
 * código sem colocá-la em lugar nenhum.
 */
export async function lerAutorizacaoProjeto(projectId: string): Promise<AutorizacaoProjetoV2 | null> {
  const { sb, OWNER } = await import("../supabase.js");
  const { data, error } = await sb
    .from("engine_autorizacoes_v2")
    .select("project_id,modo,autorizado_por,motivo")
    .eq("owner", OWNER)
    .eq("project_id", projectId)
    .eq("ativo", true)
    .maybeSingle();
  if (error) {
    const ausente =
      error.code === "42P01" ||
      error.code === "PGRST205" ||
      (error.message ?? "").includes("Could not find the table");
    if (ausente) {
      throw new ErroEngine({
        codigo: "AUTORIZACAO_V2_INDISPONIVEL",
        classe: "configuracao",
        mensagem:
          "tabela engine_autorizacoes_v2 não existe: aplique supabase/engine_v2_autorizacoes.sql " +
          "(migração aditiva) e autorize o projeto. A Engine V2 permanece bloqueada até lá.",
      });
    }
    throw new ErroEngine({
      codigo: "AUTORIZACAO_V2_INDISPONIVEL",
      classe: "tecnica",
      mensagem: `falha ao ler autorização do projeto: ${error.message}`,
    });
  }
  if (!data) return null;
  const linha = data as { project_id: string; modo: string; autorizado_por: string; motivo: string };
  return {
    project_id: linha.project_id,
    modo: linha.modo === "canario" ? "canario" : "producao",
    autorizado_por: linha.autorizado_por,
    motivo: linha.motivo,
  };
}
