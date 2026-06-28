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

// Escolhe o PRÓXIMO job pesado elegível, ordenado por prioridade DESC e, no empate,
// created_at ASC. Pula: jobs aguardando reset do Max (retry_at futuro), projetos
// com produção pausada, e projetos JÁ em execução (exclusão de concorrência).
export function escolherProximo(
  candidatos: JobFila[],
  proj: Map<string, ProjInfo>,
  projetosRodando: Set<string>,
  agora: number = Date.now()
): JobFila | null {
  const prio = (j: JobFila) => (j.project_id ? proj.get(j.project_id)?.prioridade ?? 0 : 0);
  const elegiveis = (candidatos ?? []).filter((j) => {
    const ra = j.progresso?.retry_at;
    if (ra && !Number.isNaN(Date.parse(ra)) && Date.parse(ra) > agora) return false; // aguardando reset
    if (j.project_id && projetosRodando.has(j.project_id)) return false;              // concorrência: mesmo projeto não 2×
    if (j.project_id && proj.get(j.project_id)?.pausada) return false;                // produção do projeto pausada
    return true;
  });
  if (!elegiveis.length) return null;
  elegiveis.sort((a, b) => {
    const d = prio(b) - prio(a);            // prioridade DESC
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
