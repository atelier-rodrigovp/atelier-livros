// Engine V2 — documentos da fundação: disco, Storage e o que a interface abre
// (defeito D7).
//
// O que estava errado: `materializarFundacao` gravava os documentos no DISCO do
// worker e mais nada. A tela do projeto tentava baixar
// `<owner>/<id>/fundacao/Biblia-da-Obra.md` — nome que a V2 nunca escreveu, e de
// um objeto que nunca subiu. Resultado: os quatro botões de download da fundação
// não abriam nada em livro V2, e os documentos exigidos pelo contrato (dossiê
// factual, matriz de relógios…) não apareciam sequer na lista.
//
// Aqui existe UMA lista canônica de documentos. Ela alimenta ao mesmo tempo:
// o que é gravado no disco, o que sobe para o Storage, os hashes do estado
// canônico e a lista que a interface renderiza. Um só lugar, sem divergir.

import { createHash } from "node:crypto";
import path from "node:path";
import type { FundacaoV2 } from "./fundacao.js";
import { hashJsonCanonico } from "./hash.js";

export interface DocumentoFundacao {
  /** Rótulo para a interface. */
  titulo: string;
  /** Caminho relativo ao diretório do projeto — mesmo no disco e no Storage. */
  caminho: string;
  conteudo: string;
  /** `contrato` = exigido por `estruturas_exigidas.docs`; `nucleo` = sempre existe. */
  origem: "nucleo" | "contrato";
}

/** Só o basename, nunca fora de `fundacao/` (o nome vem do modelo). */
export function nomeSeguroDeDoc(nome: string): string | null {
  const bruto = String(nome ?? "").trim();
  // Rejeita, não "conserta": aplicar basename em "../../etc/passwd" daria
  // "passwd" e o documento entraria com outro nome — o portão então acusaria o
  // doc exigido como ausente sem dizer por quê.
  if (!bruto || bruto.startsWith(".") || /[\\/]/.test(bruto)) return null;
  const seguro = path.basename(bruto);
  return seguro && !seguro.startsWith(".") ? seguro : null;
}

/**
 * Lista CANÔNICA dos documentos da fundação. Tudo o que a engine materializa,
 * sobe e mostra sai daqui.
 */
export function documentosDaFundacao(fundacao: FundacaoV2): DocumentoFundacao[] {
  const docs: DocumentoFundacao[] = [
    {
      titulo: "Perfil de voz",
      caminho: "perfil-de-voz.md",
      conteudo: fundacao.perfil_voz,
      origem: "nucleo",
    },
    {
      titulo: "Bíblia da obra",
      caminho: "fundacao/biblia-da-obra.md",
      conteudo: fundacao.biblia,
      origem: "nucleo",
    },
    {
      titulo: "Mapa de personagens",
      caminho: "fundacao/mapa-personagens.json",
      // Formato `{personagens: [...]}` — o que já está no disco dos livros em
      // produção. Mudar a forma aqui quebraria a leitura dos projetos existentes.
      conteudo: JSON.stringify({ personagens: fundacao.mapa_personagens }, null, 2),
      origem: "nucleo",
    },
    {
      titulo: "Estrutura do livro",
      caminho: "estrutura.json",
      conteudo: JSON.stringify(
        {
          estrutura: fundacao.estrutura,
          fios: fundacao.fios,
          promessa: fundacao.promessa_editorial,
          ...(fundacao.arco ? { arco: fundacao.arco } : {}),
        },
        null,
        2
      ),
      origem: "nucleo",
    },
  ];
  for (const [nome, conteudo] of Object.entries(fundacao.docs_exigidos ?? {})) {
    const seguro = nomeSeguroDeDoc(nome);
    if (!seguro) continue;
    docs.push({
      titulo: seguro.replace(/\.[^.]+$/, "").replace(/[-_]/g, " "),
      caminho: `fundacao/${seguro}`,
      conteudo,
      origem: "contrato",
    });
  }
  return docs;
}

/** Hash por documento, para o estado canônico (detecção de substituição). */
export function hashesDosDocumentos(docs: DocumentoFundacao[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const d of docs) {
    out[d.caminho] = d.caminho.endsWith(".json")
      ? hashJsonCanonico(JSON.parse(d.conteudo))
      : createHash("sha256").update(d.conteudo, "utf8").digest("hex");
  }
  return out;
}

/**
 * Caminho do objeto no Storage. Bate com o que a interface pede em
 * `signedUrl("manuscritos", ...)`: `<owner>/<project>/<caminho relativo>`.
 */
export function chaveStorage(owner: string, projectId: string, caminhoRelativo: string): string {
  return `${owner}/${projectId}/${caminhoRelativo}`;
}

/**
 * Índice que a interface consome (persistido no estado canônico). Sem ele a tela
 * teria de adivinhar quais documentos existem — que é exatamente como ela passou
 * a tentar abrir arquivos inexistentes.
 */
export interface IndiceDocumentos {
  gerado_em: string;
  documentos: { titulo: string; caminho: string; origem: "nucleo" | "contrato"; hash: string }[];
}

export function indiceDeDocumentos(docs: DocumentoFundacao[], geradoEm: string): IndiceDocumentos {
  const hashes = hashesDosDocumentos(docs);
  return {
    gerado_em: geradoEm,
    documentos: docs.map((d) => ({ titulo: d.titulo, caminho: d.caminho, origem: d.origem, hash: hashes[d.caminho] })),
  };
}

/**
 * Documentos que o contrato exige e a fundação NÃO produziu. A ausência não pode
 * ser engolida: vira bloqueio no portão (DOC_EXIGIDO_AUSENTE) e some da lista da
 * interface só quando de fato existir.
 */
export function docsExigidosFaltando(fundacao: FundacaoV2, exigidos: string[]): string[] {
  const presentes = new Set(
    documentosDaFundacao(fundacao)
      .filter((d) => d.origem === "contrato")
      .map((d) => path.basename(d.caminho))
  );
  return exigidos.filter((e) => !presentes.has(path.basename(e)));
}
