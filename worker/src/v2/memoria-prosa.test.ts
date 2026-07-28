// Fatia H — memória derivada da PROSA APROVADA e promessas cruzadas.
import { describe, expect, it } from "vitest";
import {
  derivarMemoriaDaProsa,
  marcarPagamento,
  pendenciasDeFechamento,
  trechoExiste,
  validarExtracaoProsa,
  type EntradaMemoria,
  type ExtracaoProsa,
} from "./memoria-prosa.js";
import type { SceneSpec } from "./tipos.js";

const TEXTO = [
  "## Capítulo 3",
  "",
  "Marina abriu o livro de registros e fotografou a linha com o nome do irmão.",
  "Debaixo da mesa havia uma caixa de metal com as iniciais T.P.E.A. gravadas na tampa.",
  "Ela não a abriu. Guardou a chave no bolso e prometeu a si mesma voltar antes do amanhecer.",
  "A folha seguinte tinha sido arrancada rente à costura.",
].join("\n");

function ficha(over: Partial<SceneSpec> = {}): SceneSpec {
  return {
    schema: "scene-spec/v1",
    capitulo: 3,
    pov: "Marina",
    local: "arquivo",
    tempo: "Dia 2",
    objetivo: "obter o registro",
    obstaculo: "o arquivista",
    acao_fisica: "fotografa o livro",
    informacao_nova: "o nome do irmão consta",
    virada: "a página foi arrancada",
    mudanca_estado: "exposta",
    gancho: { tipo: "ameaca", descricao: "a chave" },
    fatos_obrigatorios: [],
    conhecimentos_proibidos: [],
    fios_avancados: [],
    fios_ausentes: [],
    ...over,
  };
}

function extracao(over: Partial<ExtracaoProsa> = {}): ExtracaoProsa {
  return {
    schema: "memoria-prosa/v1",
    entradas: [
      {
        tipo: "pista",
        enunciado: "há uma caixa de metal com as iniciais TPEA sob a mesa do arquivo",
        trecho: "havia uma caixa de metal com as iniciais T.P.E.A. gravadas na tampa",
        confianca: "alta",
        origem: "prosa",
      },
      {
        tipo: "promessa",
        enunciado: "Marina promete voltar ao arquivo antes do amanhecer",
        trecho: "prometeu a si mesma voltar antes do amanhecer",
        quem: "Marina",
        confianca: "alta",
        origem: "prosa",
      },
      {
        tipo: "revelacao",
        enunciado: "o nome do irmão consta no registro de 1987",
        trecho: "fotografou a linha com o nome do irmão",
        confianca: "alta",
        origem: "ficha",
      },
    ],
    divergencias: [],
    ...over,
  };
}

const derivar = (e = extracao(), texto = TEXTO) =>
  derivarMemoriaDaProsa({ capitulo: 3, texto, ficha: ficha(), extracao: e, em: "2026-07-28T00:00:00.000Z" });

describe("extração exige evidência na página", () => {
  it("entradas com trecho real entram na memória", () => {
    const r = derivar();
    expect(r.entradas).toHaveLength(3);
    expect(r.entradas[0].id).toBe("M03.1");
    expect(r.entradas[0].capitulo).toBe(3);
    expect(r.entradas[0].text_hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("entrada com trecho INEXISTENTE é recusada — a memória não guarda o que ninguém aponta", () => {
    const e = extracao();
    e.entradas[0].trecho = "a caixa continha um revólver enferrujado e três cartas";
    const r = derivar(e);
    expect(r.entradas).toHaveLength(2);
    expect(r.recusadas[0].motivo).toContain("não localizado");
  });

  it("enunciado que virou prosa (>25 palavras) é recusado", () => {
    const e = extracao();
    e.entradas[1].enunciado = Array(30).fill("palavra").join(" ");
    expect(derivar(e).recusadas.some((x) => x.motivo.includes("25 palavras"))).toBe(true);
  });

  it("recusa é REGISTRADA, nunca silenciosa", () => {
    const e = extracao();
    e.entradas[0].trecho = "";
    expect(derivar(e).recusadas).toHaveLength(1);
  });

  it("a origem distingue o que a ficha previa do que a prosa inventou", () => {
    const r = derivar();
    expect(r.entradas.filter((x) => x.origem === "prosa")).toHaveLength(2);
    expect(r.entradas.filter((x) => x.origem === "ficha")).toHaveLength(1);
  });
});

describe("conflito ficha × prosa é EVENTO, não sobrescrita", () => {
  it("divergência com trecho real vira conflito explícito", () => {
    const e = extracao({
      divergencias: [
        {
          campo: "virada",
          ficha: "a página foi arrancada",
          prosa: "a caixa de metal é o achado que muda a cena",
          trecho: "havia uma caixa de metal com as iniciais T.P.E.A. gravadas na tampa",
        },
      ],
    });
    const r = derivar(e);
    expect(r.conflitos).toHaveLength(1);
    expect(r.conflitos[0].campo).toBe("virada");
    expect(r.conflitos[0].valorFicha).toBe("a página foi arrancada");
    expect(r.conflitos[0].valorProsa).toContain("caixa de metal");
  });

  it("divergência sem trecho localizável não vira conflito (nem some em silêncio)", () => {
    const e = extracao({
      divergencias: [{ campo: "gancho", ficha: "a chave", prosa: "um tiro", trecho: "o disparo ecoou no corredor" }],
    });
    const r = derivar(e);
    expect(r.conflitos).toHaveLength(0);
    expect(r.recusadas.some((x) => x.enunciado.includes("divergência"))).toBe(true);
  });

  it("a extração NÃO altera a ficha — só reporta", () => {
    const f = ficha();
    const antes = JSON.stringify(f);
    derivarMemoriaDaProsa({ capitulo: 3, texto: TEXTO, ficha: f, extracao: extracao(), em: "x" });
    expect(JSON.stringify(f)).toBe(antes);
  });
});

describe("fechamento cruza fundação × fichas × prosa", () => {
  const memoriaDaProsa = () => derivar().entradas;

  it("PROMESSA QUE SÓ A PROSA ABRIU exige payoff (o buraco que a fatia H fecha)", () => {
    const p = pendenciasDeFechamento({
      promessasFundacao: [],
      promessasFichas: [],
      memoria: memoriaDaProsa(),
    });
    const daProsa = p.filter((x) => x.fonte === "prosa");
    expect(daProsa.length).toBeGreaterThan(0);
    expect(daProsa.map((x) => x.enunciado).join(" ")).toContain("voltar ao arquivo antes do amanhecer");
  });

  it("pista plantada só na prosa também é cobrada", () => {
    const p = pendenciasDeFechamento({ promessasFundacao: [], promessasFichas: [], memoria: memoriaDaProsa() });
    expect(p.some((x) => x.enunciado.includes("caixa de metal"))).toBe(true);
  });

  it("revelação NÃO é cobrada como promessa (só promessa e pista pedem payoff)", () => {
    const p = pendenciasDeFechamento({ promessasFundacao: [], promessasFichas: [], memoria: memoriaDaProsa() });
    expect(p.some((x) => x.enunciado.includes("nome do irmão"))).toBe(false);
  });

  it("marcar o pagamento fecha a pendência", () => {
    const memoria = marcarPagamento(memoriaDaProsa(), "M03.1", 9);
    const memoria2 = marcarPagamento(memoria, "M03.2", 10);
    const p = pendenciasDeFechamento({ promessasFundacao: [], promessasFichas: [], memoria: memoria2 });
    expect(p.filter((x) => x.fonte === "prosa")).toEqual([]);
  });

  it("promessa da FUNDAÇÃO sem pagamento declarado é pendência", () => {
    const p = pendenciasDeFechamento({
      promessasFundacao: [{ id: "P1", enunciado: "o farol volta a funcionar", plantada_em: 1, paga_em: 0 }],
      promessasFichas: [],
      memoria: [],
    });
    expect(p[0]).toMatchObject({ fonte: "fundacao", id: "P1", motivo: "nunca_paga" });
  });

  it("promessa da FICHA plantada e nunca paga é pendência", () => {
    const p = pendenciasDeFechamento({
      promessasFundacao: [],
      promessasFichas: [{ capitulo: 2, id: "PX", acao: "planta" }],
      memoria: [],
    });
    expect(p[0]).toMatchObject({ fonte: "ficha", id: "PX", motivo: "nunca_paga" });
  });

  it("SILÊNCIO da ficha não vale como conformidade da prosa", () => {
    // A ficha nada marca; a fundação nada declara; a prosa abriu duas coisas.
    const p = pendenciasDeFechamento({ promessasFundacao: [], promessasFichas: [], memoria: memoriaDaProsa() });
    expect(p).not.toEqual([]);
  });

  it("livro com tudo pago em todas as fontes fecha limpo", () => {
    const memoria = marcarPagamento(marcarPagamento(memoriaDaProsa(), "M03.1", 9), "M03.2", 10);
    const p = pendenciasDeFechamento({
      promessasFundacao: [{ id: "P1", enunciado: "o farol volta", plantada_em: 1, paga_em: 11 }],
      promessasFichas: [
        { capitulo: 1, id: "P1", acao: "planta" },
        { capitulo: 11, id: "P1", acao: "paga" },
      ],
      memoria,
    });
    expect(p).toEqual([]);
  });
});

describe("validação do JSON do extrator", () => {
  it("aceita extração bem formada", () => {
    expect(validarExtracaoProsa(extracao()).entradas).toHaveLength(3);
  });
  it("rejeita tipo fora do vocabulário", () => {
    expect(() =>
      validarExtracaoProsa({ entradas: [{ tipo: "clima_da_cena", enunciado: "x", trecho: "y" }] })
    ).toThrow(/tipo inválido/);
  });
  it("rejeita entrada sem trecho", () => {
    expect(() => validarExtracaoProsa({ entradas: [{ tipo: "fato", enunciado: "x" }] })).toThrow(/trecho/);
  });
  it("divergências são opcionais", () => {
    expect(validarExtracaoProsa({ entradas: [] }).divergencias).toEqual([]);
  });
});

describe("localização de trecho", () => {
  it("exige ao menos 12 caracteres", () => {
    expect(trechoExiste("a chave", TEXTO)).toBe(false);
    expect(trechoExiste("Guardou a chave no bolso", TEXTO)).toBe(true);
  });
});
