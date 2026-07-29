// Aprovação do briefing no navegador.
//
// O worker recalcula e valida este hash antes da fundação. A interface não
// decide se o briefing é válido; ela registra qual versão o autor aprovou.

export interface BriefingAprovadoWeb {
  schema: "briefing-aprovado/v1";
  hash: string;
  aprovado_por: string;
  aprovado_em: string;
  briefing: Record<string, unknown>;
}

function canonicalizar(valor: unknown): unknown {
  if (Array.isArray(valor)) return valor.map(canonicalizar);
  if (valor !== null && typeof valor === "object") {
    const ordenado: Record<string, unknown> = {};
    for (const chave of Object.keys(valor as Record<string, unknown>).sort()) {
      const item = (valor as Record<string, unknown>)[chave];
      if (item !== undefined) ordenado[chave] = canonicalizar(item);
    }
    return ordenado;
  }
  return valor;
}

export function jsonCanonico(valor: unknown): string {
  return JSON.stringify(canonicalizar(valor));
}

export async function sha256Hex(texto: string): Promise<string> {
  const bytes = new TextEncoder().encode(texto);
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(hash)].map((n) => n.toString(16).padStart(2, "0")).join("");
}

export async function aprovarBriefingWeb(
  briefing: Record<string, unknown>,
  por: string,
  em = new Date().toISOString()
): Promise<BriefingAprovadoWeb> {
  const aprovadoPor = por.trim();
  if (!aprovadoPor) throw new Error("A aprovação precisa identificar o autor.");
  return {
    schema: "briefing-aprovado/v1",
    hash: await sha256Hex(jsonCanonico(briefing)),
    aprovado_por: aprovadoPor,
    aprovado_em: em,
    briefing: structuredClone(briefing),
  };
}

export function aprovacaoAindaCorresponde(
  aprovacao: BriefingAprovadoWeb | null | undefined,
  briefing: Record<string, unknown>
): Promise<boolean> {
  if (!aprovacao || aprovacao.schema !== "briefing-aprovado/v1") return Promise.resolve(false);
  return sha256Hex(jsonCanonico(briefing)).then((hash) => hash === aprovacao.hash);
}
