// Engine V2 — gates universais (F6).
// Determinísticos, bloqueantes, válidos para QUALQUER skill — nunca medem gosto.
// Sinais editoriais ficam em sinais.ts e só bloqueiam via disposição do revisor.

import {
  contarManeirismos,
  detectarRepeticaoCrossCapitulo,
  entradasLedgerDoCapitulo,
  LIMIAR_NGRAMA_CAP,
  ngramasSobrerepresentados,
  TETO_HUMANO,
} from "../maneirismo.js";
import { detectarRepeticaoLiteral } from "./repeticao.js";
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

/**
 * Repetição quase literal contra capítulos anteriores (verbatim/quase-verbatim).
 *
 * `detectarRepeticaoCrossCapitulo` compara os SLOTS AFORÍSTICOS do capítulo atual
 * contra cada `trecho` anterior — e espera que esses trechos sejam ENTRADAS DE
 * LEDGER (slots curtos), não capítulos inteiros. A V2 sempre lhe entregou o texto
 * completo do capítulo anterior, e com isso o gate ficava INERTE: um slot de ~8
 * shingles contra os ~1500 de um capítulo dá Jaccard ≈0,005, longe do limiar 0,6,
 * e a via verbatim exigiria o capítulo inteiro ser idêntico a uma frase.
 *
 * Aqui o texto anterior é convertido nos seus slots antes da comparação. A
 * conversão é idempotente para quem já passa slots curtos. `maneirismo.ts` não é
 * tocado (alimenta o corpus de calibração hash-bound).
 */
export function gateRepeticaoQuaseLiteral(
  texto: string,
  anteriores: { numero: number; trecho: string }[]
): ResultadoGate {
  const slotsAnteriores = anteriores.flatMap((a) =>
    entradasLedgerDoCapitulo(a.numero, a.trecho).map((e) => ({ numero: e.capitulo, trecho: e.trecho_original }))
  );
  // O detector já aplica limiar interno alto (slots aforísticos + shingles): tudo que
  // ele retorna (verbatim ou quase-verbatim) conta como repetição quase literal.
  const reps = detectarRepeticaoCrossCapitulo(texto, slotsAnteriores);

  // Fatia I, camada 1: além dos slots aforísticos, comparação de FRASE INTEIRA
  // contra TODOS os capítulos anteriores. O detector de slots pega a assinatura
  // reciclada; este pega o parágrafo repetido dez capítulos depois, que passava.
  const literais = detectarRepeticaoLiteral(
    texto,
    anteriores.map((a) => ({ numero: a.numero, texto: a.trecho }))
  );

  const evidencias = [
    ...reps.slice(0, 3).map((r) => `cap ${r.capituloAnterior}: "${r.trecho}"`),
    ...literais.slice(0, 3).map(
      (r) => `cap ${r.capituloAnterior} (${Math.round(r.similaridade * 100)}%): "${r.trechoAtual.slice(0, 90)}" ≈ "${r.trechoAnterior.slice(0, 90)}"`
    ),
  ];
  const passou = evidencias.length === 0;
  return {
    gate: "repeticao_quase_literal",
    passou,
    evidencia: passou ? undefined : evidencias.join(" · "),
  };
}

/**
 * AUTO-REPETIÇÃO acima do TETO HUMANO, em DUAS RÉGUAS — pico e taxa sustentada.
 *
 * 1) PICO (classe 1, `Molde.limiarCap`): o mesmo molde num capítulo acima do
 *    máximo que qualquer janela de 2.500 palavras de três romances publicados
 *    alcançou (ver TETO_HUMANO em maneirismo.ts, medido em 2026-08-05).
 *
 * 2) TAXA SUSTENTADA (classe 2, `Molde.orc10k`): ocorrências por 10.000 palavras
 *    somando TODOS os capítulos escritos, o atual incluído, acima da taxa do
 *    romance humano mais carregado. Existe porque a régua de pico sozinha é
 *    cega ao hábito: o humano ENCOSTA no pico uma vez em 128 janelas, a engine
 *    encosta em todo capítulo e nunca sai da cota. Medido no acervo: o capítulo
 *    1 aprovado do canário 2 tem 7 antíteses em 2.784 palavras — 25,1 por 10 mil
 *    contra 10 do romance humano mais carregado — e passava pelo pico (7 ≤ 8).
 *
 * Duas condições protegem a taxa de virar ruído, e nenhuma delas é número novo:
 *  - a base acumulada tem de ter ao menos UMA JANELA de medição
 *    (`TETO_HUMANO.janela_palavras` = 2.500): `orc10k` foi medido sobre livros
 *    inteiros; aplicá-lo a um trecho menor que a menor unidade medida é erro de
 *    escala, não rigor;
 *  - ocorrência ÚNICA nunca conta: o gate é de auto-REPETIÇÃO, e repetir exige
 *    duas. Sem isso um só "do jeito que" num capítulo (4,2/10k contra teto 1)
 *    reprovaria prosa limpa.
 *
 * Para n-grama (LIMIAR_NGRAMA_CAP) o teto ainda é do acervo de controle: não foi
 * remedido contra prosa humana, e por isso segue só no pico.
 */
export function gateAutoRepeticao(
  texto: string,
  anteriores?: { numero: number; trecho: string }[]
): ResultadoGate {
  const hits: string[] = [];
  const atual = contarManeirismos(texto, undefined, { maxExemplos: 3 });
  for (const p of atual.padroes) {
    if (p.n > p.limiarCap) {
      hits.push(`molde ${p.nome}: ${p.n}× no capítulo (limiar do acervo: ${p.limiarCap}); ex.: ${p.exemplos.join(" · ")}`);
    }
  }

  // Régua 2: taxa acumulada do livro escrito até aqui.
  const acumulado = new Map<string, { n: number; orc10k: number; exemplos: string[] }>();
  let palavras = atual.palavras;
  for (const p of atual.padroes) acumulado.set(p.nome, { n: p.n, orc10k: p.orc10k, exemplos: p.exemplos });
  for (const a of anteriores ?? []) {
    const r = contarManeirismos(a.trecho, undefined, { maxExemplos: 0 });
    palavras += r.palavras;
    for (const p of r.padroes) {
      const acc = acumulado.get(p.nome);
      if (acc) acc.n += p.n;
      else acumulado.set(p.nome, { n: p.n, orc10k: p.orc10k, exemplos: [] });
    }
  }
  const capitulos = 1 + (anteriores?.length ?? 0);
  if (palavras >= TETO_HUMANO.janela_palavras) {
    for (const [nome, acc] of acumulado) {
      if (acc.n < 2) continue;
      const taxa = (acc.n / palavras) * 10_000;
      if (taxa > acc.orc10k) {
        const ex = acc.exemplos.length ? `; ex.: ${acc.exemplos.join(" · ")}` : "";
        hits.push(
          `molde ${nome}: taxa acumulada ${taxa.toFixed(1)}/10k em ${capitulos} capítulo(s) ` +
          `(${acc.n}× em ${palavras} palavras; teto humano do livro: ${acc.orc10k}/10k)${ex}`
        );
      }
    }
  }

  for (const h of ngramasSobrerepresentados(texto)) {
    if (h.n > LIMIAR_NGRAMA_CAP) {
      hits.push(`n-grama "${h.gram}": ${h.n}× no capítulo (limiar do acervo: ${LIMIAR_NGRAMA_CAP})`);
    }
  }
  const passou = hits.length === 0;
  return { gate: "auto_repeticao", passou, evidencia: passou ? undefined : hits.slice(0, 3).join(" · ") };
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

/**
 * Menção literal de conhecimento proibido pela ficha (gatilho determinístico; o auditor
 * factual confirma o caso semântico). Regra anti-falso-positivo (achado do canário 1):
 * - anos puros (\d{4}) NUNCA são termo proibido (quase sempre são contexto compartilhado);
 * - termo que também aparece no vocabulário VISÍVEL da própria ficha (fatos, objetivo,
 *   informação nova etc.) é legítimo — o proibido é o *conteúdo* ("o motivo"), não a palavra.
 * Detector com falso positivo não pode bloquear (lição permanente da auditoria de estilo).
 */
export function gateConhecimentoProibido(texto: string, ficha: SceneSpec): ResultadoGate {
  const vocabularioVisivel = [
    ficha.objetivo,
    ficha.obstaculo,
    ficha.acao_fisica,
    ficha.informacao_nova,
    ficha.virada,
    ficha.mudanca_estado,
    ficha.local,
    ficha.tempo,
    ficha.gancho?.descricao ?? "",
    ...(ficha.fatos_obrigatorios ?? []),
    ...Object.values(ficha.campos_skill ?? {}),
  ].join(" ");
  const hits: string[] = [];
  for (const proibido of ficha.conhecimentos_proibidos) {
    // Só nomes próprios distintivos (capitalizados); nunca anos/números puros.
    // Palavra capitalizada por INÍCIO DE FRASE não é nome próprio ("Nome completo
    // ou histórico…" bloqueava a palavra "Nome" — canário dan-brown 2026-07-27);
    // ela só conta se reaparecer capitalizada em posição não-inicial. O caso
    // semântico continua com o auditor factual.
    const naoIniciais = new Set<string>();
    const reTermo = /\b[A-ZÁÉÍÓÚÂÊÔ][\wáéíóúâêôãõç-]{3,}\b/g;
    let m: RegExpExecArray | null;
    while ((m = reTermo.exec(proibido)) !== null) {
      const antes = proibido.slice(0, m.index);
      const inicioDeFrase = /^\s*$/.test(antes) || /[.!?…:;]["'“”‘’«»)\]]*\s*$/.test(antes);
      if (!inicioDeFrase) naoIniciais.add(m[0]);
    }
    const termos = [...naoIniciais]
      .filter((termo) => !/^(Marina|Ela|Ele|Não|Nada|Ninguém|Quem|Quando|Onde|Motivo|Porque)$/.test(termo));
    for (const termo of termos) {
      const re = new RegExp(`\\b${termo.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "g");
      if (re.test(vocabularioVisivel)) continue; // vocabulário compartilhado da ficha: legítimo
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
  resultados.push(gateAutoRepeticao(texto, entrada.anteriores));
  resultados.push(gatePovImpossivel(texto, entrada.contrato));
  if (entrada.anteriores?.length) resultados.push(gateRepeticaoQuaseLiteral(texto, entrada.anteriores));
  if (entrada.ficha) resultados.push(gateConhecimentoProibido(texto, entrada.ficha));
  return resultados;
}
