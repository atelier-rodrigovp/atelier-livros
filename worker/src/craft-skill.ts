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
4. **Prosa fresca, ritmo variado:** varie o comprimento da frase de propósito; revelação respira em frase longa. Cota: ≤2–3 itálicos, ≤1–2 perguntas retóricas, ≤1–2 fragmentos (nunca dois colados). Mate o clichê.
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
- **Narradora NÃO-confiável com fair-play:** o que ela omite/distorce é jogável — o twist se sustenta na releitura, sem trapaça.
- **Três relógios:** mantenha 2–3 contagens regressivas concorrentes visíveis.
- **Gancho por capítulo + corte no pico**; capítulos curtos.
- **Custo emocional aterrissado:** a dor tem consequência, nunca melodrama gratuito.
- **Twist plantado:** toda virada tem rastro anterior; releitura faz sentido duplo.`,

  "skill-romantasy": `### Craft (fantasia romântica de página-vira)
- **Dois arcos entrelaçados:** o romance de alto risco E a fantasia épica — cada capítulo avança um, idealmente os dois.
- **POV duplo** entre os amantes; **slow burn calibrado** (marcos de aproximação dosados).
- **Magia de CUSTO:** todo poder cobra um preço concreto e crescente.
- **Gancho cruel no fim de cada capítulo** (apelo BookTok).
- **Fair-play da trama E do romance:** viradas plantadas; a química nasce de cena, não de declaração.`,

  "vesper-escritor-de-capitulos": `### Craft (trilogia VÉSPER, spec-driven)
- **Voz e léxico canônicos:** mantenha o vocabulário/mundo da Bíblia estáveis ao longo da trilogia.
- **Revelação progressiva:** entregue o mistério em degraus; nada de despejo.
- **Continuidade dura:** fios, fatos e relógios coerentes com o estado-narrativo.
- **Gancho por capítulo; ritmo variado; corte no pico.**
- **Fidelidade à spec do capítulo** (PdV, beat, marco) antes de qualquer floreio.`,
};

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
export function garantirCraftNoPerfil(conteudo: string, skill: string | null | undefined): { texto: string; mudou: boolean } {
  const corpo = skill ? CRAFT_POR_SKILL[skill] : undefined;
  if (!corpo) return { texto: conteudo ?? "", mudou: false };
  const t = conteudo ?? "";
  if (t.includes(MARCADOR_CRAFT_V2)) return { texto: t, mudou: false };
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
