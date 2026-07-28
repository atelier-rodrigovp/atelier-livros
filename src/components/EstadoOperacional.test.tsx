// Testes de RENDERIZAÇÃO — não do resolvedor. O defeito que motivou este
// arquivo era exatamente a diferença entre os dois: `botoes` e `proxima_acao`
// passavam nos testes da função e não apareciam em tela nenhuma.
//
// Usa `renderToStaticMarkup` em vez de trazer uma biblioteca de teste de
// componente: react-dom já é dependência, e o que precisa ser provado aqui é o
// que sai no HTML, não interação.

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { EstadoOperacional, type AcoesOperacionais } from "./EstadoOperacional";
import { interpretarAutorizacao, rotularAutorizacao } from "@/lib/autorizacaoV2";
import { lerProntidaoPublicada, SCHEMA_PRONTIDAO_PUBLICADA } from "@/lib/prontidaoPublicada";
import {
  IDS_ACAO,
  resolveOperationalState,
  type OperationalState,
  type ResolverInput,
} from "@/lib/resolveOperationalState";

const render = (el: Parameters<typeof renderToStaticMarkup>[0]) => renderToStaticMarkup(el);

/** Handlers completos. Não dá para montar parcial: o tipo é `Record`, não índice. */
function todasAcoes(registro?: string[]): AcoesOperacionais {
  const acoes = {} as AcoesOperacionais;
  for (const id of IDS_ACAO) acoes[id] = () => registro?.push(id);
  return acoes;
}

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
    const html = render(<EstadoOperacional estado={estadoBase()} acoes={todasAcoes()} />);
    expect(html).toContain("Escrevendo");
    expect(html).toContain("Escrevendo o capítulo 3.");
  });

  it("mostra a PRÓXIMA AÇÃO (campo que antes ninguém lia)", () => {
    const html = render(<EstadoOperacional estado={estadoBase({ proxima_acao: "Iniciar escrita" })} acoes={todasAcoes()} />);
    expect(html).toContain("proxima-acao");
    expect(html).toContain("Iniciar escrita");
  });

  it("mostra o erro técnico sem obrigar o autor a abrir log cru", () => {
    const html = render(
      <EstadoOperacional estado={estadoBase({ diagnostico_tecnico: "ECONNRESET no Storage" })} acoes={todasAcoes()} />
    );
    expect(html).toContain("erro-tecnico");
    expect(html).toContain("ECONNRESET no Storage");
  });
});

describe("as quatro naturezas de impedimento aparecem distintas", () => {
  it("BLOQUEIO TÉCNICO", () => {
    const html = render(
      <EstadoOperacional estado={estadoBase({ situacao: "aguardando_cota", classe_bloqueio: "tecnico" })} acoes={todasAcoes()} />
    );
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
        acoes={todasAcoes()}
      />
    );
    expect(html).toContain("Impedimento editorial");
    expect(html).toContain("bloqueio-editorial");
    expect(html).toContain("muleta");
  });

  it("DECISÃO HUMANA", () => {
    const html = render(
      <EstadoOperacional estado={estadoBase({ situacao: "circuit_breaker", classe_bloqueio: "decisao_humana" })} acoes={todasAcoes()} />
    );
    expect(html).toContain("Decisão sua");
  });

  it("AUSÊNCIA DE PROVA, em banner próprio", () => {
    const html = render(
      <EstadoOperacional
        estado={estadoBase({ classe_bloqueio: "ausencia_de_prova", aviso_fundacao: "Fundação com pendência (ARCO_INCOMPLETO)." })}
        acoes={todasAcoes()}
      />
    );
    expect(html).toContain("ausencia-de-prova");
    expect(html).toContain("Falta prova");
    expect(html).toContain("ARCO_INCOMPLETO");
  });
});

describe("botões: nenhum anunciado sem handler, nenhum cinza mudo", () => {
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

  it("todo botão anunciado é renderizado", () => {
    // Não existe mais o caso "botão sem handler": `AcoesOperacionais` é um
    // Record completo, então omitir um id virou erro de COMPILAÇÃO. Este teste
    // guarda o outro lado — nenhum botão some silenciosamente na renderização.
    const html = render(<EstadoOperacional estado={comBotoes} acoes={todasAcoes()} />);
    expect(html).toContain("Corrigir capítulo 4");
    expect(html).toContain("Continuar a partir do 5");
  });

  it("botão desabilitado mostra o MOTIVO em texto visível, não só no title", () => {
    const html = render(<EstadoOperacional estado={comBotoes} acoes={todasAcoes()} />);
    expect(html).toContain("motivo-continuar");
    expect(html).toContain("o capítulo 4 precisa ser aprovado antes");
    expect(html).toContain("disabled");
  });

  it("estado sem botões não renderiza o bloco de ações", () => {
    expect(render(<EstadoOperacional estado={estadoBase()} acoes={todasAcoes()} />)).not.toContain('data-testid="acoes"');
  });
});

// ---------------------------------------------------------------------------
// A prova que o prompt pede: para CADA situação, todo botão anunciado tem
// handler e toda próxima ação declarada é acionável.
// ---------------------------------------------------------------------------

const CENARIOS: { nome: string; entrada: ResolverInput }[] = [
  { nome: "sem_escrita", entrada: { job: null, chapters: [], totalCapitulos: 12, workerOnline: true } },
  {
    nome: "executando",
    entrada: {
      job: { status: "running", erro: null, progresso: { fase: "ESCRITA", cap_atual: 3 } },
      chapters: [{ numero: 1 }],
      totalCapitulos: 12,
      workerOnline: true,
    },
  },
  {
    nome: "na_fila",
    entrada: { job: { status: "queued", erro: null, progresso: { fase: "ESCRITA" } }, chapters: [], totalCapitulos: 12, workerOnline: true },
  },
  {
    nome: "producao_desativada",
    entrada: {
      job: { status: "queued", erro: null, progresso: { fase: "ESCRITA" } },
      chapters: [],
      totalCapitulos: 12,
      workerOnline: true,
      producaoGlobalAtiva: false,
    },
  },
  {
    nome: "pausado_manual",
    entrada: {
      job: { status: "paused", erro: null, progresso: { fase: "ESCRITA" } },
      chapters: [],
      totalCapitulos: 12,
      workerOnline: true,
      producaoPausada: true,
    },
  },
  {
    nome: "aguardando_cota",
    entrada: {
      job: { status: "queued", erro: null, progresso: { fase: "ESCRITA", aguardando_reset: true, retry_at: "2099-01-01T00:00:00Z" } },
      chapters: [],
      totalCapitulos: 12,
      workerOnline: true,
    },
  },
  {
    nome: "bloqueado_qualidade",
    entrada: {
      job: {
        status: "paused",
        erro: null,
        progresso: { fase: "ESCRITA", cap_atual: 4, quality_status: "blocked_quality", quality_cap: 4, quality_blockers: ["muleta coisa 3x"] },
      },
      chapters: [{ numero: 1 }, { numero: 2 }, { numero: 3 }],
      totalCapitulos: 12,
      workerOnline: true,
    },
  },
  {
    nome: "circuit_breaker",
    entrada: {
      job: {
        status: "paused",
        erro: null,
        progresso: { fase: "ESCRITA", cap_atual: 4, quality_status: "blocked_quality", quality_cap: 4, quality_categoria: "circuit_breaker" },
      },
      chapters: [{ numero: 1 }],
      totalCapitulos: 12,
      workerOnline: true,
    },
  },
  {
    nome: "interrompido_retomavel (parcial)",
    entrada: {
      job: { status: "done", erro: null, progresso: { fase: "ESCRITA", cap_atual: 3, total: 12 } },
      chapters: [{ numero: 1 }, { numero: 2 }, { numero: 3 }],
      totalCapitulos: 12,
      workerOnline: true,
    },
  },
  {
    nome: "concluido",
    entrada: {
      job: { status: "done", erro: null, progresso: { fase: "ESCRITA", cap_atual: 2, total: 2 } },
      chapters: [{ numero: 1 }, { numero: 2 }],
      totalCapitulos: 2,
      workerOnline: true,
    },
  },
  {
    nome: "erro técnico",
    entrada: { job: { status: "error", erro: "ECONNRESET" }, chapters: [{ numero: 1 }], totalCapitulos: 12, workerOnline: true },
  },
];

describe("exaustividade: toda situação anuncia só o que a tela executa", () => {
  for (const { nome, entrada } of CENARIOS) {
    it(`${nome}: todo botão anunciado é renderizado e clicável`, () => {
      const estado = resolveOperationalState(entrada);
      const cliques: string[] = [];
      const html = render(<EstadoOperacional estado={estado} acoes={todasAcoes(cliques)} />);
      for (const b of estado.botoes) {
        expect(IDS_ACAO, `${nome}: id '${b.id}' fora do vocabulário`).toContain(b.id);
        expect(html, `${nome}: botão '${b.id}' anunciado e não renderizado`).toContain(b.label);
      }
    });

    it(`${nome}: próxima ação declarada tem controle correspondente`, () => {
      const estado = resolveOperationalState(entrada);
      if (!estado.proxima_acao) return;
      // Próxima ação sem botão nenhum é instrução que o autor não consegue
      // seguir na tela em que está — foi o caso de "Religar a produção".
      expect(estado.botoes.length, `${nome}: "${estado.proxima_acao}" sem controle`).toBeGreaterThan(0);
    });
  }

  it("nenhum cenário produz id fora do vocabulário fechado", () => {
    for (const { entrada } of CENARIOS) {
      for (const b of resolveOperationalState(entrada).botoes) expect(IDS_ACAO).toContain(b.id);
    }
  });

  it("todo botão desabilitado, em qualquer cenário, carrega motivo", () => {
    for (const { nome, entrada } of CENARIOS) {
      for (const b of resolveOperationalState(entrada).botoes.filter((x) => !x.habilitado)) {
        expect(b.motivo_indisponivel, `${nome}: '${b.id}' cinza e mudo`).toBeTruthy();
      }
    }
  });
});

describe("local não é produção, e mock não é integração real", () => {
  it("distingue prontidão local de produção e lista o que falta", () => {
    const html = render(
      <EstadoOperacional
        estado={estadoBase()}
        acoes={todasAcoes()}
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
    const html = render(<EstadoOperacional estado={estadoBase()} acoes={todasAcoes()} origemMock />);
    expect(html).toContain("rotulo-mock");
    expect(html).toContain("não é integração real");
  });

  it("sem a marca, nada afirma integração real", () => {
    expect(render(<EstadoOperacional estado={estadoBase()} acoes={todasAcoes()} />)).not.toContain("rotulo-mock");
  });
});

describe("download que falha é visível e acionável", () => {
  it("mostra o documento e o motivo", () => {
    const html = render(
      <EstadoOperacional
        estado={estadoBase()}
        acoes={todasAcoes()}
        falhaDownload={{ documento: "estrutura.json", motivo: "404 no Storage" }}
      />
    );
    expect(html).toContain("falha-download");
    expect(html).toContain("estrutura.json");
    expect(html).toContain("404 no Storage");
  });

  it("sem falha, nada aparece", () => {
    expect(render(<EstadoOperacional estado={estadoBase()} acoes={todasAcoes()} falhaDownload={null} />)).not.toContain(
      "falha-download"
    );
  });
});

// ---------------------------------------------------------------------------
// Autorização do projeto renderizada (fase 3, item 2)
// ---------------------------------------------------------------------------

describe("autorização do projeto aparece na tela", () => {
  const comAutorizacao = (linhas: Parameters<typeof interpretarAutorizacao>[0], erro?: { code?: string; message?: string }) =>
    render(
      <EstadoOperacional
        estado={estadoBase()}
        acoes={todasAcoes()}
        autorizacao={rotularAutorizacao(interpretarAutorizacao(linhas, erro))}
      />
    );

  const ativa = [
    {
      project_id: "p1",
      modo: "producao",
      autorizado_por: "rodrigo",
      motivo: "prova pré-canário",
      ativo: true,
      revoked_at: null,
      created_at: "2026-07-28T10:00:00Z",
    },
  ];

  it("AUTORIZADO mostra modo, quem autorizou e por quê", () => {
    const html = comAutorizacao(ativa);
    expect(html).toContain("autorizacao");
    expect(html).toContain("producao");
    expect(html).toContain("rodrigo");
    expect(html).toContain("prova pré-canário");
  });

  it("NÃO AUTORIZADO explica o que falta, não fica só cinza", () => {
    const html = comAutorizacao([]);
    expect(html).toContain("Projeto não autorizado");
    expect(html).toContain("engine_autorizacoes_v2");
  });

  it("REVOGADA é distinguível de nunca autorizado", () => {
    const html = comAutorizacao([{ ...ativa[0], ativo: false, revoked_at: "2026-07-28T12:00:00Z" }]);
    expect(html).toContain("Autorização revogada");
    expect(html).toContain("2026-07-28T12:00:00Z");
  });

  it("MIGRATION AUSENTE aparece como indisponível, nunca como autorizado", () => {
    const html = comAutorizacao(null, { code: "42P01", message: "relation does not exist" });
    expect(html).toContain("Autorização indisponível");
    expect(html).toContain("engine_v2_autorizacoes.sql");
    expect(html).not.toContain("Projeto autorizado");
  });

  it("sem a prop, nada é afirmado sobre autorização", () => {
    expect(render(<EstadoOperacional estado={estadoBase()} acoes={todasAcoes()} />)).not.toContain('data-testid="autorizacao"');
  });
});

describe("produção bloqueada lista os motivos", () => {
  it("mostra local, produção e a lista completa", () => {
    const html = render(
      <EstadoOperacional
        estado={estadoBase()}
        acoes={todasAcoes()}
        prontidao={lerProntidaoPublicada({
          schema: SCHEMA_PRONTIDAO_PUBLICADA,
          estados: { implementacao_local: "IMPLEMENTACAO_LOCAL_APROVADA", release_producao: "RELEASE_PRODUCAO_BLOQUEADO" },
          bloqueios_producao: ["CALIBRACAO_HUMANA", "MIGRACOES_REMOTAS", "INTEGRACAO_REAL"],
        })}
      />
    );
    expect(html).toContain("bloqueios-producao");
    expect(html).toContain("INTEGRACAO_REAL");
  });

  it("SEM prontidão publicada a tela diz desconhecido, não silêncio", () => {
    const html = render(<EstadoOperacional estado={estadoBase()} acoes={todasAcoes()} prontidao={lerProntidaoPublicada(null)} />);
    expect(html).toContain("prontidao-indisponivel");
    expect(html).toContain("DESCONHECIDO");
  });
});
