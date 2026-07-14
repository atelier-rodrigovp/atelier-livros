import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { workerOnline } from "@/lib/status";
import type { WorkerHeartbeat } from "@/lib/types";

// Lê o último heartbeat do worker (online/offline) e o controle GLOBAL de
// produção (worker_control.enabled) — o resolvedor distingue "worker vivo" de
// "produção habilitada" (SG6: producao_desativada é um estado próprio).
export function useWorkerStatus(pollMs = 30_000) {
  const [hb, setHb] = useState<WorkerHeartbeat | null>(null);
  const [producaoAtiva, setProducaoAtiva] = useState(true);

  useEffect(() => {
    let ativo = true;
    async function buscar() {
      const [{ data }, { data: ctrl }] = await Promise.all([
        supabase
          .from("worker_heartbeats")
          .select("*")
          .order("last_seen", { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase.from("worker_control").select("enabled").maybeSingle(),
      ]);
      if (ativo) {
        setHb((data as WorkerHeartbeat) ?? null);
        setProducaoAtiva((ctrl as { enabled?: boolean } | null)?.enabled !== false);
      }
    }
    buscar();
    const id = setInterval(buscar, pollMs);
    return () => {
      ativo = false;
      clearInterval(id);
    };
  }, [pollMs]);

  return { heartbeat: hb, online: workerOnline(hb), producaoAtiva };
}
