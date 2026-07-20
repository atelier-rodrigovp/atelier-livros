// Engine V2 — gates universais (F6).
// Determinísticos, bloqueantes, válidos para QUALQUER skill — nunca medem gosto.
// Sinais editoriais ficam em sinais.ts e só bloqueiam via disposição do revisor.

import { detectarRepeticaoCrossCapitulo } from "../maneirismo.js";
import type { ResultadoGate, SceneSpec, SkillContract } from "./tipos.js";

export function gateArtefatoPresente(texto: string | null | undefined): ResultadoGate {
  const ok = typeof texto === "string" && texto.trim().length > 0;
  return { gate: "artefato_ausente", passou: ok, evidencia: ok ? undefined : "texto vazio ou arquivo ausente" };
}

/** Truncamento: o texto termina sem pontuação terminal (ou em vírgula/conector). */
export function gateTruncamento(texto: string): ResultadoGate {
  const t = texto.trimEnd();
  const ultimaLinha = t.split(/\n/).filter((l) => l.trim()).pop() ?? "";
  const terminaBem = /[.!?…]["'”’»)\]]*$/.test(ultimaLinha.trim()) || /^#{1,3}\s/.test(ultimaLinha.trim());
  const terminaEmConector = /[,;:—–]\s*$/.test(t) || /\b(e|mas|que|de|para|com|em|a|o)\s*$/i.test(t);
  const passou = terminaBem && !terminaEmConector;
  return { gate: "texto_truncado", passou, evidencia: passou ? undefined : `final: "…${t.slice(-80)}"` };
}

/** Repetição quase literal contra capítulos anteriores (verbatim/quase-verbatim). */
export function gateRepeticaoQuaseLiteral(
  texto: string,
  anteriores: { numero: number; trecho: string }[]
): ResultadoGate {
  // O detector já aplica limiar interno alto (slots aforísticos + shingles): tudo que
  // ele retorna (verbatim ou quase-verbatim) conta como repetição quase literal.
  const reps = detectarRepeticaoCrossCapitulo(texto, anteriores);
  const passou = reps.length === 0;
  return {
    gate: "repeticao_quase_literal",
    passou,
    evidencia: passou ? undefined : reps.slice(0, 3).map((r) => `cap ${r.capituloAnterior}: "${r.trecho}"`).join(" · "),
  };
}

/**
 * POV estruturalmente impossível: narração em pessoa incompatível com o contrato.
 * Heurística determinística conservadora (só o caso estrutural, não estilo):
 * - contrato "primeira" e narração sem NENHUM "eu" → impossível;
 * - contrato "terceira_*" e narração dominada por "eu" fora de diálogo → impossível.
 */
export function gatePovImpossivel(texto: string, contrato: SkillContract): ResultadoGate {
  const paragrafos = texto.split(/\n{2,}/).filter((p) => p.trim() && !/^[\s>]*[—–]/.test(p) && !/^#{1,3}\s/.test(p.trim()));
  const narracao = paragrafos.join("\n");
  const primeiraPessoa = (narracao.match(/\b(eu|meu|minha|comigo)\b/gi) ?? []).length;
  const totalPalavras = (narracao.match(/\S+/g) ?? []).length || 1;
  const densidade1a = primeiraPessoa / totalPalavras;
  let passou = true;
  let evidencia: string | undefined;
  if (contrato.pov.pessoa === "primeira" && totalPalavras > 120 && primeiraPessoa === 0) {
    passou = false;
    evidencia = "contrato exige primeira pessoa; narração sem nenhuma marca de 1ª pessoa";
  } else if (contrato.pov.pessoa !== "primeira" && densidade1a > 0.02 && primeiraPessoa > 8) {
    passou = false;
    evidencia = `contrato exige ${contrato.pov.pessoa}; narração com ${primeiraPessoa} marcas de 1ª pessoa`;
  }
  return { gate: "pov_impossivel", passou, evidencia };
}

/** Menção literal de conhecimento proibido pela ficha (gatilho determinístico; o auditor factual confirma). */
export function gateConhecimentoProibido(texto: string, ficha: SceneSpec): ResultadoGate {
  const hits: string[] = [];
  for (const proibido of ficha.conhecimentos_proibidos) {
    // Extrai termos-chave (palavras capitalizadas/números) da declaração de proibição.
    const termos = (proibido.match(/\b[A-ZÁÉÍÓÚÂÊÔ][\wáéíóúâêôãõç-]{3,}\b|\b\d{4}\b/g) ?? [])
      .filter((termo) => !/^(Marina|Ela|Ele|Não|Nada|Ninguém|Quem|Quando|Onde)$/.test(termo));
    for (const termo of termos) {
      const re = new RegExp(`\\b${termo.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "g");
      if (re.test(texto)) hits.push(`"${termo}" (de: ${proibido.slice(0, 60)})`);
    }
  }
  const passou = hits.length === 0;
  return { gate: "violacao_conhecimento", passou, evidencia: passou ? undefined : hits.slice(0, 3).join(" · ") };
}

/** Valida saída JSON de papel contra um validador; fora do schema = gate. */
export function validarSaidaJson<T>(texto: string, validador: (obj: unknown) => T): { ok: true; valor: T } | { ok: false; gate: ResultadoGate } {
  // Aceita JSON puro ou cercado em ```json ... ```
  const m = texto.match(/```(?:json)?\s*([\s\S]*?)```/);
  const cru = (m ? m[1] : texto).trim();
  try {
    const obj = JSON.parse(cru);
    return { ok: true, valor: validador(obj) };
  } catch (e) {
    return {
      ok: false,
      gate: { gate: "fora_do_schema", passou: false, evidencia: e instanceof Error ? e.message.slice(0, 200) : String(e) },
    };
  }
}

/** Roda os gates universais aplicáveis a um capítulo escrito. */
export function rodarGatesCapitulo(entrada: {
  texto: string | null;
  contrato: SkillContract;
  ficha?: SceneSpec;
  anteriores?: { numero: number; trecho: string }[];
}): ResultadoGate[] {
  const resultados: ResultadoGate[] = [];
  const artefato = gateArtefatoPresente(entrada.texto);
  resultados.push(artefato);
  if (!artefato.passou) return resultados;
  const texto = entrada.texto as string;
  resultados.push(gateTruncamento(texto));
  resultados.push(gatePovImpossivel(texto, entrada.contrato));
  if (entrada.anteriores?.length) resultados.push(gateRepeticaoQuaseLiteral(texto, entrada.anteriores));
  if (entrada.ficha) resultados.push(gateConhecimentoProibido(texto, entrada.ficha));
  return resultados;
}
