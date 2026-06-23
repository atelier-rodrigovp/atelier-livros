import { useCallback, useEffect, useState } from "react";
import { Activity, AlertTriangle, Loader2, Send } from "lucide-react";
import { toast } from "sonner";
import { useSession } from "@/hooks/useSession";
import { useWorkerStatus } from "@/hooks/useWorkerStatus";
import { enqueueJob, supabase } from "@/lib/supabase";
import { jobStatusBadge } from "@/lib/status";
import { cn } from "@/lib/utils";
import type { Job } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
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

  async function alternar(novo: boolean) {
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
      toast.success(
        novo ? "Fila ativada — o worker vai processar os jobs." : "Fila pausada — novos jobs aguardam."
      );
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

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Configurações</h1>
        <p className="mt-1 text-muted-foreground">
          Perfil, worker e atividade.
        </p>
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

      {/* 1) O worker é um PROGRAMA na sua máquina (online/offline). A web não o liga. */}
      <Card>
        <CardHeader>
          <CardTitle className="text-xl">Status do worker</CardTitle>
          <CardDescription>
            O worker é um programa que roda na sua máquina e executa a IA. Este painel não o inicia.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-2 text-sm">
            <span
              className={cn(
                "inline-block h-3 w-3 rounded-full",
                online ? "bg-emerald-500" : "bg-muted-foreground/40"
              )}
            />
            <span className="text-base font-medium">{online ? "Online" : "Offline"}</span>
            {heartbeat?.last_seen && (
              <span className="text-muted-foreground">
                · último sinal {new Date(heartbeat.last_seen).toLocaleString()}
              </span>
            )}
          </div>

          {!online && (
            <div className="space-y-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-4 text-sm">
              <div className="flex items-center gap-2 font-medium text-amber-700 dark:text-amber-400">
                <AlertTriangle className="h-4 w-4" />
                O worker não está rodando na sua máquina.
              </div>
              <p className="text-muted-foreground">
                Sem ele, nada é processado (escrita, traduções, capas). Para iniciar, abra um terminal na
                pasta do projeto e rode:
              </p>
              <pre className="overflow-x-auto rounded-md bg-muted px-3 py-2 font-mono text-xs">
                cd worker{"\n"}npm install   # só na primeira vez{"\n"}npm run dev
              </pre>
              <p className="text-xs text-muted-foreground">
                No Windows, ele também pode subir sozinho pela Tarefa Agendada <code>AtelierWorker</code>
                {" "}(ao logar). Deixe o terminal/processo aberto enquanto estiver produzindo.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 2) A web só liga/pausa a FILA — e isso só tem efeito com o worker online. */}
      <Card>
        <CardHeader>
          <CardTitle className="text-xl">Processar fila de jobs</CardTitle>
          <CardDescription>
            Liga/pausa o consumo da fila pelo worker. Só tem efeito quando o worker está online.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className={cn("flex items-center justify-between rounded-lg border p-4", !online && "opacity-60")}>
            <div className="space-y-0.5 pr-4">
              <p className="text-sm font-medium">Processar fila</p>
              <p className="text-xs text-muted-foreground">
                {online
                  ? "Pausado, novos jobs aguardam na fila sem serem executados."
                  : "Indisponível: o worker está offline. Inicie o worker para a fila ter efeito."}
              </p>
            </div>
            <Switch
              checked={ativo}
              onCheckedChange={alternar}
              disabled={salvandoCtl || !online}
              aria-label="Ativar ou pausar o processamento da fila"
            />
          </div>

          <Button onClick={testarWorker} disabled={enviando} variant="outline">
            {enviando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            Enfileirar job de teste (ping)
          </Button>

          <p className="text-xs text-muted-foreground">
            Como funciona: o worker é um programa local; este painel só liga/pausa a fila. Para ligar/desligar
            o worker de fato, é o processo na sua máquina (ver “Status do worker”).
          </p>
        </CardContent>
      </Card>

      {/* 3) Atividade técnica (antes ficava no Dashboard). */}
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
