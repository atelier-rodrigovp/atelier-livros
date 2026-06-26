import { describe, it, expect } from "vitest";
import { sanitizarCapitulo, metaResidual } from "./sanitize.js";

describe("sanitizarCapitulo — remove meta-texto", () => {
  it("remove o comentário HTML real do incidente (cap. 30)", () => {
    const entrada =
      "# Capítulo 30\n\nA água subia pelas estantes.\n\n" +
      "<!-- nota: skill-dan-brown ausente no ambiente (~/.claude/skills/ não contém skill-dan-brown); fallback perfil-de-voz.md declarado e aplicado. -->\n";
    const { texto, removidos } = sanitizarCapitulo(entrada);
    expect(texto).not.toContain("<!--");
    expect(texto).not.toContain("skill-dan-brown");
    expect(texto).toContain("A água subia pelas estantes.");
    expect(removidos.length).toBeGreaterThan(0);
    expect(metaResidual(texto)).toBeNull();
  });

  it("remove comentário HTML multilinha", () => {
    const entrada = "Prosa antes.\n<!--\nnota interna\nmais nota\n-->\nProsa depois.\n";
    const { texto } = sanitizarCapitulo(entrada);
    expect(texto).not.toContain("<!--");
    expect(texto).toContain("Prosa antes.");
    expect(texto).toContain("Prosa depois.");
  });

  it("remove bloco de código markdown (fence)", () => {
    const entrada = "Texto.\n\n```python\nprint('debug')\n```\n\nMais texto.\n";
    const { texto } = sanitizarCapitulo(entrada);
    expect(texto).not.toContain("```");
    expect(texto).toContain("Texto.");
    expect(texto).toContain("Mais texto.");
    expect(metaResidual(texto)).toBeNull();
  });

  it("remove linha de chatter 'fallback perfil-de-voz.md aplicado'", () => {
    const entrada = "Capítulo bom.\nfallback perfil-de-voz.md aplicado\nFim.\n";
    const { texto } = sanitizarCapitulo(entrada);
    expect(texto).not.toMatch(/fallback/i);
    expect(texto).not.toContain("perfil-de-voz.md");
    expect(texto).toContain("Capítulo bom.");
    expect(texto).toContain("Fim.");
  });

  it("remove linhas [system], DEBUG e TODO:", () => {
    const entrada = "Prosa.\n[system] reset\nDEBUG x=1\nTODO: revisar\nMais prosa.\n";
    const { texto } = sanitizarCapitulo(entrada);
    expect(texto).not.toContain("[system]");
    expect(texto).not.toContain("DEBUG");
    expect(texto).not.toContain("TODO:");
    expect(texto).toContain("Prosa.");
    expect(texto).toContain("Mais prosa.");
  });
});

describe("sanitizarCapitulo — NÃO cria falso positivo na prosa", () => {
  it("preserva 'tomou nota:', itálicos e travessões", () => {
    const prosa =
      "# Capítulo 1\n\n" +
      "O cientista tomou nota: a *figura* na página parecia respirar.\n" +
      "— Você viu isso? — perguntou ela, em itálico no diário.\n" +
      "Uma nota de rodapé antiga falava de um sistema esquecido.\n";
    const { texto, removidos } = sanitizarCapitulo(prosa);
    expect(texto).toBe(prosa);
    expect(removidos).toHaveLength(0);
    expect(metaResidual(texto)).toBeNull();
  });

  it("não altera diálogo que mencione 'nota' ou 'sistema'", () => {
    const prosa = "Ela anotou tudo. O sistema falhara, mas a história seguia.\n";
    const { texto, removidos } = sanitizarCapitulo(prosa);
    expect(texto).toBe(prosa);
    expect(removidos).toHaveLength(0);
  });
});

describe("metaResidual — gate", () => {
  it("rejeita comentário HTML não fechado", () => {
    expect(metaResidual("prosa\n<!-- meta sem fim\nmais prosa")).not.toBeNull();
  });
  it("rejeita cerca de código órfã", () => {
    expect(metaResidual("prosa\n```\ncodigo sem par")).not.toBeNull();
  });
  it("aceita prosa limpa", () => {
    expect(metaResidual("Era uma vez uma biblioteca afogada.\n")).toBeNull();
  });
});
