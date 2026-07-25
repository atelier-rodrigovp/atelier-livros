import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AlertTriangle, Loader2 } from "lucide-react";
import { useSession } from "@/hooks/useSession";
import AppLayout from "@/components/layout/AppLayout";
import Login from "@/pages/Login";
import Dashboard from "@/pages/Dashboard";
import Configuracoes from "@/pages/Configuracoes";
import NovoProjeto from "@/pages/NovoProjeto";
import Projeto from "@/pages/Projeto";
import Leitor from "@/pages/Leitor";
import Catalogo from "@/pages/Catalogo";
import Autores from "@/pages/Autores";
import Autor from "@/pages/Autor";
import Vendas from "@/pages/Vendas";
import Observabilidade from "@/pages/Observabilidade";
import Laboratorio from "@/pages/Laboratorio";
import { supabaseConfigured } from "@/lib/supabase";

function Carregando() {
  return (
    <div className="flex min-h-svh items-center justify-center">
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
    </div>
  );
}

function ConfiguracaoAusente() {
  return (
    <main className="flex min-h-svh items-center justify-center bg-background px-4">
      <section className="w-full max-w-lg rounded-xl border border-amber-500/40 bg-card p-6 shadow-sm">
        <AlertTriangle className="h-6 w-6 text-amber-700 dark:text-amber-400" />
        <h1 className="mt-4 text-2xl font-semibold">Configuração do painel ausente</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Defina <code>VITE_SUPABASE_URL</code> e <code>VITE_SUPABASE_ANON_KEY</code> no ambiente
          do frontend e reinicie a aplicação. Nenhum projeto foi alterado.
        </p>
      </section>
    </main>
  );
}

export default function App() {
  const { session, carregando } = useSession();

  if (!supabaseConfigured) return <ConfiguracaoAusente />;
  if (carregando) return <Carregando />;

  return (
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      {!session ? (
        <Routes>
          <Route path="*" element={<Login />} />
        </Routes>
      ) : (
        <Routes>
          <Route path="projeto/:id/ler" element={<Leitor />} />
          <Route element={<AppLayout />}>
            <Route index element={<Dashboard />} />
            <Route path="catalogo" element={<Catalogo />} />
            <Route path="autores" element={<Autores />} />
            <Route path="autores/:id" element={<Autor />} />
            <Route path="vendas" element={<Vendas />} />
            <Route path="observabilidade" element={<Observabilidade />} />
            <Route path="laboratorio" element={<Laboratorio />} />
            <Route path="configuracoes" element={<Configuracoes />} />
            <Route path="novo-projeto" element={<NovoProjeto />} />
            <Route path="projeto/:id" element={<Projeto />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      )}
    </BrowserRouter>
  );
}
