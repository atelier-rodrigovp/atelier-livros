// Testes do módulo determinístico de edição estrutural (estrutural.ts).
// Validação estrita + aplicação de corte/reordenação nos arquivos do manuscrito.
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { aplicarEdicaoEstrutural, validarPropostas, type PropostaEstrutural } from "./estrutural.js";

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), "engine-v2-estrut-"));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

function semear(total: number): void {
  mkdirSync(dir, { recursive: true });
  for (let n = 1; n <= total; n++) {
    writeFileSync(path.join(dir, `capitulo-${String(n).padStart(2, "0")}.md`), `## Capítulo ${n}\n\nConteúdo original ${n}.`, "utf8");
  }
}

function ler(n: number): string {
  return readFileSync(path.join(dir, `capitulo-${String(n).padStart(2, "0")}.md`), "utf8");
}

function plano(tipo: PropostaEstrutural["tipo"], extra: Partial<PropostaEstrutural> = {}): { schema: "structural-edit/v1"; propostas: unknown[] } {
  return { schema: "structural-edit/v1", propostas: [{ tipo, capitulos: [], justificativa: "motivo estrutural", ...extra }] };
}

describe("validarPropostas", () => {
  it("aceita 'nenhuma' como no-op válido", () => {
    const v = validarPropostas(plano("nenhuma"), 3);
    expect(v.propostas[0].tipo).toBe("nenhuma");
  });

  it("rejeita permutação incompleta na reordenação", () => {
    expect(() => validarPropostas(plano("reordenacao", { capitulos: [1, 2, 3], nova_ordem: [1, 2] }), 3)).toThrow(/permutação incompleta|itens/);
  });

  it("rejeita duplicata na nova_ordem", () => {
    expect(() => validarPropostas(plano("reordenacao", { capitulos: [1, 2, 3], nova_ordem: [1, 1, 3] }), 3)).toThrow(/duplicata/);
  });

  it("rejeita corte de capítulo inexistente", () => {
    expect(() => validarPropostas(plano("corte", { capitulos: [5] }), 3)).toThrow(/não existe/);
  });

  it("rejeita corte duplicado do mesmo capítulo em cortes distintos", () => {
    const p = { schema: "structural-edit/v1", propostas: [
      { tipo: "corte", capitulos: [2], justificativa: "a" },
      { tipo: "corte", capitulos: [2], justificativa: "b" },
    ] };
    expect(() => validarPropostas(p, 3)).toThrow(/mais de uma vez/);
  });

  it("valida nova_ordem contra o conjunto PÓS-corte (corte + reordenação)", () => {
    const ok = {
      schema: "structural-edit/v1",
      propostas: [
        { tipo: "corte", capitulos: [2], justificativa: "redundante" },
        { tipo: "reordenacao", capitulos: [1, 3], nova_ordem: [3, 1], justificativa: "melhor sequência" },
      ],
    };
    expect(validarPropostas(ok, 3).propostas).toHaveLength(2);

    const ruim = {
      schema: "structural-edit/v1",
      propostas: [
        { tipo: "corte", capitulos: [2], justificativa: "redundante" },
        { tipo: "reordenacao", capitulos: [1, 3], nova_ordem: [1, 2, 3], justificativa: "inclui o cortado" },
      ],
    };
    expect(() => validarPropostas(ruim, 3)).toThrow(/inexistente ou cortado|incompleta/);
  });
});

describe("aplicarEdicaoEstrutural", () => {
  it("'nenhuma' é no-op: arquivos intactos e mapa vazio", () => {
    semear(3);
    const antes = [ler(1), ler(2), ler(3)];
    const rel = aplicarEdicaoEstrutural({ dirManuscrito: dir, propostas: [{ tipo: "nenhuma", capitulos: [], justificativa: "sólido" }], total: 3 });
    expect(rel.aplicadas).toEqual([]);
    expect(rel.mapa).toEqual({});
    expect(rel.totalFinal).toBe(3);
    expect([ler(1), ler(2), ler(3)]).toEqual(antes);
  });

  it("reordenação troca 1↔2 renumerando os arquivos corretamente", () => {
    semear(2);
    const c1 = ler(1);
    const c2 = ler(2);
    const rel = aplicarEdicaoEstrutural({
      dirManuscrito: dir,
      propostas: [{ tipo: "reordenacao", capitulos: [1, 2], nova_ordem: [2, 1], justificativa: "melhor abertura" }],
      total: 2,
    });
    expect(rel.mapa).toEqual({ 2: 1, 1: 2 });
    expect(rel.totalFinal).toBe(2);
    expect(ler(1)).toBe(c2); // o antigo capítulo 2 vira o 1
    expect(ler(2)).toBe(c1);
  });

  it("corte move para _cortados e renumera o restante", () => {
    semear(3);
    const c1 = ler(1);
    const c3 = ler(3);
    const rel = aplicarEdicaoEstrutural({
      dirManuscrito: dir,
      propostas: [{ tipo: "corte", capitulos: [2], justificativa: "capítulo redundante" }],
      total: 3,
    });
    expect(rel.mapa).toEqual({ 1: 1, 3: 2 });
    expect(rel.totalFinal).toBe(2);
    expect(ler(1)).toBe(c1);
    expect(ler(2)).toBe(c3); // o antigo 3 vira 2
    expect(existsSync(path.join(dir, "capitulo-03.md"))).toBe(false);
    expect(existsSync(path.join(dir, "_cortados", "capitulo-02.md"))).toBe(true);
  });

  it("duas aplicações do mesmo plano não corrompem: a segunda é no-op", () => {
    semear(2);
    const c1 = ler(1);
    const c2 = ler(2);
    const propostas: PropostaEstrutural[] = [{ tipo: "reordenacao", capitulos: [1, 2], nova_ordem: [2, 1], justificativa: "troca" }];
    aplicarEdicaoEstrutural({ dirManuscrito: dir, propostas, total: 2 });
    const depoisPrimeira = [ler(1), ler(2)];
    expect(depoisPrimeira).toEqual([c2, c1]);

    const rel2 = aplicarEdicaoEstrutural({ dirManuscrito: dir, propostas, total: 2 });
    expect(rel2.aplicadas).toEqual([]); // não reaplica
    expect(rel2.mapa).toEqual({});
    expect([ler(1), ler(2)]).toEqual(depoisPrimeira); // NÃO desfaz a troca
  });
});
