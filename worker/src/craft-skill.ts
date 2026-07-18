// CRAFT DA SKILL → perfil-de-voz.md (fechar a corrente skill→fundação→escritor).
//
// O escritor (runner `prompt_escrita_capitulo`) lê SÓ a fundação do projeto, nunca a
// craft da skill (`voz-e-oficio.md`/`metamodelo-thriller.md` etc.). E `criar_fundacao`
// passa `skill_escrita` como ETIQUETA, sem obrigar o arquiteto a ingerir a craft. Logo
// o DNA da skill chega diluído (a paráfrase solta do arquiteto) ou não chega.
//
// Aqui, deterministicamente (espelha normalizarVozRegra4), injetamos no perfil-de-voz.md
// um RESUMO DE CRAFT da skill escolhida — motor + regras como ALVO POSITIVO concreto —
// no doc que o escritor de fato lê. Idempotente (marcador), agnóstico de skill.
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { orcCadenciaParaSkill, type OrcamentoCadencia } from "./maneirismo.js";

export const MARCADOR_CRAFT = "<!-- CRAFT-SKILL v1 -->";
// v2 = v1 + ORÇAMENTO DE PÁGINA (números por capítulo na caneta — a auditoria na
// página provou que a craft qualitativa não segura o opus: 3 de 4 capítulos de
// teste estouraram "coisa"/símile-andaime/antítese MESMO lendo as references).
export const MARCADOR_CRAFT_V2 = "<!-- CRAFT-SKILL v2 -->";
export const MARCADOR_CRAFT_FIM = "<!-- /CRAFT-SKILL -->";

// Resumo curado da craft, por skill. Cada bloco é o ALVO POSITIVO que o escritor segue.
// (Curado a partir das references de cada skill — não substitui a skill, concentra o DNA.)
export const CRAFT_POR_SKILL: Record<string, string> = {
  "skill-dan-brown": `### Motor (capítulo a capítulo)
- **Capítulo curto e propulsivo:** UMA virada, **gancho honesto** no fim (a banda de palavras é a da Estrutura DESTE projeto — respeite o piso).
- **Montagem paralela:** 2–4 fios de POV; **corte no PICO** (antes da resolução), não depois — alterne cena/POV entre capítulos, não narre linear-contemplativo.
- **Relógio comprimido:** 12–48h, ameaça contínua e visível na cena.
- **Cold open:** planta o enigma/morte central nas primeiras páginas.
- **Caça ao tesouro:** pista → decifração → nova pista → obstáculo maior (escada de enigmas).
- **Especialista sob fogo:** o conhecimento RESOLVE o problema sob pressão — nunca exibição/erudição decorativa.
- **Escalada em 3 níveis:** pessoal (ferida do herói) + institucional (segredo) + simbólica (a ideia maior).

### As 5 Regras (o DELTA — alvo POSITIVO, não só "evitar")
1. **Fair-play honesto:** a câmera está na cabeça do POV; tudo o que ele percebe/pensa AGORA, o leitor percebe agora. **Proibido o falso gancho** (esconder do leitor o que o POV já sabe).
2. **Exposição dramatizada:** toda informação entra **a serviço de um problema da cena agora** — por conflito, descoberta ou perda. Zero palestra/info-dump.
3. **Interioridade COM CUSTO:** cada personagem central tem ferida, contradição e custo. Pergunte sempre **"o que isto custou ao POV por dentro?"** — mas o custo aparece em AÇÃO/ESCOLHA, não em sensação sobre sensação.
4. **Prosa transparente, ritmo variado:** maioria de frases declarativas simples (o leitor lê ATRAVÉS da frase para o evento); varie o comprimento de propósito. A revelação pode alongar UMA frase — **sem empilhar apostos nem reformular a mesma percepção** (a frase-sanfona é defeito). Narrador invisível: sem máxima/aforismo, sem personificação de abstração, sem adjetivo moral em objeto. Metáfora ≈≤1/página, nunca em cadeia. Cota: ≤2–3 itálicos, ≤1–2 perguntas retóricas, ≤1–2 fragmentos (nunca dois colados). Mate o clichê — a alternativa default não é imagem nova, é frase direta sem imagem.
5. **Sem coincidência:** causalidade, não conveniência — toda revelação tem pista plantada antes; salvação vem de habilidade/objeto pré-estabelecido.

> Teste por capítulo: algo ACONTECE (evento/virada/pista), corta no pico, termina em gancho honesto. Se o capítulo só descreve/sente sem avançar a caça, está fora da craft.`,

  "skill-jk-rowling": `### Craft (prosa imersiva — "a respiração")
- **Cadência fluida:** 3ª pessoa PRÓXIMA, calor e ternura no fio do narrador; alterne frase longa encadeada e curta com naturalidade.
- **Detalhe concreto e encantado:** o mundo entra por objetos e sensações específicas, não por adjetivo genérico.
- **Humor e afeto:** leveza no narrador mesmo na tensão; personagem ganha simpatia por gesto, não por descrição.
- **Prenúncio de longo alcance:** plantar-e-pagar — detalhes pequenos que retornam com peso.
- **Ganchos de capítulo + revelação dosada:** entregue informação no tempo certo, nunca de uma vez.
- **Evite:** info-dump, ironia fria, distanciamento clínico — a marca é a imersão calorosa.`,

  "hoover-mcfadden": `### Craft (thriller-romance + narradora não-confiável)
- **Emoção crua (Hoover) + maquinaria de suspense (McFadden):** a intimidade dói e o enredo aperta ao mesmo tempo.
- **1ª pessoa PRESENTE + DIA/HORA no topo:** a narração de Helena é no PRESENTE (pretérito é defeito de voz); todo capítulo abre ancorado no relógio (DIA N — HHhMM) e o tempo avança.
- **Narradora NÃO-confiável com fair-play:** o que ela omite/distorce é jogável — o leitor tem o que ela percebe AGORA; o twist se sustenta na releitura, sem trapaça.
- **Três relógios NOMEADOS (dono + deadline), ≥1 move por capítulo:** (A) a janela cirúrgica, (B) a doença da própria narradora, (C) o antagonista — concorrentes e visíveis na cena, cada um apertando ato a ato.
- **Fio-M de memória** intercalado (itálico, voz secundária, fragmentos) contrapondo o presente — isento do piso de densidade.
- **Gancho por capítulo + corte no pico**; capítulos curtos e densos (piso 2.000 nos de Helena).
- **Custo emocional aterrissado:** a dor tem consequência, nunca melodrama gratuito.
- **Twist plantado:** toda revelação puxa uma pista semeada antes (Tabela de Pistas); releitura faz sentido duplo.`,

  "skill-romantasy": `### Craft (fantasia romântica de página-vira)
- **Dois arcos entrelaçados:** o romance de alto risco E a fantasia épica — cada capítulo avança um, idealmente os dois.
- **POV duplo, troca só com INFORMAÇÃO NOVA:** alterne os amantes; nunca 2 capítulos seguidos no mesmo (sem justificativa) e nunca reconte a mesma cena pela outra cabeça.
- **Slow burn sobe só por MÉRITO:** cada degrau de aproximação é ganho por evento/escolha, dosado — nunca resolução precoce nem salto sem causa.
- **Magia de CUSTO pago e CRESCENTE:** todo poder decisivo paga um preço concreto plantado antes, e o custo ESCALA a cada uso (poder novo conveniente = deus-ex).
- **Frase-soco (a voz BookTok):** o fragmento de ênfase é assinatura — use-o com pontaria, sem virar staccato vazio.
- **Gancho cruel no fim de cada capítulo** (apelo BookTok), diferente dos anteriores.
- **Fair-play da trama E do romance:** viradas plantadas; a química nasce de cena, não de declaração.
- **Troque a muleta pelo concreto:** "coisa"/"algo" ≤1 por capítulo — nomeie o objeto, o gesto, a sensação.`,

  "vesper-escritor-de-capitulos": `### Craft (trilogia VÉSPER, spec-driven)
- **Voz e léxico canônicos:** mantenha o vocabulário/mundo da Bíblia estáveis ao longo da trilogia.
- **Revelação progressiva:** entregue o mistério em degraus; nada de despejo.
- **Continuidade dura:** fios, fatos e relógios coerentes com o estado-narrativo.
- **Gancho por capítulo; ritmo variado; corte no pico.**
- **Fidelidade à spec do capítulo** (PdV, beat, marco) antes de qualquer floreio.`,
};

// ----------------------------------------------------------------------------
// GATE DE CONSISTÊNCIA DE VOZ (genérico — vale para QUALQUER skill_escrita).
//
// A auditoria achou a causa raiz de "não parece com a skill escolhida": nada cruzava
// o perfil-de-voz.md do projeto (escrito pelo autor/arquiteto) contra o REGISTRO que a
// skill_escrita declara. Este mecanismo é skill-AGNÓSTICO: uma tabela de dados (um registro
// por skill, mesmo padrão de CRAFT_POR_SKILL) + funções puras. Adicionar uma skill nova =
// UMA linha de dado, zero código condicional. NÃO bloqueia (espelha o gate de ambição):
// força a decisão consciente registrada na Bíblia. Nada aqui condiciona por skill específica.
// ----------------------------------------------------------------------------

// O registro de voz que CADA skill declara (curado do DNA em CRAFT_POR_SKILL / references).
// Uma linha por skill — o mesmo padrão data-driven. Skill fora do mapa = sem registro (no-op).
export const REGISTRO_VOZ_POR_SKILL: Record<string, string> = {
  "skill-dan-brown":
    "thriller de enigma/conspiração — prosa FUNCIONAL e propulsiva, exposição dramatizada, " +
    "interioridade COM CUSTO ancorada em ação, montagem paralela e relógio comprimido; NÃO lírica-contemplativa.",
  "skill-jk-rowling":
    "prosa imersiva e CALOROSA — 3ª pessoa próxima, ternura e humor no narrador, detalhe " +
    "concreto e encantado, cadência fluida; NÃO fria/clínica.",
  "hoover-mcfadden":
    "thriller-romance INTIMISTA — 1ª pessoa PRESENTE, emoção crua, narradora não-confiável " +
    "com fair-play, relógios nomeados apertando a cada capítulo.",
  "skill-romantasy":
    "fantasia romântica página-vira — POV DUPLO dos amantes, slow burn por mérito, magia de " +
    "custo crescente, frase-soco (voz BookTok), gancho cruel por capítulo.",
  "vesper-escritor-de-capitulos":
    "trilogia spec-driven — voz e léxico CANÔNICOS estáveis, revelação progressiva em degraus, " +
    "continuidade dura com o estado-narrativo.",
};

export const MARCADOR_VOZ_CONSISTENCIA = "<!-- VOZ-CONSISTENCIA v1 -->";

/** O registro de voz declarado pela skill (null se a skill não está no mapa — no-op). */
export function registroVozDaSkill(skill: string | null | undefined): string | null {
  return (skill && REGISTRO_VOZ_POR_SKILL[skill]) || null;
}

/** true se a Bíblia já registrou um veredito de consistência de voz (alinhado OU divergência). */
export function vozConsistenciaRegistrada(bibliaTexto: string | null | undefined): boolean {
  return (bibliaTexto ?? "").includes(MARCADOR_VOZ_CONSISTENCIA);
}

export interface GateConsistenciaVoz {
  registroSkill: string;      // o que a skill_escrita declara
  pergunta: string;           // a comparação a apresentar ao autor (mesma p/ toda skill)
  marcador: string;           // marcador a gravar no Diagnóstico de Fundação
}

/**
 * Monta a comparação genérica "a skill declara X; seu perfil declara Y; alinhado ou
 * divergência consciente?". `resumoPerfil` = 1 linha do que o perfil-de-voz.md do projeto
 * declara (o arquiteto extrai na entrevista). null se a skill não tem registro (no-op).
 * O texto da pergunta é o MESMO para toda skill — só o registro injetado muda (data-driven).
 */
export function montarGateConsistenciaVoz(
  skill: string | null | undefined,
  resumoPerfil?: string | null,
): GateConsistenciaVoz | null {
  const registroSkill = registroVozDaSkill(skill);
  if (!registroSkill) return null;
  const perfilLinha = (resumoPerfil ?? "").trim() || "<resumo do perfil-de-voz.md deste projeto>";
  const pergunta =
    `A skill de escrita \`${skill}\` declara este registro de voz:\n` +
    `  • ${registroSkill}\n` +
    `O \`perfil-de-voz.md\` que você definiu declara este outro:\n` +
    `  • ${perfilLinha}\n` +
    `Eles estão ALINHADOS, ou você está escolhendo DIVERGIR de propósito? ` +
    `Registre a escolha (não bloqueia a geração; força a decisão consciente).`;
  return { registroSkill, pergunta, marcador: MARCADOR_VOZ_CONSISTENCIA };
}

export interface SinalVozConsistencia { precisaRegistrar: boolean; aviso?: string }

/**
 * Sinal NÃO-bloqueante para a engine: se a skill tem registro de voz E a Bíblia ainda não
 * gravou o veredito, avisa que a decisão de consistência precisa ser registrada. Espelha o
 * padrão de sinalização de docsFundacao (nunca gera/decide — só sinaliza). Genérico.
 */
export function sinalConsistenciaVoz(
  bibliaTexto: string | null | undefined,
  skill: string | null | undefined,
): SinalVozConsistencia {
  if (!registroVozDaSkill(skill)) return { precisaRegistrar: false }; // skill sem registro: no-op
  if (vozConsistenciaRegistrada(bibliaTexto)) return { precisaRegistrar: false };
  return {
    precisaRegistrar: true,
    aviso: `consistência de voz vs skill \`${skill}\` NÃO registrada no Diagnóstico de Fundação ` +
      `(grave "${MARCADOR_VOZ_CONSISTENCIA} alinhado" ou "…divergência consciente: <o quê/por quê>")`,
  };
}

// Detecta se o perfil já tem o bloco de craft (marcador v1 ou v2). Idempotente.
export function temCraft(conteudo: string): boolean {
  const t = conteudo ?? "";
  return t.includes(MARCADOR_CRAFT) || t.includes(MARCADOR_CRAFT_V2);
}

// ORÇAMENTO DE PÁGINA: os NÚMEROS que o gate mede, na caneta do escritor — como
// alvo positivo, não lista de banimento. Muletas/moldes são fixos (molde de IA é
// molde em qualquer skill); a cota de ritmo vem do orçamento DA SKILL (SPEC-05),
// então o alvo do escritor é exatamente o que o detector cobra.
export function blocoOrcamentoPagina(skill: string, orc: OrcamentoCadencia = orcCadenciaParaSkill(skill)): string {
  const colados = orc.fragColados <= 0 ? "nunca dois colados" : `≤${orc.fragColados} pares colados`;
  return `### ORÇAMENTO DE PÁGINA (por capítulo — o gate mede por NÚMERO)
Uma imagem forte vale mais que três; troque a muleta pelo referente concreto (objeto, gesto, ideia).
- **Muletas/moldes:** "coisa"/"coisas" ≤1 · símile-andaime ("como se"/"como quem") ≤1 · antítese "Não era X. Era Y." ≤1 · anáfora colada ≤${orc.anafora} par(es).
- **Ritmo:** fragmentos de ênfase ≤${orc.fragEnfase} (${colados}) · pensamento em itálico ≤${orc.italico} · pergunta retórica ≤${orc.retorica} · frases curtas até ~${Math.round(orc.staccatoFrac * 100)}% da narração.`;
}

// Injeta o bloco de craft da skill no fim do perfil, se a skill for conhecida e o bloco
// ainda não existir. Skill desconhecida / "nenhuma" → no-op (não inventa craft).
// Reconhece o bloco v1 e faz UPGRADE in-place (v1 → v2 + orçamento), sem duplicar.
// Upgrades in-place de CONTEÚDO do bloco já injetado (auditoria de estilo, CR4):
// a Regra 4 de dan-brown deixou de pedir "revelação respira em frase longa"
// (indutor de sanfona) e passou a pedir prosa transparente. Match por conteúdo ⇒
// idempotente (a string antiga some após a troca), sem bump de marcador.
const _UPGRADES_CRAFT_CONTEUDO: [string, string][] = [
  [
    "4. **Prosa fresca, ritmo variado:** varie o comprimento da frase de propósito; revelação respira em frase longa. Cota: ≤2–3 itálicos, ≤1–2 perguntas retóricas, ≤1–2 fragmentos (nunca dois colados). Mate o clichê.",
    "4. **Prosa transparente, ritmo variado:** maioria de frases declarativas simples (o leitor lê ATRAVÉS da frase para o evento); varie o comprimento de propósito. A revelação pode alongar UMA frase — **sem empilhar apostos nem reformular a mesma percepção** (a frase-sanfona é defeito). Narrador invisível: sem máxima/aforismo, sem personificação de abstração, sem adjetivo moral em objeto. Metáfora ≈≤1/página, nunca em cadeia. Cota: ≤2–3 itálicos, ≤1–2 perguntas retóricas, ≤1–2 fragmentos (nunca dois colados). Mate o clichê — a alternativa default não é imagem nova, é frase direta sem imagem.",
  ],
];

export function garantirCraftNoPerfil(conteudo: string, skill: string | null | undefined): { texto: string; mudou: boolean } {
  const corpo = skill ? CRAFT_POR_SKILL[skill] : undefined;
  if (!corpo) return { texto: conteudo ?? "", mudou: false };
  const t = conteudo ?? "";
  if (t.includes(MARCADOR_CRAFT_V2)) {
    let texto = t, mudou = false;
    for (const [antiga, nova] of _UPGRADES_CRAFT_CONTEUDO) {
      if (texto.includes(antiga)) { texto = texto.replace(antiga, nova); mudou = true; }
    }
    return { texto, mudou };
  }
  const orcamento = blocoOrcamentoPagina(skill!);
  if (t.includes(MARCADOR_CRAFT)) {
    // upgrade v1 → v2: soma o orçamento ao bloco existente (fecho como âncora).
    const texto = t
      .replace(MARCADOR_CRAFT, MARCADOR_CRAFT_V2)
      .replace(MARCADOR_CRAFT_FIM, `${orcamento}\n\n${MARCADOR_CRAFT_FIM}`);
    return { texto, mudou: true };
  }
  const bloco =
    `${MARCADOR_CRAFT_V2}\n\n## CRAFT DA SKILL \`${skill}\` (motor + regras — ALVO do escritor)\n\n` +
    `> O \`livro-escritor\` ESCREVE seguindo este bloco (a craft da skill, concentrada). ` +
    `Não é decoração: é o padrão que o capítulo precisa cumprir.\n\n` +
    `${corpo}\n\n${orcamento}\n\n${MARCADOR_CRAFT_FIM}`;
  return { texto: t.replace(/\s*$/, "") + "\n\n" + bloco + "\n", mudou: true };
}

export interface CraftAjuste { arquivo: string; mudou: boolean; skill: string | null; reconhecida: boolean }

// Garante o bloco de craft no perfil-de-voz.md de um projeto (idempotente).
export async function normalizarCraftSkill(projDir: string, skill: string | null | undefined): Promise<CraftAjuste> {
  const reconhecida = !!(skill && CRAFT_POR_SKILL[skill]);
  const perfilPath = path.join(projDir, "perfil-de-voz.md");
  let conteudo: string;
  try {
    conteudo = await readFile(perfilPath, "utf8");
  } catch {
    return { arquivo: "perfil-de-voz.md", mudou: false, skill: skill ?? null, reconhecida };
  }
  const { texto, mudou } = garantirCraftNoPerfil(conteudo, skill);
  if (mudou) await writeFile(perfilPath, texto, "utf8");
  return { arquivo: "perfil-de-voz.md", mudou, skill: skill ?? null, reconhecida };
}
