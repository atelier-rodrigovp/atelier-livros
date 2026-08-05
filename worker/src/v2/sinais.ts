// Engine V2 — sinais editoriais medidos (F6).
// Os detectores são universais; as COTAS vêm exclusivamente do contrato da skill
// (lição CR4: régua global envenena — o que salva o dan-brown mata o hoover).
// Sinal medido NUNCA bloqueia sozinho: alimenta o parecer do revisor, que dispõe
// cada um (violação confirmada / exceção válida / falso positivo / decisão humana).

import {
  classificarGanchoFinal,
  contarGnomico,
  contarManeirismos,
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
  /** Regra do contrato marcada `sem_excecao`: "excecao_valida" não é admissível. */
  sem_excecao?: boolean;
  /** Piso dispensado por isenção do contrato (com a justificativa declarada). */
  isencao_aplicada?: string;
}

/**
 * Extrai a cota declarada no contrato para um sinal: regra tipo "cota" cujo id
 * contém o nome do sinal (ids reais: "fecho-concreto-gnomico", "anti-sanfona",
 * "piso-declarativas"…). A convenção antiga exigia id EXATO "cota.gnomico" —
 * nenhum contrato usava, então nenhuma cota de contagem chegava aos sinais e
 * `fora_da_cota` era sempre false (defeito 11 da auditoria de fechamento).
 */
function regraDeCota(c: SkillContract, sinal: string) {
  const chave = sinal.toLowerCase();
  return c.regras.find((x) => x.tipo === "cota" && x.id.toLowerCase().includes(chave));
}

/**
 * Regra por id, INDEPENDENTE do tipo. Necessária porque a semântica de uma regra
 * (ex.: `sem_excecao` do piso-densidade) sobrevive quando o NÚMERO sai dela: o
 * piso passou a ter fonte única em `faixa_palavras`, e a regra virou
 * "alvo_positivo" — buscar só por tipo "cota" perdia a semântica junto com o número.
 */
function regraPorId(c: SkillContract, chave: string) {
  const k = chave.toLowerCase();
  return c.regras.find((x) => x.id.toLowerCase().includes(k));
}

function cotaDeclarada(c: SkillContract, sinal: string): { min?: number; max?: number } | undefined {
  const r = regraDeCota(c, sinal);
  return r?.cota ? { min: r.cota.min, max: r.cota.max } : undefined;
}

function medir(
  sinal: string,
  valor: number,
  exemplos: string[],
  cota?: { min?: number; max?: number },
  extra?: Partial<SinalMedido>
): SinalMedido {
  const fora = cota ? (cota.max != null && valor > cota.max) || (cota.min != null && valor < cota.min) : false;
  return { sinal, valor, cota, fora_da_cota: fora, exemplos, ...extra };
}

/**
 * Fração do capítulo em itálico, em nível de PARÁGRAFO. Deliberadamente separado
 * de `RE_ITALICO` (maneirismo.ts), que limita spans a 80 caracteres porque mede
 * PENSAMENTO em itálico e alimenta o corpus de calibração hash-bound — mexer nele
 * invalidaria os rótulos. Aqui a pergunta é outra: o capítulo INTEIRO é itálico?
 */
export function fracaoItalico(texto: string): number {
  const paragrafos = texto
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter((p) => p && !/^#{1,3}\s/.test(p));
  if (!paragrafos.length) return 0;
  const italicos = paragrafos.filter((p) => /^([*_])[^*_].*[^*_]\1$/s.test(p));
  return italicos.length / paragrafos.length;
}

/**
 * Ocorrências da muleta genérica ("coisa"/"coisas"/"algo") com contexto citável.
 * `contarMuletas` (maneirismo.ts) devolve só contagem por termo, e o revisor
 * precisa CITAR cada ocorrência para confirmar violação (adendo 2) — daí a
 * extração local com janela de contexto.
 */
export function ocorrenciasMuletaGenerica(texto: string): string[] {
  const out: string[] = [];
  const re = /\b(coisas?|algo)\b/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(texto)) !== null) {
    const ini = Math.max(0, m.index - 40);
    const fim = Math.min(texto.length, m.index + m[0].length + 40);
    out.push(texto.slice(ini, fim).replace(/\s+/g, " ").trim());
  }
  return out;
}

/** Isenção de piso declarada pelo contrato e satisfeita pelo texto. */
function isencaoDePiso(contrato: SkillContract, texto: string): string | undefined {
  const isen = contrato.faixa_palavras.isencao_piso;
  if (!isen) return undefined;
  if (isen.condicao === "capitulo_predominantemente_italico" && fracaoItalico(texto) > 0.5) {
    return isen.justificativa;
  }
  return undefined;
}

/** Mede todos os sinais editoriais do texto, com cotas vindas SÓ do contrato. */
export function medirSinais(
  texto: string,
  contrato: SkillContract,
  opts?: { compatibilidadeCorpusV1?: boolean }
): SinalMedido[] {
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
    // O corpus histórico v1 foi congelado antes de fragColados publicar os pares.
    // A compatibilidade afeta SOMENTE a lista explicativa desse loader legado;
    // contagem, cota e produção usam o detector atual. No pipeline real todo
    // sinal de ocorrência precisa ser numerável para o parecer ser auditável.
    const exemplos = opts?.compatibilidadeCorpusV1 && t.chave === "fragColados"
      ? []
      : t.todosExemplos ?? t.exemplos;
    out.push({ sinal: `cadencia.${t.nome}`, valor: t.n, cota: declarou ? { max: t.alvo } : undefined, fora_da_cota: declarou && t.acima, exemplos });
  }

  // ------------------------------------------------------------------------
  // RÉGUA UNIVERSAL DE MOLDE (FASE 2 do plano ofício-inteiro, 2026-08-05).
  // Frequência de molde de IA NÃO é identidade de skill (os três ofícios listam
  // esses padrões como defeito) — o orçamento vem de maneirismo.ts (orc10k por
  // molde), não do contrato; exceção só se o contrato declarar cota própria
  // (regra tipo "cota" com id contendo "molde"). CR4 segue intacta: cadência,
  // interioridade e pisos continuam POR SKILL, acima.
  // Sinal, nunca gate: alimenta o revisor; promoção a bloqueio é decisão do
  // autor com os números da FASE 4 na mesa.
  // O corpus de calibração foi congelado ANTES desta régua: sob
  // compatibilidadeCorpusV1 os sinais universais não são emitidos (mesmo
  // precedente do fragColados acima) — a calibração certifica cotas de
  // CONTRATO; a régua universal é provada contra o acervo, não contra rótulos.
  // ------------------------------------------------------------------------
  if (!opts?.compatibilidadeCorpusV1) {
    const cotaContratoMolde = cotaDeclarada(contrato, "molde");
    const man = contarManeirismos(texto, undefined, { maxExemplos: 20 });
    for (const p of man.padroes) {
      const cota = cotaContratoMolde ?? { max: p.alvo };
      out.push({
        sinal: `molde.${p.nome}`,
        valor: p.n,
        cota,
        fora_da_cota: (cota.max != null && p.n > cota.max) || (cota.min != null && p.n < cota.min),
        exemplos: p.exemplos,
      });
    }
  }

  // Muleta genérica: a regra `muleta-coisa` do romantasy declarava cota e NÃO
  // casava com sinal nenhum — cota silenciosamente morta (o léxico existia em
  // maneirismo.ts e `sinais.ts` nunca o importava). Mede EXATAMENTE os termos que
  // a regra nomeia ("coisa"/"algo"), não o léxico inteiro de muletas.
  // ⚠ EMISSÃO RETIDA — `muleta_coisa` (cota declarada, detector pronto).
  // Decisão do autor em 2026-07-28, registrada em docs/engine-v2/03-cotas-regra-sinal.md.
  //
  // Ligar a emissão faz calibracao.ts:190 exigir um bloco de rótulos `muleta_coisa`
  // nas 4 amostras romantasy (13 ocorrências, julgamento humano legítima × tique).
  // Não vale forçar: os 14 arquivos de worker/calibration/v1/labels/ são todos
  // PRÉ-RÓTULO AUTOMÁTICO, nenhum revisado por humano — o corpus já não certifica
  // nada, e um 15º bloco fabricado só aprofundaria a dívida que trava o release.
  //
  // Para sair da retenção: rotular as 4 amostras e descomentar o bloco abaixo.
  // O detector (`ocorrenciasMuletaGenerica`) permanece exportado e testado.
  //
  // const regraMuleta = regraDeCota(contrato, "muleta") ?? regraDeCota(contrato, "coisa");
  // if (regraMuleta?.cota) {
  //   const mu = ocorrenciasMuletaGenerica(texto);
  //   out.push(medir("muleta_coisa", mu.length, mu, { min: regraMuleta.cota.min, max: regraMuleta.cota.max },
  //     { sem_excecao: regraMuleta.sem_excecao }));
  // }

  // Tamanho do capítulo (sinal, não gate — decisão da F6).
  // O NÚMERO do piso vem de `faixa_palavras` (fonte única — a regra `piso-densidade`
  // do contrato declara a SEMÂNTICA, não o número). A isenção e a disposição
  // fechada vêm da regra, e são o que a semântica do contrato exige.
  const palavras = countWords(texto);
  const faixa = contrato.faixa_palavras;
  const isencao = isencaoDePiso(contrato, texto);
  const regraPiso = regraPorId(contrato, "densidade");
  out.push(
    medir(
      "palavras",
      palavras,
      [],
      // Piso isento: o capítulo continua sendo medido, mas não fica FORA por ser curto.
      { min: isencao ? undefined : faixa.min, max: faixa.max },
      { sem_excecao: regraPiso?.sem_excecao, ...(isencao ? { isencao_aplicada: isencao } : {}) }
    )
  );

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
    if (s.isencao_aplicada) {
      linhas.push(`    ISENÇÃO DO PISO APLICADA pelo contrato: ${s.isencao_aplicada}`);
    }
    if (s.sem_excecao && s.fora_da_cota) {
      linhas.push(
        `    DISPOSIÇÃO FECHADA: o contrato NÃO admite "excecao_valida" para este sinal — fora da cota é violação. ` +
          `Disponha "violacao_confirmada" ou, se o detector errou, "falso_positivo".`
      );
    }
    s.exemplos.forEach((e, i) => linhas.push(`    ${i + 1}. ${JSON.stringify(e)}`));
  }
  return linhas.join("\n");
}
