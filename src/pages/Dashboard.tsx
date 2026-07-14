import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { BookText, CheckCircle2, Layers, MoreHorizontal, PenLine, Plus, Send, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { supabase } from "@/lib/supabase";
import { signedUrl, deleteProject } from "@/lib/storage";
import { useWorkerStatus } from "@/hooks/useWorkerStatus";
import type { Job, Project } from "@/lib/types";
import { projectStatusBadge } from "@/lib/status";
import { resolveOperationalState, buildResolverInput, toneToVariant, escritaGovernaCartao, type OperationalState, type ChapterRow } from "@/lib/resolveOperationalState";
import { CoverArt } from "@/components/CoverArt";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type BadgeVariant = "default" | "secondary" | "destructive" | "outline" | "success" | "warning";
type Derivado = { label: string; variant: BadgeVariant; pulse: boolean };

function corDot(v: BadgeVariant) {
  return v === "success" ? "bg-emerald-500" : v === "warning" ? "bg-amber-500" : v === "default" ? "bg-primary" : "bg-muted-foreground/40";
}

function StatusBadge({ s }: { s: Derivado }) {
  return (
    <Badge variant={s.variant}>
      {s.pulse && <span className="mr-1.5 inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-current" />}
      {s.label}
    </Badge>
  );
}

function Kpi({ label, valor, Icon }: { label: string; valor: number; Icon: typeof BookText }) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">{label}</span>
        <Icon className="h-4 w-4 text-muted-foreground/50" />
      </div>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{valor}</p>
    </div>
  );
}

export default function Dashboard() {
  const nav = useNavigate();
  const { online } = useWorkerStatus(15_000);
  const [projects, setProjects] = useState<Project[]>([]);
  const [estados, setEstados] = useState<Record<string, OperationalState>>({});
  const [capas, setCapas] = useState<Record<string, string>>({});

  const carregar = useCallback(async () => {
    // Resolvedor único (S7): busca jobs de escrita + chapters (com hash/quality) +
    // pausa de produção; cada projeto vira UMA OperationalState — mesma fonte da
    // página de projeto e da observabilidade (paridade).
    const [{ data: projs }, { data: eds }, { data: chs }, { data: jobsEscrita }, { data: arts }, { data: ctrl }] = await Promise.all([
      supabase.from("projects").select("*").order("created_at", { ascending: false }),
      supabase.from("editions").select("id,project_id,is_origem"),
      supabase.from("chapters").select("edition_id,numero,text_sha256,quality_status"),
      supabase.from("jobs").select("id,project_id,tipo,status,erro,progresso,created_at").eq("tipo", "escrever_livro"),
      supabase.from("artifacts").select("edition_id,storage_path,url_publica").eq("tipo", "capa"),
      supabase.from("worker_control").select("enabled").maybeSingle(),
    ]);
    const projList = (projs as Project[]) ?? [];
    setProjects(projList);
    const producaoPausada = (ctrl as { enabled?: boolean } | null)?.enabled === false;

    const origemEd: Record<string, string> = {};
    const edToProj: Record<string, string> = {};
    for (const e of (eds as { id: string; project_id: string; is_origem: boolean }[]) ?? []) {
      edToProj[e.id] = e.project_id;
      if (e.is_origem) origemEd[e.project_id] = e.id;
    }
    // chapters da edição de origem, por projeto.
    const chsPorProj: Record<string, ChapterRow[]> = {};
    for (const c of (chs as (ChapterRow & { edition_id: string })[]) ?? []) {
      const pid = edToProj[c.edition_id];
      if (!pid || origemEd[pid] !== c.edition_id) continue;
      (chsPorProj[pid] ??= []).push({ numero: c.numero, text_sha256: c.text_sha256, quality_status: c.quality_status });
    }
    // jobs de escrita por projeto.
    const jobsPorProj: Record<string, Job[]> = {};
    for (const j of (jobsEscrita as Job[]) ?? []) {
      if (j.project_id) (jobsPorProj[j.project_id] ??= []).push(j);
    }
    const est: Record<string, OperationalState> = {};
    for (const p of projList) {
      est[p.id] = resolveOperationalState(
        buildResolverInput({ jobs: jobsPorProj[p.id] ?? [], chapters: chsPorProj[p.id] ?? [], totalCapitulos: p.total_capitulos ?? 0, workerOnline: online, producaoPausada })
      );
    }
    setEstados(est);

    // Capa do projeto = capa da edição de origem.
    const origemSet = new Set(Object.values(origemEd));
    const capaEntries = await Promise.all(
      ((arts as { edition_id: string; storage_path: string; url_publica: string | null }[]) ?? [])
        .filter((a) => origemSet.has(a.edition_id))
        .map(async (a) => {
          const url = (await signedUrl("capas", a.storage_path, 3600)) ?? a.url_publica ?? null;
          return [edToProj[a.edition_id], url] as const;
        })
    );
    setCapas(Object.fromEntries(capaEntries.filter(([, u]) => u)) as Record<string, string>);
  }, [online]);

  useEffect(() => {
    carregar();
    const ch = supabase
      .channel("dashboard")
      .on("postgres_changes", { event: "*", schema: "public", table: "jobs" }, () => carregar())
      .on("postgres_changes", { event: "*", schema: "public", table: "projects" }, () => carregar())
      .on("postgres_changes", { event: "*", schema: "public", table: "chapters" }, () => carregar())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [carregar]);

  // Status do cartão: a ESCRITA governa quando ativa/bloqueada (via resolvedor único);
  // senão, o ciclo de vida do projeto. Mesma OperationalState das outras telas.
  const statusDe = useCallback(
    (p: Project): Derivado => {
      const st = estados[p.id];
      if (st && escritaGovernaCartao(st.situacao)) {
        return { label: st.badge, variant: toneToVariant(st.tone), pulse: st.situacao === "executando" };
      }
      return { ...projectStatusBadge(p.status), pulse: false };
    },
    [estados]
  );

  async function excluir(p: Project) {
    if (!confirm(`Excluir "${p.titulo}" e tudo dele? Não dá para desfazer.`)) return;
    try {
      await deleteProject(p.id);
      setProjects((cur) => cur.filter((x) => x.id !== p.id));
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  type CardItem = { kind: "single"; project: Project } | { kind: "saga"; serie: string; volumes: Project[] };
  const { cards, kpis, subtitulo } = useMemo(() => {
    const out: CardItem[] = [];
    const idx: Record<string, number> = {};
    for (const p of projects) {
      if (p.serie) {
        if (idx[p.serie] === undefined) {
          idx[p.serie] = out.length;
          out.push({ kind: "saga", serie: p.serie, volumes: [p] });
        } else (out[idx[p.serie]] as { volumes: Project[] }).volumes.push(p);
      } else out.push({ kind: "single", project: p });
    }
    for (const c of out) if (c.kind === "saga") c.volumes.sort((a, b) => (a.volume ?? 0) - (b.volume ?? 0));

    const kpis = {
      total: projects.length,
      producao: projects.filter((p) => p.status === "escrevendo" || p.status === "revisao").length,
      prontos: projects.filter((p) => p.status === "pronto").length,
      publicados: projects.filter((p) => p.status === "publicado").length,
    };
    const nSeries = out.filter((c) => c.kind === "saga").length;
    const nVol = out.filter((c) => c.kind === "saga").reduce((a, c) => a + (c as { volumes: Project[] }).volumes.length, 0);
    const nAvulsos = out.filter((c) => c.kind === "single").length;
    const partes: string[] = [];
    if (nSeries) partes.push(`${nSeries} série${nSeries !== 1 ? "s" : ""} · ${nVol} volume${nVol !== 1 ? "s" : ""}`);
    partes.push(`${nAvulsos} ${nAvulsos === 1 ? "livro avulso" : "livros avulsos"}`);
    return { cards: out, kpis, subtitulo: partes.join(" · ") };
  }, [projects]);

  function MiniCapa({ p, size = "h-24 w-16" }: { p: Project; size?: string }) {
    return (
      <div className={`relative ${size} shrink-0 overflow-hidden rounded-md border`}>
        <CoverArt info={{ titulo: p.titulo, serie: p.serie, volume: p.volume, capa: capas[p.id] ?? null }} variant="mini" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Dashboard</h1>
          <p className="mt-1 text-muted-foreground">{projects.length ? subtitulo : "Produção editorial."}</p>
        </div>
        <Button asChild>
          <Link to="/novo-projeto"><Plus className="h-4 w-4" /> Novo projeto</Link>
        </Button>
      </div>

      {projects.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed py-20 text-center">
          <BookText className="h-10 w-10 text-muted-foreground/50" />
          <p className="text-muted-foreground">Nenhum projeto ainda.</p>
          <Button asChild size="sm">
            <Link to="/novo-projeto"><Plus className="h-4 w-4" /> Criar primeiro projeto</Link>
          </Button>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <Kpi label="Livros" valor={kpis.total} Icon={BookText} />
            <Kpi label="Em produção" valor={kpis.producao} Icon={PenLine} />
            <Kpi label="Prontos" valor={kpis.prontos} Icon={CheckCircle2} />
            <Kpi label="Publicados" valor={kpis.publicados} Icon={Send} />
          </div>

          <div>
            <h2 className="mb-4 text-lg font-semibold tracking-tight">Seus projetos</h2>
            <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
              {cards.map((c) =>
                c.kind === "single" ? (
                  <div
                    key={c.project.id}
                    onClick={() => nav(`/projeto/${c.project.id}`)}
                    className="group relative flex cursor-pointer gap-4 rounded-xl border bg-card p-4 transition-shadow hover:shadow-md"
                  >
                    <MiniCapa p={c.project} />
                    <div className="min-w-0 flex-1 space-y-1.5">
                      <h3 className="line-clamp-2 pr-6 font-semibold leading-snug">{c.project.titulo}</h3>
                      <p className="text-xs text-muted-foreground">{c.project.genero ?? "—"} · {c.project.idioma_origem}</p>
                      <StatusBadge s={statusDe(c.project)} />
                      {(() => {
                        const st = estados[c.project.id];
                        const tt = c.project.total_capitulos;
                        if (!st || !tt || st.contadores.produzidos === 0) return null;
                        const { produzidos, aprovados, sincronizados, em_correcao } = st.contadores;
                        return (
                          <div className="pt-1">
                            <div className="mb-0.5 text-[11px] text-muted-foreground">
                              {produzidos} produzidos · {aprovados} aprovados · {sincronizados} sincronizados
                              {em_correcao ? ` · cap ${st.capitulo_bloqueado} em correção` : ""}
                            </div>
                            <div className="h-1 w-full overflow-hidden rounded-full bg-muted">
                              <div className="h-full bg-primary" style={{ width: `${Math.min(100, (sincronizados / tt) * 100)}%` }} />
                            </div>
                          </div>
                        );
                      })()}
                    </div>
                    <div className="absolute right-2 top-2 opacity-0 transition-opacity group-hover:opacity-100">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button onClick={(e) => e.stopPropagation()} className="rounded-md p-1.5 text-muted-foreground hover:bg-muted">
                            <MoreHorizontal className="h-4 w-4" />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                          <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => excluir(c.project)}>
                            <Trash2 className="h-4 w-4" /> Excluir projeto
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                ) : (() => {
                  const prontos = c.volumes.filter((v) => v.status === "pronto" || v.status === "publicado").length;
                  const pendente = c.volumes.find((v) => v.status !== "pronto" && v.status !== "publicado");
                  const agg = pendente ? statusDe(pendente) : null;
                  return (
                    <div key={c.serie} className="rounded-xl border bg-card p-4 sm:col-span-2 xl:col-span-1">
                      <Link to={`/projeto/${c.volumes[0].id}`} className="mb-3 flex items-center gap-2 hover:underline">
                        <Layers className="h-4 w-4 shrink-0 text-primary" />
                        <div className="min-w-0">
                          <h3 className="truncate font-semibold leading-snug">{c.serie}</h3>
                          <p className="text-xs text-muted-foreground">Saga · {c.volumes.length} volumes</p>
                        </div>
                      </Link>
                      <div className="flex gap-2.5">
                        {c.volumes.map((v) => (
                          <Link key={v.id} to={`/projeto/${v.id}`} className="group/v relative" title={`Vol. ${v.volume}: ${v.titulo}`}>
                            <MiniCapa p={v} size="h-[84px] w-14" />
                            <span className="absolute left-1 top-1 rounded bg-black/55 px-1 text-[9px] font-medium text-white">v{v.volume}</span>
                            <span className={`absolute bottom-1 right-1 h-2 w-2 rounded-full ring-1 ring-background ${corDot(statusDe(v).variant)}`} />
                          </Link>
                        ))}
                      </div>
                      <div className="mt-3">
                        <div className="mb-0.5 flex justify-between text-[11px] text-muted-foreground">
                          <span>{prontos}/{c.volumes.length} volumes prontos</span>
                        </div>
                        <div className="h-1 w-full overflow-hidden rounded-full bg-muted">
                          <div className="h-full bg-primary" style={{ width: `${(prontos / c.volumes.length) * 100}%` }} />
                        </div>
                      </div>
                      {agg && pendente && (
                        <p className="mt-2 truncate text-xs text-muted-foreground">Vol. {pendente.volume}: {agg.label}</p>
                      )}
                    </div>
                  );
                })()
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
