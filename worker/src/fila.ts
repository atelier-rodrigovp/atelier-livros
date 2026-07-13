// Lógica PURA de seleção da fila pesada (testável sem rede). Controles de produção:
// prioridade por projeto, pausa por projeto e concorrência (nunca 2 jobs do MESMO
// projeto em paralelo). Prioridade/pausa vivem em projects.briefing (schema-free).

export interface JobFila {
  id: string;
  project_id: string | null;
  created_at?: string;
  progresso?: { retry_at?: string | null } | null;
}

export interface ProjInfo { prioridade: number; pausada: boolean }

// Anti-starvation (auditoria F-10): sem envelhecimento, um projeto com
// prioridade>0 alimentado continuamente ("Produzir agora" seta max+1) deixaria
// jobs de prioridade 0 na fila para sempre. Cada 24h de espera vale +1 de
// prioridade efetiva — a fila continua respeitando urgência, mas nenhum job
// morre de fome.
export const AGING_MS_POR_PONTO = 24 * 60 * 60 * 1000;

export function prioridadeEfetiva(prioridade: number, createdAt: string | undefined, agora: number): number {
  const t = createdAt ? Date.parse(createdAt) : NaN;
  const bonus = Number.isNaN(t) ? 0 : Math.max(0, Math.floor((agora - t) / AGING_MS_POR_PONTO));
  return prioridade + bonus;
}

// Escolhe o PRÓXIMO job pesado elegível, ordenado por prioridade efetiva DESC
// (prioridade do projeto + aging) e, no empate, created_at ASC. Pula: jobs
// aguardando reset do Max (retry_at futuro), projetos com produção pausada, e
// projetos JÁ em execução (exclusão de concorrência).
export function escolherProximo(
  candidatos: JobFila[],
  proj: Map<string, ProjInfo>,
  projetosRodando: Set<string>,
  agora: number = Date.now()
): JobFila | null {
  const prio = (j: JobFila) =>
    prioridadeEfetiva(j.project_id ? proj.get(j.project_id)?.prioridade ?? 0 : 0, j.created_at, agora);
  const elegiveis = (candidatos ?? []).filter((j) => {
    const ra = j.progresso?.retry_at;
    if (ra && !Number.isNaN(Date.parse(ra)) && Date.parse(ra) > agora) return false; // aguardando reset
    if (j.project_id && projetosRodando.has(j.project_id)) return false;              // concorrência: mesmo projeto não 2×
    if (j.project_id && proj.get(j.project_id)?.pausada) return false;                // produção do projeto pausada
    return true;
  });
  if (!elegiveis.length) return null;
  elegiveis.sort((a, b) => {
    const d = prio(b) - prio(a);            // prioridade efetiva DESC (com aging)
    if (d !== 0) return d;
    return (a.created_at ?? "").localeCompare(b.created_at ?? ""); // empate: mais antigo
  });
  return elegiveis[0];
}

// Normaliza o nº de projetos simultâneos (config), com piso 1 e teto de segurança.
export function normalizarMaxParalelo(valor: unknown, teto = 4): number {
  const n = Number(valor);
  if (!Number.isFinite(n)) return 1;
  return Math.max(1, Math.min(teto, Math.floor(n)));
}
