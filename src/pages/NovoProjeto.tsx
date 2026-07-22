import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft, Check, Loader2, Plus, Sparkles, Trash2, Wand2 } from "lucide-react";
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
import contratoDanBrown from "../../worker/skills-v2/dan-brown/contrato.json";
import contratoHoover from "../../worker/skills-v2/hoover-mcfadden/contrato.json";
import contratoRomantasy from "../../worker/skills-v2/romantasy/contrato.json";

// Comparação de estilos (contratos das skills V2), em linguagem simples.
const CONTRATOS = [contratoDanBrown, contratoHoover, contratoRomantasy];
const FAMILIA_SIMPLES: Record<string, string> = {
  thriller_enigma: "Thriller de enigma e conspiração",
  suspense_intimista: "Suspense intimista em primeira pessoa",
  romantasy: "Fantasia romântica (romantasy)",
};
const RELACAO_SIMPLES: Record<string, string> = {
  acao_dominante: "A ação comanda — a emoção aparece em escolhas e gestos, curta e certeira.",
  interioridade_dominante: "O sentimento comanda — a narradora vive tudo por dentro, na primeira pessoa.",
  equilibrio: "Emoção e ação andam juntas — o desejo corre por baixo de cada cena.",
};

// Skill do contrato V2 → skill_escrita da V1 (é essa que o worker resolve em ~/.claude/skills/).
const SKILL_V1_MAP: Record<string, string> = {
  "dan-brown": "skill-dan-brown",
  "hoover-mcfadden": "hoover-mcfadden",
  romantasy: "skill-romantasy",
};
const SKILL_ID_REVERSO: Record<string, string> = Object.fromEntries(
  Object.entries(SKILL_V1_MAP).map(([id, v1]) => [v1, id])
);

// Estimativa de palavras + validação de nº de capítulos contra o contrato escolhido.
function validarCapitulos(
  n: number,
  contrato?: (typeof CONTRATOS)[number]
): { erro: string | null; palavras: number | null } {
  const erro =
    !Number.isFinite(n) || n < 12 || n > 100
      ? "O número de capítulos precisa ficar entre 12 e 100."
      : null;
  const palavras = contrato ? n * contrato.faixa_palavras.alvo : null;
  return { erro, palavras };
}

// Avisos não bloqueantes: exigências estruturais do contrato escolhido.
function avisosContrato(c: (typeof CONTRATOS)[number]): string[] {
  const avisos: string[] = [];
  const rot = (c.pov as { rotacao?: { fios_min: number; fios_max: number } }).rotacao;
  avisos.push(
    rot
      ? `Esta skill exige ${rot.fios_min}–${rot.fios_max} fios narrativos em rotação.`
      : "Esta skill usa POV único, sem rotação de fios."
  );
  if (c.estruturas_exigidas?.docs?.length) {
    avisos.push(`A fundação vai gerar: ${c.estruturas_exigidas.docs.join(", ")}.`);
  }
  return avisos;
}

function ComparadorEstilos({
  selecionavel = false,
  selecionado,
  onSelecionar,
}: {
  selecionavel?: boolean;
  selecionado?: string | null;
  onSelecionar?: (id: string) => void;
}) {
  const grade = (
    <div className="grid grid-cols-1 gap-4 border-t p-4 sm:grid-cols-3">
      {CONTRATOS.map((c) => {
        const sel = selecionavel && selecionado === c.id;
        return (
          <div
            key={c.id}
            role={selecionavel ? "button" : undefined}
            tabIndex={selecionavel ? 0 : undefined}
            onClick={selecionavel ? () => onSelecionar?.(c.id) : undefined}
            onKeyDown={
              selecionavel
                ? (e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      onSelecionar?.(c.id);
                    }
                  }
                : undefined
            }
            className={cn(
              "space-y-2.5 rounded-lg border p-3 text-sm transition-colors",
              selecionavel && "cursor-pointer hover:border-primary/50",
              sel && "border-primary bg-primary/5"
            )}
          >
            <div className="flex items-center justify-between gap-2">
              <p className="font-serif font-semibold leading-snug">{c.nome}</p>
              {sel && <Check className="h-4 w-4 shrink-0 text-primary" />}
            </div>
            <p className="text-xs text-muted-foreground">
              {FAMILIA_SIMPLES[c.familia_editorial] ?? c.familia_editorial}
            </p>
            <div>
              <p className="text-xs font-medium">Motor da história</p>
              <p className="text-xs text-muted-foreground">{c.motor_narrativo}</p>
            </div>
            <div>
              <p className="text-xs font-medium">Ação × emoção</p>
              <p className="text-xs text-muted-foreground">
                {RELACAO_SIMPLES[c.acao_interioridade.relacao] ?? c.acao_interioridade.relacao}
              </p>
            </div>
            <div>
              <p className="text-xs font-medium">O que esse estilo garante</p>
              <ul className="list-disc space-y-0.5 pl-4 text-xs text-muted-foreground">
                {c.testes_positivos.slice(0, 2).map((t, i) => (
                  <li key={i}>{t}</li>
                ))}
              </ul>
            </div>
            <p className="text-xs text-muted-foreground">
              Capítulos de {c.faixa_palavras.min.toLocaleString("pt-BR")} a{" "}
              {c.faixa_palavras.max.toLocaleString("pt-BR")} palavras (alvo{" "}
              {c.faixa_palavras.alvo.toLocaleString("pt-BR")}).
            </p>
          </div>
        );
      })}
    </div>
  );

  if (!selecionavel) {
    return (
      <details className="rounded-xl border bg-card">
        <summary className="cursor-pointer select-none px-4 py-3 text-sm font-medium">
          Comparar estilos de escrita
        </summary>
        {grade}
      </details>
    );
  }

  return (
    <div className="rounded-xl border bg-card">
      <p className="px-4 py-3 text-sm font-medium">Escolha a skill de escrita *</p>
      {grade}
    </div>
  );
}

// Engine V2 vs V1 — dois cards de escolha, V2 recomendada por padrão.
function EscolhaEngine({
  valor,
  onChange,
}: {
  valor: "v2" | "v1";
  onChange: (v: "v2" | "v1") => void;
}) {
  const opcoes = [
    {
      id: "v2" as const,
      titulo: "Engine V2 (recomendada)",
      desc: "Papéis separados com auditoria por hash e contratos de estilo versionados.",
    },
    {
      id: "v1" as const,
      titulo: "Engine clássica (V1)",
      desc: "Pipeline clássico de escrita, sem separação de papéis por hash.",
    },
  ];
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {opcoes.map((op) => {
        const sel = valor === op.id;
        return (
          <button
            key={op.id}
            type="button"
            onClick={() => onChange(op.id)}
            className={cn(
              "rounded-xl border p-4 text-left text-sm transition-colors",
              sel ? "border-primary bg-primary/5" : "hover:bg-accent"
            )}
          >
            <span className="flex items-center gap-1.5 font-medium">
              {sel && <Check className="h-3.5 w-3.5 text-primary" />}
              {op.titulo}
            </span>
            <p className="mt-1 text-xs text-muted-foreground">{op.desc}</p>
          </button>
        );
      })}
    </div>
  );
}

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
  const [params, setParams] = useSearchParams();
  // Retomada por URL: ?projeto=<id> sobrevive a refresh e permite voltar do Dashboard.
  const projetoParam = params.get("projeto");
  const [fase, setFase] = useState<"ideia" | "canario" | "entrevista">(
    projetoParam ? "entrevista" : "ideia"
  );
  const [titulo, setTitulo] = useState("");
  const [ideia, setIdeia] = useState("");
  const [iniciando, setIniciando] = useState(false);

  // Engine V2: escolha de engine/skill/capítulos/decisões, feita na fase "ideia".
  const [engineEscolhida, setEngineEscolhida] = useState<"v2" | "v1">("v2");
  const [skillEscolhida, setSkillEscolhida] = useState<string | null>(null);
  const [totalCapitulos, setTotalCapitulos] = useState(40);
  const [decisoesAutor, setDecisoesAutor] = useState<string[]>([]);
  const [novaDecisao, setNovaDecisao] = useState("");

  // Canário de voz (fase "canario", só engine V2).
  const [canarioJobId, setCanarioJobId] = useState<string | null>(null);
  const [canarioTexto, setCanarioTexto] = useState<string | null>(null);
  const [canarioErro, setCanarioErro] = useState<string | null>(null);
  const [gerandoCanario, setGerandoCanario] = useState(false);
  const [trocandoSkill, setTrocandoSkill] = useState(false);

  const [projectId, setProjectId] = useState<string | null>(projetoParam);
  const [pendentes, setPendentes] = useState<Pergunta[]>([]);
  const [respostas, setRespostas] = useState<Record<string, string>>({});
  const [turno, setTurno] = useState(0); // nº de blocos já respondidos
  const [pensando, setPensando] = useState(false);
  const [enviando, setEnviando] = useState(false);
  // Falha visível + retomável: enqueue falho ou job de entrevista com erro não
  // podem virar spinner eterno.
  const [erroFluxo, setErroFluxo] = useState<string | null>(null);
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
        setErroFluxo(null);
        return;
      }
      // Sem perguntas e não concluído: distinguir "worker processando" de "job com erro".
      const { data: js } = await supabase
        .from("jobs")
        .select("status,erro,created_at")
        .eq("project_id", id)
        .eq("tipo", "entrevistar")
        .order("created_at", { ascending: false })
        .limit(1);
      const j: any = js?.[0];
      if (j?.status === "error" || j?.status === "paused") {
        setPendentes([]);
        setPensando(false);
        setErroFluxo(j.erro || "A entrevista falhou no worker. Tente novamente.");
        return;
      }
      if (!j) {
        // projeto existe mas nenhum job de entrevista foi enfileirado (enqueue falhou)
        setPendentes([]);
        setPensando(false);
        setErroFluxo("A entrevista ainda não foi agendada (falha ao criar o job). Tente novamente.");
        return;
      }
      setPendentes([]);
      setPensando(true);
      setErroFluxo(null);
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
    // Fallback do Realtime: evento perdido não pode congelar a entrevista.
    const poll = setInterval(() => sincronizar(projectId), 12_000);
    return () => {
      supabase.removeChannel(ch);
      clearInterval(poll);
    };
  }, [projectId, sincronizar]);

  async function agendarEntrevista(id: string) {
    try {
      await enqueueJob("entrevistar", {}, { project_id: id });
      setPensando(true);
      setErroFluxo(null);
    } catch (err) {
      setPensando(false);
      setErroFluxo(`Falha ao agendar a entrevista: ${(err as Error).message}`);
    }
  }

  // Retomada por URL: projeto V2 sem canário aprovado volta para a fase do canário
  // (não direto pra entrevista). Roda uma única vez, na montagem.
  useEffect(() => {
    if (!projetoParam) return;
    (async () => {
      const { data } = await supabase
        .from("projects")
        .select("engine_mode,skill_escrita,total_capitulos,briefing")
        .eq("id", projetoParam)
        .maybeSingle();
      if (!data) return;
      const b: any = data.briefing || {};
      if ((data as any).engine_mode === "v2" && !b.canario_voz?.aprovado) {
        setEngineEscolhida("v2");
        const skillId = data.skill_escrita ? SKILL_ID_REVERSO[data.skill_escrita] : undefined;
        if (skillId) setSkillEscolhida(skillId);
        if (data.total_capitulos) setTotalCapitulos(data.total_capitulos);
        setFase("canario");
      }
    })();
  }, [projetoParam]);

  // Gera (ou regenera, ao trocar de skill) o canário de voz do projeto já criado.
  async function gerarCanario(id: string, skillId: string) {
    setGerandoCanario(true);
    setCanarioErro(null);
    setCanarioTexto(null);
    try {
      const skillV1 = SKILL_V1_MAP[skillId];
      const { error: errUpd } = await supabase
        .from("projects")
        .update({ skill_escrita: skillV1 })
        .eq("id", id);
      if (errUpd) throw errUpd;
      const job = await enqueueJob("canario_voz", { skill_escrita: skillV1 }, { project_id: id });
      setCanarioJobId(job.id);
    } catch (err) {
      setCanarioErro(`Falha ao agendar o canário de voz: ${(err as Error).message}`);
    } finally {
      setGerandoCanario(false);
    }
  }

  // Poll/Realtime do job do canário — mesmo padrão da entrevista acima.
  useEffect(() => {
    if (!canarioJobId) return;
    let ativo = true;
    async function verificar() {
      const { data } = await supabase
        .from("jobs")
        .select("status,erro,progresso")
        .eq("id", canarioJobId!)
        .maybeSingle();
      if (!ativo || !data) return;
      if (data.status === "error" || data.status === "paused") {
        setCanarioErro(data.erro || "O canário de voz falhou no worker.");
        return;
      }
      if (data.status === "done") {
        const c = (data.progresso as any)?.canario_voz;
        if (c?.texto) {
          setCanarioTexto(c.texto);
        } else {
          setCanarioErro(
            "O job terminou, mas não encontrei o texto do canário em progresso.canario_voz."
          );
        }
      }
    }
    verificar();
    const ch = supabase
      .channel(`canario-${canarioJobId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "jobs", filter: `id=eq.${canarioJobId}` },
        verificar
      )
      .subscribe();
    const poll = setInterval(verificar, 8_000);
    return () => {
      ativo = false;
      supabase.removeChannel(ch);
      clearInterval(poll);
    };
  }, [canarioJobId]);

  async function aprovarCanario() {
    if (!projectId || !skillEscolhida) return;
    const { data } = await supabase
      .from("projects")
      .select("briefing")
      .eq("id", projectId)
      .single();
    const b: any = data?.briefing || {};
    const merged = {
      ...b,
      canario_voz: {
        aprovado: true,
        skill: skillEscolhida,
        em: new Date().toISOString(),
        job_id: canarioJobId,
      },
    };
    const { error } = await supabase
      .from("projects")
      .update({ briefing: merged })
      .eq("id", projectId);
    if (error) {
      toast.error(error.message);
      return;
    }
    setFase("entrevista");
    await agendarEntrevista(projectId);
  }

  function adicionarDecisao() {
    const t = novaDecisao.trim();
    if (!t) return;
    setDecisoesAutor((d) => [...d, t]);
    setNovaDecisao("");
  }
  function removerDecisao(i: number) {
    setDecisoesAutor((d) => d.filter((_, idx) => idx !== i));
  }

  async function comecar(e: React.FormEvent) {
    e.preventDefault();
    if (ideia.trim().length < 10) {
      toast.error("Descreva sua ideia em pelo menos uma frase.");
      return;
    }
    let contratoSel: (typeof CONTRATOS)[number] | undefined;
    if (engineEscolhida === "v2") {
      contratoSel = CONTRATOS.find((c) => c.id === skillEscolhida);
      if (!contratoSel) {
        toast.error("Escolha uma skill de escrita para a Engine V2.");
        return;
      }
      const { erro } = validarCapitulos(totalCapitulos, contratoSel);
      if (erro) {
        toast.error(erro);
        return;
      }
    }
    setIniciando(true);
    const tituloFinal = titulo.trim() || ideia.trim().split(/[.\n]/)[0].slice(0, 80);
    const insertPayload: Record<string, unknown> = {
      titulo: tituloFinal,
      status: "rascunho",
      briefing:
        engineEscolhida === "v2"
          ? {
              ideia_central: ideia.trim(),
              idea: ideia.trim(),
              qa: [],
              decisoes_autor: decisoesAutor.map((texto) => ({
                texto,
                em: new Date().toISOString(),
              })),
            }
          : { ideia_central: ideia.trim(), idea: ideia.trim(), qa: [] },
    };
    if (engineEscolhida === "v2" && contratoSel) {
      insertPayload.engine_mode = "v2";
      insertPayload.skill_escrita = SKILL_V1_MAP[contratoSel.id];
      insertPayload.total_capitulos = totalCapitulos;
    }
    const { data, error } = await supabase
      .from("projects")
      .insert(insertPayload)
      .select()
      .single();
    if (error) {
      setIniciando(false);
      toast.error(error.message);
      return;
    }
    setProjectId(data.id);
    setParams({ projeto: data.id }, { replace: true });
    setIniciando(false);
    if (engineEscolhida === "v2" && contratoSel) {
      setFase("canario");
      await gerarCanario(data.id, contratoSel.id);
    } else {
      setFase("entrevista");
      await agendarEntrevista(data.id);
    }
  }

  async function responder() {
    if (!projectId || enviando) return;
    setEnviando(true);
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
    try {
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
        setPensando(false);
        return;
      }
      qaRef.current = novasQa;
      setTurno((t) => t + 1);
      await agendarEntrevista(projectId);
    } finally {
      setEnviando(false);
    }
  }

  // ----- FASE 1: ideia única -----
  if (fase === "ideia") {
    const contratoSel = CONTRATOS.find((c) => c.id === skillEscolhida);
    const { erro: erroCapitulos, palavras: palavrasEstimadas } = validarCapitulos(
      totalCapitulos,
      contratoSel
    );
    const avisos = contratoSel ? avisosContrato(contratoSel) : [];
    const v2Bloqueado = engineEscolhida === "v2" && (!contratoSel || !!erroCapitulos);
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

              <div className="space-y-2">
                <Label>Engine de escrita</Label>
                <EscolhaEngine valor={engineEscolhida} onChange={setEngineEscolhida} />
              </div>

              {engineEscolhida === "v2" && (
                <div className="space-y-5 rounded-lg border border-dashed p-4">
                  <ComparadorEstilos
                    selecionavel
                    selecionado={skillEscolhida}
                    onSelecionar={setSkillEscolhida}
                  />

                  <div className="space-y-1.5">
                    <Label htmlFor="capitulos">Capítulos previstos</Label>
                    <Input
                      id="capitulos"
                      type="number"
                      min={1}
                      value={totalCapitulos}
                      onChange={(e) => setTotalCapitulos(Number(e.target.value) || 0)}
                      className="max-w-[10rem]"
                    />
                    {contratoSel && !erroCapitulos && (
                      <p className="text-xs text-muted-foreground">
                        ≈ {Math.round((palavrasEstimadas ?? 0) / 1000)} mil palavras no total
                        (capítulos × alvo da skill).
                      </p>
                    )}
                    {erroCapitulos && <p className="text-xs text-destructive">{erroCapitulos}</p>}
                    {contratoSel &&
                      avisos.map((a, i) => (
                        <p
                          key={i}
                          className="text-xs text-amber-700 dark:text-amber-400"
                        >
                          ⚠ {a}
                        </p>
                      ))}
                  </div>

                  <div className="space-y-1.5">
                    <Label>Decisões do autor (opcional)</Label>
                    <p className="text-xs text-muted-foreground">
                      Instruções suas que valem acima do perfil do livro (camada 3 do
                      compilador).
                    </p>
                    <div className="flex gap-2">
                      <Input
                        value={novaDecisao}
                        onChange={(e) => setNovaDecisao(e.target.value)}
                        placeholder="Ex.: sem cenas de violência gráfica"
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            adicionarDecisao();
                          }
                        }}
                      />
                      <Button type="button" variant="outline" size="icon" onClick={adicionarDecisao}>
                        <Plus className="h-4 w-4" />
                      </Button>
                    </div>
                    {!!decisoesAutor.length && (
                      <ul className="space-y-1.5">
                        {decisoesAutor.map((d, i) => (
                          <li
                            key={i}
                            className="flex items-center justify-between gap-2 rounded-md border px-3 py-1.5 text-sm"
                          >
                            <span>{d}</span>
                            <button
                              type="button"
                              onClick={() => removerDecisao(i)}
                              className="text-muted-foreground hover:text-destructive"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              )}

              <div className="flex justify-end">
                <Button type="submit" size="lg" disabled={iniciando || v2Bloqueado}>
                  {iniciando ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Wand2 className="h-4 w-4" />
                  )}
                  {engineEscolhida === "v2" ? "Gerar canário de voz" : "Começar entrevista"}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
        {engineEscolhida === "v1" && <ComparadorEstilos />}
      </div>
    );
  }

  // ----- FASE 1.5: canário de voz (só Engine V2) -----
  if (fase === "canario") {
    const contratoAtual = CONTRATOS.find((c) => c.id === skillEscolhida);
    return (
      <div className="mx-auto max-w-2xl space-y-6">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Canário de voz</h1>
          <p className="mt-1 text-muted-foreground">
            Uma cena curta nesta skill, para você aprovar a voz antes da entrevista.
          </p>
        </div>

        {trocandoSkill ? (
          <Card>
            <CardHeader>
              <CardTitle className="text-xl">Escolha outra skill</CardTitle>
              <CardDescription>Gera um novo canário com a skill escolhida.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <ComparadorEstilos
                selecionavel
                selecionado={skillEscolhida}
                onSelecionar={setSkillEscolhida}
              />
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setTrocandoSkill(false)}>
                  Cancelar
                </Button>
                <Button
                  onClick={() => {
                    setTrocandoSkill(false);
                    setCanarioJobId(null);
                    if (projectId && skillEscolhida) gerarCanario(projectId, skillEscolhida);
                  }}
                  disabled={!skillEscolhida || gerandoCanario}
                >
                  {gerandoCanario ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Wand2 className="h-4 w-4" />
                  )}
                  Gerar canário de voz
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : canarioErro ? (
          <Card>
            <CardContent className="flex flex-col items-center gap-4 py-12 text-center">
              <p className="text-sm text-destructive">{canarioErro}</p>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => projectId && skillEscolhida && gerarCanario(projectId, skillEscolhida)}
                >
                  Tentar novamente
                </Button>
                <Button size="sm" variant="outline" onClick={() => setTrocandoSkill(true)}>
                  Trocar skill
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : canarioTexto ? (
          <Card>
            <CardHeader>
              <CardTitle className="text-xl">
                Cena de amostra — {contratoAtual?.nome ?? skillEscolhida}
              </CardTitle>
              <CardDescription>Leia e diga se é a voz do seu livro.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="max-h-96 overflow-y-auto rounded-md border bg-muted/20 p-4">
                <p className="whitespace-pre-wrap font-serif text-sm leading-relaxed">
                  {canarioTexto}
                </p>
              </div>
              <div className="flex flex-wrap justify-end gap-2">
                <Button variant="outline" onClick={() => setTrocandoSkill(true)}>
                  Trocar skill
                </Button>
                <Button onClick={aprovarCanario}>
                  <Check className="h-4 w-4" /> Aprovar esta voz
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="flex flex-col items-center gap-3 py-16 text-center text-muted-foreground">
              <Loader2 className="h-7 w-7 animate-spin text-primary" />
              <p>Gerando a cena de amostra…</p>
            </CardContent>
          </Card>
        )}
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

      {erroFluxo ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-4 py-12 text-center">
            <p className="text-sm text-destructive">{erroFluxo}</p>
            <Button
              size="sm"
              variant="outline"
              onClick={() => projectId && agendarEntrevista(projectId)}
            >
              Tentar novamente
            </Button>
          </CardContent>
        </Card>
      ) : pensando || !pendentes.length ? (
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
            <Button
              size="lg"
              onClick={responder}
              disabled={enviando || pendentes.some((p) => !(respostas[p.campo] ?? "").trim())}
            >
              <Sparkles className="h-4 w-4" />
              Responder e continuar
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
