import { useState } from "react";
import { Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { novoProjetoSchema } from "@/lib/schemas";
import { IDIOMAS } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export function NewProjectDialog({ onCreated }: { onCreated?: () => void }) {
  const [open, setOpen] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [form, setForm] = useState({
    titulo: "",
    genero: "",
    idioma_origem: "pt-BR",
    piso_palavras: "1400",
    meta_nota: "9.0",
  });

  function set<K extends keyof typeof form>(k: K, v: string) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function criar(e: React.FormEvent) {
    e.preventDefault();
    const parsed = novoProjetoSchema.safeParse(form);
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "Dados inválidos");
      return;
    }
    setSalvando(true);
    const { genero, ...rest } = parsed.data;
    const { error } = await supabase.from("projects").insert({
      ...rest,
      genero: genero || null,
      status: "rascunho",
    });
    setSalvando(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Projeto criado");
    setOpen(false);
    setForm({
      titulo: "",
      genero: "",
      idioma_origem: "pt-BR",
      piso_palavras: "1400",
      meta_nota: "9.0",
    });
    onCreated?.();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="h-4 w-4" />
          Novo projeto
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Novo projeto</DialogTitle>
          <DialogDescription>
            Crie o registro da obra. O briefing completo e a fundação vêm na
            tela do projeto (FASE 1).
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={criar} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="titulo">Título</Label>
            <Input
              id="titulo"
              value={form.titulo}
              onChange={(e) => set("titulo", e.target.value)}
              placeholder="Ex.: O Enigma do Farol"
              autoFocus
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="genero">Gênero</Label>
              <Input
                id="genero"
                value={form.genero}
                onChange={(e) => set("genero", e.target.value)}
                placeholder="Thriller, romance…"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="idioma">Idioma de origem</Label>
              <select
                id="idioma"
                value={form.idioma_origem}
                onChange={(e) => set("idioma_origem", e.target.value)}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {IDIOMAS.map((i) => (
                  <option key={i} value={i}>
                    {i}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="piso">Piso de palavras/cap.</Label>
              <Input
                id="piso"
                type="number"
                value={form.piso_palavras}
                onChange={(e) => set("piso_palavras", e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="meta">Meta de nota</Label>
              <Input
                id="meta"
                type="number"
                step="0.1"
                value={form.meta_nota}
                onChange={(e) => set("meta_nota", e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="submit" disabled={salvando}>
              {salvando && <Loader2 className="h-4 w-4 animate-spin" />}
              Criar projeto
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
