import { createHash } from "node:crypto";
import path from "node:path";
import { assertSafeSegment } from "./path-safety.js";

export type PublicationFile = {
  kind: "chapter" | "manuscript" | "epub";
  bucket: "manuscritos" | "epubs";
  localPath: string;
  filename: string;
  numero?: number;
  titulo?: string | null;
  palavras?: number;
};

export interface PublicationManifest {
  version: "publication-manifest-v2";
  id: string;
  owner: string;
  projectId: string;
  editionId: string;
  files: Array<PublicationFile & { sha256: string; storagePath: string }>;
}

export interface PublicationTransactionIO {
  read(localPath: string): Promise<Buffer>;
  upload(bucket: string, storagePath: string, localPath: string): Promise<void>;
  writeManifest(manifest: PublicationManifest): Promise<void>;
  promote(input: {
    owner: string;
    projectId: string;
    editionId: string;
    manifest: PublicationManifest;
    chapters: Array<{ numero: number; titulo: string | null; palavras: number; storage_path: string }>;
    artifacts: Array<{ tipo: "manuscrito" | "epub"; storage_path: string; meta: Record<string, unknown> }>;
  }): Promise<void>;
}

export async function buildPublicationManifest(input: {
  owner: string; projectId: string; editionId: string; files: PublicationFile[];
}, read: (p: string) => Promise<Buffer>): Promise<PublicationManifest> {
  const hashed = await Promise.all(input.files.map(async (f) => ({ ...f, sha256: createHash("sha256").update(await read(f.localPath)).digest("hex") })));
  hashed.sort((a, b) => `${a.kind}:${a.numero ?? 0}:${a.filename}`.localeCompare(`${b.kind}:${b.numero ?? 0}:${b.filename}`));
  const id = createHash("sha256").update(JSON.stringify(hashed.map(({ kind, numero, filename, sha256 }) => ({ kind, numero, filename, sha256 })))).digest("hex").slice(0, 24);
  const prefix = `${assertSafeSegment(input.owner, "owner")}/${assertSafeSegment(input.projectId, "projectId")}/publications/${id}`;
  return {
    version: "publication-manifest-v2",
    id,
    owner: input.owner,
    projectId: input.projectId,
    editionId: input.editionId,
    files: hashed.map((f) => ({ ...f, storagePath: `${prefix}/${f.kind === "chapter" ? "chapters" : "artifacts"}/${path.basename(f.filename)}` })),
  };
}

export async function executePublicationTransaction(input: {
  owner: string; projectId: string; editionId: string; files: PublicationFile[];
}, io: PublicationTransactionIO): Promise<PublicationManifest> {
  const manifest = await buildPublicationManifest(input, io.read);
  await io.writeManifest(manifest);
  // Uploads usam chaves derivadas do conteúdo. Repetir a transação é idempotente.
  for (const f of manifest.files) await io.upload(f.bucket, f.storagePath, f.localPath);
  const chapters = manifest.files.filter((f) => f.kind === "chapter").map((f) => ({
    numero: Number(f.numero), titulo: f.titulo ?? null, palavras: Number(f.palavras ?? 0), storage_path: f.storagePath,
  }));
  const artifacts = manifest.files.filter((f): f is typeof f & { kind: "manuscript" | "epub" } => f.kind !== "chapter").map((f) => ({
    tipo: (f.kind === "manuscript" ? "manuscrito" : "epub") as "manuscrito" | "epub",
    storage_path: f.storagePath, meta: { manifest_id: manifest.id, sha256: f.sha256 },
  }));
  // Única fronteira que torna a versão visível como pronta.
  await io.promote({ owner: input.owner, projectId: input.projectId, editionId: input.editionId, manifest, chapters, artifacts });
  return manifest;
}
