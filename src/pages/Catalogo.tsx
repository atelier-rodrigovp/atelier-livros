import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { BookImage } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { IDIOMAS } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";

interface Item {
  edition_id: string;
  project_id: string;
  titulo: string;
  serie: string | null;
  idioma: string;
  status: string;
  capa: string | null;
}

const selCls = "h-9 rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

export default function Catalogo() {
  const [itens, setItens] = useState<Item[]>([]);
  const [fIdioma, setFIdioma] = useState("");
  const [fStatus, setFStatus] = useState("");
  const [fSerie, setFSerie] = useState("");

  const carregar = useCallback(async () => {
    const [{ data: projs }, { data: eds }, { data: arts }] = await Promise.all([
      supabase.from("projects").select("id,titulo,serie"),
      supabase.from("editions").select("id,project_id,idioma,status"),
      supabase.from("artifacts").select("edition_id,tipo,url_publica").eq("tipo", "capa"),
    ]);
    const pmap = new Map((projs ?? []).map((p: any) => [p.id, p]));
    const capaMap = new Map((arts ?? []).map((a: any) => [a.edition_id, a.url_publica]));
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

  const series = useMemo(() => [...new Set(itens.map((i) => i.serie).filter(Boolean))] as string[], [itens]);
  const filtrados = itens.filter(
    (i) => (!fIdioma || i.idioma === fIdioma) && (!fStatus || i.status === fStatus) && (!fSerie || i.serie === fSerie)
  );

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Catálogo</h1>
        <p className="mt-1 text-muted-foreground">Capas por edição, filtráveis por idioma, status e série.</p>
      </div>

      <div className="flex flex-wrap gap-3">
        <select className={selCls} value={fIdioma} onChange={(e) => setFIdioma(e.target.value)}>
          <option value="">Todos os idiomas</option>
          {IDIOMAS.map((i) => <option key={i} value={i}>{i}</option>)}
        </select>
        <select className={selCls} value={fStatus} onChange={(e) => setFStatus(e.target.value)}>
          <option value="">Todos os status</option>
          {["pendente", "traduzindo", "revisao", "pronto"].map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <select className={selCls} value={fSerie} onChange={(e) => setFSerie(e.target.value)}>
          <option value="">Todas as séries</option>
          {series.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      {filtrados.length === 0 ? (
        <Card><CardContent className="py-12 text-center text-muted-foreground">Nenhuma edição no catálogo ainda.</CardContent></Card>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {filtrados.map((i) => (
            <Link key={i.edition_id} to={`/projeto/${i.project_id}`}>
              <Card className="overflow-hidden transition-shadow hover:shadow-md">
                {i.capa ? (
                  <img src={i.capa} alt={i.titulo} className="aspect-[1.6/1] w-full object-cover" />
                ) : (
                  <div className="flex aspect-[1.6/1] w-full items-center justify-center bg-muted text-muted-foreground">
                    <BookImage className="h-7 w-7" />
                  </div>
                )}
                <CardContent className="space-y-1 p-3">
                  <p className="truncate font-medium" title={i.titulo}>{i.titulo}</p>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">{i.idioma}</span>
                    <Badge variant="outline">{i.status}</Badge>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
