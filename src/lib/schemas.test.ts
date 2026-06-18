import { describe, expect, it } from "vitest";
import { loginSchema, novoProjetoSchema } from "./schemas";

describe("novoProjetoSchema", () => {
  it("aceita um projeto mínimo válido e aplica defaults", () => {
    const r = novoProjetoSchema.parse({ titulo: "Meu Livro" });
    expect(r.idioma_origem).toBe("pt-BR");
    expect(r.piso_palavras).toBe(1400);
    expect(r.meta_nota).toBe(9.0);
  });

  it("coage strings numéricas vindas de inputs", () => {
    const r = novoProjetoSchema.parse({
      titulo: "Outro",
      piso_palavras: "1200",
      meta_nota: "8.5",
    });
    expect(r.piso_palavras).toBe(1200);
    expect(r.meta_nota).toBe(8.5);
  });

  it("rejeita título curto", () => {
    expect(novoProjetoSchema.safeParse({ titulo: "x" }).success).toBe(false);
  });

  it("rejeita idioma fora da lista", () => {
    const r = novoProjetoSchema.safeParse({
      titulo: "Livro",
      idioma_origem: "ru-RU",
    });
    expect(r.success).toBe(false);
  });
});

describe("loginSchema", () => {
  it("valida e-mail e senha", () => {
    expect(
      loginSchema.safeParse({ email: "a@b.com", senha: "x" }).success
    ).toBe(true);
    expect(
      loginSchema.safeParse({ email: "invalido", senha: "x" }).success
    ).toBe(false);
  });
});
