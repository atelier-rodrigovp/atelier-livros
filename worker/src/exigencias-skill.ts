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
// SPEC-HM1/HM2 (hoover): relógios + narradora + pistas + DIA/HORA (eixo != rotação de POV).
export const MARCADOR_RELOGIOS_NARRADORA = "<!-- RELOGIOS-NARRADORA v1 -->";
export const MARCADOR_RELOGIOS_NARRADORA_FIM = "<!-- /RELOGIOS-NARRADORA -->";
export const MARCADOR_TABELA_PISTAS = "<!-- TABELA-PISTAS v1 -->";
// SPEC-RM1/RM2 (romantasy): POV duplo + custo-escala + slow burn.
export const MARCADOR_ROTACAO_POV = "<!-- ROTACAO-POV v1 -->";
export const MARCADOR_ROTACAO_POV_FIM = "<!-- /ROTACAO-POV -->";
export const MARCADOR_MATRIZ_POV = "<!-- MATRIZ-POV v1 -->";
export const MARCADOR_CUSTO_MAGIA = "<!-- CUSTO-MAGIA v1 -->";
export const MARCADOR_ESCADA_BURN = "<!-- ESCADA-BURN v1 -->";
export const MARCADOR_CUSTO_ESCALA = "<!-- CUSTO-ESCALA v1 -->";
export const MARCADOR_CUSTO_ESCALA_FIM = "<!-- /CUSTO-ESCALA -->";

// Doc de fundação verificado por PRESENÇA (arquivo existe OU marcador na Estrutura).
// O normalizador SINALIZA ausência — NUNCA gera (quem gera é o arquiteto/fundação,
// como já é com a MATRIZ-FIOS e o dossiê do dan-brown).
export interface DocFundacao {
  arquivo?: string;   // nome de arquivo na raiz do projeto (ex.: matriz-de-relogios.md)
  marcador?: string;  // marcador de seção na Estrutura-do-Livro.md (ex.: MATRIZ-POV)
  descricao: string;  // rótulo no aviso de ausência
}

export interface ExigenciasSkill {
  fios: { min: number; max: number };
  maxCapsMesmoFio: number; // guarda de rotação (espelhada no runner)
  camposSpec: string[];    // campos que o gate do runner cobra na spec (paridade c/ EXIGE_SPEC_POR_SKILL)
  dossie: boolean;         // dossie-factual.md obrigatório (dan-brown; dá o item fato-vs-dossiê no revisor)
  marcadorNotas: string;   // marcador de idempotência do blocoNotasExecucao
  promptFundacao: string;  // bloco para o prompt de criar_fundacao
  blocoNotasExecucao: string; // regra injetável nas Notas de Execução (marcador)
  blocoSpecEditor: string;    // formato completo injetado no livro-editor gerado
  blocoRevisorDossie?: string; // item de fato-vs-dossiê no livro-revisor (dan-brown)
  blocoRevisor?: string;      // item extra injetado no livro-revisor (ex.: CUSTO-ESCALA da romantasy)
  marcadorRevisor?: string;   // marcador de idempotência do blocoRevisor
  docsFundacao?: DocFundacao[]; // docs de fundação verificados por presença (hoover/romantasy)
  // AUDITORIA-DAN-BROWN-V2 gap 2: monotonia de POV/fio a nível-livro. maxCapsMesmoFio
  // (acima) só exige Justificativa; estes dois são tetos que a justificativa NÃO derruba.
  // Só para skills com rotação real (dan-brown/romantasy) — hoover NÃO tem (POV único).
  maxCapsMesmoFioAbsoluto?: number;               // teto DURO, mesmo com 'Justificativa de fio:'
  janelaDiversidade?: { tamanho: number; ratioMax: number }; // nos últimos N specs, nenhum fio > ratioMax
}

// Avalia a monotonia de fio a nível-livro. `fios` = sequência de fios (um por
// capítulo, em ordem). Devolve os motivos de reprovação para o capítulo `n` (1-based).
// Puro/testável; espelhado em livro_runner.py (gate_spec_capitulo).
export function avaliarRotacaoFio(
  fios: (string | null)[],
  n: number,
  ex: { maxCapsMesmoFioAbsoluto?: number; janelaDiversidade?: { tamanho: number; ratioMax: number } }
): string[] {
  const out: string[] = [];
  // Normaliza o fio ao CÓDIGO/POV canônico: "H (Helena Caires…)" / "H (principal)" /
  // "H (Helena)" → "h". Sem isso a descrição varia por capítulo e caps do MESMO POV
  // não contam como iguais (o real do Índice). Corta no 1º "(" ou travessão.
  const norm = (f: string | null) => (f ?? "").split(/[(—–]/)[0].trim().toLowerCase();
  const seq = fios.slice(0, n).map(norm);
  const atual = seq[n - 1];
  if (!atual) return out;
  // teto absoluto: quantos capítulos consecutivos (contando este) no mesmo fio?
  if (ex.maxCapsMesmoFioAbsoluto && ex.maxCapsMesmoFioAbsoluto > 0) {
    let consec = 0;
    for (let i = n - 1; i >= 0 && seq[i] === atual; i--) consec++;
    if (consec > ex.maxCapsMesmoFioAbsoluto)
      out.push(`teto absoluto: ${consec} caps consecutivos no fio '${atual}' (máx ${ex.maxCapsMesmoFioAbsoluto}, Justificativa NÃO derruba)`);
  }
  // janela de diversidade: nos últimos `tamanho` caps, nenhum fio pode passar de ratioMax
  const jd = ex.janelaDiversidade;
  if (jd && jd.tamanho > 0) {
    const jan = seq.slice(Math.max(0, n - jd.tamanho));
    if (jan.length >= jd.tamanho) {
      const cont = new Map<string, number>();
      for (const f of jan) if (f) cont.set(f, (cont.get(f) ?? 0) + 1);
      for (const [f, c] of cont) {
        const ratio = c / jan.length;
        if (ratio > jd.ratioMax)
          out.push(`monotonia: fio '${f}' em ${c}/${jan.length} dos últimos caps (${Math.round(ratio * 100)}% > ${Math.round(jd.ratioMax * 100)}%)`);
      }
    }
  }
  return out;
}

const DAN_BROWN: ExigenciasSkill = {
  fios: { min: 2, max: 4 },
  maxCapsMesmoFio: 3,
  maxCapsMesmoFioAbsoluto: 5,                         // confirmado
  janelaDiversidade: { tamanho: 10, ratioMax: 0.65 }, // 0.65: o defeito real foi 0.7–0.8; 0.7 ficava na borda
  camposSpec: ["Fio de POV", "Dia/Hora"],
  dossie: true,
  marcadorNotas: MARCADOR_ROTACAO,
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

// SPEC-HM1/HM2 — hoover: POV único (Helena, 1ª pessoa PRESENTE) + fio-M de memória.
// Eixo de fiação = relógios nomeados + regras da narradora + tabela de pistas +
// DIA/HORA + piso de densidade (NÃO rotação de POV). fios {min1,max2} = Helena + fio-M;
// maxCapsMesmoFio alto = o fio-M é cadência, não rotação; dossie false (usa docsFundacao).
const HOOVER: ExigenciasSkill = {
  fios: { min: 1, max: 2 },
  maxCapsMesmoFio: 6,
  camposSpec: ["Dia/Hora", "Relógios", "Pistas", "Gancho", "Narradora"],
  dossie: false,
  marcadorNotas: MARCADOR_RELOGIOS_NARRADORA,
  promptFundacao:
    "- EXIGÊNCIAS ESTRUTURAIS DA SKILL (obrigatórias; o pipeline verifica por presença):\n" +
    "  (1) MATRIZ DE RELÓGIOS: gere matriz-de-relogios.md com os 3 relógios nomeados " +
    "(janela cirúrgica / doença da narradora / antagonista), cada um com DONO, ponto de " +
    "partida, DEADLINE e posição-alvo ao fim de cada ato (a Bíblia §4 já é isto).\n" +
    "  (2) REGRAS DA NARRADORA: gere regras-da-narradora.md — tabela 'o que Helena " +
    "omite/distorce / de quem / em que ato o leitor pode saber' + a régua de fair-play " +
    "(Bíblia §3+§6). O twist se sustenta na releitura, sem trapaça.\n" +
    `  (3) TABELA DE PISTAS: seção iniciada por '${MARCADOR_TABELA_PISTAS}' na ` +
    "Estrutura-do-Livro.md, com ≥3 pistas do Ato I no formato semente→pagamento (ID, onde " +
    "planta, onde paga). Nenhuma revelação sem pista registrada.\n" +
    "  VOZ CANÔNICA: 1ª pessoa PRESENTE (pretérito é defeito), nome canônico da narradora; " +
    "piso de densidade 2.000 palavras para capítulos de Helena.\n",
  blocoNotasExecucao:
    `${MARCADOR_RELOGIOS_NARRADORA}\n` +
    "- **Relógios + narradora + pistas (política dura):** **DIA/HORA corrente avança em toda " +
    "spec** e **≥1 relógio da MATRIZ DE RELÓGIOS move por capítulo** (com dono/deadline " +
    "visíveis na cena — relógio comprimido é canônico). **Nenhuma revelação sem pista " +
    "registrada** na TABELA DE PISTAS (semente antes do pagamento — fair-play do twist). " +
    "**1ª pessoa PRESENTE** nos capítulos de Helena (pretérito é defeito de voz); o fio-M de " +
    "memória (itálico, voz secundária) é isento do piso. Piso 2.000 palavras por capítulo de " +
    "Helena.\n" +
    MARCADOR_RELOGIOS_NARRADORA_FIM,
  blocoSpecEditor:
    `${MARCADOR_SPEC_COMPLETA}\n\n` +
    "## SPEC COMPLETA (obrigatória ANTES do escritor — o runner tem gate determinístico)\n\n" +
    "Materialize `specs/Spec-Capitulo-NN.md` ANTES de cada capítulo, no formato do projeto " +
    "MAIS os campos abaixo (spec ausente/incompleta reprova no gate e vira re-geração dirigida):\n" +
    "- **Dia/Hora corrente:** <DIA N — HHhMM> — coerente com o ledger (relógio comprimido).\n" +
    "- **Relógios:** posição de A/B/C (janela cirúrgica / doença / antagonista) + **qual avança " +
    "aqui e como**.\n" +
    "- **Pistas:** `Planta: <ID>` e/ou `Paga: <ID>` da TABELA DE PISTAS — toda revelação puxa " +
    "uma pista plantada.\n" +
    "- **Narradora:** o que Helena omite/enquadra neste capítulo (fair-play: o leitor tem o que " +
    "ela percebe agora).\n" +
    "- **Gancho:** tipo do gancho de fim, **diferente dos 2 capítulos anteriores** (anti-mesmice).\n\n" +
    MARCADOR_SPEC_COMPLETA_FIM,
  docsFundacao: [
    { arquivo: "matriz-de-relogios.md", descricao: "MATRIZ DE RELÓGIOS (matriz-de-relogios.md)" },
    { arquivo: "regras-da-narradora.md", descricao: "REGRAS DA NARRADORA (regras-da-narradora.md)" },
    { marcador: MARCADOR_TABELA_PISTAS, descricao: "TABELA DE PISTAS (seção na Estrutura)" },
  ],
};

// SPEC-RM1/RM2 — romantasy: POV duplo entre os amantes + custo-de-magia escalando +
// slow burn por marcos. O gênero inteiro já vive no modelo-Estrutura-do-Livro.md;
// a fiação exige/verifica. fios {2,2} = POV duplo exato; maxCapsMesmoFio 2.
const ROMANTASY: ExigenciasSkill = {
  fios: { min: 2, max: 2 },
  maxCapsMesmoFio: 2,
  maxCapsMesmoFioAbsoluto: 3,                       // ⚠️ nº a confirmar (POV duplo é mais apertado)
  janelaDiversidade: { tamanho: 6, ratioMax: 0.6 },
  camposSpec: ["Ponto de vista", "Degrau slow burn", "Custo de magia"],
  dossie: false,
  marcadorNotas: MARCADOR_ROTACAO_POV,
  promptFundacao:
    "- EXIGÊNCIAS ESTRUTURAIS DA SKILL (obrigatórias; o pipeline verifica por presença; o " +
    "gênero já está no modelo-Estrutura-do-Livro.md — materialize as seções):\n" +
    `  (1) '${MARCADOR_MATRIZ_POV}' na Estrutura: os 2 amantes (POV duplo), o que cada cabeça ` +
    "SABE/ESCONDE do outro, e a regra de alternância.\n" +
    `  (2) '${MARCADOR_CUSTO_MAGIA}' na Estrutura: tabela poder → PREÇO → escala por ato ` +
    "('cada uso cobra mais'); magia grátis é deus-ex proibido.\n" +
    `  (3) '${MARCADOR_ESCADA_BURN}' na Estrutura: os 8 degraus do slow burn (do modelo), ` +
    "ancorados a capítulos-alvo.\n",
  blocoNotasExecucao:
    `${MARCADOR_ROTACAO_POV}\n` +
    "- **POV duplo + custo-escala + slow burn (política dura):** alterne os 2 amantes da " +
    "MATRIZ POV; **nunca 2 capítulos seguidos no mesmo amante** sem `Justificativa de POV:` na " +
    "spec; troque de cabeça só com **informação nova**, nunca recontando a mesma cena. Cada " +
    "capítulo avança **um** arco (romance OU fantasia), idealmente os dois. Toda solução mágica " +
    "decisiva **paga o preço plantado** e o **custo escala** vs. usos anteriores (TABELA DE CUSTO " +
    "DE MAGIA). O slow burn sobe por **marco** (ESCADA DE SLOW BURN), nunca resolve cedo.\n" +
    MARCADOR_ROTACAO_POV_FIM,
  blocoSpecEditor:
    `${MARCADOR_SPEC_COMPLETA}\n\n` +
    "## SPEC COMPLETA (obrigatória ANTES do escritor — o runner tem gate determinístico)\n\n" +
    "Materialize `specs/Spec-Capitulo-NN.md` ANTES de cada capítulo, no formato do projeto " +
    "MAIS os campos abaixo (spec ausente/incompleta reprova no gate e vira re-geração dirigida):\n" +
    "- **Ponto de vista:** <amante da MATRIZ POV> + por quê esta cabeça agora; nunca 2 caps " +
    "seguidos no mesmo amante — ao repetir, inclua a linha `Justificativa de POV: <por quê>`.\n" +
    "- **Degrau slow burn:** nº do degrau (ESCADA) + **movido por mérito/como**, ou repouso " +
    "justificado (nunca resolução precoce).\n" +
    "- **Custo de magia:** se há uso decisivo, o **preço plantado que foi pago** + como o custo " +
    "**escala** vs. capítulos anteriores (ou magia partilhada com preço).\n" +
    "- **Marco de relação:** o que este capítulo **planta/paga** no arco romântico.\n" +
    "- **Gancho:** tipo do gancho de fim (cruel/página-vira), **diferente dos 2 anteriores**.\n\n" +
    MARCADOR_SPEC_COMPLETA_FIM,
  blocoRevisor:
    `${MARCADOR_CUSTO_ESCALA}\n` +
    "- **Custo-escala da magia (fair-play do poder):** toda solução mágica decisiva pagou o " +
    "**preço plantado** E o custo **escalou** vs. usos anteriores (ou foi partilhado com preço). " +
    "Magia grátis / poder novo conveniente = deus-ex — edição obrigatória (amarre a um custo da " +
    "TABELA DE CUSTO DE MAGIA).\n" +
    MARCADOR_CUSTO_ESCALA_FIM,
  marcadorRevisor: MARCADOR_CUSTO_ESCALA,
  docsFundacao: [
    { marcador: MARCADOR_MATRIZ_POV, descricao: "MATRIZ POV (seção na Estrutura)" },
    { marcador: MARCADOR_CUSTO_MAGIA, descricao: "TABELA DE CUSTO DE MAGIA (seção na Estrutura)" },
    { marcador: MARCADOR_ESCADA_BURN, descricao: "ESCADA DE SLOW BURN (seção na Estrutura)" },
  ],
};

export const EXIGENCIAS_ESTRUTURAIS_POR_SKILL: Record<string, ExigenciasSkill> = {
  "skill-dan-brown": DAN_BROWN,
  "hoover-mcfadden": HOOVER,
  "skill-romantasy": ROMANTASY,
};

export function exigenciasParaSkill(skill?: string | null): ExigenciasSkill | null {
  return (skill && EXIGENCIAS_ESTRUTURAIS_POR_SKILL[skill]) || null;
}

// Estrutura-do-Livro.md: injeta a regra de rotação no topo das NOTAS DE EXECUÇÃO
// (mesma âncora do voz-regra4); cria a seção se não existir. Idempotente.
export function garantirRotacaoNaEstrutura(conteudo: string, skill?: string | null): { texto: string; mudou: boolean } {
  const ex = exigenciasParaSkill(skill);
  const t = conteudo ?? "";
  if (!ex || t.includes(ex.marcadorNotas)) return { texto: t, mudou: false };
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

// livro-revisor.md gerado: item extra por skill (ex.: CUSTO-ESCALA da romantasy).
// No-op para skill sem blocoRevisor. Idempotente pelo marcadorRevisor.
export function garantirBlocoRevisorSkill(conteudo: string, skill?: string | null): { texto: string; mudou: boolean } {
  const ex = exigenciasParaSkill(skill);
  const t = conteudo ?? "";
  if (!ex?.blocoRevisor || !ex.marcadorRevisor || t.includes(ex.marcadorRevisor)) return { texto: t, mudou: false };
  return { texto: t.replace(/\s*$/, "") + "\n\n" + ex.blocoRevisor + "\n", mudou: true };
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
  let estFinal = est ?? "";
  if (est != null) {
    const r = garantirRotacaoNaEstrutura(est, skill);
    if (r.mudou) await writeFile(estPath, r.texto, "utf8");
    estFinal = r.texto;
    const ajuste: ExigenciaAjuste = { arquivo: "Estrutura-do-Livro.md", mudou: r.mudou };
    // Legado dan-brown (skill sem docsFundacao): sinaliza a MATRIZ DE FIOS ausente.
    if (!ex.docsFundacao && !r.texto.includes(MARCADOR_MATRIZ))
      ajuste.aviso = "MATRIZ DE FIOS ausente — gerar via fundação/retrofit";
    ajustes.push(ajuste);
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
    const rd = garantirFatoDossieNoRevisor(revisor, skill);   // dan-brown: fato-vs-dossiê
    const rr = garantirBlocoRevisorSkill(rd.texto, skill);    // romantasy: CUSTO-ESCALA
    const mudou = rd.mudou || rr.mudou;
    if (mudou) await writeFile(revisorPath, rr.texto, "utf8");
    ajustes.push({ arquivo: "livro-revisor.md", mudou });
  }

  if (ex.dossie) {
    const temDossie = (await lerOuNull(path.join(projDir, "dossie-factual.md"))) != null;
    if (!temDossie) ajustes.push({ arquivo: "dossie-factual.md", mudou: false, aviso: "dossiê factual AUSENTE — gerar via fundação/retrofit" });
  }

  // Docs de fundação genéricos (hoover/romantasy): SINALIZA ausência, nunca gera.
  // Presente = arquivo existe OU marcador na Estrutura.
  for (const doc of ex.docsFundacao ?? []) {
    const noMarcador = doc.marcador ? estFinal.includes(doc.marcador) : false;
    const noArquivo = doc.arquivo ? (await lerOuNull(path.join(projDir, doc.arquivo))) != null : false;
    if (!noMarcador && !noArquivo)
      ajustes.push({ arquivo: doc.arquivo ?? "Estrutura-do-Livro.md", mudou: false, aviso: `${doc.descricao} ausente — gerar via fundação/retrofit` });
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
