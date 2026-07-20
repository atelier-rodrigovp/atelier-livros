// Engine V2 — F2: contratos de skill como DADOS (worker/skills-v2/<id>/contrato.json).
// As diferenças entre skills saem do código e viram dados; identidade preservada
// por contrato (lição CR4: a régua que salva o dan-brown mata o hoover — nada
// aqui normaliza cadência/interioridade entre skills).
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { CLASSE_POR_PAPEL, type ContratoCompilado, type Papel, type SkillContract } from "./tipos.js";
import { hashJsonCanonico } from "./hash.js";

/** skill_escrita (V1) → id de contrato V2. */
export const MAPA_SKILL_V1_V2: Record<string, string> = {
  "skill-dan-brown": "dan-brown",
  "hoover-mcfadden": "hoover-mcfadden",
  "skill-romantasy": "romantasy",
};

/** Erro no formato de ErroEstruturado (codigo + classe + mensagem). */
export class ErroContrato extends Error {
  readonly codigo: string;
  readonly classe = "configuracao" as const;
  constructor(codigo: string, mensagem: string) {
    super(mensagem);
    this.name = "ErroContrato";
    this.codigo = codigo;
  }
}

// Base default robusta a tsx (worker/ ou raiz) e vitest: primeiro relativa ao
// módulo (src/v2 → worker/skills-v2), depois cwd e cwd/worker.
function baseDirPadrao(): string {
  const aqui = path.dirname(fileURLToPath(import.meta.url));
  const candidatos = [
    path.resolve(aqui, "..", "..", "skills-v2"),
    path.resolve(process.cwd(), "skills-v2"),
    path.resolve(process.cwd(), "worker", "skills-v2"),
  ];
  for (const c of candidatos) if (existsSync(c)) return c;
  return candidatos[0];
}

export function skillsDisponiveis(baseDir?: string): string[] {
  const base = baseDir ?? baseDirPadrao();
  if (!existsSync(base)) return [];
  return readdirSync(base, { withFileTypes: true })
    .filter((d) => d.isDirectory() && existsSync(path.join(base, d.name, "contrato.json")))
    .map((d) => d.name)
    .sort();
}

// ---------------------------------------------------------------------------
// Validação estrutural (sem dependência nova — checagens manuais)
// ---------------------------------------------------------------------------

const PESSOAS_POV = ["primeira", "terceira_proxima", "terceira_multipla"] as const;
const TIPOS_REGRA = ["alvo_positivo", "proibicao", "cota"] as const;
const COTA_POR = ["capitulo", "cena", "1000_palavras"] as const;
const PAPEIS_VALIDOS = Object.keys(CLASSE_POR_PAPEL) as Papel[];

function ehObjeto(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
function strNaoVazia(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}
function ehNumero(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}
function arrayDeStrings(v: unknown): v is string[] {
  return Array.isArray(v) && v.every(strNaoVazia);
}

export function validarContrato(c: unknown): { ok: true; contrato: SkillContract } | { ok: false; erros: string[] } {
  const erros: string[] = [];
  if (!ehObjeto(c)) return { ok: false, erros: ["contrato não é um objeto JSON"] };

  if (c.schema !== "skill-contract/v1") erros.push(`schema: esperado "skill-contract/v1", veio ${JSON.stringify(c.schema)}`);
  for (const campo of ["id", "versao", "nome", "familia_editorial", "motor_narrativo", "unidade_dramatica", "temporalidade", "politica_exposicao"]) {
    if (!strNaoVazia(c[campo])) erros.push(`${campo}: string não-vazia obrigatória`);
  }
  if (strNaoVazia(c.versao) && !/^\d+\.\d+\.\d+$/.test(c.versao)) erros.push(`versao: semver esperado (x.y.z), veio "${c.versao}"`);

  // pov
  if (!ehObjeto(c.pov)) erros.push("pov: objeto obrigatório");
  else {
    if (!PESSOAS_POV.includes(c.pov.pessoa as (typeof PESSOAS_POV)[number]))
      erros.push(`pov.pessoa: esperado um de ${PESSOAS_POV.join("|")}, veio ${JSON.stringify(c.pov.pessoa)}`);
    if (c.pov.rotacao !== undefined) {
      if (!ehObjeto(c.pov.rotacao)) erros.push("pov.rotacao: objeto quando presente");
      else {
        const r = c.pov.rotacao;
        for (const campo of ["fios_min", "fios_max", "max_caps_mesmo_fio"]) {
          if (!ehNumero(r[campo]) || (r[campo] as number) < 1) erros.push(`pov.rotacao.${campo}: número ≥1 obrigatório`);
        }
        if (ehNumero(r.fios_min) && ehNumero(r.fios_max) && r.fios_min > r.fios_max)
          erros.push(`pov.rotacao: fios_min (${r.fios_min}) > fios_max (${r.fios_max})`);
        for (const campo of ["max_caps_mesmo_fio_absoluto", "janela", "max_caps_fio_ausente"]) {
          if (r[campo] !== undefined && (!ehNumero(r[campo]) || (r[campo] as number) < 1))
            erros.push(`pov.rotacao.${campo}: número ≥1 quando presente`);
        }
        if (ehNumero(r.max_caps_mesmo_fio) && ehNumero(r.max_caps_mesmo_fio_absoluto) && r.max_caps_mesmo_fio_absoluto < r.max_caps_mesmo_fio)
          erros.push(`pov.rotacao: max_caps_mesmo_fio_absoluto (${r.max_caps_mesmo_fio_absoluto}) < max_caps_mesmo_fio (${r.max_caps_mesmo_fio})`);
      }
    }
  }

  // faixa_palavras (min ≤ alvo ≤ max quando presentes)
  if (!ehObjeto(c.faixa_palavras)) erros.push("faixa_palavras: objeto obrigatório");
  else {
    const f = c.faixa_palavras;
    for (const campo of ["min", "alvo", "max"]) {
      if (f[campo] !== undefined && (!ehNumero(f[campo]) || (f[campo] as number) <= 0))
        erros.push(`faixa_palavras.${campo}: número >0 quando presente`);
    }
    if (ehNumero(f.min) && ehNumero(f.alvo) && f.min > f.alvo) erros.push(`faixa_palavras: min (${f.min}) > alvo (${f.alvo})`);
    if (ehNumero(f.alvo) && ehNumero(f.max) && f.alvo > f.max) erros.push(`faixa_palavras: alvo (${f.alvo}) > max (${f.max})`);
    if (ehNumero(f.min) && ehNumero(f.max) && f.min > f.max) erros.push(`faixa_palavras: min (${f.min}) > max (${f.max})`);
  }

  // ritmo
  if (!ehObjeto(c.ritmo) || !strNaoVazia(c.ritmo.descricao)) erros.push("ritmo.descricao: string não-vazia obrigatória");
  else if (c.ritmo.cadencia !== undefined) {
    if (!ehObjeto(c.ritmo.cadencia)) erros.push("ritmo.cadencia: objeto quando presente");
    else for (const [k, v] of Object.entries(c.ritmo.cadencia)) if (!ehNumero(v)) erros.push(`ritmo.cadencia.${k}: número obrigatório`);
  }

  // acao_interioridade
  if (!ehObjeto(c.acao_interioridade)) erros.push("acao_interioridade: objeto obrigatório");
  else {
    if (!["acao_dominante", "equilibrio", "interioridade_dominante"].includes(c.acao_interioridade.relacao as string))
      erros.push(`acao_interioridade.relacao: esperado acao_dominante|equilibrio|interioridade_dominante, veio ${JSON.stringify(c.acao_interioridade.relacao)}`);
    if (!strNaoVazia(c.acao_interioridade.descricao)) erros.push("acao_interioridade.descricao: string não-vazia obrigatória");
  }

  // políticas
  if (!ehObjeto(c.politica_dialogo) || !strNaoVazia(c.politica_dialogo.descricao)) erros.push("politica_dialogo.descricao: string não-vazia obrigatória");
  else if (c.politica_dialogo.piso_percentual !== undefined && (!ehNumero(c.politica_dialogo.piso_percentual) || c.politica_dialogo.piso_percentual < 0 || c.politica_dialogo.piso_percentual > 100))
    erros.push("politica_dialogo.piso_percentual: número 0–100 quando presente");
  if (!ehObjeto(c.politica_metafora) || !strNaoVazia(c.politica_metafora.descricao)) erros.push("politica_metafora.descricao: string não-vazia obrigatória");
  else if (c.politica_metafora.cota_por_capitulo !== undefined && (!ehNumero(c.politica_metafora.cota_por_capitulo) || c.politica_metafora.cota_por_capitulo < 0))
    erros.push("politica_metafora.cota_por_capitulo: número ≥0 quando presente");

  // tipos_gancho: não-vazio
  if (!arrayDeStrings(c.tipos_gancho) || c.tipos_gancho.length === 0) erros.push("tipos_gancho: array não-vazio de strings obrigatório");

  // regras: ids únicos, tipo válido, cota coerente, papeis válidos
  const idsRegras = new Set<string>();
  if (!Array.isArray(c.regras)) erros.push("regras: array obrigatório");
  else {
    c.regras.forEach((r, i) => {
      if (!ehObjeto(r)) { erros.push(`regras[${i}]: objeto obrigatório`); return; }
      if (!strNaoVazia(r.id)) erros.push(`regras[${i}].id: string não-vazia obrigatória`);
      else if (idsRegras.has(r.id)) erros.push(`regras[${i}].id: duplicado ("${r.id}")`);
      else idsRegras.add(r.id);
      if (!strNaoVazia(r.texto)) erros.push(`regras[${i}].texto: string não-vazia obrigatória`);
      if (!TIPOS_REGRA.includes(r.tipo as (typeof TIPOS_REGRA)[number])) erros.push(`regras[${i}].tipo: esperado ${TIPOS_REGRA.join("|")}, veio ${JSON.stringify(r.tipo)}`);
      if (r.tipo === "cota" && r.cota === undefined) erros.push(`regras[${i}].cota: obrigatória quando tipo="cota"`);
      if (r.cota !== undefined) {
        if (!ehObjeto(r.cota)) erros.push(`regras[${i}].cota: objeto quando presente`);
        else {
          if (!COTA_POR.includes(r.cota.por as (typeof COTA_POR)[number])) erros.push(`regras[${i}].cota.por: esperado ${COTA_POR.join("|")}, veio ${JSON.stringify(r.cota.por)}`);
          if (r.cota.max === undefined && r.cota.min === undefined) erros.push(`regras[${i}].cota: max ou min obrigatório`);
          for (const campo of ["max", "min"]) {
            if (r.cota[campo] !== undefined && !ehNumero(r.cota[campo])) erros.push(`regras[${i}].cota.${campo}: número quando presente`);
          }
        }
      }
      if (!Array.isArray(r.papeis) || r.papeis.length === 0) erros.push(`regras[${i}].papeis: array não-vazio obrigatório`);
      else for (const p of r.papeis) if (!PAPEIS_VALIDOS.includes(p as Papel)) erros.push(`regras[${i}].papeis: papel inválido ${JSON.stringify(p)} (válidos: ${PAPEIS_VALIDOS.join(", ")})`);
    });
  }

  // testes_positivos / sinais_negativos / referencias
  if (!arrayDeStrings(c.testes_positivos) || c.testes_positivos.length === 0) erros.push("testes_positivos: array não-vazio de strings obrigatório");
  if (!Array.isArray(c.sinais_negativos) || !c.sinais_negativos.every(strNaoVazia)) erros.push("sinais_negativos: array de strings obrigatório");
  if (!Array.isArray(c.referencias) || !c.referencias.every(strNaoVazia)) erros.push("referencias: array de strings obrigatório (pode ser vazio)");

  // excecoes referenciam ids existentes
  if (!Array.isArray(c.excecoes)) erros.push("excecoes: array obrigatório (pode ser vazio)");
  else {
    c.excecoes.forEach((e, i) => {
      if (!ehObjeto(e)) { erros.push(`excecoes[${i}]: objeto obrigatório`); return; }
      if (!strNaoVazia(e.tipo_cena)) erros.push(`excecoes[${i}].tipo_cena: string não-vazia obrigatória`);
      if (!strNaoVazia(e.justificativa)) erros.push(`excecoes[${i}].justificativa: string não-vazia obrigatória`);
      if (!arrayDeStrings(e.regras_suspensas) || e.regras_suspensas.length === 0) erros.push(`excecoes[${i}].regras_suspensas: array não-vazio de ids obrigatório`);
      else for (const id of e.regras_suspensas) if (!idsRegras.has(id)) erros.push(`excecoes[${i}].regras_suspensas: id "${id}" não existe em regras`);
    });
  }

  // estruturas_exigidas (opcional)
  if (c.estruturas_exigidas !== undefined) {
    if (!ehObjeto(c.estruturas_exigidas)) erros.push("estruturas_exigidas: objeto quando presente");
    else {
      if (!Array.isArray(c.estruturas_exigidas.docs) || !c.estruturas_exigidas.docs.every(strNaoVazia)) erros.push("estruturas_exigidas.docs: array de strings obrigatório");
      if (!Array.isArray(c.estruturas_exigidas.campos_spec) || !c.estruturas_exigidas.campos_spec.every(strNaoVazia)) erros.push("estruturas_exigidas.campos_spec: array de strings obrigatório");
    }
  }

  // modelos_positivos (validados pelo autor; ≤120 palavras)
  if (!Array.isArray(c.modelos_positivos)) erros.push("modelos_positivos: array obrigatório (pode ser vazio)");
  else {
    c.modelos_positivos.forEach((m, i) => {
      if (!ehObjeto(m)) { erros.push(`modelos_positivos[${i}]: objeto obrigatório`); return; }
      for (const campo of ["id", "tecnica", "texto"]) if (!strNaoVazia(m[campo])) erros.push(`modelos_positivos[${i}].${campo}: string não-vazia obrigatória`);
      if (strNaoVazia(m.texto) && m.texto.trim().split(/\s+/).length > 120) erros.push(`modelos_positivos[${i}].texto: máximo 120 palavras`);
    });
  }

  if (erros.length > 0) return { ok: false, erros };
  return { ok: true, contrato: c as unknown as SkillContract };
}

// ---------------------------------------------------------------------------
// Carga
// ---------------------------------------------------------------------------

export function carregarContrato(id: string, baseDir?: string): ContratoCompilado {
  const base = baseDir ?? baseDirPadrao();
  const origem = path.join(base, id, "contrato.json");
  if (!existsSync(origem)) {
    const disponiveis = skillsDisponiveis(base);
    throw new ErroContrato(
      "CONTRATO_AUSENTE",
      `Contrato de skill "${id}" não encontrado em ${origem}. Skills disponíveis: ${disponiveis.length ? disponiveis.join(", ") : "(nenhuma)"}.`
    );
  }
  let bruto: unknown;
  try {
    bruto = JSON.parse(readFileSync(origem, "utf8"));
  } catch (e) {
    throw new ErroContrato("SCHEMA_INVALIDO", `Contrato "${id}" não é JSON válido (${origem}): ${(e as Error).message}`);
  }
  const val = validarContrato(bruto);
  if (!val.ok) {
    throw new ErroContrato("SCHEMA_INVALIDO", `Contrato "${id}" viola o schema skill-contract/v1 (${origem}):\n- ${val.erros.join("\n- ")}`);
  }
  if (val.contrato.id !== id) {
    throw new ErroContrato("SCHEMA_INVALIDO", `Contrato em ${origem} declara id "${val.contrato.id}", esperado "${id}" (diretório).`);
  }
  return { contrato: val.contrato, hash: hashContrato(val.contrato), origem };
}

/** sha256 do JSON canônico do contrato (chaves ordenadas; estável entre execuções). */
export function hashContrato(c: SkillContract): string {
  return hashJsonCanonico(c);
}

// ---------------------------------------------------------------------------
// Anti-ghostwriting: regra é instrução, nunca prosa-modelo
// ---------------------------------------------------------------------------

// Heurística simples: texto de regra com >40 palavras contendo travessão de
// diálogo (— seguido de maiúscula, fala) ou 1ª pessoa narrativa é suspeito de
// carregar prosa-modelo (modelos validados vivem em modelos_positivos, do autor).
const RE_TRAVESSAO_DIALOGO = /(^|\n)\s*—\s*[A-ZÀ-Ú]|—\s*[A-ZÀ-Ú][a-zà-ÿ]+\s+[a-zà-ÿ]/;
const RE_PRIMEIRA_PESSOA = /\b[Ee]u\s+(?:me\s+)?[a-zà-ÿ]+(?:o|ei|ia|ava|i)\b|\bsenti\b/;

export function verificarGhostwritingRegras(c: SkillContract): string[] {
  const suspeitas: string[] = [];
  for (const r of c.regras) {
    const palavras = r.texto.trim().split(/\s+/).length;
    if (palavras <= 40) continue;
    if (RE_TRAVESSAO_DIALOGO.test(r.texto) || RE_PRIMEIRA_PESSOA.test(r.texto)) {
      suspeitas.push(`regra "${r.id}": ${palavras} palavras com travessão de diálogo ou 1ª pessoa narrativa — parece prosa-modelo, não instrução`);
    }
  }
  return suspeitas;
}
