import path from "node:path";

export function assertSafeSegment(value: string, label = "segmento"): string {
  if (!value || value === "." || value === ".." || /[\\/\0]/.test(value)) {
    throw new Error(`${label} inseguro: ${JSON.stringify(value)}`);
  }
  return value;
}

export function safeResolveWithin(root: string, ...segments: string[]): string {
  const base = path.resolve(root);
  const target = path.resolve(base, ...segments.map((s) => assertSafeSegment(s)));
  if (target !== base && !target.startsWith(base + path.sep)) throw new Error(`caminho fora da raiz permitida: ${target}`);
  return target;
}
