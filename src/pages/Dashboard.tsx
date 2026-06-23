import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { BookText, Layers, MoreHorizontal, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { supabase } from "@/lib/supabase";
import { deleteProject } from "@/lib/storage";
import { useWorkerStatus } from "@/hooks/useWorkerStatus";
import type { Project } from "@/lib/types";
import { displayProjectStatus } from "@/lib/status";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type BadgeVariant = "default" | "secondary" | "destructive" | "outline" | "success" | "warning";
type Derivado = { label: string; variant: BadgeVariant; pulse: boolean };

// Badge de status com ponto pulsante quando a escrita está realmente ativa.
function StatusBadge({ s, className }: { s: Derivado; className?: string }) {
  return (
    <Badge variant={s.variant} className={className}>
      {s.pulse && <span className="mr-1.5 inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-current" />}
      {s.label}
    </Badge>
  );
}

function MiniProgresso({ feitos, total }: { feitos: number; total: number | null }) {
  if (!feitos || !total) return null;
  const pct = Math.min(100, Math.round((feitos / total) * 100));
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>{feitos}/{total} capítulos</span>
        <span className="tabular-nums">{pct}%</span>
      </div>
      <div className="h-1 w-full overflow-hidden rounded-full bg-muted">
        <div className="h-full bg-primary transition-all" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export default function Dashboard() {
  const nav = useNavigate();
  const { online } = useWorkerStatus(15_000);
  const [projects, setProjects] = useState<Project[]>([]);
  const [feitos, setFeitos] = useState<Record<string, number>>({});
  const [ativos, setAtivos] = useState<Set<string>>(new Set());

  const carregar = useCallback(async () => {
    const [{ data: projs }, { data: eds }, { data: chs }, { data: jobsAtivos }] = await Promise.all([
      supabase.from("projects").select("*").order("created_at", { ascending: false }),
      supabase.from("editions").select("id,project_id,is_origem"),
      supabase.from("chapters").select("edition_id"),
      supabase.from("jobs").select("project_id").in("status", ["queued", "running"]).neq("tipo", "controle_escrita"),
    ]);
    setProjects((projs as Project[]) ?? []);

    const origemEd: Record<string, string> = {};
    for (const e of (eds as { id: string; project_id: string; is_origem: boolean }[]) ?? []) {
      if (e.is_origem) origemEd[e.project_id] = e.id;
    }
    const porEd: Record<string, number> = {};
    for (const c of (chs as { edition_id: string }[]) ?? []) porEd[c.edition_id] = (porEd[c.edition_id] ?? 0) + 1;
    const f: Record<string, number> = {};
    for (const [pid, edid] of Object.entries(origemEd)) f[pid] = porEd[edid] ?? 0;
    setFeitos(f);

    setAtivos(new Set(((jobsAtivos as { project_id: string | null }[]) ?? []).map((j) => j.project_id).filter(Boolean) as string[]));
  }, []);

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

  const statusDe = useCallback(
    (p: Project): Derivado =>
      displayProjectStatus({ projectStatus: p.status, hasActiveJob: ativos.has(p.id), workerOnline: online }),
    [ativos, online]
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

  // Agrupa volumes de uma mesma série num único card (só na UI; não toca o banco).
  type CardItem = { kind: "single"; project: Project } | { kind: "saga"; serie: string; volumes: Project[] };
  const cards = useMemo<CardItem[]>(() => {
    const out: CardItem[] = [];
    const idx: Record<string, number> = {};
    for (const p of projects) {
      if (p.serie) {
        if (idx[p.serie] === undefined) {
          idx[p.serie] = out.length;
          out.push({ kind: "saga", serie: p.serie, volumes: [p] });
        } else {
          (out[idx[p.serie]] as { volumes: Project[] }).volumes.push(p);
        }
      } else {
        out.push({ kind: "single", project: p });
      }
    }
    for (const c of out) if (c.kind === "saga") c.volumes.sort((a, b) => (a.volume ?? 0) - (b.volume ?? 0));
    return out;
  }, [projects]);

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Dashboard</h1>
          <p className="mt-1 text-muted-foreground">
            {projects.length} {projects.length === 1 ? "projeto" : "projetos"} · produção editorial.
          </p>
        </div>
        <Button asChild>
          <Link to="/novo-projeto">
            <Plus className="h-4 w-4" />
            Novo projeto
          </Link>
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
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {cards.map((c) =>
            c.kind === "single" ? (
              <div
                key={c.project.id}
                onClick={() => nav(`/projeto/${c.project.id}`)}
                className="group relative cursor-pointer rounded-xl border bg-card p-5 transition-shadow hover:shadow-md"
              >
                <div className="absolute right-2 top-2 opacity-0 transition-opacity group-hover:opacity-100">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        onClick={(e) => e.stopPropagation()}
                        className="rounded-md p-1.5 text-muted-foreground hover:bg-muted"
                        title="Mais ações"
                      >
                        <MoreHorizontal className="h-4 w-4" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                      <DropdownMenuItem
                        className="text-destructive focus:text-destructive"
                        onClick={() => excluir(c.project)}
                      >
                        <Trash2 className="h-4 w-4" /> Excluir projeto
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
                <div className="space-y-3">
                  <div className="space-y-1 pr-6">
                    <h3 className="line-clamp-2 font-semibold leading-snug">{c.project.titulo}</h3>
                    <p className="text-xs text-muted-foreground">
                      {c.project.genero ?? "—"} · {c.project.idioma_origem}
                    </p>
                  </div>
                  <StatusBadge s={statusDe(c.project)} />
                  <MiniProgresso feitos={feitos[c.project.id] ?? 0} total={c.project.total_capitulos} />
                </div>
              </div>
            ) : (
              <div key={c.serie} className="relative rounded-xl border bg-card p-5 sm:col-span-2 lg:col-span-1">
                <div className="mb-3 flex items-center gap-2">
                  <Layers className="h-4 w-4 text-primary" />
                  <div className="min-w-0">
                    <h3 className="truncate font-semibold leading-snug">{c.serie}</h3>
                    <p className="text-xs text-muted-foreground">
                      Saga · {c.volumes.length} {c.volumes.length === 1 ? "volume" : "volumes"}
                      {c.volumes.length > 1 ? ` (Vol. ${c.volumes[0].volume}–${c.volumes[c.volumes.length - 1].volume})` : ""}
                    </p>
                  </div>
                </div>
                <ul className="space-y-1.5">
                  {c.volumes.map((v) => (
                    <li key={v.id}>
                      <Link
                        to={`/projeto/${v.id}`}
                        className="flex items-center gap-2 rounded-lg px-2 py-1.5 transition-colors hover:bg-muted"
                      >
                        <span className="w-7 shrink-0 text-center text-xs font-medium tabular-nums text-muted-foreground">
                          v{v.volume}
                        </span>
                        <span className="min-w-0 flex-1 truncate text-sm">{v.titulo}</span>
                        <StatusBadge s={statusDe(v)} className="shrink-0" />
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            )
          )}
        </div>
      )}
    </div>
  );
}
