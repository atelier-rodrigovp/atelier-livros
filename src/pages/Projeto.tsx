import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Copy, Download, FileText, Image, Languages, Loader2, PenLine, Play } from "lucide-react";
import { toast } from "sonner";
import { supabase, enqueueJob } from "@/lib/supabase";
import { signedUrl } from "@/lib/storage";
import { IDIOMAS, type Job, type Project } from "@/lib/types";
import { jobStatusBadge, projectStatusBadge } from "@/lib/status";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface Edition { id: string; idioma: string; status: string; is_origem: boolean; nota_review: number | null; }
interface Artifact { id: string; edition_id: string | null; tipo: string; storage_path: string; url_publica: string | null; }
interface Pkg { id: string; edition_id: string; sinopse: string | null; descricao_html: string | null; keywords: string[] | null; categorias: string[] | null; subtitulo: string | null; preco_sugerido: number | null; }

function jobMaisRecente(jobs: Job[], tipo: string, editionId?: string) {
  return jobs.find((j) => j.tipo === tipo && (!editionId || j.edition_id === editionId));
}

function JobStatus({ job }: { job?: Job }) {
  if (!job) return null;
  const b = jobStatusBadge(job.status);
  const p = job.progresso || {};
  return (
    <span className="flex items-center gap-2 text-xs text-muted-foreground">
      <Badge variant={b.variant}>{b.label}</Badge>
      {p.fase ? <span>{String(p.fase)}</span> : null}
      {p.cap_atual != null && p.total != null ? <span>· cap {String(p.cap_atual)}/{String(p.total)}</span> : null}
      {p.nota != null ? <span>· nota {String(p.nota)}</span> : null}
      {job.erro ? <span className="text-destructive">· {job.erro.slice(0, 80)}</span> : null}
    </span>
  );
}

export default function Projeto() {
  const { id } = useParams<{ id: string }>();
  const [proj, setProj] = useState<Project | null>(null);
  const [editions, setEditions] = useState<Edition[]>([]);
  const [chapters, setChapters] = useState<Record<string, number>>({});
  const [artifacts, setArtifacts] = useState<Artifact[]>([]);
  const [pkgs, setPkgs] = useState<Pkg[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [idiomasSel, setIdiomasSel] = useState<string[]>([]);

  const carregar = useCallback(async () => {
    if (!id) return;
    const [{ data: p }, { data: eds }, { data: arts }, { data: pk }, { data: js }, { data: chs }] =
      await Promise.all([
        supabase.from("projects").select("*").eq("id", id).single(),
        supabase.from("editions").select("*").eq("project_id", id).order("is_origem", { ascending: false }),
        supabase.from("artifacts").select("*").in("edition_id", (await supabase.from("editions").select("id").eq("project_id", id)).data?.map((e) => e.id) ?? ["00000000-0000-0000-0000-000000000000"]),
        supabase.from("publishing_packages").select("*"),
        supabase.from("jobs").select("*").eq("project_id", id).order("created_at", { ascending: false }),
        supabase.from("chapters").select("edition_id"),
      ]);
    setProj((p as Project) ?? null);
    setEditions((eds as Edition[]) ?? []);
    setArtifacts((arts as Artifact[]) ?? []);
    setPkgs((pk as Pkg[]) ?? []);
    setJobs((js as Job[]) ?? []);
    const counts: Record<string, number> = {};
    for (const c of (chs as { edition_id: string }[]) ?? []) counts[c.edition_id] = (counts[c.edition_id] ?? 0) + 1;
    setChapters(counts);
  }, [id]);

  useEffect(() => {
    carregar();
    const ch = supabase
      .channel(`proj-${id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "jobs", filter: `project_id=eq.${id}` }, () => carregar())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [id, carregar]);

  const origem = useMemo(() => editions.find((e) => e.is_origem), [editions]);

  async function enfileira(tipo: any, payload: Record<string, unknown>, edition_id?: string) {
    try {
      await enqueueJob(tipo, payload, { project_id: id, edition_id });
      toast.success("Job enfileirado.");
      carregar();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  async function baixar(a: Artifact, bucket: string) {
    const url = a.url_publica || (await signedUrl(bucket, a.storage_path));
    if (url) window.open(url, "_blank");
    else toast.error("Não consegui gerar o link.");
  }

  if (!proj) return <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  const sb = projectStatusBadge(proj.status);
  const capaDe = (ed: string) => artifacts.find((a) => a.edition_id === ed && a.tipo === "capa");
  const epubsDe = (ed: string) => artifacts.filter((a) => a.edition_id === ed && a.tipo === "epub");
  const pkgDe = (ed: string) => pkgs.find((p) => p.edition_id === ed);

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <Link to="/" className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Dashboard
      </Link>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">{proj.titulo}</h1>
          <p className="mt-1 text-muted-foreground">{proj.genero ?? "—"} · {proj.idioma_origem}</p>
        </div>
        <Badge variant={sb.variant}>{sb.label}</Badge>
      </div>

      <Tabs defaultValue="escrita">
        <TabsList className="flex-wrap">
          <TabsTrigger value="fundacao">Fundação</TabsTrigger>
          <TabsTrigger value="escrita">Escrita</TabsTrigger>
          <TabsTrigger value="edicoes">Edições</TabsTrigger>
          <TabsTrigger value="capas">Capas</TabsTrigger>
          <TabsTrigger value="epubs">EPUBs</TabsTrigger>
          <TabsTrigger value="publicacao">Publicação</TabsTrigger>
        </TabsList>

        {/* FUNDAÇÃO */}
        <TabsContent value="fundacao">
          <Card>
            <CardHeader><CardTitle className="text-xl">Fundação</CardTitle></CardHeader>
            <CardContent className="space-y-3 text-sm">
              <JobStatus job={jobMaisRecente(jobs, "criar_fundacao")} />
              <p className="text-muted-foreground">Documentos gerados pela skill arquiteto-de-enredo.</p>
              <div className="flex flex-wrap gap-2">
                {["Biblia-da-Obra.md", "Estrutura-do-Livro.md", "Mapa-de-Personagens.md"].map((f) => (
                  <Button key={f} variant="outline" size="sm" onClick={async () => {
                    const url = await signedUrl("manuscritos", `${proj.owner}/${proj.id}/fundacao/${f}`);
                    if (url) window.open(url, "_blank"); else toast.error("Ainda não disponível.");
                  }}>
                    <FileText className="h-4 w-4" /> {f}
                  </Button>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ESCRITA */}
        <TabsContent value="escrita">
          <Card>
            <CardHeader><CardTitle className="text-xl">Escrita do livro</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-3">
                <Button onClick={() => enfileira("escrever_livro", {})}>
                  <PenLine className="h-4 w-4" /> Escrever livro
                </Button>
                <JobStatus job={jobMaisRecente(jobs, "escrever_livro")} />
              </div>
              <p className="text-sm text-muted-foreground">
                Roda o livro_runner.py (Opus) capítulo a capítulo até a meta de nota, com verdade do disco.
                {origem ? ` Capítulos (origem): ${chapters[origem.id] ?? 0}.` : ""}
                {origem?.nota_review != null ? ` Nota: ${origem.nota_review}.` : ""}
              </p>
            </CardContent>
          </Card>
        </TabsContent>

        {/* EDIÇÕES / TRADUÇÃO */}
        <TabsContent value="edicoes">
          <Card>
            <CardHeader><CardTitle className="text-xl">Edições por idioma</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <p className="text-sm font-medium">Traduzir para:</p>
                <div className="flex flex-wrap gap-2">
                  {IDIOMAS.filter((i) => i !== proj.idioma_origem).map((i) => {
                    const on = idiomasSel.includes(i);
                    return (
                      <button key={i} type="button"
                        onClick={() => setIdiomasSel((s) => on ? s.filter((x) => x !== i) : [...s, i])}
                        className={`rounded-full border px-3 py-1 text-xs ${on ? "border-primary bg-primary/10 text-primary" : "text-muted-foreground"}`}>
                        {i}
                      </button>
                    );
                  })}
                </div>
                <div className="flex items-center gap-3 pt-1">
                  <Button size="sm" disabled={!idiomasSel.length} onClick={() => enfileira("traduzir", { idiomas: idiomasSel })}>
                    <Languages className="h-4 w-4" /> Traduzir ({idiomasSel.length})
                  </Button>
                  <JobStatus job={jobMaisRecente(jobs, "traduzir")} />
                </div>
              </div>
              <ul className="divide-y">
                {editions.map((e) => (
                  <li key={e.id} className="flex items-center justify-between py-2 text-sm">
                    <span className="font-medium">{e.idioma} {e.is_origem && <span className="text-muted-foreground">(origem)</span>}</span>
                    <span className="text-muted-foreground">{chapters[e.id] ?? 0} caps{e.nota_review != null ? ` · nota ${e.nota_review}` : ""}</span>
                    <Badge variant="outline">{e.status}</Badge>
                  </li>
                ))}
                {!editions.length && <li className="py-4 text-center text-muted-foreground">Nenhuma edição ainda.</li>}
              </ul>
            </CardContent>
          </Card>
        </TabsContent>

        {/* CAPAS */}
        <TabsContent value="capas">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {editions.map((e) => {
              const capa = capaDe(e.id);
              return (
                <Card key={e.id}>
                  <CardHeader><CardTitle className="text-base">{e.idioma}</CardTitle></CardHeader>
                  <CardContent className="space-y-3">
                    {capa?.url_publica ? (
                      <img src={capa.url_publica} alt={`Capa ${e.idioma}`} className="aspect-[1.6/1] w-full rounded object-cover" />
                    ) : (
                      <div className="flex aspect-[1.6/1] w-full items-center justify-center rounded border border-dashed text-muted-foreground">
                        <Image className="h-6 w-6" />
                      </div>
                    )}
                    <Button size="sm" variant="outline" className="w-full" onClick={() => enfileira("gerar_capa", {}, e.id)}>
                      Gerar capa
                    </Button>
                    <JobStatus job={jobMaisRecente(jobs, "gerar_capa", e.id)} />
                  </CardContent>
                </Card>
              );
            })}
            {!editions.length && <p className="text-muted-foreground">Crie a edição primeiro.</p>}
          </div>
        </TabsContent>

        {/* EPUBS */}
        <TabsContent value="epubs">
          <Card>
            <CardHeader><CardTitle className="text-xl">EPUBs por idioma</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <ul className="divide-y">
                {editions.map((e) => (
                  <li key={e.id} className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm">
                    <span className="font-medium">{e.idioma}</span>
                    <div className="flex items-center gap-2">
                      {epubsDe(e.id).map((a) => (
                        <Button key={a.id} size="sm" variant="ghost" onClick={() => baixar(a, "epubs")}>
                          <Download className="h-4 w-4" /> EPUB
                        </Button>
                      ))}
                      <Button size="sm" variant="outline" onClick={() => enfileira("gerar_epub", {}, e.id)}>
                        <Play className="h-4 w-4" /> Gerar EPUB
                      </Button>
                    </div>
                    <JobStatus job={jobMaisRecente(jobs, "gerar_epub", e.id)} />
                  </li>
                ))}
                {!editions.length && <li className="py-4 text-center text-muted-foreground">Nenhuma edição.</li>}
              </ul>
            </CardContent>
          </Card>
        </TabsContent>

        {/* PUBLICAÇÃO */}
        <TabsContent value="publicacao">
          <div className="space-y-4">
            {editions.map((e) => {
              const pk = pkgDe(e.id);
              return (
                <Card key={e.id}>
                  <CardHeader className="flex flex-row items-center justify-between">
                    <CardTitle className="text-base">{e.idioma}</CardTitle>
                    <Button size="sm" variant="outline" onClick={() => enfileira("gerar_pacote", {}, e.id)}>Gerar pacote</Button>
                  </CardHeader>
                  <CardContent className="space-y-3 text-sm">
                    <JobStatus job={jobMaisRecente(jobs, "gerar_pacote", e.id)} />
                    {pk ? (
                      <div className="space-y-2">
                        <CopyRow label="Sinopse" value={pk.sinopse ?? ""} />
                        <CopyRow label="Subtítulo" value={pk.subtitulo ?? ""} />
                        <CopyRow label="Keywords (7)" value={(pk.keywords ?? []).join(", ")} />
                        <CopyRow label="Categorias (3)" value={(pk.categorias ?? []).join(" | ")} />
                        {pk.preco_sugerido != null && <p className="text-muted-foreground">Preço sugerido: {pk.preco_sugerido}</p>}
                      </div>
                    ) : (
                      <p className="text-muted-foreground">Pacote ainda não gerado.</p>
                    )}
                  </CardContent>
                </Card>
              );
            })}
            {!editions.length && <p className="text-muted-foreground">Crie a edição primeiro.</p>}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function CopyRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3 rounded border bg-muted/30 p-2">
      <div className="min-w-0">
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        <p className="truncate">{value || "—"}</p>
      </div>
      <Button size="icon" variant="ghost" className="h-7 w-7 shrink-0" disabled={!value}
        onClick={() => { navigator.clipboard.writeText(value); toast.success("Copiado."); }}>
        <Copy className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}
