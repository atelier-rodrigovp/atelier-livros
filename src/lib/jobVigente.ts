// Contrato de progresso S6/1.5 (frontend) — porte de worker/src/job-vigente.ts.
// Seletor PURO do job de escrita autoritativo: escrever_livro de maior created_at.
// Jobs de outros tipos e pausados antigos NÃO governam o estado de escrita.
// Tipo LARGO de propósito: o banco tem tipos (telemetria, config_producao...) que
// não estão no enum JobTipo do frontend — o seletor recebe jobs crus.
export const TIPO_ESCRITA = "escrever_livro";

export interface JobIdent {
  id: string;
  tipo: string;
  created_at: string;
}

export function selecionarJobVigenteEscrita<T extends JobIdent>(jobs: T[]): T | null {
  const escrita = jobs.filter((j) => j.tipo === TIPO_ESCRITA);
  if (!escrita.length) return null;
  return escrita.reduce((a, b) => (String(a.created_at) >= String(b.created_at) ? a : b));
}

export function jobsEscritaSubstituidos<T extends JobIdent>(jobs: T[]): T[] {
  const vig = selecionarJobVigenteEscrita(jobs);
  return jobs.filter((j) => j.tipo === TIPO_ESCRITA && j.id !== vig?.id);
}

export function ehJobVigenteEscrita<T extends JobIdent>(jobs: T[], jobId: string): boolean {
  return selecionarJobVigenteEscrita(jobs)?.id === jobId;
}
