import { describe, it, expect } from "vitest";
import { parseReview, parseTable, renderBody } from "./reviewReport";

const MD = `# Avaliação Editorial — *A Biblioteca Afogada* (Vol. 1)

> Skill: \`book-bestseller-review\` · Avaliação independente · pt-BR
> Meta de nota do projeto: 9.0

## Contrato de honestidade

Não inflo a nota para alcançar a meta. A nota mede o que está na página agora.

## NOTA GLOBAL: **7.3 / 10**

**Veredito:** *Polish stage* — núcleo competitivo. Está **1.7 abaixo da meta do projeto (9.0)**.

## NOTAS POR CRITÉRIO

| # | Dimensão | Peso | Nota | Síntese |
|---|----------|------|------|---------|
| 1 | Hook | major 1.5× | **7** | Suspense de primeira. |
| 2 | Premissa | major 1.5× | **8** | Fresco e vendável. |

## PONTOS FORTES (proteger na revisão — não tocar)

- Prosa madura e imagética.
- Premissa original.

## PONTOS FRACOS — LISTA PRIORIZADA E ACIONÁVEL

### ALTA prioridade

**1. O relógio jurídico não fecha.**
- *Problema:* contradição temporal.
- *Onde:* cap 4, 25, 31.
- *O que mudar:* separar os instrumentos.

**2. Maneirismo de prosa repetido.**
- *Problema:* tique recorrente.

### MÉDIA prioridade

**3. PdV oscila no cap 9.**

## PACOTE COMERCIAL (referência)

Título e sinopse fortes.`;

describe("parseReview", () => {
  const m = parseReview(MD);
  it("extrai nota, veredito, meta e gap", () => {
    expect(m.nota).toBe(7.3);
    expect(m.veredito).toBe("Polish stage");
    expect(m.meta).toBe(9.0);
    expect(m.gap).toBe(1.7);
  });
  it("extrai os top fixes (ALTA prioridade)", () => {
    expect(m.topFixes).toEqual(["O relógio jurídico não fecha", "Maneirismo de prosa repetido"]);
  });
  it("parseia a tabela de critérios", () => {
    expect(m.criterios?.headers[0]).toBe("#");
    expect(m.criterios?.rows.length).toBe(2);
    expect(m.criterios?.rows[1][3]).toContain("8");
  });
  it("separa fortes, fracos por prioridade e metodologia ao fim", () => {
    expect(m.fortesHtml).toContain("<li>");
    expect(m.fracos.map((f) => f.prioridade)[0]).toMatch(/ALTA/);
    expect(m.fracos.length).toBe(2);
    expect(m.metodologiaHtml).toMatch(/honestidade/i);
  });
  it("não vaza metodologia para as seções de leitura", () => {
    expect(m.outras.find((s) => /honestidade/i.test(s.titulo))).toBeUndefined();
    expect(m.outras.find((s) => /PACOTE COMERCIAL/i.test(s.titulo))).toBeTruthy();
  });
});

describe("renderBody / parseTable", () => {
  it("renderiza listas e negrito sem <pre>", () => {
    const html = renderBody("- um **forte**\n- dois");
    expect(html).toContain("<ul>");
    expect(html).toContain("<strong>forte</strong>");
    expect(html).not.toContain("<pre>");
  });
  it("ignora linha separadora da tabela", () => {
    const t = parseTable("| a | b |\n|---|---|\n| 1 | 2 |")!;
    expect(t.headers).toEqual(["a", "b"]);
    expect(t.rows).toEqual([["1", "2"]]);
  });
});
