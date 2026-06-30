import { describe, it, expect } from "vitest";
import {
  garantirCraftLeituraEscritor, garantirPropulsaoRevisor,
  MARCADOR_CRAFT_LEITURA, MARCADOR_PROPULSAO,
} from "./craft-agentes.js";

const contar = (s: string, sub: string) => s.split(sub).length - 1;

const ESCRITOR = `---
name: livro-escritor
model: opus
---
## Entradas
1. contexto/contexto-cap-NN.md — o digest.
3. perfil-de-voz.md.

Não releia os documentos integrais da fundação — o digest já traz o necessário.

## Saída
Grave em manuscrito/capitulo-NN.md.
`;

describe("garantirCraftLeituraEscritor", () => {
  it("injeta o bloco de leitura de craft + neutraliza o 'não releia'", () => {
    const r = garantirCraftLeituraEscritor(ESCRITOR);
    expect(r.mudou).toBe(true);
    expect(r.texto).toContain(MARCADOR_CRAFT_LEITURA);
    expect(r.texto).toContain("<!-- /CRAFT-LEITURA -->");
    expect(r.texto).toMatch(/voz-e-oficio\.md/);
    expect(r.texto).toMatch(/metamodelo-thriller\.md/);
    // a linha blanket foi neutralizada
    expect(r.texto).not.toMatch(/Não releia os documentos integrais da fundação — o digest já traz/);
    expect(r.texto).toMatch(/a VOZ\/TÉCNICA você lê a CADA capítulo/);
  });
  it("idempotente (marcador 1×)", () => {
    const um = garantirCraftLeituraEscritor(ESCRITOR).texto;
    const dois = garantirCraftLeituraEscritor(um);
    expect(dois.mudou).toBe(false);
    expect(contar(dois.texto, MARCADOR_CRAFT_LEITURA)).toBe(1);
  });
});

describe("garantirPropulsaoRevisor", () => {
  it("injeta o veredito de propulsão (reprova 'competente e chato')", () => {
    const r = garantirPropulsaoRevisor("---\nname: livro-revisor\nmodel: sonnet\n---\n## Checklist\n- [ ] PdV.\n");
    expect(r.mudou).toBe(true);
    expect(r.texto).toContain(MARCADOR_PROPULSAO);
    expect(r.texto).toMatch(/ISTO ESTÁ VIVO/);
    expect(r.texto).toMatch(/corta no PICO/);
    expect(r.texto).toMatch(/avança a cena ou só decora/);
  });
  it("idempotente", () => {
    const um = garantirPropulsaoRevisor("# rev\n").texto;
    expect(garantirPropulsaoRevisor(um).mudou).toBe(false);
    expect(contar(um, MARCADOR_PROPULSAO)).toBe(1);
  });
});
