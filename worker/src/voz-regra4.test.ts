import { describe, it, expect } from "vitest";
import {
  garantirRegra4NoPerfil, garantirCadenciaNaEstrutura, normalizarVozRegra4,
  MARCADOR, MARCADOR_FIM,
} from "./voz-regra4.js";

const contar = (s: string, sub: string) => s.split(sub).length - 1;

describe("garantirRegra4NoPerfil", () => {
  it("injeta a cota com MARCADOR quando falta (cita cota, anti-clipe, muletas)", () => {
    const r = garantirRegra4NoPerfil("# Perfil\n\n## 1. Assinatura\n- frase curta.\n");
    expect(r.mudou).toBe(true);
    expect(r.texto).toContain(MARCADOR);
    expect(r.texto).toContain(MARCADOR_FIM);
    expect(r.texto).toMatch(/NUNCA dois colados/i);
    expect(r.texto).toMatch(/itálico:\*\* no máximo \*\*2–3/i);
    expect(r.texto).toMatch(/clipe de negação/i);
    // lista de muletas completa
    for (const m of ["coisa", "algo", "meio que", "simplesmente", "de repente", "na verdade", "parecia que"])
      expect(r.texto).toContain(m);
  });
  it("NÃO duplica: rodar 2× mantém um único bloco (marcador 1×)", () => {
    const um = garantirRegra4NoPerfil("# Perfil\n").texto;
    const dois = garantirRegra4NoPerfil(um);
    expect(dois.mudou).toBe(false);
    expect(contar(dois.texto, MARCADOR)).toBe(1);
  });
  it("idempotente com injeção LEGADA (sem marcador, ex.: 'COTA DE TIQUES')", () => {
    const legado = "# Perfil\n\n## 5. RITMO VARIADO E COTA DE TIQUES (Regra 4)\n- itálico ≤2–3.\n";
    const r = garantirRegra4NoPerfil(legado);
    expect(r.mudou).toBe(false);
    expect(r.texto).toBe(legado);
  });
});

describe("garantirCadenciaNaEstrutura", () => {
  it("injeta o bullet (com marcador) no topo de NOTAS DE EXECUÇÃO", () => {
    const t = "# Estrutura\n\n## NOTAS DE EXECUÇÃO (para o pipeline)\n\n- fair-play.\n";
    const r = garantirCadenciaNaEstrutura(t);
    expect(r.mudou).toBe(true);
    expect(r.texto).toMatch(/NOTAS DE EXECUÇÃO[^\n]*\n<!-- COTA-CADENCIA v1 -->\n- \*\*Regra 4/);
  });
  it("cria a seção quando não existe NOTAS DE EXECUÇÃO", () => {
    const r = garantirCadenciaNaEstrutura("# Estrutura\n\n## Movimento I\n- cap 1.\n");
    expect(r.mudou).toBe(true);
    expect(r.texto).toMatch(/## NOTAS DE EXECUÇÃO \(cadência\)/);
  });
  it("não duplica em 2 passadas", () => {
    const um = garantirCadenciaNaEstrutura("# E\n\n## NOTAS DE EXECUÇÃO\n- x.\n").texto;
    expect(garantirCadenciaNaEstrutura(um).mudou).toBe(false);
    expect(contar(um, MARCADOR)).toBe(1);
  });
});
