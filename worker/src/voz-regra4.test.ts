import { describe, it, expect } from "vitest";
import {
  garantirRegra4NoPerfil, garantirCadenciaNaEstrutura, normalizarVozRegra4,
  garantirGuardaModelos, escanearMuletasNosModelos, MARCADOR, MARCADOR_FIM, MARCADOR_GUARDA,
} from "./voz-regra4.js";

const PERFIL_MODELOS = (modeloA: string) =>
  `# Perfil\n\n## 2. PARÁGRAFOS-MODELO (ALVO — emular, nunca copiar)\n> Originais para esta obra.\n\n` +
  `**Modelo A:**\n> ${modeloA}\n*Assinatura aqui:* nota.\n\n## 3. Outra seção\n- x.\n`;

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

describe("garantirGuardaModelos", () => {
  it("injeta a guarda (com marcador) logo após o cabeçalho da §2", () => {
    const r = garantirGuardaModelos(PERFIL_MODELOS("Frase modelo limpa."));
    expect(r.mudou).toBe(true);
    expect(r.texto).toMatch(/PARÁGRAFOS-MODELO[^\n]*\n<!-- GUARDA-MODELOS v1 -->\n> \*\*Guarda/);
    expect(r.texto).toMatch(/não reproduza muleta/i);
  });
  it("não duplica em 2 passadas (marcador 1×)", () => {
    const um = garantirGuardaModelos(PERFIL_MODELOS("limpa.")).texto;
    expect(garantirGuardaModelos(um).mudou).toBe(false);
    expect(contar(um, MARCADOR_GUARDA)).toBe(1);
  });
  it("não inventa seção quando não há §2 PARÁGRAFOS-MODELO", () => {
    expect(garantirGuardaModelos("# Perfil\n\n## 1. Assinatura\n- x.\n").mudou).toBe(false);
  });
});

describe("escanearMuletasNosModelos", () => {
  it("FLAGA muleta dentro de um parágrafo-modelo", () => {
    const hits = escanearMuletasNosModelos(PERFIL_MODELOS("A primeira coisa que ele pensa é fugir."));
    expect(hits.find((h) => /coisa/.test(h.termo))?.n).toBe(1);
  });
  it("modelo limpo → sem hits", () => {
    expect(escanearMuletasNosModelos(PERFIL_MODELOS("O primeiro pensamento é fugir."))).toEqual([]);
  });
  it("NÃO conta os exemplos citados na própria linha de guarda", () => {
    const comGuarda = garantirGuardaModelos(PERFIL_MODELOS("Frase limpa.")).texto;
    expect(escanearMuletasNosModelos(comGuarda)).toEqual([]);
  });
});
