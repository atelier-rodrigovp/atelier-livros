import { describe, expect, it } from "vitest";
import {
  colisoesDeRevelacao,
  compararEnunciados,
  entradasDaFicha,
  evidenciaColisao,
  fundirNoLedger,
  gateRevelacaoRepetida,
  LIMIAR_JACCARD,
  renderizarLedger,
  revelacoesDaFicha,
  TETO_LEDGER_NO_PACOTE,
} from "./ledger.js";
import type { RevelacaoLedger, SceneSpec } from "./tipos.js";

function ficha(over: Partial<SceneSpec> = {}): SceneSpec {
  return {
    schema: "scene-spec/v1",
    capitulo: 1,
    pov: "Marina",
    local: "farol",
    tempo: "Dia 1, 08h",
    objetivo: "abrir o diário",
    obstaculo: "fechadura emperrada",
    acao_fisica: "força a tampa com a chave de fenda",
    informacao_nova: "o faroleiro anterior desapareceu na noite do naufrágio",
    virada: "a página final está arrancada",
    mudanca_estado: "de curiosa a desconfiada",
    gancho: { tipo: "revelacao", descricao: "a assinatura no diário é do pai dela" },
    fatos_obrigatorios: [],
    conhecimentos_proibidos: [],
    fios_avancados: [],
    fios_ausentes: [],
    ...over,
  };
}

describe("casamento de revelações", () => {
  it("casa paráfrase da mesma revelação", () => {
    const a = "o faroleiro anterior desapareceu na noite do naufrágio";
    const b = "na noite do naufrágio, o faroleiro anterior desapareceu";
    expect(compararEnunciados(a, b).casa).toBe(true);
  });

  it("NÃO casa revelações distintas do mesmo universo", () => {
    const a = "o faroleiro anterior desapareceu na noite do naufrágio";
    const b = "a prefeitura vendeu o terreno do farol para uma construtora";
    const s = compararEnunciados(a, b);
    expect(s.casa).toBe(false);
  });

  it("NÃO casa duas revelações que só compartilham o cenário", () => {
    const a = "o diário do farol registra as marés de outubro";
    const b = "o diário do farol foi assinado pelo pai de Marina";
    // Compartilham "diario farol" mas dizem coisas diferentes.
    expect(compararEnunciados(a, b).casa).toBe(false);
  });

  it("números diferentes distinguem revelações quase idênticas no resto", () => {
    // Diferem por um caractere e compartilham 5 de 7 traços lexicais (Jaccard 0,56):
    // só a regra de números as separa.
    expect(compararEnunciados("o corpo estava no cais 3", "o corpo estava no cais 1").casa).toBe(false);
    expect(compararEnunciados("o naufrágio foi em 1926", "o naufrágio foi em 1974").casa).toBe(false);
  });

  it("mesmo número + paráfrase continua casando", () => {
    expect(
      compararEnunciados("o Vapor Andorinha naufragou em 1926", "em 1926, o Vapor Andorinha naufragou").casa
    ).toBe(true);
  });

  it("número só de um lado não bloqueia o casamento (paráfrase pode omitir)", () => {
    const s = compararEnunciados("o faroleiro sumiu na noite do naufrágio em 1926", "o faroleiro sumiu na noite do naufrágio");
    expect(s.casa).toBe(true);
  });

  it("stopwords não inflam a similaridade", () => {
    const a = "a chave estava com o irmão dela";
    const b = "o mapa estava com a prefeitura da cidade";
    expect(compararEnunciados(a, b).casa).toBe(false);
  });
});

// Corpus de calibração do limiar: fichas REAIS de O Farol Cego
// (engine_scene_specs, projeto 5ac9d614, lidas em 2026-07-28).
// NÃO é o corpus hash-bound de worker/calibration/ — é literal neste teste.
describe("calibração do limiar (dado real de O Farol Cego)", () => {
  // Quatro versões da MESMA revelação do capítulo 1, reescritas pelo loop de correção.
  const cap1 = [
    "Sob a oxidação há marcas entalhadas — símbolos e números que não pertencem ao desenho industrial original da lente",
    "Sob a crosta, marcas incisas na base de latão: linhas e números que não correspondem a ornamento de fabricação",
    "Sob a camada de sujeira, marcas regulares e desiguais na superfície do latão, feitas por ferramenta manual, não pelo processo de fabricação original da peça",
    "Sob a oxidação, a base de latão tem sulcos gravados à mão — números e marcas que não seguem o padrão decorativo de fabricação da peça.",
  ];
  // Revelações DISTINTAS do capítulo 2, mesmo livro.
  const cap2 = [
    "O mecanismo legal existe e é real: um achado na zona de dragagem pode travar o TPEA por si só, independente de qualquer vontade política.",
    "Parecer pendente exige presença de arqueólogo no levantamento antes da licença; o profissional designado é Caio Renner.",
  ];

  it("revelação distinta do mesmo livro NUNCA casa (zero falso positivo)", () => {
    for (const a of cap1) {
      for (const b of cap2) {
        const s = compararEnunciados(a, b);
        expect(s.casa, `${a.slice(0, 40)} × ${b.slice(0, 40)}`).toBe(false);
      }
    }
    expect(compararEnunciados(cap2[0], cap2[1]).casa).toBe(false);
  });

  it("reordenação e troca de sinônimo casam acima do limiar", () => {
    expect(
      compararEnunciados(
        "o faroleiro anterior desapareceu na noite do naufrágio",
        "na noite do naufrágio, o faroleiro anterior desapareceu"
      ).casa
    ).toBe(true);
    expect(
      compararEnunciados(
        "o faroleiro anterior desapareceu na noite do naufrágio",
        "o faroleiro anterior sumiu na noite do naufrágio"
      ).casa
    ).toBe(true);
  });

  it("LIMITE CONHECIDO: reescrita profunda NÃO é detectável por léxico", () => {
    // As 4 versões dizem a MESMA coisa e medem 0,04–0,16 — no chão do ruído.
    // Documentado, não escondido: quem cobre este caso é o revisor literário,
    // que recebe o ledger e dispõe `revelacao_ja_no_ledger`.
    const pares: number[] = [];
    for (let i = 0; i < cap1.length; i++) {
      for (let j = i + 1; j < cap1.length; j++) pares.push(compararEnunciados(cap1[i], cap1[j]).jaccard);
    }
    expect(Math.max(...pares)).toBeLessThan(LIMIAR_JACCARD);
    // Se algum dia um limiar lexical passar a separar isto, este teste falha e
    // obriga a revisitar a divisão de trabalho gate × revisor.
    expect(Math.max(...pares)).toBeLessThan(0.25);
  });
});

describe("derivação da ficha", () => {
  it("informacao_nova é sempre a revelação principal", () => {
    expect(revelacoesDaFicha(ficha())).toEqual([
      "o faroleiro anterior desapareceu na noite do naufrágio",
    ]);
  });

  it("aceita no máximo 2 revelações extras (teto de 3 entradas/capítulo)", () => {
    const f = ficha({
      revelacoes: [
        "a chave do porão estava com o irmão de Marina",
        "a torre foi desativada em 1974",
        "terceira extra, que o teto deve cortar",
      ],
    });
    const rs = revelacoesDaFicha(f);
    expect(rs).toHaveLength(3);
    expect(rs[2]).toContain("desativada em 1974");
  });

  it("descarta duplicata interna à própria ficha", () => {
    const f = ficha({
      revelacoes: ["na noite do naufrágio, o faroleiro anterior desapareceu"],
    });
    expect(revelacoesDaFicha(f)).toHaveLength(1);
  });

  it("ids são estáveis e citáveis", () => {
    const e = entradasDaFicha(7, ficha({ revelacoes: ["a torre foi desativada em 1974"] }));
    expect(e.map((x) => x.id)).toEqual(["R07.1", "R07.2"]);
    expect(e.every((x) => x.capitulo === 7)).toBe(true);
  });

  it("truncar em 25 palavras não quebra o enunciado", () => {
    const longa = Array.from({ length: 40 }, (_, i) => `palavra${i}`).join(" ");
    const [r] = revelacoesDaFicha(ficha({ informacao_nova: longa }));
    const p = r.split(/\s+/);
    expect(p).toHaveLength(25);
    expect(p[24]).toBe("palavra24…");
  });
});

describe("fusão idempotente", () => {
  it("reaprovar o mesmo capítulo substitui, nunca duplica", () => {
    const l1 = fundirNoLedger([], entradasDaFicha(3, ficha()));
    const l2 = fundirNoLedger(l1, entradasDaFicha(3, ficha()));
    expect(l2).toHaveLength(1);
    const l3 = fundirNoLedger(l2, entradasDaFicha(3, ficha({ informacao_nova: "outra coisa inteiramente" })));
    expect(l3).toHaveLength(1);
    expect(l3[0].enunciado).toBe("outra coisa inteiramente");
  });

  it("mantém ordem por capítulo", () => {
    let l: RevelacaoLedger[] = [];
    l = fundirNoLedger(l, entradasDaFicha(5, ficha({ informacao_nova: "quinto" })));
    l = fundirNoLedger(l, entradasDaFicha(2, ficha({ informacao_nova: "segundo" })));
    expect(l.map((r) => r.capitulo)).toEqual([2, 5]);
  });
});

describe("gate de revelação repetida", () => {
  const ledger: RevelacaoLedger[] = [
    { id: "R03.1", capitulo: 3, enunciado: "o faroleiro anterior desapareceu na noite do naufrágio" },
    { id: "R05.1", capitulo: 5, enunciado: "a prefeitura vendeu o terreno do farol" },
  ];

  it("reprova revelação já no ledger, citando o capítulo de origem", () => {
    const g = gateRevelacaoRepetida(
      8,
      ficha({ capitulo: 8, informacao_nova: "na noite do naufrágio o faroleiro anterior desapareceu" }),
      ledger
    );
    expect(g.passou).toBe(false);
    expect(g.gate).toBe("revelacao_repetida");
    expect(g.evidencia).toContain("capítulo 3");
    expect(g.evidencia).toContain("R03.1");
  });

  it("aprova revelação genuinamente nova", () => {
    const g = gateRevelacaoRepetida(
      8,
      ficha({ capitulo: 8, informacao_nova: "o irmão de Marina forjou o registro de óbito" }),
      ledger
    );
    expect(g.passou).toBe(true);
  });

  it("não colide com o próprio capítulo (reescrita/meta-nota)", () => {
    const g = gateRevelacaoRepetida(
      3,
      ficha({ capitulo: 3, informacao_nova: "o faroleiro anterior desapareceu na noite do naufrágio" }),
      ledger
    );
    expect(g.passou).toBe(true);
  });

  it("evidência carrega o enunciado anterior LITERAL (adendo §1 do autor)", () => {
    const [c] = colisoesDeRevelacao(
      8,
      ficha({ capitulo: 8, informacao_nova: "na noite do naufrágio o faroleiro anterior desapareceu" }),
      ledger
    );
    const ev = evidenciaColisao(c);
    // O retry precisa da entrada exata, mesmo se ela estiver fora da janela do pacote.
    expect(ev).toContain("o faroleiro anterior desapareceu na noite do naufrágio");
    expect(ev).toContain("capítulo 3");
  });
});

describe("entrega no pacote (degradação por tamanho)", () => {
  const grande: RevelacaoLedger[] = Array.from({ length: TETO_LEDGER_NO_PACOTE + 60 }, (_, i) => ({
    id: `R${String(i + 1).padStart(2, "0")}.1`,
    capitulo: i + 1,
    enunciado: `revelação número ${i + 1} sobre o objeto ${i + 1} do inventário`,
  }));

  it("ledger pequeno vai inteiro, sem degradar", () => {
    const r = renderizarLedger(grande.slice(0, 10));
    expect(r.degradado).toBe(false);
    expect(r.omitidas).toBe(0);
  });

  it("ledger grande degrada para janela e DECLARA quantas omitiu", () => {
    const r = renderizarLedger(grande, ficha());
    expect(r.degradado).toBe(true);
    expect(r.omitidas).toBeGreaterThan(0);
    expect(r.texto).toContain("omitidas por tamanho");
    // Nenhum corte silencioso: o texto avisa que o gate roda contra o ledger inteiro.
    expect(r.texto).toContain("ledger INTEIRO");
  });

  it("o GATE não degrada: pega entrada fora da janela do pacote", () => {
    // Sem ficha, a janela é só a cauda recente — o capítulo 1 fica de fora.
    const r = renderizarLedger(grande);
    expect(r.texto).not.toContain("[R01.1 ");
    // Ainda assim o gate reprova citando a entrada que o arquiteto NÃO viu.
    const g = gateRevelacaoRepetida(
      200,
      ficha({ capitulo: 200, informacao_nova: "revelação número 1 sobre o objeto 1 do inventário" }),
      grande
    );
    expect(g.passou).toBe(false);
    expect(g.evidencia).toContain("R01.1");
  });

  it("ledger vazio não quebra a renderização", () => {
    expect(renderizarLedger([]).texto).toContain("nenhuma revelação");
  });
});
