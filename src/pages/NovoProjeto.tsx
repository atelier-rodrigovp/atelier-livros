import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  Clock3,
  FileCheck2,
  Loader2,
  Plus,
  ShieldCheck,
  Sparkles,
  Trash2,
  Wand2,
  WifiOff,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { supabase, enqueueJob } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import { useWorkerStatus } from "@/hooks/useWorkerStatus";
import { resolverEsperaWizardV2, TEXTO_ESPERA_WIZARD_V2 } from "@/lib/wizardV2";
import type { ReviewV2 } from "@/lib/engineV2";
import type { JobStatus } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
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
// Idiomas de escrita suportados (projects.idioma_origem — a engine escreve neste idioma).
const IDIOMAS_LIVRO = [
  { codigo: "pt-BR", rotulo: "Português (Brasil)" },
  { codigo: "en", rotulo: "Inglês" },
  { codigo: "es-ES", rotulo: "Espanhol (Espanha)" },
  { codigo: "it-IT", rotulo: "Italiano" },
  { codigo: "de-DE", rotulo: "Alemão" },
  { codigo: "fr-FR", rotulo: "Francês (França)" },
];

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
            <p className="font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
              contrato e régua {c.versao}
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

interface JobWizard {
  status: JobStatus;
  erro?: string | null;
  created_at?: string | null;
  progresso?: { aguardando_reset?: boolean; retry_at?: string | null; [chave: string]: unknown };
}

interface CanarioVoz {
  texto: string;
  skill_id: string;
  contrato_versao: string;
  hash: string;
  verdict?: string;
  parecer?: ReviewV2["parecer"];
  problemas_protocolo?: string[];
}

function TrilhaWizard({ fase }: { fase: "ideia" | "canario" | "entrevista" }) {
  const etapas = [
    { id: "ideia", label: "Projeto e skill" },
    { id: "canario", label: "Prova de voz" },
    { id: "entrevista", label: "Entrevista e fundação" },
  ] as const;
  const atual = etapas.findIndex((e) => e.id === fase);
  return (
    <ol className="grid grid-cols-3 border-y py-3 text-xs" aria-label="Progresso da criação">
      {etapas.map((etapa, indice) => (
        <li
          key={etapa.id}
          className={cn(
            "relative px-3 before:absolute before:left-0 before:top-0 before:h-full before:w-px before:bg-border first:before:hidden",
            indice <= atual ? "text-foreground" : "text-muted-foreground"
          )}
          aria-current={indice === atual ? "step" : undefined}
        >
          <span className="block font-mono text-[10px] tabular-nums text-muted-foreground">
            {String(indice + 1).padStart(2, "0")}
          </span>
          <span className={cn("font-medium", indice === atual && "text-primary")}>{etapa.label}</span>
        </li>
      ))}
    </ol>
  );
}

function EstadoEspera({
  job,
  workerOnline,
  producaoAtiva,
}: {
  job: JobWizard | null;
  workerOnline: boolean;
  producaoAtiva: boolean;
}) {
  const estado = resolverEsperaWizardV2({
    status: job?.status,
    createdAt: job?.created_at,
    progresso: job?.progresso,
    workerOnline,
    producaoAtiva,
  });
  if (estado === "concluido") return null;
  const texto = TEXTO_ESPERA_WIZARD_V2[estado];
  const Icone =
    estado === "worker_offline" ? WifiOff
      : estado === "demora_excessiva" || estado === "throttle" ? Clock3
        : estado === "falha" || estado === "pausado" ? AlertTriangle
          : Loader2;
  const alerta = ["falha", "pausado", "worker_offline", "producao_pausada", "demora_excessiva"].includes(estado);
  const retryAt = job?.progresso?.retry_at;
  return (
    <div
      className={cn(
        "flex items-start gap-3 rounded-lg border px-4 py-3 text-sm",
        alerta ? "border-amber-500/40 bg-amber-500/10" : "bg-muted/30"
      )}
      role="status"
    >
      <Icone className={cn("mt-0.5 h-4 w-4 shrink-0", !alerta && estado !== "throttle" && "animate-spin")} />
      <div>
        <p className="font-medium">{texto.titulo}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">{texto.detalhe}</p>
        {retryAt && estado === "throttle" && (
          <p className="mt-1 text-xs">Retomada prevista: {new Date(retryAt).toLocaleString("pt-BR")}</p>
        )}
        {job?.erro && (estado === "falha" || estado === "pausado") && (
          <p className="mt-1 text-xs text-destructive">{job.erro}</p>
        )}
      </div>
    </div>
  );
}

function AvaliacaoCanario({ resultado }: { resultado: CanarioVoz }) {
  const parecer = resultado.parecer;
  const aprovado = resultado.verdict === "aprovado";
  return (
    <div className="space-y-3 rounded-lg border bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-medium">Avaliação técnica da amostra</p>
          <p className="text-xs text-muted-foreground">
            contrato {resultado.skill_id}@{resultado.contrato_versao} · hash {resultado.hash.slice(0, 10)}
          </p>
        </div>
        <Badge variant={aprovado ? "success" : resultado.verdict === "aprovado_com_excecao" ? "warning" : "destructive"}>
          {resultado.verdict?.replace(/_/g, " ") ?? "sem parecer"}
        </Badge>
      </div>
      {parecer?.skill_adherence && (
        <div>
          <div className="flex items-center justify-between text-xs">
            <span>Aderência à skill</span>
            <span className="font-mono tabular-nums">{parecer.skill_adherence.nota}/5</span>
          </div>
          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full bg-primary"
              style={{ width: `${Math.max(0, Math.min(100, parecer.skill_adherence.nota * 20))}%` }}
            />
          </div>
          <p className="mt-1 text-xs text-muted-foreground">{parecer.skill_adherence.evidencia}</p>
        </div>
      )}
      {!!parecer?.evidencias?.length && (
        <div className="space-y-1">
          <p className="text-xs font-medium">O que funcionou</p>
          {parecer.evidencias.slice(0, 2).map((e, i) => (
            <p key={i} className="text-xs text-muted-foreground">
              “{e.trecho}” — {e.observacao}
            </p>
          ))}
        </div>
      )}
      {!!parecer?.correcoes?.length && (
        <div className="space-y-1">
          <p className="text-xs font-medium">O que precisa mudar</p>
          <ul className="list-disc space-y-1 pl-4 text-xs text-muted-foreground">
            {parecer.correcoes.slice(0, 4).map((c, i) => <li key={i}>{c.instrucao}</li>)}
          </ul>
        </div>
      )}
      {resultado.problemas_protocolo?.map((p, i) => (
        <p key={i} className="text-xs text-amber-700 dark:text-amber-400">{p}</p>
      ))}
    </div>
  );
}

export default function NovoProjeto() {
  const nav = useNavigate();
  const worker = useWorkerStatus(15_000);
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
  const [idiomaLivro, setIdiomaLivro] = useState("pt-BR");
  const [skillEscolhida, setSkillEscolhida] = useState<string | null>(null);
  const [totalCapitulos, setTotalCapitulos] = useState(40);
  const [decisoesAutor, setDecisoesAutor] = useState<string[]>([]);
  const [novaDecisao, setNovaDecisao] = useState("");

  // Canário de voz (fase "canario", só engine V2).
  const [canarioJobId, setCanarioJobId] = useState<string | null>(null);
  const [canarioTexto, setCanarioTexto] = useState<string | null>(null);
  const [canarioResultado, setCanarioResultado] = useState<CanarioVoz | null>(null);
  const [canarioJob, setCanarioJob] = useState<JobWizard | null>(null);
  const [canarioErro, setCanarioErro] = useState<string | null>(null);
  const [gerandoCanario, setGerandoCanario] = useState(false);
  const [trocandoSkill, setTrocandoSkill] = useState(false);
  const [ajusteCanario, setAjusteCanario] = useState("");
  const [decidindoCanario, setDecidindoCanario] = useState(false);

  const [projectId, setProjectId] = useState<string | null>(projetoParam);
  const [pendentes, setPendentes] = useState<Pergunta[]>([]);
  const [respostas, setRespostas] = useState<Record<string, string>>({});
  const [turno, setTurno] = useState(0); // nº de blocos já respondidos
  const [pensando, setPensando] = useState(false);
  const [enviando, setEnviando] = useState(false);
  // Falha visível + retomável: enqueue falho ou job de entrevista com erro não
  // podem virar spinner eterno.
  const [erroFluxo, setErroFluxo] = useState<string | null>(null);
  const [jobEntrevista, setJobEntrevista] = useState<JobWizard | null>(null);
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
        .select("status,erro,created_at,progresso")
        .eq("project_id", id)
        .eq("tipo", "entrevistar")
        .order("created_at", { ascending: false })
        .limit(1);
      const j: any = js?.[0];
      setJobEntrevista(j ? {
        status: j.status,
        erro: j.erro,
        created_at: j.created_at,
        progresso: j.progresso ?? {},
      } : null);
      if (j?.status === "error") {
        setPendentes([]);
        setPensando(false);
        setErroFluxo(j.erro || "A entrevista falhou no worker. Tente novamente.");
        return;
      }
      if (j?.status === "paused") {
        setPendentes([]);
        setPensando(true);
        setErroFluxo(null);
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
      const job = await enqueueJob("entrevistar", {}, { project_id: id });
      setJobEntrevista({
        status: job.status,
        erro: job.erro,
        created_at: job.created_at,
        progresso: job.progresso,
      });
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
        const { data: jobsCanario } = await supabase
          .from("jobs")
          .select("id,status,erro,created_at,progresso")
          .eq("project_id", projetoParam)
          .eq("tipo", "canario_voz")
          .order("created_at", { ascending: false })
          .limit(1);
        const ultimo = jobsCanario?.[0] as any;
        if (ultimo) {
          setCanarioJobId(ultimo.id);
          setCanarioJob({
            status: ultimo.status,
            erro: ultimo.erro,
            created_at: ultimo.created_at,
            progresso: ultimo.progresso ?? {},
          });
          const resultado = ultimo.progresso?.canario_voz as CanarioVoz | undefined;
          if (resultado?.texto) {
            setCanarioResultado(resultado);
            setCanarioTexto(resultado.texto);
          }
        } else {
          setCanarioErro("Nenhum canário foi agendado para este projeto. Gere uma amostra para continuar.");
        }
      }
    })();
  }, [projetoParam]);

  // Gera (ou regenera, ao trocar de skill) o canário de voz do projeto já criado.
  async function gerarCanario(id: string, skillId: string, ajusteAutor?: string) {
    setGerandoCanario(true);
    setCanarioErro(null);
    setCanarioTexto(null);
    setCanarioResultado(null);
    setCanarioJob(null);
    try {
      const skillV1 = SKILL_V1_MAP[skillId];
      const { error: errUpd } = await supabase
        .from("projects")
        .update({ skill_escrita: skillV1 })
        .eq("id", id);
      if (errUpd) throw errUpd;
      const job = await enqueueJob(
        "canario_voz",
        {
          skill_escrita: skillV1,
          ...(ajusteAutor?.trim() ? { ajuste_autor: ajusteAutor.trim() } : {}),
        },
        { project_id: id }
      );
      setCanarioJobId(job.id);
      setCanarioJob({
        status: job.status,
        erro: job.erro,
        created_at: job.created_at,
        progresso: job.progresso,
      });
      setAjusteCanario("");
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
        .select("status,erro,progresso,created_at")
        .eq("id", canarioJobId!)
        .maybeSingle();
      if (!ativo || !data) return;
      setCanarioJob({
        status: data.status,
        erro: data.erro,
        created_at: data.created_at,
        progresso: (data.progresso as JobWizard["progresso"]) ?? {},
      });
      if (data.status === "error") {
        setCanarioErro(data.erro || "O canário de voz falhou no worker.");
        return;
      }
      if (data.status === "done") {
        const c = (data.progresso as any)?.canario_voz as CanarioVoz | undefined;
        if (c?.texto) {
          setCanarioResultado(c);
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
    if (canarioResultado?.verdict !== "aprovado") {
      toast.error("A avaliação técnica ainda não aprovou plenamente esta amostra. Ajuste ou troque a skill.");
      return;
    }
    setDecidindoCanario(true);
    try {
      const { data, error: leituraErro } = await supabase
        .from("projects")
        .select("briefing")
        .eq("id", projectId)
        .single();
      if (leituraErro) throw leituraErro;
      const b: any = data?.briefing || {};
      const decisao = {
        decisao: "aprovado",
        skill: skillEscolhida,
        contrato_versao: canarioResultado.contrato_versao,
        text_hash: canarioResultado.hash,
        verdict_tecnico: canarioResultado.verdict,
        em: new Date().toISOString(),
        job_id: canarioJobId,
      };
      const merged = {
        ...b,
        canario_voz: {
          aprovado: true,
          ...decisao,
        },
        canario_voz_historico: [
          ...(Array.isArray(b.canario_voz_historico) ? b.canario_voz_historico : []),
          decisao,
        ],
      };
      const { error } = await supabase
        .from("projects")
        .update({ briefing: merged })
        .eq("id", projectId);
      if (error) throw error;
      setFase("entrevista");
      await agendarEntrevista(projectId);
    } catch (erro) {
      toast.error((erro as Error).message);
    } finally {
      setDecidindoCanario(false);
    }
  }

  async function registrarDecisaoCanario(decisao: "rejeitado" | "ajustar") {
    if (!projectId || !skillEscolhida || !canarioResultado) return;
    if (decisao === "ajustar" && !ajusteCanario.trim()) {
      toast.error("Descreva o ajuste que deseja ver na próxima amostra.");
      return;
    }
    setDecidindoCanario(true);
    try {
      const { data, error: leituraErro } = await supabase
        .from("projects")
        .select("briefing")
        .eq("id", projectId)
        .single();
      if (leituraErro) throw leituraErro;
      const b: any = data?.briefing || {};
      const registro = {
        decisao,
        skill: skillEscolhida,
        contrato_versao: canarioResultado.contrato_versao,
        text_hash: canarioResultado.hash,
        verdict_tecnico: canarioResultado.verdict ?? null,
        feedback: ajusteCanario.trim() || null,
        em: new Date().toISOString(),
        job_id: canarioJobId,
      };
      const { error } = await supabase
        .from("projects")
        .update({
          briefing: {
            ...b,
            canario_voz: { aprovado: false, ...registro },
            canario_voz_historico: [
              ...(Array.isArray(b.canario_voz_historico) ? b.canario_voz_historico : []),
              registro,
            ],
            // O ajuste pedido é decisão autoral de verdade (camada 3) — como a tela promete.
            ...(decisao === "ajustar" && ajusteCanario.trim()
              ? {
                  decisoes_autor: [
                    ...(Array.isArray(b.decisoes_autor) ? b.decisoes_autor : []),
                    { texto: ajusteCanario.trim(), em: new Date().toISOString(), origem: "canario_voz" },
                  ],
                }
              : {}),
          },
        })
        .eq("id", projectId);
      if (error) throw error;
      if (decisao === "ajustar") {
        await gerarCanario(projectId, skillEscolhida, ajusteCanario);
      } else {
        toast.success("Amostra rejeitada. Ajuste a orientação ou escolha outra skill.");
      }
    } catch (erro) {
      toast.error((erro as Error).message);
    } finally {
      setDecidindoCanario(false);
    }
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
      // Idioma é dado de primeira classe: a engine lê projects.idioma_origem.
      idioma_origem: idiomaLivro,
      briefing:
        engineEscolhida === "v2"
          ? {
              ideia_central: ideia.trim(),
              qa: [],
              decisoes_autor: decisoesAutor.map((texto) => ({
                texto,
                em: new Date().toISOString(),
              })),
            }
          : { ideia_central: ideia.trim(), qa: [] },
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
        <TrilhaWizard fase="ideia" />
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
                <Label htmlFor="idioma">Idioma do livro</Label>
                <select
                  id="idioma"
                  className="flex h-10 w-full max-w-[16rem] rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  value={idiomaLivro}
                  onChange={(e) => setIdiomaLivro(e.target.value)}
                >
                  {IDIOMAS_LIVRO.map((i) => (
                    <option key={i.codigo} value={i.codigo}>{i.rotulo}</option>
                  ))}
                </select>
                <p className="text-xs text-muted-foreground">
                  A amostra de voz, a fundação e todos os capítulos saem neste idioma.
                </p>
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
        <TrilhaWizard fase="canario" />

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
          <div className="space-y-4">
            <Card className="overflow-hidden">
              <CardHeader className="border-b bg-muted/20">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <CardTitle className="text-xl">
                      Cena de amostra — {contratoAtual?.nome ?? skillEscolhida}
                    </CardTitle>
                    <CardDescription>
                      Leia a prosa e compare sua percepção com o parecer técnico.
                    </CardDescription>
                  </div>
                  {canarioResultado?.contrato_versao && (
                    <Badge variant="outline" className="font-mono">
                      régua {canarioResultado.contrato_versao}
                    </Badge>
                  )}
                </div>
              </CardHeader>
              <CardContent className="space-y-5 pt-5">
                <div className="relative max-h-[30rem] overflow-y-auto border-l-2 border-primary/40 bg-muted/15 py-4 pl-6 pr-4">
                  <span className="absolute left-2 top-4 font-mono text-[9px] uppercase tracking-widest text-muted-foreground [writing-mode:vertical-rl]">
                    prova de voz
                  </span>
                  <p className="whitespace-pre-wrap font-serif text-[0.95rem] leading-7">
                    {canarioTexto}
                  </p>
                </div>
                {canarioResultado ? (
                  <AvaliacaoCanario resultado={canarioResultado} />
                ) : (
                  <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-xs">
                    Esta amostra foi gerada por uma versão antiga do worker, sem parecer estruturado.
                    Gere novamente para poder aprová-la.
                  </div>
                )}
                {contratoAtual && (
                  <details className="rounded-lg border">
                    <summary className="cursor-pointer px-4 py-3 text-sm font-medium">
                      Ver contrato usado nesta prova
                    </summary>
                    <div className="grid gap-4 border-t p-4 text-xs sm:grid-cols-2">
                      <div>
                        <p className="font-medium">A voz precisa demonstrar</p>
                        <ul className="mt-1 list-disc space-y-1 pl-4 text-muted-foreground">
                          {contratoAtual.testes_positivos.map((t, i) => <li key={i}>{t}</li>)}
                        </ul>
                      </div>
                      <div>
                        <p className="font-medium">A voz deve evitar</p>
                        <ul className="mt-1 list-disc space-y-1 pl-4 text-muted-foreground">
                          {contratoAtual.sinais_negativos.slice(0, 6).map((t, i) => <li key={i}>{t}</li>)}
                        </ul>
                      </div>
                    </div>
                  </details>
                )}

                <div className="space-y-2 rounded-lg border p-4">
                  <Label htmlFor="ajuste-canario">O que você quer ajustar nesta voz?</Label>
                  <Textarea
                    id="ajuste-canario"
                    value={ajusteCanario}
                    onChange={(e) => setAjusteCanario(e.target.value)}
                    rows={3}
                    placeholder="Ex.: menos explicação interna; revele a ameaça por ações e objetos."
                  />
                  <p className="text-xs text-muted-foreground">
                    O ajuste fica registrado como decisão autoral e orienta uma nova amostra.
                  </p>
                </div>

                <div className="flex flex-col-reverse gap-2 sm:flex-row sm:flex-wrap sm:justify-end">
                  <Button variant="ghost" onClick={() => setTrocandoSkill(true)} disabled={decidindoCanario}>
                    Trocar skill
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => registrarDecisaoCanario("rejeitado")}
                    disabled={decidindoCanario || !canarioResultado}
                  >
                    <X className="h-4 w-4" /> Rejeitar esta voz
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => registrarDecisaoCanario("ajustar")}
                    disabled={decidindoCanario || !ajusteCanario.trim() || !canarioResultado}
                  >
                    <Wand2 className="h-4 w-4" /> Ajustar e gerar outra
                  </Button>
                  <Button
                    onClick={aprovarCanario}
                    disabled={decidindoCanario || canarioResultado?.verdict !== "aprovado"}
                    title={canarioResultado?.verdict !== "aprovado" ? "A aprovação exige parecer técnico plenamente aprovado." : undefined}
                  >
                    {decidindoCanario ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
                    Aprovar voz e continuar
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        ) : (
          <Card>
            <CardContent className="space-y-4 py-8">
              <EstadoEspera
                job={canarioJob}
                workerOnline={worker.online}
                producaoAtiva={worker.producaoAtiva}
              />
              <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
                <FileCheck2 className="h-4 w-4" />
                O escritor gera a amostra; o revisor mede a aderência antes da sua decisão.
              </div>
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
      <TrilhaWizard fase="entrevista" />

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
          <CardContent className="space-y-4 py-8">
            <EstadoEspera
              job={jobEntrevista}
              workerOnline={worker.online}
              producaoAtiva={worker.producaoAtiva}
            />
            <p className="text-center text-sm text-muted-foreground">
              {turno === 0
                ? "O arquiteto está analisando sua ideia e preparando as primeiras perguntas."
                : "O arquiteto está validando suas respostas e preparando o próximo bloco."}
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
