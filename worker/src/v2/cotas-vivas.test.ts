// Fatia E — as cotas que estavam inertes. Prova o COMPORTAMENTO novo, não só o valor:
// a isenção do piso do hoover (fio-M) e a disposição fechada do romantasy.
import { describe, expect, it } from "vitest";
import { carregarContrato } from "./contrato.js";
import { conferirParecer } from "./revisor.js";
import { fracaoItalico, medirSinais, ocorrenciasMuletaGenerica, resumoSinais } from "./sinais.js";
import type { Parecer } from "./tipos.js";

const eixo = { nota: 4, evidencia: "e" };
function parecer(over: Partial<Parecer> = {}): Parecer {
  return {
    schema: "parecer/v1",
    dramatic_progression: eixo,
    skill_adherence: eixo,
    clarity: eixo,
    emotional_effect: eixo,
    continuity: eixo,
    hook_effectiveness: eixo,
    verdict: "aprovado_com_excecao",
    // Evidência REALISTA: o piso de localização (fatia J) rejeita trecho de um caractere.
    evidencias: [{ local: "L:1", trecho: "a maré subiu antes da hora prevista", observacao: "gancho concreto e localizado" }],
    sinais: [],
    correcoes: [],
    ...over,
  };
}

describe("cotas preenchidas nos contratos", () => {
  it("dan-brown: a cota de metáfora vem do TETO HUMANO medido, não da frase de ofício", () => {
    const c = carregarContrato("dan-brown").contrato;
    // 2026-08-05: era 6, derivado de "≈1 por página × ~6 páginas". Esse 6 reprovava
    // 12 das 127 janelas humanas de 2.500 palavras — 7 delas do PRÓPRIO Dan Brown.
    // O teto agora é o máximo humano medido (Brown 11, Hoover 12, McFadden 5), com
    // 0 das 127 janelas acima. Mesma regra dos moldes: o teto vem de prosa humana
    // publicada, nunca do acervo da engine (docs/engine-v2/09-teto-humano.md).
    expect(c.politica_metafora.cota_por_capitulo).toBe(12);
    // A procedência vive no JSON do contrato, como `justificativa_sem_cota` do
    // hoover — campo de registro, fora do tipo (convenção já existente aqui).
    expect(JSON.stringify(c.politica_metafora)).toMatch(/0 das 127 janelas humanas/);
    // O contrato registra "3 capítulos com 0% de diálogo aprovados" como defeito.
    expect(c.politica_dialogo.piso_percentual).toBe(5);
  });

  it("hoover: AUSÊNCIA justificada, não cota morta — e agora INFORMADA pela medição", () => {
    const c = carregarContrato("hoover-mcfadden").contrato;
    expect(c.politica_dialogo.piso_percentual).toBeUndefined();
    expect(c.politica_metafora.cota_por_capitulo).toBeUndefined();
    // A justificativa fica no próprio contrato (lição CR4).
    expect(JSON.stringify(c.politica_dialogo)).toContain("CR4");
    // 2026-08-05: a ausência deixou de ser cega. O contrato carrega o teto humano
    // medido (12) e o retrato do acervo, para que manter a ausência seja decisão
    // com número na mão — e registra que o piso de diálogo NÃO foi medível.
    expect(JSON.stringify(c.politica_metafora)).toMatch(/teto 12/);
    expect(JSON.stringify(c.politica_dialogo)).toMatch(/não preserva quebra de parágrafo/);
  });

  it("romantasy: piso de diálogo existe; metáfora sem cota por decisão declarada", () => {
    const c = carregarContrato("romantasy").contrato;
    expect(c.politica_dialogo.piso_percentual).toBe(10);
    expect(c.politica_metafora.cota_por_capitulo).toBeUndefined();
    // A ressalva de proveniência: não há romantasy no corpus humano.
    expect(JSON.stringify(c.politica_metafora)).toMatch(/não há romantasy no corpus/);
  });

  it("o número do piso de densidade tem UMA fonte: faixa_palavras", () => {
    for (const id of ["hoover-mcfadden", "romantasy"]) {
      const c = carregarContrato(id).contrato;
      const regra = c.regras.find((r) => r.id === "piso-densidade")!;
      // A regra guarda a SEMÂNTICA; o número saiu dela.
      expect(regra.cota).toBeUndefined();
      expect(c.faixa_palavras.min).toBe(2000);
    }
  });
});

describe("hoover: o fio-M é isento do piso", () => {
  const contrato = carregarContrato("hoover-mcfadden").contrato;
  const curto = (italico: boolean) => {
    const p = Array.from({ length: 6 }, (_, i) => `Parágrafo ${i} com um punhado de palavras apenas aqui.`);
    return `## Capítulo 4\n\n${p.map((x) => (italico ? `*${x}*` : x)).join("\n\n")}`;
  };

  it("capítulo curto da NARRADORA fica fora do piso", () => {
    const s = medirSinais(curto(false), contrato).find((x) => x.sinal === "palavras")!;
    expect(s.cota?.min).toBe(2000);
    expect(s.fora_da_cota).toBe(true);
    expect(s.isencao_aplicada).toBeUndefined();
  });

  it("capítulo curto em ITÁLICO (fio-M de memória) NÃO fica fora do piso", () => {
    const s = medirSinais(curto(true), contrato).find((x) => x.sinal === "palavras")!;
    expect(s.cota?.min).toBeUndefined();
    expect(s.fora_da_cota).toBe(false);
    expect(s.isencao_aplicada).toContain("fio-M");
  });

  it("a isenção é comunicada ao revisor no resumo dos sinais", () => {
    const resumo = resumoSinais(medirSinais(curto(true), contrato));
    expect(resumo).toContain("ISENÇÃO DO PISO APLICADA");
  });

  it("a isenção NÃO vaza para as outras skills", () => {
    for (const id of ["dan-brown", "romantasy"]) {
      const c = carregarContrato(id).contrato;
      expect(c.faixa_palavras.isencao_piso).toBeUndefined();
      const s = medirSinais(curto(true), c).find((x) => x.sinal === "palavras")!;
      expect(s.isencao_aplicada).toBeUndefined();
    }
  });

  it("fracaoItalico mede o capítulo, não o pensamento em itálico solto", () => {
    expect(fracaoItalico(curto(true))).toBeGreaterThan(0.5);
    expect(fracaoItalico("Ele parou. *Não podia ser.* Seguiu em frente.")).toBe(0);
  });
});

describe("romantasy: abaixo do piso é reprovação, não 'ou justificado'", () => {
  const contrato = carregarContrato("romantasy").contrato;
  // Prosa curta e mansa: o único sinal fora da cota tem de ser `palavras`, senão
  // o veredito cairia por outro motivo e o teste provaria a coisa errada.
  const curto = [
    "## Capítulo 2",
    "",
    "Ela abriu a porta do salão e contou as cadeiras vazias antes de sentar na primeira delas.",
    "O chá esfriava na xícara enquanto o relógio da parede marcava as horas com um estalo seco.",
    "Ele chegou tarde, tirou o casaco molhado e pendurou no encosto sem dizer nada para ela.",
  ].join("\n\n");

  /** Dispõe todo sinal fora da cota, para isolar o efeito da disposição fechada. */
  const disporTudo = (disposicaoPalavras: "excecao_valida" | "falso_positivo") => {
    const sinais = medirSinais(curto, contrato);
    return {
      sinais,
      p: parecer({
        sinais: sinais
          .filter((s) => s.fora_da_cota)
          .map((s) => ({
            sinal: s.sinal,
            valor: s.valor,
            disposicao: s.sinal === "palavras" ? disposicaoPalavras : ("falso_positivo" as const),
            evidencia: "cena curta proposital",
          })),
      }),
    };
  };

  it("o sinal `palavras` carrega disposição fechada", () => {
    const s = medirSinais(curto, contrato).find((x) => x.sinal === "palavras")!;
    expect(s.fora_da_cota).toBe(true);
    expect(s.sem_excecao).toBe(true);
  });

  it('"excecao_valida" é REBAIXADA a violação e o capítulo reprova', () => {
    const { sinais, p } = disporTudo("excecao_valida");
    const c = conferirParecer(p, sinais);
    expect(c.verdictEfetivo).toBe("reprovado");
    expect(c.rebaixados).toContain("palavras");
    expect(c.problemas.join(" ")).toContain("não admite exceção");
  });

  it("no hoover, a MESMA exceção continua válida (a régua não é global — lição CR4)", () => {
    const hoover = carregarContrato("hoover-mcfadden").contrato;
    const sinais = medirSinais(curto, hoover);
    const p = parecer({
      sinais: sinais
        .filter((s) => s.fora_da_cota)
        .map((s) => ({
          sinal: s.sinal,
          valor: s.valor,
          disposicao: s.sinal === "palavras" ? ("excecao_valida" as const) : ("falso_positivo" as const),
          evidencia: "cena curta proposital",
        })),
    });
    const c = conferirParecer(p, sinais);
    expect(c.rebaixados).toEqual([]);
    expect(c.verdictEfetivo).toBe("aprovado_com_excecao");
  });

  it("a disposição fechada é comunicada ao revisor", () => {
    expect(resumoSinais(medirSinais(curto, contrato))).toContain("DISPOSIÇÃO FECHADA");
  });
});

describe("detector da muleta genérica (pronto; emissão retida)", () => {
  it("encontra 'coisa'/'coisas'/'algo' com contexto citável", () => {
    const oc = ocorrenciasMuletaGenerica("Ela viu uma coisa estranha. Depois, algo pior. Duas coisas, na verdade.");
    expect(oc).toHaveLength(3);
    expect(oc[0]).toContain("coisa");
    expect(oc[1]).toContain("algo");
  });

  it("NÃO casa dentro de palavra maior", () => {
    expect(ocorrenciasMuletaGenerica("coisada algoritmo")).toEqual([]);
  });

  it("nenhum contrato emite o sinal enquanto o corpus não tiver rótulos", () => {
    for (const id of ["dan-brown", "hoover-mcfadden", "romantasy"]) {
      const s = medirSinais("Uma coisa. Algo mais.", carregarContrato(id).contrato);
      expect(s.find((x) => x.sinal === "muleta_coisa")).toBeUndefined();
    }
  });
});
