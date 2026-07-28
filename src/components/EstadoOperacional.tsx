// Painel do estado operacional — o contrato do resolvedor finalmente RENDERIZADO.
//
// `proxima_acao` e `botoes` eram calculados e nenhuma tela lia: só o teste. Um
// contrato que só o teste consome não é contrato, é decoração — e o pior é que
// ele passa a impressão de que a tela mostra algo que ela nunca mostrou.
//
// Regra desta tela: nenhum botão sem handler. `acoes` é quem decide o que a
// página de fato suporta; ação sem handler simplesmente não vira botão, em vez
// de virar um controle morto que o autor clica e nada acontece.

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  ROTULO_CLASSE_BLOQUEIO,
  toneToVariant,
  type OperationalState,
} from "@/lib/resolveOperationalState";

export interface AcoesOperacionais {
  [id: string]: (() => void) | undefined;
}

export interface EstadoOperacionalProps {
  estado: OperationalState;
  /** Handlers disponíveis nesta tela, por id de botão do resolvedor. */
  acoes?: AcoesOperacionais;
  /** Rótulo da prontidão local; nunca confundir com produção certificada. */
  prontidao?: { local: string; producao: string; bloqueios: string[] };
  /** Documento que a tela deveria oferecer e não conseguiu buscar. */
  falhaDownload?: { documento: string; motivo: string } | null;
  /** Marcado quando o ciclo exibido veio de provedor determinístico. */
  origemMock?: boolean;
}

export function EstadoOperacional({
  estado,
  acoes = {},
  prontidao,
  falhaDownload,
  origemMock,
}: EstadoOperacionalProps) {
  const disponiveis = estado.botoes.filter((b) => typeof acoes[b.id] === "function");

  return (
    <section className="space-y-3 rounded-lg border p-3" data-testid="estado-operacional">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={toneToVariant(estado.tone)}>{estado.badge}</Badge>
        {origemMock ? (
          // Mock nunca pode ser lido como integração real: é a diferença entre
          // "a fiação funciona" e "funcionou contra o serviço".
          <Badge variant="outline" data-testid="rotulo-mock">
            simulação com provedor determinístico — não é integração real
          </Badge>
        ) : null}
      </div>

      <p className="text-sm">{estado.mensagem_humana}</p>

      {estado.classe_bloqueio ? (
        <p className="text-xs text-muted-foreground" data-testid="classe-bloqueio">
          {ROTULO_CLASSE_BLOQUEIO[estado.classe_bloqueio]}
        </p>
      ) : null}

      {estado.blocker_humano ? (
        <p className="text-xs text-amber-700 dark:text-amber-400" data-testid="bloqueio-editorial">
          {estado.blocker_humano}
        </p>
      ) : null}

      {/* Pendência de fundação: nada falhou, falta prova. Banner próprio. */}
      {estado.aviso_fundacao ? (
        <p
          className="rounded-md border border-amber-500/30 bg-amber-500/10 px-2.5 py-1.5 text-xs text-amber-700 dark:text-amber-400"
          data-testid="ausencia-de-prova"
        >
          {estado.aviso_fundacao}
        </p>
      ) : null}

      {estado.proxima_acao ? (
        <p className="text-xs font-medium" data-testid="proxima-acao">
          Próxima ação: {estado.proxima_acao}
        </p>
      ) : null}

      {estado.diagnostico_tecnico ? (
        <details data-testid="erro-tecnico">
          <summary className="cursor-pointer text-xs text-muted-foreground">Detalhe técnico</summary>
          <pre className="mt-1 overflow-x-auto whitespace-pre-wrap text-[11px]">{estado.diagnostico_tecnico}</pre>
        </details>
      ) : null}

      {falhaDownload ? (
        <p className="text-xs text-destructive" data-testid="falha-download">
          Não foi possível abrir “{falhaDownload.documento}”: {falhaDownload.motivo}
        </p>
      ) : null}

      {disponiveis.length ? (
        <div className="flex flex-wrap gap-2" data-testid="acoes">
          {disponiveis.map((b) => (
            <span key={b.id} className="inline-flex flex-col gap-0.5">
              <Button
                size="sm"
                variant={b.habilitado ? "default" : "outline"}
                disabled={!b.habilitado}
                title={b.motivo_indisponivel ?? undefined}
                onClick={acoes[b.id]}
              >
                {b.label}
              </Button>
              {/* Botão cinza mudo é lido como tela travada. O motivo fica
                  visível, não só no title — tooltip não existe no toque. */}
              {!b.habilitado && b.motivo_indisponivel ? (
                <span className="max-w-[22rem] text-[11px] text-muted-foreground" data-testid={`motivo-${b.id}`}>
                  {b.motivo_indisponivel}
                </span>
              ) : null}
            </span>
          ))}
        </div>
      ) : null}

      {prontidao ? (
        <div className="border-t pt-2 text-[11px] text-muted-foreground" data-testid="prontidao">
          {/* Saúde local e produção certificada são coisas diferentes, e a tela
              precisa dizer isso com todas as letras. */}
          <p>
            Local: <strong>{prontidao.local}</strong> · Produção: <strong>{prontidao.producao}</strong>
          </p>
          {prontidao.bloqueios.length ? (
            <p data-testid="bloqueios-producao">Falta para produção: {prontidao.bloqueios.join(", ")}</p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
