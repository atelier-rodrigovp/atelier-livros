// Fatia G — a prosa cumpriu a ficha?
import { describe, expect, it } from "vitest";
import {
  cobertura,
  conferirConformidade,
  itensExigidos,
  medirConformidade,
  resumoConformidade,
  trechoExisteNoTexto,
  validarParecerConformidade,
  type ParecerConformidade,
} from "./conformidade.js";
import type { SceneSpec } from "./tipos.js";

const TEXTO = [
  "## Capítulo 3",
  "",
  "Marina empurrou a porta do arquivo do consulado e sentiu o cheiro de papel velho.",
  "O arquivista exigiu a autorização que ela não tinha e atendeu o telefone na sala ao lado.",
  "Ela abriu o livro de registros de 1987 e fotografou a linha com o nome do irmão.",
  "A folha seguinte tinha sido arrancada rente à costura.",
  "Atrás dela, a chave girou na fechadura.",
].join("\n");

function ficha(over: Partial<SceneSpec> = {}): SceneSpec {
  return {
    schema: "scene-spec/v1",
    capitulo: 3,
    pov: "Marina",
    local: "arquivo do consulado",
    tempo: "Dia 2, 14h30",
    objetivo: "obter o registro de entrada de 1987",
    obstaculo: "o arquivista exige autorização que ela não tem",
    acao_fisica: "fotografa o livro de registros",
    informacao_nova: "o nome do irmão consta como acompanhante",
    virada: "a página seguinte foi arrancada",
    mudanca_estado: "de confiante para exposta",
    gancho: { tipo: "ameaca", descricao: "a chave girou na fechadura" },
    fatos_obrigatorios: ["registro de 1987 existe"],
    conhecimentos_proibidos: [],
    fios_avancados: ["investigacao"],
    fios_ausentes: [],
    ...over,
  };
}

function afirmacao(item: string, over: Record<string, unknown> = {}) {
  return {
    item,
    cumprido: true,
    trecho: "a folha seguinte tinha sido arrancada rente à costura",
    justificativa: "o evento previsto acontece na página",
    ...over,
  };
}

function parecerCompleto(over: Partial<Record<string, unknown>> = {}): ParecerConformidade {
  return {
    schema: "conformidade-ficha-prosa/v1",
    afirmacoes: [
      afirmacao("objetivo", { trecho: "abriu o livro de registros de 1987" }),
      afirmacao("obstaculo", { trecho: "o arquivista exigiu a autorização que ela não tinha" }),
      afirmacao("acao_decisiva", { trecho: "fotografou a linha com o nome do irmão" }),
      afirmacao("virada"),
      afirmacao("mudanca_estado", { trecho: "Atrás dela, a chave girou na fechadura" }),
      afirmacao("gancho", { trecho: "a chave girou na fechadura" }),
      afirmacao("informacao_nova", { trecho: "fotografou a linha com o nome do irmão" }),
      ...(over.extras as ParecerConformidade["afirmacoes"] ?? []),
    ],
  };
}

describe("itens exigidos vêm da ficha", () => {
  it("sete itens no caso base", () => {
    expect(itensExigidos(ficha())).toHaveLength(7);
  });
  it("marco de arco e promessa entram quando a ficha os declara", () => {
    const f = ficha({
      marcos_arco: [{ personagem: "Marina", marco: "decide agir" }],
      promessas_tocadas: [{ id: "P1", acao: "planta" }],
    });
    expect(itensExigidos(f)).toContain("marco_arco");
    expect(itensExigidos(f)).toContain("promessa");
  });
});

describe("evidência tem de ser LOCALIZÁVEL", () => {
  it("trecho que existe no texto é aceito", () => {
    expect(trechoExisteNoTexto("a chave girou na fechadura", TEXTO)).toBe(true);
  });
  it("paráfrase NÃO passa por citação", () => {
    expect(trechoExisteNoTexto("a fechadura foi trancada por alguém", TEXTO)).toBe(false);
  });
  it("citação curta demais não localiza nada", () => {
    expect(trechoExisteNoTexto("a chave", TEXTO)).toBe(false);
  });
  it("diferença de aspas e espaço não invalida a citação", () => {
    expect(trechoExisteNoTexto("a  folha   seguinte tinha sido arrancada", TEXTO)).toBe(true);
  });
});

describe("conferência do parecer", () => {
  it("parecer completo com trechos reais é conforme", () => {
    const r = conferirConformidade(parecerCompleto(), ficha(), TEXTO);
    expect(r.conforme).toBe(true);
    expect(r.validadas).toHaveLength(7);
  });

  it("[DOD:G-01] CAPÍTULO BEM ESCRITO QUE NÃO CUMPRE A VIRADA É REPROVADO, com evidência", () => {
    const p = parecerCompleto();
    p.afirmacoes = p.afirmacoes.map((a) =>
      a.item === "virada"
        ? { ...a, cumprido: false, trecho: "", justificativa: "a página arrancada é mencionada, mas nada muda por causa dela" }
        : a
    );
    const r = conferirConformidade(p, ficha(), TEXTO);
    expect(r.conforme).toBe(false);
    const prob = r.problemas.find((x) => x.item === "virada");
    expect(prob?.motivo).toBe("nao_cumprido");
    expect(prob?.detalhe).toContain("nada muda por causa dela");
  });

  it("[DOD:G-02] afirmação com trecho INVENTADO não sustenta aprovação", () => {
    const p = parecerCompleto();
    p.afirmacoes = p.afirmacoes.map((a) =>
      a.item === "gancho" ? { ...a, trecho: "o arquivista sacou uma arma e apontou para Marina" } : a
    );
    const r = conferirConformidade(p, ficha(), TEXTO);
    expect(r.conforme).toBe(false);
    expect(r.problemas.find((x) => x.item === "gancho")?.motivo).toBe("trecho_ausente_no_texto");
  });

  it("afirmação sem trecho não sustenta aprovação", () => {
    const p = parecerCompleto();
    p.afirmacoes = p.afirmacoes.map((a) => (a.item === "objetivo" ? { ...a, trecho: "  " } : a));
    expect(conferirConformidade(p, ficha(), TEXTO).problemas[0].motivo).toBe("trecho_vazio");
  });

  it("afirmação sem justificativa não sustenta aprovação", () => {
    const p = parecerCompleto();
    p.afirmacoes = p.afirmacoes.map((a) => (a.item === "objetivo" ? { ...a, justificativa: "" } : a));
    expect(conferirConformidade(p, ficha(), TEXTO).problemas[0].motivo).toBe("justificativa_vazia");
  });

  it("item exigido pela ficha que o parecer OMITIU reprova (silêncio não é conformidade)", () => {
    const p = parecerCompleto();
    p.afirmacoes = p.afirmacoes.filter((a) => a.item !== "mudanca_estado");
    const r = conferirConformidade(p, ficha(), TEXTO);
    expect(r.problemas.find((x) => x.item === "mudanca_estado")?.motivo).toBe("item_nao_avaliado");
  });

  it("marco de arco declarado na ficha é cobrado", () => {
    const f = ficha({ marcos_arco: [{ personagem: "Marina", marco: "decide agir" }] });
    const r = conferirConformidade(parecerCompleto(), f, TEXTO);
    expect(r.problemas.find((x) => x.item === "marco_arco")?.motivo).toBe("item_nao_avaliado");
  });

  it("item fora do vocabulário é reportado", () => {
    const p = parecerCompleto();
    p.afirmacoes.push(afirmacao("ritmo_da_prosa"));
    expect(conferirConformidade(p, ficha(), TEXTO).problemas.some((x) => x.motivo === "item_desconhecido")).toBe(true);
  });
});

describe("sinais determinísticos (alimentam o julgamento, não bloqueiam)", () => {
  it("capítulo que cobre a ficha tem sinais presentes", () => {
    const s = medirConformidade(ficha(), TEXTO);
    expect(s.find((x) => x.sinal === "local_citado")?.presente).toBe(true);
    expect(s.find((x) => x.sinal === "virada_presente")?.presente).toBe(true);
    expect(s.find((x) => x.sinal === "capitulo_nao_vazio")?.presente).toBe(false); // texto curto de fixture
  });

  it("ficha cujo local não aparece no texto acende o sinal", () => {
    const s = medirConformidade(ficha({ local: "convés do cargueiro Aurora" }), TEXTO);
    expect(s.find((x) => x.sinal === "local_citado")?.presente).toBe(false);
  });

  it("cobertura mede termos distintivos, não palavras vazias", () => {
    expect(cobertura("o arquivo do consulado", TEXTO)).toBeGreaterThan(0.9);
    expect(cobertura("a nave espacial de titânio", TEXTO)).toBe(0);
  });

  it("o resumo entra no prompt listando só o que está ausente", () => {
    const r = resumoConformidade(medirConformidade(ficha({ local: "convés do cargueiro" }), TEXTO));
    expect(r).toContain("local_citado");
  });
});

describe("validação do JSON do papel", () => {
  it("aceita parecer bem formado", () => {
    const p = validarParecerConformidade({ afirmacoes: [afirmacao("virada")] });
    expect(p.schema).toBe("conformidade-ficha-prosa/v1");
  });
  it("rejeita afirmação sem campo obrigatório", () => {
    expect(() => validarParecerConformidade({ afirmacoes: [{ item: "virada", cumprido: true }] })).toThrow(/trecho/);
    expect(() => validarParecerConformidade({})).toThrow(/afirmacoes/);
  });
});
