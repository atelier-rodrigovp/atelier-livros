import { describe, expect, it } from "vitest";
import { capitulosAprovados, tituloDoCapitulo } from "./capitulos-db.js";
import type { EstadoCanonico } from "./tipos.js";

function estadoCom(capitulos: EstadoCanonico["doc"]["capitulos"]): EstadoCanonico {
  return {
    project_id: "p1",
    engine_version: "2.0.0",
    versao: 3,
    doc: { schema: "engine-state/v1", fase: "escrita", capitulos, bloqueios: [] },
  };
}

describe("capitulosAprovados — só aprovação hash-bound sobe para chapters", () => {
  it("filtra reprovado, bloqueado, legado e aprovação sem hash", () => {
    const caps = capitulosAprovados(
      estadoCom({
        "1": { status: "aprovado", aprovacao: { review_id: "r1", text_hash: "a".repeat(64), em: "2026-07-27" }, palavras: 1200 },
        "2": { status: "aprovado_com_excecao", text_hash: "b".repeat(64) },
        "3": { status: "reprovado", text_hash: "c".repeat(64) },
        "4": { status: "bloqueado" },
        "5": { status: "legado_sem_evidencia", text_hash: "d".repeat(64) },
        "6": { status: "aprovado" }, // sem hash = sem evidência
      })
    );
    expect(caps.map((c) => c.numero)).toEqual([1, 2]);
    expect(caps[0]).toEqual({ numero: 1, textHash: "a".repeat(64), palavras: 1200 });
    expect(caps[1].textHash).toBe("b".repeat(64));
  });

  it("ordena por número e ignora chaves não numéricas", () => {
    const caps = capitulosAprovados(
      estadoCom({
        "10": { status: "aprovado", text_hash: "a".repeat(64) },
        "2": { status: "aprovado", text_hash: "b".repeat(64) },
        "x": { status: "aprovado", text_hash: "c".repeat(64) },
      })
    );
    expect(caps.map((c) => c.numero)).toEqual([2, 10]);
  });
});

describe("tituloDoCapitulo", () => {
  it("extrai o primeiro heading markdown", () => {
    expect(tituloDoCapitulo("## Capítulo 3 — O Cofre\n\nTexto.")).toBe("Capítulo 3 — O Cofre");
    expect(tituloDoCapitulo("Sem heading nenhum.")).toBeNull();
  });
});
