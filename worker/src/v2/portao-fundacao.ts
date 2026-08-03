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
import type { ArcoFundacao, ResultadoGate, SkillContract } from "./tipos.js";

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

// ---------------------------------------------------------------------------
// Detectores do portão (puros; cada um sustenta um bloqueio nomeado)
// ---------------------------------------------------------------------------

/** Limiar alto de propósito: só acusa função REALMENTE intercambiável. */
export const LIMIAR_RESUMO_SIMILAR = 0.75;

function tokensRelevantes(texto: string): Set<string> {
  const vazias = new Set([
    "a", "o", "as", "os", "de", "da", "do", "das", "dos", "e", "em", "no", "na", "nos", "nas",
    "um", "uma", "para", "com", "que", "se", "por", "ao", "à", "as", "ele", "ela", "seu", "sua",
  ]);
  return new Set(
    normalizarNome(texto)
      .split(/\s+/)
      .filter((t) => t.length > 2 && !vazias.has(t))
  );
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter++;
  return inter / (a.size + b.size - inter);
}

/** Pares de capítulos cujo resumo estrutural descreve a mesma função. */
export function paresDeResumosSimilares(
  estrutura: { capitulo: number; resumo_estrutural: string }[],
  limiar = LIMIAR_RESUMO_SIMILAR
): { a: number; b: number; similaridade: number }[] {
  const uteis = estrutura
    .map((e) => ({ capitulo: e.capitulo, tokens: tokensRelevantes(e.resumo_estrutural), bruto: e.resumo_estrutural.trim() }))
    .filter((e) => e.bruto.length > 20);
  const out: { a: number; b: number; similaridade: number }[] = [];
  for (let i = 0; i < uteis.length; i++) {
    for (let j = i + 1; j < uteis.length; j++) {
      const s = jaccard(uteis[i].tokens, uteis[j].tokens);
      if (s >= limiar) out.push({ a: uteis[i].capitulo, b: uteis[j].capitulo, similaridade: s });
    }
  }
  return out.sort((x, y) => y.similaridade - x.similaridade);
}

/**
 * Invariância explícita: o autor pode declarar que um personagem central NÃO
 * muda — mas tem de dizer isso e por quê. Silêncio nunca conta como declaração.
 */
export function declaraInvariancia(arco: string | undefined): boolean {
  const t = (arco ?? "").trim();
  if (t.length < 20) return false;
  return /invari[aá]|n[aã]o muda|n[aã]o se transforma|permanece o mesmo|imut[aá]vel|sem arco/i.test(t);
}

/**
 * Tensão que escala: não basta cada ato estar na faixa 1–5 (o que já era
 * validado). O pico tem de ser maior que a abertura e a série não pode ser plana.
 */
export function progressaoDeTensao(
  atos: { numero: number; cap_inicio: number; tensao_alvo: number }[]
): { progride: boolean; detalhe: string } {
  if (atos.length < 2) return { progride: true, detalhe: "menos de dois atos: progressão não aplicável" };
  const serie = [...atos].sort((a, b) => a.cap_inicio - b.cap_inicio).map((a) => a.tensao_alvo);
  const primeira = serie[0];
  const pico = Math.max(...serie);
  if (serie.every((t) => t === primeira)) {
    return { progride: false, detalhe: `todos os atos com tensao_alvo = ${primeira} (série plana)` };
  }
  if (pico <= primeira) {
    return { progride: false, detalhe: `pico de tensão (${pico}) não supera a abertura (${primeira}) — série [${serie.join(", ")}]` };
  }
  return { progride: true, detalhe: `[${serie.join(", ")}]` };
}

/**
 * Promessas centrais pagas antes do último ato deixam o desfecho sem o que
 * resolver. "Central" = promessa cujo plantio está no primeiro ato.
 */
export function promessasForaDoDesfecho(arco: ArcoFundacao, total: number): string[] {
  if (!arco.atos.length) return [];
  const ultimoAto = [...arco.atos].sort((a, b) => a.cap_inicio - b.cap_inicio)[arco.atos.length - 1];
  const primeiroAto = [...arco.atos].sort((a, b) => a.cap_inicio - b.cap_inicio)[0];
  return arco.promessas
    .filter((p) => p.plantada_em <= primeiroAto.cap_fim)
    .filter((p) => p.paga_em > 0 && p.paga_em < ultimoAto.cap_inicio && p.paga_em <= total)
    .map((p) => `${p.id} (paga no cap ${p.paga_em}; último ato começa no ${ultimoAto.cap_inicio})`);
}

/** Documento exigido que existe mas não diz nada. */
export function motivoDocInsubstancial(conteudo: string): string | null {
  const t = (conteudo ?? "").trim();
  if (!t) return "vazio";
  const linhas = t.split(/\r?\n/);
  const trecho = (linha: string) => {
    const limpo = linha.replace(/\s+/g, " ").trim();
    return limpo.length > 120 ? `${limpo.slice(0, 117)}…` : limpo;
  };

  // Marcadores inequívocos podem aparecer no meio de uma frase/linha. A
  // evidência cita o marcador e o trecho exatos para que o retry saiba o que
  // corrigir — e para que o diagnóstico não dependa de adivinhação.
  const fortes = [
    // Case-sensitive de propósito: "todo" é palavra corrente em português.
    { regex: /\bTODO\b/, rotulo: "TODO" },
    { regex: /\bTBD\b/i, rotulo: "TBD" },
    { regex: /\bLOREM IPSUM\b/i, rotulo: "LOREM IPSUM" },
    { regex: /\bPLACEHOLDER\b/i, rotulo: "PLACEHOLDER" },
  ];
  for (const linha of linhas) {
    for (const forte of fortes) {
      const achado = forte.regex.exec(linha);
      if (achado) {
        return `contém marcador forte "${forte.rotulo}" no trecho "${trecho(linha)}"`;
      }
    }
  }

  // Reticências fazem parte da prosa normal; só são placeholder quando ocupam
  // sozinhas uma linha (eventualmente como item de lista). "A definir" também
  // só bloqueia como valor isolado/campo, não em frases como
  // "não há nada a definir".
  for (const linha of linhas) {
    if (/^\s*(?:[-*+]\s*)?(?:\.{3}|…)\s*$/.test(linha)) {
      return `contém marcador isolado "${trecho(linha)}"`;
    }
    if (
      /^\s*(?:[-*+]\s*)?(?:(?:[^:\n]{1,60}):\s*)?(?:a definir|preencher|em branco)[.!]?\s*$/i.test(linha)
    ) {
      return `contém campo sem valor no trecho "${trecho(linha)}"`;
    }
  }

  const semTitulos = t
    .split("\n")
    .filter((l) => !/^\s*#{1,6}\s/.test(l))
    .join(" ")
    .trim();
  const palavras = semTitulos.split(/\s+/).filter(Boolean).length;
  if (palavras < 40) return `${palavras} palavra(s) de conteúdo fora dos títulos (mínimo 40)`;
  return null;
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

  // --- 8. O que a fundação PROMETE ao leitor (bloqueante) --------------------
  // Antes eram avisos: uma promessa editorial vazia, um livro sem antagonista e
  // capítulos intercambiáveis passavam pelo portão e viravam 40 capítulos.
  if (!f.promessa_editorial.trim()) {
    bloqueios.push({
      codigo: "PROMESSA_EDITORIAL_VAZIA",
      mensagem: "promessa_editorial vazia: a fundação não declara o que o livro promete ao leitor",
      severidade: "critical",
    });
  }
  if (!/antagonista|vil[aã]o|advers[aá]ri|for[cç]a antagon/i.test(f.biblia) && !f.mapa_personagens.some((p) => /antagonista/i.test(p.papel))) {
    bloqueios.push({
      codigo: "ANTAGONISTA_AUSENTE",
      mensagem: "nenhum antagonista nem força antagônica identificável na bíblia ou no mapa de personagens",
      severidade: "critical",
    });
  }

  // Funções de capítulo intercambiáveis: resumos idênticos OU quase iguais.
  // Comparar só igualdade literal deixava passar a paráfrase — que é justamente
  // como um modelo raso preenche 40 linhas de estrutura.
  const similares = paresDeResumosSimilares(f.estrutura);
  if (similares.length) {
    bloqueios.push({
      codigo: "FUNCOES_CAPITULO_REPETIDAS",
      mensagem:
        `capítulos com função intercambiável (resumo estrutural quase igual): ` +
        similares.slice(0, 6).map((s) => `${s.a}≈${s.b} (${Math.round(s.similaridade * 100)}%)`).join(", "),
      severidade: "critical",
    });
  }

  if (!/virada|reviravolta|twist|revela[cç][aã]o/i.test(f.biblia + f.estrutura.map((e) => e.resumo_estrutural).join(" "))) {
    avisos.push("nenhuma virada/reviravolta declarada na bíblia ou na estrutura (estrutura possivelmente episódica)");
  }

  // --- 9. Arco de personagem OU invariância explícita ------------------------
  // O padrão exigido depende do schema: com grade de arco (v3), o personagem
  // central precisa de MARCOS verificáveis; sem grade (v2, livros em produção),
  // a descrição textual do arco basta. Em ambos, invariância vale — desde que
  // declarada e justificada. O que nunca vale é o silêncio.
  const centrais = f.mapa_personagens.filter((p) => /protagonista|antagonista/i.test(p.papel));
  const comArcoNaGrade = new Set((f.arco?.arcos ?? []).map((a) => normalizarNome(a.personagem)));
  const semArco = centrais.filter((p) => {
    if (declaraInvariancia(p.arco)) return false;
    return f.arco ? !comArcoNaGrade.has(normalizarNome(p.nome)) : (p.arco ?? "").trim().length < 20;
  });
  if (semArco.length) {
    bloqueios.push({
      codigo: "ARCO_PERSONAGEM_AUSENTE",
      mensagem:
        `personagem(ns) central(is) sem arco verificável e sem justificativa explícita de invariância: ` +
        `${semArco.map((p) => p.nome).join(", ")}. ` +
        (f.arco
          ? `Declare marcos em arco.arcos, ou explicite no campo "arco" por que este personagem NÃO muda.`
          : `Descreva o arco no campo "arco" do mapa, ou explicite por que este personagem NÃO muda.`),
      severidade: "critical",
    });
  }

  // --- 10. Arco v3: promessa concreta, tensão que escala, clímax que paga ----
  if (f.arco) {
    if (f.arco.promessas.length === 0) {
      bloqueios.push({
        codigo: "PROMESSA_NARRATIVA_AUSENTE",
        mensagem: "a grade de arco não declara nenhuma promessa narrativa concreta (id, enunciado, plantio, pagamento)",
        severidade: "critical",
      });
    }
    const prog = progressaoDeTensao(f.arco.atos);
    if (!prog.progride) {
      bloqueios.push({
        codigo: "TENSAO_SEM_PROGRESSAO",
        mensagem: `a tensão não escala entre os atos: ${prog.detalhe}`,
        severidade: "critical",
      });
    }
    const semPagamentoNoFim = promessasForaDoDesfecho(f.arco, total);
    if (semPagamentoNoFim.length) {
      bloqueios.push({
        codigo: "CLIMAX_NAO_PAGA_PROMESSAS",
        mensagem:
          `clímax/resolução não pagam as promessas centrais: ${semPagamentoNoFim.join(", ")} ` +
          `são pagas antes do último ato, deixando o desfecho sem o que resolver`,
        severidade: "high",
      });
    }
  }

  // --- 11. Docs exigidos: substantivos, não placeholders ---------------------
  for (const [nome, conteudo] of Object.entries(f.docs_exigidos ?? {})) {
    const motivo = motivoDocInsubstancial(conteudo);
    if (motivo) {
      bloqueios.push({
        codigo: "DOC_PLACEHOLDER",
        mensagem: `documento exigido "${nome}" não é substantivo: ${motivo}`,
        severidade: "critical",
      });
    }
  }

  return { bloqueios, avisos, capitulosEstrutura: numeros.length };
}

// ---------------------------------------------------------------------------
// Duas passadas: o que a MACRO já basta para julgar, e a coerência macro × micro
// ---------------------------------------------------------------------------

/** Bloqueios que dependem da estrutura capítulo a capítulo (só existem na micro). */
const CODIGOS_DA_MICRO = new Set([
  "ESTRUTURA_CAPITULOS_INCOERENTES",
  "FIO_DESCONHECIDO",
  "FUNCOES_CAPITULO_REPETIDAS",
]);

/**
 * Avalia SÓ a macro (passada 1): tudo o que não depende da linha por capítulo.
 * Rodar isto antes da micro é o que evita gastar a geração da estrutura inteira
 * sobre um arco que já nasceu quebrado — e o que permite regenerar só a micro
 * quando é só a micro que falha.
 */
export function avaliarMacroFundacao(
  macro: Omit<FundacaoV2, "estrutura">,
  contrato: SkillContract,
  total: number,
  docsPresentes: string[] = []
): AvaliacaoFundacaoV2 {
  const av = avaliarFundacaoV2({ ...macro, estrutura: [] }, contrato, total, docsPresentes);
  return {
    ...av,
    bloqueios: av.bloqueios.filter((b) => !CODIGOS_DA_MICRO.has(b.codigo)),
  };
}

/**
 * Macro e micro não podem se contradizer. A micro é detalhamento: se ela aponta
 * um fio que a macro não declarou, ou coloca o pagamento de uma promessa num
 * capítulo que a macro reservou para outra coisa, o plano está incoerente.
 */
export function gateMacroMicroCoerentes(f: FundacaoV2): BloqueioFundacao[] {
  const out: BloqueioFundacao[] = [];
  if (!f.arco) return out;

  const capitulos = new Set(f.estrutura.map((e) => e.capitulo));
  const fiosDoCapitulo = new Map(
    f.estrutura.map((e) => [
      e.capitulo,
      new Set([e.fio, ...(e.fios_avancados ?? [])].map(normalizarNome)),
    ])
  );
  const fiosNaEstrutura = new Set(
    f.estrutura.flatMap((e) => [e.fio, ...(e.fios_avancados ?? [])].map(normalizarNome))
  );
  const nomesDoFio = (fio: { id: string; nome: string }) => [normalizarNome(fio.nome), normalizarNome(fio.id)];
  const problemas: string[] = [];

  // 1. FIOS — todo fio da macro ocupa capítulos na micro.
  for (const fio of f.arco.fios) {
    if (!nomesDoFio(fio).some((n) => fiosNaEstrutura.has(n))) {
      problemas.push(`fio "${fio.nome}" da macro não ocupa um único capítulo da estrutura`);
    }
  }
  // Fio declarado na micro que a macro não conhece: a micro inventou subtrama.
  const fiosDaMacro = new Set(f.arco.fios.flatMap(nomesDoFio));
  for (const nome of fiosNaEstrutura) {
    if (nome && fiosDaMacro.size > 0 && !fiosDaMacro.has(nome)) {
      problemas.push(`estrutura usa o fio "${nome}", que a grade de arco não declara`);
    }
  }

  // 2. FIOS — abertura, escalada, clímax e fechamento caem em capítulos reais,
  //    e entre os fios avançados naquele capítulo. `fio` é apenas o principal:
  //    clímax e fechamento frequentemente fazem vários fios convergirem.
  for (const fio of f.arco.fios) {
    const marcos: [string, number][] = [
      ["abre", fio.abre],
      ...fio.escalada.map((c, i) => [`escalada[${i}]`, c] as [string, number]),
      ["clímax", fio.climax],
      ["fecha", fio.fecha],
    ];
    for (const [rotulo, cap] of marcos) {
      if (!cap) continue;
      if (!capitulos.has(cap)) {
        problemas.push(`fio "${fio.nome}" ${rotulo} no capítulo ${cap}, que a estrutura não declara`);
        continue;
      }
      const fiosDaMicro = fiosDoCapitulo.get(cap);
      if (fiosDaMicro && !nomesDoFio(fio).some((nome) => fiosDaMicro.has(nome))) {
        problemas.push(
          `fio "${fio.nome}" ${rotulo} no capítulo ${cap}, mas a estrutura não o inclui em fios_avancados ` +
          `(declarou: ${[...fiosDaMicro].join(", ") || "nenhum"})`
        );
      }
    }
  }

  // 3. PROMESSAS — plantio, reforço e pagamento caem em capítulos declarados.
  for (const p of f.arco.promessas) {
    const pontos: [string, number][] = [
      ["plantada_em", p.plantada_em],
      ...p.reforcada_em.map((c, i) => [`reforcada_em[${i}]`, c] as [string, number]),
      ["paga_em", p.paga_em],
    ];
    for (const [rotulo, cap] of pontos) {
      if (cap > 0 && !capitulos.has(cap)) {
        problemas.push(`promessa ${p.id} tem ${rotulo}=${cap}, capítulo que a estrutura não declara`);
      }
    }
  }

  // 4. MARCOS DE ARCO — cada marco cai num capítulo que a micro declara.
  for (const a of f.arco.arcos) {
    for (const m of a.marcos) {
      if (!capitulos.has(m.capitulo)) {
        problemas.push(`arco de "${a.personagem}" tem marco no capítulo ${m.capitulo}, que a estrutura não declara`);
      }
    }
  }

  // 5. ATOS — a grade cobre exatamente os capítulos que a micro declara.
  if (f.arco.atos.length && f.estrutura.length) {
    const cobertos = new Set<number>();
    for (const ato of f.arco.atos) {
      for (let c = ato.cap_inicio; c <= ato.cap_fim; c++) cobertos.add(c);
    }
    const semAto = [...capitulos].filter((c) => !cobertos.has(c)).sort((a, b) => a - b);
    const semCapitulo = [...cobertos].filter((c) => !capitulos.has(c)).sort((a, b) => a - b);
    if (semAto.length) {
      problemas.push(`capítulo(s) da estrutura fora de qualquer ato: ${semAto.slice(0, 8).join(", ")}`);
    }
    if (semCapitulo.length) {
      problemas.push(`ato(s) cobrem capítulo(s) que a estrutura não declara: ${semCapitulo.slice(0, 8).join(", ")}`);
    }
  }

  // 6. CLÍMAX × TENSÃO — o clímax dos fios cai no ato de maior tensão-alvo.
  if (f.arco.atos.length > 1 && f.arco.fios.length) {
    const picoTensao = Math.max(...f.arco.atos.map((a) => a.tensao_alvo));
    const atosDePico = f.arco.atos.filter((a) => a.tensao_alvo === picoTensao);
    const dentroDoPico = (cap: number) => atosDePico.some((a) => cap >= a.cap_inicio && cap <= a.cap_fim);
    const forasDoPico = f.arco.fios
      .filter((fio) => fio.climax > 0 && !dentroDoPico(fio.climax))
      .map((fio) => `fio "${fio.nome}" tem clímax no capítulo ${fio.climax}`);
    // Um fio secundário pode fechar antes; TODOS fora do pico é que denuncia uma
    // grade em que a tensão declarada não corresponde ao desenho dramático.
    if (forasDoPico.length === f.arco.fios.length) {
      problemas.push(
        `nenhum fio tem clímax no ato de maior tensão (${picoTensao}): ${forasDoPico.slice(0, 4).join(", ")}`
      );
    }
  }

  if (problemas.length) {
    out.push({
      codigo: "MACRO_MICRO_CONTRADIZEM",
      mensagem: problemas.slice(0, 8).join(" · "),
      severidade: "critical",
    });
  }
  return out;
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
