// Regressão F-09: backfill de Quality State para projetos antigos NUNCA
// falsifica aprovação e nunca sobrescreve decisões reais do runner.
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { backfillQualityProjeto, estadoBackfill } from "./backfill-quality.js";
import { hashText } from "./quality-state.js";

const agora = () => "2026-07-12T00:00:00.000Z";

const FRASES_VARIADAS = [
  "Marta atravessou o cais carregando a lanterna apagada enquanto o vento empurrava os barcos contra as amarras do porto antigo.",
  "O guarda do armazém cumprimentou a moça com um aceno demorado antes de voltar a conferir as caixas de pescado.",
  "Debaixo do farol, as ondas quebravam num ritmo que os pescadores mais velhos juravam conseguir prever de ouvido.",
  "Ela guardou o caderno de anotações no bolso do casaco e desceu a escada de pedra com cuidado redobrado.",
  "Um cheiro de sal e querosene subia do porão do barco encalhado desde a tempestade da semana passada.",
  "Quando o sino da capela tocou seis vezes, os comerciantes começaram a fechar as bancas do mercado coberto.",
  "A carta do armador continuava dobrada dentro da lata de biscoitos, exatamente onde o avô a tinha escondido.",
  "Ninguém na vila sabia explicar por que a luz do farol piscava três vezes antes de cada naufrágio registrado.",
];
const TEXTO_LIMPO = Array.from({ length: 6 }, (_, i) =>
  FRASES_VARIADAS.map((f, j) => `${f.slice(0, -1)} pela ${i * 8 + j + 1}ª vez naquele inverno.`).join(" ")
).join(" ");

// "coisa" repetida muitas vezes estoura a muleta com folga em qualquer orçamento.
const TEXTO_SUJO = TEXTO_LIMPO + " " + Array.from({ length: 30 }, () => "Aquela coisa mudava tudo outra vez.").join(" ");

describe("estadoBackfill — nunca aprova", () => {
  it("texto limpo vira pending (não approved), hash-bound, com aviso de escopo", () => {
    const st = estadoBackfill(TEXTO_LIMPO, null, agora);
    expect(st.status).toBe("pending");
    expect(st.textHash).toBe(hashText(TEXTO_LIMPO));
    expect(st.stage).toBe("BACKFILL");
    expect(st.warnings.join(" ")).toContain("spec, continuidade e agência");
    expect(st.requiredAction).toContain("loop");
  });

  it("texto com muleta acima vira rewrite_required com blocker nomeado", () => {
    const st = estadoBackfill(TEXTO_SUJO, null, agora);
    expect(st.status).toBe("rewrite_required");
    expect(st.blockers.some((b) => b.code.startsWith("MULETA:"))).toBe(true);
  });
});

describe("backfillQualityProjeto", () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), "backfill-q-"));
    await mkdir(path.join(dir, "manuscrito"), { recursive: true });
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("grava estado só para capítulos sem quality e preserva decisões existentes", async () => {
    await writeFile(path.join(dir, "manuscrito", "capitulo-01.md"), TEXTO_LIMPO, "utf8");
    await writeFile(path.join(dir, "manuscrito", "capitulo-02.md"), TEXTO_SUJO, "utf8");
    await mkdir(path.join(dir, "quality"), { recursive: true });
    const decisaoRunner = { status: "approved", textHash: "runner-hash", blockers: [] };
    await writeFile(path.join(dir, "quality", "capitulo-01.json"), JSON.stringify(decisaoRunner), "utf8");

    const r = await backfillQualityProjeto(dir, null);
    expect(r).toEqual([
      { capitulo: "capitulo-01.md", acao: "preservado" },
      { capitulo: "capitulo-02.md", acao: "gravado", status: "rewrite_required" },
    ]);
    // decisão real do runner intocada
    expect(JSON.parse(await readFile(path.join(dir, "quality", "capitulo-01.json"), "utf8"))).toEqual(decisaoRunner);
    // capítulo backfilled nunca sai approved
    const st = JSON.parse(await readFile(path.join(dir, "quality", "capitulo-02.json"), "utf8"));
    expect(["pending", "rewrite_required"]).toContain(st.status);
  });

  it("projeto sem manuscrito é no-op", async () => {
    await rm(path.join(dir, "manuscrito"), { recursive: true, force: true });
    expect(await backfillQualityProjeto(dir, null)).toEqual([]);
  });
});
