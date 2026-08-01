// Cascata de julgamento — fatia 6a.
//
// O teste que mais importa aqui não é o da escalada: é o de que a decisão julga
// nos DOIS sentidos. Se o modelo caro só puder derrubar o que a triagem
// confirmou, a cascata vira máquina de leniência e a régua desce sem ninguém ter
// decidido descê-la. Este projeto já queimou três rodadas nesse padrão.

import { describe, expect, it } from "vitest";
import { aplicarDelta, precisaEscalar, validarDelta, DESCARTE_QUE_PESA } from "./cascata.js";
import { exigirDisposicaoCompleta, validarParecer } from "./revisor.js";
import type { SinalMedido } from "./sinais.js";
import type { Parecer, SinalDisposto } from "./tipos.js";

const EXEMPLOS = [
  "quem espera sempre alcança",
  "a memória é uma casa de portas trocadas",
  "toda espera é uma forma de fé",
  "o silêncio decide antes da boca",
  "guardar é uma forma de lembrar",
  "a pressa é filha do medo",
];

const medido = (over: Partial<SinalMedido> = {}): SinalMedido =>
  ({ sinal: "gnomico", valor: 6, cota: { max: 1 }, fora_da_cota: true, exemplos: EXEMPLOS, ...over }) as SinalMedido;

const eixo = { nota: 4, evidencia: "a virada muda o rumo" };
const parecer = (sinais: SinalDisposto[], verdict: Parecer["verdict"] = "reprovado"): Parecer =>
  ({
    schema: "parecer/v1",
    dramatic_progression: eixo,
    skill_adherence: eixo,
    clarity: eixo,
    emotional_effect: eixo,
    continuity: eixo,
    hook_effectiveness: eixo,
    verdict,
    evidencias: [],
    sinais,
    correcoes: [],
  }) as Parecer;

const delta = (over: Record<string, unknown> = {}) => ({
  schema: "delta-decisao/v1",
  derrubar: [],
  acrescentar: [],
  veredito_sugerido: "reprovado",
  observacao: "os seis eixos batem com o texto",
  ...over,
});

describe("gatilho: escala só quando há o que decidir", () => {
  it("(a) violação confirmada escala — a decisão pode derrubar", () => {
    const p = parecer([
      { sinal: "gnomico", valor: 6, disposicao: "violacao_confirmada", evidencia: "x", ocorrencias_citadas: [{ indice: 1 }], falsos_positivos: 5 },
    ]);
    expect(precisaEscalar(p, [medido()], { vaiFechar: false }).motivo).toMatch(/^\(a\)/);
  });

  it("(b) LIMPO DEMAIS escala — a decisão pode acrescentar", () => {
    // O caso que fecha a armadilha: a triagem descartou tudo, e sem este gatilho
    // ninguém reveria. São 15 dos 47 pareceres reais, com média de 7,6
    // ocorrências declaradas falso positivo.
    const p = parecer([{ sinal: "gnomico", valor: 6, disposicao: "falso_positivo", evidencia: "supercontou", falsos_positivos: 6 }]);
    const d = precisaEscalar(p, [medido()], { vaiFechar: false });
    expect(d.escalar).toBe(true);
    expect(d.motivo).toMatch(/^\(b\)/);
  });

  it("(c) pedido de decisão humana escala", () => {
    const p = parecer([{ sinal: "dossie", valor: "n/a", disposicao: "necessita_decisao_humana", evidencia: "sem dossiê" }]);
    expect(precisaEscalar(p, [], { vaiFechar: false }).motivo).toMatch(/^\(c\)/);
  });

  it("(d) capítulo prestes a FECHAR escala, mesmo sem sinal nenhum", () => {
    // Os seis eixos não têm outro gatilho, e é neles que mora o capítulo
    // competente-mas-morto. Falso reprovado custa uma rodada; falso aprovado
    // entra no livro.
    const d = precisaEscalar(parecer([], "aprovado"), [], { vaiFechar: true });
    expect(d.escalar).toBe(true);
    expect(d.motivo).toMatch(/^\(d\)/);
  });

  it("reprovado intermediário SEM sinal não escala — será corrigido de qualquer forma", () => {
    expect(precisaEscalar(parecer([]), [], { vaiFechar: false }).escalar).toBe(false);
  });

  it("descarte pequeno não escala sozinho (os dados não têm faixa 1–2)", () => {
    const p = parecer([{ sinal: "gnomico", valor: DESCARTE_QUE_PESA - 1, disposicao: "falso_positivo", evidencia: "x", falsos_positivos: 2 }]);
    expect(precisaEscalar(p, [medido({ valor: 2 })], { vaiFechar: false }).escalar).toBe(false);
  });
});

describe("a decisão julga nos DOIS sentidos", () => {
  it("DERRUBA confirmação que é falso positivo", () => {
    const p = parecer([
      {
        sinal: "gnomico",
        valor: 6,
        disposicao: "violacao_confirmada",
        evidencia: "máximas",
        ocorrencias_citadas: [{ indice: 1 }, { indice: 2 }],
        falsos_positivos: 4,
      },
    ]);
    const d = validarDelta(delta({ derrubar: [{ sinal: "gnomico", indice: 1, motivo: "é fala de personagem, não narração" }] }), [medido()]);
    const consolidado = aplicarDelta(p, d, [medido()]);
    const s = consolidado.sinais[0];
    expect(s.ocorrencias_citadas?.map((o) => o.indice)).toEqual([2]);
    expect(s.falsos_positivos).toBe(5);
    expect(() => exigirDisposicaoCompleta(validarParecer(consolidado), [medido()])).not.toThrow();
  });

  it("[DOD:R-01] ACRESCENTA violação que a triagem não viu", () => {
    // Sem este caminho a cascata só saberia perdoar.
    const p = parecer([{ sinal: "gnomico", valor: 6, disposicao: "falso_positivo", evidencia: "supercontou", falsos_positivos: 6 }]);
    const d = validarDelta(
      delta({ acrescentar: [{ sinal: "gnomico", indice: 4, motivo: "é máxima do narrador, não do personagem" }] }),
      [medido()]
    );
    const consolidado = aplicarDelta(p, d, [medido()]);
    const s = consolidado.sinais[0];
    expect(s.disposicao).toBe("violacao_confirmada");
    expect(s.ocorrencias_citadas?.map((o) => o.indice)).toEqual([4]);
    expect(s.falsos_positivos).toBe(5);
    expect(() => exigirDisposicaoCompleta(validarParecer(consolidado), [medido()])).not.toThrow();
  });

  it("fecha a conta ao acrescentar sobre falso_positivo sem contagem declarada", () => {
    // Forma observada na prova real: ao descartar tudo, a triagem podia omitir
    // falsos_positivos; confirmar uma ocorrência torna a conta obrigatória.
    const p = parecer([{ sinal: "sanfona (negação reformuladora)", valor: 4, disposicao: "falso_positivo", evidencia: "supercontou" }]);
    const medicao = medido({ sinal: "sanfona", valor: 4, exemplos: EXEMPLOS.slice(0, 4) });
    const d = validarDelta(
      delta({ acrescentar: [{ sinal: "sanfona", indice: 2, motivo: "a reformulação repete o tique do narrador" }] }),
      [medicao]
    );
    const consolidado = aplicarDelta(p, d, [medicao]);
    const s = consolidado.sinais[0];
    expect(s.ocorrencias_citadas?.map((o) => o.indice)).toEqual([2]);
    expect(s.falsos_positivos).toBe(3);
    expect(s.valor).toBe(4);
    expect(() => exigirDisposicaoCompleta(validarParecer(consolidado), [medicao])).not.toThrow();
  });

  it("derrubar a última ocorrência converte o sinal em falso positivo", () => {
    const p = parecer([
      { sinal: "gnomico", valor: 6, disposicao: "violacao_confirmada", evidencia: "x", ocorrencias_citadas: [{ indice: 1 }], falsos_positivos: 5 },
    ]);
    const d = validarDelta(delta({ derrubar: [{ sinal: "gnomico", indice: 1, motivo: "enumeração legítima, não tique" }] }), [medido()]);
    expect(aplicarDelta(p, d, [medido()]).sinais[0].disposicao).toBe("falso_positivo");
  });

  it("delta vazio é resposta legítima: a triagem acertou", () => {
    const p = parecer([{ sinal: "gnomico", valor: 6, disposicao: "falso_positivo", evidencia: "x", falsos_positivos: 6 }]);
    const consolidado = aplicarDelta(p, validarDelta(delta(), [medido()]), [medido()]);
    expect(consolidado.sinais[0].disposicao).toBe("falso_positivo");
  });
});

describe("o que a decisão NÃO pode fazer", () => {
  it("derrubar sem justificar é rejeitado", () => {
    expect(() => validarDelta(delta({ derrubar: [{ sinal: "gnomico", indice: 1, motivo: "não" }] }), [medido()])).toThrow(
      /sem justificar não é julgamento/
    );
  });

  it("acrescentar violação SEM citar índice é rejeitado", () => {
    expect(() =>
      validarDelta(delta({ acrescentar: [{ sinal: "gnomico", motivo: "é máxima do narrador mesmo" }] }), [medido()])
    ).toThrow(/indice deve ser inteiro/);
  });

  it("índice inexistente é rejeitado (herda a régua da fatia 2)", () => {
    expect(() =>
      validarDelta(delta({ acrescentar: [{ sinal: "gnomico", indice: 99, motivo: "é máxima do narrador mesmo" }] }), [medido()])
    ).toThrow(/fora do medido/);
  });

  it("sinal que o detector não mediu é rejeitado", () => {
    expect(() =>
      validarDelta(delta({ derrubar: [{ sinal: "inventado", indice: 1, motivo: "motivo suficientemente longo" }] }), [medido()])
    ).toThrow(/não foi medido pelo detector/);
  });

  it("veredito fora do vocabulário é rejeitado", () => {
    expect(() => validarDelta(delta({ veredito_sugerido: "quase" }), [medido()])).toThrow(/veredito_sugerido inválido/);
  });

  it("observação vazia é rejeitada — a decisão tem de dizer o que viu nos eixos", () => {
    const d = delta();
    delete (d as Record<string, unknown>).observacao;
    expect(() => validarDelta(d, [medido()])).toThrow(/observacao obrigatória/);
  });

  it("schema errado é rejeitado", () => {
    expect(() => validarDelta(delta({ schema: "outro/v1" }), [medido()])).toThrow(/schema inválido/);
  });
});

describe("o consolidado passa pela MESMA validação da triagem", () => {
  it("delta que quebra a conta fechada é pego pela régua de sempre", () => {
    // aplicarDelta ajusta falsos_positivos; se algo escapar, exigirDisposicaoCompleta pega.
    const p = parecer([
      { sinal: "gnomico", valor: 6, disposicao: "violacao_confirmada", evidencia: "x", ocorrencias_citadas: [{ indice: 1 }], falsos_positivos: 5 },
    ]);
    const consolidado = aplicarDelta(p, validarDelta(delta(), [medido()]), [medido()]);
    expect(() => exigirDisposicaoCompleta(validarParecer(consolidado), [medido()])).not.toThrow();
  });

  it("a observação da decisão fica registrada nas evidências", () => {
    const p = parecer([]);
    const consolidado = aplicarDelta(p, validarDelta(delta({ observacao: "capítulo competente e morto" }), []), []);
    expect(consolidado.evidencias.at(-1)?.trecho).toContain("competente e morto");
  });
});
