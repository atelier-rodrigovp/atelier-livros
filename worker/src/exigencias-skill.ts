// EXIGÊNCIAS ESTRUTURAIS POR SKILL (SPEC-DB1/DB2/DB3 — auditoria dan-brown).
//
// A auditoria provou que o que funciona na página (3 fios, cortes no pico, ~40
// fatos reais) veio de INICIATIVA EMERGENTE do modelo, não da fiação: o template
// do arquiteto só exige `tier`, o formato de spec instalado dropa Montagem/Dia-Hora/
// Forma/factual, specs-arquivo nem existiam (1 em 9 caps) e a única fonte factual
// era 1 parágrafo sem fontes (com erro interno). O que emergente dá, emergente
// tira: miolo linear (caps 4–6), quinta→terça, "costa de Nevada".
//
// Mecanismo GENÉRICO no padrão de CRAFT_POR_SKILL/ORC_CADENCIA_POR_SKILL:
// skill sem entrada = NO-OP absoluto (zero impacto nas demais). dan-brown é a
// 1ª entrada populada. Roda após criar_fundacao, no início de escrever_livro e
// em sweep — idempotente por marcador (padrão dos normalizadores).
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

export const MARCADOR_MATRIZ = "<!-- MATRIZ-FIOS v1 -->";
export const MARCADOR_ROTACAO = "<!-- ROTACAO-FIOS v1 -->";
export const MARCADOR_ROTACAO_FIM = "<!-- /ROTACAO-FIOS -->";
export const MARCADOR_SPEC_COMPLETA = "<!-- SPEC-COMPLETA v1 -->";
export const MARCADOR_SPEC_COMPLETA_FIM = "<!-- /SPEC-COMPLETA -->";
export const MARCADOR_FATO_DOSSIE = "<!-- FATO-DOSSIE v1 -->";
export const MARCADOR_FATO_DOSSIE_FIM = "<!-- /FATO-DOSSIE -->";

export interface ExigenciasSkill {
  fios: { min: number; max: number };
  maxCapsMesmoFio: number; // guarda de rotação (espelhada no runner)
  camposSpec: string[];    // campos que o gate do runner cobra na spec
  dossie: boolean;         // dossie-factual.md obrigatório
  promptFundacao: string;  // bloco para o prompt de criar_fundacao
  blocoNotasExecucao: string; // regra injetável nas Notas de Execução (marcador)
  blocoSpecEditor: string;    // formato completo injetado no livro-editor gerado
  blocoRevisorDossie?: string; // item de fato-vs-dossiê no livro-revisor
}

const DAN_BROWN: ExigenciasSkill = {
  fios: { min: 2, max: 4 },
  maxCapsMesmoFio: 3,
  camposSpec: ["Fio de POV", "Dia/Hora"],
  dossie: true,
  promptFundacao:
    "- EXIGÊNCIAS ESTRUTURAIS DA SKILL (obrigatórias; o pipeline verifica):\n" +
    `  (1) MATRIZ DE FIOS: seção iniciada por '${MARCADOR_MATRIZ}' na Estrutura-do-Livro.md ` +
    "com 2–4 fios de POV, cada um com personagem, LOCALIDADE-BASE, função, relógio-dono e " +
    "ponto de convergência; a tabela de capítulos ganha colunas POV e Dia/Hora.\n" +
    "  (2) DOSSIÊ FACTUAL: gere dossie-factual.md — fatos reais por locação/tema, cada um com " +
    "status 'VERIFICADO (fonte: …)' ou 'HIPÓTESE'. Sem fonte citável ⇒ HIPÓTESE, nunca " +
    "VERIFICADO (use pesquisa web quando disponível). É a ÚNICA fonte de 'real' do livro.\n",
  blocoNotasExecucao:
    `${MARCADOR_ROTACAO}\n` +
    "- **Rotação de fios (montagem paralela — política dura):** alterne os fios de POV da " +
    "MATRIZ DE FIOS; **nunca 4 capítulos seguidos no mesmo fio** sem `Justificativa de fio:` " +
    "na spec; corte no pico com TROCA de fio; miolo linear (um POV numa sala por vários caps) " +
    "é defeito de montagem, não estilo. **Dia/Hora corrente avança em toda spec** (relógio " +
    "comprimido — sem isso a linha do tempo derrapa).\n" +
    MARCADOR_ROTACAO_FIM,
  blocoSpecEditor:
    `${MARCADOR_SPEC_COMPLETA}\n\n` +
    "## SPEC COMPLETA (obrigatória ANTES do escritor — o runner tem gate determinístico)\n\n" +
    "Materialize `specs/Spec-Capitulo-NN.md` ANTES de cada capítulo, no formato do projeto " +
    "MAIS os campos abaixo (spec ausente/incompleta reprova no gate e vira re-geração dirigida):\n" +
    "- **Fio de POV:** <fio da MATRIZ DE FIOS> — nunca 4 caps seguidos no mesmo fio; ao repetir " +
    "o 3º, inclua a linha `Justificativa de fio: <por quê>`.\n" +
    "- **Dia/Hora corrente:** <DIA N — HHhMM> — coerente com o ledger (o relógio comprimido é canônico).\n" +
    "- **Montagem:** corte DE que fio viemos / PARA qual vamos, e ONDE cortar (o pico).\n" +
    "- **Forma (anti-mesmice):** como este capítulo difere dos ~5 anteriores (formas_recentes).\n" +
    "- **Notas de precisão factual:** 2–3 fatos de `dossie-factual.md` que o capítulo toca, com o " +
    "status (VERIFICADO/HIPÓTESE) — fato real fora do dossiê NÃO entra como real.\n\n" +
    MARCADOR_SPEC_COMPLETA_FIM,
  blocoRevisorDossie:
    `${MARCADOR_FATO_DOSSIE}\n` +
    "- **Fato real vs dossiê:** todo fato do mundo real usado no capítulo deve constar em " +
    "`dossie-factual.md` como VERIFICADO, ou estar marcado como hipótese na prosa. Fato real " +
    "fora do dossiê = edição obrigatória (troque por fato do dossiê ou marque) — foi assim que " +
    "'costa de Nevada' chegou à página.\n" +
    MARCADOR_FATO_DOSSIE_FIM,
};

export const EXIGENCIAS_ESTRUTURAIS_POR_SKILL: Record<string, ExigenciasSkill> = {
  "skill-dan-brown": DAN_BROWN,
};

export function exigenciasParaSkill(skill?: string | null): ExigenciasSkill | null {
  return (skill && EXIGENCIAS_ESTRUTURAIS_POR_SKILL[skill]) || null;
}

// Estrutura-do-Livro.md: injeta a regra de rotação no topo das NOTAS DE EXECUÇÃO
// (mesma âncora do voz-regra4); cria a seção se não existir. Idempotente.
export function garantirRotacaoNaEstrutura(conteudo: string, skill?: string | null): { texto: string; mudou: boolean } {
  const ex = exigenciasParaSkill(skill);
  const t = conteudo ?? "";
  if (!ex || t.includes(MARCADOR_ROTACAO)) return { texto: t, mudou: false };
  const m = /(?:^|\n)#+\s*NOTAS DE EXECU[ÇC][ÃA]O[^\n]*\n/i.exec(t);
  if (m) {
    const idx = m.index + m[0].length;
    return { texto: t.slice(0, idx) + ex.blocoNotasExecucao + "\n\n" + t.slice(idx), mudou: true };
  }
  return { texto: t.replace(/\s*$/, "") + "\n\n## NOTAS DE EXECUÇÃO (montagem)\n\n" + ex.blocoNotasExecucao + "\n", mudou: true };
}

// livro-editor.md gerado: injeta o formato de SPEC COMPLETA (o arquiteto instalava
// um formato que dropava Montagem/Dia-Hora/Forma/factual). Idempotente.
export function garantirSpecCompletaNoEditor(conteudo: string, skill?: string | null): { texto: string; mudou: boolean } {
  const ex = exigenciasParaSkill(skill);
  const t = conteudo ?? "";
  if (!ex || t.includes(MARCADOR_SPEC_COMPLETA)) return { texto: t, mudou: false };
  return { texto: t.replace(/\s*$/, "") + "\n\n" + ex.blocoSpecEditor + "\n", mudou: true };
}

// livro-revisor.md gerado: item "fato real vs dossiê" (só p/ skill com dossiê).
export function garantirFatoDossieNoRevisor(conteudo: string, skill?: string | null): { texto: string; mudou: boolean } {
  const ex = exigenciasParaSkill(skill);
  const t = conteudo ?? "";
  if (!ex?.dossie || t.includes(MARCADOR_FATO_DOSSIE)) return { texto: t, mudou: false };
  return { texto: t.replace(/\s*$/, "") + "\n\n" + ex.blocoRevisorDossie + "\n", mudou: true };
}

export interface ExigenciaAjuste { arquivo: string; mudou: boolean; aviso?: string }

// Normalizador do projeto (padrão voz-regra4/craft-*): garante os blocos injetáveis
// e SINALIZA (não bloqueia) o que só o arquiteto/retrofit pode criar (matriz, dossiê).
export async function normalizarExigenciasSkill(projDir: string, skill?: string | null): Promise<ExigenciaAjuste[]> {
  const ex = exigenciasParaSkill(skill);
  if (!ex) return []; // no-op absoluto p/ skill sem entrada
  const ajustes: ExigenciaAjuste[] = [];

  const estPath = path.join(projDir, "Estrutura-do-Livro.md");
  const est = await lerOuNull(estPath);
  if (est != null) {
    const r = garantirRotacaoNaEstrutura(est, skill);
    if (r.mudou) await writeFile(estPath, r.texto, "utf8");
    ajustes.push({
      arquivo: "Estrutura-do-Livro.md",
      mudou: r.mudou,
      aviso: r.texto.includes(MARCADOR_MATRIZ) ? undefined : "MATRIZ DE FIOS ausente — gerar via fundação/retrofit",
    });
  }

  const editorPath = path.join(projDir, ".claude", "agents", "livro-editor.md");
  const editor = await lerOuNull(editorPath);
  if (editor != null) {
    const r = garantirSpecCompletaNoEditor(editor, skill);
    if (r.mudou) await writeFile(editorPath, r.texto, "utf8");
    ajustes.push({ arquivo: "livro-editor.md", mudou: r.mudou });
  }

  const revisorPath = path.join(projDir, ".claude", "agents", "livro-revisor.md");
  const revisor = await lerOuNull(revisorPath);
  if (revisor != null) {
    const r = garantirFatoDossieNoRevisor(revisor, skill);
    if (r.mudou) await writeFile(revisorPath, r.texto, "utf8");
    ajustes.push({ arquivo: "livro-revisor.md", mudou: r.mudou });
  }

  if (ex.dossie) {
    const temDossie = (await lerOuNull(path.join(projDir, "dossie-factual.md"))) != null;
    if (!temDossie) ajustes.push({ arquivo: "dossie-factual.md", mudou: false, aviso: "dossiê factual AUSENTE — gerar via fundação/retrofit" });
  }

  return ajustes;
}

async function lerOuNull(p: string): Promise<string | null> {
  try {
    return await readFile(p, "utf8");
  } catch {
    return null;
  }
}
