// Fatia E — entrevista determinística e aprovação do briefing.
import { describe, expect, it } from "vitest";
import {
  aprovarBriefing,
  autorizarFundacao,
  CAMPOS_ENTREVISTA,
  conflitosDoBriefing,
  consolidarBriefing,
  hashBriefing,
  lacunasDoBriefing,
  NAO_SE_APLICA,
} from "./briefing-aprovacao.js";
import type { BriefingAutor } from "./briefing.js";

function completo(over: Partial<BriefingAutor> = {}): BriefingAutor {
  return {
    ideia_central: "uma faroleira descobre que o farol esconde um arquivo",
    autor: "Rodrigo Paiva",
    idioma: "pt-BR",
    genero: "thriller de enigma",
    tom: "seco e tenso",
    pdv: "terceira pessoa próxima",
    tempo_verbal: "pretérito",
    linha_tempo: "linear, sete dias",
    final: "fechado, com custo",
    antagonista: "Helena Duarte, diretora do TPEA",
    canone: "a maré de sizígia ocorre em março e setembro",
    proibido: "violência sexual explícita",
    protagonista: {
      nome: "Marina Alencar",
      ferida: "perdeu o irmão em 1987",
      desejo: "saber o que aconteceu",
      segredo: "falsificou o registro de entrada",
    },
    ...over,
  };
}

describe("cobertura da entrevista", () => {
  it("briefing completo não tem lacuna", () => {
    expect(lacunasDoBriefing(completo())).toEqual([]);
  });

  it("cada campo obrigatório em branco vira lacuna NOMEADA", () => {
    for (const campo of CAMPOS_ENTREVISTA.filter((c) => c.natureza === "sempre")) {
      const b = completo();
      const partes = campo.caminho.split(".");
      if (partes.length === 1) delete (b as Record<string, unknown>)[partes[0]];
      else delete (b.protagonista as Record<string, unknown>)[partes[1]];
      const lacunas = lacunasDoBriefing(b);
      expect(lacunas.map((l) => l.campo), `campo ${campo.id}`).toContain(campo.id);
    }
  });

  it("nenhum default silencioso: campo ausente é LACUNA, nunca valor inventado", () => {
    const b = completo({ tom: undefined });
    const l = lacunasDoBriefing(b).find((x) => x.campo === "tom");
    expect(l).toBeDefined();
    expect(l!.motivo).toBe("sem_resposta");
    expect(l!.pergunta).toContain("tom");
  });
});

describe("`não se aplica` é resposta legítima — se justificada", () => {
  it("aceito com justificativa", () => {
    const b = completo({ canone: NAO_SE_APLICA, canone_justificativa: "obra original, sem universo prévio" } as BriefingAutor);
    expect(lacunasDoBriefing(b).some((l) => l.campo === "canone")).toBe(false);
  });

  it("recusado SEM justificativa (a omissão volta a ser omissão)", () => {
    const b = completo({ canone: NAO_SE_APLICA });
    const l = lacunasDoBriefing(b).find((x) => x.campo === "canone");
    expect(l?.motivo).toBe("nao_se_aplica_sem_justificativa");
  });

  it("justificativa vazia ou curta demais não conta", () => {
    const b = completo({ canone: NAO_SE_APLICA, canone_justificativa: "n/a" } as BriefingAutor);
    expect(lacunasDoBriefing(b).some((l) => l.campo === "canone")).toBe(true);
  });
});

describe("campos condicionais", () => {
  it("sem série, volume e total de volumes NÃO são exigidos", () => {
    expect(lacunasDoBriefing(completo())).toEqual([]);
  });

  it("com série, volume e total passam a ser exigidos", () => {
    const b = completo({ serie: "As Marés de Ponta Rasa" });
    const campos = lacunasDoBriefing(b).map((l) => l.campo);
    expect(campos).toContain("serie_total");
    expect(campos).toContain("volume");
  });

  it("com série completa, sem lacuna", () => {
    const b = completo({ serie: "As Marés de Ponta Rasa", serie_total: 3, volume: 1 });
    expect(lacunasDoBriefing(b)).toEqual([]);
  });

  it("sem protagonista nomeado, ferida/desejo/segredo não são cobrados isoladamente", () => {
    const b = completo({ protagonista: {} });
    const campos = lacunasDoBriefing(b).map((l) => l.campo);
    expect(campos).toContain("protagonista.nome");
    expect(campos).not.toContain("protagonista.ferida");
  });
});

describe("conflito entre entrevista e wizard vai ao autor", () => {
  it("idiomas divergentes são conflito", () => {
    const c = conflitosDoBriefing(completo({ idioma: "pt-BR" }), { idioma_origem: "pt-PT" });
    expect(c).toHaveLength(1);
    expect(c[0].campo).toBe("idioma");
    expect(c[0].valorBriefing).toBe("pt-BR");
    expect(c[0].valorColuna).toBe("pt-PT");
  });

  it("idiomas iguais não são conflito", () => {
    expect(conflitosDoBriefing(completo({ idioma: "pt-BR" }), { idioma_origem: "pt-BR" })).toEqual([]);
  });

  it("volume maior que o total da série é conflito", () => {
    const c = conflitosDoBriefing(completo({ serie: "S", serie_total: 3, volume: 5 }), {});
    expect(c.some((x) => x.campo === "volume")).toBe(true);
  });

  it("o resumo consolidado mostra os conflitos para o autor decidir", () => {
    const r = consolidarBriefing(completo({ idioma: "pt-BR" }), { idioma_origem: "pt-PT" });
    expect(r.pronto).toBe(false);
    expect(r.resumo).toContain("CONFLITOS");
    expect(r.resumo).toContain("pt-PT");
  });
});

describe("aprovação do briefing é pré-requisito da fundação", () => {
  it("briefing COMPLETO mas NÃO APROVADO não gera fundação", () => {
    const r = autorizarFundacao(completo(), null);
    expect(r.permitido).toBe(false);
    expect(r).toMatchObject({ motivo: "briefing_nao_aprovado" });
  });

  it("briefing com lacuna não gera fundação (nem aprovado)", () => {
    const b = completo({ tom: undefined });
    const aprov = aprovarBriefing(b, "rodrigo", "2026-07-28T00:00:00.000Z");
    const r = autorizarFundacao(b, aprov);
    expect(r).toMatchObject({ motivo: "briefing_com_lacunas" });
  });

  it("briefing CONTRADITÓRIO não gera fundação", () => {
    const b = completo({ idioma: "pt-BR" });
    const aprov = aprovarBriefing(b, "rodrigo", "2026-07-28T00:00:00.000Z");
    const r = autorizarFundacao(b, aprov, { idioma_origem: "pt-PT" });
    expect(r).toMatchObject({ motivo: "briefing_com_conflitos" });
  });

  it("briefing completo E aprovado gera fundação", () => {
    const b = completo();
    const aprov = aprovarBriefing(b, "rodrigo", "2026-07-28T00:00:00.000Z");
    expect(autorizarFundacao(b, aprov).permitido).toBe(true);
  });

  it("alterar o briefing DEPOIS de aprovado invalida a aprovação", () => {
    const b = completo();
    const aprov = aprovarBriefing(b, "rodrigo", "2026-07-28T00:00:00.000Z");
    const alterado = { ...b, final: "aberto, sem custo" };
    const r = autorizarFundacao(alterado, aprov);
    expect(r).toMatchObject({ motivo: "briefing_alterado_apos_aprovacao" });
  });

  it("a aprovação guarda a versão EXATA que o autor viu", () => {
    const b = completo();
    const aprov = aprovarBriefing(b, "rodrigo", "2026-07-28T00:00:00.000Z");
    expect(aprov.hash).toBe(hashBriefing(b));
    expect(aprov.briefing).toEqual(b);
    expect(aprov.aprovado_por).toBe("rodrigo");
  });

  it("mudar qualquer decisão muda o hash (a aprovação é hash-bound)", () => {
    expect(hashBriefing(completo())).not.toBe(hashBriefing(completo({ pdv: "primeira pessoa" })));
  });
});
