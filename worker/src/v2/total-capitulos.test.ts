import { describe, expect, it } from "vitest";
import { resolverTotalCapitulos } from "./total-capitulos.js";

describe("resolverTotalCapitulos", () => {
  it("preserva o total canônico migrado e não inventa o capítulo 60", () => {
    expect(
      resolverTotalCapitulos({ projeto: 60, canonico: 59, payload: 60, migrado: true })
    ).toEqual({
      total: 59,
      origem: "estado_migrado",
      divergenciaProjeto: { projeto: 60, canonico: 59 },
    });
  });

  it("em projeto novo mantém a precedência explícita projeto → estado → payload", () => {
    expect(resolverTotalCapitulos({ projeto: 20, canonico: 18, payload: 16, migrado: false })?.total).toBe(20);
    expect(resolverTotalCapitulos({ canonico: 18, payload: 16, migrado: false })?.total).toBe(18);
    expect(resolverTotalCapitulos({ payload: 16, migrado: false })?.total).toBe(16);
    expect(resolverTotalCapitulos({ migrado: false })).toBeNull();
  });
});
