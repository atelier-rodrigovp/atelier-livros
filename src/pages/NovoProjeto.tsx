import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Loader2, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { supabase, enqueueJob } from "@/lib/supabase";
import { IDIOMAS } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const SKILLS_ESCRITA = [
  { v: "", label: "Nenhuma — usar só o perfil de voz" },
  { v: "skill-dan-brown", label: "skill-dan-brown" },
  { v: "hoover-mcfadden", label: "hoover-mcfadden" },
  { v: "skill-jk-rowling", label: "skill-jk-rowling" },
  { v: "vesper-escritor-de-capitulos", label: "vesper-escritor-de-capitulos" },
];

const inputCls =
  "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

export default function NovoProjeto() {
  const nav = useNavigate();
  const [salvando, setSalvando] = useState(false);
  const [f, setF] = useState({
    titulo: "",
    genero: "",
    idioma_origem: "pt-BR",
    skill_escrita: "",
    ideia_central: "",
    prot_nome: "",
    prot_ferida: "",
    prot_segredo: "",
    prot_desejo: "",
    antagonista: "",
    tom: "",
    pdv: "",
    tempo_verbal: "",
    num_capitulos: "12",
    paginas_alvo: "200",
    meta_palavras: "",
    linha_tempo: "",
    final: "",
    canone: "",
    proibido: "",
    autor: "",
    piso_palavras: "1400",
    meta_nota: "9.0",
  });
  const set = (k: keyof typeof f, v: string) => setF((p) => ({ ...p, [k]: v }));

  async function criar(e: React.FormEvent) {
    e.preventDefault();
    if (f.titulo.trim().length < 2) {
      toast.error("Informe um título.");
      return;
    }
    setSalvando(true);
    const briefing = {
      ideia_central: f.ideia_central,
      genero: f.genero,
      protagonista: {
        nome: f.prot_nome,
        ferida: f.prot_ferida,
        segredo: f.prot_segredo,
        desejo: f.prot_desejo,
      },
      antagonista: f.antagonista,
      tom: f.tom,
      pdv: f.pdv,
      tempo_verbal: f.tempo_verbal,
      num_capitulos: Number(f.num_capitulos) || null,
      paginas_alvo: Number(f.paginas_alvo) || null,
      meta_palavras: Number(f.meta_palavras) || null,
      linha_tempo: f.linha_tempo,
      final: f.final,
      canone: f.canone,
      proibido: f.proibido,
      autor: f.autor,
      skill_escrita: f.skill_escrita || null,
    };
    const { data, error } = await supabase
      .from("projects")
      .insert({
        titulo: f.titulo.trim(),
        genero: f.genero || null,
        idioma_origem: f.idioma_origem,
        skill_escrita: f.skill_escrita || null,
        status: "rascunho",
        briefing,
        total_capitulos: Number(f.num_capitulos) || null,
        paginas_alvo: Number(f.paginas_alvo) || null,
        piso_palavras: Number(f.piso_palavras) || 1400,
        meta_nota: Number(f.meta_nota) || 9.0,
      })
      .select()
      .single();
    if (error) {
      setSalvando(false);
      toast.error(error.message);
      return;
    }
    try {
      await enqueueJob("criar_fundacao", {}, { project_id: data.id });
      toast.success("Projeto criado. Fundação enfileirada para o worker.");
      nav(`/projeto/${data.id}`);
    } catch (err) {
      toast.error("Projeto criado, mas falha ao enfileirar fundação: " + (err as Error).message);
      nav(`/projeto/${data.id}`);
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <button
        onClick={() => nav(-1)}
        className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Voltar
      </button>
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Novo projeto</h1>
        <p className="mt-1 text-muted-foreground">
          Preencha o briefing. Campos em branco viram suposições registradas pela
          IA na Bíblia da Obra. Ao concluir, a fundação é gerada pelo worker.
        </p>
      </div>

      <form onSubmit={criar} className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-xl">Identificação</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="titulo">Título *</Label>
              <Input id="titulo" value={f.titulo} onChange={(e) => set("titulo", e.target.value)} autoFocus />
            </div>
            <div className="space-y-2">
              <Label htmlFor="autor">Autor (grafia exata KDP)</Label>
              <Input id="autor" value={f.autor} onChange={(e) => set("autor", e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="genero">Gênero / subgênero</Label>
              <Input id="genero" value={f.genero} onChange={(e) => set("genero", e.target.value)} placeholder="thriller psicológico…" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="idioma">Idioma de origem</Label>
              <select id="idioma" className={inputCls} value={f.idioma_origem} onChange={(e) => set("idioma_origem", e.target.value)}>
                {IDIOMAS.map((i) => (
                  <option key={i} value={i}>{i}</option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="skill">Skill de escrita (estilo do Opus)</Label>
              <select id="skill" className={inputCls} value={f.skill_escrita} onChange={(e) => set("skill_escrita", e.target.value)}>
                {SKILLS_ESCRITA.map((s) => (
                  <option key={s.v} value={s.v}>{s.label}</option>
                ))}
              </select>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-xl">Premissa</CardTitle>
            <CardDescription>A história em essência.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="ideia">Ideia central</Label>
              <Textarea id="ideia" value={f.ideia_central} onChange={(e) => set("ideia_central", e.target.value)} rows={2} />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-xl">Personagens</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Protagonista — nome</Label>
              <Input value={f.prot_nome} onChange={(e) => set("prot_nome", e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Ferida</Label>
              <Input value={f.prot_ferida} onChange={(e) => set("prot_ferida", e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Segredo</Label>
              <Input value={f.prot_segredo} onChange={(e) => set("prot_segredo", e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Desejo ativo</Label>
              <Input value={f.prot_desejo} onChange={(e) => set("prot_desejo", e.target.value)} />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label>Antagonista</Label>
              <Textarea value={f.antagonista} onChange={(e) => set("antagonista", e.target.value)} rows={2} />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-xl">Voz & estrutura</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-2">
              <Label>Tom e voz</Label>
              <Input value={f.tom} onChange={(e) => set("tom", e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Ponto de vista</Label>
              <Input value={f.pdv} onChange={(e) => set("pdv", e.target.value)} placeholder="3ª próxima…" />
            </div>
            <div className="space-y-2">
              <Label>Tempo verbal</Label>
              <Input value={f.tempo_verbal} onChange={(e) => set("tempo_verbal", e.target.value)} placeholder="passado…" />
            </div>
            <div className="space-y-2">
              <Label>Nº de capítulos</Label>
              <Input type="number" value={f.num_capitulos} onChange={(e) => set("num_capitulos", e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Páginas-alvo</Label>
              <Input type="number" value={f.paginas_alvo} onChange={(e) => set("paginas_alvo", e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Meta de palavras</Label>
              <Input type="number" value={f.meta_palavras} onChange={(e) => set("meta_palavras", e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Piso de palavras/cap.</Label>
              <Input type="number" value={f.piso_palavras} onChange={(e) => set("piso_palavras", e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Meta de nota</Label>
              <Input type="number" step="0.1" value={f.meta_nota} onChange={(e) => set("meta_nota", e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Linha do tempo</Label>
              <Input value={f.linha_tempo} onChange={(e) => set("linha_tempo", e.target.value)} />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-xl">Final & cânone</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Final (ou sensação-alvo)</Label>
              <Input value={f.final} onChange={(e) => set("final", e.target.value)} />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Fixos (não mudar)</Label>
                <Textarea value={f.canone} onChange={(e) => set("canone", e.target.value)} rows={2} />
              </div>
              <div className="space-y-2">
                <Label>Proibido</Label>
                <Textarea value={f.proibido} onChange={(e) => set("proibido", e.target.value)} rows={2} />
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="flex justify-end">
          <Button type="submit" size="lg" disabled={salvando}>
            {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
            Criar projeto e gerar fundação
          </Button>
        </div>
      </form>
    </div>
  );
}
