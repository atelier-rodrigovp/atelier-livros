import { describe, it, expect } from "vitest";
import {
  garantirCraftNoPerfil, blocoOrcamentoPagina,
  MARCADOR_CRAFT, MARCADOR_CRAFT_V2, MARCADOR_CRAFT_FIM,
} from "./craft-skill.js";

const contar = (s: string, sub: string) => s.split(sub).length - 1;
const PERFIL = "# Perfil\n\n## 1. Assinatura\n- frase curta.\n";

describe("garantirCraftNoPerfil", () => {
  it("injeta o bloco da dan-brown (motor + 5 regras + ORÇAMENTO) quando falta", () => {
    const r = garantirCraftNoPerfil(PERFIL, "skill-dan-brown");
    expect(r.mudou).toBe(true);
    expect(r.texto).toContain(MARCADOR_CRAFT_V2);
    expect(r.texto).toMatch(/Montagem paralela/);
    expect(r.texto).toMatch(/Fair-play honesto/);
    expect(r.texto).toMatch(/Sem coincidência/);
    expect(r.texto).toMatch(/corte no PICO/);
    // SPEC-06: os números do gate chegam à caneta
    expect(r.texto).toMatch(/ORÇAMENTO DE PÁGINA/);
    expect(r.texto).toMatch(/"coisa"\/"coisas" ≤1/);
    expect(r.texto).toMatch(/símile-andaime/);
    // SPEC-09: sem banda de palavras conflitante com a Estrutura
    expect(r.texto).not.toMatch(/1\.300–2\.200/);
  });

  it("é AGNÓSTICO: jk-rowling injeta bloco DIFERENTE (imersão, não montagem)", () => {
    const r = garantirCraftNoPerfil(PERFIL, "skill-jk-rowling");
    expect(r.mudou).toBe(true);
    expect(r.texto).toMatch(/prosa imersiva|imersão calorosa/i);
    expect(r.texto).not.toMatch(/Montagem paralela/); // craft do Brown não vaza
  });

  it("orçamento usa os NÚMEROS DA SKILL (hoover ganha a folga da cadência rápida)", () => {
    const brown = blocoOrcamentoPagina("skill-dan-brown");
    const hoover = blocoOrcamentoPagina("hoover-mcfadden");
    expect(brown).toMatch(/fragmentos de ênfase ≤2 \(nunca dois colados\)/);
    expect(brown).toMatch(/até ~35% da narração/);
    expect(hoover).toMatch(/fragmentos de ênfase ≤20/);
    expect(hoover).toMatch(/até ~55% da narração/);
  });

  it("idempotente: 2ª passada não duplica (marcador 1×)", () => {
    const um = garantirCraftNoPerfil(PERFIL, "skill-dan-brown").texto;
    const dois = garantirCraftNoPerfil(um, "skill-dan-brown");
    expect(dois.mudou).toBe(false);
    expect(contar(dois.texto, MARCADOR_CRAFT_V2)).toBe(1);
  });

  it("UPGRADE v1→v2: bloco legado ganha o orçamento in-place, sem duplicar", () => {
    // simula perfil injetado antes da SPEC-06 (marcador v1, sem orçamento)
    const v1 =
      PERFIL + `\n${MARCADOR_CRAFT}\n\n## CRAFT DA SKILL \`skill-dan-brown\`\n\n` +
      `### Motor\n- Capítulo curto.\n\n${MARCADOR_CRAFT_FIM}\n`;
    const r = garantirCraftNoPerfil(v1, "skill-dan-brown");
    expect(r.mudou).toBe(true);
    expect(r.texto).toContain(MARCADOR_CRAFT_V2);
    expect(r.texto).not.toContain(`${MARCADOR_CRAFT}\n`); // v1 promovido
    expect(r.texto).toMatch(/ORÇAMENTO DE PÁGINA/);
    expect(contar(r.texto, "## CRAFT DA SKILL")).toBe(1); // sem bloco duplicado
    expect(garantirCraftNoPerfil(r.texto, "skill-dan-brown").mudou).toBe(false); // idempotente
  });

  it("skill desconhecida / nula → no-op (não inventa craft)", () => {
    expect(garantirCraftNoPerfil(PERFIL, "nenhuma").mudou).toBe(false);
    expect(garantirCraftNoPerfil(PERFIL, null).mudou).toBe(false);
    expect(garantirCraftNoPerfil(PERFIL, undefined).mudou).toBe(false);
  });
});
