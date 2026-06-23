import { useCallback, useEffect, useState } from "react";
import { Activity, Loader2, Power, Send } from "lucide-react";
import { toast } from "sonner";
import { useSession } from "@/hooks/useSession";
import { useWorkerStatus } from "@/hooks/useWorkerStatus";
import { enqueueJob, supabase } from "@/lib/supabase";
import { jobStatusBadge } from "@/lib/status";
import { cn } from "@/lib/utils";
import type { Job } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function Configuracoes() {
  const { session } = useSession();
  const { heartbeat, online } = useWorkerStatus(10_000);
  const [enviando, setEnviando] = useState(false);
  const [ativo, setAtivo] = useState(true);
  const [salvandoCtl, setSalvandoCtl] = useState(false);
  const [jobs, setJobs] = useState<Job[]>([]);

  const carregarControle = useCallback(async () => {
    const { data } = await supabase
      .from("worker_control")
      .select("enabled")
      .maybeSingle();
    setAtivo(data ? data.enabled !== false : true);
  }, []);

  const carregarJobs = useCallback(async () => {
    const { data } = await supabase
      .from("jobs")
      .select("*")
      .neq("tipo", "controle_escrita")
      .order("created_at", { ascending: false })
      .limit(30);
    setJobs((data as Job[]) ?? []);
  }, []);

  useEffect(() => {
    carregarControle();
    carregarJobs();
    const ch = supabase
      .channel("config-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "worker_control" }, () => carregarControle())
      .on("postgres_changes", { event: "*", schema: "public", table: "jobs" }, () => carregarJobs())
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [carregarControle, carregarJobs]);

  async function alternarProducao(novo: boolean) {
    setSalvandoCtl(true);
    setAtivo(novo); // otimista
    const { error } = await supabase
      .from("worker_control")
      .upsert(
        { enabled: novo, updated_at: new Date().toISOString() },
        { onConflict: "owner" }
      );
    setSalvandoCtl(false);
    if (error) {
      setAtivo(!novo);
      toast.error(error.message);
    } else {
      toast.success(novo ? "Produção ligada — o worker vai processar a fila." : "Produção desligada — o worker fica ocioso.");
    }
  }

  async function testarWorker() {
    setEnviando(true);
    try {
      await enqueueJob("ping", { origem: "configuracoes" });
      toast.success("Job de teste enfileirado. O worker deve concluí-lo.");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setEnviando(false);
    }
  }

  // Estado consolidado: produzindo / pausado / parado.
  const estado = !online ? "parado" : ativo ? "produzindo" : "pausado";
  const produzindo = estado === "produzindo";
  const cfg = {
    produzindo: { cor: "bg-emerald-500", texto: "Produzindo", pulse: true },
    pausado: { cor: "bg-amber-500", texto: "Pausado", pulse: false },
    parado: { cor: "bg-muted-foreground/40", texto: "Parado", pulse: false },
  }[estado];

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Configurações</h1>
        <p className="mt-1 text-muted-foreground">Perfil, worker e atividade.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-xl">Conta</CardTitle>
          <CardDescription>Usuário autenticado (single-user).</CardDescription>
        </CardHeader>
        <CardContent className="space-y-1 text-sm">
          <p>
            <span className="text-muted-foreground">E-mail: </span>
            {session?.user?.email}
          </p>
          <p className="break-all">
            <span className="text-muted-foreground">UID: </span>
            {session?.user?.id}
          </p>
        </CardContent>
      </Card>

      {/* Worker: controle 100% pelo app (via worker_control). Sem terminal. */}
      <Card>
        <CardHeader>
          <CardTitle className="text-xl">Worker</CardTitle>
          <CardDescription>
            Liga, pausa e acompanha a produção da IA — tudo por aqui.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="flex items-center gap-2.5">
            <span className={cn("inline-block h-3 w-3 rounded-full", cfg.cor, cfg.pulse && "animate-pulse")} />
            <span className="text-lg font-medium">{cfg.texto}</span>
            {heartbeat?.last_seen && (
              <span className="text-sm text-muted-foreground">
                · último sinal {new Date(heartbeat.last_seen).toLocaleString()}
              </span>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Button
              size="lg"
              variant={produzindo ? "outline" : "default"}
              disabled={salvandoCtl}
              onClick={() => alternarProducao(!produzindo)}
            >
              {salvandoCtl ? <Loader2 className="h-4 w-4 animate-spin" /> : <Power className="h-4 w-4" />}
              {produzindo ? "Desligar produção" : "Ligar produção"}
            </Button>
            <Button onClick={testarWorker} disabled={enviando} variant="ghost">
              {enviando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              Rodar teste (ping)
            </Button>
          </div>

          {estado === "parado" ? (
            <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-700 dark:text-amber-400">
              O worker não está em execução nesta máquina. Inicie o worker uma vez para que o app passe a
              controlá-lo.
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">
              {estado === "produzindo"
                ? "O worker está em execução e processando a fila. Você pode desligar a produção a qualquer momento — ele fica ocioso, sem fechar."
                : "Produção pausada: o worker continua em execução, mas não processa a fila. Religue quando quiser retomar."}
            </p>
          )}

          <p className="border-t pt-4 text-xs text-muted-foreground">
            O worker roda de forma residente na sua máquina. Uma vez em execução, ligar, desligar, pausar e
            acompanhar o status passam a ser 100% por aqui — não precisa de terminal.
          </p>
        </CardContent>
      </Card>

      {/* Atividade técnica (histórico de jobs). */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-xl">
            <Activity className="h-5 w-5 text-primary" />
            Atividade
          </CardTitle>
          <CardDescription>Últimos jobs processados pelo worker.</CardDescription>
        </CardHeader>
        <CardContent>
          {jobs.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Sem atividade ainda.</p>
          ) : (
            <ul className="divide-y text-sm">
              {jobs.map((j) => {
                const b = jobStatusBadge(j.status);
                return (
                  <li key={j.id} className="flex items-center justify-between gap-3 py-2">
                    <div className="min-w-0">
                      <span className="font-mono text-xs">{j.tipo}</span>
                      {j.erro && (
                        <p className="truncate text-xs text-destructive" title={j.erro}>{j.erro}</p>
                      )}
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <span className="hidden text-xs text-muted-foreground sm:inline">
                        {new Date(j.created_at).toLocaleString()}
                      </span>
                      <Badge variant={b.variant}>{b.label}</Badge>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
