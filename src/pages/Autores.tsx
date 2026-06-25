import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Loader2, Plus, Users } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { signedUrl } from "@/lib/storage";
import { useSession } from "@/hooks/useSession";
import type { Author } from "@/lib/types";
import { Button } from "@/components/ui/button";

function iniciais(nome: string) {
  return nome.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join("");
}

export default function Autores() {
  const nav = useNavigate();
  const { session } = useSession();
  const [autores, setAutores] = useState<Author[]>([]);
  const [obras, setObras] = useState<Record<string, number>>({});
  const [avatares, setAvatares] = useState<Record<string, string>>({});
  const [carregando, setCarregando] = useState(true);
  const [criando, setCriando] = useState(false);

  const carregar = useCallback(async () => {
    const { data, error } = await supabase.from("authors").select("*").order("nome");
    if (error) { setAutores([]); setCarregando(false); return; }
    const as = (data as Author[]) ?? [];
    setAutores(as);
    const { data: projs } = await supabase.from("projects").select("author_id");
    const cont: Record<string, number> = {};
    for (const p of (projs as { author_id: string | null }[]) ?? []) if (p.author_id) cont[p.author_id] = (cont[p.author_id] ?? 0) + 1;
    setObras(cont);
    const comAvatar = as.filter((a) => a.avatar_path);
    const ent = await Promise.all(comAvatar.map(async (a) => [a.id, await signedUrl("autores", a.avatar_path!, 3600)] as const));
    setAvatares(Object.fromEntries(ent.filter(([, u]) => u)) as Record<string, string>);
    setCarregando(false);
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  async function novoAutor() {
    setCriando(true);
    const { data, error } = await supabase.from("authors").insert({ owner: session?.user?.id, nome: "Novo autor", social: {} }).select("id").single();
    setCriando(false);
    if (error) { toast.error(error.message); return; }
    nav(`/autores/${data.id}`);
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Autores</h1>
          <p className="mt-1 text-muted-foreground">Pseudônimos, sua voz e seu catálogo.</p>
        </div>
        <Button onClick={novoAutor} disabled={criando}>
          {criando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Novo autor
        </Button>
      </div>

      {carregando ? (
        <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : autores.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed py-20 text-center">
          <Users className="h-10 w-10 text-muted-foreground/50" />
          <p className="text-muted-foreground">Nenhum autor ainda.</p>
          <Button size="sm" onClick={novoAutor} disabled={criando}><Plus className="h-4 w-4" /> Criar primeiro autor</Button>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {autores.map((a) => (
            <Link key={a.id} to={`/autores/${a.id}`} className="group flex gap-4 rounded-xl border bg-card p-4 transition-shadow hover:shadow-md">
              <div className="grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-full bg-primary/10 text-lg font-semibold text-primary">
                {avatares[a.id] ? <img src={avatares[a.id]} alt={a.nome} className="h-full w-full object-cover" /> : iniciais(a.nome) || "?"}
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="truncate font-semibold leading-snug">{a.nome}</h3>
                <p className="truncate text-xs text-muted-foreground">{a.estilo || "—"}</p>
                <p className="mt-1 text-xs text-muted-foreground">{obras[a.id] ?? 0} {(obras[a.id] ?? 0) === 1 ? "obra" : "obras"}</p>
                {a.bio && <p className="mt-2 line-clamp-2 text-xs text-muted-foreground/90">{a.bio}</p>}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
