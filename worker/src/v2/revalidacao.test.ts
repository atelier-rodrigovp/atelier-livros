// Fatia K — revalidação transitiva.
import { describe, expect, it } from "vitest";
import {
  avaliarCascata,
  capitulosAfetados,
  construirGrafo,
  decidirRevalidacao,
  executarOndaRevalidacao,
  MAX_REESCRITAS_POR_ONDA,
  planejarAposReavaliacao,
  TETO_PROPAGACAO,
} from "./revalidacao.js";
import type { EntradaMemoria } from "./memoria-prosa.js";
import type { SceneSpec } from "./tipos.js";

function ficha(capitulo: number, over: Partial<SceneSpec> = {}): { capitulo: number; ficha: SceneSpec } {
  return {
    capitulo,
    ficha: {
      schema: "scene-spec/v1",
      capitulo,
      pov: "Marina",
      local: "farol",
      tempo: `Dia ${capitulo}`,
      objetivo: "o",
      obstaculo: "o",
      acao_fisica: "a",
      informacao_nova: "i",
      virada: "v",
      mudanca_estado: "m",
      gancho: { tipo: "ameaca", descricao: "d" },
      fatos_obrigatorios: [],
      conhecimentos_proibidos: [],
      fios_avancados: [],
      fios_ausentes: [],
      ...over,
    },
  };
}

const memoria = (over: Partial<EntradaMemoria> = {}): EntradaMemoria => ({
  id: "M04.1",
  tipo: "conhecimento",
  capitulo: 4,
  enunciado: "Marina descobre que o irmão trabalhava para o TPEA",
  trecho: "o crachá do irmão trazia o selo do TPEA",
  confianca: "alta",
  text_hash: "h",
  origem: "prosa",
  estado: "aberta",
  ...over,
});

describe("grafo de dependências por CANAL, não por proximidade", () => {
  it("fio liga capítulos do mesmo fio, mesmo distantes", () => {
    const g = construirGrafo({
      fichas: [
        ficha(1, { fios_avancados: ["investigacao"] }),
        ficha(2, { fios_avancados: ["romance"] }),
        ficha(9, { fios_avancados: ["investigacao"] }),
      ],
      memoria: [],
    });
    expect(g.arestas).toContainEqual({ de: 1, para: 9, canal: "fio", chave: "investigacao" });
  });

  it("promessa liga quem paga a quem plantou", () => {
    const g = construirGrafo({
      fichas: [
        ficha(2, { promessas_tocadas: [{ id: "P1", acao: "planta" }] }),
        ficha(11, { promessas_tocadas: [{ id: "P1", acao: "paga" }] }),
      ],
      memoria: [],
    });
    expect(g.arestas).toContainEqual({ de: 2, para: 11, canal: "promessa", chave: "P1" });
  });

  it("conhecimento estabelecido na PROSA liga a quem o usa depois", () => {
    const g = construirGrafo({
      fichas: [
        ficha(4),
        ficha(11, { objetivo: "confrontar o irmão sobre o TPEA", informacao_nova: "o irmão trabalhava para o TPEA" }),
      ],
      memoria: [memoria()],
    });
    expect(g.arestas.some((a) => a.de === 4 && a.para === 11 && a.canal === "conhecimento")).toBe(true);
  });

  it("dependência é sempre do passado para o futuro", () => {
    const g = construirGrafo({
      fichas: [ficha(1, { fios_avancados: ["x"] }), ficha(5, { fios_avancados: ["x"] })],
      memoria: [],
    });
    expect(g.arestas.every((a) => a.de < a.para)).toBe(true);
  });

  it("capítulos SEM canal em comum não geram aresta", () => {
    const g = construirGrafo({
      fichas: [
        ficha(1, { pov: "Marina", local: "farol", fios_avancados: ["a"], tempo: "" }),
        ficha(7, { pov: "Helena", local: "consulado", fios_avancados: ["b"], tempo: "" }),
      ],
      memoria: [],
    });
    expect(g.arestas).toEqual([]);
  });
});

describe("fecho transitivo — o capítulo 11 aparece quando o 4 muda", () => {
  const cenario = () =>
    construirGrafo({
      fichas: [
        ficha(4, { fios_avancados: ["investigacao"], promessas_tocadas: [{ id: "P1", acao: "planta" }] }),
        ficha(5, { fios_avancados: ["investigacao"] }),
        ficha(7, { fios_avancados: ["romance"], pov: "Helena", local: "consulado", tempo: "" }),
        ficha(11, { fios_avancados: ["investigacao"], promessas_tocadas: [{ id: "P1", acao: "paga" }] }),
      ],
      memoria: [],
    });

  it("[DOD:K-01] alteração no 4 reabre APENAS os dependentes", () => {
    const afetados = capitulosAfetados(cenario(), 4);
    const numeros = afetados.map((a) => a.capitulo);
    expect(numeros).toContain(5);
    expect(numeros).toContain(11);
    expect(numeros).not.toContain(7); // outro fio, outro POV, outro local
  });

  it("cada afetado explica POR QUE depende", () => {
    const a = capitulosAfetados(cenario(), 4).find((x) => x.capitulo === 11)!;
    expect(a.motivos.length).toBeGreaterThan(0);
    expect(a.motivos.map((m) => m.canal)).toContain("promessa");
  });

  it("distância registra dependência indireta", () => {
    const g = construirGrafo({
      fichas: [
        ficha(1, { fios_avancados: ["a"] }),
        ficha(2, { fios_avancados: ["a", "b"] }),
        ficha(3, { fios_avancados: ["b"], pov: "Helena", local: "porto", tempo: "" }),
      ],
      memoria: [],
    });
    const afetados = capitulosAfetados(g, 1);
    expect(afetados.find((a) => a.capitulo === 2)?.distancia).toBe(1);
    expect(afetados.find((a) => a.capitulo === 3)?.distancia).toBe(2);
  });

  it("o próprio capítulo alterado nunca entra na lista", () => {
    expect(capitulosAfetados(cenario(), 4).some((a) => a.capitulo === 4)).toBe(false);
  });
});

describe("reabrir NÃO é reescrever", () => {
  it("a decisão é REABRIR (invalidar e reavaliar), nunca reescrever", () => {
    const d = decidirRevalidacao([
      { capitulo: 5, motivos: [{ canal: "fio", chave: "investigacao", via: 4 }], distancia: 1 },
    ]);
    expect(d.acao).toBe("reabrir");
    expect(d.motivo).toContain("REAVALIADOS");
  });

  it("[DOD:K-02] capítulo que continua válido é MANTIDO — o texto original fica intacto", () => {
    const plano = planejarAposReavaliacao([
      { capitulo: 5, continuaValido: true, problemas: [] },
      { capitulo: 11, continuaValido: false, problemas: ["a promessa P1 não fecha mais"] },
    ]);
    expect(plano.mantidos).toEqual([5]);
    expect(plano.reescrever).toEqual([11]);
  });

  it("todos válidos = nenhuma reescrita", () => {
    const plano = planejarAposReavaliacao([
      { capitulo: 5, continuaValido: true, problemas: [] },
      { capitulo: 11, continuaValido: true, problemas: [] },
    ]);
    expect(plano.reescrever).toEqual([]);
  });

  it("nenhum dependente = nenhuma ação", () => {
    expect(decidirRevalidacao([]).acao).toBe("nenhuma");
  });

  it("[DOD:K-04] consumidor transitivo mantém válidos e reescreve somente reprovados", async () => {
    const chamadas: string[] = [];
    const afetados = [
      { capitulo: 5, motivos: [{ canal: "fio" as const, chave: "x", via: 4 }], distancia: 1 },
      { capitulo: 11, motivos: [{ canal: "promessa" as const, chave: "P1", via: 4 }], distancia: 1 },
    ];
    const r = await executarOndaRevalidacao(afetados, {
      reavaliar: async (capitulo) => {
        chamadas.push(`avaliar:${capitulo}`);
        return capitulo === 5
          ? { capitulo, continuaValido: true, problemas: [] }
          : { capitulo, continuaValido: false, problemas: ["P1 deixou de fechar"] };
      },
      reescrever: async (capitulo, problemas) => {
        chamadas.push(`reescrever:${capitulo}:${problemas[0]}`);
        return { capitulo, continuaValido: true, problemas: [] };
      },
    });

    expect(r.status).toBe("concluida");
    expect(r.mantidos).toEqual([5]);
    expect(r.reescritos).toEqual([11]);
    expect(chamadas).toEqual([
      "avaliar:5",
      "avaliar:11",
      "reescrever:11:P1 deixou de fechar",
    ]);
  });
});

describe("teto de propagação e circuit breaker", () => {
  const afetado = (n: number) => ({
    capitulo: n,
    motivos: [{ canal: "fio" as const, chave: "x", via: 1 }],
    distancia: 1,
  });

  it("[DOD:K-03] cascata acima do teto aciona DECISÃO HUMANA", () => {
    const d = decidirRevalidacao(Array.from({ length: TETO_PROPAGACAO + 1 }, (_, i) => afetado(i + 2)));
    expect(d.acao).toBe("decisao_humana");
    expect(d.motivo).toContain("refazer meio livro");
  });

  it("no teto exato ainda reabre automaticamente", () => {
    const d = decidirRevalidacao(Array.from({ length: TETO_PROPAGACAO }, (_, i) => afetado(i + 2)));
    expect(d.acao).toBe("reabrir");
  });

  it("o teto é parametrizável", () => {
    expect(decidirRevalidacao([afetado(2), afetado(3)], { teto: 1 }).acao).toBe("decisao_humana");
  });

  it("breaker corta a onda quando as reescritas se acumulam", () => {
    const d = avaliarCascata({ reescritasNaOnda: MAX_REESCRITAS_POR_ONDA, jaReabertos: [] }, 9);
    expect(d.continua).toBe(false);
    expect(d).toMatchObject({ motivo: expect.stringContaining("decisão passa ao autor") });
  });

  it("breaker corta ciclo (capítulo já reaberto nesta onda)", () => {
    const d = avaliarCascata({ reescritasNaOnda: 1, jaReabertos: [9] }, 9);
    expect(d.continua).toBe(false);
    expect(d).toMatchObject({ motivo: expect.stringContaining("ciclo") });
  });

  it("onda dentro do limite continua", () => {
    expect(avaliarCascata({ reescritasNaOnda: 1, jaReabertos: [5] }, 9).continua).toBe(true);
  });
});
