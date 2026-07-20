// Engine V2 — hashing determinístico (JSON canônico + arquivos no disco).
import { existsSync, readFileSync } from "node:fs";
import { hashText } from "../quality-state.js";

/** Reordena chaves recursivamente para forma canônica (arrays preservam ordem). */
function canonicalizar(valor: unknown): unknown {
  if (Array.isArray(valor)) return valor.map(canonicalizar);
  if (valor !== null && typeof valor === "object") {
    const ordenado: Record<string, unknown> = {};
    for (const chave of Object.keys(valor as Record<string, unknown>).sort()) {
      const v = (valor as Record<string, unknown>)[chave];
      if (v !== undefined) ordenado[chave] = canonicalizar(v);
    }
    return ordenado;
  }
  return valor;
}

/** sha256 do JSON canônico (chaves ordenadas, sem espaços). Independe da ordem de inserção. */
export function hashJsonCanonico(obj: unknown): string {
  return hashText(JSON.stringify(canonicalizar(obj)));
}

/** sha256 do conteúdo do arquivo; null se o arquivo não existe. */
export function hashArquivo(caminho: string): string | null {
  if (!existsSync(caminho)) return null;
  return hashText(readFileSync(caminho, "utf8"));
}
