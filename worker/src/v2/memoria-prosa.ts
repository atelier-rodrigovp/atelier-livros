// Engine V2 — memória derivada da PROSA APROVADA (fatia H).
//
// O ledger de revelações nasceu derivado da FICHA: o que o plano dizia que o
// capítulo revelaria. Isso deixa um buraco inteiro de fora — o que a prosa
// efetivamente colocou na página e a ficha não previa. Uma pista plantada só na
// escrita, uma promessa que o escritor abriu de improviso, um objeto que ganhou
// peso: nada disso existia para a engine, e portanto nada disso cobrava payoff.
//
// Regra: a FICHA é plano; a PROSA APROVADA é a verdade observada. Onde as duas
// divergem, isso é um EVENTO explícito — nunca uma sobrescrita silenciosa.

import { hashText } from "../quality-state.js";
import { jaccard, LIMIAR_SEMANTICO, tokensConteudo } from "./repeticao.js";
import type { SceneSpec } from "./tipos.js";

export type TipoMemoria =
  | "fato"
  | "revelacao"
  | "pista"
  | "objeto"
  | "promessa"
  | "pergunta_aberta"
  | "mudanca_estado"
  | "mudanca_relacao"
  | "condicao_fisica"
  | "localizacao"
  | "conhecimento";

export interface EntradaMemoria {
  id: string;
  tipo: TipoMemoria;
  capitulo: number;
  /** O que passou a ser verdade, em ≤25 palavras. */
  enunciado: string;
  /** Trecho LITERAL da prosa que sustenta. Sem ele, a entrada não entra. */
  trecho: string;
  /** De quem é o conhecimento/estado, quando aplicável. */
  quem?: string;
  confianca: "alta" | "media" | "baixa";
  /** Hash do texto aprovado de onde a entrada foi extraída. */
  text_hash: string;
  /** `ficha` = prevista no plano; `prosa` = surgiu só na escrita. */
  origem: "ficha" | "prosa";
  /** Estado da entrada no livro. */
  estado: "aberta" | "paga" | "resolvida" | "contradita";
  /** Para promessas/pistas: onde foi paga. */
  paga_em?: number;
}

export interface ExtracaoProsa {
  schema: "memoria-prosa/v1";
  entradas: Omit<EntradaMemoria, "id" | "capitulo" | "text_hash" | "estado">[];
  /** Divergências que o extrator viu entre a ficha e a página. */
  divergencias: { campo: string; ficha: string; prosa: string; trecho: string }[];
}

/** Normaliza para comparar trecho × texto. */
function norm(t: string): string {
  return t.toLowerCase().replace(/[“”«»„]/g, '"').replace(/[‘’]/g, "'").replace(/\s+/g, " ").trim();
}

export function trechoExiste(trecho: string, texto: string): boolean {
  const t = norm(trecho);
  return t.length >= 12 && norm(texto).includes(t);
}

export interface ConflitoFichaProsa {
  capitulo: number;
  campo: string;
  valorFicha: string;
  valorProsa: string;
  trecho: string;
  /** Evento explícito no estado canônico — nunca sobrescrita silenciosa. */
  em: string;
}

export interface ResultadoExtracao {
  entradas: EntradaMemoria[];
  conflitos: ConflitoFichaProsa[];
  /** Entradas recusadas e por quê (auditoria: nada some em silêncio). */
  recusadas: { enunciado: string; motivo: string }[];
}

/**
 * Converte a extração do modelo em entradas de memória VERIFICADAS contra o
 * texto aprovado. Entrada sem trecho localizável não entra: a memória do livro
 * não pode conter o que ninguém consegue apontar na página.
 */
export function derivarMemoriaDaProsa(entrada: {
  capitulo: number;
  texto: string;
  ficha: SceneSpec;
  extracao: ExtracaoProsa;
  em: string;
}): ResultadoExtracao {
  const textHash = hashText(entrada.texto);
  const entradas: EntradaMemoria[] = [];
  const recusadas: { enunciado: string; motivo: string }[] = [];
  let seq = 0;

  for (const e of entrada.extracao.entradas) {
    const enunciado = (e.enunciado ?? "").trim();
    if (!enunciado) {
      recusadas.push({ enunciado: "(vazio)", motivo: "enunciado vazio" });
      continue;
    }
    if (enunciado.split(/\s+/).length > 25) {
      recusadas.push({ enunciado, motivo: "enunciado acima de 25 palavras (é prosa, não fato)" });
      continue;
    }
    if (!trechoExiste(e.trecho ?? "", entrada.texto)) {
      recusadas.push({ enunciado, motivo: "trecho não localizado no capítulo aprovado" });
      continue;
    }
    seq += 1;
    entradas.push({
      id: `M${String(entrada.capitulo).padStart(2, "0")}.${seq}`,
      tipo: e.tipo,
      capitulo: entrada.capitulo,
      enunciado,
      trecho: e.trecho,
      quem: e.quem,
      confianca: e.confianca ?? "media",
      text_hash: textHash,
      origem: e.origem ?? "prosa",
      estado: "aberta",
    });
  }

  const conflitos: ConflitoFichaProsa[] = [];
  for (const d of entrada.extracao.divergencias ?? []) {
    if (!trechoExiste(d.trecho ?? "", entrada.texto)) {
      recusadas.push({ enunciado: `divergência em ${d.campo}`, motivo: "trecho não localizado" });
      continue;
    }
    conflitos.push({
      capitulo: entrada.capitulo,
      campo: d.campo,
      valorFicha: d.ficha,
      valorProsa: d.prosa,
      trecho: d.trecho,
      em: entrada.em,
    });
  }

  return { entradas, conflitos, recusadas };
}

// ---------------------------------------------------------------------------
// Gate: FICHA NOVA × MEMÓRIA DA PROSA APROVADA (META B)
//
// O buraco que isto fecha (RELATORIO-COMPLETO-2026-08-05.md §3.1): no capítulo 1
// aprovado do canário 2, Beatriz é a paciente acamada com traqueostomia; na
// ficha do capítulo 2, gerada de novo pela retomada, quem está na cama é Otávio.
// Quatro camadas de continuidade existiam — validação de ficha, escritor com a
// cauda do capítulo anterior, auditor factual, conformidade — e NENHUMA compara
// a ficha nova com a memória extraída da prosa já aprovada. Este gate compara.
//
// A regra é estreita de propósito, porque detector com falso positivo não pode
// bloquear (lição permanente da auditoria de estilo):
//
//  - só ESTADOS EXCLUSIVOS entram: `condicao_fisica` e `localizacao`. São os
//    tipos cujo predicado pertence a UMA pessoa por vez — estar acamado com
//    cânula, estar trancado no porão. `revelacao`/`fato` descrevem o mundo e
//    podem valer para vários; `mudanca_relacao` é recíproca por natureza;
//  - a comparação usa o tokenizador e o limiar semântico JÁ CALIBRADOS do
//    repositório (`LIMIAR_SEMANTICO`, o mesmo que hoje bloqueia repetição
//    semântica). Nenhum limiar novo é inventado aqui;
//  - o nome das duas pessoas sai dos dois lados antes de comparar: o que se
//    compara é o PREDICADO, não quem o carrega;
//  - se a própria prosa já registrou a pessoa nova naquele estado, não é
//    conflito — o livro mudou, e a memória é a verdade observada;
//  - o conflito carrega o TRECHO literal da prosa aprovada. Sem trecho não há
//    bloqueio, como no resto do arquivo.
// ---------------------------------------------------------------------------

/** Tipos cujo predicado pertence a uma pessoa por vez. */
const TIPOS_EXCLUSIVOS: TipoMemoria[] = ["condicao_fisica", "localizacao"];

export interface ConflitoFichaMemoria {
  /** Capítulo da prosa aprovada que sustenta o estado. */
  capitulo: number;
  /** De quem é o estado, segundo a PROSA APROVADA. */
  quemNaProsa: string;
  /** A quem a FICHA NOVA atribuiu o mesmo estado. */
  quemNaFicha: string;
  /** O estado, como a memória o enunciou. */
  enunciado: string;
  /** Campo da ficha onde a atribuição aparece. */
  campo: string;
  /** O que a ficha diz, literal. */
  textoFicha: string;
  /** Trecho literal da prosa aprovada. Sem ele, nada bloqueia. */
  trecho: string;
  similaridade: number;
}

/** Campos de texto livre da ficha onde um estado pode ser atribuído. */
function camposDaFicha(ficha: SceneSpec): { campo: string; texto: string }[] {
  const out: { campo: string; texto: string }[] = [
    { campo: "local", texto: ficha.local },
    { campo: "objetivo", texto: ficha.objetivo },
    { campo: "obstaculo", texto: ficha.obstaculo },
    { campo: "acao_fisica", texto: ficha.acao_fisica },
    { campo: "informacao_nova", texto: ficha.informacao_nova },
    { campo: "virada", texto: ficha.virada },
    { campo: "mudanca_estado", texto: ficha.mudanca_estado },
    { campo: "gancho", texto: ficha.gancho?.descricao ?? "" },
  ];
  (ficha.fatos_obrigatorios ?? []).forEach((t, i) => out.push({ campo: `fatos_obrigatorios[${i}]`, texto: t }));
  (ficha.revelacoes ?? []).forEach((t, i) => out.push({ campo: `revelacoes[${i}]`, texto: t }));
  for (const [k, v] of Object.entries(ficha.campos_skill ?? {})) out.push({ campo: `campos_skill.${k}`, texto: v });
  return out.filter((c) => (c.texto ?? "").trim());
}

/** Remove um nome próprio do texto, para comparar só o predicado. */
function semNome(texto: string, nome: string): string {
  const esc = nome.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return texto.replace(new RegExp(`\\b${esc}\\b`, "gi"), " ");
}

function mencionaNome(texto: string, nome: string): boolean {
  const esc = nome.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`\\b${esc}\\b`, "i").test(texto);
}

/**
 * Contradição entre a ficha NOVA e a memória da prosa APROVADA: o mesmo estado
 * exclusivo atribuído a outra pessoa, sem que a prosa tenha registrado a troca.
 * Roda ANTES da escrita — é o plano que se corrige, não a prosa.
 */
export function conflitosFichaContraMemoria(
  ficha: SceneSpec,
  memoria: EntradaMemoria[]
): ConflitoFichaMemoria[] {
  const relevantes = memoria.filter(
    (m) => m.capitulo < ficha.capitulo && m.quem?.trim() && TIPOS_EXCLUSIVOS.includes(m.tipo)
  );
  if (!relevantes.length) return [];
  // Só nomes que a própria memória conhece: o gate nunca inventa personagem.
  const pessoas = [...new Set(memoria.map((m) => m.quem?.trim()).filter((q): q is string => Boolean(q)))];
  const campos = camposDaFicha(ficha);
  const conflitos: ConflitoFichaMemoria[] = [];

  for (const m of relevantes) {
    const dono = m.quem as string;
    const predicado = tokensConteudo(semNome(m.enunciado, dono));
    if (!predicado.size) continue;
    for (const c of campos) {
      const outros = pessoas.filter((p) => p !== dono && mencionaNome(c.texto, p));
      if (!outros.length) continue;
      if (mencionaNome(c.texto, dono)) continue; // ficha cita os dois: não é troca
      for (const intruso of outros) {
        const sim = jaccard(predicado, tokensConteudo(semNome(c.texto, intruso)));
        if (sim < LIMIAR_SEMANTICO) continue;
        // A própria prosa já pôs o intruso nesse estado? Então o livro mudou.
        const registradoNaProsa = memoria.some(
          (x) =>
            x.quem?.trim() === intruso &&
            TIPOS_EXCLUSIVOS.includes(x.tipo) &&
            jaccard(tokensConteudo(semNome(x.enunciado, intruso)), predicado) >= LIMIAR_SEMANTICO
        );
        if (registradoNaProsa) continue;
        conflitos.push({
          capitulo: m.capitulo,
          quemNaProsa: dono,
          quemNaFicha: intruso,
          enunciado: m.enunciado,
          campo: c.campo,
          textoFicha: c.texto,
          trecho: m.trecho,
          similaridade: Number(sim.toFixed(3)),
        });
      }
    }
  }
  return conflitos.sort((a, b) => b.similaridade - a.similaridade);
}

// ---------------------------------------------------------------------------
// Fechamento cruzado: fundação × fichas × prosa
// ---------------------------------------------------------------------------

export interface PendenciaCruzada {
  fonte: "fundacao" | "ficha" | "prosa";
  id: string;
  enunciado: string;
  plantada_em: number;
  motivo: "nunca_paga" | "pagamento_nao_localizado";
}

export interface EntradaCruzamento {
  /** Promessas declaradas na fundação (grade de arco). */
  promessasFundacao: { id: string; enunciado: string; plantada_em: number; paga_em: number }[];
  /** Promessas marcadas nas fichas aprovadas. */
  promessasFichas: { capitulo: number; id: string; acao: "planta" | "reforca" | "paga" }[];
  /** Memória derivada da prosa aprovada (todas as entradas de todos os capítulos). */
  memoria: EntradaMemoria[];
}

/**
 * Cruza as TRÊS fontes. O silêncio de uma nunca vale como conformidade das
 * outras: uma pista que só a prosa plantou continua exigindo payoff, mesmo que
 * a fundação e as fichas nada digam sobre ela.
 */
export function pendenciasDeFechamento(e: EntradaCruzamento): PendenciaCruzada[] {
  const out: PendenciaCruzada[] = [];

  // 1. Fundação: promessa sem pagamento declarado ou sem ficha que a pague.
  const pagasPorFicha = new Set(e.promessasFichas.filter((p) => p.acao === "paga").map((p) => p.id));
  for (const p of e.promessasFundacao) {
    if (!p.paga_em) {
      out.push({ fonte: "fundacao", id: p.id, enunciado: p.enunciado, plantada_em: p.plantada_em, motivo: "nunca_paga" });
      continue;
    }
    if (pagasPorFicha.size > 0 && !pagasPorFicha.has(p.id)) {
      out.push({
        fonte: "fundacao",
        id: p.id,
        enunciado: p.enunciado,
        plantada_em: p.plantada_em,
        motivo: "pagamento_nao_localizado",
      });
    }
  }

  // 2. Ficha: promessa marcada como plantada e nunca marcada como paga.
  const plantadasPorFicha = e.promessasFichas.filter((p) => p.acao === "planta");
  const idsFundacao = new Set(e.promessasFundacao.map((p) => p.id));
  for (const p of plantadasPorFicha) {
    if (idsFundacao.has(p.id)) continue; // já coberta pela regra 1
    if (!pagasPorFicha.has(p.id)) {
      out.push({
        fonte: "ficha",
        id: p.id,
        enunciado: `promessa ${p.id} marcada na ficha do capítulo ${p.capitulo}`,
        plantada_em: p.capitulo,
        motivo: "nunca_paga",
      });
    }
  }

  // 3. PROSA: promessa ou pista que só a página abriu. É o buraco que a fatia H
  //    fecha — antes, o que a ficha não previa não existia para a engine.
  const abertasNaProsa = e.memoria.filter(
    (m) => (m.tipo === "promessa" || m.tipo === "pista") && m.origem === "prosa" && m.estado === "aberta"
  );
  for (const m of abertasNaProsa) {
    const pagaNaMemoria = e.memoria.some(
      (x) => x.estado === "paga" && (x.id === m.id || norm(x.enunciado) === norm(m.enunciado))
    );
    if (pagaNaMemoria) continue;
    if (pagasPorFicha.has(m.id)) continue;
    out.push({
      fonte: "prosa",
      id: m.id,
      enunciado: m.enunciado,
      plantada_em: m.capitulo,
      motivo: "nunca_paga",
    });
  }

  return out;
}

/** Marca como paga a entrada de memória que um capítulo posterior resolveu. */
export function marcarPagamento(memoria: EntradaMemoria[], id: string, capitulo: number): EntradaMemoria[] {
  return memoria.map((m) => (m.id === id ? { ...m, estado: "paga" as const, paga_em: capitulo } : m));
}

/** Validação do JSON do papel extrator. */
export function validarExtracaoProsa(obj: unknown): ExtracaoProsa {
  if (typeof obj !== "object" || obj === null) throw new Error("extração não é objeto");
  const o = obj as Record<string, unknown>;
  if (!Array.isArray(o.entradas)) throw new Error("esperado { entradas: [...] }");
  const tipos = new Set<string>([
    "fato", "revelacao", "pista", "objeto", "promessa", "pergunta_aberta",
    "mudanca_estado", "mudanca_relacao", "condicao_fisica", "localizacao", "conhecimento",
  ]);
  const entradas = (o.entradas as unknown[]).map((e, i) => {
    const x = e as Record<string, unknown>;
    if (typeof x?.tipo !== "string" || !tipos.has(x.tipo)) throw new Error(`entradas[${i}].tipo inválido: ${String(x?.tipo)}`);
    if (typeof x?.enunciado !== "string") throw new Error(`entradas[${i}].enunciado inválido`);
    if (typeof x?.trecho !== "string") throw new Error(`entradas[${i}].trecho inválido`);
    const confianca = x.confianca === "alta" || x.confianca === "baixa" ? x.confianca : "media";
    const origem = x.origem === "ficha" ? "ficha" : "prosa";
    return {
      tipo: x.tipo as TipoMemoria,
      enunciado: x.enunciado,
      trecho: x.trecho,
      quem: typeof x.quem === "string" ? x.quem : undefined,
      confianca: confianca as "alta" | "media" | "baixa",
      origem: origem as "ficha" | "prosa",
    };
  });
  const divergencias = Array.isArray(o.divergencias)
    ? (o.divergencias as unknown[]).map((d, i) => {
        const x = d as Record<string, unknown>;
        if (typeof x?.campo !== "string" || typeof x?.trecho !== "string") {
          throw new Error(`divergencias[${i}] inválida (campo/trecho)`);
        }
        return {
          campo: x.campo,
          ficha: String(x.ficha ?? ""),
          prosa: String(x.prosa ?? ""),
          trecho: x.trecho,
        };
      })
    : [];
  return { schema: "memoria-prosa/v1", entradas, divergencias };
}
