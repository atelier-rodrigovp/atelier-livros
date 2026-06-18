import { NavLink, Outlet } from "react-router-dom";
import {
  BookMarked,
  LayoutDashboard,
  Library,
  LineChart,
  Settings,
  LogOut,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import { useSession } from "@/hooks/useSession";
import { useWorkerStatus } from "@/hooks/useWorkerStatus";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const nav = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, end: true },
  { to: "/catalogo", label: "Catálogo", icon: Library },
  { to: "/vendas", label: "Vendas", icon: LineChart },
  { to: "/configuracoes", label: "Configurações", icon: Settings },
];

function WorkerIndicator() {
  const { online } = useWorkerStatus();
  return (
    <div className="flex items-center gap-2 text-xs text-muted-foreground">
      <span
        className={cn(
          "inline-block h-2 w-2 rounded-full",
          online ? "bg-emerald-500" : "bg-muted-foreground/40"
        )}
        aria-hidden
      />
      Worker {online ? "online" : "offline"}
    </div>
  );
}

export default function AppLayout() {
  const { session } = useSession();
  const email = session?.user?.email ?? "";

  return (
    <div className="grid min-h-svh grid-cols-1 md:grid-cols-[16rem_1fr]">
      <aside className="hidden border-r bg-card/40 md:flex md:flex-col">
        <div className="flex h-16 items-center gap-2 border-b px-6">
          <BookMarked className="h-5 w-5 text-primary" />
          <span className="font-serif text-lg font-semibold">Atelier</span>
        </div>
        <nav className="flex-1 space-y-1 p-3">
          {nav.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                  isActive
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                )
              }
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="border-t p-4">
          <WorkerIndicator />
        </div>
      </aside>

      <div className="flex min-w-0 flex-col">
        <header className="flex h-16 items-center justify-between border-b px-4 md:px-8">
          <div className="md:hidden">
            <WorkerIndicator />
          </div>
          <div className="ml-auto flex items-center gap-2">
            <ThemeToggle />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="max-w-[14rem]">
                  <span className="truncate">{email || "Conta"}</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel className="truncate">
                  {email}
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => supabase.auth.signOut()}>
                  <LogOut className="h-4 w-4" />
                  Sair
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>
        <main className="flex-1 px-4 py-6 md:px-8 md:py-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
