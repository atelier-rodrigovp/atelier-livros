import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronLeft, ChevronRight, Library, Play, Search } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { signedUrl } from "@/lib/storage";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { CoverArt, paletaDe } from "@/components/CoverArt";

interface Item {
  edition_id: string;
  project_id: string;
  titulo: string;
  serie: string | null;
  volume: number | null;
  idioma: string;
  status: string;
  capa: string | null;
}

// Cache de URLs assinadas por sessão (evita reassinar a cada carregamento).
const capaCache = new Map<string, string>();

function chipCls(on: boolean) {
  return cn(
    "rounded-full border px-3 py-1 text-xs transition-colors",
    on ? "border-primary bg-primary/10 text-primary" : "text-muted-foreground hover:border-foreground/30"
  );
}

function Poster({ item }: { item: Item }) {
  return (
    <Link to={`/projeto/${item.project_id}`} className="group block">
      <div className="relative aspect-[2/3] w-full overflow-hidden rounded-xl border bg-muted shadow-sm transition-shadow group-hover:shadow-xl">
        <CoverArt info={item} variant="poster" className="transition-transform duration-300 group-hover:scale-105" />
        {item.volume && item.serie && (
          <span className="absolute left-2 top-2 rounded bg-black/55 px-1.5 py-0.5 text-[10px] font-medium text-white backdrop-blur">
            Vol. {item.volume}
          </span>
        )}
        <Badge variant="outline" className="absolute right-2 top-2 bg-background/85 backdrop-blur">
          {item.status}
        </Badge>
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/25 to-transparent p-3 pt-10">
          <p className="line-clamp-2 text-sm font-medium leading-snug text-white">{item.titulo}</p>
          <p className="text-[11px] text-white/70">{item.idioma}</p>
        </div>
        <div className="absolute inset-0 flex items-center justify-center opacity-0 transition-opacity group-hover:opacity-100">
          <span className="flex items-center gap-1 rounded-full bg-white/90 px-3 py-1.5 text-xs font-medium text-black shadow">
            <Play className="h-3.5 w-3.5" /> Abrir
          </span>
        </div>
      </div>
    </Link>
  );
}

function Carrossel({ titulo, itens }: { titulo: string; itens: Item[] }) {
  const ref = useRef<HTMLDivElement>(null);
  if (!itens.length) return null;
  const rolar = (dir: number) => {
    const el = ref.current;
    if (el) el.scrollBy({ left: dir * el.clientWidth * 0.9, behavior: "smooth" });
  };
  return (
    <section className="group/row space-y-3">
      <div className="flex items-baseline gap-2">
        <h2 className="font-serif text-xl font-semibold tracking-tight">{titulo}</h2>
        <span className="text-sm text-muted-foreground">{itens.length}</span>
      </div>
      <div className="relative">
        <button
          onClick={() => rolar(-1)}
          aria-label="Anterior"
          className="absolute left-0 top-0 z-10 hidden h-full items-center bg-gradient-to-r from-background/90 to-transparent pl-1 pr-6 opacity-0 transition-opacity group-hover/row:opacity-100 sm:flex"
        >
          <span className="rounded-full border bg-background p-1.5 shadow"><ChevronLeft className="h-5 w-5" /></span>
        </button>
        <div ref={ref} className="flex snap-x gap-4 overflow-x-auto scroll-smooth pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {itens.map((i) => (
            <div key={i.edition_id} className="w-[160px] shrink-0 snap-start sm:w-[185px]">
              <Poster item={i} />
            </div>
          ))}
        </div>
        <button
          onClick={() => rolar(1)}
          aria-label="Próximo"
          className="absolute right-0 top-0 z-10 hidden h-full items-center bg-gradient-to-l from-background/90 to-transparent pl-6 pr-1 opacity-0 transition-opacity group-hover/row:opacity-100 sm:flex"
        >
          <span className="rounded-full border bg-background p-1.5 shadow"><ChevronRight className="h-5 w-5" /></span>
        </button>
      </div>
    </section>
  );
}

export default function Catalogo() {
  const [itens, setItens] = useState<Item[]>([]);
  const [busca, setBusca] = useState("");
  const [fIdioma, setFIdioma] = useState("");
  const [fStatus, setFStatus] = useState("");

  const carregar = useCallback(async () => {
    const [{ data: projs }, { data: eds }, { data: arts }] = await Promise.all([
      supabase.from("projects").select("id,titulo,serie,volume"),
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
      }))
    );
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  const idiomas = useMemo(() => [...new Set(itens.map((i) => i.idioma))].sort(), [itens]);
  const statuses = useMemo(() => [...new Set(itens.map((i) => i.status))].sort(), [itens]);
  const filtrando = !!(busca.trim() || fIdioma || fStatus);

  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return itens.filter(
      (i) =>
        (!q || i.titulo.toLowerCase().includes(q) || (i.serie ?? "").toLowerCase().includes(q)) &&
        (!fIdioma || i.idioma === fIdioma) &&
        (!fStatus || i.status === fStatus)
    );
  }, [itens, busca, fIdioma, fStatus]);

  const { sagas, avulsos } = useMemo(() => {
    const bySerie = new Map<string, Item[]>();
    const soltos: Item[] = [];
    for (const i of itens) {
      if (i.serie) {
        const arr = bySerie.get(i.serie) ?? [];
        arr.push(i);
        bySerie.set(i.serie, arr);
      } else soltos.push(i);
    }
    const sagas = [...bySerie.entries()].map(([serie, arr]) => ({
      serie,
      itens: arr.sort((a, b) => (a.volume ?? 0) - (b.volume ?? 0)),
    }));
    return { sagas, avulsos: soltos };
  }, [itens]);

  // Hero: primeiro livro em produção (origem, não pronto).
  const hero = useMemo(
    () => itens.find((i) => i.status !== "pronto" && i.status !== "publicado") ?? null,
    [itens]
  );

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Catálogo</h1>
          <p className="mt-1 text-muted-foreground">Sua biblioteca de capas e edições.</p>
        </div>
        {itens.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative w-full sm:w-60">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Buscar…"
                className="h-9 w-full rounded-md border border-input bg-background pl-9 pr-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </div>
            {idiomas.length > 1 && idiomas.map((i) => (
              <button key={i} className={chipCls(fIdioma === i)} onClick={() => setFIdioma((c) => (c === i ? "" : i))}>{i}</button>
            ))}
            {statuses.length > 1 && statuses.map((s) => (
              <button key={s} className={chipCls(fStatus === s)} onClick={() => setFStatus((c) => (c === s ? "" : s))}>{s}</button>
            ))}
          </div>
        )}
      </div>

      {itens.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed py-20 text-center">
          <Library className="h-10 w-10 text-muted-foreground/50" />
          <p className="text-muted-foreground">Nenhuma edição no catálogo ainda.</p>
          <Link to="/novo-projeto" className="text-sm font-medium text-primary hover:underline">
            Criar primeiro projeto
          </Link>
        </div>
      ) : filtrando ? (
        filtrados.length === 0 ? (
          <p className="py-12 text-center text-sm text-muted-foreground">Nada encontrado com esses filtros.</p>
        ) : (
          <div className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
            {filtrados.map((i) => <Poster key={i.edition_id} item={i} />)}
          </div>
        )
      ) : (
        <div className="space-y-10">
          {hero && (() => {
            const [c1, c2] = paletaDe(hero.titulo + (hero.volume ?? ""));
            return (
              <Link
                to={`/projeto/${hero.project_id}`}
                className="relative block h-56 overflow-hidden rounded-2xl sm:h-64"
                style={
                  hero.capa
                    ? { backgroundImage: `url(${hero.capa})`, backgroundSize: "cover", backgroundPosition: "center" }
                    : { background: `linear-gradient(120deg, ${c1}, ${c2})` }
                }
              >
                <div className="absolute inset-0 bg-gradient-to-r from-black/80 via-black/45 to-black/10" />
                <div className="relative flex h-full flex-col justify-end gap-2 p-6 sm:p-8">
                  <span className="text-xs uppercase tracking-widest text-white/70">Em produção</span>
                  <h2 className="font-serif text-2xl font-semibold text-white sm:text-3xl">{hero.titulo}</h2>
                  <div className="flex items-center gap-3">
                    <Badge variant="outline" className="border-white/30 bg-white/10 text-white">{hero.status}</Badge>
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-white px-4 py-1.5 text-sm font-medium text-black">
                      <Play className="h-4 w-4" /> Continuar
                    </span>
                  </div>
                </div>
              </Link>
            );
          })()}
          {sagas.map((g) => <Carrossel key={g.serie} titulo={g.serie} itens={g.itens} />)}
          <Carrossel titulo="Livros avulsos" itens={avulsos} />
        </div>
      )}
    </div>
  );
}
