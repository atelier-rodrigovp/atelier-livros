import { cn } from "@/lib/utils";

export interface CoverInfo {
  titulo: string;
  serie?: string | null;
  volume?: number | null;
  capa?: string | null;
}

// Paleta determinística para capas sem arte (parece intencional, nunca quebrado).
const PALETAS = [
  ["#1f2a44", "#3b5278"],
  ["#3a2a2a", "#7a4a3a"],
  ["#22332b", "#3f6b53"],
  ["#2c2540", "#574a86"],
  ["#3a2f1c", "#8a6d3b"],
  ["#2a2a2e", "#55555c"],
];

function hashStr(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

// Gradiente determinístico a partir de uma semente (reuso no hero do catálogo).
export function paletaDe(seed: string): [string, string] {
  return PALETAS[hashStr(seed) % PALETAS.length] as [string, string];
}

// Capa: usa a arte quando existe; senão, fallback tipográfico.
// variant "poster" = catálogo (grande); "mini" = mini-capa no dashboard.
export function CoverArt({
  info,
  variant = "poster",
  className,
}: {
  info: CoverInfo;
  variant?: "poster" | "mini";
  className?: string;
}) {
  if (info.capa) {
    return (
      <img
        src={info.capa}
        alt={`Capa: ${info.titulo}`}
        loading="lazy"
        className={cn("h-full w-full object-cover", className)}
      />
    );
  }
  const [c1, c2] = paletaDe(info.titulo + (info.volume ?? ""));

  if (variant === "mini") {
    return (
      <div
        className={cn("flex h-full w-full items-center justify-center p-1 text-center", className)}
        style={{ background: `linear-gradient(150deg, ${c1}, ${c2})` }}
      >
        <span className="font-serif text-[10px] font-semibold leading-tight text-white/90 line-clamp-3">
          {info.volume ? `Vol. ${info.volume}` : info.titulo}
        </span>
      </div>
    );
  }

  return (
    <div
      className={cn("flex h-full w-full flex-col justify-between p-4 text-center", className)}
      style={{ background: `linear-gradient(150deg, ${c1}, ${c2})` }}
    >
      <span className="text-[10px] uppercase tracking-[0.18em] text-white/60">
        {info.serie ? (info.volume ? `Vol. ${info.volume}` : "Série") : "Livro"}
      </span>
      <p className="font-serif text-base font-semibold leading-snug text-white line-clamp-4">
        {info.titulo}
      </p>
      <span className="mx-auto h-px w-8 bg-white/40" />
    </div>
  );
}
