/**
 * Objetos de `manuscritos` são mutáveis no mesmo caminho: fundação refinada,
 * capítulo corrigido e consolidação substituem bytes sem trocar a chave.
 * Cache de uma hora fazia a UI poder ler a versão anterior logo após o upsert.
 *
 * Capas/EPUBs/pacotes usam caminhos de artefato e podem aproveitar cache.
 */
export function cacheControlUpload(bucket: string): string {
  return bucket === "manuscritos" ? "0" : "3600";
}
