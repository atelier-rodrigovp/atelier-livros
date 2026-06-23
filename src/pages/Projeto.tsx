import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, BookOpen, ClipboardCheck, Copy, Download, FileText, Gauge, Image, Languages, Loader2, Maximize2, Pencil, PenLine, Play, Sparkles, Trash2, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { supabase, enqueueJob } from "@/lib/supabase";
import { signedUrl, downloadText, deleteProject } from "@/lib/storage";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ChevronDown } from "lucide-react";
import { IDIOMAS, type Job, type Project } from "@/lib/types";
import { jobStatusBadge, projectStatusBadge } from "@/lib/status";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

interface Edition { id: string; idioma: string; status: string; is_origem: boolean; nota_review: number | null; }
interface Artifact { id: string; edition_id: string | null; tipo: string; storage_path: string; url_publica: string | null; created_at?: string; meta?: any; }
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
      {p.etapa ? <span>· {String(p.etapa)}</span> : null}
      {p.cap_atual != null && p.total != null ? <span>· cap {String(p.cap_atual)}/{String(p.total)}</span> : null}
      {p.nota != null ? <span>· nota {String(p.nota)}</span> : null}
      {job.erro ? <span className="text-destructive">· {job.erro.slice(0, 80)}</span> : null}
    </span>
  );
}

export default function Projeto() {
  const { id } = useParams<{ id: string }>();
  const nav = useNavigate();
  const [proj, setProj] = useState<Project | null>(null);
  const [editions, setEditions] = useState<Edition[]>([]);
  const [chapters, setChapters] = useState<Record<string, number>>({});
  const [artifacts, setArtifacts] = useState<Artifact[]>([]);
  const [pkgs, setPkgs] = useState<Pkg[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [idiomasSel, setIdiomasSel] = useState<string[]>([]);
  const [capaUrls, setCapaUrls] = useState<Record<string, string | null>>({});
  const [capaBrief, setCapaBrief] = useState("");
  const [capaSub, setCapaSub] = useState("");
  const [capaIdiomas, setCapaIdiomas] = useState<string[]>([]);
  const [capaNovaArte, setCapaNovaArte] = useState(true);
  const [selEpub, setSelEpub] = useState<Record<string, string>>({});
  const [confirmDel, setConfirmDel] = useState(false);
  const [excluindo, setExcluindo] = useState(false);
  const [refino, setRefino] = useState("");
  const [editOpen, setEditOpen] = useState(false);
  const [salvandoEdit, setSalvandoEdit] = useState(false);
  const [ed, setEd] = useState<Record<string, string>>({});
  const [tab, setTab] = useState("escrita");
  const [relOpen, setRelOpen] = useState(false);
  const [relTitulo, setRelTitulo] = useState("");
  const [relTxt, setRelTxt] = useState("");
  const [relCarregando, setRelCarregando] = useState(false);
  const [melhOpen, setMelhOpen] = useState(false);
  const [melhEd, setMelhEd] = useState<Edition | null>(null);
  const [melhTxt, setMelhTxt] = useState("");
  const [enviandoMelh, setEnviandoMelh] = useState(false);
  const [escritaPausada, setEscritaPausada] = useState(false);

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

  // Pausa global da escrita (linha de controle em `jobs`, sem schema novo).
  const carregarPausa = useCallback(async () => {
    const { data } = await supabase
      .from("jobs")
      .select("id")
      .eq("tipo", "controle_escrita")
      .eq("status", "paused")
      .limit(1);
    setEscritaPausada((data?.length ?? 0) > 0);
  }, []);

  useEffect(() => {
    carregarPausa();
    const ch = supabase
      .channel("ctrl-escrita")
      .on("postgres_changes", { event: "*", schema: "public", table: "jobs", filter: "tipo=eq.controle_escrita" }, () => carregarPausa())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [carregarPausa]);

  async function alternarPausaEscrita(novo: boolean) {
    setEscritaPausada(novo); // otimista
    if (novo) {
      await supabase.from("jobs").delete().eq("tipo", "controle_escrita"); // evita duplicatas
      const { error } = await supabase.from("jobs").insert({ tipo: "controle_escrita", status: "paused" });
      if (error) { setEscritaPausada(false); toast.error(error.message); return; }
      toast.success("Escrita pausada — para após o capítulo atual. Entrevistas/capas/traduções seguem.");
    } else {
      const { error } = await supabase.from("jobs").delete().eq("tipo", "controle_escrita");
      if (error) { setEscritaPausada(true); toast.error(error.message); return; }
      toast.success("Escrita retomada.");
    }
  }

  const origem = useMemo(() => editions.find((e) => e.is_origem), [editions]);

  // Assina URLs frescas das capas (robusto: não depende da url_publica de 7 dias).
  useEffect(() => {
    const capas = artifacts.filter((a) => a.tipo === "capa" && a.edition_id);
    if (!capas.length) return;
    let ativo = true;
    (async () => {
      const entries = await Promise.all(
        capas.map(async (a) => [a.edition_id!, await signedUrl("capas", a.storage_path, 3600)] as const)
      );
      if (ativo) setCapaUrls(Object.fromEntries(entries));
    })();
    return () => { ativo = false; };
  }, [artifacts]);

  // Por padrão, todas as edições selecionadas para gerar capa.
  useEffect(() => {
    if (editions.length && capaIdiomas.length === 0) {
      setCapaIdiomas(editions.map((e) => e.idioma));
    }
  }, [editions, capaIdiomas.length]);

  function abrirEdicao() {
    if (!proj) return;
    setEd({
      titulo: proj.titulo ?? "",
      autor: (proj.briefing as any)?.autor ?? "",
      genero: proj.genero ?? "",
      serie: proj.serie ?? "",
      volume: String(proj.volume ?? 1),
      idioma_origem: proj.idioma_origem ?? "pt-BR",
      total_capitulos: proj.total_capitulos != null ? String(proj.total_capitulos) : "",
      paginas_alvo: proj.paginas_alvo != null ? String(proj.paginas_alvo) : "",
      piso_palavras: String(proj.piso_palavras ?? 1400),
      meta_nota: String(proj.meta_nota ?? 9),
      skill_escrita: proj.skill_escrita ?? "",
    });
    setEditOpen(true);
  }
  async function salvarEdicao() {
    if (!id || !proj) return;
    if (!ed.titulo?.trim()) { toast.error("Título não pode ficar vazio."); return; }
    setSalvandoEdit(true);
    const num = (v: string) => (v === "" || v == null ? null : Number(v));
    const { error } = await supabase
      .from("projects")
      .update({
        titulo: ed.titulo.trim(),
        genero: ed.genero || null,
        serie: ed.serie || null,
        volume: num(ed.volume) ?? 1,
        idioma_origem: ed.idioma_origem,
        total_capitulos: num(ed.total_capitulos),
        paginas_alvo: num(ed.paginas_alvo),
        piso_palavras: num(ed.piso_palavras) ?? 1400,
        meta_nota: num(ed.meta_nota) ?? 9,
        skill_escrita: ed.skill_escrita || null,
        briefing: { ...((proj.briefing as any) || {}), autor: ed.autor || null },
      })
      .eq("id", id);
    setSalvandoEdit(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Projeto atualizado.");
    setEditOpen(false);
    carregar();
  }

  async function excluir() {
    if (!id) return;
    setExcluindo(true);
    try {
      await deleteProject(id);
      toast.success("Projeto excluído.");
      nav("/");
    } catch (e) {
      toast.error((e as Error).message);
      setExcluindo(false);
    }
  }

  async function gerarCapasBatch() {
    if (!capaIdiomas.length) {
      toast.error("Selecione ao menos um idioma.");
      return;
    }
    await enfileira("gerar_capas", {
      idiomas: capaIdiomas,
      briefing: capaBrief.trim(),
      subtitulo: capaSub.trim(),
      novo_art: capaNovaArte,
    });
  }

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
  // EPUBs de uma edição, ordenados por criação, com nº de versão (v1, v2, ...).
  const epubVersoes = (ed: string) =>
    artifacts
      .filter((a) => a.edition_id === ed && a.tipo === "epub")
      .sort((a, b) => (a.created_at ?? "").localeCompare(b.created_at ?? ""))
      .map((a, i) => ({ art: a, versao: (a.meta?.versao as number) ?? i + 1 }));
  const pkgDe = (ed: string) => pkgs.find((p) => p.edition_id === ed);
  const reviewDe = (edId: string) => artifacts.find((a) => a.edition_id === edId && a.tipo === "review");

  async function abrirRelatorio(e: Edition) {
    const rev = reviewDe(e.id);
    if (!rev) return;
    setRelTitulo(`Avaliação best-seller · ${e.idioma}`);
    setRelTxt("");
    setRelCarregando(true);
    setRelOpen(true);
    const txt = await downloadText("manuscritos", rev.storage_path);
    setRelTxt(txt || "Não consegui carregar o relatório.");
    setRelCarregando(false);
  }
  async function enviarMelhorias() {
    if (!melhEd) return;
    setEnviandoMelh(true);
    await enfileira("revisar", { instrucoes: melhTxt.trim() }, melhEd.id);
    setEnviandoMelh(false);
    setMelhOpen(false);
  }

  // Painel reutilizável: nota best-seller + avaliar/relatório/pedir melhorias de UMA edição.
  function painelAvaliacao(e: Edition) {
    const rev = reviewDe(e.id);
    const jAval = jobMaisRecente(jobs, "avaliar", e.id);
    const jRev = jobMaisRecente(jobs, "revisar", e.id);
    const ocupado = [jAval, jRev].some((j) => j?.status === "queued" || j?.status === "running");
    const temManuscrito = (chapters[e.id] ?? 0) > 0;
    return (
      <div className="space-y-3 rounded-lg border p-3">
        <div className="flex items-center gap-2">
          <Gauge className="h-4 w-4 text-primary" />
          <span className="text-sm font-medium">Avaliação best-seller</span>
          {e.nota_review != null ? (
            <Badge variant="secondary">nota {e.nota_review}/10</Badge>
          ) : (
            <span className="text-xs text-muted-foreground">ainda não avaliado</span>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={ocupado || !temManuscrito}
            title={temManuscrito ? "" : "Escreva/traduza esta edição primeiro"}
            onClick={() => enfileira("avaliar", {}, e.id)}
          >
            {jAval?.status === "running" || jAval?.status === "queued" ? <Loader2 className="h-4 w-4 animate-spin" /> : <ClipboardCheck className="h-4 w-4" />}
            {e.nota_review != null ? "Reavaliar" : "Avaliar"}
          </Button>
          <Button size="sm" variant="ghost" disabled={!rev} onClick={() => abrirRelatorio(e)}>
            <FileText className="h-4 w-4" /> Ler relatório
          </Button>
          <Button
            size="sm"
            disabled={ocupado || !rev}
            title={rev ? "" : "Avalie a edição antes de pedir melhorias"}
            onClick={() => { setMelhEd(e); setMelhTxt(""); setMelhOpen(true); }}
          >
            <Wand2 className="h-4 w-4" /> Pedir melhorias
          </Button>
        </div>
        {(jRev || jAval) && <JobStatus job={jRev ?? jAval} />}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <Link to="/" className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Dashboard
      </Link>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">{proj.titulo}</h1>
          <p className="mt-1 text-muted-foreground">
            {proj.genero ?? "—"} · {proj.idioma_origem}
            {proj.serie ? ` · ${proj.serie}${proj.volume ? ` (vol. ${proj.volume})` : ""}` : ""}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={sb.variant}>{sb.label}</Badge>
          {editions.some((e) => (chapters[e.id] ?? 0) > 0) && (
            <Button variant="outline" size="sm" onClick={() => nav(`/projeto/${id}/ler`)}>
              <BookOpen className="h-4 w-4" /> Ler
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={abrirEdicao}>
            <Pencil className="h-4 w-4" /> Editar
          </Button>
          <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive" title="Excluir projeto" onClick={() => setConfirmDel(true)}>
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {(() => {
        const serieTotal = Number((proj.briefing as any)?.serie_total ?? 0);
        if (!proj.serie || serieTotal <= (proj.volume ?? 1)) return null;
        const jv = jobMaisRecente(jobs, "criar_volumes");
        const criando = jv?.status === "queued" || jv?.status === "running";
        const faltam = serieTotal - (proj.volume ?? 1);
        return (
          <Card className="border-primary/30 bg-primary/5">
            <CardContent className="flex flex-wrap items-center justify-between gap-3 py-4">
              <div>
                <p className="text-sm font-medium">Saga “{proj.serie}” — {serieTotal} volumes</p>
                <p className="text-xs text-muted-foreground">
                  Crie os {faltam} volume(s) restante(s) como projetos encadeados, herdando a fundação
                  (mundo, elenco, voz) e com estrutura própria que avança os arcos.
                </p>
              </div>
              <div className="flex items-center gap-3">
                <Button size="sm" disabled={criando} onClick={() => enfileira("criar_volumes", {})}>
                  {criando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                  Criar volumes da saga ({faltam})
                </Button>
                <JobStatus job={jv} />
              </div>
            </CardContent>
          </Card>
        );
      })()}

      <Tabs value={tab} onValueChange={setTab}>
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
            <CardHeader>
              <CardTitle className="text-xl">Fundação</CardTitle>
              <CardDescription>Documentos gerados pela skill arquiteto-de-enredo.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              {(() => {
                const jf = jobMaisRecente(jobs, "criar_fundacao");
                const gerando = jf?.status === "queued" || jf?.status === "running";
                const pronto = jf?.status === "done" || proj.status !== "rascunho";
                if (gerando) {
                  return (
                    <div className="flex flex-col items-center gap-3 py-10 text-center text-muted-foreground">
                      <Loader2 className="h-6 w-6 animate-spin text-primary" />
                      <p>Gerando a fundação (Bíblia, Estrutura, Mapa de Personagens, agentes)…<br />Os arquivos ficam disponíveis para download ao concluir.</p>
                      <JobStatus job={jf} />
                    </div>
                  );
                }
                if (jf?.status === "error") {
                  return (
                    <div className="space-y-3">
                      <p className="text-destructive">Falha ao gerar a fundação: {jf.erro?.slice(0, 200)}</p>
                      <Button size="sm" variant="outline" onClick={() => enfileira("criar_fundacao", {})}>Tentar de novo</Button>
                    </div>
                  );
                }
                if (!pronto) {
                  return (
                    <div className="space-y-3">
                      <p className="text-muted-foreground">A fundação ainda não foi gerada.</p>
                      <Button size="sm" onClick={() => enfileira("criar_fundacao", {})}>Gerar fundação</Button>
                    </div>
                  );
                }
                const jr = jobMaisRecente(jobs, "refinar_fundacao");
                const refinando = jr?.status === "queued" || jr?.status === "running";
                return (
                  <div className="space-y-5">
                    <div className="space-y-2">
                      <p className="text-xs font-medium text-muted-foreground">Documentos</p>
                      <div className="flex flex-wrap gap-2">
                        {["Biblia-da-Obra.md", "Estrutura-do-Livro.md", "Mapa-de-Personagens.md", "perfil-de-voz.md"].map((f) => (
                          <Button key={f} variant="outline" size="sm" onClick={async () => {
                            const url = await signedUrl("manuscritos", `${proj.owner}/${proj.id}/fundacao/${f}`);
                            if (url) window.open(url, "_blank"); else toast.error("Arquivo não encontrado no Storage.");
                          }}>
                            <FileText className="h-4 w-4" /> {f}
                          </Button>
                        ))}
                      </div>
                    </div>

                    <div className="space-y-2 rounded-lg border p-4">
                      <p className="text-sm font-medium">Melhorar a fundação</p>
                      <p className="text-xs text-muted-foreground">
                        Diga o que aprofundar — mais personagens (com função e fio próprios),
                        subtramas, arcos de série/trilogia. A IA reescreve Bíblia/Mapa/Estrutura
                        coerentemente, sem recomeçar do zero.
                      </p>
                      <Textarea
                        rows={3}
                        value={refino}
                        onChange={(e) => setRefino(e.target.value)}
                        placeholder="Ex.: É o vol. 1 de uma trilogia — quero 12–15 personagens nomeados, cada um com função distinta e uma subtrama própria; crie arcos que atravessam os 3 livros e deixe ganchos; expanda as subtramas para sustentar a densidade."
                      />
                      <div className="flex items-center gap-3">
                        <Button
                          size="sm"
                          disabled={refinando || !refino.trim()}
                          onClick={async () => { await enfileira("refinar_fundacao", { instrucoes: refino.trim() }); }}
                        >
                          {refinando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                          Refinar fundação
                        </Button>
                        <JobStatus job={jr} />
                      </div>
                    </div>
                  </div>
                );
              })()}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ESCRITA */}
        <TabsContent value="escrita">
          <Card>
            <CardHeader>
              <CardTitle className="text-xl">Escrita do livro</CardTitle>
              <CardDescription>
                {proj.titulo} · idioma {proj.idioma_origem}
                {proj.serie ? ` · ${proj.serie} (vol. ${proj.volume})` : ""}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              {(() => {
                const j = jobMaisRecente(jobs, "escrever_livro");
                const escrevendo = j?.status === "queued" || j?.status === "running";
                const p: any = j?.progresso || {};
                const total = Number(p.total ?? proj.total_capitulos ?? 0);
                const feitos = escrevendo ? Number(p.cap_atual ?? 0) : origem ? chapters[origem.id] ?? 0 : 0;
                const pct = total > 0 ? Math.min(100, Math.round((feitos / total) * 100)) : 0;
                const nota = origem?.nota_review ?? (p.nota != null ? Number(p.nota) : null);
                const palavras = Number(p.palavras ?? 0);
                return (
                  <div className="space-y-3">
                    <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-sm">
                      <span><span className="text-muted-foreground">Capítulos:</span> <strong>{feitos}{total ? `/${total}` : ""}</strong></span>
                      {palavras > 0 && <span><span className="text-muted-foreground">Palavras:</span> <strong>{palavras.toLocaleString("pt-BR")}</strong></span>}
                      {nota != null && <span><span className="text-muted-foreground">Nota:</span> <strong>{nota}/10</strong></span>}
                      <span className="text-muted-foreground">
                        {escrevendo ? (p.fase ? String(p.fase) : "escrevendo…") : feitos > 0 ? "concluído" : "não iniciado"}
                      </span>
                    </div>
                    {total > 0 && (
                      <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                        <div className="h-full bg-primary transition-all" style={{ width: `${pct}%` }} />
                      </div>
                    )}
                    <div className="flex items-center gap-3">
                      <Button disabled={escrevendo || escritaPausada} onClick={() => enfileira("escrever_livro", {})}>
                        {escrevendo ? <Loader2 className="h-4 w-4 animate-spin" /> : <PenLine className="h-4 w-4" />}
                        {feitos > 0 && !escrevendo
                          ? feitos < total || total === 0
                            ? "Continuar escrita"
                            : "Continuar / revisar"
                          : "Escrever livro"}
                      </Button>
                      <JobStatus job={j} />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {feitos > 0
                        ? "Continua de onde parou: lê os capítulos já escritos no disco e segue do próximo — não descarta nem reescreve o que já existe. Roda o Opus capítulo a capítulo até a meta de nota."
                        : "Roda o livro_runner.py (Opus) capítulo a capítulo até a meta de nota, com verdade do disco."}
                    </p>
                  </div>
                );
              })()}

              <div className="flex items-center justify-between gap-3 rounded-lg border p-3">
                <div className="space-y-0.5 pr-4">
                  <p className="text-sm font-medium">Pausar a escrita</p>
                  <p className="text-xs text-muted-foreground">
                    Para a geração de capítulos (Opus) e economiza tokens. O capítulo em
                    andamento termina antes de parar; entrevistas, capas e traduções
                    continuam normalmente. Vale para todos os livros.
                  </p>
                </div>
                <Switch
                  checked={escritaPausada}
                  onCheckedChange={alternarPausaEscrita}
                  aria-label="Pausar a escrita dos livros"
                />
              </div>

              {origem && (chapters[origem.id] ?? 0) > 0 && (
                <>
                  {painelAvaliacao(origem)}
                  <div className="flex items-center justify-between gap-3 rounded-lg border border-dashed p-3">
                    <div>
                      <p className="text-sm font-medium">Versões em outros idiomas</p>
                      <p className="text-xs text-muted-foreground">
                        Traduza o livro pronto para en-US, en-GB, es-ES e outros (skill traducao-editorial).
                      </p>
                    </div>
                    <Button size="sm" variant="outline" onClick={() => setTab("edicoes")}>
                      <Languages className="h-4 w-4" /> Traduzir
                    </Button>
                  </div>
                </>
              )}
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
                  <li key={e.id} className="space-y-3 py-3">
                    <div className="flex items-center justify-between gap-3 text-sm">
                      <span className="font-medium">{e.idioma} {e.is_origem && <span className="text-muted-foreground">(origem)</span>}</span>
                      <span className="text-muted-foreground">{chapters[e.id] ?? 0} caps{e.nota_review != null ? ` · nota ${e.nota_review}` : ""}</span>
                      <Badge variant="outline">{e.status}</Badge>
                    </div>
                    {painelAvaliacao(e)}
                  </li>
                ))}
                {!editions.length && <li className="py-4 text-center text-muted-foreground">Nenhuma edição ainda.</li>}
              </ul>
            </CardContent>
          </Card>
        </TabsContent>

        {/* CAPAS */}
        <TabsContent value="capas">
          {!editions.length ? (
            <p className="text-muted-foreground">Crie a edição primeiro (escreva o livro).</p>
          ) : (
            <div className="space-y-6">
              {/* Painel: um briefing -> capas em vários idiomas (mesma arte) */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-xl">Direção de arte</CardTitle>
                  <CardDescription>
                    Um briefing só. A IA cria <strong>uma arte-mestra</strong> e o sistema
                    compõe as capas dos idiomas escolhidos com a <strong>mesma imagem</strong> e
                    layout padronizado (posição, fontes e autor idênticos) — só o texto muda, traduzido.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid gap-4 sm:grid-cols-[1fr_auto]">
                    <div className="space-y-2">
                      <Label htmlFor="brief">Briefing visual</Label>
                      <Textarea
                        id="brief"
                        rows={4}
                        value={capaBrief}
                        onChange={(ev) => setCapaBrief(ev.target.value)}
                        placeholder="Atmosfera, imagem central, paleta, referências, o que evitar. Ex.: farol solitário ao entardecer, azul-petróleo e âmbar, mistério; sem pessoas."
                      />
                    </div>
                    <div className="space-y-2 sm:w-56">
                      <Label htmlFor="sub">Subtítulo (origem)</Label>
                      <Input id="sub" value={capaSub} onChange={(ev) => setCapaSub(ev.target.value)} placeholder="Opcional" />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Idiomas das capas</Label>
                    <div className="flex flex-wrap gap-2">
                      {editions.map((e) => {
                        const on = capaIdiomas.includes(e.idioma);
                        return (
                          <button
                            key={e.id}
                            type="button"
                            onClick={() =>
                              setCapaIdiomas((s) =>
                                on ? s.filter((x) => x !== e.idioma) : [...s, e.idioma]
                              )
                            }
                            className={cn(
                              "rounded-full border px-3 py-1 text-xs transition-colors",
                              on ? "border-primary bg-primary/10 text-primary" : "text-muted-foreground hover:bg-accent"
                            )}
                          >
                            {e.idioma}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  <div className="flex items-center justify-between rounded-lg border p-3">
                    <div className="pr-4">
                      <p className="text-sm font-medium">Gerar nova arte-mestra</p>
                      <p className="text-xs text-muted-foreground">
                        Desligado, reaproveita a arte atual e só compõe os textos (instantâneo) —
                        ideal para adicionar um idioma mantendo a mesma imagem.
                      </p>
                    </div>
                    <Switch checked={capaNovaArte} onCheckedChange={setCapaNovaArte} aria-label="Gerar nova arte-mestra" />
                  </div>
                  <div className="flex flex-wrap items-center gap-3">
                    <Button onClick={gerarCapasBatch} disabled={!capaIdiomas.length}>
                      <Sparkles className="h-4 w-4" />
                      Gerar capas ({capaIdiomas.length})
                    </Button>
                    <JobStatus job={jobMaisRecente(jobs, "gerar_capas") ?? jobMaisRecente(jobs, "gerar_capa")} />
                  </div>
                </CardContent>
              </Card>

              {/* Galeria padronizada */}
              <div className="grid grid-cols-2 gap-5 sm:grid-cols-3 lg:grid-cols-4">
                {editions.map((e) => {
                  const url = capaUrls[e.id] ?? capaDe(e.id)?.url_publica ?? null;
                  return (
                    <div key={e.id} className="space-y-2">
                      {url ? (
                        <button
                          type="button"
                          onClick={() => window.open(url, "_blank")}
                          className="group relative block w-full overflow-hidden rounded-md border bg-muted shadow-sm"
                          title="Abrir em tamanho real"
                        >
                          <img src={url} alt={`Capa ${e.idioma}`} className="aspect-[5/8] w-full object-contain" />
                          <span className="absolute right-2 top-2 rounded bg-background/80 p-1 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100">
                            <Maximize2 className="h-4 w-4" />
                          </span>
                        </button>
                      ) : (
                        <div className="flex aspect-[5/8] w-full items-center justify-center rounded-md border border-dashed text-muted-foreground">
                          <Image className="h-6 w-6" />
                        </div>
                      )}
                      <p className="text-center text-xs font-medium text-muted-foreground">{e.idioma}</p>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </TabsContent>

        {/* EPUBS */}
        <TabsContent value="epubs">
          <Card>
            <CardHeader>
              <CardTitle className="text-xl">EPUBs por idioma</CardTitle>
              <CardDescription>
                Cada EPUB sai com a <strong>capa aprovada</strong> do idioma. Versões ficam
                guardadas — escolha no menu e baixe.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {!editions.length ? (
                <p className="py-4 text-center text-muted-foreground">Nenhuma edição.</p>
              ) : (
                <ul className="divide-y">
                  {editions.map((e) => {
                    const versoes = epubVersoes(e.id);
                    const ultima = versoes[versoes.length - 1];
                    const selId = selEpub[e.id] ?? ultima?.art.id;
                    const sel = versoes.find((v) => v.art.id === selId) ?? ultima;
                    const job = jobMaisRecente(jobs, "gerar_epub", e.id);
                    const gerando = job?.status === "queued" || job?.status === "running";
                    const temCapa = !!capaDe(e.id);
                    return (
                      <li key={e.id} className="flex flex-wrap items-center gap-3 py-3">
                        <span className="w-16 font-medium">{e.idioma}</span>

                        {versoes.length > 0 ? (
                          <>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="outline" size="sm" className="min-w-[150px] justify-between">
                                  EPUB v{sel?.versao} · {e.idioma}
                                  <ChevronDown className="h-4 w-4 opacity-60" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="start">
                                {[...versoes].reverse().map((v) => (
                                  <DropdownMenuItem
                                    key={v.art.id}
                                    onClick={() => setSelEpub((s) => ({ ...s, [e.id]: v.art.id }))}
                                  >
                                    <span className="flex-1">EPUB v{v.versao} · {e.idioma}</span>
                                    {v.art.meta?.validado === false && (
                                      <span className="text-[10px] text-amber-600">sem validar</span>
                                    )}
                                    {v.art.created_at && (
                                      <span className="ml-2 text-[10px] text-muted-foreground">
                                        {new Date(v.art.created_at).toLocaleDateString()}
                                      </span>
                                    )}
                                  </DropdownMenuItem>
                                ))}
                              </DropdownMenuContent>
                            </DropdownMenu>
                            <Button size="sm" disabled={!sel} onClick={() => sel && baixar(sel.art, "epubs")}>
                              <Download className="h-4 w-4" /> Baixar
                            </Button>
                            <span className="text-xs text-muted-foreground">
                              {versoes.length} {versoes.length === 1 ? "versão" : "versões"}
                            </span>
                          </>
                        ) : (
                          <span className="text-sm text-muted-foreground">Nenhum EPUB ainda.</span>
                        )}

                        <div className="ml-auto flex items-center gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={gerando || !temCapa}
                            title={temCapa ? "Gerar nova versão (com a capa aprovada)" : "Gere a capa deste idioma primeiro"}
                            onClick={() => enfileira("gerar_epub", {}, e.id)}
                          >
                            {gerando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                            Gerar nova versão
                          </Button>
                        </div>
                        {!temCapa && (
                          <p className="w-full text-xs text-amber-600">
                            ⚠ Gere a capa de {e.idioma} na aba Capas — o EPUB exige a capa aprovada.
                          </p>
                        )}
                        <div className="w-full"><JobStatus job={job} /></div>
                      </li>
                    );
                  })}
                </ul>
              )}
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

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Editar projeto</DialogTitle>
            <DialogDescription>Corrija título, autor, série e parâmetros. Salvar não regera a fundação.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <Label>Título</Label>
              <Input value={ed.titulo ?? ""} onChange={(e) => setEd((s) => ({ ...s, titulo: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Autor</Label>
              <Input value={ed.autor ?? ""} onChange={(e) => setEd((s) => ({ ...s, autor: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Gênero</Label>
              <Input value={ed.genero ?? ""} onChange={(e) => setEd((s) => ({ ...s, genero: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Série (vazio = livro único)</Label>
              <Input value={ed.serie ?? ""} onChange={(e) => setEd((s) => ({ ...s, serie: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Volume</Label>
              <Input type="number" value={ed.volume ?? ""} onChange={(e) => setEd((s) => ({ ...s, volume: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Idioma de origem</Label>
              <select className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                value={ed.idioma_origem ?? "pt-BR"} onChange={(e) => setEd((s) => ({ ...s, idioma_origem: e.target.value }))}>
                {IDIOMAS.map((i) => <option key={i} value={i}>{i}</option>)}
              </select>
            </div>
            <div className="space-y-2">
              <Label>Skill de escrita</Label>
              <select className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                value={ed.skill_escrita ?? ""} onChange={(e) => setEd((s) => ({ ...s, skill_escrita: e.target.value }))}>
                {["", "skill-dan-brown", "hoover-mcfadden", "skill-jk-rowling", "vesper-escritor-de-capitulos"].map((v) => (
                  <option key={v} value={v}>{v || "Nenhuma"}</option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label>Capítulos</Label>
              <Input type="number" value={ed.total_capitulos ?? ""} onChange={(e) => setEd((s) => ({ ...s, total_capitulos: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Páginas-alvo</Label>
              <Input type="number" value={ed.paginas_alvo ?? ""} onChange={(e) => setEd((s) => ({ ...s, paginas_alvo: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Piso de palavras/cap.</Label>
              <Input type="number" value={ed.piso_palavras ?? ""} onChange={(e) => setEd((s) => ({ ...s, piso_palavras: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Meta de nota</Label>
              <Input type="number" step="0.1" value={ed.meta_nota ?? ""} onChange={(e) => setEd((s) => ({ ...s, meta_nota: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditOpen(false)}>Cancelar</Button>
            <Button onClick={salvarEdicao} disabled={salvandoEdit}>
              {salvandoEdit ? <Loader2 className="h-4 w-4 animate-spin" /> : <Pencil className="h-4 w-4" />}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={confirmDel} onOpenChange={(o) => !o && setConfirmDel(false)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Excluir “{proj.titulo}”?</DialogTitle>
            <DialogDescription>
              Isto apaga em definitivo o projeto, todas as edições/idiomas, capítulos,
              capas, EPUBs, pacotes e arquivos no Storage. Não dá para desfazer.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirmDel(false)}>Cancelar</Button>
            <Button variant="destructive" disabled={excluindo} onClick={excluir}>
              {excluindo ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              Excluir definitivamente
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={relOpen} onOpenChange={setRelOpen}>
        <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{relTitulo}</DialogTitle>
            <DialogDescription>Relatório da skill book-bestseller-review (pontos fortes, fracos e nota).</DialogDescription>
          </DialogHeader>
          {relCarregando ? (
            <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
          ) : (
            <pre className="whitespace-pre-wrap break-words rounded border bg-muted/30 p-3 text-sm leading-relaxed">{relTxt}</pre>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={melhOpen} onOpenChange={setMelhOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Pedir melhorias {melhEd ? `· ${melhEd.idioma}` : ""}</DialogTitle>
            <DialogDescription>
              A IA reescreve <strong>só os pontos fracos</strong> apontados no último relatório de avaliação,
              preservando o resto. Use o campo abaixo para priorizar focos específicos (opcional).
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="melh">Instruções de foco (opcional)</Label>
            <Textarea
              id="melh"
              rows={4}
              value={melhTxt}
              onChange={(e) => setMelhTxt(e.target.value)}
              placeholder="Ex.: deixe o clímax do capítulo 18 mais tenso; aprofunde a motivação do antagonista; corte exposição no início."
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setMelhOpen(false)}>Cancelar</Button>
            <Button onClick={enviarMelhorias} disabled={enviandoMelh}>
              {enviandoMelh ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
              Pedir melhorias
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
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
