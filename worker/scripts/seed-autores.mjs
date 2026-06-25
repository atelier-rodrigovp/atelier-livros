// Seed dos 4 autores + atribuição das obras (projects.author_id). Idempotente.
// Uso: node scripts/seed-autores.mjs   (precisa da tabela authors já criada — supabase/authors.sql)
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.join(__dirname, "..", ".env") });
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const OWNER = process.env.OWNER_USER_ID;

const SOCIAL_VAZIO = { instagram: "", x: "", tiktok: "", threads: "", youtube: "", site: "" };
const slug = (s) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

const AUTORES = [
  { nome: "Mia Peducci", estilo: "Thriller-romance doméstico", genero: "Suspense psicológico / romance",
    referencias: "Colleen Hoover, Freida McFadden, Ken Follett (saga)",
    bio: "Thrillers-romance domésticos que doem e viram a página: coração de Colleen Hoover dentro da máquina de Freida McFadden. Narradoras não-confiáveis, segredos de família, trauma levado a sério e um twist que sempre foi justo. Casas, marés e memórias que escondem mais do que contam.",
    personalidade: "Intensa, empática, atenta ao não-dito; fala com intimidade e franqueza emocional; gosta de finais que não dão paz." },
  { nome: "Aria Nolan", estilo: "Suspense psicológico seco-sensorial", genero: "Thriller psicológico",
    referencias: "Freida McFadden, Harlan Coben; atmosferas de Perfume e The Conversation",
    bio: "Suspense psicológico de frase seca e nervo exposto. Narradores não-confiáveis que medem o mundo por um sentido levado ao limite — o perigo chega primeiro como ruído. A prosa é faca; a percepção é barroca.",
    personalidade: "Contida, precisa, inquietante; humor seco; atenção clínica ao detalhe sensorial." },
  { nome: "Iago Provardi", estilo: "Techno-thriller de conspiração", genero: "Mistério científico / techno-thriller",
    referencias: "Dan Brown, Michael Crichton, Blake Crouch",
    bio: "Techno-thrillers de página-vira sobre conspirações, ciência e segredos enterrados — Dan Brown com lastro factual real. Frio, clínico, ritmo de bisturi; capítulos curtos que terminam em gancho.",
    personalidade: "Cerebral, cético, fascinado por mistérios institucionais; gosta de fato verificável dramatizado." },
  { nome: "Lena Agarti", estilo: "Romantasy — fantasia romântica de alto risco e tensão amorosa",
    genero: "Fantasia / romance (new adult)",
    referencias: "Sarah J. Maas, Rebecca Yarros, Jennifer L. Armentrout",
    bio: "Mundos perigosos onde o romance é a maior das apostas. Inimigos que viram amantes, juramentos que cobram preço, magia com regras e um slow burn que não deixa respirar. Fantasia épica com o coração na garganta — feita para virar a noite e a página.",
    personalidade: "Intensa e calorosa, sensual sem vulgaridade, fala direto com a leitora; vive de tensão romântica, lealdade e escolhas impossíveis; adora um gancho cruel no fim do capítulo.",
    skill_escrita: "skill-romantasy" }, // ponteiro p/ a skill de escrita (vira projects.skill_escrita nos livros da Lena)
];

const MAPA = {
  "Iago Provardi": { series: ["Vésper"], titulos: [] },
  "Aria Nolan": { series: [], titulos: ["O Colecionador de Silêncios", "A Casa que Conta"] },
  "Mia Peducci": {
    series: ["A Linhagem das Cinzas", "Última Chamada para o Embarque"],
    titulos: ["A Memória dos Outros", "O que a Maré Esconde", "A Última Carta de Vênus", "Enquanto Você Dormia em Lisboa"],
  },
  "Lena Agarti": { series: [], titulos: [] },
};

const ids = {};
for (const a of AUTORES) {
  const payload = { owner: OWNER, nome: a.nome, slug: slug(a.nome), estilo: a.estilo, genero: a.genero ?? null,
    referencias: a.referencias ?? null, bio: a.bio, personalidade: a.personalidade, social: SOCIAL_VAZIO };
  const { data: ex } = await sb.from("authors").select("id").eq("owner", OWNER).eq("nome", a.nome).limit(1);
  if (ex?.[0]) {
    await sb.from("authors").update(payload).eq("id", ex[0].id);
    ids[a.nome] = ex[0].id;
    console.log(`= atualizado: ${a.nome}`);
  } else {
    const { data, error } = await sb.from("authors").insert(payload).select("id").single();
    if (error) { console.error(`! erro criando ${a.nome}: ${error.message}`); continue; }
    ids[a.nome] = data.id;
    console.log(`+ criado: ${a.nome}`);
  }
}

console.log("\n--- atribuindo obras ---");
for (const [nome, m] of Object.entries(MAPA)) {
  const aid = ids[nome];
  if (!aid) continue;
  let n = 0;
  for (const serie of m.series) {
    const { data, error } = await sb.from("projects").update({ author_id: aid }).eq("owner", OWNER).eq("serie", serie).select("id");
    if (!error) n += data?.length ?? 0;
  }
  for (const titulo of m.titulos) {
    const { data, error } = await sb.from("projects").update({ author_id: aid }).eq("owner", OWNER).eq("titulo", titulo).select("id");
    if (!error) n += data?.length ?? 0;
  }
  console.log(`  ${nome}: ${n} obra(s) atribuída(s)`);
}
console.log("\nok.");
