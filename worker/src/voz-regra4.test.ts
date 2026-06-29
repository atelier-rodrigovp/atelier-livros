import { describe, it, expect } from "vitest";
import { garantirRegra4NoPerfil, garantirCadenciaNaEstrutura } from "./voz-regra4.js";

describe("garantirRegra4NoPerfil", () => {
  it("injeta a cota Regra 4 quando falta (cita 'nunca dois colados' e 'coisa')", () => {
    const r = garantirRegra4NoPerfil("# Perfil\n\n## 1. Assinatura\n- frase curta.\n");
    expect(r.mudou).toBe(true);
    expect(r.texto).toMatch(/NUNCA dois colados/i);
    expect(r.texto).toMatch(/itálico.*máximo.*2–3|máximo.*2–3/i);
    expect(r.texto).toMatch(/"coisa".*1 por capítulo/i);
  });
  it("é idempotente quando já tem a seção (heading 'COTA DE TIQUES')", () => {
    const base = "# Perfil\n\n## 5. RITMO VARIADO E COTA DE TIQUES (Regra 4)\n- itálico ≤2–3.\n";
    const r = garantirRegra4NoPerfil(base);
    expect(r.mudou).toBe(false);
    expect(r.texto).toBe(base);
  });
  it("é idempotente quando já menciona 'Regra 4'", () => {
    expect(garantirRegra4NoPerfil("...política da Regra 4 aqui...").mudou).toBe(false);
  });
});

describe("garantirCadenciaNaEstrutura", () => {
  it("injeta o bullet no topo de NOTAS DE EXECUÇÃO", () => {
    const t = "# Estrutura\n\n## NOTAS DE EXECUÇÃO (para o pipeline)\n\n- fair-play.\n";
    const r = garantirCadenciaNaEstrutura(t);
    expect(r.mudou).toBe(true);
    // bullet entra logo após o cabeçalho da seção, antes do '- fair-play.'
    expect(r.texto).toMatch(/NOTAS DE EXECUÇÃO[^\n]*\n- \*\*Regra 4/);
    expect(r.texto).toMatch(/nunca dois colados/);
  });
  it("cria a seção quando não existe NOTAS DE EXECUÇÃO", () => {
    const r = garantirCadenciaNaEstrutura("# Estrutura\n\n## Movimento I\n- cap 1.\n");
    expect(r.mudou).toBe(true);
    expect(r.texto).toMatch(/## NOTAS DE EXECUÇÃO \(cadência\)/);
  });
  it("é idempotente quando já tem Regra 4", () => {
    const t = "# Estrutura\n\n## NOTAS DE EXECUÇÃO\n- **Regra 4 (cadência):** já existe.\n";
    expect(garantirCadenciaNaEstrutura(t).mudou).toBe(false);
  });
});
