// Uma evidência externa que aprova qualquer coisa não certifica nada. Estes
// testes existem para provar que ela RECUSA — inclusive quando o documento está
// bem formado e só o mundo em volta mudou.

import { describe, expect, it } from "vitest";
import {
  SCHEMA_EVIDENCIA,
  validarEvidencia,
  type DependenciasEvidencia,
  type EvidenciaExterna,
} from "./evidencia-externa.js";

const DEP: DependenciasEvidencia = {
  commit: "abc1234",
  migrations_versao: "engine_v2_historico.sql",
  schema_hash: "sch-1",
  contratos_hash: "ctr-1",
  worker_hash: "wrk-1",
  interface_hash: "ui-1",
};

const ESPERADO = { tipo: "integracao_real" as const, ambiente: "producao" as const, dependencias: DEP };

function evidencia(over: Partial<EvidenciaExterna> = {}): EvidenciaExterna {
  return {
    schema: SCHEMA_EVIDENCIA,
    tipo: "integracao_real",
    executado_em: "2026-07-28T12:00:00.000Z",
    ambiente: "producao",
    project_id: "proj-teste",
    executor_ref: "owner-hash-9f2",
    dependencias: { ...DEP },
    passos: [{ passo: "upload ao Storage", resultado: "aprovado" }],
    artefatos: [{ nome: "estrutura.json", hash: "h-estrutura", bytes: 812 }],
    erros: [],
    resultado: "aprovado",
    ...over,
  };
}

describe("evidência completa e atual", () => {
  it("vale quando tudo confere", () => {
    expect(validarEvidencia(evidencia(), ESPERADO)).toEqual({ valida: true, motivos: [] });
  });
});

describe("evidência de outro contexto não vale", () => {
  it("commit diferente invalida", () => {
    const r = validarEvidencia(evidencia({ dependencias: { ...DEP, commit: "outro99" } }), ESPERADO);
    expect(r.valida).toBe(false);
    expect(r.motivos.join(" ")).toContain("commit mudou");
  });

  it("ambiente diferente não vale (local não certifica produção)", () => {
    const r = validarEvidencia(evidencia({ ambiente: "local" }), ESPERADO);
    expect(r.valida).toBe(false);
    expect(r.motivos.join(" ")).toContain("ambiente local ≠ producao");
  });

  it("tipo diferente não atesta a garantia pedida", () => {
    const r = validarEvidencia(evidencia({ tipo: "provedor_real" }), ESPERADO);
    expect(r.valida).toBe(false);
  });

  it("schema desconhecido não vale", () => {
    const r = validarEvidencia(evidencia({ schema: "outro/v9" as never }), ESPERADO);
    expect(r.valida).toBe(false);
  });
});

describe("evidência antiga caduca quando o que ela mediu muda", () => {
  const casos: [keyof DependenciasEvidencia, string][] = [
    ["migrations_versao", "nova-migration.sql"],
    ["schema_hash", "sch-2"],
    ["contratos_hash", "ctr-2"],
    ["worker_hash", "wrk-2"],
    ["interface_hash", "ui-2"],
  ];
  for (const [campo, novo] of casos) {
    it(`mudança em ${campo} invalida a evidência dependente`, () => {
      const r = validarEvidencia(evidencia(), { ...ESPERADO, dependencias: { ...DEP, [campo]: novo } });
      expect(r.valida).toBe(false);
      expect(r.motivos.join(" ")).toContain(campo);
    });
  }
});

describe("evidência incompleta não vale", () => {
  it("sem passos registrados", () => {
    expect(validarEvidencia(evidencia({ passos: [] }), ESPERADO).valida).toBe(false);
  });

  it("sem artefato baixado, quando o tipo exige download", () => {
    const r = validarEvidencia(evidencia({ artefatos: [] }), ESPERADO);
    expect(r.valida).toBe(false);
    expect(r.motivos.join(" ")).toContain("nenhum artefato baixado");
  });

  it("artefato com 0 byte é download que não aconteceu", () => {
    const r = validarEvidencia(evidencia({ artefatos: [{ nome: "x.md", hash: "h", bytes: 0 }] }), ESPERADO);
    expect(r.valida).toBe(false);
    expect(r.motivos.join(" ")).toContain("0 byte");
  });

  it("campo de dependência faltando invalida", () => {
    const dep = { ...DEP } as Partial<DependenciasEvidencia>;
    delete dep.schema_hash;
    const r = validarEvidencia(evidencia({ dependencias: dep as DependenciasEvidencia }), ESPERADO);
    expect(r.valida).toBe(false);
    expect(r.motivos.join(" ")).toContain("schema_hash ausente");
  });

  it("evidência ausente não vale", () => {
    expect(validarEvidencia(null, ESPERADO).valida).toBe(false);
  });
});

describe("falha não vira aprovação", () => {
  it("resultado reprovado não aprova", () => {
    expect(validarEvidencia(evidencia({ resultado: "reprovado" }), ESPERADO).valida).toBe(false);
  });

  it("um passo reprovado derruba a evidência inteira", () => {
    const r = validarEvidencia(
      evidencia({
        passos: [
          { passo: "upload", resultado: "aprovado" },
          { passo: "download", resultado: "reprovado", detalhe: "404" },
        ],
      }),
      ESPERADO
    );
    expect(r.valida).toBe(false);
    expect(r.motivos.join(" ")).toContain("download");
  });

  it("erro registrado impede aprovação mesmo com resultado 'aprovado'", () => {
    const r = validarEvidencia(evidencia({ erros: ["timeout no bucket"] }), ESPERADO);
    expect(r.valida).toBe(false);
    expect(r.motivos.join(" ")).toContain("erro(s) registrados");
  });
});
