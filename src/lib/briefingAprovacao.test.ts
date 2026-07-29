import { describe, expect, it } from "vitest";
import { aprovarBriefingWeb, aprovacaoAindaCorresponde, jsonCanonico } from "./briefingAprovacao";

describe("aprovação web do briefing", () => {
  it("o JSON canônico independe da ordem das chaves", () => {
    expect(jsonCanonico({ z: 1, a: { y: 2, x: 3 } })).toBe(jsonCanonico({ a: { x: 3, y: 2 }, z: 1 }));
  });

  it("usa o mesmo SHA-256 canônico do worker", async () => {
    expect(await aprovarBriefingWeb({ z: 1, a: { y: 2, x: 3 } }, "rodrigo").then((a) => a.hash)).toBe(
      "8dfc9dd8cb7fcc89c0a2770f644dd4a70d8e86394b12bc56c624e86e7e294974"
    );
  });

  it("aprova a cópia exata e mudança posterior invalida", async () => {
    const briefing = { ideia_central: "o farol", pdv: "terceira pessoa" };
    const aprovacao = await aprovarBriefingWeb(briefing, "rodrigo", "2026-07-29T12:00:00.000Z");
    expect(aprovacao.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(await aprovacaoAindaCorresponde(aprovacao, briefing)).toBe(true);
    expect(await aprovacaoAindaCorresponde(aprovacao, { ...briefing, pdv: "primeira pessoa" })).toBe(false);
  });

  it("não aceita aprovação sem identidade", async () => {
    await expect(aprovarBriefingWeb({}, "  ")).rejects.toThrow(/identificar/);
  });
});
