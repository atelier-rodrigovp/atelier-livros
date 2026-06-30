import { describe, it, expect } from "vitest";
import { garantirCraftNoPerfil, MARCADOR_CRAFT } from "./craft-skill.js";

const contar = (s: string, sub: string) => s.split(sub).length - 1;
const PERFIL = "# Perfil\n\n## 1. Assinatura\n- frase curta.\n";

describe("garantirCraftNoPerfil", () => {
  it("injeta o bloco da dan-brown (motor + 5 regras) quando falta", () => {
    const r = garantirCraftNoPerfil(PERFIL, "skill-dan-brown");
    expect(r.mudou).toBe(true);
    expect(r.texto).toContain(MARCADOR_CRAFT);
    expect(r.texto).toMatch(/Montagem paralela/);
    expect(r.texto).toMatch(/Fair-play honesto/);
    expect(r.texto).toMatch(/Sem coincidência/);
    expect(r.texto).toMatch(/corte no PICO/);
  });

  it("é AGNÓSTICO: jk-rowling injeta bloco DIFERENTE (imersão, não montagem)", () => {
    const r = garantirCraftNoPerfil(PERFIL, "skill-jk-rowling");
    expect(r.mudou).toBe(true);
    expect(r.texto).toMatch(/prosa imersiva|imersão calorosa/i);
    expect(r.texto).not.toMatch(/Montagem paralela/); // craft do Brown não vaza
  });

  it("idempotente: 2ª passada não duplica (marcador 1×)", () => {
    const um = garantirCraftNoPerfil(PERFIL, "skill-dan-brown").texto;
    const dois = garantirCraftNoPerfil(um, "skill-dan-brown");
    expect(dois.mudou).toBe(false);
    expect(contar(dois.texto, MARCADOR_CRAFT)).toBe(1);
  });

  it("skill desconhecida / nula → no-op (não inventa craft)", () => {
    expect(garantirCraftNoPerfil(PERFIL, "nenhuma").mudou).toBe(false);
    expect(garantirCraftNoPerfil(PERFIL, null).mudou).toBe(false);
    expect(garantirCraftNoPerfil(PERFIL, undefined).mudou).toBe(false);
  });
});
