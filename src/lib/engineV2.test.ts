import { describe, expect, it, vi } from "vitest";

// engineV2.ts importa o cliente supabase, que exige VITE_SUPABASE_URL/ANON_KEY
// (ausentes nos testes). Mock inerte: aqui só interessa a função pura tabelaAusente.
vi.mock("./supabase", () => ({ supabase: {} }));

import { tabelaAusente } from "./engineV2";

describe("tabelaAusente", () => {
  it("retorna false para null (sem erro)", () => {
    expect(tabelaAusente(null)).toBe(false);
  });

  it("reconhece o código Postgres 42P01 (undefined_table)", () => {
    expect(tabelaAusente({ code: "42P01", message: 'relation "engine_state" does not exist' })).toBe(true);
  });

  it("reconhece o código PostgREST PGRST205 (tabela fora do schema cache)", () => {
    expect(tabelaAusente({ code: "PGRST205" })).toBe(true);
  });

  it("reconhece a mensagem 'could not find the table' (case-insensitive)", () => {
    expect(
      tabelaAusente({ message: "Could not find the table 'public.engine_state' in the schema cache" })
    ).toBe(true);
    expect(tabelaAusente({ message: "could not FIND the TABLE engine_runs" })).toBe(true);
  });

  it("não confunde outros erros com migração pendente", () => {
    expect(tabelaAusente({ code: "XX000", message: "internal error" })).toBe(false);
    expect(tabelaAusente({ message: "permission denied for table engine_state" })).toBe(false);
    expect(tabelaAusente({})).toBe(false);
  });
});
