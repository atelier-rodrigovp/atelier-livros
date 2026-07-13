// Regressão F-07: refino que altera a fundação precisa invalidar aprovações de
// capítulo (stale) e listar specs afetadas; documentos inalterados não invalidam.
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  diffFundacao,
  hashesFundacaoNoDisco,
  instalarAgentesDeStaging,
  invalidarQualityCapitulos,
  specsExistentes,
} from "./fundacao-gate.js";

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), "fundacao-refino-"));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

async function escreverQuality(n: number, status: string) {
  await mkdir(path.join(dir, "quality"), { recursive: true });
  const nome = `capitulo-${String(n).padStart(2, "0")}.json`;
  await writeFile(
    path.join(dir, "quality", nome),
    JSON.stringify({ status, textHash: "abc", blockers: [], stage: "chapter" }),
    "utf8"
  );
  return nome;
}

describe("diff de fundação", () => {
  it("detecta alterado, criado e removido", () => {
    const antes = { "Biblia-da-Obra.md": "h1", "Mapa-de-Personagens.md": "h2" };
    const depois = { "Biblia-da-Obra.md": "h1-mudou", "Estrutura-do-Livro.md": "h3" };
    expect(diffFundacao(antes, depois)).toEqual([
      "Biblia-da-Obra.md",
      "Estrutura-do-Livro.md",
      "Mapa-de-Personagens.md",
    ]);
  });

  it("sem mudança => diff vazio (hashes do disco)", async () => {
    await writeFile(path.join(dir, "Biblia-da-Obra.md"), "conteudo", "utf8");
    const a = await hashesFundacaoNoDisco(dir);
    const b = await hashesFundacaoNoDisco(dir);
    expect(diffFundacao(a, b)).toEqual([]);
  });
});

describe("invalidação de aprovações de capítulo", () => {
  it("approved e approved_with_exception viram stale com blocker nomeado", async () => {
    const a = await escreverQuality(1, "approved");
    const b = await escreverQuality(2, "approved_with_exception");
    const invalidados = await invalidarQualityCapitulos(dir, "refino alterou a Estrutura");
    expect(invalidados.sort()).toEqual([a, b].sort());
    for (const nome of [a, b]) {
      const st = JSON.parse(await readFile(path.join(dir, "quality", nome), "utf8"));
      expect(st.status).toBe("stale");
      expect(st.blockers[0].code).toBe("FUNDACAO_ALTERADA_POS_REFINO");
      expect(st.requiredAction).toContain("Reexecutar");
    }
  });

  it("estados já bloqueados/rewrite não são tocados", async () => {
    const a = await escreverQuality(1, "blocked_quality");
    const b = await escreverQuality(2, "rewrite_required");
    const invalidados = await invalidarQualityCapitulos(dir, "refino");
    expect(invalidados).toEqual([]);
    expect(JSON.parse(await readFile(path.join(dir, "quality", a), "utf8")).status).toBe("blocked_quality");
    expect(JSON.parse(await readFile(path.join(dir, "quality", b), "utf8")).status).toBe("rewrite_required");
  });

  it("projeto sem quality/ é no-op", async () => {
    expect(await invalidarQualityCapitulos(dir, "refino")).toEqual([]);
  });
});

describe("instalação de agentes do staging (sessão headless com .claude bloqueado)", () => {
  it("instala livro-*.md em .claude/agents sem sobrescrever existentes; LEIA-ME é ignorado", async () => {
    await mkdir(path.join(dir, "_agentes-para-instalar"), { recursive: true });
    await writeFile(path.join(dir, "_agentes-para-instalar", "livro-escritor.md"), "escritor-staging", "utf8");
    await writeFile(path.join(dir, "_agentes-para-instalar", "livro-revisor.md"), "revisor-staging", "utf8");
    await writeFile(path.join(dir, "_agentes-para-instalar", "LEIA-ME.md"), "instruções", "utf8");
    await mkdir(path.join(dir, ".claude", "agents"), { recursive: true });
    await writeFile(path.join(dir, ".claude", "agents", "livro-revisor.md"), "revisor-JA-INSTALADO", "utf8");

    const r1 = await instalarAgentesDeStaging(dir);
    expect(r1).toEqual(["livro-escritor.md"]);
    expect(await readFile(path.join(dir, ".claude", "agents", "livro-escritor.md"), "utf8")).toBe("escritor-staging");
    // existente preservado; LEIA-ME não instalado
    expect(await readFile(path.join(dir, ".claude", "agents", "livro-revisor.md"), "utf8")).toBe("revisor-JA-INSTALADO");
    await expect(readFile(path.join(dir, ".claude", "agents", "LEIA-ME.md"), "utf8")).rejects.toThrow();
    // idempotente
    expect(await instalarAgentesDeStaging(dir)).toEqual([]);
  });

  it("sem staging é no-op", async () => {
    expect(await instalarAgentesDeStaging(dir)).toEqual([]);
  });
});

describe("specs afetadas", () => {
  it("lista Spec-Capitulo-NN.md e ignora outros arquivos", async () => {
    await mkdir(path.join(dir, "specs"), { recursive: true });
    await writeFile(path.join(dir, "specs", "Spec-Capitulo-01.md"), "x", "utf8");
    await writeFile(path.join(dir, "specs", "Spec-Capitulo-12.md"), "x", "utf8");
    await writeFile(path.join(dir, "specs", "notas.md"), "x", "utf8");
    expect(await specsExistentes(dir)).toEqual(["Spec-Capitulo-01.md", "Spec-Capitulo-12.md"]);
  });
  it("sem pasta specs => vazio", async () => {
    expect(await specsExistentes(dir)).toEqual([]);
  });
});
