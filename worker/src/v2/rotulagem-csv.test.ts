import { cpSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { carregarCorpusCalibracao } from "./calibracao.js";
import {
  aplicarRotulosValidados,
  exportarRotulosCsv,
  parsearCsv,
  serializarCsv,
  validarRotulosCsv,
} from "./rotulagem-csv.js";

const corpusReal = path.resolve(process.cwd(), "worker", "calibration", "v1");
const temporarios: string[] = [];

afterEach(() => {
  for (const dir of temporarios.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function copiarCorpus(): string {
  const dir = mkdtempSync(path.join(tmpdir(), "rotulagem-csv-v2-"));
  temporarios.push(dir);
  cpSync(corpusReal, dir, { recursive: true });
  return dir;
}

function preencherHumanamente(csv: string): ReturnType<typeof parsearCsv> {
  const linhas = parsearCsv(csv);
  for (const [indice, linha] of linhas.entries()) {
    linha.justificativa = linha.tipo === "atestacao"
      ? `Revisei integralmente o texto para o sinal ${linha.sinal} e registrei todos os falsos negativos.`
      : `Classificação humana específica da ocorrência ${indice + 1}, conforme o contexto completo.`;
  }
  return linhas;
}

describe("fluxo CSV de rotulagem humana", () => {
  it("preserva ponto e vírgula, aspas e quebras de linha em campos", () => {
    const dir = copiarCorpus();
    const exportado = exportarRotulosCsv(dir, { amostra: "dan-brown-aprovado-01" });
    const linhas = parsearCsv(exportado.csv);
    linhas[0].justificativa = 'Contexto "humano"; linha um\r\nlinha dois.';
    expect(parsearCsv(serializarCsv(linhas))[0].justificativa).toBe('Contexto "humano"; linha um\r\nlinha dois.');
  });

  it("valida o pacote completo sem modificar o corpus no dry-run", () => {
    const dir = copiarCorpus();
    const antes = readFileSync(path.join(dir, "corpus.json"), "utf8");
    const exportado = exportarRotulosCsv(dir, { amostra: "dan-brown-aprovado-01" });
    const resultado = validarRotulosCsv(
      dir,
      serializarCsv(preencherHumanamente(exportado.csv)),
      "Revisora Humana",
      "2026-07-25T18:00:00.000Z"
    );

    expect(resultado.amostras).toEqual(["dan-brown-aprovado-01"]);
    expect(resultado.ocorrencias).toBe(exportado.ocorrencias);
    expect(resultado.atestacoes).toBe(exportado.atestacoes);
    expect(resultado.corpusAtualizado.amostras[0].rotulos).toMatchObject({
      status: "validado_humano",
      revisor: "Revisora Humana",
      pacote_sha256: resultado.pacoteSha256,
    });
    expect(readFileSync(path.join(dir, "corpus.json"), "utf8")).toBe(antes);
  });

  it("rejeita a exportação ainda preenchida apenas por marcadores", () => {
    const dir = copiarCorpus();
    const exportado = exportarRotulosCsv(dir, { amostra: "dan-brown-aprovado-01" });
    expect(() => validarRotulosCsv(dir, exportado.csv, "Revisora Humana"))
      .toThrow(/justificativa humana específica ausente/);
  });

  it("aplica rótulos validados e promove o manifesto por último", () => {
    const dir = copiarCorpus();
    const exportado = exportarRotulosCsv(dir, { amostra: "dan-brown-aprovado-01" });
    const resultado = validarRotulosCsv(
      dir,
      serializarCsv(preencherHumanamente(exportado.csv)),
      "Revisora Humana",
      "2026-07-25T18:00:00.000Z"
    );
    aplicarRotulosValidados(dir, resultado);

    const recarregado = carregarCorpusCalibracao(dir);
    expect(recarregado.corpus.amostras[0].rotulos).toMatchObject({
      status: "validado_humano",
      revisor: "Revisora Humana",
      revisado_em: "2026-07-25T18:00:00.000Z",
    });
    expect(recarregado.amostras[0].rotulos.sinais[0].ocorrencias[0].justificativa)
      .toMatch(/Classificação humana específica/);
    expect(recarregado.amostras[0].rotulos.sinais[0].atestacao_humana).toMatchObject({
      revisor: "Revisora Humana",
      pacote_sha256: resultado.pacoteSha256,
    });
  });

  it("rejeita alteração de identidade, ocorrência omitida e falsa negativa inventada", () => {
    const dir = copiarCorpus();
    const exportado = exportarRotulosCsv(dir, { amostra: "dan-brown-aprovado-01" });

    const identidade = preencherHumanamente(exportado.csv);
    identidade[0].texto_sha256 = "0".repeat(64);
    expect(() => validarRotulosCsv(dir, serializarCsv(identidade), "Revisora Humana"))
      .toThrow(/alterou texto_sha256/);

    const omitida = preencherHumanamente(exportado.csv);
    const indiceDetectada = omitida.findIndex((linha) => linha.tipo === "detectada");
    omitida.splice(indiceDetectada, 1);
    expect(() => validarRotulosCsv(dir, serializarCsv(omitida), "Revisora Humana"))
      .toThrow(/detector exige|ausente ou duplicada/);

    const inventada = preencherHumanamente(exportado.csv);
    const base = inventada.find((linha) => linha.tipo === "atestacao")!;
    inventada.push({
      ...base,
      tipo: "nao_detectada",
      indice_detector: "",
      trecho: "TRECHO QUE NÃO EXISTE EM NENHUMA AMOSTRA",
      rotulo: "violacao",
      justificativa: "O revisor registrou esta ocorrência como um falso negativo real.",
    });
    expect(() => validarRotulosCsv(dir, serializarCsv(inventada), "Revisora Humana"))
      .toThrow(/não existe literalmente no texto/);
  });

  it("não permite sobrescrever uma amostra já validada", () => {
    const dir = copiarCorpus();
    const exportado = exportarRotulosCsv(dir, { amostra: "dan-brown-aprovado-01" });
    const preenchido = serializarCsv(preencherHumanamente(exportado.csv));
    aplicarRotulosValidados(dir, validarRotulosCsv(dir, preenchido, "Revisora Humana"));
    expect(() => validarRotulosCsv(dir, preenchido, "Outro Revisor"))
      .toThrow(/já está validada/);
  });

  it("rejeita corpus validado cuja atestação persistida foi adulterada", () => {
    const dir = copiarCorpus();
    const exportado = exportarRotulosCsv(dir, { amostra: "dan-brown-aprovado-01" });
    const preenchido = serializarCsv(preencherHumanamente(exportado.csv));
    const resultado = validarRotulosCsv(dir, preenchido, "Revisora Humana");
    resultado.rotulosAtualizados.get("dan-brown-aprovado-01")!
      .sinais[0].atestacao_humana!.pacote_sha256 = "b".repeat(64);
    expect(() => aplicarRotulosValidados(dir, resultado))
      .toThrow(/atestação humana ausente ou inconsistente/);
  });
});
