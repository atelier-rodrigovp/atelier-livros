// Testes do módulo determinístico de edição estrutural (estrutural.ts).
// Validação estrita + aplicação de corte/reordenação nos arquivos do manuscrito.
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { aplicarEdicaoEstrutural, fundirTextosCapitulos, reverterEdicaoEstrutural, validarPropostas, type PropostaEstrutural } from "./estrutural.js";

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

  it("fusão exige capítulos adjacentes, crescentes, disjuntos e não cortados", () => {
    expect(validarPropostas(plano("fusao", { capitulos: [2, 3] }), 4).propostas[0].tipo).toBe("fusao");
    expect(() => validarPropostas(plano("fusao", { capitulos: [1, 3] }), 4)).toThrow(/adjacentes/);
    expect(() => validarPropostas(plano("fusao", { capitulos: [3, 2] }), 4)).toThrow(/ordem crescente/);
    expect(() => validarPropostas({
      schema: "structural-edit/v1",
      propostas: [
        { tipo: "fusao", capitulos: [1, 2], justificativa: "mesma unidade" },
        { tipo: "fusao", capitulos: [2, 3], justificativa: "sobreposição" },
      ],
    }, 4)).toThrow(/mais de uma fusão/);
    expect(() => validarPropostas({
      schema: "structural-edit/v1",
      propostas: [
        { tipo: "corte", capitulos: [2], justificativa: "redundante" },
        { tipo: "fusao", capitulos: [2, 3], justificativa: "mesma unidade" },
      ],
    }, 4)).toThrow(/cortado e fundido/);
  });

  it("reordenação pós-fusão usa apenas o líder da unidade resultante", () => {
    const p = {
      schema: "structural-edit/v1",
      propostas: [
        { tipo: "fusao", capitulos: [2, 3], justificativa: "mesma unidade" },
        { tipo: "reordenacao", capitulos: [1, 2, 4], nova_ordem: [2, 1, 4], justificativa: "abertura" },
      ],
    };
    expect(validarPropostas(p, 4).propostas).toHaveLength(2);
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
    expect(rel.arquivoOriginais).toBeTruthy();
    expect(existsSync(path.join(dir, rel.arquivoOriginais!, "capitulo-02.md"))).toBe(true);
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

  it("fusão usa conteúdo pré-validado, arquiva originais e renumera sem perder prosa", () => {
    semear(4);
    const original2 = ler(2);
    const original3 = ler(3);
    const fundido = fundirTextosCapitulos([original2, original3]);
    const propostas: PropostaEstrutural[] = [{
      tipo: "fusao",
      capitulos: [2, 3],
      justificativa: "mesma unidade dramática",
    }];
    const rel = aplicarEdicaoEstrutural({
      dirManuscrito: dir,
      propostas,
      total: 4,
      conteudosFusao: { 2: fundido },
    });

    expect(rel.totalFinal).toBe(3);
    expect(rel.mapa).toEqual({ 1: 1, 2: 2, 4: 3 });
    expect(rel.fusoes).toHaveLength(1);
    expect(rel.fusoes[0]).toMatchObject({ origens: [2, 3], origemPrincipal: 2, destino: 2 });
    expect(ler(2)).toBe(fundido);
    expect(ler(2)).toContain("Conteúdo original 2.");
    expect(ler(2)).toContain("Conteúdo original 3.");
    expect(ler(2).match(/^## Capítulo/gm)).toHaveLength(1);
    expect(ler(3)).toContain("Conteúdo original 4.");
    expect(existsSync(path.join(dir, rel.arquivoOriginais!, "capitulo-02.md"))).toBe(true);
    expect(existsSync(path.join(dir, rel.arquivoOriginais!, "capitulo-03.md"))).toBe(true);
  });

  it("fusão sem conteúdo aprovado falha antes de mover qualquer arquivo", () => {
    semear(2);
    const antes = [ler(1), ler(2)];
    expect(() =>
      aplicarEdicaoEstrutural({
        dirManuscrito: dir,
        propostas: [{ tipo: "fusao", capitulos: [1, 2], justificativa: "mesma unidade" }],
        total: 2,
      })
    ).toThrow(/conteúdo pré-validado/);
    expect([ler(1), ler(2)]).toEqual(antes);
  });

  it("rollback restaura todos os originais e preserva a edição revertida", () => {
    semear(2);
    const antes = [ler(1), ler(2)];
    const rel = aplicarEdicaoEstrutural({
      dirManuscrito: dir,
      propostas: [{ tipo: "reordenacao", capitulos: [1, 2], nova_ordem: [2, 1], justificativa: "troca" }],
      total: 2,
    });
    reverterEdicaoEstrutural({
      dirManuscrito: dir,
      assinatura: rel.assinatura!,
      arquivoOriginais: rel.arquivoOriginais!,
      totalOriginal: 2,
      totalFinal: 2,
    });
    expect([ler(1), ler(2)]).toEqual(antes);
    expect(existsSync(path.join(dir, "_edicoes", rel.assinatura!, "revertido", "capitulo-01.md"))).toBe(true);

    const nova = aplicarEdicaoEstrutural({
      dirManuscrito: dir,
      propostas: [{ tipo: "reordenacao", capitulos: [1, 2], nova_ordem: [2, 1], justificativa: "troca" }],
      total: 2,
    });
    expect(nova.aplicadas.length).toBeGreaterThan(0);
    expect([ler(1), ler(2)]).toEqual([antes[1], antes[0]]);
  });
});
