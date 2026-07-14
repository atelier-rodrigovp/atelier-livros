// Contrato de progresso S6/1.5 — estado vigente × histórico. Seletor PURO do job
// autoritativo de escrita de um projeto, para o resolvedor único (S7) e o worker.
// Regra: o estado de ESCRITA é governado só pelo `escrever_livro` mais recente;
// jobs de outros tipos (telemetria, qualidade_editorial, ...) nunca entram nesse
// cálculo; pausados antigos ficam preservados no histórico, mas sem autoridade.

export interface JobLite {
  id: string;
  tipo: string;
  status: string;
  created_at: string;
  progresso?: Record<string, unknown> | null;
}

export const TIPO_ESCRITA = "escrever_livro";

// Job de escrita autoritativo = escrever_livro de maior created_at (ISO comparável).
export function selecionarJobVigenteEscrita<T extends JobLite>(jobs: T[]): T | null {
  const escrita = jobs.filter((j) => j.tipo === TIPO_ESCRITA);
  if (!escrita.length) return null;
  return escrita.reduce((a, b) => (String(a.created_at) >= String(b.created_at) ? a : b));
}

// Jobs de escrita substituídos (todos os escrever_livro que não são o vigente).
// Preservados para auditoria; a UI os ignora como estado vigente.
export function jobsEscritaSubstituidos<T extends JobLite>(jobs: T[]): T[] {
  const vig = selecionarJobVigenteEscrita(jobs);
  return jobs.filter((j) => j.tipo === TIPO_ESCRITA && j.id !== vig?.id);
}

// Um job pausado antigo contamina o estado vigente? Só se for tratado como
// autoritativo. Este predicado responde "este job deve governar o estado de escrita?".
export function ehJobVigenteEscrita<T extends JobLite>(jobs: T[], jobId: string): boolean {
  return selecionarJobVigenteEscrita(jobs)?.id === jobId;
}
