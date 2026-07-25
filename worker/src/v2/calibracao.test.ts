import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  analisarCalibracao,
  carregarCorpusCalibracao,
  SCHEMA_CORPUS_CALIBRACAO,
  SCHEMA_ROTULOS_CALIBRACAO,
  type AmostraCalibracao,
  type CorpusCalibracao,
  type RotulosAmostra,
} from "./calibracao.js";
import { carregarContrato } from "./contrato.js";
import { ehSinalEscalar } from "./revisor.js";
import { medirSinais } from "./sinais.js";

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function sha(t: string): string {
  return createHash("sha256").update(t, "utf8").digest("hex");
}

function montarCorpus(
  amostras: { id: string; split: "calibracao" | "holdout"; texto: string; positiva: boolean; status?: "pendente_humano" | "validado_humano" }[]
): string {
  const dir = mkdtempSync(path.join(tmpdir(), "calibracao-v2-"));
  dirs.push(dir);
  mkdirSync(path.join(dir, "samples"), { recursive: true });
  mkdirSync(path.join(dir, "labels"), { recursive: true });
  const contrato = carregarContrato("dan-brown").contrato;
  const metas: AmostraCalibracao[] = [];
  for (const a of amostras) {
    const arquivo = `samples/${a.id}.md`;
    const labels = `labels/${a.id}.json`;
    writeFileSync(path.join(dir, arquivo), a.texto, "utf8");
    const sinais = medirSinais(a.texto, contrato).filter(
      (s) => typeof s.valor === "number" && s.sinal !== "gancho_final" && !ehSinalEscalar(s.sinal)
    );
    const rotulos: RotulosAmostra = {
      schema: SCHEMA_ROTULOS_CALIBRACAO,
      amostra_id: a.id,
      texto_sha256: sha(a.texto),
      sinais: sinais.map((s) => ({
        sinal: s.sinal,
        atestacao_humana: a.status === "pendente_humano" ? undefined : {
          declaracao: "Fixture revisada integralmente para todos os falsos negativos.",
          revisor: "fixture",
          revisado_em: "2026-07-25T00:00:00.000Z",
          pacote_sha256: "a".repeat(64),
        },
        ocorrencias: s.exemplos.map((trecho, i) => ({
          indice_detector: i + 1,
          trecho,
          rotulo: a.positiva && i === 0 ? "violacao" : "legitima",
          justificativa: a.positiva && i === 0 ? "reformulação real" : "uso legítimo",
        })),
        nao_detectadas: [],
      })),
    };
    writeFileSync(path.join(dir, labels), JSON.stringify(rotulos, null, 2), "utf8");
    metas.push({
      id: a.id,
      skill: "dan-brown",
      split: a.split,
      classe: a.positiva ? "contraste" : "aprovada",
      arquivo,
      sha256: sha(a.texto),
      origem: "fixture",
      rotulos: {
        arquivo: labels,
        status: a.status ?? "validado_humano",
        revisor: "fixture",
        revisado_em: "2026-07-25T00:00:00.000Z",
        pacote_sha256: "a".repeat(64),
      },
    });
  }
  const corpus: CorpusCalibracao = {
    schema: SCHEMA_CORPUS_CALIBRACAO,
    versao: "teste",
    descricao: "fixture",
    amostras: metas,
  };
  writeFileSync(path.join(dir, "corpus.json"), JSON.stringify(corpus, null, 2), "utf8");
  return dir;
}

const POSITIVA = "Marina não sabia o que dizer, mas não podia ficar parada. Ela não entendia o registro, mas não ousava perguntar.";
const NEGATIVA = "Marina abriu o registro. Fotografou a página e saiu antes que Heitor voltasse.";

describe("calibração reproduzível", () => {
  it("rejeita caminho absoluto e hash divergente", () => {
    const dir = montarCorpus([{ id: "a", split: "calibracao", texto: POSITIVA, positiva: true }]);
    const corpus = JSON.parse(readFileSync(path.join(dir, "corpus.json"), "utf8")) as CorpusCalibracao;
    corpus.amostras[0].arquivo = path.join(dir, "samples", "a.md");
    writeFileSync(path.join(dir, "corpus.json"), JSON.stringify(corpus), "utf8");
    expect(() => carregarCorpusCalibracao(dir)).toThrow(/caminho absoluto proibido/);
  });

  it("exige que os rótulos cubram exatamente todas as ocorrências medidas", () => {
    const dir = montarCorpus([{ id: "a", split: "calibracao", texto: POSITIVA, positiva: true }]);
    const rotuloPath = path.join(dir, "labels", "a.json");
    const rotulos = JSON.parse(readFileSync(rotuloPath, "utf8")) as RotulosAmostra;
    const sanfona = rotulos.sinais.find((s) => s.sinal === "sanfona")!;
    sanfona.ocorrencias.pop();
    writeFileSync(rotuloPath, JSON.stringify(rotulos), "utf8");
    expect(() => carregarCorpusCalibracao(dir)).toThrow(/não cobrem exatamente/);
  });

  it("não deriva candidata enquanto houver revisão humana pendente", () => {
    const dir = montarCorpus([
      { id: "cal-pos", split: "calibracao", texto: POSITIVA, positiva: true, status: "pendente_humano" },
      { id: "cal-neg", split: "calibracao", texto: NEGATIVA, positiva: false },
      { id: "hold-pos", split: "holdout", texto: POSITIVA, positiva: true },
      { id: "hold-neg", split: "holdout", texto: NEGATIVA, positiva: false },
    ]);
    const r = analisarCalibracao(dir);
    expect(r.pendencias).toContain("dan-brown: 1 amostra(s) aguardam validação humana");
    expect(r.skills[0].sinais.every((s) => s.decisao === "rotulacao_pendente")).toBe(true);
  });

  it("deriva só no split de calibração e mede a candidata no holdout", () => {
    const dir = montarCorpus([
      { id: "cal-pos", split: "calibracao", texto: POSITIVA, positiva: true },
      { id: "cal-neg", split: "calibracao", texto: NEGATIVA, positiva: false },
      { id: "hold-pos", split: "holdout", texto: POSITIVA, positiva: true },
      { id: "hold-neg", split: "holdout", texto: NEGATIVA, positiva: false },
    ]);
    const r = analisarCalibracao(dir);
    const sanfona = r.skills[0].sinais.find((s) => s.sinal === "sanfona")!;
    expect(sanfona.cota_candidata).toBeDefined();
    expect(sanfona.amostras_calibracao).toBe(2);
    expect(sanfona.amostras_holdout).toBe(2);
    expect(sanfona.classificacao_holdout_candidata).toMatchObject({ tp: 1, tn: 1, fp: 0, fn: 0 });
  });
});
