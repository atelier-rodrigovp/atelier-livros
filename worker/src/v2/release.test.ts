import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { ResultadoCalibracao } from "./calibracao.js";
import { ordenarAmostrasCegas, type AvaliacaoCega, type NotasCegas } from "./lab/avaliar.js";
import type { RelatorioLab } from "./lab/relatorio.js";
import type { AmostraLab, ExecucaoLab } from "./lab/rodar.js";
import {
  criarCertificadoRelease,
  calcularHashRuntimeV2,
  SCHEMA_AVALIACAO_HUMANA_RELEASE,
  validarCertificadoContraEstado,
  type AvaliacaoHumanaRelease,
  type EstadoAtualRelease,
  type EvidenciasParaCertificar,
} from "./release.js";

const SKILLS = [
  { id: "dan-brown", versao: "1.0.0", hash: "a".repeat(64) },
  { id: "hoover-mcfadden", versao: "1.0.0", hash: "b".repeat(64) },
  { id: "romantasy", versao: "1.0.0", hash: "c".repeat(64) },
];
const CORPUS_HASH = "d".repeat(64);
const NOTAS: NotasCegas = {
  voz: 4.5,
  cadencia: 4.3,
  interioridade: 4.2,
  revelacao: 4.4,
  encerramento: 4.1,
  inteligencia_narrativa: 4.2,
};

function amostras(): AmostraLab[] {
  const categorias = ["abertura", "confronto", "revelacao"] as const;
  return SKILLS.flatMap((skill) =>
    categorias.map((categoria, indice) => ({
      id: `${skill.id}:${categoria}`,
      skillId: skill.id,
      skillVersao: skill.versao,
      contratoHash: skill.hash,
      categoria,
      capitulo: indice + 1,
      texto: `${skill.id} ${categoria}`,
      textoHash: `${skill.hash.slice(0, 48)}${String(indice).repeat(16)}`,
      sinais: [],
      gates: [],
      palavras: 1000,
      runId: `run-${skill.id}-${categoria}`,
    }))
  );
}

function fixture(): { evidencias: EvidenciasParaCertificar; estado: EstadoAtualRelease } {
  const execucaoLab: ExecucaoLab = {
    id: "lab-validado",
    executadaEm: "2026-07-25T12:00:00.000Z",
    engineVersion: "2.0.0",
    skills: structuredClone(SKILLS),
    amostras: amostras(),
  };
  const ordenadas = ordenarAmostrasCegas(execucaoLab).amostras;
  const porAmostra = ordenadas.map((amostra, indice) => ({
    amostraAnonima: `A-${indice + 1}`,
    amostraId: amostra.id,
    skillReal: amostra.skillId,
    skillAdivinhada: amostra.skillId,
    acertou: true,
    aderencia: 4.4,
    notas: NOTAS,
    tracosDistintivos: ["voz distinguível"],
    parecerResumo: "aderente",
    runId: `blind-${indice}`,
    saidaBruta: "{}",
    saidaBrutaHash: "e".repeat(64),
  }));
  const avaliacaoAutomatica: AvaliacaoCega = {
    schema: "blind-evaluation/v2",
    execucaoId: "blind-validado",
    labExecucaoId: execucaoLab.id,
    executadaEm: "2026-07-25T13:00:00.000Z",
    seedOrdem: "seed",
    modeloAvaliador: "sonnet",
    porAmostra,
    distinguibilidade: 1,
    matrizConfusao: Object.fromEntries(SKILLS.map((skill) => [skill.id, { [skill.id]: 3 }])),
    mediaNotas: NOTAS,
  };
  const relatorioLab: RelatorioLab = {
    execucaoId: execucaoLab.id,
    metricas: {},
    criteriosCegos: {
      distinguibilidadeMinima: 0.8,
      acertoMinimoPorSkill: 2 / 3,
      aderenciaMediaMinima: 4,
      notaMediaMinimaPorDimensao: 3.5,
    },
    falhasDistincao: [],
    calibracao: {
      corpusVersao: "1.0.0",
      corpusHash: CORPUS_HASH,
      pronta: true,
      skills: Object.fromEntries(SKILLS.map((skill) => [skill.id, true])),
      pendencias: [],
    },
    falhasCalibracao: [],
    regressoes: [],
    vazamentos: [],
    decisao: "aprovar",
  };
  const paresHumanos = ordenadas.map((amostra, indice) => [
    `A-${String(indice + 1).padStart(2, "0")}-${amostra.textoHash.slice(0, 12)}`,
    amostra.skillId,
  ] as const);
  const avaliacaoHumana: AvaliacaoHumanaRelease = {
    schema: SCHEMA_AVALIACAO_HUMANA_RELEASE,
    lab_execucao_id: execucaoLab.id,
    por: "Autor Humano",
    em: "2026-07-25T14:00:00.000Z",
    palpites: Object.fromEntries(paresHumanos),
    gabarito: Object.fromEntries(paresHumanos),
  };
  const calibracao: ResultadoCalibracao = {
    schema: "calibration-result/v1",
    corpus_versao: "1.0.0",
    corpus_hash: CORPUS_HASH,
    pendencias: [],
    skills: SKILLS.map((skill) => ({
      skill: skill.id,
      contrato_versao: skill.versao,
      contrato_hash: skill.hash,
      sinais: [],
      pronta_para_lab: true,
    })),
  };
  const canarios = SKILLS.map((skill) => ({
    skill,
    aprovados_plenos: 2,
    total_capitulos: 2,
    criterio_3de3: true,
    capitulos_estado_final: [
      { capitulo: 1, status: "aprovado", hash_confere: true },
      { capitulo: 2, status: "aprovado", hash_confere: true },
    ],
  }));
  const estado: EstadoAtualRelease = {
    engineVersion: "2.0.0",
    runtimeHash: "6".repeat(64),
    skills: structuredClone(SKILLS),
    calibracao: {
      corpusVersao: "1.0.0",
      corpusHash: CORPUS_HASH,
      prontaPorSkill: Object.fromEntries(SKILLS.map((skill) => [skill.id, true])),
      pendencias: [],
    },
  };
  return {
    estado,
    evidencias: {
      canarios,
      execucaoLab,
      avaliacaoAutomatica,
      relatorioLab,
      avaliacaoHumana,
      calibracao,
      emitidoPor: "Autor Humano",
      emitidoEm: "2026-07-25T15:00:00.000Z",
      codigoCommit: "f".repeat(40),
      hashes: {
        canarios: "1".repeat(64),
        execucaoLab: "2".repeat(64),
        avaliacaoAutomatica: "3".repeat(64),
        relatorioLab: "4".repeat(64),
        avaliacaoHumana: "5".repeat(64),
      },
    },
  };
}

describe("certificação de release V2", () => {
  it("calcula hash de runtime reproduzível entre LF/CRLF e ignora testes", () => {
    const a = mkdtempSync(path.join(tmpdir(), "release-runtime-a-"));
    const b = mkdtempSync(path.join(tmpdir(), "release-runtime-b-"));
    try {
      for (const dir of [a, b]) mkdirSync(path.join(dir, "src", "v2"), { recursive: true });
      writeFileSync(path.join(a, "src", "v2", "motor.ts"), "export const x = 1;\n", "utf8");
      writeFileSync(path.join(b, "src", "v2", "motor.ts"), "export const x = 1;\r\n", "utf8");
      writeFileSync(path.join(a, "src", "v2", "motor.test.ts"), "teste A", "utf8");
      writeFileSync(path.join(b, "src", "v2", "motor.test.ts"), "teste B", "utf8");
      for (const dir of [a, b]) {
        writeFileSync(path.join(dir, "package.json"), "{}\n", "utf8");
        writeFileSync(path.join(dir, "package-lock.json"), "{}\n", "utf8");
      }
      expect(calcularHashRuntimeV2(a)).toBe(calcularHashRuntimeV2(b));
      writeFileSync(path.join(b, "src", "v2", "motor.ts"), "export const x = 2;\n", "utf8");
      expect(calcularHashRuntimeV2(a)).not.toBe(calcularHashRuntimeV2(b));
    } finally {
      rmSync(a, { recursive: true, force: true });
      rmSync(b, { recursive: true, force: true });
    }
  });

  it("certifica somente o conjunto completo e mantém hashes das evidências", () => {
    const { evidencias, estado } = fixture();
    const certificado = criarCertificadoRelease(evidencias, estado);
    expect(certificado.status).toBe("certificado");
    expect(certificado.runtime_hash).toBe(estado.runtimeHash);
    expect(certificado.canarios.capitulos_por_skill).toEqual({
      "dan-brown": 2,
      "hoover-mcfadden": 2,
      romantasy: 2,
    });
    expect(certificado.avaliacao_humana).toMatchObject({ acertos: 9, total: 9, distinguibilidade: 1 });
    expect(validarCertificadoContraEstado(certificado, estado, "dan-brown")).toEqual([]);
  });

  it("rejeita aprovado_com_excecao mesmo quando o resumo afirma sucesso", () => {
    const { evidencias, estado } = fixture();
    const canarios = evidencias.canarios as any[];
    canarios[0].capitulos_estado_final[0].status = "aprovado_com_excecao";
    expect(() => criarCertificadoRelease(evidencias, estado))
      .toThrow(/capítulos não estão 100% aprovados plenos/);
  });

  it("rejeita avaliação humana abaixo de 80% e gabarito adulterado", () => {
    const { evidencias, estado } = fixture();
    const ids = Object.keys(evidencias.avaliacaoHumana.palpites);
    for (const id of ids.slice(0, 3)) evidencias.avaliacaoHumana.palpites[id] = "dan-brown";
    evidencias.avaliacaoHumana.gabarito[ids[0]] = "romantasy";
    expect(() => criarCertificadoRelease(evidencias, estado))
      .toThrow(/gabarito adulterado|distinguibilidade/);
  });

  it("invalida automaticamente mudança posterior de contrato, corpus ou skill", () => {
    const { evidencias, estado } = fixture();
    const certificado = criarCertificadoRelease(evidencias, estado);
    const alterado = structuredClone(estado);
    alterado.skills[0].hash = "0".repeat(64);
    alterado.calibracao.corpusHash = "9".repeat(64);
    alterado.runtimeHash = "8".repeat(64);
    const erros = validarCertificadoContraEstado(certificado, alterado, "skill-inexistente");
    expect(erros.join(" | ")).toMatch(/corpus de calibração mudou/);
    expect(erros.join(" | ")).toMatch(/contrato dan-brown mudou/);
    expect(erros.join(" | ")).toMatch(/código do runtime mudou/);
    expect(erros.join(" | ")).toMatch(/skill skill-inexistente não consta/);
  });

  it("não aceita JSON mínimo forjado sem hashes e canários", () => {
    const { evidencias, estado } = fixture();
    const certificado = criarCertificadoRelease(evidencias, estado) as any;
    delete certificado.canarios;
    delete certificado.laboratorio.relatorio_hash;
    const erros = validarCertificadoContraEstado(certificado, estado);
    expect(erros.join(" | ")).toMatch(/canários certificados/);
    expect(erros.join(" | ")).toMatch(/hashes das evidências/);
  });

  it("rejeita calibração pendente antes de considerar o laboratório", () => {
    const { evidencias, estado } = fixture();
    estado.calibracao.prontaPorSkill["romantasy"] = false;
    estado.calibracao.pendencias.push("romantasy: revisão humana pendente");
    expect(() => criarCertificadoRelease(evidencias, estado))
      .toThrow(/calibração: romantasy: revisão humana pendente/);
  });
});
