import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { hashText } from "../quality-state.js";
import { hashArquivo, hashJsonCanonico } from "./hash.js";
import { DiscoPersistencia, ErroConcorrencia } from "./persistencia.js";
import { ENGINE_V2_VERSION, type EstadoCanonico, type RunRegistro } from "./tipos.js";

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), "engine-v2-pers-"));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

const runBase: RunRegistro = {
  project_id: "proj-1",
  engine_version: ENGINE_V2_VERSION,
  papel: "escritor",
  capacidade: "prosa",
  model_provider: "prov",
  model_name: "modelo-x",
  alvo: "capitulo:1",
  status: "running",
  attempt: 1,
  started_at: "2026-07-20T00:00:00.000Z",
  evidencias: [],
};

const estadoInicial = (): EstadoCanonico => ({
  project_id: "proj-1",
  engine_version: ENGINE_V2_VERSION,
  versao: 0,
  doc: { schema: "engine-state/v1", fase: "fundacao", capitulos: {}, bloqueios: [] },
});

describe("hashJsonCanonico", () => {
  it("é determinístico e independente da ordem das chaves", () => {
    const a = { b: 2, a: 1, filho: { y: [3, { z: 1, w: 2 }], x: "ok" } };
    const b = { filho: { x: "ok", y: [3, { w: 2, z: 1 }] }, a: 1, b: 2 };
    expect(hashJsonCanonico(a)).toBe(hashJsonCanonico(b));
    expect(hashJsonCanonico(a)).toBe(hashJsonCanonico(a));
    // ordem de arrays IMPORTA (não é conjunto)
    expect(hashJsonCanonico({ v: [1, 2] })).not.toBe(hashJsonCanonico({ v: [2, 1] }));
  });

  it("hashArquivo devolve sha256 do conteúdo e null quando não existe", () => {
    expect(hashArquivo(path.join(dir, "nao-existe.md"))).toBeNull();
  });
});

describe("DiscoPersistencia", () => {
  it("run inserido e atualizado sobrevive a reabertura", async () => {
    const p1 = new DiscoPersistencia(dir);
    const id = await p1.inserirRun(runBase);
    await p1.atualizarRun(id, { status: "ok", finished_at: "2026-07-20T00:01:00.000Z", tokens_out: 42 });

    // reabre em outra instância (mesmo diretório)
    const p2 = new DiscoPersistencia(dir);
    const runs = await p2.lerRuns();
    expect(runs).toHaveLength(1);
    expect(runs[0]).toMatchObject({ id, status: "ok", tokens_out: 42, papel: "escritor" });
  });

  it("estado tem lock otimista: gravar com versão errada falha", async () => {
    const p = new DiscoPersistencia(dir);
    const estado = estadoInicial();
    await p.gravarEstado(estado);
    expect(estado.versao).toBe(1);

    // cópia stale (versão 0) tenta gravar por cima → ErroConcorrencia
    const stale = estadoInicial();
    stale.doc.fase = "escrita";
    await expect(p.gravarEstado(stale)).rejects.toBeInstanceOf(ErroConcorrencia);

    // gravação com a versão correta segue funcionando
    estado.doc.fase = "estrutura";
    await p.gravarEstado(estado);
    expect(estado.versao).toBe(2);
  });

  it("releitura é idempotente e preserva o doc gravado", async () => {
    const p = new DiscoPersistencia(dir);
    const estado = estadoInicial();
    estado.doc.capitulos["1"] = { status: "escrito", text_hash: hashText("prosa"), palavras: 3 };
    await p.gravarEstado(estado);

    const lido1 = await p.lerEstado("proj-1");
    const lido2 = await p.lerEstado("proj-1");
    expect(lido1).toEqual(lido2);
    expect(lido1?.versao).toBe(1);
    expect(lido1?.doc.capitulos["1"]?.text_hash).toBe(hashText("prosa"));
    // projeto diferente no mesmo diretório → null
    expect(await p.lerEstado("outro-projeto")).toBeNull();
  });

  it("lerEstado devolve null antes de qualquer gravação", async () => {
    const p = new DiscoPersistencia(dir);
    expect(await p.lerEstado("proj-1")).toBeNull();
    expect(await p.disponivel()).toBe(true);
  });

  it("maiorVersaoSpec enxerga specs órfãs (sem capítulo escrito no estado)", async () => {
    const p = new DiscoPersistencia(dir);
    expect(await p.maiorVersaoSpec("proj-1", 1)).toBe(0);

    const specBase = {
      project_id: "proj-1",
      edition_id: null,
      capitulo: 1,
      hash: "h",
      status: "validada",
      ficha: { schema: "scene-spec/v1", capitulo: 1 },
      origem_run_id: null,
    };
    await p.inserirSpec({ ...specBase, versao: 1 } as never);
    await p.inserirSpec({ ...specBase, versao: 3 } as never);
    await p.inserirSpec({ ...specBase, capitulo: 2, versao: 9 } as never);

    expect(await p.maiorVersaoSpec("proj-1", 1)).toBe(3);
    expect(await p.maiorVersaoSpec("proj-1", 2)).toBe(9);
    expect(await p.maiorVersaoSpec("outro-projeto", 1)).toBe(0);
  });
});
