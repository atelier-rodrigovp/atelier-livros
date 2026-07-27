// Engine V2 — validação do parecer do revisor (F6).
// O revisor JULGA; estas regras determinísticas garantem que o julgamento é
// consistente (aprovação com evidência positiva; violação confirmada nunca passa;
// todo sinal fora de cota precisa de disposição).

import type { Parecer, SinalDisposto, Verdict } from "./tipos.js";
import type { SinalMedido } from "./sinais.js";

const DISPOSICOES = new Set(["violacao_confirmada", "excecao_valida", "falso_positivo", "necessita_decisao_humana"]);
const VERDICTS = new Set<Verdict>(["aprovado", "aprovado_com_excecao", "reprovado", "necessita_decisao_humana"]);
const EIXOS = [
  "dramatic_progression",
  "skill_adherence",
  "clarity",
  "emotional_effect",
  "continuity",
  "hook_effectiveness",
] as const;

/** Validação estrutural do JSON do parecer (usada como `parse` do executor de papel). */
export function validarParecer(obj: unknown): Parecer {
  if (typeof obj !== "object" || obj === null) throw new Error("parecer não é objeto");
  const p = obj as Record<string, unknown>;
  if (p.schema !== "parecer/v1") throw new Error(`parecer.schema inválido: ${String(p.schema)}`);
  for (const eixo of EIXOS) {
    const v = p[eixo] as { nota?: unknown; evidencia?: unknown } | undefined;
    if (!v || typeof v.nota !== "number" || v.nota < 0 || v.nota > 5 || typeof v.evidencia !== "string") {
      throw new Error(`parecer.${eixo} inválido (esperado {nota: 0-5, evidencia: string})`);
    }
  }
  if (!VERDICTS.has(p.verdict as Verdict)) throw new Error(`verdict inválido: ${String(p.verdict)}`);
  if (!Array.isArray(p.evidencias)) throw new Error("evidencias deve ser lista");
  for (const e of p.evidencias as unknown[]) {
    const x = e as Record<string, unknown>;
    if (typeof x?.local !== "string" || typeof x?.trecho !== "string" || typeof x?.observacao !== "string") {
      throw new Error("evidencia inválida (local/trecho/observacao)");
    }
  }
  if (!Array.isArray(p.sinais)) throw new Error("sinais deve ser lista");
  for (const s of p.sinais as unknown[]) {
    const x = s as Record<string, unknown>;
    if (typeof x?.sinal !== "string" || !DISPOSICOES.has(String(x?.disposicao)) || typeof x?.evidencia !== "string") {
      throw new Error(`sinal indisposto ou inválido: ${JSON.stringify(s).slice(0, 120)}`);
    }
    // Auditabilidade (adendo 2): violacao_confirmada em sinal de CONTAGEM DE
    // OCORRÊNCIAS (valor numérico > 0) exige as ocorrências citadas uma a uma;
    // disposição parcial exige a conta fechada (citadas + falsos_positivos = valor).
    // Sinais ESCALARES/agregados (palavras totais, percentuais, comprimento de run)
    // NÃO têm "ocorrências" para citar — exigir citação deles é armadilha de parse
    // (o canário romantasy queimou tentativas com o revisor dispondo "palavras" 2263
    // como violação). A auditabilidade segue integral para TODO detector de ocorrência.
    if (
      x.disposicao === "violacao_confirmada" &&
      typeof x.valor === "number" &&
      x.valor > 0 &&
      !ehSinalEscalar(String(x.sinal))
    ) {
      const citadas = x.ocorrencias_citadas;
      if (!Array.isArray(citadas) || citadas.length === 0) {
        throw new Error(
          `sinal "${x.sinal}": violacao_confirmada exige "ocorrencias_citadas" (lista {trecho, posicao?}) com cada ocorrência julgada defeito real`
        );
      }
      for (const [i, o] of (citadas as unknown[]).entries()) {
        const oc = o as Record<string, unknown>;
        if (typeof oc?.trecho !== "string" || !oc.trecho.trim()) {
          throw new Error(`sinal "${x.sinal}": ocorrencias_citadas[${i}].trecho obrigatório (citação literal)`);
        }
      }
      const falsos = x.falsos_positivos ?? 0;
      if (typeof falsos !== "number" || !Number.isInteger(falsos) || falsos < 0 || citadas.length + falsos !== x.valor) {
        throw new Error(
          `sinal "${x.sinal}": ${citadas.length} citada(s) de ${x.valor} medidas — exige "falsos_positivos" = ${x.valor - citadas.length} (citadas + falsos_positivos = valor)`
        );
      }
    }
  }
  if (!Array.isArray(p.correcoes)) throw new Error("correcoes deve ser lista");
  for (const c of p.correcoes as unknown[]) {
    const x = c as Record<string, unknown>;
    if (typeof x?.local !== "string" || typeof x?.problema !== "string" || typeof x?.instrucao !== "string") {
      throw new Error("correcao inválida (local/problema/instrucao)");
    }
  }
  return p as unknown as Parecer;
}

/**
 * Casamento TOLERANTE de nome de sinal. Os rótulos medidos carregam acento,
 * ponto e parêntese explicativo ("cadencia.anáfora (frases coladas, mesmo
 * início)"); exigir a string exata do revisor reprovava pareceres completos por
 * grafia — o canário romantasy queimou as 2 tentativas do papel assim. Compara
 * o nome sem acento/pontuação/parêntese; o parêntese é só glosa humana.
 */
export function normalizarNomeSinal(s: string): string {
  return String(s)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\([^)]*\)/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * Sinal ESCALAR/agregado: mede uma grandeza do capítulo inteiro (contagem total
 * de palavras, percentual, comprimento de sequência), não um padrão com
 * ocorrências citáveis no texto. Distingue-os dos detectores de OCORRÊNCIA
 * (gnômico, sanfona, personificação, metáfora, tiques de cadência), para os
 * quais a exigência de citação do adendo continua valendo. Conservador: na
 * dúvida devolve false (mantém a auditabilidade — fail-closed).
 */
export function ehSinalEscalar(nome: string): boolean {
  const n = normalizarNomeSinal(nome);
  return (
    n === "palavras" ||
    n.includes("pct") ||
    n.includes("percent") ||
    n.includes("declarativas") ||
    n.includes("dialogo") ||
    n.includes("interioridade")
  );
}

/**
 * Acha a disposição do sinal medido: igualdade normalizada e, se falhar, um
 * ÚNICO candidato cujo nome normalizado contenha o outro (cobre o revisor que
 * responde "anafora" em vez de "cadencia anafora"). Ambiguidade não casa.
 */
function acharDisposto(sinalMedido: string, sinais: SinalDisposto[]): SinalDisposto | undefined {
  const alvo = normalizarNomeSinal(sinalMedido);
  const exato = sinais.find((s) => normalizarNomeSinal(s.sinal) === alvo);
  if (exato) return exato;
  const parciais = sinais.filter((s) => {
    const n = normalizarNomeSinal(s.sinal);
    return n.length > 2 && (alvo.includes(n) || n.includes(alvo));
  });
  return parciais.length === 1 ? parciais[0] : undefined;
}

/** Mesmo casamento tolerante, no sentido parecer → medição real. */
export function acharSinalMedido(sinalParecer: string, sinais: SinalMedido[]): SinalMedido | undefined {
  const alvo = normalizarNomeSinal(sinalParecer);
  const exato = sinais.find((s) => normalizarNomeSinal(s.sinal) === alvo);
  if (exato) return exato;
  const parciais = sinais.filter((s) => {
    const n = normalizarNomeSinal(s.sinal);
    return n.length > 2 && (alvo.includes(n) || n.includes(alvo));
  });
  return parciais.length === 1 ? parciais[0] : undefined;
}

function normalizarTrechoLiteral(s: string): string {
  // Glifos de aspas são dobrados: o prompt lista as ocorrências via JSON.stringify
  // (aspas duplas internas) e o modelo, ao re-serializar o próprio JSON, troca o
  // glifo (" → ' ou ” → "). A citação continua tendo que corresponder a uma
  // ocorrência MEDIDA — só não reprovamos por tipografia de aspas.
  return s
    .replace(/["'“”‘’«»`´]/g, "")
    .replace(/[/|]/g, " ") // separador de par ("A / B") vira espaço: citar sem a barra é a mesma ocorrência
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Vincula o julgamento do modelo à saída real do detector. Sem isto, o revisor
 * podia declarar outro valor ou fabricar uma citação e ainda reprovar o texto.
 */
function problemasDeCitacao(parecer: Parecer, sinaisMedidos: SinalMedido[]): string[] {
  const problemas: string[] = [];
  for (const disposto of parecer.sinais) {
    if (disposto.disposicao !== "violacao_confirmada") continue;
    const medido = acharSinalMedido(disposto.sinal, sinaisMedidos);
    if (!medido) {
      problemas.push(`sinal "${disposto.sinal}": não corresponde a nenhum sinal produzido pelo detector`);
      continue;
    }

    if (disposto.valor !== medido.valor) {
      problemas.push(
        `sinal "${disposto.sinal}": valor do parecer (${String(disposto.valor)}) difere da medição (${String(medido.valor)})`
      );
    }
    if (ehSinalEscalar(medido.sinal) || typeof medido.valor !== "number") continue;

    // MULTISET: o mesmo trecho pode ocorrer N vezes no texto ("Raspagem." ×3) e o
    // revisor precisa citar cada uma — repetição é legítima ATÉ a multiplicidade
    // medida; acima disso (ou trecho nunca medido) continua reprovado.
    const saldo = new Map<string, number>();
    for (const exemplo of medido.exemplos) {
      const chave = normalizarTrechoLiteral(exemplo);
      saldo.set(chave, (saldo.get(chave) ?? 0) + 1);
    }
    for (const ocorrencia of disposto.ocorrencias_citadas ?? []) {
      const trecho = normalizarTrechoLiteral(ocorrencia.trecho);
      if (!saldo.has(trecho)) {
        problemas.push(
          `sinal "${disposto.sinal}": citação não corresponde a nenhuma ocorrência medida: ${JSON.stringify(ocorrencia.trecho)}`
        );
        continue;
      }
      const resta = saldo.get(trecho)!;
      if (resta <= 0) {
        problemas.push(`sinal "${disposto.sinal}": ocorrência citada em duplicidade além do medido: ${JSON.stringify(ocorrencia.trecho)}`);
        continue;
      }
      saldo.set(trecho, resta - 1);
    }
  }
  return problemas;
}

/**
 * Parecer INCOMPLETO (sinal medido fora da cota sem disposição) é falha de
 * protocolo do revisor, não julgamento do texto: usada no `parse` do executor
 * de papel, lança para acionar o retry técnico com instrução corretiva.
 * `conferirParecer` mantém a mesma checagem como segunda rede (fail-closed)
 * caso o parecer incompleto escape por outro caminho.
 */
export function exigirDisposicaoCompleta(parecer: Parecer, sinaisMedidos: SinalMedido[]): Parecer {
  const omitidos = sinaisMedidos.filter((m) => m.fora_da_cota && !acharDisposto(m.sinal, parecer.sinais));
  if (omitidos.length > 0) {
    throw new Error(
      `parecer incompleto — todo sinal FORA DA COTA exige disposição no array "sinais". Faltou dispor: ${omitidos
        .map((m) => `"${m.sinal}" (valor ${m.valor})`)
        .join(", ")}. Julgue cada um (violacao_confirmada com ocorrencias_citadas, excecao_valida, falso_positivo ou necessita_decisao_humana) e reenvie o parecer completo.`
    );
  }
  const citacoesInvalidas = problemasDeCitacao(parecer, sinaisMedidos);
  if (citacoesInvalidas.length > 0) {
    throw new Error(
      `parecer não auditável — use exatamente o valor e os trechos numerados produzidos pelo detector: ${citacoesInvalidas.join(" · ")}`
    );
  }
  return parecer;
}

export interface ConsistenciaParecer {
  ok: boolean;
  problemas: string[];
  /** veredito EFETIVO após as regras (pode rebaixar o do revisor, nunca promover) */
  verdictEfetivo: Verdict;
}

/**
 * Regras determinísticas sobre o parecer validado:
 * 1. aprovado/aprovado_com_excecao exige ≥1 evidência positiva.
 * 2. todo sinal medido FORA DA COTA precisa de disposição no parecer.
 * 3. violacao_confirmada ⇒ verdict reprovado + correção correspondente.
 * 4. qualquer necessita_decisao_humana ⇒ verdict necessita_decisao_humana.
 * 5. o veredito nunca é promovido por código — só rebaixado (quem aprova é o revisor).
 */
export function conferirParecer(parecer: Parecer, sinaisMedidos: SinalMedido[]): ConsistenciaParecer {
  const problemas: string[] = [];
  let verdict: Verdict = parecer.verdict;

  const aprovando = verdict === "aprovado" || verdict === "aprovado_com_excecao";
  if (aprovando && parecer.evidencias.length === 0) {
    problemas.push("aprovação sem evidência positiva");
    verdict = "reprovado";
  }

  const citacoesInvalidas = problemasDeCitacao(parecer, sinaisMedidos);
  if (citacoesInvalidas.length > 0) {
    problemas.push(...citacoesInvalidas);
    if (verdict !== "necessita_decisao_humana") verdict = "reprovado";
  }

  for (const m of sinaisMedidos) {
    if (!m.fora_da_cota) continue;
    if (!acharDisposto(m.sinal, parecer.sinais)) {
      problemas.push(`sinal fora da cota sem disposição: ${m.sinal} (${m.valor})`);
      verdict = verdict === "necessita_decisao_humana" ? verdict : "reprovado";
    }
  }

  const violacoes = parecer.sinais.filter((s) => s.disposicao === "violacao_confirmada");
  if (violacoes.length > 0) {
    if (parecer.correcoes.length === 0) {
      problemas.push(`violação confirmada sem correção solicitada: ${violacoes.map((v) => v.sinal).join(", ")}`);
    }
    if (verdict !== "necessita_decisao_humana") verdict = "reprovado";
  }

  // Escalação a decisão humana só por sinal FORA DA COTA (ou pelo próprio verdict
  // do revisor). Sinal dentro da cota do contrato disposto como "decisão humana"
  // vira anotação — cota é do contrato; dentro dela, produção não para.
  const foraDaCota = sinaisMedidos.filter((m) => m.fora_da_cota);
  for (const s of parecer.sinais) {
    if (s.disposicao !== "necessita_decisao_humana") continue;
    if (acharSinalMedido(s.sinal, foraDaCota)) {
      verdict = "necessita_decisao_humana";
    } else {
      problemas.push(`anotação (sem pausa): ${s.sinal} dentro da cota disposto como decisão humana — ${s.evidencia.slice(0, 80)}`);
    }
  }

  return { ok: problemas.length === 0, problemas, verdictEfetivo: verdict };
}
