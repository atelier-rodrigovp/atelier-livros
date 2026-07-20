// Engine V2 — validação de fichas de cena (F5).
// A ficha é estrutura, nunca prosa: o escritor é o único autor de frases literárias.
// Validação em duas camadas: (1) estrutural (schema scene-spec/v1 + coerência com o
// contrato da skill); (2) anti-ghostwriting (sinais de prosa pronta dentro da ficha).

import { contarGnomico, contarMetaforaElaborada, contarPersonificacao } from "../maneirismo.js";
import type { SceneSpec, SkillContract } from "./tipos.js";

export interface ResultadoValidacaoSpec {
  ok: boolean;
  erros: string[];      // bloqueantes (estrutura ou ghostwriting)
  avisos: string[];     // não bloqueantes
}

const CAMPOS_TEXTO_OBRIGATORIOS: (keyof SceneSpec & string)[] = [
  "pov",
  "local",
  "tempo",
  "objetivo",
  "obstaculo",
  "acao_fisica",
  "informacao_nova",
  "virada",
  "mudanca_estado",
];

/** Palavras por campo acima disso = cheiro de parágrafo redigido, não de ficha. */
const MAX_PALAVRAS_CAMPO = 60;

function palavras(s: string): number {
  return s.split(/\s+/).filter(Boolean).length;
}

/** Sinais de prosa pronta num valor de campo da ficha. Retorna lista de motivos. */
export function sinaisGhostwriting(campo: string, valor: string): string[] {
  const motivos: string[] = [];
  const v = valor.trim();
  if (!v) return motivos;

  if (palavras(v) > MAX_PALAVRAS_CAMPO) {
    motivos.push(`${campo}: ${palavras(v)} palavras (máx ${MAX_PALAVRAS_CAMPO}) — ficha não redige, aponta`);
  }
  // Diálogo pronto: travessão de fala ou fala entre aspas com verbo dicendi.
  if (/(^|\n)\s*—\s*[A-ZÁÉÍÓÚÂÊÔÃÕa-z]/.test(v) || /["“][^"”]{12,}["”]\s*,?\s*(disse|falou|perguntou|respondeu|sussurrou|gritou)/i.test(v)) {
    motivos.push(`${campo}: contém diálogo redigido`);
  }
  // Frase de abertura/encerramento ditada.
  if (/\b(abre|abrir|come[çc]a|comece|termina|encerra|feche|fecha)\b[^.]{0,40}\b(com a frase|com a linha|com o par[áa]grafo|dizendo)\b/i.test(v) || /["“][^"”]{25,}["”]/.test(v)) {
    motivos.push(`${campo}: dita frase pronta (abertura/encerramento/citação longa)`);
  }
  // Pensamento/sensação redigidos literariamente (1ª pessoa dramatizada em ficha).
  if (/\b(ela|ele)\s+(pensa|sente)\s*:\s*["“]?[a-záéíóúâêôãõ]/i.test(v) || /\bpensamento\s*:\s*["“]/i.test(v)) {
    motivos.push(`${campo}: formula pensamento/sensação redigidos`);
  }
  // Ornamento literário: metáfora elaborada, gnômico, personificação — ficha não decora.
  // Desdobra verbo de cognição ("ela entende que <máxima>") para pegar máxima embutida.
  // Erros citam o TRECHO detectado: o retry do papel precisa saber o que remover.
  const desdobrado = v.replace(/\b(ela|ele|[A-ZÁÉÍÓÚ]\w+)\s+(entende|percebe|sabe|descobre|conclui|aprende)\s+que\s+(\p{L})/giu, (_m, _s, _v, l: string) => String(l).toUpperCase());
  const met = contarMetaforaElaborada(v);
  if (met.n > 0) motivos.push(`${campo}: metáfora pronta — remova/troque por fato seco: ${JSON.stringify(met.exemplos[0] ?? v.slice(0, 60))}`);
  const gno = contarGnomico(v).n > 0 ? contarGnomico(v) : contarGnomico(desdobrado);
  if (gno.n > 0) motivos.push(`${campo}: aforismo/máxima pronta — remova: ${JSON.stringify(gno.exemplos[0] ?? "")}`);
  const per = contarPersonificacao(v);
  if (per.n > 0) motivos.push(`${campo}: personificação de abstração — remova: ${JSON.stringify(per.exemplos[0] ?? "")}`);
  return motivos;
}

/** Valida a ficha contra o schema e o contrato da skill. */
export function validarSpec(spec: SceneSpec, contrato: SkillContract): ResultadoValidacaoSpec {
  const erros: string[] = [];
  const avisos: string[] = [];

  if (spec.schema !== "scene-spec/v1") erros.push(`schema inválido: ${String(spec.schema)}`);
  if (!Number.isInteger(spec.capitulo) || spec.capitulo < 1) erros.push("capitulo inválido");

  for (const campo of CAMPOS_TEXTO_OBRIGATORIOS) {
    const v = spec[campo];
    if (typeof v !== "string" || !v.trim()) erros.push(`campo obrigatório vazio: ${campo}`);
  }
  if (!spec.gancho || !spec.gancho.tipo?.trim() || !spec.gancho.descricao?.trim()) {
    erros.push("gancho ausente ou incompleto");
  } else if (!contrato.tipos_gancho.includes(spec.gancho.tipo)) {
    erros.push(`gancho.tipo "${spec.gancho.tipo}" fora do vocabulário da skill (${contrato.tipos_gancho.join(", ")})`);
  }
  if (!Array.isArray(spec.fatos_obrigatorios)) erros.push("fatos_obrigatorios deve ser lista");
  if (!Array.isArray(spec.conhecimentos_proibidos)) erros.push("conhecimentos_proibidos deve ser lista");
  if (!Array.isArray(spec.fios_avancados)) erros.push("fios_avancados deve ser lista");
  if (!Array.isArray(spec.fios_ausentes)) erros.push("fios_ausentes deve ser lista");

  // Campos extras exigidos pelo contrato (ex.: hoover: "Relógios", "Narradora").
  const exigidos = contrato.estruturas_exigidas?.campos_spec ?? [];
  for (const nome of exigidos) {
    const v = spec.campos_skill?.[nome];
    if (!v || !v.trim()) erros.push(`campo exigido pela skill ausente: ${nome}`);
  }

  // Exceção editorial precisa referenciar regra existente e ter justificativa.
  if (spec.excecao_editorial) {
    const ids = new Set(contrato.regras.map((r) => r.id));
    if (!ids.has(spec.excecao_editorial.regra_id)) {
      erros.push(`excecao_editorial referencia regra inexistente: ${spec.excecao_editorial.regra_id}`);
    }
    if (!spec.excecao_editorial.justificativa?.trim()) erros.push("excecao_editorial sem justificativa");
  }

  // Anti-ghostwriting: todos os campos textuais + campos_skill + listas.
  const valoresTexto: [string, string][] = [
    ...CAMPOS_TEXTO_OBRIGATORIOS.map((c) => [c, String(spec[c] ?? "")] as [string, string]),
    ["gancho.descricao", spec.gancho?.descricao ?? ""],
    ...(spec.fatos_obrigatorios ?? []).map((f, i) => [`fatos_obrigatorios[${i}]`, f] as [string, string]),
    ...Object.entries(spec.campos_skill ?? {}).map(([k, v]) => [`campos_skill.${k}`, v] as [string, string]),
  ];
  for (const [campo, valor] of valoresTexto) {
    for (const motivo of sinaisGhostwriting(campo, valor)) erros.push(motivo);
  }

  // Coerência mínima de tempo quando a skill tem temporalidade de relógio.
  if (!spec.tempo?.trim()) {
    // já coberto por campo obrigatório
  } else if (exigidos.some((c) => /rel[óo]gio|dia\/hora/i.test(c)) && !/\d/.test(spec.tempo)) {
    avisos.push("tempo sem marcação numérica (skill usa relógio/dia-hora)");
  }

  return { ok: erros.length === 0, erros, avisos };
}
