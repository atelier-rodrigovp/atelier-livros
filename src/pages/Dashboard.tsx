import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { BookOpen, ListChecks, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/lib/supabase";
import type { Job, Project } from "@/lib/types";
import { jobStatusBadge, projectStatusBadge } from "@/lib/status";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function Dashboard() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);

  const carregarProjetos = useCallback(async () => {
    const { data } = await supabase
      .from("projects")
      .select("*")
      .order("created_at", { ascending: false });
    setProjects((data as Project[]) ?? []);
  }, []);

  useEffect(() => {
    carregarProjetos();
    supabase
      .from("jobs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(20)
      .then(({ data }) => setJobs((data as Job[]) ?? []));

    // Realtime: status dos jobs ao vivo (Seção 9 do spec)
    const ch = supabase
      .channel("dashboard-jobs")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "jobs" },
        (payload) => {
          setJobs((prev) => {
            const row = payload.new as Job;
            if (payload.eventType === "DELETE") {
              return prev.filter((j) => j.id !== (payload.old as Job).id);
            }
            const i = prev.findIndex((j) => j.id === row.id);
            if (i === -1) return [row, ...prev].slice(0, 20);
            const copy = [...prev];
            copy[i] = row;
            return copy;
          });
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [carregarProjetos]);

  const ativos = jobs.filter(
    (j) => j.status === "queued" || j.status === "running"
  );

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Dashboard</h1>
          <p className="mt-1 text-muted-foreground">
            Visão geral da produção editorial.
          </p>
        </div>
        <Button asChild>
          <Link to="/novo-projeto">
            <Plus className="h-4 w-4" />
            Novo projeto
          </Link>
        </Button>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-xl">
              <BookOpen className="h-5 w-5 text-primary" />
              Projetos
            </CardTitle>
            <CardDescription>{projects.length} no total</CardDescription>
          </CardHeader>
          <CardContent>
            {projects.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                Nenhum projeto ainda. Crie o primeiro com “Novo projeto”.
              </p>
            ) : (
              <ul className="divide-y">
                {projects.map((p) => {
                  const b = projectStatusBadge(p.status);
                  return (
                    <li
                      key={p.id}
                      className="flex items-center justify-between gap-4 py-3"
                    >
                      <Link
                        to={`/projeto/${p.id}`}
                        className="min-w-0 flex-1 truncate font-medium hover:underline"
                      >
                        {p.titulo}
                      </Link>
                      <span className="text-sm text-muted-foreground">
                        {p.genero ?? "—"}
                      </span>
                      <Badge variant={b.variant}>{b.label}</Badge>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-xl">
              <ListChecks className="h-5 w-5 text-primary" />
              Jobs ativos
            </CardTitle>
            <CardDescription>
              {ativos.length} na fila / em execução
            </CardDescription>
          </CardHeader>
          <CardContent>
            {jobs.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                Sem jobs.
              </p>
            ) : (
              <ul className="space-y-2">
                {jobs.slice(0, 8).map((j) => {
                  const b = jobStatusBadge(j.status);
                  return (
                    <li
                      key={j.id}
                      className="flex items-center justify-between gap-2 text-sm"
                    >
                      <span className="truncate font-mono text-xs">
                        {j.tipo}
                      </span>
                      <Badge variant={b.variant}>{b.label}</Badge>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
