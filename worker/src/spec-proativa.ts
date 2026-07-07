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
 * Campos obrigatorios da spec para a skill — MESMA fonte do gate reativo
 * (camposSpec em exigencias-skill.ts). [] para skill sem exigencia. Nao duplica a
 * lista em lugar nenhum: e o unico ponto onde o fix le "quais campos".
 */
export function camposObrigatoriosSpec(skill: string | undefined | null): string[] {
  return exigenciasParaSkill(skill)?.camposSpec ?? [];
}

/**
 * Instrucao EXPLICITA para a materializacao proativa (Task->livro-editor que fecha o
 * capitulo N): enumera os campos que a spec do PROXIMO capitulo DEVE conter PREENCHIDOS
 * com conteudo real — nao so o cabecalho vazio. Producao (caps 34/35 do Indice) mostrou o
 * editor materializando a spec faltando 2/3 campos ("Fio de POV", "Decisao/Acao") quando o
 * orquestrador so REFERENCIAVA o formato "SPEC COMPLETA" em abstrato; enumerar os campos
 * aqui vira um checklist duro. Reusa camposSpec (a lista vive so em exigencias-skill.ts); o
 * FORMATO de cada campo segue no bloco SPEC-COMPLETA do system prompt do editor (nao repete
 * aqui). "" para skill sem exigencia (no-op, como todo o mecanismo).
 */
export function instrucaoCamposProativa(skill: string | undefined | null): string {
  const campos = camposObrigatoriosSpec(skill);
  if (!campos.length) return "";
  return (
    "A spec DEVE conter, CADA UM PREENCHIDO com conteudo real (nao apenas o cabecalho): " +
    campos.join("; ") +
    " — no formato do bloco \"SPEC COMPLETA\" do seu system prompt."
  );
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
  const faltam = camposExigidos.filter((c) => !campoPresenteNorm(alvo, norm(c)));
  if (faltam.length) return `spec sem campo(s): ${faltam.join(", ")}`;
  return null;
}

// Presenca robusta de um campo na spec: casa como HEADING ('## Campo …') OU como LABEL
// ('- **Campo…:** …'), cobrindo o formato MISTO das specs reais (o livro-editor escreve
// ora '## Fio de POV', ora '- **Decisao/Acao:** valor'). NUNCA casa o nome do campo solto
// no meio da prosa — sem isso um campo de nome curto/comum como "Modo" casaria "de modo
// que" e o gate reprovaria specs saudaveis (o anti-padrao que o projeto proibe). Espelhado
// em livro_runner.py::_campo_presente. Recebe texto e campo JA normalizados (min., sem acento).
function campoPresenteNorm(specNorm: string, campoNorm: string): boolean {
  for (const raw of specNorm.split("\n")) {
    const heading = /^\s*#{1,6}\s+/.test(raw);
    // conteudo apos marcador de heading (#) e/ou de lista/negrito (-, *, **)
    const corpo = raw.replace(/^\s*#{1,6}\s+/, "").replace(/^\s*[-*]?\s*\*{0,2}\s*/, "");
    if (!corpo.startsWith(campoNorm)) continue;
    const resto = corpo.slice(campoNorm.length);
    if (/^[a-z0-9]/.test(resto)) continue; // limite de palavra: "modos"/"modelo" != "modo"
    if (heading) return true;              // '## Campo …'
    if (resto.split("\n")[0].includes(":")) return true; // 'Campo…: …' (label)
  }
  return false;
}
