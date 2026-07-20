// Painel Engine V2 — auditabilidade do estado canônico (engine_state),
// pareceres estruturados (engine_reviews) e execuções (engine_runs).
// Honestidade: migração pendente mostra banner âmbar; nunca inventa dados.
import { useCallback, useEffect, useState } from "react";
import { Loader2, RotateCw } from "lucide-react";
import {
  lerEstadoV2,
  listarReviewsV2,
  listarRunsV2,
  type EstadoCanonicoV2,
  type ReviewV2,
  type RunV2,
} from "@/lib/engineV2";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type BadgeVariant = "default" | "secondary" | "destructive" | "outline" | "success" | "warning";

const STATUS_CAP: Record<string, { label: string; variant: BadgeVariant; title?: string }> = {
  aprovado: { label: "aprovado", variant: "success" },
  aprovado_com_excecao: { label: "com exceção", variant: "warning" },
  bloqueado: { label: "bloqueado", variant: "destructive" },
  reprovado: { label: "reprovado", variant: "destructive" },
  escrito: { label: "escrito", variant: "secondary" },
  em_revisao: { label: "em revisão", variant: "secondary" },
  legado_sem_evidencia: {
    label: "legado",
    variant: "outline",
    title: "Capítulo migrado da V1 sem evidência V2 (parecer estruturado/hash) registrada.",
  },
};

const EIXOS = [
  ["dramatic_progression", "Progressão dramática"],
  ["skill_adherence", "Aderência à skill"],
  ["clarity", "Clareza"],
  ["emotional_effect", "Efeito emocional"],
  ["continuity", "Continuidade"],
  ["hook_effectiveness", "Gancho"],
] as const;

const DISPOSICAO: Record<string, { label: string; variant: BadgeVariant }> = {
  violacao_confirmada: { label: "violação confirmada", variant: "destructive" },
  excecao_valida: { label: "exceção válida", variant: "success" },
  falso_positivo: { label: "falso positivo", variant: "secondary" },
  necessita_decisao_humana: { label: "decisão humana", variant: "warning" },
};

function verdictVariant(v: string): BadgeVariant {
  if (v === "aprovado") return "success";
  if (v === "aprovado_com_excecao") return "warning";
  if (v === "reprovado" || v === "bloqueado") return "destructive";
  return "outline";
}

function hashCurto(h?: string | null): string {
  return h ? h.slice(0, 10) : "—";
}

function fmtData(iso?: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString("pt-BR");
}

function duracao(r: RunV2): string {
  if (!r.finished_at) return r.status === "running" ? "…" : "—";
  const ms = new Date(r.finished_at).getTime() - new Date(r.started_at).getTime();
  if (!Number.isFinite(ms) || ms < 0) return "—";
  const s = Math.round(ms / 1000);
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m${String(s % 60).padStart(2, "0")}s`;
}

function runStatusBadge(status: string): { label: string; variant: BadgeVariant } {
  if (status === "ok") return { label: "ok", variant: "success" };
  if (status === "falha") return { label: "falha", variant: "destructive" };
  if (status === "running") return { label: "executando", variant: "secondary" };
  return { label: status, variant: "outline" };
}

function ParecerCapitulo({ review }: { review: ReviewV2 }) {
  const p = review.parecer ?? {};
  return (
    <div className="space-y-4 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={verdictVariant(review.verdict)}>{review.verdict.replace(/_/g, " ")}</Badge>
        <span className="text-xs text-muted-foreground" title={review.text_hash}>
          hash {hashCurto(review.text_hash)}
        </span>
        <span className="text-xs text-muted-foreground">· {fmtData(review.created_at)}</span>
      </div>

      <div className="space-y-2.5">
        {EIXOS.map(([chave, label]) => {
          const eixo = p[chave];
          if (!eixo) return null;
          return (
            <div key={chave}>
              <div className="flex items-baseline justify-between gap-2 text-xs">
                <span className="font-medium">{label}</span>
                <span className="tabular-nums text-muted-foreground">{eixo.nota}/5</span>
              </div>
              <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-primary"
                  style={{ width: `${Math.max(0, Math.min(100, (eixo.nota / 5) * 100))}%` }}
                />
              </div>
              {eixo.evidencia && (
                <p className="mt-1 text-xs text-muted-foreground">{eixo.evidencia}</p>
              )}
            </div>
          );
        })}
      </div>

      {!!p.evidencias?.length && (
        <div>
          <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">Evidências</p>
          <ul className="space-y-2">
            {p.evidencias.map((ev, i) => (
              <li key={i} className="rounded-md border p-2 text-xs">
                <p className="font-medium">{ev.local}</p>
                {ev.trecho && <p className="mt-0.5 italic text-muted-foreground">“{ev.trecho}”</p>}
                {ev.observacao && <p className="mt-0.5">{ev.observacao}</p>}
              </li>
            ))}
          </ul>
        </div>
      )}

      {!!p.sinais?.length && (
        <div>
          <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">Sinais</p>
          <ul className="space-y-2">
            {p.sinais.map((s, i) => {
              const d = DISPOSICAO[s.disposicao] ?? { label: s.disposicao, variant: "outline" as BadgeVariant };
              return (
                <li key={i} className="rounded-md border p-2 text-xs">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{s.sinal}</span>
                    <span className="tabular-nums text-muted-foreground">{String(s.valor)}</span>
                    <Badge variant={d.variant}>{d.label}</Badge>
                  </div>
                  {s.evidencia && <p className="mt-1 text-muted-foreground">{s.evidencia}</p>}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {!!p.correcoes?.length && (
        <div>
          <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">Correções</p>
          <ul className="space-y-2">
            {p.correcoes.map((c, i) => (
              <li key={i} className="rounded-md border p-2 text-xs">
                <p className="font-medium">{c.local}</p>
                <p className="mt-0.5 text-muted-foreground">{c.problema}</p>
                <p className="mt-0.5">{c.instrucao}</p>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export function EngineV2Panel({ projectId }: { projectId: string }) {
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [migracaoPendente, setMigracaoPendente] = useState(false);
  const [estado, setEstado] = useState<EstadoCanonicoV2 | null>(null);
  const [runs, setRuns] = useState<RunV2[]>([]);
  const [reviews, setReviews] = useState<ReviewV2[]>([]);
  const [capSel, setCapSel] = useState<number | null>(null);

  const carregar = useCallback(async () => {
    try {
      const [e, r, rv] = await Promise.all([
        lerEstadoV2(projectId),
        listarRunsV2(projectId, 20),
        listarReviewsV2(projectId),
      ]);
      if (e.migracaoPendente || r.migracaoPendente || rv.migracaoPendente) {
        setMigracaoPendente(true);
      } else {
        setMigracaoPendente(false);
        setEstado(e.dados);
        setRuns(r.dados);
        setReviews(rv.dados);
      }
      setErro(null);
    } catch (err) {
      setErro((err as Error).message);
    } finally {
      setCarregando(false);
    }
  }, [projectId]);

  useEffect(() => {
    carregar();
    const timer = setInterval(carregar, 20_000);
    return () => clearInterval(timer);
  }, [carregar]);

  if (carregando) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (migracaoPendente) {
    return (
      <p className="rounded-md bg-amber-500/10 px-3 py-2 text-sm text-amber-700 dark:text-amber-400">
        Engine V2 aguardando migração de banco — <code>supabase/engine_v2.sql</code>.
      </p>
    );
  }

  if (erro) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-destructive">Falha ao carregar o estado da Engine V2: {erro}</p>
        <Button size="sm" variant="outline" onClick={() => { setCarregando(true); carregar(); }}>
          <RotateCw className="h-3.5 w-3.5" /> Tentar de novo
        </Button>
      </div>
    );
  }

  if (!estado) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed py-16 text-center">
        <p className="text-muted-foreground">Este projeto ainda não roda na Engine V2.</p>
      </div>
    );
  }

  const doc = estado.doc;
  const caps = Object.entries(doc.capitulos ?? {}).sort((a, b) => Number(a[0]) - Number(b[0]));
  const reviewSel = capSel != null ? reviews.find((r) => r.capitulo === capSel) : undefined;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-xl">Engine V2</CardTitle>
          <CardDescription>Estado canônico do projeto — verdade auditável por hash.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <Badge>{doc.fase}</Badge>
            <Badge variant="outline">engine {estado.engine_version}</Badge>
            {doc.skill && (
              <Badge variant="secondary" title={`hash da skill: ${doc.skill.hash}`}>
                {doc.skill.id}@{doc.skill.versao}
              </Badge>
            )}
            {doc.skill?.hash && (
              <span className="text-xs text-muted-foreground" title={doc.skill.hash}>
                hash {hashCurto(doc.skill.hash)}
              </span>
            )}
            {doc.total_capitulos != null && (
              <span className="text-xs text-muted-foreground">· {doc.total_capitulos} capítulos</span>
            )}
            {estado.updated_at && (
              <span className="text-xs text-muted-foreground">· atualizado {fmtData(estado.updated_at)}</span>
            )}
          </div>

          {caps.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum capítulo registrado no estado V2 ainda.</p>
          ) : (
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {caps.map(([num, c]) => {
                const st = STATUS_CAP[c.status] ?? { label: c.status, variant: "outline" as BadgeVariant };
                return (
                  <button
                    key={num}
                    type="button"
                    onClick={() => setCapSel(Number(num))}
                    className="flex items-center justify-between gap-2 rounded-md border p-2.5 text-left text-sm transition-colors hover:bg-accent"
                    title={st.title ?? (c.text_hash ? `hash ${c.text_hash}` : undefined)}
                  >
                    <span className="min-w-0">
                      <span className="font-medium">Cap {Number(num)}</span>
                      {c.palavras != null && (
                        <span className="ml-1.5 text-xs text-muted-foreground">{c.palavras} pal.</span>
                      )}
                    </span>
                    <Badge variant={st.variant}>{st.label}</Badge>
                  </button>
                );
              })}
            </div>
          )}

          {!!doc.bloqueios?.length && (
            <div>
              <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Bloqueios ativos
              </p>
              <ul className="space-y-2">
                {doc.bloqueios.map((b, i) => (
                  <li key={i} className="rounded-md bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
                    <span className="font-medium">{b.codigo}</span>
                    {b.alvo && <span> · {b.alvo}</span>} — {b.detalhe}
                    <span className="opacity-75"> (desde {fmtData(b.desde)})</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <details className="rounded-md border">
            <summary className="cursor-pointer select-none px-3 py-2 text-sm font-medium">
              Execuções ({runs.length})
            </summary>
            <div className="border-t px-3 py-2">
              {runs.length === 0 ? (
                <p className="py-2 text-sm text-muted-foreground">Nenhuma execução registrada.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b text-left text-muted-foreground">
                        <th className="px-2 py-1.5 font-medium">Papel</th>
                        <th className="px-2 py-1.5 font-medium">Modelo</th>
                        <th className="px-2 py-1.5 font-medium">Alvo</th>
                        <th className="px-2 py-1.5 font-medium">Status</th>
                        <th className="px-2 py-1.5 font-medium">Tent.</th>
                        <th className="px-2 py-1.5 font-medium">Duração</th>
                        <th className="px-2 py-1.5 font-medium">Tokens</th>
                        <th className="px-2 py-1.5 font-medium">Bundle</th>
                        <th className="px-2 py-1.5 font-medium">Erro</th>
                      </tr>
                    </thead>
                    <tbody>
                      {runs.map((r) => {
                        const sb = runStatusBadge(r.status);
                        return (
                          <tr key={r.id} className="border-b last:border-0">
                            <td className="px-2 py-1.5 font-medium">{r.papel}</td>
                            <td className="px-2 py-1.5 text-muted-foreground">
                              {r.model_name ?? "—"}
                              {r.capacidade ? ` (${r.capacidade})` : ""}
                            </td>
                            <td className="px-2 py-1.5">{r.alvo ?? "—"}</td>
                            <td className="px-2 py-1.5"><Badge variant={sb.variant}>{sb.label}</Badge></td>
                            <td className="px-2 py-1.5 tabular-nums">{r.attempt}</td>
                            <td className="px-2 py-1.5 tabular-nums">{duracao(r)}</td>
                            <td className="px-2 py-1.5 tabular-nums">
                              {r.tokens_in != null || r.tokens_out != null
                                ? `${r.tokens_in ?? 0}/${r.tokens_out ?? 0}`
                                : "—"}
                            </td>
                            <td className="px-2 py-1.5 font-mono" title={r.input_bundle_hash ?? undefined}>
                              {hashCurto(r.input_bundle_hash)}
                            </td>
                            <td className="max-w-[16rem] truncate px-2 py-1.5 text-destructive" title={r.erro?.mensagem}>
                              {r.status === "falha" ? r.erro?.mensagem ?? "—" : ""}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </details>
        </CardContent>
      </Card>

      <Dialog open={capSel != null} onOpenChange={(o) => !o && setCapSel(null)}>
        <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Capítulo {capSel} — parecer</DialogTitle>
            <DialogDescription>Parecer estruturado mais recente do revisor da Engine V2.</DialogDescription>
          </DialogHeader>
          {reviewSel ? (
            <ParecerCapitulo review={reviewSel} />
          ) : (
            <p className="text-sm text-muted-foreground">
              Nenhum parecer V2 registrado para este capítulo.
            </p>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
