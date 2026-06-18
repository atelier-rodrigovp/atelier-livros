import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { workerOnline } from "@/lib/status";
import type { WorkerHeartbeat } from "@/lib/types";

// Lê o último heartbeat do worker para indicar online/offline no painel.
export function useWorkerStatus(pollMs = 30_000) {
  const [hb, setHb] = useState<WorkerHeartbeat | null>(null);

  useEffect(() => {
    let ativo = true;
    async function buscar() {
      const { data } = await supabase
        .from("worker_heartbeats")
        .select("*")
        .order("last_seen", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (ativo) setHb((data as WorkerHeartbeat) ?? null);
    }
    buscar();
    const id = setInterval(buscar, pollMs);
    return () => {
      ativo = false;
      clearInterval(id);
    };
  }, [pollMs]);

  return { heartbeat: hb, online: workerOnline(hb) };
}
