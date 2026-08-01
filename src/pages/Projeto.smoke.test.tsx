// Smoke da PÁGINA. Não substitui a prova autenticada contra o serviço real —
// aqui não há sessão, rede nem Supabase. O que este arquivo garante é que a
// página monta e que os estados operacionais chegam ao HTML pelo caminho de
// verdade (resolvedor → componente), em vez de só passarem em teste de função.

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { EstadoOperacional } from "@/components/EstadoOperacional";
import { buildResolverInput, IDS_ACAO, resolveOperationalState } from "@/lib/resolveOperationalState";
import type { AcoesOperacionais } from "@/components/EstadoOperacional";

/** Record completo — o tipo nao aceita parcial, e e esse o ponto. */
function todasAcoes(): AcoesOperacionais {
  const acoes = {} as AcoesOperacionais;
  for (const id of IDS_ACAO) acoes[id] = () => {};
  return acoes;
}
import type { Job } from "@/lib/types";

const job = (over: Record<string, unknown>): Job =>
  ({
    id: "j1",
    tipo: "escrever_livro",
    status: "running",
    erro: null,
    created_at: "2026-07-28T10:00:00Z",
    ...over,
  }) as unknown as Job;

function tela(jobs: Job[], chapters: { numero: number; quality_status?: string | null }[], workerOnline = true) {
  const estado = resolveOperationalState(
    buildResolverInput({ jobs, chapters, totalCapitulos: 12, workerOnline, producaoGlobalAtiva: true })
  );
  return {
    estado,
    html: renderToStaticMarkup(
      <EstadoOperacional
        estado={estado}
        acoes={todasAcoes()}
        prontidao={{
          local: "IMPLEMENTACAO_LOCAL_APROVADA",
          preCanary: "PRE_CANARY_BLOQUEADO: PAPEIS_REAIS",
          producao: "RELEASE_PRODUCAO_BLOQUEADO",
          bloqueios: ["CERTIFICADO_RELEASE"],
          indisponivel: null,
        }}
      />
    ),
  };
}

describe("estados operacionais da página do projeto", () => {
  it("CARREGANDO/sem escrita: não anuncia bloqueio nem conclusão", () => {
    const { estado, html } = tela([], []);
    expect(estado.situacao).toBe("sem_escrita");
    expect(html).not.toContain("classe-bloqueio");
    expect(html).not.toContain("Concluído");
  });

  it("VAZIO: livro sem capítulo não vira 'concluído'", () => {
    const { estado } = tela([job({ status: "done", progresso: { fase: "ESCRITA", cap_atual: 0 } })], []);
    expect(estado.situacao).not.toBe("concluido");
  });

  it("PROCESSANDO: mostra o que está acontecendo", () => {
    const { estado, html } = tela(
      [job({ status: "running", progresso: { fase: "ESCRITA", cap_atual: 3, total: 12 } })],
      [{ numero: 1 }, { numero: 2 }]
    );
    expect(estado.situacao).toBe("executando");
    expect(html).toContain("estado-operacional");
  });

  it("PARCIALMENTE CONCLUÍDO: 3 de 12 nunca é livro completo", () => {
    const { estado } = tela(
      [job({ status: "done", progresso: { fase: "ESCRITA", cap_atual: 3, total: 12 } })],
      [{ numero: 1 }, { numero: 2 }, { numero: 3 }]
    );
    expect(estado.situacao).not.toBe("concluido");
  });

  it("BLOQUEADO por qualidade: natureza editorial e ação disponível", () => {
    const { estado, html } = tela(
      [
        job({
          status: "paused",
          progresso: {
            fase: "ESCRITA",
            cap_atual: 4,
            quality_status: "blocked_quality",
            quality_cap: 4,
            quality_categoria: "decisao_autoral",
            quality_blockers: ["muleta coisa 3x — L35"],
          },
        }),
      ],
      [{ numero: 1 }, { numero: 2 }, { numero: 3 }]
    );
    expect(estado.classe_bloqueio).toBe("decisao_humana");
    expect(html).toContain("Decisão sua");
    expect(html).toContain('data-testid="acoes"');
  });

  it("ERRO técnico aparece sem exigir log cru", () => {
    const { html } = tela([job({ status: "error", erro: "ECONNRESET ao subir capítulo" })], [{ numero: 1 }]);
    expect(html).toContain("erro-tecnico");
    expect(html).toContain("ECONNRESET");
  });

  it("WORKER OFFLINE não é lido como projeto saudável", () => {
    const { estado } = tela([job({ status: "queued", progresso: { fase: "ESCRITA" } })], [], false);
    expect(["na_fila", "interrompido_retomavel", "producao_desativada"]).toContain(estado.situacao);
  });

  it("a tela sempre separa prontidão local de produção", () => {
    const { html } = tela([job({ status: "running", progresso: { fase: "ESCRITA", cap_atual: 1 } })], []);
    expect(html).toContain("IMPLEMENTACAO_LOCAL_APROVADA");
    expect(html).toContain("RELEASE_PRODUCAO_BLOQUEADO");
    expect(html).toContain("CERTIFICADO_RELEASE");
  });
});
