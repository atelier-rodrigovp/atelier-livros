// Cascata de julgamento — triagem barata, decisão cara onde há o que decidir.
//
// O revisor gasta ~22.711 tokens de saída contra 7.295 do escritor, e a precisão
// dos detectores de contagem na voz hoover foi medida entre 0 e 15%: a maioria
// das "violações" por contagem não é defeito real. Pagar o modelo caro para
// julgar tudo é caro; pagar o barato para julgar tudo é o que havia, e não basta.
//
// A ARMADILHA, e por que a decisão julga nos DOIS sentidos: se o modelo caro só
// visse as violações que a triagem confirmou, ele só poderia derrubar. A cascata
// viraria máquina de leniência e a régua baixaria sem ninguém ter decidido baixar.
// Por isso o gatilho (b) sobe o caso em que a triagem NÃO confirmou nada, e o
// delta tem `acrescentar` com a mesma exigência de índice do resto do sistema.

import type { SinalMedido } from "./sinais.js";
import type { OcorrenciaCitada, Parecer, SinalDisposto, Verdict } from "./tipos.js";
import { normalizarNomeSinal } from "./revisor.js";

/**
 * Descarte a partir do qual a triagem está fazendo uma afirmação grande.
 *
 * NÃO é limiar de detector: não muda o que conta como defeito, só quando um
 * segundo par de olhos é chamado. Escolhido sobre os 47 pareceres gravados, que
 * são bimodais — 15 descartam sinal com valor ≥3 (média de 7,6 ocorrências
 * declaradas falso positivo) e ZERO descartam com valor 1–2. Não há faixa
 * intermediária para o número cortar arbitrariamente.
 */
export const DESCARTE_QUE_PESA = 3;

export interface ContextoEscalada {
  /** A triagem está prestes a FECHAR o capítulo (aprovar ou esgotar orçamento). */
  vaiFechar: boolean;
}

export interface DecisaoEscalada {
  escalar: boolean;
  motivo: string;
}

function ehContagem(s: SinalDisposto): boolean {
  return typeof s.valor === "number" && s.valor > 0;
}

/**
 * Quatro gatilhos. Os três primeiros olham os sinais; o quarto olha o momento.
 *
 * (d) existe porque os SEIS EIXOS do parecer não têm gatilho nenhum — é neles
 * que mora o capítulo competente-mas-morto e a revelação reapresentada em
 * paráfrase, que nenhum detector pega. E a assimetria decide: falso reprovado
 * custa uma rodada; falso aprovado entra no livro.
 */
export function precisaEscalar(
  parecer: Parecer,
  medidos: SinalMedido[],
  ctx: ContextoEscalada
): DecisaoEscalada {
  const confirmadas = parecer.sinais.filter((s) => s.disposicao === "violacao_confirmada");
  if (confirmadas.length > 0) {
    return { escalar: true, motivo: `(a) triagem confirmou ${confirmadas.length} violação(ões) — a decisão pode derrubar` };
  }

  const descartesGrandes = parecer.sinais.filter(
    (s) => (s.disposicao === "falso_positivo" || s.disposicao === "excecao_valida") && ehContagem(s) && Number(s.valor) >= DESCARTE_QUE_PESA
  );
  if (descartesGrandes.length > 0) {
    const maior = descartesGrandes.reduce((a, b) => (Number(b.valor) > Number(a.valor) ? b : a));
    return {
      escalar: true,
      motivo: `(b) triagem descartou "${maior.sinal}" com ${String(maior.valor)} ocorrências — a decisão pode acrescentar`,
    };
  }

  if (parecer.sinais.some((s) => s.disposicao === "necessita_decisao_humana")) {
    return { escalar: true, motivo: "(c) triagem pediu decisão humana" };
  }

  if (ctx.vaiFechar) {
    return { escalar: true, motivo: "(d) a triagem vai FECHAR o capítulo — os seis eixos não têm outro gatilho" };
  }

  // Reprovado intermediário sem sinal: será corrigido de qualquer forma, e
  // escalar aqui pagaria o modelo caro para confirmar o que já se sabe.
  void medidos;
  return { escalar: false, motivo: "sem gatilho: reprovado intermediário, segue para correção" };
}

// ---------------------------------------------------------------------------
// O delta
// ---------------------------------------------------------------------------

export interface ItemDelta {
  sinal: string;
  indice: number;
  motivo: string;
}

export interface DeltaDecisao {
  schema: "delta-decisao/v1";
  derrubar: ItemDelta[];
  acrescentar: ItemDelta[];
  /** SUGESTÃO. Gate universal não se derruba por delta — ver `pipeline.ts`. */
  veredito_sugerido: Verdict;
  /** Julgamento dos eixos, quando a decisão discorda da triagem. */
  observacao: string;
}

// A segunda passada é a instância decisória final. Ela não pode devolver o
// trabalho ao autor: ou aprova, aprova com exceção auditável, ou reprova para a
// correção automática. O tipo legado ainda aceita `necessita_decisao_humana`
// ao ler pareceres antigos da triagem, mas a decisão nova nunca o produz.
const VERDICTS_DECISAO: Verdict[] = ["aprovado", "aprovado_com_excecao", "reprovado"];

/**
 * A decisão emite um DELTA, não um parecer novo: é daí que vem a economia — ela
 * não reescreve os seis eixos nem as evidências, escreve só o que muda.
 *
 * Cada item exige índice e motivo. Acrescentar violação sem citar índice seria
 * exatamente o que a fatia 2 tirou do sistema.
 */
export function validarDelta(obj: unknown, medidos: SinalMedido[]): DeltaDecisao {
  if (typeof obj !== "object" || obj === null) throw new Error("delta não é objeto");
  const d = obj as Record<string, unknown>;
  if (d.schema !== "delta-decisao/v1") throw new Error(`delta.schema inválido: ${String(d.schema)}`);
  if (!VERDICTS_DECISAO.includes(d.veredito_sugerido as Verdict)) {
    throw new Error(`delta.veredito_sugerido inválido: ${String(d.veredito_sugerido)}`);
  }
  if (typeof d.observacao !== "string") throw new Error("delta.observacao obrigatória (por que a decisão diverge)");

  const lista = (nome: "derrubar" | "acrescentar"): ItemDelta[] => {
    const v = d[nome];
    if (v === undefined) return [];
    if (!Array.isArray(v)) throw new Error(`delta.${nome} deve ser lista`);
    return v.map((item, i) => {
      const x = item as Record<string, unknown>;
      if (typeof x?.sinal !== "string" || !x.sinal.trim()) throw new Error(`delta.${nome}[${i}].sinal obrigatório`);
      if (!Number.isInteger(x?.indice) || (x.indice as number) < 1) {
        throw new Error(`delta.${nome}[${i}].indice deve ser inteiro ≥ 1 (recebido ${JSON.stringify(x?.indice)})`);
      }
      if (typeof x?.motivo !== "string" || x.motivo.trim().length < 10) {
        throw new Error(`delta.${nome}[${i}].motivo obrigatório — derrubar ou acrescentar sem justificar não é julgamento`);
      }
      const alvo = normalizarNomeSinal(x.sinal);
      const candidatos = medidos.filter((m) => {
        const atual = normalizarNomeSinal(m.sinal);
        return atual === alvo || (atual.length > 2 && alvo.length > 2 && (atual.includes(alvo) || alvo.includes(atual)));
      });
      const medido = candidatos.length === 1 ? candidatos[0] : undefined;
      if (!medido) throw new Error(`delta.${nome}[${i}]: sinal "${String(x.sinal)}" não foi medido pelo detector`);
      if ((x.indice as number) > medido.exemplos.length) {
        throw new Error(
          `delta.${nome}[${i}]: índice ${String(x.indice)} fora do medido para "${String(x.sinal)}" (há ${medido.exemplos.length})`
        );
      }
      // O restante do pipeline trabalha com o nome canônico do detector. O
      // modelo pode omitir a glosa entre parênteses, mas nunca criar/ambiguidade.
      return { sinal: medido.sinal, indice: x.indice as number, motivo: x.motivo };
    });
  };

  return {
    schema: "delta-decisao/v1",
    derrubar: lista("derrubar"),
    acrescentar: lista("acrescentar"),
    veredito_sugerido: d.veredito_sugerido as Verdict,
    observacao: d.observacao,
  };
}

/**
 * Consolida triagem + delta num parecer único, que volta a passar pela MESMA
 * validação da triagem (`validarParecer` → `exigirDisposicaoCompleta` →
 * `conferirParecer`). Não existe segundo caminho de validação.
 */
export function aplicarDelta(triagem: Parecer, delta: DeltaDecisao, medidos: SinalMedido[]): Parecer {
  const porSinal = new Map<string, SinalDisposto>();
  for (const s of triagem.sinais) porSinal.set(s.sinal, { ...s, ocorrencias_citadas: [...(s.ocorrencias_citadas ?? [])] });

  const indicesDe = (s: SinalDisposto) =>
    new Set((s.ocorrencias_citadas ?? []).map((o) => o.indice).filter((i): i is number => typeof i === "number"));

  const acharDisposto = (nome: string): SinalDisposto | undefined => {
    const exato = porSinal.get(nome);
    if (exato) return exato;
    const alvo = normalizarNomeSinal(nome);
    const candidatos = [...porSinal.values()].filter((s) => {
      const atual = normalizarNomeSinal(s.sinal);
      return atual === alvo || (atual.length > 2 && (atual.includes(alvo) || alvo.includes(atual)));
    });
    return candidatos.length === 1 ? candidatos[0] : undefined;
  };

  const fecharConta = (s: SinalDisposto, medido: SinalMedido | undefined): void => {
    // Se a triagem descartou tudo, `falsos_positivos` podia ser omitido. Ao
    // acrescentar uma ocorrência, a cascata reconstrói a conta pela medição
    // real; partir de zero gerava um consolidado que a própria régua recusava.
    if (!medido || typeof medido.valor !== "number" || medido.exemplos.length === 0) return;
    const unicos = new Map<number, OcorrenciaCitada>();
    for (const o of s.ocorrencias_citadas ?? []) {
      if (typeof o.indice === "number" && o.indice >= 1 && o.indice <= medido.exemplos.length) unicos.set(o.indice, o);
    }
    s.valor = medido.valor;
    s.ocorrencias_citadas = [...unicos.values()];
    s.falsos_positivos = Math.max(0, medido.valor - unicos.size);
    if (unicos.size === 0 && s.disposicao === "violacao_confirmada") s.disposicao = "falso_positivo";
  };

  for (const d of delta.derrubar) {
    const s = acharDisposto(d.sinal);
    if (!s) continue;
    s.ocorrencias_citadas = (s.ocorrencias_citadas ?? []).filter((o) => o.indice !== d.indice);
    // Conta fechada: a ocorrência sai de "confirmada" e entra em falso positivo.
    fecharConta(s, medidos.find((m) => m.sinal === d.sinal));
  }

  for (const d of delta.acrescentar) {
    const medido = medidos.find((m) => m.sinal === d.sinal);
    let s = acharDisposto(d.sinal);
    if (!s) {
      s = {
        sinal: d.sinal,
        valor: medido?.valor ?? 0,
        disposicao: "violacao_confirmada",
        evidencia: d.motivo,
        ocorrencias_citadas: [],
        falsos_positivos: Math.max(0, Number(medido?.valor ?? 0)),
      };
      porSinal.set(d.sinal, s);
    }
    if (indicesDe(s).has(d.indice)) continue;
    s.disposicao = "violacao_confirmada";
    s.evidencia = s.evidencia ? `${s.evidencia} · decisão: ${d.motivo}` : d.motivo;
    const oc: OcorrenciaCitada = { indice: d.indice };
    s.ocorrencias_citadas = [...(s.ocorrencias_citadas ?? []), oc];
    fecharConta(s, medido);
  }

  // Pedido de decisão humana é uma ENTRADA para esta passada, nunca uma saída.
  // Para sinal medido, a decisão precisa usar `acrescentar` para confirmar as
  // ocorrências que são defeito; o restante fecha como falso positivo. Para
  // observação inventada fora dos detectores (ex.: dúvida factual), removemos o
  // sinal: o auditor factual é o dono desse julgamento logo depois no pipeline.
  for (const [nome, s] of [...porSinal.entries()]) {
    if (s.disposicao !== "necessita_decisao_humana") continue;
    const medido = medidos.find((m) => normalizarNomeSinal(m.sinal) === normalizarNomeSinal(s.sinal));
    if (!medido) {
      porSinal.delete(nome);
      continue;
    }
    s.disposicao = "falso_positivo";
    s.ocorrencias_citadas = [];
    if (typeof medido.valor === "number") s.falsos_positivos = medido.valor;
    s.evidencia = `${s.evidencia} · adjudicação automática: nenhuma ocorrência confirmada pela decisão`;
  }

  return {
    ...triagem,
    sinais: [...porSinal.values()],
    verdict: delta.veredito_sugerido,
    evidencias: [
      ...triagem.evidencias,
      { local: "decisão da cascata", trecho: delta.observacao.slice(0, 200), observacao: "segunda passada do julgamento" },
    ],
  };
}
