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
    // Auditabilidade (adendo 2): violacao_confirmada em sinal de CONTAGEM (valor
    // numérico > 0) exige as ocorrências citadas uma a uma; disposição parcial
    // exige a conta fechada (citadas + falsos_positivos = valor medido).
    if (x.disposicao === "violacao_confirmada" && typeof x.valor === "number" && x.valor > 0) {
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
      if (citadas.length < x.valor) {
        if (typeof x.falsos_positivos !== "number" || citadas.length + x.falsos_positivos !== x.valor) {
          throw new Error(
            `sinal "${x.sinal}": ${citadas.length} citada(s) de ${x.valor} medidas — disposição parcial exige "falsos_positivos" = ${x.valor - citadas.length} (citadas + falsos_positivos = valor)`
          );
        }
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
 * Parecer INCOMPLETO (sinal medido fora da cota sem disposição) é falha de
 * protocolo do revisor, não julgamento do texto: usada no `parse` do executor
 * de papel, lança para acionar o retry técnico com instrução corretiva.
 * `conferirParecer` mantém a mesma checagem como segunda rede (fail-closed)
 * caso o parecer incompleto escape por outro caminho.
 */
export function exigirDisposicaoCompleta(parecer: Parecer, sinaisMedidos: SinalMedido[]): Parecer {
  const dispostos = new Set(parecer.sinais.map((s) => s.sinal));
  const omitidos = sinaisMedidos.filter((m) => m.fora_da_cota && !dispostos.has(m.sinal));
  if (omitidos.length > 0) {
    throw new Error(
      `parecer incompleto — todo sinal FORA DA COTA exige disposição no array "sinais". Faltou dispor: ${omitidos
        .map((m) => `"${m.sinal}" (valor ${m.valor})`)
        .join(", ")}. Julgue cada um (violacao_confirmada com ocorrencias_citadas, excecao_valida, falso_positivo ou necessita_decisao_humana) e reenvie o parecer completo.`
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

  const dispostos = new Map<string, SinalDisposto>(parecer.sinais.map((s) => [s.sinal, s]));
  for (const m of sinaisMedidos) {
    if (!m.fora_da_cota) continue;
    if (!dispostos.has(m.sinal)) {
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
  const foraDaCota = new Set(sinaisMedidos.filter((m) => m.fora_da_cota).map((m) => m.sinal));
  for (const s of parecer.sinais) {
    if (s.disposicao !== "necessita_decisao_humana") continue;
    if (foraDaCota.has(s.sinal)) {
      verdict = "necessita_decisao_humana";
    } else {
      problemas.push(`anotação (sem pausa): ${s.sinal} dentro da cota disposto como decisão humana — ${s.evidencia.slice(0, 80)}`);
    }
  }

  return { ok: problemas.length === 0, problemas, verdictEfetivo: verdict };
}
