// Leitura editorial do relatório book-bestseller-review: resumo executivo
// (nota + veredito + meta/distância + 3 consertos de maior alavancagem),
// seções legíveis, critérios em tabela real, metodologia recolhida ao fim.
import { parseReview, inlineMd } from "@/lib/reviewReport";

const PROSE =
  "text-sm leading-relaxed text-foreground/90 [&_p]:my-2 [&_h3]:mt-4 [&_h3]:mb-1 [&_h3]:text-sm [&_h3]:font-semibold [&_h4]:mt-2 [&_h4]:font-medium [&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-5 [&_li]:my-1 [&_strong]:font-semibold [&_em]:italic [&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_code]:text-xs [&_blockquote]:border-l-2 [&_blockquote]:border-border [&_blockquote]:pl-3 [&_blockquote]:text-muted-foreground";

function Html({ html, className }: { html: string; className?: string }) {
  return <div className={className} dangerouslySetInnerHTML={{ __html: html }} />;
}

function prioBadge(prioridade: string): string {
  const base = "inline-block rounded px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ";
  if (/ALTA/i.test(prioridade)) return base + "bg-destructive/15 text-destructive";
  if (/M[ÉE]DIA/i.test(prioridade)) return base + "bg-amber-500/15 text-amber-700 dark:text-amber-400";
  return base + "bg-muted text-muted-foreground";
}

export function ReviewReport({ md }: { md: string }) {
  const r = parseReview(md);
  return (
    <div className="space-y-5">
      {/* Resumo executivo — o que um editor lê primeiro */}
      <div className="rounded-lg border bg-muted/30 p-4">
        <div className="flex flex-wrap items-end gap-x-4 gap-y-1">
          {r.nota != null && (
            <div className="leading-none">
              <span className="text-4xl font-bold tabular-nums">{r.nota}</span>
              <span className="text-lg text-muted-foreground">/10</span>
            </div>
          )}
          <div className="flex flex-col gap-0.5 pb-0.5">
            {r.veredito && <span className="text-sm font-semibold">{r.veredito}</span>}
            {r.meta != null && (
              <span className="text-xs text-muted-foreground">
                Meta {r.meta} · avaliação atual {r.nota ?? "—"}
                {r.gap != null && r.gap > 0 ? ` · faltam ${r.gap}` : r.gap != null ? " · meta atingida" : ""}
              </span>
            )}
          </div>
        </div>
        {r.topFixes.length > 0 && (
          <div className="mt-3 border-t pt-3">
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Consertos de maior alavancagem
            </p>
            <ol className="mt-1.5 list-decimal space-y-1 pl-5 text-sm">
              {r.topFixes.slice(0, 3).map((f, i) => (
                <li key={i}>{f}</li>
              ))}
            </ol>
          </div>
        )}
      </div>

      {r.panoramaHtml && <Html html={r.panoramaHtml} className={PROSE} />}

      {r.fortesHtml && (
        <section>
          <h3 className="mb-1 text-sm font-semibold">Pontos fortes</h3>
          <Html html={r.fortesHtml} className={PROSE} />
        </section>
      )}

      {r.fracos.length > 0 && (
        <section className="space-y-3">
          <h3 className="text-sm font-semibold">Pontos fracos priorizados</h3>
          {r.fracos.map((f, i) => (
            <div key={i} className="rounded-lg border p-3">
              <span className={prioBadge(f.prioridade)}>{f.prioridade}</span>
              <Html html={f.itensHtml} className={`${PROSE} mt-2`} />
            </div>
          ))}
        </section>
      )}

      {r.criterios && r.criterios.rows.length > 0 && (
        <section>
          <h3 className="mb-2 text-sm font-semibold">Notas por critério</h3>
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="bg-muted/40">
                  {r.criterios.headers.map((h, i) => (
                    <th key={i} className="border-b px-2.5 py-1.5 text-left font-medium text-muted-foreground"
                        dangerouslySetInnerHTML={{ __html: inlineMd(h) }} />
                  ))}
                </tr>
              </thead>
              <tbody>
                {r.criterios.rows.map((row, ri) => (
                  <tr key={ri} className="border-b last:border-0">
                    {row.map((c, ci) => (
                      <td key={ci} className="px-2.5 py-1.5 align-top"
                          dangerouslySetInnerHTML={{ __html: inlineMd(c) }} />
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {r.outras.map((s, i) => (
        <section key={i}>
          <h3 className="mb-1 text-sm font-semibold" dangerouslySetInnerHTML={{ __html: inlineMd(s.titulo) }} />
          <Html html={s.html} className={PROSE} />
        </section>
      ))}

      {r.metodologiaHtml && (
        <details className="rounded-lg border bg-muted/20 p-3">
          <summary className="cursor-pointer text-sm font-medium text-muted-foreground">
            Detalhes da metodologia
          </summary>
          <Html html={r.metodologiaHtml} className={`${PROSE} mt-2`} />
        </details>
      )}
    </div>
  );
}
