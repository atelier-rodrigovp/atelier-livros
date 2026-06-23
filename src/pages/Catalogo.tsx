import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Library, Search } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { signedUrl } from "@/lib/storage";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { CoverArt } from "@/components/CoverArt";

interface Item {
  edition_id: string;
  project_id: string;
  titulo: string;
  serie: string | null;
  volume: number | null;
  idioma: string;
  status: string;
  capa: string | null;
  created_at: string;
}

// Cache de URLs assinadas por sessão (evita reassinar a cada carregamento).
const capaCache = new Map<string, string>();

function chipCls(on: boolean) {
  return cn(
    "rounded-full border px-3 py-1 text-xs transition-colors",
    on ? "border-primary bg-primary/10 text-primary" : "text-muted-foreground hover:border-foreground/30"
  );
}

const ctrlCls =
  "h-9 rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

function Poster({ item }: { item: Item }) {
  return (
    <Link to={`/projeto/${item.project_id}`} className="group block">
      <div className="relative aspect-[2/3] w-full overflow-hidden rounded-lg border bg-muted shadow-sm transition-all group-hover:shadow-lg">
        <CoverArt info={item} variant="poster" className="transition-transform duration-300 group-hover:scale-105" />
        {item.volume && item.serie && (
          <span className="absolute left-1.5 top-1.5 rounded bg-black/55 px-1.5 py-0.5 text-[10px] font-medium text-white backdrop-blur">
            Vol. {item.volume}
          </span>
        )}
        <Badge variant="outline" className="absolute right-1.5 top-1.5 bg-background/85 px-1.5 py-0 text-[10px] backdrop-blur">
          {item.status}
        </Badge>
      </div>
      <div className="mt-1.5">
        <p className="truncate text-sm font-medium leading-tight" title={item.titulo}>{item.titulo}</p>
        <p className="text-xs text-muted-foreground">{item.idioma}</p>
      </div>
    </Link>
  );
}

function Grade({ itens }: { itens: Item[] }) {
  return (
    <div
      className="grid gap-4"
      style={{ gridTemplateColumns: "repeat(auto-fill, minmax(132px, 1fr))" }}
    >
      {itens.map((i) => <Poster key={i.edition_id} item={i} />)}
    </div>
  );
}

export default function Catalogo() {
  const [itens, setItens] = useState<Item[]>([]);
  const [busca, setBusca] = useState("");
  const [fIdioma, setFIdioma] = useState("");
  const [fStatus, setFStatus] = useState("");
  const [ordem, setOrdem] = useState("recentes");
  const [agrupar, setAgrupar] = useState(() => localStorage.getItem("cat:agrupar") === "1");

  useEffect(() => { localStorage.setItem("cat:agrupar", agrupar ? "1" : "0"); }, [agrupar]);

  const carregar = useCallback(async () => {
    const [{ data: projs }, { data: eds }, { data: arts }] = await Promise.all([
      supabase.from("projects").select("id,titulo,serie,volume,created_at"),
      supabase.from("editions").select("id,project_id,idioma,status"),
      supabase.from("artifacts").select("edition_id,tipo,url_publica,storage_path").eq("tipo", "capa"),
    ]);
    const pmap = new Map((projs ?? []).map((p: any) => [p.id, p]));
    const capaEntries = await Promise.all(
      (arts ?? []).map(async (a: any) => {
        if (capaCache.has(a.storage_path)) return [a.edition_id, capaCache.get(a.storage_path)!] as const;
        const url = (await signedUrl("capas", a.storage_path, 3600)) ?? a.url_publica ?? null;
        if (url) capaCache.set(a.storage_path, url);
        return [a.edition_id, url] as const;
      })
    );
    const capaMap = new Map(capaEntries);
    setItens(
      (eds ?? []).map((e: any) => ({
        edition_id: e.id,
        project_id: e.project_id,
        titulo: pmap.get(e.project_id)?.titulo ?? "—",
        serie: pmap.get(e.project_id)?.serie ?? null,
        volume: pmap.get(e.project_id)?.volume ?? null,
        idioma: e.idioma,
        status: e.status,
        capa: capaMap.get(e.id) ?? null,
        created_at: pmap.get(e.project_id)?.created_at ?? "",
      }))
    );
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  const idiomas = useMemo(() => [...new Set(itens.map((i) => i.idioma))].sort(), [itens]);
  const statuses = useMemo(() => [...new Set(itens.map((i) => i.status))].sort(), [itens]);

  const ordenar = useCallback((arr: Item[]) => {
    const a = [...arr];
    if (ordem === "titulo") a.sort((x, y) => x.titulo.localeCompare(y.titulo, "pt-BR"));
    else if (ordem === "status") a.sort((x, y) => x.status.localeCompare(y.status));
    else a.sort((x, y) => (y.created_at ?? "").localeCompare(x.created_at ?? ""));
    return a;
  }, [ordem]);

  const visiveis = useMemo(() => {
    const q = busca.trim().toLowerCase();
    const filtrados = itens.filter(
      (i) =>
        (!q || i.titulo.toLowerCase().includes(q) || (i.serie ?? "").toLowerCase().includes(q)) &&
        (!fIdioma || i.idioma === fIdioma) &&
        (!fStatus || i.status === fStatus)
    );
    return ordenar(filtrados);
  }, [itens, busca, fIdioma, fStatus, ordenar]);

  // Modo agrupado: seções por série (preservando a ordem escolhida), volumes por número.
  const grupos = useMemo(() => {
    const bySerie = new Map<string, Item[]>();
    const avulsos: Item[] = [];
    for (const i of visiveis) {
      if (i.serie) {
        const arr = bySerie.get(i.serie) ?? [];
        arr.push(i);
        bySerie.set(i.serie, arr);
      } else avulsos.push(i);
    }
    const series = [...bySerie.entries()].map(([serie, arr]) => ({
      serie,
      itens: arr.sort((a, b) => (a.volume ?? 0) - (b.volume ?? 0)),
    }));
    return { series, avulsos };
  }, [visiveis]);

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Catálogo</h1>
          <p className="mt-1 text-muted-foreground">
            {itens.length} {itens.length === 1 ? "livro" : "livros"} · {idiomas.length} {idiomas.length === 1 ? "idioma" : "idiomas"}
          </p>
        </div>
        {itens.length > 0 && (
          <div className="flex items-center gap-2">
            <div className="relative w-full sm:w-[190px]">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Buscar…"
                className={cn(ctrlCls, "w-full pl-9 pr-3")}
              />
            </div>
            <select value={ordem} onChange={(e) => setOrdem(e.target.value)} className={ctrlCls} aria-label="Ordenar">
              <option value="recentes">Recentes</option>
              <option value="titulo">Título A–Z</option>
              <option value="status">Status</option>
            </select>
          </div>
        )}
      </div>

      {itens.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          {idiomas.length > 1 && idiomas.map((i) => (
            <button key={i} className={chipCls(fIdioma === i)} onClick={() => setFIdioma((c) => (c === i ? "" : i))}>{i}</button>
          ))}
          {idiomas.length > 1 && statuses.length > 1 && <span className="mx-1 h-4 w-px bg-border" />}
          {statuses.length > 1 && statuses.map((s) => (
            <button key={s} className={chipCls(fStatus === s)} onClick={() => setFStatus((c) => (c === s ? "" : s))}>{s}</button>
          ))}
          <button
            className={cn(chipCls(agrupar), "ml-auto")}
            onClick={() => setAgrupar((v) => !v)}
            aria-pressed={agrupar}
          >
            Agrupar por série
          </button>
        </div>
      )}

      {itens.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed py-20 text-center">
          <Library className="h-10 w-10 text-muted-foreground/50" />
          <p className="text-muted-foreground">Nenhuma edição no catálogo ainda.</p>
          <Link to="/novo-projeto" className="text-sm font-medium text-primary hover:underline">
            Criar primeiro projeto
          </Link>
        </div>
      ) : visiveis.length === 0 ? (
        <p className="py-12 text-center text-sm text-muted-foreground">Nada encontrado.</p>
      ) : agrupar ? (
        <div className="space-y-8">
          {grupos.series.map((g) => (
            <section key={g.serie} className="space-y-3">
              <div className="flex items-baseline gap-2">
                <h2 className="font-serif text-xl font-semibold tracking-tight">{g.serie}</h2>
                <span className="text-sm text-muted-foreground">{g.itens.length}</span>
              </div>
              <Grade itens={g.itens} />
            </section>
          ))}
          {grupos.avulsos.length > 0 && (
            <section className="space-y-3">
              {grupos.series.length > 0 && <h2 className="font-serif text-xl font-semibold tracking-tight">Livros avulsos</h2>}
              <Grade itens={grupos.avulsos} />
            </section>
          )}
        </div>
      ) : (
        <Grade itens={visiveis} />
      )}
    </div>
  );
}
