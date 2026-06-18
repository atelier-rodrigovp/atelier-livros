import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { useSession } from "@/hooks/useSession";
import AppLayout from "@/components/layout/AppLayout";
import Login from "@/pages/Login";
import Dashboard from "@/pages/Dashboard";
import Configuracoes from "@/pages/Configuracoes";
import NovoProjeto from "@/pages/NovoProjeto";
import Projeto from "@/pages/Projeto";
import Catalogo from "@/pages/Catalogo";
import Vendas from "@/pages/Vendas";

function Carregando() {
  return (
    <div className="flex min-h-svh items-center justify-center">
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
    </div>
  );
}

export default function App() {
  const { session, carregando } = useSession();

  if (carregando) return <Carregando />;

  return (
    <BrowserRouter>
      {!session ? (
        <Routes>
          <Route path="*" element={<Login />} />
        </Routes>
      ) : (
        <Routes>
          <Route element={<AppLayout />}>
            <Route index element={<Dashboard />} />
            <Route path="catalogo" element={<Catalogo />} />
            <Route path="vendas" element={<Vendas />} />
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
