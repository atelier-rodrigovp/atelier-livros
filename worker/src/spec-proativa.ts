// Spec proativa — decide, ao FECHAR um capitulo (fim do micro-loop
// escritor->revisor->editor), se cabe pedir a MESMA materializacao de
// `specs/Spec-Capitulo-NN.md` (formato ja injetado no livro-editor por
// exigencias-skill.ts) para o PROXIMO capitulo, no MESMO Task de fechamento —
// em vez de esperar o GATE SPEC reativo (gate_spec_capitulo, em livro_runner.py)
// descobrir a ausencia so quando o runner ja decidiu escrever aquele capitulo.
//
// PORQUE aqui e nao "no inicio do ciclo N+1": entre aceitar a revisao de N (o
// runner marca _revcap-NN.done) e checar gate_spec_capitulo(N+1), NAO ha
// nenhuma chamada ao Claude — e o MESMO loop Python sincrono (livro_runner.py,
// fase ESCRITA), sem `run_claude` no meio. Pedir a spec "antes do gate rodar"
// exigiria OUTRA chamada headless bem ali, que E EXATAMENTE o caminho reativo
// (prompt_gerar_spec) que este fix existe para deixar de acionar na maioria
// dos casos. O UNICO ponto onde da pra injetar a instrucao dentro de uma
// chamada que ja vai acontecer e o Task->livro-editor que fecha o capitulo N
// — o MESMO Task que ja edita estado/estado-narrativo.md (prompt_revisao_capitulo,
// step 2). O livro-editor ja tem o bloco "## SPEC COMPLETA" (MARCADOR_SPEC_COMPLETA)
// no proprio system prompt (injetado por exigencias-skill.ts); faltava so o
// orquestrador PEDIR para ele usar isso AGORA, nao "antes de cada capitulo" em
// abstrato (o que, sem o gate reativo forcar, nunca chegava a acontecer).
//
// Este modulo e a logica PURA/testavel (decisao "pedir ou nao, para qual
// capitulo" + simulacao do eixo existencia/completude do gate, para provar a
// interacao happy-path / falha / no-op). O texto do prompt real e a montagem
// completa de gate_spec_capitulo (rotacao de fio, aritmetica de dia/hora)
// permanecem SO no runner Python — este modulo espelha apenas a fatia que o
// fix toca. Mesmo padrao de par TS-testado + espelho Python de review-incremental.ts.
import { exigenciasParaSkill } from "./exigencias-skill.js";

/** true se a skill tem exigencia de SPEC COMPLETA (mesma fonte do gate reativo). */
export function skillExigeSpec(skill: string | undefined | null): boolean {
  return exigenciasParaSkill(skill) != null;
}

/**
 * Decide o capitulo-ALVO da materializacao proativa ao FECHAR `capituloFechado`
 * (aceitar a revisao dele, fim do micro-loop). null = nao cabe pedir: skill sem
 * exigencia (no-op, como todo o resto do mecanismo), ou nao ha proximo capitulo
 * dentro do livro (capituloFechado e o ultimo previsto).
 */
export function proximaSpecAlvo(
  skill: string | undefined | null,
  capituloFechado: number,
  total: number,
): number | null {
  if (!skillExigeSpec(skill)) return null;
  const proximo = capituloFechado + 1;
  if (proximo < 1 || proximo > total) return null;
  return proximo;
}

/**
 * Espelha SO o eixo existencia/completude do inicio de `gate_spec_capitulo`
 * (livro_runner.py): spec ausente, ou faltando campo(s) exigido(s) -> motivo
 * (string); presente e completa -> null (gate passaria nesse eixo). Rotacao de
 * fio e aritmetica de dia/hora NAO sao replicadas aqui — inalteradas pelo fix,
 * seguem sendo verificadas so no runner Python.
 */
export function gateSpecExistenciaSimulado(
  specTexto: string | null | undefined,
  camposExigidos: string[],
): string | null {
  if (specTexto == null) return "spec ausente";
  // Marcas diacriticas combinantes (U+0300-U+036F), construidas por codigo (String.fromCharCode)
  // para evitar caractere combinante literal solto no arquivo-fonte.
  const DIACRITICOS = new RegExp("[" + String.fromCharCode(0x0300) + "-" + String.fromCharCode(0x036f) + "]", "g");
  const norm = (s: string) => s.normalize("NFKD").replace(DIACRITICOS, "").toLowerCase();
  const alvo = norm(specTexto);
  const faltam = camposExigidos.filter((c) => !alvo.includes(norm(c)));
  if (faltam.length) return `spec sem campo(s): ${faltam.join(", ")}`;
  return null;
}
