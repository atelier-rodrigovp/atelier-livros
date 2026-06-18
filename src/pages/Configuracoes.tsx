import { useCallback, useEffect, useState } from "react";
import { Loader2, Send } from "lucide-react";
import { toast } from "sonner";
import { useSession } from "@/hooks/useSession";
import { useWorkerStatus } from "@/hooks/useWorkerStatus";
import { enqueueJob, supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
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

  const carregarControle = useCallback(async () => {
    const { data } = await supabase
      .from("worker_control")
      .select("enabled")
      .maybeSingle();
    setAtivo(data ? data.enabled !== false : true);
  }, []);

  useEffect(() => {
    carregarControle();
    const ch = supabase
      .channel("worker-control")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "worker_control" },
        () => carregarControle()
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [carregarControle]);

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
        novo ? "Worker ativado — vai processar a fila." : "Worker pausado — novos jobs ficam na fila."
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

  const pausado = online && !ativo;

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Configurações</h1>
        <p className="mt-1 text-muted-foreground">
          Perfil, saúde do worker e diagnósticos.
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

      <Card>
        <CardHeader>
          <CardTitle className="text-xl">Worker</CardTitle>
          <CardDescription>
            O agent-worker local executa a IA via fila de jobs.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="flex items-center gap-2 text-sm">
            <span
              className={cn(
                "inline-block h-2.5 w-2.5 rounded-full",
                online
                  ? pausado
                    ? "bg-amber-500"
                    : "bg-emerald-500"
                  : "bg-muted-foreground/40"
              )}
            />
            <span className="font-medium">
              {online ? (pausado ? "Online (pausado)" : "Online") : "Offline"}
            </span>
            {heartbeat?.last_seen && (
              <span className="text-muted-foreground">
                · último sinal {new Date(heartbeat.last_seen).toLocaleString()}
              </span>
            )}
          </div>

          <div className="flex items-center justify-between rounded-lg border p-4">
            <div className="space-y-0.5 pr-4">
              <p className="text-sm font-medium">Processar jobs</p>
              <p className="text-xs text-muted-foreground">
                Liga/pausa o processamento da fila pelo worker. Pausado, novos
                jobs aguardam. O processo do worker precisa estar rodando na sua
                máquina (offline = nada processa).
              </p>
            </div>
            <Switch
              checked={ativo}
              onCheckedChange={alternar}
              disabled={salvandoCtl}
              aria-label="Ativar ou pausar o processamento de jobs"
            />
          </div>

          <Button onClick={testarWorker} disabled={enviando} variant="outline">
            {enviando ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
            Enfileirar job de teste (ping)
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
