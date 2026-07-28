// Painel de inteligência editorial (fatia O).
//
// Mostra o que a engine passou a saber e a tela nunca mostrou: promessas abertas
// e pagas com a evidência na página, ledger de revelações, divergências entre a
// ficha e a prosa, estratégias de correção já tentadas (e as que faltam),
// ausência de progresso, capítulos afetados por reescrita, artefatos invalidados
// e o canário aprovado.
//
// A lógica vive em `@/lib/painelEditorial` e é testada sem navegador; aqui é só
// renderização.
import { AlertTriangle, BookOpen, GitBranch, KeyRound, Layers, Wrench } from "lucide-react";
import {
  montarPainel,
  painelTemConteudo,
  POLITICA_REESCRITA,
  type AcaoDirigida,
  type EstadoV2Painel,
} from "@/lib/painelEditorial";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const ROTULO_ACAO: Record<AcaoDirigida, string> = {
  aceitar_excecao: "Aceitar exceção documentada",
  reconstruir_ficha: "Reconstruir ficha",
  reescrever_capitulo: "Reescrever capítulo",
  reconstruir_fundacao: "Reconstruir fundação",
  revisar_briefing: "Revisar briefing",
  autorizar_projeto: "Autorizar projeto",
};

export function PainelEditorial({
  estado,
  onAcao,
}: {
  estado: EstadoV2Painel | null | undefined;
  onAcao?: (acao: AcaoDirigida) => void;
}) {
  const p = montarPainel(estado);
  if (!painelTemConteudo(p)) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <BookOpen className="h-4 w-4" /> Inteligência editorial
        </CardTitle>
        <CardDescription>O que a engine sabe sobre este livro — e o que ainda está em aberto.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6 text-sm">
        {p.invalidacao && (
          <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-3">
            <p className="flex items-center gap-2 font-medium text-amber-700 dark:text-amber-400">
              <AlertTriangle className="h-4 w-4" /> Artefatos invalidados
            </p>
            <p className="mt-1 text-xs text-muted-foreground">{p.invalidacao.motivo}</p>
            <div className="mt-2 flex flex-wrap gap-1">
              {p.invalidacao.artefatos.map((a) => (
                <Badge key={a} variant="warning">{a}</Badge>
              ))}
            </div>
          </div>
        )}

        {(p.promessasAbertas.length > 0 || p.promessasPagas.length > 0) && (
          <section className="space-y-2">
            <p className="flex items-center gap-2 font-medium">
              <KeyRound className="h-4 w-4" /> Promessas e pistas
            </p>
            {p.promessasAbertas.length > 0 ? (
              <ul className="space-y-1.5">
                {p.promessasAbertas.map((i) => (
                  <li key={i.id} className="rounded-md border px-2.5 py-1.5">
                    <div className="flex items-center gap-2">
                      <Badge variant="warning">aberta</Badge>
                      <span className="text-xs text-muted-foreground">
                        cap {i.plantada_em} · origem: {i.origem}
                      </span>
                    </div>
                    <p className="mt-1">{i.enunciado}</p>
                    {i.trecho && <p className="mt-0.5 text-xs italic text-muted-foreground">“{i.trecho}”</p>}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-muted-foreground">Nenhuma promessa em aberto.</p>
            )}
            {p.promessasPagas.length > 0 && (
              <p className="text-xs text-muted-foreground">
                {p.promessasPagas.length} paga(s): {p.promessasPagas.map((i) => `${i.id}→cap ${i.paga_em ?? "?"}`).join(", ")}
              </p>
            )}
          </section>
        )}

        {p.conflitos.length > 0 && (
          <section className="space-y-2">
            <p className="flex items-center gap-2 font-medium">
              <Layers className="h-4 w-4" /> Ficha × prosa
            </p>
            <ul className="space-y-1">
              {p.conflitos.map((c, i) => (
                <li key={`${c.capitulo}-${c.campo}-${i}`} className="text-xs">
                  <span className="font-medium">cap {c.capitulo} · {c.campo}:</span> a ficha dizia “{c.valorFicha}”; a
                  página entregou “{c.valorProsa}”.
                </li>
              ))}
            </ul>
          </section>
        )}

        {p.correcoes.length > 0 && (
          <section className="space-y-2">
            <p className="flex items-center gap-2 font-medium">
              <Wrench className="h-4 w-4" /> Correções tentadas
            </p>
            {p.correcoes.map((c) => (
              <div key={c.capitulo} className="rounded-md border p-2.5">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">Capítulo {c.capitulo}</span>
                  {c.semProgresso && <Badge variant="destructive">sem progresso</Badge>}
                  {c.circuitBreaker && <Badge variant="destructive">circuit breaker</Badge>}
                </div>
                {c.circuitBreaker && (
                  <p className="mt-1 text-xs text-muted-foreground">{c.circuitBreaker.motivo}</p>
                )}
                <ul className="mt-1.5 space-y-1">
                  {c.tentativas.map((t, i) => (
                    <li key={`${t.estrategia}-${i}`} className="text-xs">
                      <Badge variant="outline" className="mr-1">{t.estrategia}</Badge>
                      {t.resultado} — {t.hipotese} <span className="text-muted-foreground">({t.gate})</span>
                    </li>
                  ))}
                </ul>
                {c.naoTentadas.length > 0 && (
                  <p className="mt-1 text-xs text-muted-foreground">Ainda não tentado: {c.naoTentadas.join(", ")}</p>
                )}
              </div>
            ))}
          </section>
        )}

        {p.reescritas.length > 0 && (
          <section className="space-y-2">
            <p className="flex items-center gap-2 font-medium">
              <GitBranch className="h-4 w-4" /> Reescritas e propagação
            </p>
            {p.reescritas.map((r) => (
              <div key={r.origem} className="rounded-md border p-2.5 text-xs">
                <p>{r.explicacao}</p>
                {r.afetados.length > 0 && (
                  <ul className="mt-1 space-y-0.5 text-muted-foreground">
                    {r.afetados.map((a) => (
                      <li key={a.capitulo}>
                        cap {a.capitulo} — {a.motivos.join("; ") || "dependência declarada"}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
            <p className="text-xs text-muted-foreground">{POLITICA_REESCRITA}</p>
          </section>
        )}

        {p.bloqueios.length > 0 && (
          <section className="space-y-2">
            <p className="font-medium">Bloqueios</p>
            <ul className="space-y-1">
              {p.bloqueios.map((b, i) => (
                <li key={`${b.codigo}-${i}`} className="text-xs">
                  <Badge variant="destructive" className="mr-1">{b.codigo}</Badge>
                  <span className="text-muted-foreground">{b.alvo}</span> — {b.detalhe}
                </li>
              ))}
            </ul>
          </section>
        )}

        {p.canario && (
          <p className="text-xs text-muted-foreground">
            Canário de voz aprovado por {p.canario.aprovado_por} em {p.canario.aprovado_em} (hash{" "}
            {p.canario.hash.slice(0, 12)}). O perfil de voz do livro deriva dele.
          </p>
        )}

        {p.acoes.length > 0 && (
          <div className="flex flex-wrap gap-2 border-t pt-3">
            {p.acoes.map((a) => (
              <Button key={a} size="sm" variant="outline" onClick={() => onAcao?.(a)}>
                {ROTULO_ACAO[a]}
              </Button>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
