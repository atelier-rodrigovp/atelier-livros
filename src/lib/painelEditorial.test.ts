// Fatia O — a tela do projeto mostra a inteligência editorial da engine.
import { describe, expect, it } from "vitest";
import {
  acaoParaBloqueio,
  montarPainel,
  motivosDeBloqueio,
  painelDeCorrecoes,
  painelDeReescritas,
  painelTemConteudo,
  POLITICA_REESCRITA,
  promessasAbertas,
  promessasEPistas,
  TODAS_ESTRATEGIAS,
  type EstadoV2Painel,
} from "./painelEditorial";

const estado = (over: Partial<EstadoV2Painel> = {}): EstadoV2Painel => ({
  fase: "escrita",
  memoria_prosa: [
    {
      id: "M03.1",
      tipo: "pista",
      capitulo: 3,
      enunciado: "há uma caixa de metal com as iniciais TPEA sob a mesa",
      trecho: "havia uma caixa de metal com as iniciais T.P.E.A.",
      origem: "prosa",
      estado: "aberta",
    },
    {
      id: "M05.1",
      tipo: "promessa",
      capitulo: 5,
      enunciado: "Marina promete voltar ao arquivo antes do amanhecer",
      trecho: "prometeu a si mesma voltar antes do amanhecer",
      origem: "prosa",
      estado: "paga",
      paga_em: 9,
    },
    {
      id: "M06.1",
      tipo: "revelacao",
      capitulo: 6,
      enunciado: "o farol foi automatizado em 1987",
      trecho: "a placa dizia 1987",
      origem: "ficha",
      estado: "aberta",
    },
  ],
  ledger_revelacoes: [{ id: "R02.1", capitulo: 2, enunciado: "o irmão esteve no consulado" }],
  ...over,
});

describe("promessas e pistas chegam ao autor", () => {
  it("[DOD:O-01] lista promessas e pistas, com origem e trecho da página", () => {
    const p = promessasEPistas(estado());
    expect(p).toHaveLength(2); // revelação não é promessa
    expect(p[0]).toMatchObject({ id: "M03.1", origem: "prosa", plantada_em: 3 });
    expect(p[0].trecho).toContain("caixa de metal");
  });

  it("separa abertas de pagas", () => {
    expect(promessasAbertas(estado()).map((p) => p.id)).toEqual(["M03.1"]);
    const painel = montarPainel(estado());
    expect(painel.promessasPagas.map((p) => p.id)).toEqual(["M05.1"]);
    expect(painel.promessasPagas[0].paga_em).toBe(9);
  });

  it("ordena por capítulo de plantio", () => {
    expect(promessasEPistas(estado()).map((p) => p.plantada_em)).toEqual([3, 5]);
  });

  it("[DOD:O-01] o ledger de revelações aparece no painel", () => {
    expect(montarPainel(estado()).ledger).toHaveLength(1);
  });

  it("conflitos ficha × prosa aparecem", () => {
    const p = montarPainel(
      estado({ conflitos_ficha_prosa: [{ capitulo: 4, campo: "virada", valorFicha: "a", valorProsa: "b" }] })
    );
    expect(p.conflitos).toHaveLength(1);
    expect(p.conflitos[0].campo).toBe("virada");
  });
});

describe("estratégias de correção já tentadas", () => {
  const comCorrecoes = () =>
    estado({
      correcoes: {
        "7": [
          { estrategia: "correcao_cirurgica", hipotese: "defeito localizado", resultado: "persistiu", gate: "sinal_cadencia", criado_em: "t1" },
          { estrategia: "reescrita_orientada", hipotese: "defeito difuso", resultado: "persistiu", gate: "sinal_cadencia", criado_em: "t2" },
        ],
      },
    });

  it("[DOD:O-01] mostra o que foi tentado, com a hipótese de cada tentativa", () => {
    const p = painelDeCorrecoes(comCorrecoes())[0];
    expect(p.capitulo).toBe(7);
    expect(p.tentativas.map((t) => t.estrategia)).toEqual(["correcao_cirurgica", "reescrita_orientada"]);
    expect(p.tentativas[0].hipotese).toContain("localizado");
  });

  it("mostra o que AINDA NÃO foi tentado", () => {
    const p = painelDeCorrecoes(comCorrecoes())[0];
    expect(p.naoTentadas).toEqual(["reficha", "reescrita_integral", "julgamento_alternativo"]);
    expect(p.naoTentadas.length + p.tentativas.length).toBe(TODAS_ESTRATEGIAS.length);
  });

  it("sinaliza AUSÊNCIA DE PROGRESSO", () => {
    expect(painelDeCorrecoes(comCorrecoes())[0].semProgresso).toBe(true);
  });

  it("uma tentativa que resolveu não é ausência de progresso", () => {
    const e = estado({
      correcoes: {
        "7": [
          { estrategia: "correcao_cirurgica", hipotese: "h", resultado: "persistiu", gate: "g", criado_em: "t1" },
          { estrategia: "reficha", hipotese: "h", resultado: "resolvido", gate: "g", criado_em: "t2" },
        ],
      },
    });
    expect(painelDeCorrecoes(e)[0].semProgresso).toBe(false);
  });

  it("mostra o circuit breaker com motivo e contagem", () => {
    const e = estado({
      correcoes: { "7": [{ estrategia: "reficha", hipotese: "h", resultado: "persistiu", gate: "g", criado_em: "t" }] },
      circuit_breaker: [{ capitulo: 7, motivo: "duas tentativas seguidas não alteraram o texto", tentativas: 2 }],
    });
    expect(painelDeCorrecoes(e)[0].circuitBreaker).toMatchObject({ tentativas: 2 });
  });
});

describe("motivo estruturado do bloqueio, com ação dirigida", () => {
  it("cada tipo de bloqueio oferece a ação certa", () => {
    expect(acaoParaBloqueio("BRIEFING_NAO_APROVADO")).toBe("revisar_briefing");
    expect(acaoParaBloqueio("PROJETO_V2_NAO_AUTORIZADO")).toBe("autorizar_projeto");
    expect(acaoParaBloqueio("FUNDACAO_REPROVADA")).toBe("reconstruir_fundacao");
    expect(acaoParaBloqueio("PREMISSA_ALTERADA")).toBe("reconstruir_fundacao");
    expect(acaoParaBloqueio("GATE_ficha_fora_do_arco")).toBe("reconstruir_ficha");
    expect(acaoParaBloqueio("QUALIDADE_REPROVADA", "sinal_cadencia fora da cota")).toBe("aceitar_excecao");
  });

  it("[DOD:O-01] o painel expõe o bloqueio com código, alvo, detalhe e ação", () => {
    const p = motivosDeBloqueio(
      estado({ bloqueios: [{ codigo: "GATE_promessa_nao_paga", alvo: "livro", detalhe: "P7 nunca paga" }] })
    );
    expect(p[0]).toMatchObject({ codigo: "GATE_promessa_nao_paga", alvo: "livro", acao: "reescrever_capitulo" });
    expect(p[0].detalhe).toContain("P7");
  });

  it("as ações do painel são as dos bloqueios, sem repetição", () => {
    const p = montarPainel(
      estado({
        bloqueios: [
          { codigo: "BRIEFING_NAO_APROVADO", alvo: "livro", detalhe: "" },
          { codigo: "BRIEFING_COM_LACUNAS", alvo: "livro", detalhe: "" },
        ],
      })
    );
    expect(p.acoes).toEqual(["revisar_briefing"]);
  });
});

describe("propagação de reescrita é visível e HONESTA", () => {
  it("[DOD:O-01] mostra os capítulos afetados e por quê", () => {
    const p = painelDeReescritas(
      estado({
        revalidacoes: [
          { origem: 4, acao: "reabrir", afetados: [{ capitulo: 11, motivos: ["promessa:P1 (via cap 4)"] }] },
        ],
      })
    )[0];
    expect(p.afetados[0].capitulo).toBe(11);
    expect(p.afetados[0].motivos[0]).toContain("promessa:P1");
  });

  it("a explicação diz que reabrir é REAVALIAR, não reescrever", () => {
    const p = painelDeReescritas(estado({ revalidacoes: [{ origem: 4, acao: "reabrir", afetados: [{ capitulo: 11, motivos: [] }] }] }))[0];
    expect(p.explicacao).toContain("REAVALIAR");
    expect(p.explicacao).toContain("só é reescrito o que a reavaliação reprovar");
  });

  it("cascata acima do teto diz que NADA foi alterado", () => {
    const p = painelDeReescritas(estado({ revalidacoes: [{ origem: 4, acao: "decisao_humana", afetados: [] }] }))[0];
    expect(p.explicacao).toContain("Nada foi alterado");
  });

  it("[DOD:O-02] A INTERFACE NÃO PROMETE que capítulo aprovado nunca é reescrito", () => {
    // O Meta9 pode reescrevê-lo. A política declarada tem de dizer isso.
    expect(POLITICA_REESCRITA).toContain("podem ser reescritos");
    expect(POLITICA_REESCRITA).not.toMatch(/nunca (são|serão) reescritos/i);
    expect(POLITICA_REESCRITA).toContain("melhor versão aprovada é preservada");
  });
});

describe("artefatos invalidados e certificado", () => {
  it("invalidação aparece com artefatos e motivo, e oferece reconstruir", () => {
    const p = montarPainel(
      estado({ invalidacao: { artefatos: ["fundacao", "capitulos"], motivo: "idioma alterado" } })
    );
    expect(p.invalidacao?.artefatos).toContain("capitulos");
    expect(p.acoes).toContain("reconstruir_fundacao");
  });

  it("o canário aprovado aparece com hash, quem aprovou e quando", () => {
    const p = montarPainel(
      estado({ canario_snapshot: { hash: "abc123", aprovado_por: "rodrigo", aprovado_em: "2026-07-28" } })
    );
    expect(p.canario).toMatchObject({ aprovado_por: "rodrigo" });
  });
});

describe("painel vazio", () => {
  it("estado nulo não quebra e não tem conteúdo", () => {
    const p = montarPainel(null);
    expect(painelTemConteudo(p)).toBe(false);
    expect(p.promessasAbertas).toEqual([]);
    expect(p.acoes).toEqual([]);
  });

  it("estado com promessa tem conteúdo", () => {
    expect(painelTemConteudo(montarPainel(estado()))).toBe(true);
  });
});
