// AUDITORIA-ESTILO-DANBROWN.md (CR1): os parágrafos-modelo do perfil-de-voz —
// gerados sob o gate "assinatura ≥8" — ensinavam aforismo/personificação/símile,
// e o escritor imita o modelo, não a norma. A receita do arquiteto foi corrigida
// (patch); este normalizador cuida do LEGADO: analisa os modelos §2 com os
// detectores de transparência e SINALIZA no próprio perfil.
//
// Regra aprovada pelo autor (2026-07-17): reescrever prosa de modelo só quando a
// proveniência "gerado pela fundação" é COMPROVADA (marcador MODELOS-GERADOS,
// estampado pelo arquiteto pós-patch). Modelo sem o marcador = proveniência
// incerta (pode ter mão do autor) ⇒ apenas MODELO-FLAG, decisão fica com o autor.
// Nota: mesmo no caso comprovado, código determinístico não escreve prosa — o
// flag vira diretiva de REGERAÇÃO para o fluxo de fundação, nunca reescrita aqui.
// Idempotente por marcador (flag presente ⇒ no-op), como os demais normalizadores.
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  contarGnomico,
  contarManeirismos,
  contarMetaforaElaborada,
  contarPersonificacao,
  contarSanfona,
} from "./maneirismo.js";

export const MARCADOR_MODELO_FLAG = "<!-- MODELO-FLAG v1";
export const MARCADOR_MODELOS_GERADOS = "<!-- MODELOS-GERADOS v1 -->";

const RE_HEADING_MODELOS = /^##\s*2\.\s*par[áa]grafos-modelo.*$/miu;

export interface ModelosFlagResultado {
  texto: string;
  mudou: boolean;
  flags: string[]; // tiques encontrados nos modelos (vazio = modelos limpos)
}

// Só as linhas de citação dos modelos (>), excluindo as explicações em itálico
// ("> *O que aqui é assinatura:* …" / "> — *Assinatura aqui:* …") — analisar a
// explicação flagraria a própria descrição do tique.
function textoDosModelos(secao: string): string {
  return secao
    .split(/\n/)
    .filter((l) => /^\s*>/.test(l) && !/^\s*>\s*[—–-]?\s*\*/.test(l))
    .map((l) => l.replace(/^\s*>\s?/, ""))
    .join("\n");
}

export function flagModelosPerfil(conteudo: string): ModelosFlagResultado {
  const t = conteudo ?? "";
  const m = RE_HEADING_MODELOS.exec(t);
  if (!m) return { texto: t, mudou: false, flags: [] };

  const inicio = m.index + m[0].length;
  const resto = t.slice(inicio);
  const fim = resto.search(/^##\s|^---\s*$/m);
  const secao = fim >= 0 ? resto.slice(0, fim) : resto;

  if (secao.includes(MARCADOR_MODELO_FLAG)) return { texto: t, mudou: false, flags: [] };

  const modelos = textoDosModelos(secao);
  if (!modelos.trim()) return { texto: t, mudou: false, flags: [] };

  const flags: string[] = [];
  const gn = contarGnomico(modelos);
  if (gn.n > 0) flags.push(`gnomico=${gn.n}`);
  const pe = contarPersonificacao(modelos);
  if (pe.n > 0) flags.push(`personificacao=${pe.n}`);
  const sa = contarSanfona(modelos);
  if (sa.n > 0) flags.push(`sanfona=${sa.n}`);
  const me = contarMetaforaElaborada(modelos);
  if (me.n > 0) flags.push(`metafora=${me.n}`);
  // Moldes nomeados (eco de negação, antítese, símile-andaime…): em MODELO a
  // proibição é total (decisão do autor) — qualquer ocorrência flagra.
  const moldes = contarManeirismos(modelos).padroes.filter((p) => p.n > 0);
  for (const p of moldes) flags.push(`molde:${p.nome}=${p.n}`);

  if (!flags.length) return { texto: t, mudou: false, flags: [] };

  const gerados = t.includes(MARCADOR_MODELOS_GERADOS);
  const veredicto = gerados
    ? "gerados pela fundação e FORA do contrato atual — REGERAR os modelos com a receita corrigida do arquiteto"
    : "proveniência não comprovada como gerada — DECISÃO DO AUTOR pendente";
  const flag =
    `${MARCADOR_MODELO_FLAG}: os parágrafos-modelo abaixo contêm tiques que o ` +
    `ORÇAMENTO desta obra proíbe (${flags.join(", ")}); ${veredicto} ` +
    `(AUDITORIA-ESTILO-DANBROWN.md). Escritor: NÃO imite os tiques flagrados — ` +
    `imite a lente e o léxico; a régua é o ORÇAMENTO DE PÁGINA. -->`;

  const texto = t.slice(0, inicio) + "\n\n" + flag + t.slice(inicio);
  return { texto, mudou: true, flags };
}

export interface ModelosPerfilAjuste { arquivo: string; mudou: boolean; flags: string[] }

// Garante o flag de modelos no perfil-de-voz.md de um projeto (idempotente).
export async function desornamentarModelosPerfil(projDir: string): Promise<ModelosPerfilAjuste> {
  const perfilPath = path.join(projDir, "perfil-de-voz.md");
  let conteudo: string;
  try {
    conteudo = await readFile(perfilPath, "utf8");
  } catch {
    return { arquivo: "perfil-de-voz.md", mudou: false, flags: [] };
  }
  const { texto, mudou, flags } = flagModelosPerfil(conteudo);
  if (mudou) await writeFile(perfilPath, texto, "utf8");
  return { arquivo: "perfil-de-voz.md", mudou, flags };
}
