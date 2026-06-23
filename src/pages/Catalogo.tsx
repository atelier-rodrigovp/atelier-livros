import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Library, Search } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { signedUrl } from "@/lib/storage";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

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

// Cache de URLs assinadas por sessao (evita reassinar a cada carregamento).
const capaCache = new Map<string, string>();

// Paleta deterministica para capas sem arte (parece intencional, nao bug).
const PALETAS = [
  ["#1f2a44", "#3b5278"],
  ["#3a2a2a", "#7a4a3a"],
  ["#22332b", "#3f6b53"],
  ["#2c2540", "#574a86"],
  ["#3a2f1c", "#8a6d3b"],
  ["#2a2a2e", "#55555c"],
];
function hashStr(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function chipCls(on: boolean) {
  return cn(
    "rounded-full border px-3 py-1 text-xs transition-colors",
    on ? "border-primary bg-primary/10 text-primary" : "text-muted-foreground hover:border-foreground/30"
  );
}

function tituloExibido(i: Item) {
  return i.titulo;
}

function CoverArt({ item }: { item: Item }) {
  if (item.capa) {
    return (
      <img
        src={item.capa}
        alt={`Capa: ${tituloExibido(item)}`}
        loading="lazy"
        className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
      />
    );
  }
  const [c1, c2] = PALETAS[hashStr(item.titulo + (item.volume ?? "")) % PALETAS.length];
  return (
    <div
      className="flex h-full w-full flex-col justify-between p-4 text-center"
      style={{ background: `linear-gradient(150deg, ${c1}, ${c2})` }}
    >
      <span className="text-[10px] uppercase tracking-[0.18em] text-white/60">
        {item.serie ? (item.volume ? `Vol. ${item.volume}` : "Serie") : "Livro"}
      </span>
      <p className="font-serif text-base font-semibold leading-snug text-white line-clamp-4">
        {tituloExibido(item)}
      </p>
      <span className="mx-auto h-px w-8 bg-white/40" />
    </div>
  );
}

function BookCard({ item }: { item: Item }) {
  return (
    <Link to={`/projeto/${item.project_id}`} className="group block">
      <div className="relative aspect-[2/3] w-full overflow-hidden rounded-lg border bg-muted shadow-sm transition-shadow group-hover:shadow-lg">
        <CoverArt item={item} />
        {item.volume && item.serie && (
          <span className="absolute left-1.5 top-1.5 rounded bg-black/55 px-1.5 py-0.5 text-[10px] font-medium text-white backdrop-blur">
            Vol. {item.volume}
          </span>
        )}
        <Badge variant="outline" className="absolute right-1.5 top-1.5 bg-background/85 backdrop-blur">
          {item.status}
        </Badge>
      </div>
      <div className="mt-2 px-0.5">
        <p className="truncate text-sm font-medium" title={tituloExibido(item)}>{tituloExibido(item)}</p>
        <p className="text-xs text-muted-foreground">{item.idioma}</p>
      </div>
    </Link>
  );
}

function Grade({ itens }: { itens: Item[] }) {
  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
      {itens.map((i) => <BookCard key={i.edition_id} item={i} />)}
    </div>
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

  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return itens.filter(
      (i) =>
        (!q || tituloExibido(i).toLowerCase().includes(q) || (i.serie ?? "").toLowerCase().includes(q)) &&
        (!fIdioma || i.idioma === fIdioma) &&
        (!fStatus || i.status === fStatus)
    );
  }, [itens, busca, fIdioma, fStatus]);

  const { sagas, avulsos } = useMemo(() => {
    const bySerie = new Map<string, Item[]>();
    const soltos: Item[] = [];
    for (const i of filtrados) {
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
  }, [filtrados]);

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Catálogo</h1>
        <p className="mt-1 text-muted-foreground">Sua biblioteca de capas e edições.</p>
      </div>

      {itens.length > 0 && (
        <div className="space-y-3">
          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar por título ou série…"
              className="h-9 w-full rounded-md border border-input bg-background pl-9 pr-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>
          {(idiomas.length > 1 || statuses.length > 1) && (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              {idiomas.length > 1 && idiomas.map((i) => (
                <button key={i} className={chipCls(fIdioma === i)} onClick={() => setFIdioma((c) => (c === i ? "" : i))}>{i}</button>
              ))}
              {statuses.length > 1 && statuses.map((s) => (
                <button key={s} className={chipCls(fStatus === s)} onClick={() => setFStatus((c) => (c === s ? "" : s))}>{s}</button>
              ))}
            </div>
          )}
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
      ) : filtrados.length === 0 ? (
        <p className="py-12 text-center text-sm text-muted-foreground">Nada encontrado com esses filtros.</p>
      ) : (
        <div className="space-y-10">
          {sagas.map((g) => (
            <section key={g.serie} className="space-y-3">
              <div className="flex items-baseline gap-2">
                <h2 className="font-serif text-xl font-semibold tracking-tight">{g.serie}</h2>
                <span className="text-sm text-muted-foreground">
                  {g.itens.length} {g.itens.length === 1 ? "volume" : "volumes"}
                </span>
              </div>
              <Grade itens={g.itens} />
            </section>
          ))}
          {avulsos.length > 0 && (
            <section className="space-y-3">
              {sagas.length > 0 && <h2 className="font-serif text-xl font-semibold tracking-tight">Livros avulsos</h2>}
              <Grade itens={avulsos} />
            </section>
          )}
        </div>
      )}
    </div>
  );
}
