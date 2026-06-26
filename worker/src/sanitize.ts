// Trava antivazamento: remove META-TEXTO de pipeline da prosa antes de salvar.
//
// CONSERVADOR por design — prosa legítima NUNCA é alterada por engano:
// "tomou nota:", "nota de rodapé", itálicos/*asteriscos*, travessões e diálogos
// passam intactos. Só casa assinaturas claramente do pipeline (comentários HTML,
// blocos de código, e linhas de chatter como "skill-…", "fallback…", etc.).

// Assinaturas de chatter de pipeline. Se uma LINHA casar, a linha inteira sai.
// Termos escolhidos para serem do pipeline, não de prosa (evita falso positivo).
const META_LINE_PATTERNS: RegExp[] = [
  /\bskill-[a-z]/i, // skill-dan-brown, skill-romantasy, …
  /\bfallback\b/i, // "fallback perfil-de-voz.md aplicado"
  /ausente no ambiente/i,
  /perfil-de-voz\.md/i,
  /unknown skill\s*:/i,
  /~\/\.claude\/skills/i,
  /\[system\]/i,
  /observa[çc][ãa]o do agente/i,
  /\bDEBUG\b/, // maiúsculo: marcador, não "debugar" da prosa
  /\bTODO:/,
];

// Cerca de bloco de código markdown (``` …), inclusive a solta/órfã.
const FENCE = /(^|\n)[ \t]*```/;

export interface ResultadoSanitizacao {
  texto: string;
  removidos: string[]; // descrições curtas do que saiu, para auditoria/log
}

function resumo(tipo: string, trecho: string): string {
  const s = trecho.replace(/\s+/g, " ").trim();
  return `${tipo}: "${s.slice(0, 80)}${s.length > 80 ? "…" : ""}"`;
}

// Remove meta-texto de um capítulo. Pura e determinística (testável).
export function sanitizarCapitulo(texto: string): ResultadoSanitizacao {
  const removidos: string[] = [];
  let t = texto;

  // 1) Comentários HTML <!-- … --> (inclusive multilinha).
  t = t.replace(/<!--[\s\S]*?-->/g, (m) => {
    removidos.push(resumo("comentário HTML", m));
    return "";
  });

  // 2) Blocos de código markdown ``` … ``` (cerca pareada, multilinha).
  t = t.replace(/(^|\n)[ \t]*```[\s\S]*?```[ \t]*(?=\n|$)/g, (m) => {
    removidos.push(resumo("bloco de código", m));
    return "\n";
  });

  // 3) Linhas de chatter de pipeline (assinaturas claras).
  t = t
    .split("\n")
    .filter((linha) => {
      if (META_LINE_PATTERNS.some((re) => re.test(linha))) {
        removidos.push(resumo("linha de meta", linha));
        return false;
      }
      return true;
    })
    .join("\n");

  // Normaliza o espaçamento que as remoções possam ter deixado.
  if (removidos.length) {
    t = t.replace(/[ \t]+$/gm, "").replace(/\n{3,}/g, "\n\n").replace(/^\n+/, "");
    if (!t.endsWith("\n")) t += "\n";
  }

  return { texto: t, removidos };
}

// Gate: retorna a descrição do PRIMEIRO marcador proibido ainda presente, ou
// null se o texto está limpo. Usado para REJEITAR capítulo/manuscrito com
// meta-texto remanescente (ex.: comentário sem fechamento, cerca órfã).
export function metaResidual(texto: string): string | null {
  if (/<!--/.test(texto)) return "comentário HTML <!--";
  if (FENCE.test(texto)) return "bloco de código ```";
  for (const re of META_LINE_PATTERNS) {
    if (re.test(texto)) return `assinatura de pipeline (${re.source})`;
  }
  return null;
}
