// Testes de RENDERIZAÇÃO — não do resolvedor. O defeito que motivou este
// arquivo era exatamente a diferença entre os dois: `botoes` e `proxima_acao`
// passavam nos testes da função e não apareciam em tela nenhuma.
//
// Usa `renderToStaticMarkup` em vez de trazer uma biblioteca de teste de
// componente: react-dom já é dependência, e o que precisa ser provado aqui é o
// que sai no HTML, não interação.

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { EstadoOperacional } from "./EstadoOperacional";
import { resolveOperationalState, type OperationalState } from "@/lib/resolveOperationalState";

const render = (el: Parameters<typeof renderToStaticMarkup>[0]) => renderToStaticMarkup(el);

function estadoBase(over: Partial<OperationalState> = {}): OperationalState {
  return {
    situacao: "executando",
    classe_bloqueio: null,
    badge: "Escrevendo",
    tone: "info",
    mensagem_humana: "Escrevendo o capítulo 3.",
    diagnostico_tecnico: null,
    contadores: { produzidos: 3, aprovados: 2, sincronizados: 2, em_correcao: 0 },
    capitulo_bloqueado: null,
    blocker_humano: null,
    proxima_acao: null,
    engine_info: null,
    botoes: [],
    aviso_fundacao: null,
    correcao_info: null,
    ...over,
  };
}

describe("o painel renderiza o estado", () => {
  it("mostra badge e mensagem humana", () => {
    const html = render(<EstadoOperacional estado={estadoBase()} />);
    expect(html).toContain("Escrevendo");
    expect(html).toContain("Escrevendo o capítulo 3.");
  });

  it("mostra a PRÓXIMA AÇÃO (campo que antes ninguém lia)", () => {
    const html = render(<EstadoOperacional estado={estadoBase({ proxima_acao: "Iniciar escrita" })} />);
    expect(html).toContain("proxima-acao");
    expect(html).toContain("Iniciar escrita");
  });

  it("mostra o erro técnico sem obrigar o autor a abrir log cru", () => {
    const html = render(<EstadoOperacional estado={estadoBase({ diagnostico_tecnico: "ECONNRESET no Storage" })} />);
    expect(html).toContain("erro-tecnico");
    expect(html).toContain("ECONNRESET no Storage");
  });
});

describe("as quatro naturezas de impedimento aparecem distintas", () => {
  it("BLOQUEIO TÉCNICO", () => {
    const html = render(<EstadoOperacional estado={estadoBase({ situacao: "aguardando_cota", classe_bloqueio: "tecnico" })} />);
    expect(html).toContain("classe-bloqueio");
    expect(html).toContain("Impedimento técnico");
  });

  it("BLOQUEIO EDITORIAL, com o blocker do gate", () => {
    const html = render(
      <EstadoOperacional
        estado={estadoBase({
          situacao: "bloqueado_qualidade",
          classe_bloqueio: "editorial",
          blocker_humano: "muleta “coisa” 3× no capítulo 4",
        })}
      />
    );
    expect(html).toContain("Impedimento editorial");
    expect(html).toContain("bloqueio-editorial");
    expect(html).toContain("muleta");
  });

  it("DECISÃO HUMANA", () => {
    const html = render(<EstadoOperacional estado={estadoBase({ situacao: "circuit_breaker", classe_bloqueio: "decisao_humana" })} />);
    expect(html).toContain("Decisão sua");
  });

  it("AUSÊNCIA DE PROVA, em banner próprio", () => {
    const html = render(
      <EstadoOperacional
        estado={estadoBase({ classe_bloqueio: "ausencia_de_prova", aviso_fundacao: "Fundação com pendência (ARCO_INCOMPLETO)." })}
      />
    );
    expect(html).toContain("ausencia-de-prova");
    expect(html).toContain("Falta prova");
    expect(html).toContain("ARCO_INCOMPLETO");
  });
});

describe("botões: nenhum sem handler, nenhum cinza mudo", () => {
  const comBotoes = estadoBase({
    botoes: [
      { id: "corrigir", label: "Corrigir capítulo 4", habilitado: true, motivo_indisponivel: null },
      {
        id: "continuar",
        label: "Continuar a partir do 5",
        habilitado: false,
        motivo_indisponivel: "o capítulo 4 precisa ser aprovado antes",
      },
    ],
  });

  it("botão SEM handler não é renderizado", () => {
    // Ação sem handler viraria controle morto: o autor clica e nada acontece.
    const html = render(<EstadoOperacional estado={comBotoes} acoes={{ corrigir: () => {} }} />);
    expect(html).toContain("Corrigir capítulo 4");
    expect(html).not.toContain("Continuar a partir do 5");
  });

  it("botão desabilitado mostra o MOTIVO em texto visível, não só no title", () => {
    const html = render(<EstadoOperacional estado={comBotoes} acoes={{ corrigir: () => {}, continuar: () => {} }} />);
    expect(html).toContain("motivo-continuar");
    expect(html).toContain("o capítulo 4 precisa ser aprovado antes");
    expect(html).toContain("disabled");
  });

  it("sem nenhum handler, não há bloco de ações", () => {
    const html = render(<EstadoOperacional estado={comBotoes} />);
    expect(html).not.toContain('data-testid="acoes"');
  });
});

describe("local não é produção, e mock não é integração real", () => {
  it("distingue prontidão local de produção e lista o que falta", () => {
    const html = render(
      <EstadoOperacional
        estado={estadoBase()}
        prontidao={{
          local: "IMPLEMENTACAO_LOCAL_APROVADA",
          producao: "RELEASE_PRODUCAO_BLOQUEADO",
          bloqueios: ["CALIBRACAO_HUMANA", "MIGRACOES_REMOTAS"],
        }}
      />
    );
    expect(html).toContain("IMPLEMENTACAO_LOCAL_APROVADA");
    expect(html).toContain("RELEASE_PRODUCAO_BLOQUEADO");
    expect(html).toContain("CALIBRACAO_HUMANA");
    expect(html).toContain("MIGRACOES_REMOTAS");
  });

  it("ciclo com provedor determinístico é rotulado como simulação", () => {
    const html = render(<EstadoOperacional estado={estadoBase()} origemMock />);
    expect(html).toContain("rotulo-mock");
    expect(html).toContain("não é integração real");
  });

  it("sem a marca, nada afirma integração real", () => {
    const html = render(<EstadoOperacional estado={estadoBase()} />);
    expect(html).not.toContain("rotulo-mock");
  });
});

describe("download que falha é visível e acionável", () => {
  it("mostra o documento e o motivo", () => {
    const html = render(
      <EstadoOperacional
        estado={estadoBase()}
        falhaDownload={{ documento: "estrutura.json", motivo: "404 no Storage" }}
      />
    );
    expect(html).toContain("falha-download");
    expect(html).toContain("estrutura.json");
    expect(html).toContain("404 no Storage");
  });

  it("sem falha, nada aparece", () => {
    expect(render(<EstadoOperacional estado={estadoBase()} falhaDownload={null} />)).not.toContain("falha-download");
  });
});

describe("smoke: estado real do resolvedor chega à tela", () => {
  it("um projeto bloqueado por qualidade renderiza natureza, blocker e ação", () => {
    // Fecha o circuito: resolvedor → componente → HTML, sem fixture montada à mão.
    const estado = resolveOperationalState({
      job: {
        status: "paused",
        erro: null,
        progresso: {
          fase: "ESCRITA",
          cap_atual: 4,
          quality_status: "blocked_quality",
          quality_cap: 4,
          quality_categoria: "decisao_autoral",
          quality_blockers: ["muleta coisa 3x — L35"],
        },
      },
      chapters: [{ numero: 1 }, { numero: 2 }, { numero: 3 }],
      totalCapitulos: 12,
      workerOnline: true,
    });
    const html = render(
      <EstadoOperacional estado={estado} acoes={{ ver_diagnostico: () => {}, corrigir: () => {} }} />
    );
    expect(estado.classe_bloqueio).toBeTruthy();
    expect(html).toContain("classe-bloqueio");
    expect(html).toContain('data-testid="acoes"');
  });

  it("projeto sem escrita não inventa bloqueio nem ação", () => {
    const estado = resolveOperationalState({ job: null, chapters: [], totalCapitulos: 12, workerOnline: true });
    const html = render(<EstadoOperacional estado={estado} />);
    expect(estado.classe_bloqueio).toBeNull();
    expect(html).not.toContain("classe-bloqueio");
    expect(html).not.toContain("bloqueio-editorial");
  });
});
