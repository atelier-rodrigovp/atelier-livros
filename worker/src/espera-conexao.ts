// Startup resiliente: espera a conexão ficar disponível SEM derrubar o processo.
// Motivo: no boot com rede atrasada (logon dispara a task antes do Wi-Fi subir),
// uma única falha transitória matava o worker via exit(1) e nada o reerguia —
// produção parada em silêncio. Aqui o daemon espera para sempre, logando a causa
// original (URL/credencial errada continua diagnosticável pelo log periódico).

export interface EsperaOpts {
  sleepMs?: number;
  logCadaN?: number; // loga a 1ª falha e depois a cada N tentativas (~1×/min com 5s)
  log?: (msg: string) => void;
  dormir?: (ms: number) => Promise<void>;
}

export async function aguardarConexao(
  verificar: () => Promise<void>,
  opts: EsperaOpts = {}
): Promise<number> {
  const sleepMs = opts.sleepMs ?? 5000;
  const logCadaN = opts.logCadaN ?? 12;
  const log = opts.log ?? ((m) => console.error(m));
  const dormir = opts.dormir ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  for (let tentativa = 1; ; tentativa++) {
    try {
      await verificar();
      return tentativa;
    } catch (e: unknown) {
      const msg = String((e as { message?: unknown })?.message ?? e);
      if (tentativa === 1 || tentativa % logCadaN === 0) {
        log(`[worker] aguardando rede/Supabase (tentativa ${tentativa}): ${msg}`);
      }
      await dormir(sleepMs);
    }
  }
}
