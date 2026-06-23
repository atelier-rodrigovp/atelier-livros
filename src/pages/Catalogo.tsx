import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { BookImage, Library, Search } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { signedUrl } from "@/lib/storage";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

interface Item {
  edition_id: string;
  project_id: string;
  titulo: string;
  serie: string | null;
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

function BookCard({ item }: { item: Item }) {
  return (
    <Link to={`/projeto/${item.project_id}`} className="group block">
      <div className="relative aspect-[2/3] w-full overflow-hidden rounded-lg border bg-muted shadow-sm transition-shadow group-hover:shadow-lg">
        {item.capa ? (
          <img
            src={item.capa}
            alt={`Capa: ${item.titulo}`}
            loading="lazy"
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-muted-foreground">
            <BookImage className="h-8 w-8" />
          </div>
        )}
        <Badge variant="outline" className="absolute right-1.5 top-1.5 bg-background/80 backdrop-blur">
          {item.status}
        </Badge>
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 via-black/30 to-transparent p-2.5 pt-8">
          <p className="line-clamp-2 text-sm font-medium leading-snug text-white">{item.titulo}</p>
          <p className="text-[11px] text-white/70">{item.idioma}</p>
        </div>
      </div>
    </Link>
  );
}

function Prateleira({ titulo, itens }: { titulo: string; itens: Item[] }) {
  if (!itens.length) return null;
  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold tracking-tight">{titulo}</h2>
      <div className="flex snap-x gap-4 overflow-x-auto pb-3">
        {itens.map((i) => (
          <div key={i.edition_id} className="w-36 shrink-0 snap-start sm:w-40">
            <BookCard item={i} />
          </div>
        ))}
      </div>
    </section>
  );
}

export default function Catalogo() {
  const [itens, setItens] = useState<Item[]>([]);
  const [busca, setBusca] = useState("");
  const [fIdioma, setFIdioma] = useState("");
  const [fStatus, setFStatus] = useState("");
  const [fSerie, setFSerie] = useState("");

  const carregar = useCallback(async () => {
    const [{ data: projs }, { data: eds }, { data: arts }] = await Promise.all([
      supabase.from("projects").select("id,titulo,serie"),
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
        idioma: e.idioma,
        status: e.status,
        capa: capaMap.get(e.id) ?? null,
      }))
    );
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  const idiomas = useMemo(() => [...new Set(itens.map((i) => i.idioma))].sort(), [itens]);
  const statuses = useMemo(() => [...new Set(itens.map((i) => i.status))].sort(), [itens]);
  const series = useMemo(() => [...new Set(itens.map((i) => i.serie).filter(Boolean))] as string[], [itens]);

  const filtrando = !!(busca.trim() || fIdioma || fStatus || fSerie);
  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return itens.filter(
      (i) =>
        (!q || i.titulo.toLowerCase().includes(q)) &&
        (!fIdioma || i.idioma === fIdioma) &&
        (!fStatus || i.status === fStatus) &&
        (!fSerie || i.serie === fSerie)
    );
  }, [itens, busca, fIdioma, fStatus, fSerie]);

  const emProducao = useMemo(() => itens.filter((i) => i.status !== "pronto" && i.status !== "publicado"), [itens]);
  const prontos = useMemo(() => itens.filter((i) => i.status === "pronto" || i.status === "publicado"), [itens]);
  const porSerie = useMemo(
    () => series.map((s) => ({ serie: s, itens: itens.filter((i) => i.serie === s) })).filter((g) => g.itens.length > 0),
    [series, itens]
  );

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Catálogo</h1>
        <p className="mt-1 text-muted-foreground">Sua biblioteca de capas e edições.</p>
      </div>

      {/* Busca + filtros como chips */}
      <div className="space-y-3">
        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por título…"
            className="h-9 w-full rounded-md border border-input bg-background pl-9 pr-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </div>
        {(idiomas.length > 1 || statuses.length > 1 || series.length > 0) && (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            {idiomas.length > 1 && (
              <div className="flex flex-wrap gap-1.5">
                {idiomas.map((i) => (
                  <button key={i} className={chipCls(fIdioma === i)} onClick={() => setFIdioma((c) => (c === i ? "" : i))}>{i}</button>
                ))}
              </div>
            )}
            {statuses.length > 1 && (
              <div className="flex flex-wrap gap-1.5">
                {statuses.map((s) => (
                  <button key={s} className={chipCls(fStatus === s)} onClick={() => setFStatus((c) => (c === s ? "" : s))}>{s}</button>
                ))}
              </div>
            )}
            {series.map((s) => (
              <button key={s} className={chipCls(fSerie === s)} onClick={() => setFSerie((c) => (c === s ? "" : s))}>{s}</button>
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
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
            {filtrados.map((i) => <BookCard key={i.edition_id} item={i} />)}
          </div>
        )
      ) : (
        <div className="space-y-8">
          <Prateleira titulo="Continuar produção" itens={emProducao} />
          <Prateleira titulo="Prontos e publicados" itens={prontos} />
          {porSerie.map((g) => <Prateleira key={g.serie} titulo={g.serie} itens={g.itens} />)}
        </div>
      )}
    </div>
  );
}
