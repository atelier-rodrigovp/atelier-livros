import { describe, expect, it } from "vitest";
import { aprovarBriefing } from "./briefing-aprovacao.js";
import { lerProjetoFundacao } from "./integracao.js";
import type { BriefingAutor } from "./briefing.js";

const briefing: BriefingAutor = {
  ideia_central: "uma faroleira encontra um mapa",
  autor: "Rodrigo",
  idioma: "pt-BR",
  genero: "thriller",
  tom: "tenso",
  pdv: "terceira pessoa",
  tempo_verbal: "presente",
  linha_tempo: "72 horas",
  final: "fechado com custo",
  antagonista: "Helena",
  canone: "realista",
  proibido: "sobrenatural",
  protagonista: { nome: "Marina", ferida: "luto", desejo: "verdade", segredo: "fraude" },
};

function linha(over: Record<string, unknown> = {}) {
  return {
    id: "p1",
    titulo: "O Farol",
    skill_escrita: "skill-dan-brown",
    total_capitulos: 12,
    idioma_origem: "pt-BR",
    briefing,
    briefing_aprovado: aprovarBriefing(briefing, "rodrigo", "2026-07-29T12:00:00.000Z"),
    ...over,
  };
}

describe("fronteira projects -> fundação V2", () => {
  it("consome briefing_aprovado selecionado e validado", () => {
    const p = lerProjetoFundacao(linha());
    expect(p.briefing_aprovado?.hash).toHaveLength(64);
    expect(p.briefing).toEqual(briefing);
  });

  it("remoção da coluna/SELECT não degrada para null silencioso", () => {
    const semCampo = linha();
    delete semCampo.briefing_aprovado;
    expect(() => lerProjetoFundacao(semCampo)).toThrow(/engine_v2_fluxo\.sql/);
  });

  it("cast não consegue transformar payload inválido em aprovação", () => {
    expect(() => lerProjetoFundacao(linha({ briefing_aprovado: { schema: "briefing-aprovado/v1" } }))).toThrow(
      /briefing não é um objeto/
    );
  });
});
