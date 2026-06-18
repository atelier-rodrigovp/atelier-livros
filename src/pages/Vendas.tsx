import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Loader2, Upload } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { normalizaData, parseKdpCsv } from "@/lib/kdpCsv";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

interface Row {
  data: string | null;
  marketplace: string | null;
  idioma: string | null;
  unidades: number | null;
  royalty: number | null;
  moeda: string | null;
}

const CORES = ["#a8531f", "#c98a3a", "#6b7f6e", "#7a6a8a", "#4a6b8a", "#9a4a4a"];

function agrupa(rows: Row[], chave: (r: Row) => string | null) {
  const m = new Map<string, { unidades: number; royalty: number }>();
  for (const r of rows) {
    const k = chave(r) || "—";
    const cur = m.get(k) ?? { unidades: 0, royalty: 0 };
    cur.unidades += r.unidades ?? 0;
    cur.royalty += r.royalty ?? 0;
    m.set(k, cur);
  }
  return [...m.entries()].map(([nome, v]) => ({ nome, ...v, royalty: Number(v.royalty.toFixed(2)) }));
}

export default function Vendas() {
  const [rows, setRows] = useState<Row[]>([]);
  const [importando, setImportando] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const carregar = useCallback(async () => {
    const { data } = await supabase
      .from("sales_rows")
      .select("data,marketplace,idioma,unidades,royalty,moeda");
    setRows((data as Row[]) ?? []);
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportando(true);
    try {
      const text = await file.text();
      const parsed = parseKdpCsv(text);
      if (!parsed.length) {
        toast.error("Nenhuma linha de venda reconhecida no CSV.");
        return;
      }
      const { data: imp, error: e1 } = await supabase
        .from("sales_imports")
        .insert({ arquivo: file.name, periodo: new Date().toISOString().slice(0, 7) })
        .select()
        .single();
      if (e1) throw e1;
      const payload = parsed.map((r) => ({
        import_id: imp.id,
        data: normalizaData(r.data),
        marketplace: r.marketplace,
        idioma: r.idioma,
        unidades: r.unidades,
        royalty: r.royalty,
        moeda: r.moeda,
      }));
      const { error: e2 } = await supabase.from("sales_rows").insert(payload);
      if (e2) throw e2;
      toast.success(`${payload.length} linhas importadas.`);
      carregar();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setImportando(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  const porMes = useMemo(() => agrupa(rows, (r) => (r.data ? r.data.slice(0, 7) : null)).sort((a, b) => a.nome.localeCompare(b.nome)), [rows]);
  const porMkt = useMemo(() => agrupa(rows, (r) => r.marketplace), [rows]);
  const porIdioma = useMemo(() => agrupa(rows, (r) => r.idioma), [rows]);
  const totUn = rows.reduce((s, r) => s + (r.unidades ?? 0), 0);
  const totRoy = rows.reduce((s, r) => s + (r.royalty ?? 0), 0);

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Vendas</h1>
          <p className="mt-1 text-muted-foreground">Importe relatórios CSV do KDP e acompanhe os dashboards.</p>
        </div>
        <div>
          <input ref={inputRef} type="file" accept=".csv,text/csv" className="hidden" onChange={onFile} />
          <Button onClick={() => inputRef.current?.click()} disabled={importando}>
            {importando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            Importar CSV KDP
          </Button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Unidades" valor={totUn.toLocaleString("pt-BR")} />
        <Stat label="Royalties" valor={totRoy.toLocaleString("pt-BR", { minimumFractionDigits: 2 })} />
        <Stat label="Marketplaces" valor={String(porMkt.length)} />
        <Stat label="Linhas" valor={String(rows.length)} />
      </div>

      {rows.length === 0 ? (
        <Card><CardContent className="py-12 text-center text-muted-foreground">
          Nenhuma venda importada. Baixe o relatório no KDP e importe o CSV acima.
        </CardContent></Card>
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader><CardTitle className="text-lg">Royalties por mês</CardTitle></CardHeader>
            <CardContent className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={porMes}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="nome" fontSize={12} />
                  <YAxis fontSize={12} />
                  <Tooltip />
                  <Bar dataKey="royalty" fill="#a8531f" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle className="text-lg">Unidades por mês</CardTitle></CardHeader>
            <CardContent className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={porMes}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="nome" fontSize={12} />
                  <YAxis fontSize={12} />
                  <Tooltip />
                  <Bar dataKey="unidades" fill="#6b7f6e" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle className="text-lg">Royalties por marketplace</CardTitle></CardHeader>
            <CardContent className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={porMkt} dataKey="royalty" nameKey="nome" outerRadius={90} label>
                    {porMkt.map((_, i) => <Cell key={i} fill={CORES[i % CORES.length]} />)}
                  </Pie>
                  <Tooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle className="text-lg">Unidades por idioma</CardTitle></CardHeader>
            <CardContent className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={porIdioma} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis type="number" fontSize={12} />
                  <YAxis type="category" dataKey="nome" fontSize={12} width={70} />
                  <Tooltip />
                  <Bar dataKey="unidades" fill="#7a6a8a" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

function Stat({ label, valor }: { label: string; valor: string }) {
  return (
    <Card>
      <CardHeader className="pb-2"><CardDescription>{label}</CardDescription></CardHeader>
      <CardContent><p className="font-serif text-3xl font-semibold">{valor}</p></CardContent>
    </Card>
  );
}
