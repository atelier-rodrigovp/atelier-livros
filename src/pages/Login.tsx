import { useState } from "react";
import { BookMarked, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { loginSchema } from "@/lib/schemas";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ThemeToggle } from "@/components/theme-toggle";

export default function Login() {
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [enviando, setEnviando] = useState(false);

  async function entrarComSenha(e: React.FormEvent) {
    e.preventDefault();
    const parsed = loginSchema.safeParse({ email, senha });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "Dados inválidos");
      return;
    }
    setEnviando(true);
    const { error } = await supabase.auth.signInWithPassword({
      email: parsed.data.email,
      password: parsed.data.senha,
    });
    setEnviando(false);
    if (error) toast.error(error.message);
  }

  async function enviarMagicLink() {
    const parsed = loginSchema.shape.email.safeParse(email);
    if (!parsed.success) {
      toast.error("Informe um e-mail válido para o magic link");
      return;
    }
    setEnviando(true);
    const { error } = await supabase.auth.signInWithOtp({
      email: parsed.data,
      options: { emailRedirectTo: window.location.origin },
    });
    setEnviando(false);
    if (error) toast.error(error.message);
    else toast.success("Link enviado. Confira seu e-mail.");
  }

  return (
    <div className="relative flex min-h-svh items-center justify-center bg-background px-4">
      <div className="absolute right-4 top-4">
        <ThemeToggle />
      </div>
      <Card className="w-full max-w-sm animate-fade-in">
        <CardHeader className="space-y-3 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <BookMarked className="h-6 w-6" />
          </div>
          <div>
            <CardTitle className="text-3xl">Atelier de Livros</CardTitle>
            <CardDescription className="mt-1">
              Painel de produção editorial com IA
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <form onSubmit={entrarComSenha} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">E-mail</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="voce@exemplo.com"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="senha">Senha</Label>
              <Input
                id="senha"
                type="password"
                autoComplete="current-password"
                value={senha}
                onChange={(e) => setSenha(e.target.value)}
                placeholder="••••••••"
              />
            </div>
            <Button type="submit" className="w-full" disabled={enviando}>
              {enviando && <Loader2 className="h-4 w-4 animate-spin" />}
              Entrar
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="w-full"
              disabled={enviando}
              onClick={enviarMagicLink}
            >
              Enviar magic link
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
