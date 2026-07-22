// Engine V2 — sinais editoriais medidos (F6).
// Os detectores são universais; as COTAS vêm exclusivamente do contrato da skill
// (lição CR4: régua global envenena — o que salva o dan-brown mata o hoover).
// Sinal medido NUNCA bloqueia sozinho: alimenta o parecer do revisor, que dispõe
// cada um (violação confirmada / exceção válida / falso positivo / decisão humana).

import {
  classificarGanchoFinal,
  contarGnomico,
  contarMetaforaElaborada,
  contarPersonificacao,
  contarSanfona,
  diagnosticarCadencia,
  ORC_CADENCIA,
  percentDeclarativasSimples,
  sinalDialogoInterioridade,
  type OrcamentoCadencia,
} from "../maneirismo.js";
import type { SkillContract } from "./tipos.js";

// Contagem local: lib.ts arrasta supabase/.env; módulos v2 permanecem puros.
function countWords(texto: string): number {
  return texto.split(/\s+/).filter(Boolean).length;
}

export interface SinalMedido {
  sinal: string;
  valor: number | string;
  cota?: { min?: number; max?: number };  // presente só quando o CONTRATO declara
  fora_da_cota: boolean;                  // false quando não há cota (medição informativa)
  exemplos: string[];
}

/**
 * Extrai a cota declarada no contrato para um sinal: regra tipo "cota" cujo id
 * contém o nome do sinal (ids reais: "fecho-concreto-gnomico", "anti-sanfona",
 * "piso-declarativas"…). A convenção antiga exigia id EXATO "cota.gnomico" —
 * nenhum contrato usava, então nenhuma cota de contagem chegava aos sinais e
 * `fora_da_cota` era sempre false (defeito 11 da auditoria de fechamento).
 */
function cotaDeclarada(c: SkillContract, sinal: string): { min?: number; max?: number } | undefined {
  const chave = sinal.toLowerCase();
  const r = c.regras.find((x) => x.tipo === "cota" && x.id.toLowerCase().includes(chave));
  return r?.cota ? { min: r.cota.min, max: r.cota.max } : undefined;
}

function medir(sinal: string, valor: number, exemplos: string[], cota?: { min?: number; max?: number }): SinalMedido {
  const fora = cota ? (cota.max != null && valor > cota.max) || (cota.min != null && valor < cota.min) : false;
  return { sinal, valor, cota, fora_da_cota: fora, exemplos };
}

/** Mede todos os sinais editoriais do texto, com cotas vindas SÓ do contrato. */
export function medirSinais(texto: string, contrato: SkillContract): SinalMedido[] {
  const out: SinalMedido[] = [];

  const gn = contarGnomico(texto);
  out.push(medir("gnomico", gn.n, gn.todos, cotaDeclarada(contrato, "gnomico")));

  const pe = contarPersonificacao(texto);
  out.push(medir("personificacao", pe.n, pe.todos, cotaDeclarada(contrato, "personificacao")));

  const sa = contarSanfona(texto);
  out.push(medir("sanfona", sa.n, sa.todos, cotaDeclarada(contrato, "sanfona")));

  const de = percentDeclarativasSimples(texto);
  out.push(medir("declarativas_pct", de.pct, [], cotaDeclarada(contrato, "declarativas")));

  const me = contarMetaforaElaborada(texto);
  const cotaMet = contrato.politica_metafora.cota_por_capitulo != null
    ? { max: contrato.politica_metafora.cota_por_capitulo }
    : cotaDeclarada(contrato, "metafora");
  out.push(medir("metafora_elaborada", me.n, me.todos, cotaMet));

  const di = sinalDialogoInterioridade(texto);
  const pisoDialogo = contrato.politica_dialogo.piso_percentual;
  out.push(medir("dialogo_pct", di.dialogoPct, [], pisoDialogo != null ? { min: pisoDialogo } : undefined));
  out.push(medir("interioridade_run", di.maxInterioridadeSeguida, [], cotaDeclarada(contrato, "interioridade")));

  // Cadência: orçamento default sobrescrito campo-a-campo pelo contrato (ritmo.cadencia).
  const orc: OrcamentoCadencia = { ...ORC_CADENCIA, ...(contrato.ritmo.cadencia ?? {}) } as OrcamentoCadencia;
  const cad = diagnosticarCadencia(texto, orc);
  for (const t of cad.tiques) {
    // Só vira "fora da cota" se o contrato declarou a CHAVE deste tique (t.chave,
    // ex.: "fragEnfase"); senão é medição informativa. Comparar pelo rótulo humano
    // (t.nome) nunca casava — cadência declarada jamais saía da cota (defeito da
    // auditoria de fechamento).
    const declarou = t.chave != null && contrato.ritmo.cadencia != null && t.chave in (contrato.ritmo.cadencia ?? {});
    out.push({ sinal: `cadencia.${t.nome}`, valor: t.n, cota: declarou ? { max: t.alvo } : undefined, fora_da_cota: declarou && t.acima, exemplos: t.todosExemplos ?? t.exemplos });
  }

  // Tamanho do capítulo (sinal, não gate — decisão da F6).
  const palavras = countWords(texto);
  const faixa = contrato.faixa_palavras;
  out.push(medir("palavras", palavras, [], { min: faixa.min, max: faixa.max }));

  // Tipo de gancho final (informativo; o revisor confere contra a ficha).
  out.push({ sinal: "gancho_final", valor: classificarGanchoFinal(texto), fora_da_cota: false, exemplos: [] });

  return out;
}

/**
 * Resumo textual dos sinais para o prompt do revisor (medições reais, não opinião).
 * TODAS as ocorrências medidas são listadas, numeradas (adendo 2: o revisor só pode
 * confirmar violação citando cada ocorrência — para isso precisa vê-las todas).
 */
export function resumoSinais(sinais: SinalMedido[]): string {
  const linhas: string[] = [];
  for (const s of sinais) {
    const cota = s.cota
      ? ` (cota${s.cota.min != null ? ` mín ${s.cota.min}` : ""}${s.cota.max != null ? ` máx ${s.cota.max}` : ""}${s.fora_da_cota ? " — FORA" : ""})`
      : "";
    linhas.push(`- ${s.sinal}: ${s.valor}${cota}`);
    s.exemplos.forEach((e, i) => linhas.push(`    ${i + 1}. ${JSON.stringify(e)}`));
  }
  return linhas.join("\n");
}
