// Painel Engine V2 — auditabilidade do estado canônico (engine_state),
// pareceres estruturados (engine_reviews) e execuções (engine_runs).
// Honestidade: migração pendente mostra banner âmbar; nunca inventa dados.
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, History, Loader2, RotateCw, ShieldCheck } from "lucide-react";
import {
  avaliacaoMetaComprovada,
  lerEstadoV2,
  listarReviewsV2,
  listarRunsV2,
  type EstadoCanonicoV2,
  type ReviewV2,
  type RunV2,
} from "@/lib/engineV2";
import { PainelEditorial } from "@/components/PainelEditorial";
import type { EstadoV2Painel } from "@/lib/painelEditorial";
import { cn } from "@/lib/utils";
import { supabase } from "@/lib/supabase";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
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

// Rótulos legíveis da fase do estado canônico (doc.fase).
// Ordem lógica: escrita → revisao_final → consolidacao → avaliacao → concluido.
const FASE_LABEL: Record<string, string> = {
  fundacao: "fundação",
  estrutura: "estrutura",
  escrita: "escrita",
  revisao_final: "revisão final",
  consolidacao: "consolidação",
  avaliacao: "avaliação final",
  concluido: "concluído",
  bloqueado: "bloqueado",
};

const FASES = ["fundacao", "estrutura", "escrita", "revisao_final", "consolidacao", "avaliacao", "concluido"] as const;

function ProgressoFases({ fase }: { fase: string }) {
  const atual = FASES.indexOf(fase as (typeof FASES)[number]);
  return (
    <ol className="grid grid-cols-2 overflow-hidden rounded-lg border sm:grid-cols-4 lg:grid-cols-7" aria-label="Etapas da Engine V2">
      {FASES.map((item, indice) => {
        const concluida = atual >= indice || fase === "concluido";
        const ativa = item === fase;
        return (
          <li
            key={item}
            className={cn(
              "border-b border-r px-3 py-2 text-[11px] last:border-r-0 sm:border-b-0",
              ativa && "bg-primary/10 text-primary",
              concluida && !ativa && "bg-muted/30"
            )}
            aria-current={ativa ? "step" : undefined}
          >
            <span className="block font-mono text-[9px] text-muted-foreground">{String(indice + 1).padStart(2, "0")}</span>
            <span className="font-medium">{FASE_LABEL[item]}</span>
          </li>
        );
      })}
    </ol>
  );
}

const MODO_CORRECAO_LABEL: Record<string, string> = {
  cirurgico: "cirúrgico",
  reescrita: "reescrita",
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
  necessita_decisao_humana: { label: "legado — reprocessar automaticamente", variant: "warning" },
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

/**
 * Direção do autor a qualquer momento: observações viram decisões (camada 3 do
 * compilador — vencem o perfil) e preferências viram camada 7 (a mais fraca).
 * Gravadas em projects.briefing; o worker as injeta no pacote do próximo capítulo.
 */
function DirecaoAutorCard({ projectId }: { projectId: string }) {
  const [texto, setTexto] = useState("");
  const [tipo, setTipo] = useState<"decisao" | "preferencia">("decisao");
  const [salvando, setSalvando] = useState(false);
  const [registros, setRegistros] = useState<{ texto: string; em?: string; tipo: string }[]>([]);

  const carregarRegistros = useCallback(async () => {
    const { data } = await supabase.from("projects").select("briefing").eq("id", projectId).single();
    const b = (data?.briefing ?? {}) as { decisoes_autor?: { texto?: string; em?: string }[]; preferencias?: { texto?: string; em?: string }[] };
    setRegistros([
      ...(b.decisoes_autor ?? []).map((d) => ({ texto: d.texto ?? "", em: d.em, tipo: "decisão" })),
      ...(b.preferencias ?? []).map((p) => ({ texto: p.texto ?? "", em: p.em, tipo: "preferência" })),
    ].filter((r) => r.texto).sort((a, b2) => (b2.em ?? "").localeCompare(a.em ?? "")));
  }, [projectId]);

  useEffect(() => { carregarRegistros(); }, [carregarRegistros]);

  async function salvar() {
    const t = texto.trim();
    if (!t) return;
    setSalvando(true);
    try {
      const { data, error } = await supabase.from("projects").select("briefing").eq("id", projectId).single();
      if (error) throw error;
      const b = (data?.briefing ?? {}) as Record<string, unknown>;
      const chave = tipo === "decisao" ? "decisoes_autor" : "preferencias";
      const lista = Array.isArray(b[chave]) ? (b[chave] as unknown[]) : [];
      const { error: e2 } = await supabase
        .from("projects")
        .update({ briefing: { ...b, [chave]: [...lista, { texto: t, em: new Date().toISOString(), origem: "painel" }] } })
        .eq("id", projectId);
      if (e2) throw e2;
      setTexto("");
      await carregarRegistros();
      toast.success(tipo === "decisao"
        ? "Decisão registrada — entra como instrução (camada 3) no próximo capítulo."
        : "Preferência registrada — entra como camada 7 no próximo capítulo.");
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl">Direção do autor</CardTitle>
        <CardDescription>
          Observações chegam à engine no próximo capítulo: decisões vencem o perfil da obra (camada 3);
          preferências são orientações não obrigatórias (camada 7).
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex gap-2">
          <Button size="sm" variant={tipo === "decisao" ? "default" : "outline"} onClick={() => setTipo("decisao")}>
            Decisão (obrigatória)
          </Button>
          <Button size="sm" variant={tipo === "preferencia" ? "default" : "outline"} onClick={() => setTipo("preferencia")}>
            Preferência
          </Button>
        </div>
        <Textarea
          rows={3}
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          placeholder={tipo === "decisao"
            ? "Ex.: O irmão da protagonista está vivo — nunca sugerir o contrário."
            : "Ex.: Prefiro capítulos que abrem em movimento."}
        />
        <div className="flex justify-end">
          <Button size="sm" disabled={salvando || !texto.trim()} onClick={salvar}>
            {salvando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null} Registrar
          </Button>
        </div>
        {!!registros.length && (
          <ul className="space-y-1.5">
            {registros.slice(0, 8).map((r, i) => (
              <li key={`${r.em}-${i}`} className="rounded-md border p-2 text-xs">
                <Badge variant={r.tipo === "decisão" ? "default" : "outline"}>{r.tipo}</Badge>
                <span className="ml-2">{r.texto}</span>
                {r.em && <span className="ml-2 text-muted-foreground">({fmtData(r.em)})</span>}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
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
  const [capSel, setCapSel] = useState<number | "livro" | null>(null);

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
    const canal = supabase
      .channel(`engine-v2-panel-${projectId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "engine_state", filter: `project_id=eq.${projectId}` },
        carregar
      )
      .subscribe();
    return () => {
      clearInterval(timer);
      supabase.removeChannel(canal);
    };
  }, [carregar, projectId]);

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
  const aprovados = caps.filter(([, c]) => c.status === "aprovado").length;
  const comExcecao = caps.filter(([, c]) => c.status === "aprovado_com_excecao").length;
  const pendentes = caps.length - aprovados - comExcecao;
  const reviewsLivro = reviews.filter((r) => r.capitulo === null);
  const decisaoHumana = doc.bloqueios?.find(
    (b) => /DECISAO|HUMAN/i.test(`${b.codigo} ${b.detalhe}`)
  );
  const falhaRecente = runs[0]?.status === "falha" ? runs[0] : undefined;
  const throttleRecente = falhaRecente && (
    falhaRecente.erro?.classe === "quota" ||
    /limit|quota|thrott|429|reset/i.test(`${falhaRecente.erro?.codigo ?? ""} ${falhaRecente.erro?.mensagem ?? ""}`)
  );
  const metaAtingida = avaliacaoMetaComprovada(doc.avaliacao);
  const reviewSel =
    capSel == null
      ? undefined
      : capSel === "livro"
        ? reviewsLivro[0]
        : reviews.find((r) => r.capitulo === capSel);

  return (
    <div className="space-y-4">
      {/* Fatia O — o que a engine sabe sobre o livro, antes do detalhe técnico. */}
      <PainelEditorial estado={doc as unknown as EstadoV2Painel} />
      <Card>
        <CardHeader>
          <CardTitle className="text-xl">Engine V2</CardTitle>
          <CardDescription>Estado canônico do projeto — verdade auditável por hash.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <Badge>{FASE_LABEL[doc.fase] ?? doc.fase}</Badge>
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

          <ProgressoFases fase={doc.fase} />

          <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border bg-border sm:grid-cols-4">
            <div className="bg-card p-3">
              <p className="font-mono text-xl tabular-nums">{aprovados}</p>
              <p className="text-[11px] text-muted-foreground">aprovados plenos</p>
            </div>
            <div className="bg-card p-3">
              <p className="font-mono text-xl tabular-nums">{comExcecao}</p>
              <p className="text-[11px] text-muted-foreground">com exceção</p>
            </div>
            <div className="bg-card p-3">
              <p className="font-mono text-xl tabular-nums">{pendentes}</p>
              <p className="text-[11px] text-muted-foreground">a resolver</p>
            </div>
            <div className="bg-card p-3">
              <p className="font-mono text-xl tabular-nums">{runs.length}</p>
              <p className="text-[11px] text-muted-foreground">execuções recentes</p>
            </div>
          </div>

          {doc.migracao?.total_original != null &&
            doc.migracao.total_reconciliado != null &&
            doc.migracao.total_original !== doc.migracao.total_reconciliado && (
              <div className="flex items-start gap-3 rounded-lg border border-sky-500/40 bg-sky-500/10 p-3 text-sm">
                <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-sky-700 dark:text-sky-400" />
                <div>
                  <p className="font-medium">Total legado reconciliado</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    O planejamento antigo indicava {doc.migracao.total_original} capítulos, mas o estado canônico
                    concluído contém {doc.migracao.total_reconciliado}. A escrita respeitará o total canônico e não
                    criará capítulo adicional automaticamente.
                  </p>
                </div>
              </div>
            )}

          {decisaoHumana && (
            <div className="flex items-start gap-3 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-700 dark:text-amber-400" />
              <div>
                <p className="font-medium">Decisão autoral necessária</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {decisaoHumana.alvo}: {decisaoHumana.detalhe} Abra o parecer correspondente antes de decidir.
                </p>
              </div>
            </div>
          )}

          {throttleRecente && (
            <div className="flex items-start gap-3 rounded-lg border bg-muted/30 p-3 text-sm">
              <RotateCw className="mt-0.5 h-4 w-4 shrink-0" />
              <div>
                <p className="font-medium">Limite da IA detectado</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  O worker preserva o estado atual e retoma pelo agendador; a falha não rebaixa capítulos aprovados.
                </p>
              </div>
            </div>
          )}

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

          {!!reviewsLivro.length && (
            <button
              type="button"
              onClick={() => setCapSel("livro")}
              className="flex w-full items-center justify-between gap-2 rounded-md border p-2.5 text-left text-sm transition-colors hover:bg-accent"
            >
              <span className="font-medium">Parecer do livro</span>
              <Badge variant={verdictVariant(reviewsLivro[0].verdict)}>
                {reviewsLivro[0].verdict.replace(/_/g, " ")}
              </Badge>
            </button>
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
                        <th className="px-2 py-1.5 font-medium">Modo</th>
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
                        const modo = (r.payload as { modo_correcao?: string } | null)?.modo_correcao;
                        return (
                          <tr key={r.id} className="border-b last:border-0">
                            <td className="px-2 py-1.5 font-medium">{r.papel}</td>
                            <td className="px-2 py-1.5 text-muted-foreground">
                              {r.model_name ?? "—"}
                              {r.capacidade ? ` (${r.capacidade})` : ""}
                            </td>
                            <td className="px-2 py-1.5">{r.alvo ?? "—"}</td>
                            <td className="px-2 py-1.5"><Badge variant={sb.variant}>{sb.label}</Badge></td>
                            <td className="px-2 py-1.5">{modo ? MODO_CORRECAO_LABEL[modo] ?? modo : "—"}</td>
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

      <DirecaoAutorCard projectId={projectId} />

      {!!doc.reversoes_meta?.length && (
        <Card className="border-emerald-600/30">
          <CardHeader>
            <div className="flex items-start gap-3">
              <div className="rounded-full bg-emerald-600/10 p-2 text-emerald-700 dark:text-emerald-400">
                <ShieldCheck className="h-4 w-4" />
              </div>
              <div>
                <CardTitle className="text-xl">Melhor versão preservada</CardTitle>
                <CardDescription>
                  Tentativas piores continuam no histórico, mas não substituíram o texto aprovado.
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {[...doc.reversoes_meta].reverse().slice(0, 5).map((r, i) => (
                <li key={`${r.capitulo}-${r.em}-${i}`} className="flex items-start gap-3 rounded-lg border p-3 text-xs">
                  <History className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <div className="min-w-0">
                    <p className="font-medium">
                      Capítulo {r.capitulo}: tentativa {r.status_tentativa.replace(/_/g, " ")} revertida
                    </p>
                    <p className="mt-0.5 text-muted-foreground">{r.motivo}</p>
                    <p className="mt-1 font-mono text-[10px] text-muted-foreground" title={r.text_hash_restaurado}>
                      restaurado {hashCurto(r.text_hash_restaurado)} · {fmtData(r.em)}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {doc.edicao_estrutural && (
        <Card>
          <CardHeader>
            <CardTitle className="text-xl">Edição estrutural</CardTitle>
            <CardDescription>Propostas do editor_estrutural aplicadas ao manuscrito.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2.5 text-sm">
            <p>
              <span className="font-medium tabular-nums">{doc.edicao_estrutural.propostas}</span> propostas ·{" "}
              <span className="font-medium tabular-nums">{doc.edicao_estrutural.aplicadas}</span> aplicadas
            </p>
            {!!doc.edicao_estrutural.detalhe?.length && (
              <ul className="list-disc space-y-1 pl-5 text-xs text-muted-foreground">
                {doc.edicao_estrutural.detalhe.map((d, i) => (
                  <li key={i}>{d}</li>
                ))}
              </ul>
            )}
            <p className="text-xs text-muted-foreground">{fmtData(doc.edicao_estrutural.em)}</p>
          </CardContent>
        </Card>
      )}

      {doc.avaliacao && (
        <Card>
          <CardHeader>
            <CardTitle className="text-xl">Nota bestseller</CardTitle>
            <CardDescription>Avaliação comercial do livro completo (book-bestseller-review).</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2.5">
            <div className="flex flex-wrap items-baseline gap-2">
              <span className="text-3xl font-semibold tabular-nums">
                {doc.avaliacao.nota != null ? doc.avaliacao.nota.toFixed(1) : "—"}
              </span>
              <span className="text-sm text-muted-foreground">
                / meta {doc.avaliacao.meta.toFixed(1)}
              </span>
              {doc.avaliacao.nota != null && (
                <Badge variant={metaAtingida ? "success" : "warning"}>
                  {metaAtingida ? "meta e piso atingidos" : "ainda não aprovada"}
                </Badge>
              )}
            </div>
            {doc.avaliacao.floor ? (
              <p className="text-sm">
                Piso editorial: <span className="font-medium tabular-nums">{doc.avaliacao.floor.nota.toFixed(1)}</span>
                <span className="text-muted-foreground"> em {doc.avaliacao.floor.dimensao.replace(/_/g, " ")} · mínimo 7,0</span>
              </p>
            ) : (
              <p className="text-xs text-amber-700 dark:text-amber-400">
                Esta avaliação antiga não registrou o piso por dimensão; reavalie antes de tratá-la como aprovação.
              </p>
            )}
            <p className="text-sm text-muted-foreground">
              {doc.avaliacao.iteracoes} iteração(ões) · {fmtData(doc.avaliacao.em)}
            </p>
            {doc.avaliacao.relatorio_path && (
              <p className="text-xs text-muted-foreground">
                Relatório: <code>{doc.avaliacao.relatorio_path}</code>
              </p>
            )}
          </CardContent>
        </Card>
      )}

      <Dialog open={capSel != null} onOpenChange={(o) => !o && setCapSel(null)}>
        <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{capSel === "livro" ? "Parecer do livro" : `Capítulo ${capSel} — parecer`}</DialogTitle>
            <DialogDescription>Parecer estruturado mais recente do revisor da Engine V2.</DialogDescription>
          </DialogHeader>
          {reviewSel ? (
            <ParecerCapitulo review={reviewSel} />
          ) : (
            <p className="text-sm text-muted-foreground">
              {capSel === "livro"
                ? "Nenhum parecer V2 do livro registrado ainda."
                : "Nenhum parecer V2 registrado para este capítulo."}
            </p>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
