// Quais documentos da fundação a tela do projeto oferece para abrir (defeito D7).
//
// A tela tinha uma lista FIXA com nomes da V1 (`Biblia-da-Obra.md`,
// `Estrutura-do-Livro.md`, `Mapa-de-Personagens.md`). Num livro V2 nenhum desses
// objetos existe — os nomes reais são outros, e os documentos exigidos pelo
// contrato (dossiê factual, matriz de relógios) nem apareciam na lista.
//
// Agora a lista vem do ÍNDICE que o worker publica no progresso do job. Quando o
// índice não existe (livro V1, ou fundação anterior a esta versão), cai na lista
// legada — que continua correta para a V1.

export interface DocumentoFundacaoUI {
  titulo: string;
  /** Caminho relativo ao projeto; o Storage guarda `<owner>/<projeto>/<caminho>`. */
  caminho: string;
  origem: "nucleo" | "contrato" | "legado";
}

/** Documentos da V1 — nomes que a V1 de fato escreve em `fundacao/`. */
export const DOCUMENTOS_LEGADO: DocumentoFundacaoUI[] = [
  { titulo: "Bíblia da Obra", caminho: "fundacao/Biblia-da-Obra.md", origem: "legado" },
  { titulo: "Estrutura do Livro", caminho: "fundacao/Estrutura-do-Livro.md", origem: "legado" },
  { titulo: "Mapa de Personagens", caminho: "fundacao/Mapa-de-Personagens.md", origem: "legado" },
  { titulo: "Perfil de voz", caminho: "fundacao/perfil-de-voz.md", origem: "legado" },
];

interface EntradaIndice {
  titulo?: unknown;
  caminho?: unknown;
  origem?: unknown;
}

/**
 * Lista a exibir. `progresso.documentos` é o índice publicado pelo worker V2;
 * qualquer entrada malformada é descartada em silêncio (a tela nunca deve
 * oferecer um botão que não abre nada).
 */
export function documentosParaExibir(progresso: unknown): DocumentoFundacaoUI[] {
  const bruto = (progresso as { documentos?: unknown } | null | undefined)?.documentos;
  if (!Array.isArray(bruto) || bruto.length === 0) return DOCUMENTOS_LEGADO;
  const validos: DocumentoFundacaoUI[] = [];
  for (const d of bruto as EntradaIndice[]) {
    if (typeof d?.caminho !== "string" || !d.caminho.trim()) continue;
    const origem = d.origem === "contrato" ? "contrato" : "nucleo";
    const titulo = typeof d.titulo === "string" && d.titulo.trim() ? d.titulo : d.caminho;
    validos.push({ titulo, caminho: d.caminho, origem });
  }
  return validos.length ? validos : DOCUMENTOS_LEGADO;
}

/** Chave do objeto no Storage. Mesma forma que o worker usa ao subir. */
export function chaveStorageDocumento(owner: string, projectId: string, caminho: string): string {
  return `${owner}/${projectId}/${caminho}`;
}

/** Documentos exigidos pelo contrato que a fundação produziu (para destacar na UI). */
export function documentosDoContrato(docs: DocumentoFundacaoUI[]): DocumentoFundacaoUI[] {
  return docs.filter((d) => d.origem === "contrato");
}
