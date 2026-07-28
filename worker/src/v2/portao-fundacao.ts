// Engine V2 — portão de qualidade da FUNDAÇÃO.
//
// A V1 tem `fundacao-gate.ts` com oito critérios; a V2 não o importava em lugar
// nenhum e validava só formato (`estrutura.length >= 1`) — uma estrutura de 12
// capítulos passava num livro de 40. Aqui os oito critérios da V1 são portados
// para o formato da V2 (fundação em JSON, contrato no lugar dos arquivos de
// agente), do mais barato e mais grave para o mais caro.
//
// Fundação REPROVADA não vira livro: o portão roda ANTES de materializar, e o
// bloqueio é da fundação inteira, não de um capítulo.

import { validarArco, type ViolacaoArco } from "./arco.js";
import type { FundacaoV2 } from "./fundacao.js";
import type { ResultadoGate, SkillContract } from "./tipos.js";

export interface BloqueioFundacao {
  codigo: string;
  mensagem: string;
  severidade: "critical" | "high";
}

export interface AvaliacaoFundacaoV2 {
  bloqueios: BloqueioFundacao[];
  avisos: string[];
  /** Capítulos efetivamente declarados na estrutura (para telemetria/log). */
  capitulosEstrutura: number;
}

function normalizarNome(v: string): string {
  return v
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function documentoContem(documento: string, nome: string): boolean {
  const alvo = normalizarNome(nome.split(/[,;]|\s[—–]\s/, 1)[0]);
  if (!alvo) return false;
  return ` ${normalizarNome(documento)} `.includes(` ${alvo} `);
}

/**
 * Avalia a fundação. `docsPresentes` = nomes dos docs exigidos pelo contrato que
 * de fato existem no disco (o chamador confere; este núcleo é puro e testável).
 */
export function avaliarFundacaoV2(
  f: FundacaoV2,
  contrato: SkillContract,
  total: number,
  docsPresentes: string[] = []
): AvaliacaoFundacaoV2 {
  const bloqueios: BloqueioFundacao[] = [];
  const avisos: string[] = [];

  // --- 1. O mais barato e mais grave: a estrutura cobre exatamente 1..N ------
  const numeros = f.estrutura.map((e) => e.capitulo);
  const presentes = new Set(numeros);
  const faltantes = Array.from({ length: total }, (_, i) => i + 1).filter((n) => !presentes.has(n));
  const foraDaFaixa = numeros.filter((n) => n < 1 || n > total);
  const duplicados = [...new Set(numeros.filter((n, i) => numeros.indexOf(n) !== i))].sort((a, b) => a - b);
  if (faltantes.length || foraDaFaixa.length || duplicados.length) {
    const detalhes = [
      `declarados: ${numeros.length}`,
      `previstos: ${total}`,
      faltantes.length ? `faltantes: ${faltantes.slice(0, 20).join(", ")}${faltantes.length > 20 ? "…" : ""}` : "",
      foraDaFaixa.length ? `fora da faixa: ${foraDaFaixa.join(", ")}` : "",
      duplicados.length ? `duplicados: ${duplicados.join(", ")}` : "",
    ]
      .filter(Boolean)
      .join("; ");
    bloqueios.push({
      codigo: "ESTRUTURA_CAPITULOS_INCOERENTES",
      mensagem: `estrutura incompatível com os capítulos 1–${total} previstos (${detalhes})`,
      severidade: "critical",
    });
  }

  // --- 2. Peças obrigatórias da fundação, não-vazias -------------------------
  if (f.perfil_voz.trim().length < 80) {
    bloqueios.push({ codigo: "PERFIL_VOZ_RASO", mensagem: "perfil_voz ausente ou curto demais (< 80 caracteres)", severidade: "critical" });
  }
  if (f.biblia.trim().length < 200) {
    bloqueios.push({ codigo: "BIBLIA_RASA", mensagem: "bíblia da obra ausente ou curta demais (< 200 caracteres)", severidade: "critical" });
  }
  if (!f.mapa_personagens.length) {
    bloqueios.push({ codigo: "MAPA_PERSONAGENS_VAZIO", mensagem: "mapa de personagens vazio", severidade: "critical" });
  }
  if (!f.fios.length) {
    bloqueios.push({ codigo: "FIOS_VAZIOS", mensagem: "nenhum fio narrativo declarado", severidade: "critical" });
  }

  // --- 3. Docs que o CONTRATO exige (antes: a leitura falhava num catch) -----
  const exigidos = contrato.estruturas_exigidas?.docs ?? [];
  const ausentes = exigidos.filter((d) => !docsPresentes.includes(d));
  if (ausentes.length) {
    bloqueios.push({
      codigo: "DOC_EXIGIDO_AUSENTE",
      mensagem: `a skill "${contrato.id}" exige documento(s) de fundação que não foram gerados: ${ausentes.join(", ")}`,
      severidade: "critical",
    });
  }

  // --- 4. Todo capítulo aponta um fio declarado -----------------------------
  const fiosDeclarados = new Set(f.fios.map((x) => normalizarNome(x)));
  const desconhecidos = [
    ...new Set(
      f.estrutura
        .filter((e) => e.fio.trim() && !fiosDeclarados.has(normalizarNome(e.fio)))
        .map((e) => `cap ${e.capitulo}: "${e.fio}"`)
    ),
  ];
  if (desconhecidos.length) {
    bloqueios.push({
      codigo: "FIO_DESCONHECIDO",
      mensagem: `capítulo(s) apontam fio fora da lista declarada (${f.fios.join(", ")}): ${desconhecidos.slice(0, 6).join(" · ")}`,
      severidade: "high",
    });
  }

  // --- 5. Número de fios dentro do que o contrato admite --------------------
  const rot = contrato.pov.rotacao;
  if (rot && (f.fios.length < rot.fios_min || f.fios.length > rot.fios_max)) {
    bloqueios.push({
      codigo: "FIOS_FORA_DO_CONTRATO",
      mensagem: `${f.fios.length} fio(s) declarado(s); o contrato "${contrato.id}" admite entre ${rot.fios_min} e ${rot.fios_max}`,
      severidade: "high",
    });
  }

  // --- 6. Coerência de personagens: quem está no mapa existe na bíblia ------
  const forasDaBiblia = f.mapa_personagens
    .filter((p) => /protagonista|antagonista/i.test(p.papel))
    .filter((p) => !documentoContem(f.biblia, p.nome))
    .map((p) => p.nome);
  if (forasDaBiblia.length) {
    bloqueios.push({
      codigo: "PROTAGONISTA_INCOERENTE",
      mensagem: `personagem(ns) central(is) do mapa ausente(s) da bíblia: ${forasDaBiblia.join(", ")}`,
      severidade: "high",
    });
  }

  // --- 7. Arco (fundação v3). Ausente = v2: no-op com aviso ------------------
  if (f.arco) {
    const violacoes: ViolacaoArco[] = validarArco(f.arco, total);
    for (const v of violacoes) {
      bloqueios.push({
        codigo: "ARCO_INCOMPLETO",
        mensagem: `${v.alvo}: ${v.invariante} — ${v.detalhe}`,
        severidade: "critical",
      });
    }
  } else {
    avisos.push(
      "fundação sem grade de arco (schema v2): atos, promessas, fios e marcos não são verificáveis; " +
        "os gates de arco ficam inativos neste livro"
    );
  }

  // --- 8. Rubrica anti-genérico (sinaliza, não prova qualidade) --------------
  if (!f.promessa_editorial.trim()) {
    avisos.push("promessa_editorial vazia");
  }
  if (!/virada|reviravolta|twist|revela[cç][aã]o/i.test(f.biblia + f.estrutura.map((e) => e.resumo_estrutural).join(" "))) {
    avisos.push("nenhuma virada/reviravolta declarada na bíblia ou na estrutura (estrutura possivelmente episódica)");
  }
  const resumos = f.estrutura.map((e) => e.resumo_estrutural.trim().toLowerCase()).filter((r) => r.length > 20);
  const repetidos = resumos.filter((r, i) => resumos.indexOf(r) !== i).length;
  if (repetidos > 0) {
    avisos.push(`${repetidos} resumo(s) estrutural(is) repetido(s) — capítulos que repetem informação`);
  }
  if (!/antagonista|vil[aã]o|advers[aá]ri/i.test(f.biblia) && !f.mapa_personagens.some((p) => /antagonista/i.test(p.papel))) {
    avisos.push("nenhum antagonista identificável na bíblia nem no mapa");
  }

  return { bloqueios, avisos, capitulosEstrutura: numeros.length };
}

/** Forma de gate universal — para o ledger de runs e o progresso da UI. */
export function gateFundacao(av: AvaliacaoFundacaoV2): ResultadoGate {
  return {
    gate: av.bloqueios.some((b) => b.codigo === "ARCO_INCOMPLETO")
      ? "fundacao_arco_incompleto"
      : "fundacao_estrutura_incoerente",
    passou: av.bloqueios.length === 0,
    evidencia: av.bloqueios.length ? av.bloqueios.map((b) => `${b.codigo}: ${b.mensagem}`).join(" · ") : undefined,
  };
}

/** Instrução corretiva dirigida para o retry do arquiteto de enredo. */
export function correcaoParaRetry(av: AvaliacaoFundacaoV2): string {
  return [
    `A fundação anterior foi REPROVADA pelo portão de qualidade. Corrija exatamente estes pontos:`,
    ...av.bloqueios.map((b, i) => `${i + 1}. [${b.codigo}] ${b.mensagem}`),
    `Mantenha tudo o que já estava correto; devolva a fundação COMPLETA no mesmo schema.`,
  ].join("\n");
}
