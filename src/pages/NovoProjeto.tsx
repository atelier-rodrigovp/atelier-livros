import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Check, Loader2, Sparkles, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { supabase, enqueueJob } from "@/lib/supabase";
import { cn } from "@/lib/utils";
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

interface Pergunta {
  campo: string;
  pergunta: string;
  opcoes: string[];
  recomendada?: string;
  porque?: string;
  multipla?: boolean;
}

export default function NovoProjeto() {
  const nav = useNavigate();
  const [fase, setFase] = useState<"ideia" | "entrevista">("ideia");
  const [titulo, setTitulo] = useState("");
  const [ideia, setIdeia] = useState("");
  const [iniciando, setIniciando] = useState(false);

  const [projectId, setProjectId] = useState<string | null>(null);
  const [pendentes, setPendentes] = useState<Pergunta[]>([]);
  const [respostas, setRespostas] = useState<Record<string, string>>({});
  const [turno, setTurno] = useState(0); // nº de blocos já respondidos
  const [pensando, setPensando] = useState(false);
  const qaRef = useRef<any[]>([]);

  // Lê o estado da entrevista do projeto e reage.
  const sincronizar = useCallback(
    async (id: string) => {
      const { data } = await supabase
        .from("projects")
        .select("briefing")
        .eq("id", id)
        .single();
      const b: any = data?.briefing || {};
      qaRef.current = Array.isArray(b.qa) ? b.qa : [];
      const itv = b._interview || {};
      if (itv.completo) {
        toast.success("Fundação validada! Gerando…");
        nav(`/projeto/${id}`);
        return;
      }
      const pend: Pergunta[] = Array.isArray(itv.pending) ? itv.pending : [];
      if (pend.length) {
        setPendentes(pend);
        setRespostas(
          Object.fromEntries(pend.map((p) => [p.campo, p.recomendada ?? p.opcoes?.[0] ?? ""]))
        );
        setPensando(false);
      } else {
        // sem perguntas e não concluído => worker ainda processando
        setPendentes([]);
        setPensando(true);
      }
    },
    [nav]
  );

  useEffect(() => {
    if (!projectId) return;
    sincronizar(projectId);
    const ch = supabase
      .channel(`novo-${projectId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "projects", filter: `id=eq.${projectId}` },
        () => sincronizar(projectId)
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [projectId, sincronizar]);

  async function comecar(e: React.FormEvent) {
    e.preventDefault();
    if (ideia.trim().length < 10) {
      toast.error("Descreva sua ideia em pelo menos uma frase.");
      return;
    }
    setIniciando(true);
    const tituloFinal = titulo.trim() || ideia.trim().split(/[.\n]/)[0].slice(0, 80);
    const { data, error } = await supabase
      .from("projects")
      .insert({
        titulo: tituloFinal,
        status: "rascunho",
        briefing: { ideia_central: ideia.trim(), idea: ideia.trim(), qa: [] },
      })
      .select()
      .single();
    if (error) {
      setIniciando(false);
      toast.error(error.message);
      return;
    }
    try {
      await enqueueJob("entrevistar", {}, { project_id: data.id });
    } catch (err) {
      toast.error((err as Error).message);
    }
    setProjectId(data.id);
    setFase("entrevista");
    setPensando(true);
    setIniciando(false);
  }

  async function responder() {
    if (!projectId) return;
    const novasQa = [
      ...qaRef.current,
      ...pendentes.map((p) => ({
        campo: p.campo,
        pergunta: p.pergunta,
        resposta: respostas[p.campo] ?? "",
      })),
    ];
    setPensando(true);
    setPendentes([]);
    const { data } = await supabase
      .from("projects")
      .select("briefing")
      .eq("id", projectId)
      .single();
    const b: any = data?.briefing || {};
    const merged = { ...b, qa: novasQa, _interview: { completo: false, pending: [] } };
    const { error } = await supabase
      .from("projects")
      .update({ briefing: merged })
      .eq("id", projectId);
    if (error) {
      toast.error(error.message);
      return;
    }
    qaRef.current = novasQa;
    setTurno((t) => t + 1);
    try {
      await enqueueJob("entrevistar", {}, { project_id: projectId });
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  // ----- FASE 1: ideia única -----
  if (fase === "ideia") {
    return (
      <div className="mx-auto max-w-2xl space-y-6">
        <button
          onClick={() => nav(-1)}
          className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Voltar
        </button>
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Novo projeto</h1>
          <p className="mt-1 text-muted-foreground">
            Comece com uma ideia. O arquiteto-de-enredo conduz uma entrevista
            curta (perguntas com recomendação), valida a fundação e gera tudo.
          </p>
        </div>
        <Card>
          <CardHeader>
            <CardTitle className="text-xl">Sua ideia</CardTitle>
            <CardDescription>
              Uma a três frases sobre a história. O resto vem na entrevista.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={comecar} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="titulo">Título provisório (opcional)</Label>
                <Input
                  id="titulo"
                  value={titulo}
                  onChange={(e) => setTitulo(e.target.value)}
                  placeholder="Pode deixar a IA sugerir"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="ideia">Ideia central *</Label>
                <Textarea
                  id="ideia"
                  value={ideia}
                  onChange={(e) => setIdeia(e.target.value)}
                  rows={5}
                  autoFocus
                  placeholder="Ex.: Numa vila costeira, a faroleira descobre que a luz do farol esconde um código que prevê naufrágios — e alguém quer apagá-la."
                />
              </div>
              <div className="flex justify-end">
                <Button type="submit" size="lg" disabled={iniciando}>
                  {iniciando ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Wand2 className="h-4 w-4" />
                  )}
                  Começar entrevista
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ----- FASE 2: entrevista guiada -----
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Entrevista</h1>
        <p className="mt-1 text-muted-foreground">
          O arquiteto-de-enredo está montando sua fundação. Responda (as
          recomendações já vêm marcadas) — bloco {turno + 1}.
        </p>
      </div>

      {pensando || !pendentes.length ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-16 text-center text-muted-foreground">
            <Loader2 className="h-7 w-7 animate-spin text-primary" />
            <p>
              {turno === 0
                ? "Analisando sua ideia e preparando as primeiras perguntas…"
                : "Validando suas respostas e preparando o próximo bloco…"}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-5">
          {pendentes.map((p) => (
            <Card key={p.campo}>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">{p.pergunta}</CardTitle>
                {p.porque && (
                  <CardDescription>💡 {p.porque}</CardDescription>
                )}
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex flex-wrap gap-2">
                  {p.opcoes?.map((opt) => {
                    const sel = respostas[p.campo] === opt;
                    const rec = p.recomendada === opt;
                    return (
                      <button
                        key={opt}
                        type="button"
                        onClick={() =>
                          setRespostas((r) => ({ ...r, [p.campo]: opt }))
                        }
                        className={cn(
                          "flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition-colors",
                          sel
                            ? "border-primary bg-primary/10 text-primary"
                            : "hover:bg-accent"
                        )}
                      >
                        {sel && <Check className="h-3.5 w-3.5" />}
                        {opt}
                        {rec && (
                          <span className="ml-1 rounded-full bg-primary/15 px-1.5 text-[10px] font-medium text-primary">
                            recomendado
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">
                    Ou escreva sua própria resposta
                  </Label>
                  <Input
                    value={
                      p.opcoes?.includes(respostas[p.campo]) ? "" : respostas[p.campo] ?? ""
                    }
                    onChange={(e) =>
                      setRespostas((r) => ({ ...r, [p.campo]: e.target.value }))
                    }
                    placeholder="Resposta livre (substitui a opção)"
                  />
                </div>
              </CardContent>
            </Card>
          ))}
          <div className="flex justify-end">
            <Button size="lg" onClick={responder}>
              <Sparkles className="h-4 w-4" />
              Responder e continuar
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
