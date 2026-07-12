import { describe, it, expect, vi } from "vitest";
import { mkdtemp, readFile, readdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

// A hidratação aceita IO injetável. O teste não pode exigir credenciais reais só
// porque o módulo também exporta o adapter de produção.
vi.mock("./supabase.js", () => ({ sb: {}, OWNER: "owner-test" }));
vi.mock("./lib.js", () => ({
  projDir: (projectId: string) => path.join(os.tmpdir(), "atelier-test", projectId),
  exists: async (p: string) => {
    try { await readFile(p); return true; } catch { return false; }
  },
}));

import { hidratarWorkDir, sintetizarEstado, destinoCapitulo, temFundacaoCompleta, type HidratarIO } from "./hidratar.js";

function fakeIO(tmp: string): HidratarIO {
  const chapBufs = new Map<string, Buffer>([
    ["k/01-Noite-30.md", Buffer.from("# Capítulo 1\n\nNoite trinta, a casa começa a contar.")],
    ["k/02-Noite-29.md", Buffer.from("# Capítulo 2\n\nNoite vinte e nove, a parede range.")],
  ]);
  const fundBufs = new Map<string, Buffer>([
    ["Biblia-da-Obra.md", Buffer.from("# Bíblia da Obra")],
    ["Estrutura-do-Livro.md", Buffer.from("# Estrutura do Livro")],
    ["perfil-de-voz.md", Buffer.from("# Perfil de Voz")],
  ]);
  return {
    async listarChapters() {
      // fora de ordem de propósito → orquestrador deve ordenar por numero
      return [
        { numero: 2, storage_path: "k/02-Noite-29.md" },
        { numero: 1, storage_path: "k/01-Noite-30.md" },
      ];
    },
    async getProjeto() {
      return { titulo: "A Casa que Conta", total_capitulos: 2, skill_escrita: "hoover-mcfadden", meta_nota: 9, piso_palavras: 1400 };
    },
    async listarFundacao() {
      return [...fundBufs.keys()];
    },
    async baixar(key) {
      return chapBufs.get(key) ?? fundBufs.get(key.split("/").pop()!) ?? null;
    },
    dir: () => tmp,
  };
}

describe("sintetizarEstado", () => {
  it("livro completo (caps ≥ total) → fase CONCLUIDO", () => {
    const e = sintetizarEstado({ titulo: "X", total_capitulos: 32, skill_escrita: "s", meta_nota: 9, piso_palavras: 1400 }, 32);
    expect(e.fase_atual).toBe("CONCLUIDO");
    expect(e.total_capitulos_previstos).toBe(32);
    expect(e.meta_nota).toBe(9);
    expect(e.importado).toBe(true);
  });
  it("parcial (caps < total) → fase ESCRITA", () => {
    expect(sintetizarEstado({ titulo: "X", total_capitulos: 32, skill_escrita: null, meta_nota: null, piso_palavras: null }, 10).fase_atual).toBe("ESCRITA");
  });
});

describe("destinoCapitulo / temFundacaoCompleta", () => {
  it("normaliza para capitulo-NN.md (NN com 2 dígitos)", () => {
    expect(destinoCapitulo(1)).toBe("capitulo-01.md");
    expect(destinoCapitulo(32)).toBe("capitulo-32.md");
  });
  it("fundação completa exige Bíblia+Estrutura+perfil", () => {
    expect(temFundacaoCompleta(["Biblia-da-Obra.md", "Estrutura-do-Livro.md", "perfil-de-voz.md"])).toBe(true);
    expect(temFundacaoCompleta(["Biblia-da-Obra.md", "Estrutura-do-Livro.md"])).toBe(false);
  });
});

describe("hidratarWorkDir", () => {
  it("baixa capítulos (capitulo-NN.md), fundação, semeia ESTADO e consolida MESTRE", async () => {
    const tmp = await mkdtemp(path.join(os.tmpdir(), "hidratar-"));
    const io = fakeIO(tmp);
    const r = await hidratarWorkDir("p1", io);

    expect(r.capitulos).toBe(2);
    expect(r.baixados).toBe(2);
    expect(r.temFundacao).toBe(true);
    expect(r.estadoSemeado).toBe(true);
    expect(r.mestre).toBe(true);

    const man = path.join(tmp, "manuscrito");
    const arquivos = await readdir(man);
    expect(arquivos).toContain("capitulo-01.md");
    expect(arquivos).toContain("capitulo-02.md");
    expect(arquivos).toContain("MANUSCRITO-MESTRE.md");

    // ordem correta por numero (não pela ordem de listarChapters)
    expect(await readFile(path.join(man, "capitulo-01.md"), "utf8")).toContain("Noite trinta");
    expect(await readFile(path.join(man, "capitulo-02.md"), "utf8")).toContain("vinte e nove");

    const estado = JSON.parse(await readFile(path.join(tmp, "ESTADO_LIVRO.json"), "utf8"));
    expect(estado.fase_atual).toBe("CONCLUIDO");
    expect(estado.total_capitulos_previstos).toBe(2);
    expect(estado.importado).toBe(true);

    expect(await readFile(path.join(tmp, "Biblia-da-Obra.md"), "utf8")).toContain("Bíblia");

    const mestre = await readFile(path.join(man, "MANUSCRITO-MESTRE.md"), "utf8");
    expect(mestre).toContain("Noite trinta");
    expect(mestre).toContain("vinte e nove");
  });

  it("idempotente: 2ª passada não rebaixa nem re-semeia", async () => {
    const tmp = await mkdtemp(path.join(os.tmpdir(), "hidratar-"));
    const io = fakeIO(tmp);
    await hidratarWorkDir("p1", io);
    const r2 = await hidratarWorkDir("p1", io);
    expect(r2.baixados).toBe(0);
    expect(r2.estadoSemeado).toBe(false);
    expect(r2.capitulos).toBe(2);
  });
});
