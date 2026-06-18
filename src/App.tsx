import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { useSession } from "@/hooks/useSession";
import AppLayout from "@/components/layout/AppLayout";
import Login from "@/pages/Login";
import Dashboard from "@/pages/Dashboard";
import Configuracoes from "@/pages/Configuracoes";
import { Placeholder } from "@/pages/Placeholder";

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
            <Route
              path="catalogo"
              element={<Placeholder titulo="Catálogo" fase="FASE 3" />}
            />
            <Route
              path="vendas"
              element={<Placeholder titulo="Vendas" fase="FASE 4" />}
            />
            <Route path="configuracoes" element={<Configuracoes />} />
            <Route
              path="novo-projeto"
              element={<Placeholder titulo="Novo projeto" fase="FASE 1" />}
            />
            <Route
              path="projeto/:id"
              element={<Placeholder titulo="Projeto" fase="FASE 1" />}
            />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      )}
    </BrowserRouter>
  );
}
