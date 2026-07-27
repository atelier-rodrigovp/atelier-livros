// Allowlist de canário: destrava exigirReleaseAtual() APENAS para os três
// projetos canário. Qualquer outro projeto (inclusive obra real com
// engine_mode='v2') continua fail-closed sem certificado em worker/release/.
import { describe, expect, it } from "vitest";
import { exigirReleaseAtual, PROJETOS_CANARIO_V2 } from "./release.js";

const CANARIO_DAN_BROWN = "8b11072c-097d-4964-8f89-abecb96eb16c";
const CANARIO_HOOVER = "aa8af83f-b2a1-41e0-ac0b-e46e620ee5c7";
const CANARIO_ROMANTASY = "5f59a08b-5947-46ab-9547-76bd31e74e5f";
// Obra REAL fora de escopo por decisão do autor — nunca pode entrar na allowlist.
const OBRA_REAL_FORA_DE_ESCOPO = "53abdade-554d-47e2-bd14-955de3ffc41e";

describe("allowlist de canário V2", () => {
  it("contém exatamente os três canários e NÃO contém a obra real", () => {
    expect([...PROJETOS_CANARIO_V2].sort()).toEqual(
      [CANARIO_DAN_BROWN, CANARIO_HOOVER, CANARIO_ROMANTASY].sort()
    );
    expect(PROJETOS_CANARIO_V2.has(OBRA_REAL_FORA_DE_ESCOPO)).toBe(false);
  });

  it("projeto canário recebe liberação de canário (sem certificado)", () => {
    const release = exigirReleaseAtual("dan-brown", CANARIO_DAN_BROWN);
    expect(release).toMatchObject({ modo: "canario", codigo_commit: "canario-sem-certificado" });
  });

  it("projeto FORA da allowlist continua fail-closed (RELEASE_V2_NAO_CERTIFICADA)", () => {
    expect(() => exigirReleaseAtual("dan-brown", OBRA_REAL_FORA_DE_ESCOPO)).toThrowError(
      /Engine V2 bloqueada para fundação\/escrita/
    );
  });

  it("sem project_id continua fail-closed", () => {
    expect(() => exigirReleaseAtual("dan-brown")).toThrowError(/Engine V2 bloqueada/);
  });
});
