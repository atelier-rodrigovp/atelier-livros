// Prontidão publicada — como a TELA sabe o que o `npm run prontidao` concluiu.
//
// O artefato do prontidão é um arquivo local (`.prontidao/prontidao.json`) e o
// front é um site estático: ele nunca vai ler disco da máquina do autor. Sem uma
// ponte, a distinção entre saúde local e produção certificada existia só no
// terminal — e a tela ficava livre para dar a impressão de "tudo pronto".
//
// A ponte segue a convenção que o projeto já usa para telemetria: uma linha em
// `jobs` com `tipo='prontidao_v2'` e payload versionado, publicada por
// `worker/scripts/publicar-prontidao.ts`. Nada aqui escreve; esta camada só
// interpreta o que veio.

export const SCHEMA_PRONTIDAO_PUBLICADA = "prontidao-publicada/v1";

export interface PayloadProntidao {
  schema?: string;
  /** HEAD em que o prontidão rodou. */
  head?: string;
  gerado_em?: string;
  estados?: Record<string, string>;
  bloqueios_producao?: string[];
}

export interface ProntidaoNaTela {
  local: string;
  producao: string;
  bloqueios: string[];
  /** Por que a tela não pode afirmar nada, quando é o caso. */
  indisponivel: string | null;
}

const DESCONHECIDO: ProntidaoNaTela = {
  local: "DESCONHECIDO",
  producao: "DESCONHECIDO",
  bloqueios: [],
  indisponivel: "nenhuma execução de prontidão publicada — rode `npm run prontidao` e publique",
};

/**
 * Ausência de dado NUNCA vira estado saudável: sem publicação, a tela diz
 * "desconhecido" e explica, em vez de omitir a linha e parecer que está tudo bem.
 */
export function lerProntidaoPublicada(payload: unknown): ProntidaoNaTela {
  if (!payload || typeof payload !== "object") return DESCONHECIDO;
  const p = payload as PayloadProntidao;
  if (p.schema !== SCHEMA_PRONTIDAO_PUBLICADA) {
    return { ...DESCONHECIDO, indisponivel: `payload de prontidão em formato desconhecido (${String(p.schema)})` };
  }
  const local = p.estados?.implementacao_local ?? "DESCONHECIDO";
  const producao = p.estados?.release_producao ?? "DESCONHECIDO";
  const bloqueios = Array.isArray(p.bloqueios_producao) ? p.bloqueios_producao : [];

  // Publicação sem bloqueio listado E sem certificado é contraditória: preferimos
  // dizer que não dá para afirmar a dizer que está liberado.
  if (!producao.startsWith("RELEASE_PRODUCAO_CERTIFICADO") && bloqueios.length === 0) {
    return { local, producao, bloqueios, indisponivel: "publicação incompleta: produção não certificada e sem motivos listados" };
  }
  return { local, producao, bloqueios, indisponivel: null };
}

/** O HEAD publicado, curto, para a tela dizer contra o que aquilo vale. */
export function commitDaProntidao(payload: unknown): string | null {
  const head = (payload as PayloadProntidao | null)?.head;
  return typeof head === "string" && /^[0-9a-f]{7,40}$/.test(head) ? head.slice(0, 7) : null;
}
