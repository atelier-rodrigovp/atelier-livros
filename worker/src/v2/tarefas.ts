// Engine V2 — templates de tarefa por papel (F3).
// Genéricos por PAPEL, nunca por skill: tudo que é específico da skill chega pelo
// pacote compilado (contrato → instruções; perfil/ficha/fatos → seções).

import type { SceneSpec, SkillContract } from "./tipos.js";

/** Arquiteto de cena: produz a ficha estruturada (scene-spec/v1) — SEM prosa. */
export function tarefaArquitetoCena(capitulo: number, contrato: SkillContract): string {
  const camposSkill = contrato.estruturas_exigidas?.campos_spec ?? [];
  return [
    `Produza a FICHA DE CENA do capítulo ${capitulo} como JSON válido no schema "scene-spec/v1".`,
    `Campos obrigatórios: pov, local, tempo, objetivo, obstaculo, acao_fisica, informacao_nova, virada, mudanca_estado, gancho {tipo, descricao}, fatos_obrigatorios[], conhecimentos_proibidos[], fios_avancados[], fios_ausentes[].`,
    camposSkill.length ? `Campos extras desta skill em campos_skill: ${camposSkill.map((c) => `"${c}"`).join(", ")}.` : "",
    `gancho.tipo deve ser um de: ${contrato.tipos_gancho.join(", ")}.`,
    `REGRAS DURAS: a ficha APONTA, não redige. Proibido: metáfora, aforismo, diálogo pronto, frase de abertura/encerramento, pensamento redigido, parágrafo-modelo, alternativas de prosa. Campos com no máximo ~40 palavras.`,
    `Responda APENAS o JSON (sem cerca de código, sem comentário).`,
  ].filter(Boolean).join("\n");
}

/** Contextualizador: só fatos e continuidade — proibido escrever prosa. */
export function tarefaContextualizador(capitulo: number): string {
  return [
    `Selecione o contexto factual mínimo para escrever o capítulo ${capitulo}.`,
    `Responda APENAS JSON: { "fatos": [{"fato": string, "origem": string}], "continuidade": [{"item": string, "origem": string}], "repeticoes_recentes": [string] }.`,
    `- "fatos": fatos estabelecidos que este capítulo NÃO pode contradizer (nomes, datas, lugares, quem sabe o quê).`,
    `- "continuidade": estados abertos que este capítulo toca (objetos, ferimentos, promessas, posições).`,
    `- "repeticoes_recentes": frases/imagens marcantes já usadas que o escritor não deve repetir.`,
    `REGRAS DURAS: você NÃO escreve prosa, metáfora, imagem, pensamento ou frase literária. Só fato seco com origem (documento/capítulo). Máx 15 itens por lista.`,
  ].join("\n");
}

/** Escritor: o ÚNICO papel autorizado a produzir prosa. */
export function tarefaEscritor(ficha: SceneSpec, contrato: SkillContract): string {
  const faixa = contrato.faixa_palavras;
  return [
    `Escreva o capítulo ${ficha.capitulo} em prosa final, em português brasileiro, seguindo a FICHA DA CENA e as instruções do pacote.`,
    `Extensão: ${faixa.min ?? "?"}–${faixa.max ?? "?"} palavras${faixa.alvo ? ` (alvo ${faixa.alvo})` : ""}.`,
    `A cena deve cumprir: objetivo, obstáculo, ação física principal, informação nova, virada, mudança de estado e gancho final do tipo "${ficha.gancho.tipo}".`,
    `Não mencione a ficha, o pacote ou o processo. Não use títulos além de "## Capítulo ${ficha.capitulo}" na primeira linha.`,
    `Responda APENAS a prosa do capítulo (com o título na primeira linha).`,
  ].join("\n");
}

export type ModoCorrecao = "cirurgico" | "reescrita";

/**
 * Escritor em modo correção. Dois modos, escolhidos pelo PIPELINE (nunca pelo modelo):
 * - "cirurgico": lista localizada; preserva todo o resto palavra por palavra.
 * - "reescrita": há instrução global (cadência/cota difusa no capítulo inteiro) —
 *   "preserve tudo palavra por palavra" seria incompatível com a meta; preserva
 *   eventos, fatos, diálogo e estrutura da ficha; reescreve a superfície da prosa.
 */
export function tarefaEscritorCorrecao(
  capitulo: number,
  correcoes: { local: string; problema: string; instrucao: string }[],
  textoAtual: string,
  modo: ModoCorrecao = "cirurgico"
): string {
  const cabecalho =
    modo === "reescrita"
      ? [
          `Reescreva o capítulo ${capitulo} abaixo para eliminar os problemas listados.`,
          `PRESERVE integralmente: os eventos e a ordem deles, os fatos, as falas de diálogo (conteúdo) e a estrutura da cena (objetivo, virada, gancho).`,
          `REESCREVA livremente a superfície da prosa (frases, cadência, imagens) até cumprir as metas globais listadas — fundir fragmentos, cortar reformulações e trocar fechos são permitidos e esperados.`,
        ]
      : [`Revise o capítulo ${capitulo} abaixo aplicando SOMENTE as correções listadas. Preserve todo o resto palavra por palavra.`];
  return [
    ...cabecalho,
    `## CORREÇÕES`,
    ...correcoes.map((c, i) => `${i + 1}. [${c.local}] ${c.problema} → ${c.instrucao}`),
    `## TEXTO ATUAL`,
    textoAtual,
    `Responda APENAS a prosa completa corrigida (com o título na primeira linha).`,
  ].join("\n");
}

/** Revisor literário: parecer estruturado (parecer/v1) com disposição de cada sinal. */
export function tarefaRevisor(capitulo: number, resumoSinais: string, contrato: SkillContract): string {
  return [
    `Avalie o capítulo ${capitulo} (seção TEXTO A AVALIAR) contra o contrato da skill e a ficha.`,
    `Responda APENAS JSON no schema "parecer/v1": { "schema":"parecer/v1", "dramatic_progression":{"nota":0-5,"evidencia":string}, "skill_adherence":{...}, "clarity":{...}, "emotional_effect":{...}, "continuity":{...}, "hook_effectiveness":{...}, "verdict":"aprovado"|"aprovado_com_excecao"|"reprovado"|"necessita_decisao_humana", "evidencias":[{"local","trecho","observacao"}], "sinais":[{"sinal","valor","disposicao","evidencia"}], "correcoes":[{"local","problema","instrucao"}] }.`,
    `## SINAIS MEDIDOS (medições determinísticas reais — disponha cada um)`,
    resumoSinais,
    `Para cada sinal medido acima, inclua um item em "sinais" com disposicao: "violacao_confirmada" (o sinal é defeito real AQUI), "excecao_valida" (a cena justifica; explique), "falso_positivo" (o detector errou; explique) ou "necessita_decisao_humana".`,
    `"necessita_decisao_humana" é RARO: reserve para escolha genuinamente autoral (voz, exceção de contrato, rumo da trama). Defeito de ofício corrigível (tique, cota estourada, cena morta) é "violacao_confirmada" + entrada em "correcoes" + veredito "reprovado" — a correção dirigida resolve sem parar a produção.`,
    `REGRAS DO VEREDITO:`,
    `- "aprovado" exige evidência POSITIVA em "evidencias" (o que está vivo e funciona, localizado) — ausência de defeito não basta.`,
    `- Qualquer "violacao_confirmada" exige entrada correspondente em "correcoes" e veredito "reprovado".`,
    `- Capítulo competente mas MORTO (sem evento, sem avanço) reprova mesmo dentro das cotas.`,
    `- Julgue aderência à skill pelo contrato do pacote (testes positivos: ${contrato.testes_positivos.slice(0, 4).join("; ") || "—"}).`,
  ].join("\n");
}

/** Arquiteto de enredo: fundação mínima (perfil de voz + estrutura), sem semear ornamento. */
export function tarefaArquitetoEnredo(briefing: { titulo: string; premissa: string; totalCapitulos: number }, contrato: SkillContract): string {
  return [
    `Monte a fundação mínima do livro "${briefing.titulo}" (${briefing.totalCapitulos} capítulos) para a skill do pacote.`,
    `Premissa do autor: ${briefing.premissa}`,
    `Responda APENAS JSON: { "perfil_voz": string, "estrutura": [{"capitulo": number, "fio": string, "resumo_estrutural": string}], "fios": [string], "promessa_editorial": string }.`,
    `- "perfil_voz": descrição de voz em markdown curto (≤300 palavras) coerente com o contrato (${contrato.familia_editorial}; ${contrato.acao_interioridade.relacao}). PROIBIDO incluir parágrafos-modelo, aforismos ou frases de exemplo — a fundação não semeia ornamento (o perfil descreve, não demonstra).`,
    `- "estrutura": um item por capítulo; "resumo_estrutural" aponta objetivo/virada em ≤25 palavras, sem prosa.`,
    `- "fios": nomes dos fios narrativos${contrato.pov.rotacao ? ` (entre ${contrato.pov.rotacao.fios_min} e ${contrato.pov.rotacao.fios_max})` : ""}.`,
  ].join("\n");
}

/** Auditor factual: contradições comprovadas, conhecimento indevido, POV. */
export function tarefaAuditorFactual(capitulo: number): string {
  return [
    `Audite o capítulo ${capitulo} (seção TEXTO A AVALIAR) contra os FATOS e a ficha do pacote.`,
    `Responda APENAS JSON: { "contradicoes": [{"fato_estabelecido": string, "trecho_do_capitulo": string, "gravidade": "bloqueante"|"aviso"}], "conhecimento_indevido": [{"quem": string, "sabe_o_que_nao_deveria": string, "trecho": string}], "pov_violado": {"ha": boolean, "detalhe": string} }.`,
    `Só aponte contradição COMPROVADA pelo material do pacote (cite o fato e o trecho). Não julgue estilo.`,
  ].join("\n");
}
