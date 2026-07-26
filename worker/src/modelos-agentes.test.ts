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

  it("política fixa: escritor Opus 5, revisor/comercial Sonnet 5, editor/contextualizador Haiku 4.5", () => {
    expect(MODELO_POR_AGENTE["livro-escritor"]).toBe("claude-opus-5");
    expect(MODELO_POR_AGENTE["livro-revisor"]).toBe("claude-sonnet-5");
    expect(MODELO_POR_AGENTE["livro-editor"]).toBe("claude-haiku-4-5-20251001");
    expect(MODELO_POR_AGENTE["livro-contextualizador"]).toBe("claude-haiku-4-5-20251001");
    expect(MODELO_POR_AGENTE["livro-arquiteto-comercial"]).toBe("claude-sonnet-5");
  });
});
