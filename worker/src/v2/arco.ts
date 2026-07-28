// Engine V2 — arco de longo alcance: atos, promessas, fios e arcos de personagem.
//
// Antes: `fios` era lista de NOMES, arco de personagem era string de 25 palavras,
// `promessa_editorial` era gravada e nunca relida, e atos/virada/escalada não
// existiam no schema. Nada disso era verificável.
//
// Aqui os quatro viram OBJETOS com invariantes que o código confere. As invariantes
// são de ESTRUTURA (a grade cobre 1..N? a promessa é paga depois de plantada?), nunca
// de gosto — julgamento continua sendo do revisor.
//
// Fundação v2 (sem a seção `arco`) permanece válida: tudo aqui é no-op com aviso
// quando `arco` está ausente. Nenhum livro em andamento quebra.

import type {
  ArcoFundacao,
  ArcoPersonagem,
  FioArco,
  Promessa,
  ResultadoGate,
  SceneSpec,
  SkillContract,
} from "./tipos.js";

export interface ViolacaoArco {
  /** Objeto violado: "atos", "promessa:P3", "fio:investigacao", "arco:Marina". */
  alvo: string;
  invariante: string;
  detalhe: string;
}

// ---------------------------------------------------------------------------
// Parse tolerante: fundação v2 (sem `arco`) devolve null, não erro
// ---------------------------------------------------------------------------

function inteiro(v: unknown): number | null {
  return Number.isInteger(v) ? (v as number) : null;
}

function listaInteiros(v: unknown): number[] {
  return Array.isArray(v) ? v.filter((x): x is number => Number.isInteger(x)) : [];
}

/**
 * Extrai a seção `arco` de estrutura.json. Devolve null quando ausente ou
 * estruturalmente irreconhecível — quem decide se isso reprova é o portão da
 * fundação (fatia D), que sabe a versão do schema.
 */
export function parsearArco(cru: unknown): ArcoFundacao | null {
  if (typeof cru !== "object" || cru === null) return null;
  const a = (cru as { arco?: unknown }).arco;
  if (typeof a !== "object" || a === null) return null;
  const o = a as Record<string, unknown>;

  const atos = (Array.isArray(o.atos) ? o.atos : [])
    .map((x) => {
      const r = x as Record<string, unknown>;
      const numero = inteiro(r.numero);
      const cap_inicio = inteiro(r.cap_inicio);
      const cap_fim = inteiro(r.cap_fim);
      if (numero === null || cap_inicio === null || cap_fim === null) return null;
      return {
        numero,
        cap_inicio,
        cap_fim,
        funcao: String(r.funcao ?? ""),
        tensao_alvo: inteiro(r.tensao_alvo) ?? 0,
      };
    })
    .filter((x): x is ArcoFundacao["atos"][number] => x !== null);

  const promessas = (Array.isArray(o.promessas) ? o.promessas : [])
    .map((x) => {
      const r = x as Record<string, unknown>;
      const id = typeof r.id === "string" ? r.id : null;
      if (!id) return null;
      return {
        id,
        enunciado: String(r.enunciado ?? ""),
        plantada_em: inteiro(r.plantada_em) ?? 0,
        reforcada_em: listaInteiros(r.reforcada_em),
        paga_em: inteiro(r.paga_em) ?? 0,
      };
    })
    .filter((x): x is Promessa => x !== null);

  const fios = (Array.isArray(o.fios) ? o.fios : [])
    .map((x) => {
      const r = x as Record<string, unknown>;
      const id = typeof r.id === "string" ? r.id : null;
      if (!id) return null;
      return {
        id,
        nome: String(r.nome ?? id),
        abre: inteiro(r.abre) ?? 0,
        escalada: listaInteiros(r.escalada),
        climax: inteiro(r.climax) ?? 0,
        fecha: inteiro(r.fecha) ?? 0,
      };
    })
    .filter((x): x is FioArco => x !== null);

  const arcos = (Array.isArray(o.arcos) ? o.arcos : [])
    .map((x) => {
      const r = x as Record<string, unknown>;
      const personagem = typeof r.personagem === "string" ? r.personagem : null;
      if (!personagem) return null;
      const marcos = (Array.isArray(r.marcos) ? r.marcos : [])
        .map((m) => {
          const mm = m as Record<string, unknown>;
          const capitulo = inteiro(mm.capitulo);
          if (capitulo === null) return null;
          return { capitulo, estado: String(mm.estado ?? "") };
        })
        .filter((m): m is { capitulo: number; estado: string } => m !== null);
      return { personagem, marcos };
    })
    .filter((x): x is ArcoPersonagem => x !== null);

  if (!atos.length && !promessas.length && !fios.length && !arcos.length) return null;
  return { atos, promessas, fios, arcos };
}

// ---------------------------------------------------------------------------
// Invariantes (spec §2)
// ---------------------------------------------------------------------------

/** Atos cobrem 1..N sem furo nem sobreposição, e a tensão-alvo é 1–5. */
export function validarAtos(atos: ArcoFundacao["atos"], total: number): ViolacaoArco[] {
  const v: ViolacaoArco[] = [];
  if (!atos.length) {
    return [{ alvo: "atos", invariante: "grade de atos existe", detalhe: "nenhum ato declarado" }];
  }
  const ordenados = [...atos].sort((a, b) => a.cap_inicio - b.cap_inicio);
  let esperado = 1;
  for (const a of ordenados) {
    if (a.cap_inicio !== esperado) {
      v.push({
        alvo: `ato:${a.numero}`,
        invariante: "atos cobrem 1..N sem furo nem sobreposição",
        detalhe: `ato ${a.numero} começa no capítulo ${a.cap_inicio}; esperado ${esperado}`,
      });
    }
    if (a.cap_fim < a.cap_inicio) {
      v.push({
        alvo: `ato:${a.numero}`,
        invariante: "cap_fim >= cap_inicio",
        detalhe: `ato ${a.numero}: ${a.cap_inicio}..${a.cap_fim}`,
      });
    }
    if (a.tensao_alvo < 1 || a.tensao_alvo > 5) {
      v.push({
        alvo: `ato:${a.numero}`,
        invariante: "tensao_alvo entre 1 e 5",
        detalhe: `ato ${a.numero}: tensao_alvo = ${a.tensao_alvo}`,
      });
    }
    esperado = Math.max(esperado, a.cap_fim + 1);
  }
  const ultimo = ordenados[ordenados.length - 1];
  if (ultimo.cap_fim !== total) {
    v.push({
      alvo: "atos",
      invariante: "atos cobrem 1..N sem furo nem sobreposição",
      detalhe: `último ato termina no capítulo ${ultimo.cap_fim}; o livro tem ${total}`,
    });
  }
  return v;
}

/** Toda promessa é plantada antes de ser paga, e nenhuma fica sem pagamento. */
export function validarPromessas(promessas: Promessa[], total: number): ViolacaoArco[] {
  const v: ViolacaoArco[] = [];
  const vistos = new Set<string>();
  for (const p of promessas) {
    const alvo = `promessa:${p.id}`;
    if (vistos.has(p.id)) {
      v.push({ alvo, invariante: "id de promessa é único", detalhe: `id "${p.id}" repetido` });
    }
    vistos.add(p.id);
    if (p.plantada_em < 1 || p.plantada_em > total) {
      v.push({ alvo, invariante: "1 <= plantada_em <= N", detalhe: `plantada_em = ${p.plantada_em} (N = ${total})` });
    }
    if (!p.paga_em) {
      v.push({
        alvo,
        invariante: "toda promessa é paga antes do fim",
        detalhe: `"${p.enunciado}" plantada no capítulo ${p.plantada_em} e nunca paga`,
      });
      continue;
    }
    if (p.paga_em > total) {
      v.push({ alvo, invariante: "paga_em <= N", detalhe: `paga_em = ${p.paga_em} (N = ${total})` });
    }
    if (p.paga_em <= p.plantada_em) {
      v.push({
        alvo,
        invariante: "plantio antes do pagamento",
        detalhe: `plantada no capítulo ${p.plantada_em} e paga no ${p.paga_em}`,
      });
    }
    for (const r of p.reforcada_em) {
      if (r <= p.plantada_em || r > p.paga_em) {
        v.push({
          alvo,
          invariante: "reforço entre o plantio e o pagamento",
          detalhe: `reforço no capítulo ${r}, fora de (${p.plantada_em}, ${p.paga_em}]`,
        });
      }
    }
  }
  return v;
}

/** Todo fio abre, escala, chega ao clímax e fecha — nessa ordem, dentro de 1..N. */
export function validarFios(fios: FioArco[], total: number): ViolacaoArco[] {
  const v: ViolacaoArco[] = [];
  if (!fios.length) {
    return [{ alvo: "fios", invariante: "existe ao menos um fio", detalhe: "nenhum fio declarado" }];
  }
  for (const f of fios) {
    const alvo = `fio:${f.id}`;
    if (f.abre < 1 || f.fecha > total) {
      v.push({ alvo, invariante: "fio dentro de 1..N", detalhe: `abre ${f.abre}, fecha ${f.fecha} (N = ${total})` });
    }
    if (!f.fecha) {
      v.push({ alvo, invariante: "todo fio tem fechamento", detalhe: `fio "${f.nome}" abre em ${f.abre} e nunca fecha` });
      continue;
    }
    // Escalada vazia = fio que abre e fecha sem nunca subir de aposta. O check de
    // ordem abaixo aceitava a lista vazia (usava `abre` como substituto), então um
    // fio sem um único passo intermediário passava pelo portão.
    if (!f.escalada.length) {
      v.push({
        alvo,
        invariante: "todo fio tem escalada não vazia",
        detalhe: `fio "${f.nome}" abre em ${f.abre} e vai direto ao clímax em ${f.climax}, sem nenhum passo de escalada`,
      });
    }
    const escalaMin = f.escalada.length ? Math.min(...f.escalada) : f.abre;
    const escalaMax = f.escalada.length ? Math.max(...f.escalada) : f.abre;
    if (!(f.abre <= escalaMin && escalaMax <= f.climax && f.climax <= f.fecha)) {
      v.push({
        alvo,
        invariante: "abre <= escalada <= climax <= fecha",
        detalhe: `abre ${f.abre}, escalada [${f.escalada.join(", ")}], climax ${f.climax}, fecha ${f.fecha}`,
      });
    }
  }
  return v;
}

/**
 * Arco de personagem tem marcos cobrindo começo, meio e fim — o substituto
 * verificável da string de 25 palavras que existia antes.
 */
export function validarArcosPersonagem(arcos: ArcoPersonagem[], total: number): ViolacaoArco[] {
  const v: ViolacaoArco[] = [];
  const limiteInicio = Math.ceil(total * 0.25);
  const limiteFim = Math.ceil(total * 0.8);
  for (const a of arcos) {
    const alvo = `arco:${a.personagem}`;
    if (a.marcos.length < 3) {
      v.push({
        alvo,
        invariante: "arco tem ao menos 3 marcos",
        detalhe: `${a.personagem}: ${a.marcos.length} marco(s)`,
      });
      continue;
    }
    const caps = a.marcos.map((m) => m.capitulo);
    if (!caps.some((c) => c <= limiteInicio)) {
      v.push({
        alvo,
        invariante: "marco no primeiro quarto do livro",
        detalhe: `${a.personagem}: primeiro marco no capítulo ${Math.min(...caps)} (esperado <= ${limiteInicio})`,
      });
    }
    if (!caps.some((c) => c >= limiteFim)) {
      v.push({
        alvo,
        invariante: "marco no último quinto do livro",
        detalhe: `${a.personagem}: último marco no capítulo ${Math.max(...caps)} (esperado >= ${limiteFim})`,
      });
    }
    if (!caps.some((c) => c > limiteInicio && c < limiteFim)) {
      v.push({
        alvo,
        invariante: "marco no miolo do livro",
        detalhe: `${a.personagem}: nenhum marco entre os capítulos ${limiteInicio + 1} e ${limiteFim - 1}`,
      });
    }
  }
  return v;
}

/** Todas as invariantes do arco, de uma vez. */
export function validarArco(arco: ArcoFundacao, total: number): ViolacaoArco[] {
  return [
    ...validarAtos(arco.atos, total),
    ...validarPromessas(arco.promessas, total),
    ...validarFios(arco.fios, total),
    ...validarArcosPersonagem(arco.arcos, total),
  ];
}

// ---------------------------------------------------------------------------
// Gate: promessa plantada e nunca paga (pré-consolidação)
// ---------------------------------------------------------------------------

export interface PromessaPendente {
  promessa: Promessa;
  motivo: "sem_pagamento_declarado" | "capitulo_de_pagamento_nao_aprovado" | "nenhuma_ficha_paga";
}

/**
 * Promessa que o livro abriu e não fechou. Duas fontes de verdade, nesta ordem:
 * 1. a fundação declara `paga_em`; se não declara, a promessa nasce quebrada;
 * 2. o capítulo que deveria pagá-la existe, foi aprovado, e ALGUMA ficha aprovada
 *    marcou a promessa como paga (`promessas_tocadas` com acao "paga").
 *
 * A checagem 2 é o que separa "o plano previa pagar" de "o livro pagou".
 */
export function promessasNaoPagas(
  promessas: Promessa[],
  fichasAprovadas: { capitulo: number; ficha: SceneSpec }[]
): PromessaPendente[] {
  const capsAprovados = new Set(fichasAprovadas.map((f) => f.capitulo));
  const pagasPorFicha = new Set<string>();
  for (const { ficha } of fichasAprovadas) {
    for (const t of ficha.promessas_tocadas ?? []) {
      if (t.acao === "paga") pagasPorFicha.add(t.id);
    }
  }
  const out: PromessaPendente[] = [];
  for (const p of promessas) {
    if (!p.paga_em) {
      out.push({ promessa: p, motivo: "sem_pagamento_declarado" });
      continue;
    }
    if (!capsAprovados.has(p.paga_em)) {
      out.push({ promessa: p, motivo: "capitulo_de_pagamento_nao_aprovado" });
      continue;
    }
    // A ficha só é fonte de verdade quando o livro USA `promessas_tocadas`
    // (fundação v3 + fichas novas). Livro sem nenhuma marcação não é punido aqui:
    // a declaração da fundação basta, e o revisor julga o pagamento na página.
    if (pagasPorFicha.size > 0 && !pagasPorFicha.has(p.id)) {
      out.push({ promessa: p, motivo: "nenhuma_ficha_paga" });
    }
  }
  return out;
}

export function gatePromessaNaoPaga(
  promessas: Promessa[],
  fichasAprovadas: { capitulo: number; ficha: SceneSpec }[]
): ResultadoGate {
  const pendentes = promessasNaoPagas(promessas, fichasAprovadas);
  return {
    gate: "promessa_nao_paga",
    passou: pendentes.length === 0,
    evidencia: pendentes.length
      ? pendentes
          .map(
            (p) =>
              `${p.promessa.id} ("${p.promessa.enunciado}", plantada no capítulo ${p.promessa.plantada_em}): ${p.motivo}`
          )
          .join(" · ")
      : undefined,
  };
}

// ---------------------------------------------------------------------------
// Gate: rotação de POV (o contrato declarava e nada aplicava)
// ---------------------------------------------------------------------------

/**
 * Aplica `pov.rotacao` do contrato — validado no schema desde sempre e NUNCA
 * executado. Duas regras, ambas dentro de uma janela deslizante:
 *
 * - `max_caps_mesmo_fio`: quantos capítulos seguidos o mesmo fio pode ocupar;
 * - `max_caps_fio_ausente`: quantos capítulos seguidos um fio pode ficar de fora.
 *   É aqui que `fios_ausentes` da ficha ganha o consumidor que nunca teve: um fio
 *   declarado ausente capítulo após capítulo é subtrama abandonada.
 *
 * Contrato sem `rotacao` (ex.: hoover, narradora única em 1ª pessoa) = no-op.
 */
export function gateRotacaoPov(
  capitulo: number,
  fichaAtual: SceneSpec,
  anteriores: { capitulo: number; ficha: SceneSpec }[],
  contrato: SkillContract
): ResultadoGate {
  const rot = contrato.pov.rotacao;
  if (!rot) return { gate: "rotacao_pov_violada", passou: true };

  const serie = [...anteriores.filter((a) => a.capitulo < capitulo), { capitulo, ficha: fichaAtual }].sort(
    (a, b) => a.capitulo - b.capitulo
  );
  const problemas: string[] = [];

  // 1. Fio repetido em capítulos consecutivos.
  const fioDe = (f: SceneSpec) => f.fios_avancados?.[0] ?? f.pov;
  let seguidos = 1;
  for (let i = serie.length - 2; i >= 0; i--) {
    if (fioDe(serie[i].ficha) === fioDe(fichaAtual)) seguidos++;
    else break;
  }
  const maxMesmo = rot.max_caps_mesmo_fio;
  if (maxMesmo != null && seguidos > maxMesmo) {
    problemas.push(
      `fio "${fioDe(fichaAtual)}" ocupa ${seguidos} capítulos seguidos (máx ${maxMesmo}) — capítulos ${serie
        .slice(-seguidos)
        .map((s) => s.capitulo)
        .join(", ")}`
    );
  }

  // 2. Fio ausente por capítulos consecutivos (consumidor de `fios_ausentes`).
  const maxAusente = rot.max_caps_fio_ausente;
  if (maxAusente != null) {
    const janela = rot.janela ?? serie.length;
    const recentes = serie.slice(-janela);
    const conhecidos = new Set<string>();
    for (const s of serie) {
      for (const f of s.ficha.fios_avancados ?? []) conhecidos.add(f);
      for (const f of s.ficha.fios_ausentes ?? []) conhecidos.add(f);
    }
    for (const fio of conhecidos) {
      // Conta desde o fim: há quantos capítulos este fio não avança?
      let ausenteHa = 0;
      for (let i = recentes.length - 1; i >= 0; i--) {
        if ((recentes[i].ficha.fios_avancados ?? []).includes(fio)) break;
        ausenteHa++;
      }
      // Só cobra fios que já apareceram (um fio que ainda não abriu não está abandonado).
      const jaApareceu = serie.some((s) => (s.ficha.fios_avancados ?? []).includes(fio));
      if (jaApareceu && ausenteHa > maxAusente) {
        problemas.push(`fio "${fio}" ausente há ${ausenteHa} capítulos (máx ${maxAusente})`);
      }
    }
  }

  return {
    gate: "rotacao_pov_violada",
    passou: problemas.length === 0,
    evidencia: problemas.length ? problemas.join(" · ") : undefined,
  };
}

// ---------------------------------------------------------------------------
// Entrega do arco no pacote de quem planeja
// ---------------------------------------------------------------------------

/** Recorte do arco que interessa ao capítulo em curso — não a fundação inteira. */
export function renderizarArcoParaCapitulo(arco: ArcoFundacao, capitulo: number): string {
  const linhas: string[] = [];
  const ato = arco.atos.find((a) => capitulo >= a.cap_inicio && capitulo <= a.cap_fim);
  if (ato) {
    linhas.push(
      `ATO ${ato.numero} (capítulos ${ato.cap_inicio}–${ato.cap_fim}) · função: ${ato.funcao} · tensão-alvo: ${ato.tensao_alvo}/5`
    );
  }

  const emAberto = arco.promessas.filter((p) => p.plantada_em <= capitulo && p.paga_em >= capitulo);
  if (emAberto.length) {
    linhas.push("", "PROMESSAS EM ABERTO (plantadas e ainda não pagas):");
    for (const p of emAberto) {
      const acao =
        p.paga_em === capitulo
          ? "PAGA NESTE CAPÍTULO"
          : p.reforcada_em.includes(capitulo)
            ? "reforçar aqui"
            : p.plantada_em === capitulo
              ? "PLANTAR NESTE CAPÍTULO"
              : `pagar no capítulo ${p.paga_em}`;
      linhas.push(`- [${p.id}] ${p.enunciado} → ${acao}`);
    }
  }

  const fiosVivos = arco.fios.filter((f) => f.abre <= capitulo && f.fecha >= capitulo);
  if (fiosVivos.length) {
    linhas.push("", "FIOS VIVOS:");
    for (const f of fiosVivos) {
      const marca =
        f.climax === capitulo ? " ← CLÍMAX AQUI" : f.fecha === capitulo ? " ← FECHA AQUI" : f.abre === capitulo ? " ← ABRE AQUI" : "";
      linhas.push(`- [${f.id}] ${f.nome} (abre ${f.abre}, clímax ${f.climax}, fecha ${f.fecha})${marca}`);
    }
  }

  const marcos = arco.arcos
    .map((a) => ({ personagem: a.personagem, marco: a.marcos.find((m) => m.capitulo === capitulo) }))
    .filter((x) => x.marco);
  if (marcos.length) {
    linhas.push("", "MARCOS DE ARCO NESTE CAPÍTULO:");
    for (const m of marcos) linhas.push(`- ${m.personagem}: ${m.marco!.estado}`);
  }

  return linhas.length ? linhas.join("\n") : "(fundação sem grade de arco)";
}
