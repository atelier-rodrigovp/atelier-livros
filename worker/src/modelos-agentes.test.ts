import { describe, it, expect } from "vitest";
import { aplicarModeloFrontmatter, MODELO_POR_AGENTE } from "./modelos-agentes.js";

const fm = (corpo: string) => `---\n${corpo}\n---\n\nInstruções do agente.\n`;

describe("aplicarModeloFrontmatter", () => {
  it("troca o model: existente (opus → haiku)", () => {
    const r = aplicarModeloFrontmatter(fm("name: livro-editor\nmodel: opus\ndescription: edita"), "haiku");
    expect(r.mudou).toBe(true);
    expect(r.modeloAnterior).toBe("opus");
    expect(r.texto).toContain("model: haiku");
    expect(r.texto).not.toContain("model: opus");
  });

  it("é idempotente quando já está certo (haiku → haiku)", () => {
    const r = aplicarModeloFrontmatter(fm("name: livro-editor\nmodel: haiku"), "haiku");
    expect(r.mudou).toBe(false);
    expect(r.modeloAnterior).toBe("haiku");
  });

  it("insere model: quando falta (herança silenciosa do pai)", () => {
    const r = aplicarModeloFrontmatter(fm("name: livro-revisor\ndescription: revisa"), "sonnet");
    expect(r.mudou).toBe(true);
    expect(r.modeloAnterior).toBeNull();
    expect(r.texto).toMatch(/name: livro-revisor\nmodel: sonnet/);
  });

  it("preserva indentação da linha model:", () => {
    const r = aplicarModeloFrontmatter(fm("name: x\n  model: opus"), "haiku");
    expect(r.texto).toContain("  model: haiku");
  });

  it("não mexe em arquivo sem frontmatter", () => {
    const semFm = "# livro-editor\n\nsó prosa, sem ---\n";
    const r = aplicarModeloFrontmatter(semFm, "haiku");
    expect(r.mudou).toBe(false);
    expect(r.texto).toBe(semFm);
  });

  it("política: escritor opus, revisor sonnet, editor haiku, contextualizador haiku, comercial sonnet", () => {
    expect(MODELO_POR_AGENTE["livro-escritor"]).toBe("opus");
    expect(MODELO_POR_AGENTE["livro-revisor"]).toBe("sonnet");
    expect(MODELO_POR_AGENTE["livro-editor"]).toBe("haiku");
    expect(MODELO_POR_AGENTE["livro-contextualizador"]).toBe("haiku");
    expect(MODELO_POR_AGENTE["livro-arquiteto-comercial"]).toBe("sonnet");
  });
});
