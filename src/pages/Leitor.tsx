import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  ChevronLeft,
  ChevronRight,
  List,
  Loader2,
  Minus,
  Plus,
  X,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { downloadText } from "@/lib/storage";
import { mdToHtml } from "@/lib/reader";
import { cn } from "@/lib/utils";

interface Edicao { id: string; idioma: string; is_origem: boolean; }
interface Cap { id: string; numero: number; titulo: string | null; storage_path: string | null; palavras: number; }

type Tema = "claro" | "sepia" | "escuro";
const TEMAS: Record<Tema, { bg: string; fg: string; muted: string; rule: string }> = {
  claro: { bg: "#faf6ef", fg: "#241f1a", muted: "#8a7f70", rule: "#e4dccd" },
  sepia: { bg: "#f3e9d2", fg: "#4a3c28", muted: "#9c8868", rule: "#d9c9a3" },
  escuro: { bg: "#16130f", fg: "#e9e1d2", muted: "#9a8f7c", rule: "#332c22" },
};

const FONTES = [17, 19, 21, 23, 26, 29];

// Famílias de fonte para a leitura (a app já carrega Fraunces e Inter).
const FAMILIAS = [
  { nome: "Fraunces", css: "'Fraunces Variable', Georgia, serif" },
  { nome: "Georgia", css: "Georgia, 'Times New Roman', serif" },
  { nome: "Inter", css: "'Inter Variable', system-ui, sans-serif" },
  { nome: "Sistema", css: "system-ui, -apple-system, Segoe UI, sans-serif" },
];

// A partir desta largura mostramos duas páginas lado a lado (como um livro).
const LARGURA_LIVRO_ABERTO = 760;

export default function Leitor() {
  const { id } = useParams<{ id: string }>();
  const nav = useNavigate();

  const [titulo, setTitulo] = useState("");
  const [edicoes, setEdicoes] = useState<Edicao[]>([]);
  const [edId, setEdId] = useState<string>("");
  const [caps, setCaps] = useState<Cap[]>([]);
  const [capIdx, setCapIdx] = useState(0);
  const [html, setHtml] = useState("");
  const [carregandoCap, setCarregandoCap] = useState(false);
  const [carregandoBase, setCarregandoBase] = useState(true);

  const [pagina, setPagina] = useState(0);
  const [totalPag, setTotalPag] = useState(1);
  const [pageW, setPageW] = useState(0);
  const [cols, setCols] = useState(1);
  const [fonteIdx, setFonteIdx] = useState(1);
  const [familiaIdx, setFamiliaIdx] = useState(0);
  const [tema, setTema] = useState<Tema>("sepia");
  const [tocAberto, setTocAberto] = useState(false);

  const irUltima = useRef(false);
  const cacheRef = useRef<Record<string, string>>({});
  const viewportRef = useRef<HTMLDivElement>(null);
  const colHostRef = useRef<HTMLDivElement>(null);
  const [dims, setDims] = useState({ w: 0, h: 0 });

  const cor = TEMAS[tema];
  const fonte = FONTES[fonteIdx];
  const familia = FAMILIAS[familiaIdx].css;
  const GAP = 80;
  const colW = cols === 2 ? (pageW - GAP) / 2 : pageW;

  // ---- carga base: projeto + edições -------------------------------------
  useEffect(() => {
    if (!id) return;
    (async () => {
      const [{ data: p }, { data: eds }] = await Promise.all([
        supabase.from("projects").select("titulo").eq("id", id).single(),
        supabase.from("editions").select("id,idioma,is_origem").eq("project_id", id).order("is_origem", { ascending: false }),
      ]);
      setTitulo((p as any)?.titulo ?? "");
      const lista = (eds as Edicao[]) ?? [];
      setEdicoes(lista);
      setEdId((cur) => cur || lista[0]?.id || "");
      setCarregandoBase(false);
    })();
  }, [id]);

  // ---- capítulos da edição (com realtime: novos capítulos aparecem) -------
  const carregarCaps = useCallback(async (edition: string) => {
    const { data } = await supabase
      .from("chapters")
      .select("id,numero,titulo,storage_path,palavras")
      .eq("edition_id", edition)
      .order("numero", { ascending: true });
    setCaps((data as Cap[]) ?? []);
  }, []);

  useEffect(() => {
    if (!edId) return;
    setCapIdx(0);
    setPagina(0);
    carregarCaps(edId);
    const ch = supabase
      .channel(`leitor-${edId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "chapters", filter: `edition_id=eq.${edId}` }, () => carregarCaps(edId))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [edId, carregarCaps]);

  // ---- conteúdo do capítulo atual (cache por capítulo) -------------------
  useEffect(() => {
    const cap = caps[capIdx];
    if (!cap) { setHtml(""); return; }
    if (!cap.storage_path) { setHtml("<p><em>Capítulo ainda sem conteúdo no armazenamento.</em></p>"); return; }
    const cached = cacheRef.current[cap.id];
    if (cached != null) { setHtml(cached); return; }
    let vivo = true;
    setCarregandoCap(true);
    (async () => {
      const md = await downloadText("manuscritos", cap.storage_path!);
      const h = mdToHtml(md);
      cacheRef.current[cap.id] = h;
      if (vivo) { setHtml(h); setCarregandoCap(false); }
    })();
    return () => { vivo = false; };
  }, [caps, capIdx]);

  // ---- medição do nº de páginas (colunas) --------------------------------
  // Em telas largas mostramos 2 colunas (livro aberto); em telas estreitas, 1.
  // Cada "tela" exibe `colunas` páginas; o avanço por tela continua sendo
  // (largura + GAP) porque 2 colunas + 1 gutter somam a largura do viewport.
  useLayoutEffect(() => {
    const host = colHostRef.current;
    if (!host) return;
    const largura = host.clientWidth;
    const colunas = largura >= LARGURA_LIVRO_ABERTO ? 2 : 1;
    const cw = colunas === 2 ? (largura - GAP) / 2 : largura;
    // aplica a largura de coluna antes de medir, para o scrollWidth já refletir
    host.style.columnWidth = cw > 0 ? `${cw}px` : "";
    const colunasTotais = cw > 0 ? Math.max(1, Math.round((host.scrollWidth + GAP) / (cw + GAP))) : 1;
    const telas = Math.max(1, Math.ceil(colunasTotais / colunas));
    setPageW(largura);
    setCols(colunas);
    setTotalPag(telas);
    setPagina((pg) => {
      if (irUltima.current) { irUltima.current = false; return telas - 1; }
      return Math.min(pg, telas - 1);
    });
  }, [html, fonte, familia, dims, carregandoCap]);

  // recalcula quando fontes carregam e em resize do viewport
  useEffect(() => {
    (document as any).fonts?.ready?.then(() => setDims((d) => ({ ...d })));
    const vp = viewportRef.current;
    if (!vp || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => setDims({ w: vp.clientWidth, h: vp.clientHeight }));
    ro.observe(vp);
    return () => ro.disconnect();
  }, []);

  // ---- navegação ---------------------------------------------------------
  const proxima = useCallback(() => {
    setPagina((pg) => {
      if (pg < totalPag - 1) return pg + 1;
      if (capIdx < caps.length - 1) { setCapIdx((i) => i + 1); return 0; }
      return pg;
    });
  }, [totalPag, capIdx, caps.length]);

  const anterior = useCallback(() => {
    setPagina((pg) => {
      if (pg > 0) return pg - 1;
      if (capIdx > 0) { irUltima.current = true; setCapIdx((i) => i - 1); return 0; }
      return pg;
    });
  }, [capIdx]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight" || e.key === " " || e.key === "PageDown") { e.preventDefault(); proxima(); }
      else if (e.key === "ArrowLeft" || e.key === "PageUp") { e.preventDefault(); anterior(); }
      else if (e.key === "Escape") nav(`/projeto/${id}`);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [proxima, anterior, nav, id]);

  const irPara = (idx: number) => { setCapIdx(idx); setPagina(0); setTocAberto(false); };

  // progresso global (capítulos com peso igual; página dentro do capítulo)
  const progresso = caps.length ? ((capIdx + (totalPag ? pagina / totalPag : 0)) / caps.length) * 100 : 0;
  const capAtual = caps[capIdx];
  const semConteudo = !carregandoBase && caps.length === 0;

  if (carregandoBase) {
    return (
      <div className="flex min-h-svh items-center justify-center" style={{ background: cor.bg }}>
        <Loader2 className="h-6 w-6 animate-spin" style={{ color: cor.muted }} />
      </div>
    );
  }

  return (
    <div className="flex h-svh flex-col overflow-hidden" style={{ background: cor.bg, color: cor.fg }}>
      {/* barra superior */}
      <header className="flex items-center gap-3 px-4 py-3 text-sm" style={{ borderBottom: `1px solid ${cor.rule}` }}>
        <button onClick={() => nav(`/projeto/${id}`)} className="flex items-center gap-1 opacity-70 hover:opacity-100" title="Voltar (Esc)">
          <X className="h-4 w-4" /> Fechar
        </button>
        <button onClick={() => setTocAberto((v) => !v)} className="flex items-center gap-1 opacity-70 hover:opacity-100" title="Sumário">
          <List className="h-4 w-4" /> Sumário
        </button>
        <div className="mx-auto min-w-0 truncate text-center font-medium" style={{ fontFamily: "'Fraunces Variable', serif" }}>
          {titulo}
        </div>

        {edicoes.length > 1 && (
          <select
            value={edId}
            onChange={(e) => setEdId(e.target.value)}
            className="rounded-md border bg-transparent px-2 py-1 text-xs"
            style={{ borderColor: cor.rule, color: cor.fg }}
            title="Idioma"
          >
            {edicoes.map((e) => (
              <option key={e.id} value={e.id} style={{ color: "#111" }}>{e.idioma}{e.is_origem ? " ·orig" : ""}</option>
            ))}
          </select>
        )}

        <select
          value={familiaIdx}
          onChange={(e) => setFamiliaIdx(Number(e.target.value))}
          className="rounded-md border bg-transparent px-2 py-1 text-xs"
          style={{ borderColor: cor.rule, color: cor.fg }}
          title="Fonte"
        >
          {FAMILIAS.map((f, i) => (
            <option key={f.nome} value={i} style={{ color: "#111" }}>{f.nome}</option>
          ))}
        </select>
        <div className="flex items-center gap-1">
          <button onClick={() => setFonteIdx((i) => Math.max(0, i - 1))} className="rounded p-1 opacity-70 hover:opacity-100" title="Diminuir letra"><Minus className="h-4 w-4" /></button>
          <span className="w-7 text-center text-xs tabular-nums opacity-70" title="Tamanho da letra">{fonte}</span>
          <button onClick={() => setFonteIdx((i) => Math.min(FONTES.length - 1, i + 1))} className="rounded p-1 opacity-70 hover:opacity-100" title="Aumentar letra"><Plus className="h-4 w-4" /></button>
        </div>
        <div className="flex items-center gap-1">
          {(["claro", "sepia", "escuro"] as Tema[]).map((t) => (
            <button
              key={t}
              onClick={() => setTema(t)}
              className={cn("h-5 w-5 rounded-full border transition", tema === t ? "ring-2 ring-offset-1" : "opacity-70")}
              style={{ background: TEMAS[t].bg, borderColor: cor.rule, ...(tema === t ? { boxShadow: `0 0 0 2px ${cor.fg}` } : {}) }}
              title={t}
            />
          ))}
        </div>
      </header>

      {/* corpo: sumário + página */}
      <div className="relative flex min-h-0 flex-1">
        {/* Sumário lateral */}
        <aside
          className={cn(
            "absolute inset-y-0 left-0 z-20 w-72 max-w-[80vw] overflow-y-auto px-4 py-4 transition-transform duration-300",
            tocAberto ? "translate-x-0" : "-translate-x-full"
          )}
          style={{ background: cor.bg, borderRight: `1px solid ${cor.rule}` }}
        >
          <p className="mb-3 text-xs uppercase tracking-wide" style={{ color: cor.muted }}>Sumário · {caps.length} capítulos</p>
          <ul className="space-y-1">
            {caps.map((c, i) => (
              <li key={c.id}>
                <button
                  onClick={() => irPara(i)}
                  className={cn("w-full rounded-md px-2 py-1.5 text-left text-sm transition", i === capIdx ? "font-medium" : "opacity-75 hover:opacity-100")}
                  style={i === capIdx ? { background: cor.rule } : {}}
                >
                  <span className="tabular-nums" style={{ color: cor.muted }}>{String(c.numero).padStart(2, "0")}</span>{" "}
                  {c.titulo || `Capítulo ${c.numero}`}
                </button>
              </li>
            ))}
          </ul>
        </aside>
        {tocAberto && <div className="absolute inset-0 z-10 bg-black/20" onClick={() => setTocAberto(false)} />}

        {/* setas */}
        <button
          onClick={anterior}
          disabled={capIdx === 0 && pagina === 0}
          className="z-10 hidden shrink-0 items-center px-3 opacity-40 transition hover:opacity-90 disabled:opacity-10 sm:flex"
          title="Anterior (←)"
        >
          <ChevronLeft className="h-8 w-8" />
        </button>

        {/* viewport de leitura */}
        <div className="relative min-w-0 flex-1">
          <div ref={viewportRef} className="absolute inset-0 overflow-hidden px-6 py-8 sm:px-10">
            {carregandoCap ? (
              <div className="flex h-full items-center justify-center"><Loader2 className="h-5 w-5 animate-spin" style={{ color: cor.muted }} /></div>
            ) : semConteudo ? (
              <div className="flex h-full flex-col items-center justify-center gap-2 text-center" style={{ color: cor.muted }}>
                <p>Ainda não há capítulos nesta edição.</p>
                <p className="text-sm">Os capítulos aparecem aqui conforme o livro é escrito.</p>
              </div>
            ) : (
              <div
                ref={colHostRef}
                className="reader-prose h-full"
                style={{
                  columnWidth: colW > 0 ? colW : undefined,
                  columnGap: GAP,
                  columnFill: "auto",
                  transform: `translateX(-${pagina * (pageW + GAP)}px)`,
                  transition: "transform 0.4s cubic-bezier(0.22, 1, 0.36, 1)",
                  fontFamily: familia,
                  fontSize: fonte,
                  lineHeight: 1.7,
                  textAlign: "justify",
                  hyphens: "auto",
                }}
                dangerouslySetInnerHTML={{ __html: html }}
              />
            )}
            {/* vinco central do livro aberto (só em página dupla) */}
            {cols === 2 && !carregandoCap && !semConteudo && (
              <div
                className="pointer-events-none absolute inset-y-8 left-1/2 w-px -translate-x-1/2"
                style={{ background: cor.rule }}
              />
            )}
          </div>
          {/* zonas de toque (mobile) */}
          <button className="absolute inset-y-0 left-0 z-0 w-1/3 sm:hidden" onClick={anterior} aria-label="Página anterior" />
          <button className="absolute inset-y-0 right-0 z-0 w-1/3 sm:hidden" onClick={proxima} aria-label="Próxima página" />
        </div>

        <button
          onClick={proxima}
          disabled={capIdx === caps.length - 1 && pagina >= totalPag - 1}
          className="z-10 hidden shrink-0 items-center px-3 opacity-40 transition hover:opacity-90 disabled:opacity-10 sm:flex"
          title="Próxima (→)"
        >
          <ChevronRight className="h-8 w-8" />
        </button>
      </div>

      {/* rodapé: progresso */}
      <footer className="px-4 py-2 text-xs" style={{ borderTop: `1px solid ${cor.rule}`, color: cor.muted }}>
        <div className="mb-1.5 h-0.5 w-full overflow-hidden rounded-full" style={{ background: cor.rule }}>
          <div className="h-full" style={{ width: `${progresso}%`, background: cor.fg, opacity: 0.5, transition: "width 0.4s ease" }} />
        </div>
        <div className="flex items-center justify-between">
          <span className="truncate">{capAtual ? (capAtual.titulo || `Capítulo ${capAtual.numero}`) : ""}</span>
          <span className="tabular-nums">pág. {pagina + 1}/{totalPag} · cap. {caps.length ? capIdx + 1 : 0}/{caps.length}</span>
        </div>
      </footer>
    </div>
  );
}
