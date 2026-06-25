import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Archive, ArrowLeft, Check, Copy, Download, ExternalLink, Loader2, Save, Sparkles, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { supabase, enqueueJob } from "@/lib/supabase";
import { signedUrl } from "@/lib/storage";
import { useWorkerStatus } from "@/hooks/useWorkerStatus";
import { REDES, type Author, type Project, type Rede, type SocialPost } from "@/lib/types";
import { CoverArt } from "@/components/CoverArt";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const OBJETIVOS = ["Divulgar lançamento", "Teaser", "Bastidores", "Frase de impacto", "Engajamento"];

const ctrl = "h-9 rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
const META: Record<Rede, { label: string; url: (h: string) => string }> = {
  instagram: { label: "Instagram", url: (h) => `https://instagram.com/${h.replace(/^@/, "")}` },
  x: { label: "X", url: (h) => `https://x.com/${h.replace(/^@/, "")}` },
  tiktok: { label: "TikTok", url: (h) => `https://tiktok.com/@${h.replace(/^@/, "")}` },
  threads: { label: "Threads", url: (h) => `https://threads.net/@${h.replace(/^@/, "")}` },
  youtube: { label: "YouTube", url: (h) => `https://youtube.com/@${h.replace(/^@/, "")}` },
  site: { label: "Site", url: (h) => (/^https?:\/\//i.test(h) ? h : `https://${h}`) },
};
function linkDe(k: Rede, v: string) { if (!v) return null; return /^https?:\/\//i.test(v) && k !== "site" ? v : META[k].url(v); }
const iniciais = (n: string) => n.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join("");

export default function Autor() {
  const { id } = useParams<{ id: string }>();
  const nav = useNavigate();
  const fileRef = useRef<HTMLInputElement>(null);
  const [a, setA] = useState<Author | null>(null);
  const [todos, setTodos] = useState<Author[]>([]);
  const [obras, setObras] = useState<Project[]>([]);
  const [capas, setCapas] = useState<Record<string, string>>({});
  const [avatar, setAvatar] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const { online } = useWorkerStatus(15_000);
  const [posts, setPosts] = useState<SocialPost[]>([]);
  const [fRede, setFRede] = useState("");
  const [fStatus, setFStatus] = useState("rascunho");
  const [varIdx, setVarIdx] = useState<Record<string, number>>({});
  const [editId, setEditId] = useState<string | null>(null);
  const [editTxt, setEditTxt] = useState("");
  const [dlg, setDlg] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [form, setForm] = useState({ rede: "instagram" as Rede, objetivo: OBJETIVOS[4], tema: "", project_id: "", n: "3" });

  const carregarPosts = useCallback(async () => {
    if (!id) return;
    const { data } = await supabase.from("social_posts").select("*").eq("author_id", id).order("created_at", { ascending: false });
    setPosts((data as SocialPost[]) ?? []);
  }, [id]);

  useEffect(() => {
    carregarPosts();
    const ch = supabase
      .channel(`posts-${id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "social_posts", filter: `author_id=eq.${id}` }, () => carregarPosts())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [id, carregarPosts]);

  function abrirDlg(rede: Rede) { setForm((f) => ({ ...f, rede })); setDlg(true); }

  async function gerar() {
    setEnviando(true);
    try {
      await enqueueJob("gerar_post_social", {
        author_id: id, rede: form.rede, objetivo: form.objetivo, tema: form.tema.trim() || null,
        project_id: form.project_id || null, n_variantes: Number(form.n) || 3,
      });
      toast.success(online ? "Gerando post… aparece aqui em instantes." : "Post na fila — vai gerar quando o worker estiver ligado.");
      setDlg(false); setForm((f) => ({ ...f, tema: "" }));
    } catch (e) { toast.error((e as Error).message); }
    finally { setEnviando(false); }
  }

  async function setPostStatus(post: SocialPost, status: SocialPost["status"]) {
    await supabase.from("social_posts").update({ status }).eq("id", post.id);
    setPosts((cur) => cur.map((p) => (p.id === post.id ? { ...p, status } : p)));
  }
  async function salvarEdicao(post: SocialPost) {
    await supabase.from("social_posts").update({ conteudo: editTxt }).eq("id", post.id);
    setPosts((cur) => cur.map((p) => (p.id === post.id ? { ...p, conteudo: editTxt } : p)));
    setEditId(null); toast.success("Post atualizado.");
  }
  async function excluirPost(post: SocialPost) {
    await supabase.from("social_posts").delete().eq("id", post.id);
    setPosts((cur) => cur.filter((p) => p.id !== post.id));
  }
  function textoAtual(post: SocialPost) {
    const i = varIdx[post.id] ?? 0;
    return post.variantes?.[i] ?? post.conteudo ?? "";
  }
  function copiar(post: SocialPost) {
    const txt = textoAtual(post) + (post.hashtags?.length ? "\n\n" + post.hashtags.join(" ") : "");
    navigator.clipboard?.writeText(txt).then(() => toast.success("Copiado."), () => toast.error("Não consegui copiar."));
  }
  function exportar(post: SocialPost) {
    const txt = textoAtual(post) + (post.hashtags?.length ? "\n\n" + post.hashtags.join(" ") : "");
    const blob = new Blob([txt], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url; link.download = `post-${post.rede}-${post.id.slice(0, 8)}.txt`; link.click();
    URL.revokeObjectURL(url);
  }

  const carregar = useCallback(async () => {
    if (!id) return;
    const { data } = await supabase.from("authors").select("*").eq("id", id).single();
    const au = (data as Author) ?? null;
    setA(au ? { ...au, social: au.social ?? {} } : null);
    if (au?.avatar_path) setAvatar(await signedUrl("autores", au.avatar_path, 3600));
    const { data: all } = await supabase.from("authors").select("id,nome").order("nome");
    setTodos((all as Author[]) ?? []);
    const { data: projs } = await supabase.from("projects").select("*").eq("author_id", id).order("serie", { nullsFirst: false }).order("volume");
    const ps = (projs as Project[]) ?? [];
    setObras(ps);
    if (ps.length) {
      const { data: eds } = await supabase.from("editions").select("id,project_id,is_origem").in("project_id", ps.map((p) => p.id));
      const origem: Record<string, string> = {}, ed2p: Record<string, string> = {};
      for (const e of (eds as { id: string; project_id: string; is_origem: boolean }[]) ?? []) { ed2p[e.id] = e.project_id; if (e.is_origem) origem[e.project_id] = e.id; }
      const oids = Object.values(origem);
      const { data: arts } = await supabase.from("artifacts").select("edition_id,storage_path").eq("tipo", "capa").in("edition_id", oids.length ? oids : ["x"]);
      const ent = await Promise.all(((arts as { edition_id: string; storage_path: string }[]) ?? []).map(async (ar) => [ed2p[ar.edition_id], await signedUrl("capas", ar.storage_path, 3600)] as const));
      setCapas(Object.fromEntries(ent.filter(([, u]) => u)) as Record<string, string>);
    }
  }, [id]);

  useEffect(() => { carregar(); }, [carregar]);

  function set<K extends keyof Author>(k: K, v: Author[K]) { setA((cur) => (cur ? { ...cur, [k]: v } : cur)); }
  function setSocial(k: Rede, v: string) { setA((cur) => (cur ? { ...cur, social: { ...cur.social, [k]: v } } : cur)); }

  async function salvar() {
    if (!a) return;
    setSalvando(true);
    const { error } = await supabase.from("authors").update({
      nome: a.nome?.trim() || "Sem nome", estilo: a.estilo || null, genero: a.genero || null,
      bio: a.bio || null, personalidade: a.personalidade || null, referencias: a.referencias || null, social: a.social ?? {},
    }).eq("id", a.id);
    setSalvando(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Autor salvo.");
  }

  async function subirAvatar(file: File) {
    if (!a) return;
    const ext = (file.name.split(".").pop() || "png").toLowerCase();
    const key = `${a.owner}/${a.id}/avatar.${ext}`;
    const { error } = await supabase.storage.from("autores").upload(key, file, { upsert: true, contentType: file.type || "image/png" });
    if (error) { toast.error(error.message); return; }
    await supabase.from("authors").update({ avatar_path: key }).eq("id", a.id);
    setAvatar(await signedUrl("autores", key, 3600));
    toast.success("Avatar atualizado.");
  }

  async function mover(projectId: string, novoAutor: string) {
    const { error } = await supabase.from("projects").update({ author_id: novoAutor || null }).eq("id", projectId);
    if (error) { toast.error(error.message); return; }
    toast.success("Obra movida.");
    setObras((cur) => cur.filter((p) => p.id !== projectId || novoAutor === id));
  }

  async function excluir() {
    if (!a || !confirm(`Excluir o autor "${a.nome}"? As obras ficam sem autor (não são apagadas).`)) return;
    const { error } = await supabase.from("authors").delete().eq("id", a.id);
    if (error) { toast.error(error.message); return; }
    nav("/autores");
  }

  if (!a) return <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <Link to="/autores" className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" /> Autores</Link>

      {/* Cabeçalho: avatar + nome + estilo/gênero */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <div className="relative">
          <div className="grid h-24 w-24 place-items-center overflow-hidden rounded-full bg-primary/10 text-2xl font-semibold text-primary">
            {avatar ? <img src={avatar} alt={a.nome} className="h-full w-full object-cover" /> : iniciais(a.nome) || "?"}
          </div>
          <button onClick={() => fileRef.current?.click()} className="absolute -bottom-1 -right-1 grid h-8 w-8 place-items-center rounded-full border bg-background shadow hover:bg-muted" title="Trocar avatar">
            <Upload className="h-4 w-4" />
          </button>
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && subirAvatar(e.target.files[0])} />
        </div>
        <div className="flex-1 space-y-2">
          <Input value={a.nome ?? ""} onChange={(e) => set("nome", e.target.value)} className="h-auto border-0 px-0 text-2xl font-semibold tracking-tight focus-visible:ring-0" placeholder="Nome do autor" />
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <Input value={a.estilo ?? ""} onChange={(e) => set("estilo", e.target.value)} placeholder="Estilo (ex.: Thriller-romance doméstico)" />
            <Input value={a.genero ?? ""} onChange={(e) => set("genero", e.target.value)} placeholder="Gênero" />
          </div>
        </div>
      </div>

      {/* Personalidade / bio / referências */}
      <Card>
        <CardHeader><CardTitle className="text-lg">Persona</CardTitle><CardDescription>Como esse pseudônimo pensa e escreve (usado depois para gerar conteúdo na voz dele).</CardDescription></CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5"><Label>Bio</Label><Textarea rows={4} value={a.bio ?? ""} onChange={(e) => set("bio", e.target.value)} /></div>
          <div className="space-y-1.5"><Label>Personalidade</Label><Textarea rows={3} value={a.personalidade ?? ""} onChange={(e) => set("personalidade", e.target.value)} /></div>
          <div className="space-y-1.5"><Label>Referências</Label><Input value={a.referencias ?? ""} onChange={(e) => set("referencias", e.target.value)} placeholder="Autores/obras de referência" /></div>
        </CardContent>
      </Card>

      {/* Redes sociais */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Redes sociais</CardTitle>
          <CardDescription>Handles ou URLs. Vazio = “a criar”. (Publicação automática chega numa fase futura.)</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2.5">
          {REDES.map((k) => {
            const v = a.social?.[k] ?? "";
            const url = linkDe(k, v);
            return (
              <div key={k} className="flex items-center gap-3">
                <span className="w-20 shrink-0 text-sm font-medium">{META[k].label}</span>
                <input className={`${ctrl} flex-1`} value={v} onChange={(e) => setSocial(k, e.target.value)} placeholder={k === "site" ? "https://…" : "@handle"} />
                {v ? (
                  url ? <a href={url} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-xs text-primary hover:underline">abrir <ExternalLink className="h-3 w-3" /></a> : null
                ) : (
                  <span className="rounded-full border px-2 py-0.5 text-[11px] text-muted-foreground">a criar</span>
                )}
                <Button variant="outline" size="sm" className="h-7 shrink-0 px-2 text-xs" onClick={() => abrirDlg(k)} title={`Gerar post para ${META[k].label}`}>
                  <Sparkles className="h-3.5 w-3.5" /> Gerar
                </Button>
              </div>
            );
          })}
          <div className="pt-1 text-xs text-muted-foreground">
            Os rascunhos gerados aparecem em “Conteúdo”, abaixo.
          </div>
        </CardContent>
      </Card>

      {/* Conteúdo (rascunhos de posts) */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Conteúdo</CardTitle>
          <CardDescription>Rascunhos gerados na voz do autor. Edite, aprove e copie/exporte — nada é publicado automaticamente.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!online && (
            <p className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
              Worker offline: posts enfileirados aguardam até você ligar a produção (Configurações → Produção).
            </p>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <select className={`${ctrl} h-8 text-xs`} value={fRede} onChange={(e) => setFRede(e.target.value)}>
              <option value="">Todas as redes</option>
              {REDES.map((k) => <option key={k} value={k}>{META[k].label}</option>)}
            </select>
            <select className={`${ctrl} h-8 text-xs`} value={fStatus} onChange={(e) => setFStatus(e.target.value)}>
              <option value="">Todos os status</option>
              <option value="rascunho">Rascunho</option>
              <option value="aprovado">Aprovado</option>
              <option value="arquivado">Arquivado</option>
            </select>
          </div>
          {(() => {
            const lista = posts.filter((p) => (!fRede || p.rede === fRede) && (!fStatus || p.status === fStatus));
            if (!posts.length) return <p className="py-6 text-center text-sm text-muted-foreground">Nenhum post ainda. Clique em “Gerar” numa rede acima.</p>;
            if (!lista.length) return <p className="py-6 text-center text-sm text-muted-foreground">Nada com esse filtro.</p>;
            return (
              <ul className="space-y-3">
                {lista.map((post) => {
                  const i = varIdx[post.id] ?? 0;
                  const obra = obras.find((o) => o.id === post.project_id);
                  const editando = editId === post.id;
                  return (
                    <li key={post.id} className="rounded-lg border p-3">
                      <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        <span className="rounded-full border px-2 py-0.5 font-medium text-foreground">{META[post.rede]?.label ?? post.rede}</span>
                        {post.objetivo && <span>· {post.objetivo}</span>}
                        {obra && <span>· {obra.titulo}</span>}
                        <span className={`ml-auto rounded-full px-2 py-0.5 ${post.status === "aprovado" ? "bg-emerald-600/15 text-emerald-700 dark:text-emerald-400" : post.status === "arquivado" ? "bg-muted text-muted-foreground" : "bg-amber-500/15 text-amber-700 dark:text-amber-400"}`}>{post.status}</span>
                      </div>
                      {editando ? (
                        <Textarea rows={5} value={editTxt} onChange={(e) => setEditTxt(e.target.value)} />
                      ) : (
                        <p className="whitespace-pre-wrap text-sm">{textoAtual(post)}</p>
                      )}
                      {post.hashtags?.length ? (
                        <p className="mt-1.5 text-xs text-primary">{post.hashtags.join(" ")}</p>
                      ) : null}
                      <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                        {post.variantes?.length > 1 && !editando && (
                          <span className="mr-1 flex items-center gap-1 text-xs text-muted-foreground">
                            <button className="rounded border px-1.5 hover:bg-muted" onClick={() => setVarIdx((m) => ({ ...m, [post.id]: (i - 1 + post.variantes.length) % post.variantes.length }))}>‹</button>
                            {i + 1}/{post.variantes.length}
                            <button className="rounded border px-1.5 hover:bg-muted" onClick={() => setVarIdx((m) => ({ ...m, [post.id]: (i + 1) % post.variantes.length }))}>›</button>
                          </span>
                        )}
                        {editando ? (
                          <>
                            <Button size="sm" className="h-7 px-2 text-xs" onClick={() => salvarEdicao(post)}><Save className="h-3.5 w-3.5" /> Salvar</Button>
                            <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => setEditId(null)}>Cancelar</Button>
                          </>
                        ) : (
                          <>
                            <Button size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={() => copiar(post)}><Copy className="h-3.5 w-3.5" /> Copiar</Button>
                            <Button size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={() => { setEditId(post.id); setEditTxt(textoAtual(post)); }}>Editar</Button>
                            {post.status !== "aprovado" ? (
                              <Button size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={() => setPostStatus(post, "aprovado")}><Check className="h-3.5 w-3.5" /> Aprovar</Button>
                            ) : (
                              <Button size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={() => setPostStatus(post, "rascunho")}>Reabrir</Button>
                            )}
                            <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => setPostStatus(post, "arquivado")} title="Arquivar"><Archive className="h-3.5 w-3.5" /></Button>
                            <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => exportar(post)} title="Exportar .txt"><Download className="h-3.5 w-3.5" /></Button>
                            <Button size="sm" variant="ghost" className="h-7 px-2 text-xs text-destructive hover:text-destructive" onClick={() => excluirPost(post)} title="Excluir"><Trash2 className="h-3.5 w-3.5" /></Button>
                          </>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            );
          })()}
        </CardContent>
      </Card>

      {/* Obras do autor */}
      <Card>
        <CardHeader><CardTitle className="text-lg">Obras ({obras.length})</CardTitle><CardDescription>Mova uma obra para outro autor se a atribuição estiver errada.</CardDescription></CardHeader>
        <CardContent>
          {obras.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Nenhuma obra atribuída a este autor.</p>
          ) : (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
              {obras.map((p) => (
                <div key={p.id} className="space-y-1.5">
                  <Link to={`/projeto/${p.id}`} className="group block">
                    <div className="relative aspect-[2/3] w-full overflow-hidden rounded-lg border bg-muted shadow-sm transition-shadow group-hover:shadow-lg">
                      <CoverArt info={{ titulo: p.titulo, serie: p.serie, volume: p.volume, capa: capas[p.id] ?? null }} variant="poster" />
                    </div>
                  </Link>
                  <p className="truncate text-xs font-medium" title={p.titulo}>{p.titulo}</p>
                  <select className={`${ctrl} h-8 w-full text-xs`} value={id} onChange={(e) => mover(p.id, e.target.value)} title="Mover para outro autor">
                    {todos.map((t) => <option key={t.id} value={t.id}>{t.nome}</option>)}
                  </select>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex items-center justify-between">
        <Button variant="ghost" className="text-destructive hover:text-destructive" onClick={excluir}><Trash2 className="h-4 w-4" /> Excluir autor</Button>
        <Button onClick={salvar} disabled={salvando}>
          {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Salvar
        </Button>
      </div>

      <Dialog open={dlg} onOpenChange={setDlg}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Gerar post — {META[form.rede].label}</DialogTitle>
            <DialogDescription>Rascunho na voz de {a.nome}. Nada é publicado — só gera para você revisar.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Rede</Label>
              <select className={`${ctrl} w-full`} value={form.rede} onChange={(e) => setForm((f) => ({ ...f, rede: e.target.value as Rede }))}>
                {REDES.map((k) => <option key={k} value={k}>{META[k].label}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label>Objetivo</Label>
              <select className={`${ctrl} w-full`} value={form.objetivo} onChange={(e) => setForm((f) => ({ ...f, objetivo: e.target.value }))}>
                {OBJETIVOS.map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label>Tema (opcional)</Label>
              <Input value={form.tema} onChange={(e) => setForm((f) => ({ ...f, tema: e.target.value }))} placeholder="ex.: o clímax sem spoiler, bastidores da pesquisa…" />
            </div>
            <div className="space-y-1.5">
              <Label>Obra (opcional)</Label>
              <select className={`${ctrl} w-full`} value={form.project_id} onChange={(e) => setForm((f) => ({ ...f, project_id: e.target.value }))}>
                <option value="">— nenhuma —</option>
                {obras.map((o) => <option key={o.id} value={o.id}>{o.titulo}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label>Variações</Label>
              <select className={`${ctrl} w-full`} value={form.n} onChange={(e) => setForm((f) => ({ ...f, n: e.target.value }))}>
                {["2", "3", "4", "5"].map((x) => <option key={x} value={x}>{x}</option>)}
              </select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDlg(false)}>Cancelar</Button>
            <Button onClick={gerar} disabled={enviando}>
              {enviando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />} Gerar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
