// Geração de imagem com cadeia de provedores (FLUX grátis por token → Pollinations).
// Nenhuma chave é obrigatória: sem token, cai no Pollinations (qualidade menor).
// Tokens vão SÓ no worker/.env (HF_API_TOKEN, CF_ACCOUNT_ID/CF_API_TOKEN,
// TOGETHER_API_KEY, OPENAI_API_KEY) e IMAGE_PROVIDER define a preferência.

export type ImgProvider = "openai" | "huggingface" | "cloudflare" | "together" | "pollinations";

const LABEL: Record<ImgProvider, string> = {
  openai: "OpenAI gpt-image-1 (pago)",
  huggingface: "Hugging Face FLUX.1-dev (grátis)",
  cloudflare: "Cloudflare FLUX.1-schnell (grátis)",
  together: "Together FLUX.1-schnell (grátis)",
  pollinations: "Pollinations Flux (sem chave, qualidade menor)",
};
export function providerLabel(p: ImgProvider): string {
  return LABEL[p];
}

function temCreds(p: ImgProvider): boolean {
  switch (p) {
    case "openai": return !!process.env.OPENAI_API_KEY;
    case "huggingface": return !!process.env.HF_API_TOKEN;
    case "cloudflare": return !!(process.env.CF_ACCOUNT_ID && process.env.CF_API_TOKEN);
    case "together": return !!process.env.TOGETHER_API_KEY;
    case "pollinations": return true;
  }
}

// Cadeia: gpt-image-1 (se houver chave paga) no topo; depois o IMAGE_PROVIDER
// preferido (se tiver creds); depois os demais grátis com creds; por fim Pollinations.
export function cadeiaProviders(): ImgProvider[] {
  const pref = (process.env.IMAGE_PROVIDER || "cloudflare").toLowerCase() as ImgProvider;
  const gratis: ImgProvider[] = ["huggingface", "cloudflare", "together"];
  const ordem: ImgProvider[] = [];
  if (temCreds("openai")) ordem.push("openai");
  if (gratis.includes(pref) && temCreds(pref)) ordem.push(pref);
  for (const g of gratis) if (g !== pref && temCreds(g) && !ordem.includes(g)) ordem.push(g);
  ordem.push("pollinations");
  return ordem;
}

export function providerAtivo(): ImgProvider {
  return cadeiaProviders()[0];
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const fromB64 = (s: string) => Buffer.from(s.replace(/^data:image\/\w+;base64,/, ""), "base64");

async function fetchTimeout(url: string, init: RequestInit, ms = 120_000): Promise<Response> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try { return await fetch(url, { ...init, signal: ctrl.signal }); }
  finally { clearTimeout(t); }
}

async function viaOpenAI(prompt: string, w: number, h: number): Promise<Buffer | null> {
  const size = h > w ? "1024x1536" : w > h ? "1536x1024" : "1024x1024";
  const res = await fetchTimeout("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
    body: JSON.stringify({ model: "gpt-image-1", prompt, size, n: 1 }),
  });
  if (!res.ok) return null;
  const j: any = await res.json();
  const b64 = j?.data?.[0]?.b64_json;
  return b64 ? fromB64(b64) : null;
}

async function viaHuggingFace(prompt: string, w: number, h: number, seed?: number): Promise<Buffer | null> {
  const body = JSON.stringify({ inputs: prompt, parameters: { width: w, height: h, ...(seed != null ? { seed } : {}) } });
  // FLUX.1-dev pode ter cold start (503 com estimated_time) — tenta algumas vezes.
  for (let tentativa = 0; tentativa < 4; tentativa++) {
    const res = await fetchTimeout("https://api-inference.huggingface.co/models/black-forest-labs/FLUX.1-dev", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.HF_API_TOKEN}`, "x-wait-for-model": "true" },
      body,
    });
    const ct = res.headers.get("content-type") || "";
    if (res.ok && ct.startsWith("image/")) return Buffer.from(await res.arrayBuffer());
    if (res.status === 503) { // modelo carregando
      let espera = 12;
      try { const j: any = await res.json(); if (j?.estimated_time) espera = Math.min(60, Math.ceil(j.estimated_time)); } catch {}
      await sleep(espera * 1000);
      continue;
    }
    return null;
  }
  return null;
}

async function viaCloudflare(prompt: string, seed?: number): Promise<Buffer | null> {
  const url = `https://api.cloudflare.com/client/v4/accounts/${process.env.CF_ACCOUNT_ID}/ai/run/@cf/black-forest-labs/flux-1-schnell`;
  const res = await fetchTimeout(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.CF_API_TOKEN}` },
    body: JSON.stringify({ prompt, ...(seed != null ? { seed } : {}) }),
  });
  if (!res.ok) return null;
  const ct = res.headers.get("content-type") || "";
  if (ct.startsWith("image/")) return Buffer.from(await res.arrayBuffer());
  const j: any = await res.json();
  const b64 = j?.result?.image; // base64 PNG
  return b64 ? fromB64(b64) : null;
}

async function viaTogether(prompt: string, w: number, h: number, seed?: number): Promise<Buffer | null> {
  const res = await fetchTimeout("https://api.together.xyz/v1/images/generations", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.TOGETHER_API_KEY}` },
    body: JSON.stringify({ model: "black-forest-labs/FLUX.1-schnell-Free", prompt, width: w, height: h, n: 1, ...(seed != null ? { seed } : {}) }),
  });
  if (!res.ok) return null;
  const j: any = await res.json();
  const item = j?.data?.[0];
  if (item?.b64_json) return fromB64(item.b64_json);
  if (item?.url) { const r = await fetchTimeout(item.url, {}); return r.ok ? Buffer.from(await r.arrayBuffer()) : null; }
  return null;
}

async function viaPollinations(prompt: string, w: number, h: number, seed?: number): Promise<Buffer | null> {
  const s = seed ?? Math.floor(Math.random() * 1_000_000);
  const u = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=${w}&height=${h}&model=flux&nologo=true&seed=${s}`;
  const res = await fetchTimeout(u, {});
  if (!res.ok || !(res.headers.get("content-type") || "").startsWith("image/")) return null;
  return Buffer.from(await res.arrayBuffer());
}

export interface GenOpts { width?: number; height?: number; seed?: number; }

async function gerarCom(p: ImgProvider, prompt: string, w: number, h: number, seed?: number): Promise<Buffer | null> {
  switch (p) {
    case "openai": return viaOpenAI(prompt, w, h);
    case "huggingface": return viaHuggingFace(prompt, w, h, seed);
    case "cloudflare": return viaCloudflare(prompt, seed);
    case "together": return viaTogether(prompt, w, h, seed);
    case "pollinations": return viaPollinations(prompt, w, h, seed);
  }
}

// Gera uma imagem percorrendo a cadeia; retorna os bytes e qual provedor entregou.
export async function gerarImagem(prompt: string, opts: GenOpts = {}): Promise<{ bytes: Buffer; provider: ImgProvider } | null> {
  const w = opts.width ?? 1024;
  const h = opts.height ?? 1536;
  for (const p of cadeiaProviders()) {
    try {
      const bytes = await gerarCom(p, prompt, w, h, opts.seed);
      if (bytes && bytes.length > 15_000) return { bytes, provider: p };
    } catch { /* tenta o próximo provedor */ }
  }
  return null;
}
