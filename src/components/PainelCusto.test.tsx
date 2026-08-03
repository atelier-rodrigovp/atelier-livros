// Testes de RENDERIZAÇÃO do painel de custo.
//
// O mesmo motivo do EstadoOperacional.test.tsx: o defeito que importa é o que
// existe no dado e não aparece em tela nenhuma. `por_modelo` era exatamente
// isso — `telemetria.ts` calculava e persistia, e nenhuma tela mostrava.
//
// E a projeção precisa chegar ROTULADA: número projetado que se parece com
// número medido é pior que número nenhum.

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CustoPorCapitulo, QuebraPorModelo, type CustoV2Payload } from "./PainelCusto";

const render = (el: Parameters<typeof renderToStaticMarkup>[0]) => renderToStaticMarkup(el);

function custo(over: Partial<CustoV2Payload> = {}): CustoV2Payload {
  return {
    gerado_em: "2026-08-03T12:00:00.000Z",
    runs_considerados: 12,
    runs_sem_medicao: 0,
    runs_falhos: 0,
    totais: { entrada: 30000, saida: 15000, total: 45000 },
    por_papel: {
      escritor: { entrada: 20000, saida: 10000, total: 30000, runs: 4 },
      revisor_literario: { entrada: 10000, saida: 5000, total: 15000, runs: 8 },
    },
    por_capitulo: {
      "1": { entrada: 15000, saida: 7500, total: 22500, runs: 6 },
      "2": { entrada: 15000, saida: 7500, total: 22500, runs: 6 },
    },
    por_modelo: {
      "claude-opus-5": { entrada: 20000, saida: 10000, total: 30000, runs: 4 },
    },
    sem_capitulo: { entrada: 0, saida: 0, total: 0, runs: 0 },
    capitulos_medidos: 2,
    media_por_capitulo: { entrada: 15000, saida: 7500, total: 22500 },
    truncado: false,
    teto_runs: 5000,
    projecao: {
      natureza: "PROJECAO",
      base_capitulos_medidos: 2,
      total_capitulos: 40,
      media_por_capitulo: { entrada: 15000, saida: 7500, total: 22500 },
      projetado: { entrada: 600000, saida: 300000, total: 900000 },
    },
    ...over,
  };
}

describe("CustoPorCapitulo", () => {
  it("mostra a média MEDIDA por capítulo e o custo por papel", () => {
    const html = render(<CustoPorCapitulo custo={custo()} />);
    expect(html).toContain("23k"); // média por capítulo (fmtTok arredonda 22500)
    expect(html).toMatch(/escritor/i);
    expect(html).toMatch(/revisor/i);
  });

  it("a projeção do livro aparece EXPLICITAMENTE rotulada como projeção", () => {
    const html = render(<CustoPorCapitulo custo={custo()} />);
    expect(html).toMatch(/proje[çc]ão/i);
    expect(html).toContain("900k");
    // A base da conta fica à vista: 2 capítulos medidos de 40.
    expect(html).toContain("2");
    expect(html).toContain("40");
  });

  it("distingue medido de projetado no texto — nunca os apresenta como a mesma coisa", () => {
    const html = render(<CustoPorCapitulo custo={custo()} />);
    expect(html).toMatch(/medido/i);
    expect(html).toMatch(/proje[çc]ão|projetado/i);
  });

  it("sem base medida não inventa projeção", () => {
    const html = render(
      <CustoPorCapitulo custo={custo({ capitulos_medidos: 0, por_capitulo: {}, projecao: null })} />
    );
    expect(html).not.toContain("900k");
    expect(html).toMatch(/ainda não medido|sem medição/i);
  });

  it("agregação truncada é DITA, não silenciada", () => {
    const html = render(<CustoPorCapitulo custo={custo({ truncado: true })} />);
    expect(html).toMatch(/parcial|truncad/i);
  });
});

describe("QuebraPorModelo", () => {
  it("renderiza a quebra por modelo que a telemetria já calculava e ninguém via", () => {
    const html = render(
      <QuebraPorModelo
        porModelo={{
          opus: { input: 1000, output: 500, cache_read: 0, cache_creation: 0, custo_usd: 12.5 },
          sonnet: { input: 800, output: 200, cache_read: 0, cache_creation: 0, custo_usd: 3.25 },
        }}
      />
    );
    expect(html).toContain("opus");
    expect(html).toContain("sonnet");
    expect(html).toContain("12.5");
    expect(html).toContain("3.25");
  });

  it("sem dado por modelo, não renderiza bloco vazio enganoso", () => {
    expect(render(<QuebraPorModelo porModelo={{}} />)).toBe("");
  });
});
