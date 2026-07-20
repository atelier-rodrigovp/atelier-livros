// Engine V2 — compilador de contexto (F4).
// Produz o PACOTE MÍNIMO entregue a cada papel: só o que é comprovadamente aplicável,
// com origem por instrução, precedência explícita, dedup, detecção de contradição,
// hash do pacote e bloqueio de incompatibilidades. Nenhuma camada inferior pode
// contradizer silenciosamente uma superior.

import { hashJsonCanonico } from "./hash.js";
import type { ContratoCompilado, Papel, SceneSpec } from "./tipos.js";

// Precedência (menor número = mais forte).
export const CAMADAS = {
  seguranca: 1,          // segurança e integridade factual
  contrato: 2,           // contrato versionado da skill
  decisao_autor: 3,      // decisões explícitas do autor
  perfil: 4,             // perfil validado do projeto (perfil-de-voz específico do livro)
  ficha: 5,              // ficha estrutural da cena
  contexto_factual: 6,   // fatos/continuidade selecionados pelo contextualizador
  preferencia: 7,        // preferências não obrigatórias
} as const;
export type NomeCamada = keyof typeof CAMADAS;

export interface Instrucao {
  texto: string;
  camada: NomeCamada;
  fonte: string;               // origem rastreável: "contrato:r7", "perfil:secao-2", "autor:2026-07-01"
  chave?: string;              // tópico p/ resolução de conflito (ex.: "interioridade", "cota.gnomico")
  papeis?: Papel[];            // ausente = todos
}

export interface SecaoContexto {
  titulo: string;
  texto: string;               // verbatim (o compilador nunca parafraseia)
  fonte: string;
  hash?: string;               // hash da fonte, quando aplicável (doc de fundação)
}

export interface EntradaCompilacao {
  papel: Papel;
  alvo: string;                        // ex.: "capitulo:3"
  contrato: ContratoCompilado;
  perfil: { texto: string; skillId: string; hash: string; validado: boolean };
  ficha?: SceneSpec;
  instrucoesAutor?: Instrucao[];       // camada 3 (decisões explícitas do autor)
  fatos?: SecaoContexto[];             // camada 6 (selecionados pelo contextualizador)
  trechosAnteriores?: SecaoContexto[]; // estritamente relevantes (não a obra inteira)
  repeticoesRecentes?: string[];       // frases/imagens recentes a não repetir
  preferencias?: Instrucao[];          // camada 7
  fundacaoEsperada?: Record<string, string>;  // doc → hash canônico (estado)
  fundacaoRecebida?: Record<string, string>;  // doc → hash do que se pretende enviar
}

export interface Contradicao {
  chave: string;
  vencedora: Instrucao;
  descartada: Instrucao;
  resolucao: "precedencia" | "conflito_mesma_camada";
}

export interface PacoteCompilado {
  schema: "context-bundle/v1";
  papel: Papel;
  alvo: string;
  skill: { id: string; versao: string; hash: string };
  instrucoes: Instrucao[];             // já filtradas por papel, deduplicadas, ordenadas por camada
  secoes: SecaoContexto[];
  repeticoesRecentes: string[];
  contradicoes: Contradicao[];         // trilha do que foi resolvido por precedência
  hash: string;                        // sha256 do conteúdo canônico do pacote
}

export interface ResultadoCompilacao {
  ok: boolean;
  pacote?: PacoteCompilado;
  bloqueios: { codigo: string; detalhe: string }[];
}

function normalizar(s: string): string {
  return s.trim().replace(/\s+/g, " ").toLowerCase();
}

/** Instruções derivadas do contrato (camada 2), recortadas por papel. */
export function instrucoesDoContrato(c: ContratoCompilado, papel: Papel): Instrucao[] {
  const out: Instrucao[] = [];
  for (const r of c.contrato.regras) {
    if (r.papeis.length && !r.papeis.includes(papel)) continue;
    const cota = r.cota ? ` [cota: ${r.cota.min != null ? `mín ${r.cota.min}` : ""}${r.cota.min != null && r.cota.max != null ? ", " : ""}${r.cota.max != null ? `máx ${r.cota.max}` : ""} por ${r.cota.por}]` : "";
    out.push({ texto: r.texto + cota, camada: "contrato", fonte: `contrato:${r.id}`, chave: r.id, papeis: r.papeis });
  }
  return out;
}

export function compilarPacote(e: EntradaCompilacao): ResultadoCompilacao {
  const bloqueios: ResultadoCompilacao["bloqueios"] = [];

  // --- Bloqueios de incompatibilidade (executam ANTES de montar qualquer coisa) ---
  if (e.perfil.skillId !== e.contrato.contrato.id) {
    bloqueios.push({
      codigo: "SKILL_PERFIL_INCOMPATIVEL",
      detalhe: `perfil pertence à skill "${e.perfil.skillId}", contrato é "${e.contrato.contrato.id}"`,
    });
  }
  if (!e.perfil.validado) {
    bloqueios.push({ codigo: "PERFIL_NAO_VALIDADO", detalhe: "perfil do projeto ainda não foi validado" });
  }
  if (e.ficha && e.ficha.schema !== "scene-spec/v1") {
    bloqueios.push({ codigo: "FICHA_SCHEMA_INVALIDO", detalhe: String(e.ficha.schema) });
  }
  // Documento histórico substituído não pode continuar sendo enviado:
  if (e.fundacaoEsperada && e.fundacaoRecebida) {
    for (const [doc, hashEsperado] of Object.entries(e.fundacaoEsperada)) {
      const recebido = e.fundacaoRecebida[doc];
      if (recebido && recebido !== hashEsperado) {
        bloqueios.push({
          codigo: "DOCUMENTO_SUBSTITUIDO",
          detalhe: `${doc}: hash enviado ${recebido.slice(0, 12)}… difere do canônico ${hashEsperado.slice(0, 12)}…`,
        });
      }
    }
  }
  if (bloqueios.length) return { ok: false, bloqueios };

  // --- Coleta por camada ---
  const todas: Instrucao[] = [
    ...instrucoesDoContrato(e.contrato, e.papel),
    ...(e.instrucoesAutor ?? []).map((i) => ({ ...i, camada: "decisao_autor" as const })),
    ...(e.preferencias ?? []).map((i) => ({ ...i, camada: "preferencia" as const })),
  ].filter((i) => !i.papeis || i.papeis.length === 0 || i.papeis.includes(e.papel));

  // --- Dedup (texto normalizado) ---
  const vistos = new Map<string, Instrucao>();
  const dedup: Instrucao[] = [];
  for (const i of todas.sort((a, b) => CAMADAS[a.camada] - CAMADAS[b.camada])) {
    const k = normalizar(i.texto);
    if (vistos.has(k)) continue;
    vistos.set(k, i);
    dedup.push(i);
  }

  // --- Contradições por chave: camada mais forte vence; mesma camada = conflito ---
  const contradicoes: Contradicao[] = [];
  const porChave = new Map<string, Instrucao>();
  const finais: Instrucao[] = [];
  for (const i of dedup) {
    if (!i.chave) {
      finais.push(i);
      continue;
    }
    const atual = porChave.get(i.chave);
    if (!atual) {
      porChave.set(i.chave, i);
      finais.push(i);
      continue;
    }
    if (CAMADAS[atual.camada] === CAMADAS[i.camada] && normalizar(atual.texto) !== normalizar(i.texto)) {
      // Conflito na MESMA camada não tem resolução automática: bloqueia.
      return {
        ok: false,
        bloqueios: [{
          codigo: "CONTRADICAO_MESMA_CAMADA",
          detalhe: `chave "${i.chave}": "${atual.texto}" (${atual.fonte}) vs "${i.texto}" (${i.fonte})`,
        }],
      };
    }
    // Camada mais forte já está em `finais` (ordenação); registra o descarte.
    contradicoes.push({ chave: i.chave, vencedora: atual, descartada: i, resolucao: "precedencia" });
  }

  // --- Seções verbatim: perfil (camada 4), ficha (5), fatos/trechos (6) ---
  const secoes: SecaoContexto[] = [
    { titulo: "PERFIL DO LIVRO", texto: e.perfil.texto, fonte: "perfil", hash: e.perfil.hash },
    ...(e.ficha ? [{ titulo: `FICHA DA CENA (${e.alvo})`, texto: JSON.stringify(e.ficha, null, 2), fonte: "ficha" }] : []),
    ...(e.fatos ?? []),
    ...(e.trechosAnteriores ?? []),
  ];

  const pacoteSemHash: Omit<PacoteCompilado, "hash"> = {
    schema: "context-bundle/v1",
    papel: e.papel,
    alvo: e.alvo,
    skill: { id: e.contrato.contrato.id, versao: e.contrato.contrato.versao, hash: e.contrato.hash },
    instrucoes: finais,
    secoes,
    repeticoesRecentes: e.repeticoesRecentes ?? [],
    contradicoes,
  };
  const hash = hashJsonCanonico(pacoteSemHash);
  return { ok: true, bloqueios: [], pacote: { ...pacoteSemHash, hash } };
}

/** Renderização determinística do pacote para o prompt do modelo. */
export function renderizarPacote(p: PacoteCompilado): string {
  const linhas: string[] = [];
  linhas.push(`# PACOTE DE CONTEXTO — papel: ${p.papel} — alvo: ${p.alvo}`);
  linhas.push(`Skill: ${p.skill.id}@${p.skill.versao} (hash ${p.skill.hash.slice(0, 12)}) · bundle ${p.hash.slice(0, 12)}`);
  linhas.push("");
  linhas.push("## INSTRUÇÕES (em ordem de precedência; as primeiras prevalecem)");
  for (const i of p.instrucoes) {
    linhas.push(`- [${i.camada}] ${i.texto}`);
  }
  if (p.repeticoesRecentes.length) {
    linhas.push("");
    linhas.push("## NÃO REPETIR (usadas recentemente)");
    for (const r of p.repeticoesRecentes) linhas.push(`- ${r}`);
  }
  for (const s of p.secoes) {
    linhas.push("");
    linhas.push(`## ${s.titulo}`);
    linhas.push(s.texto);
  }
  return linhas.join("\n");
}
