import { useState } from "react";
import { Loader2, Send } from "lucide-react";
import { toast } from "sonner";
import { useSession } from "@/hooks/useSession";
import { useWorkerStatus } from "@/hooks/useWorkerStatus";
import { enqueueJob } from "@/lib/supabase";
import { cn } from "@/lib/utils";
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
        <CardContent className="space-y-4">
          <div className="flex items-center gap-2 text-sm">
            <span
              className={cn(
                "inline-block h-2.5 w-2.5 rounded-full",
                online ? "bg-emerald-500" : "bg-muted-foreground/40"
              )}
            />
            <span className="font-medium">
              {online ? "Online" : "Offline"}
            </span>
            {heartbeat?.last_seen && (
              <span className="text-muted-foreground">
                · último sinal {new Date(heartbeat.last_seen).toLocaleString()}
              </span>
            )}
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
