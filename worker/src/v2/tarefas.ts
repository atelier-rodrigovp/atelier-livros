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

/** Canário de voz (wizard): UMA cena curta de amostra da voz do contrato, pré-fundação. */
export function tarefaCanarioVoz(ideia: string, contrato: SkillContract): string {
  return [
    `Escreva UMA cena curta de amostra (300–500 palavras), em português brasileiro, demonstrando a VOZ desta skill para a ideia do autor.`,
    `Ideia do autor: ${ideia}`,
    `A cena deve ter: um objetivo concreto, um obstáculo, uma virada e um gancho final (tipo permitido: ${contrato.tipos_gancho.join(", ")}).`,
    `É uma AMOSTRA de voz, não o capítulo 1: personagens podem ser provisórios; a voz e a cadência do contrato são o que está em prova.`,
    `Não mencione o processo, a skill ou o pacote. Sem título.`,
    `Responda APENAS a prosa da cena.`,
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
    `REGRA DOS SINAIS DE CONTAGEM (sanfona, gnômico, personificação, metáfora, cadência): o NÚMERO do detector NUNCA confirma violação sozinho — detectores por regex supercontam (enumerações e acúmulos legítimos contam como tique). Para dispor "violacao_confirmada" você deve CITAR na "evidencia" cada ocorrência que julgou defeito real (trecho literal) e justificar semanticamente; ocorrência que você não citar conta como falso positivo. Se, lidas as ocorrências, nenhuma for defeito real, a disposição correta é "falso_positivo" mesmo com contagem acima da cota.`,
    `"necessita_decisao_humana" é RARO: reserve para escolha genuinamente autoral (voz, exceção de contrato, rumo da trama). Defeito de ofício corrigível (tique, cota estourada, cena morta) é "violacao_confirmada" + entrada em "correcoes" + veredito "reprovado" — a correção dirigida resolve sem parar a produção.`,
    `REGRAS DO VEREDITO:`,
    `- "aprovado" exige evidência POSITIVA em "evidencias" (o que está vivo e funciona, localizado) — ausência de defeito não basta.`,
    `- Qualquer "violacao_confirmada" exige entrada correspondente em "correcoes" e veredito "reprovado".`,
    `- Capítulo competente mas MORTO (sem evento, sem avanço) reprova mesmo dentro das cotas.`,
    `- Julgue aderência à skill pelo contrato do pacote (testes positivos: ${contrato.testes_positivos.slice(0, 4).join("; ") || "—"}).`,
  ].join("\n");
}

/**
 * Avaliador de livro (meta-nota): porta a rubrica REAL do book-bestseller-review —
 * dez dimensões independentes (8 majors + 2 modificadores), cada uma com evidência
 * citada do manuscrito. O CÓDIGO calcula a média ponderada e aplica o floor
 * principle (meta9.ts) — o modelo nunca soma a própria nota.
 */
export function tarefaAvaliadorLivro(meta: number, contrato: SkillContract): string {
  return [
    `Avalie o LIVRO COMPLETO (seção MANUSCRITO) como um editor comercial adversarial, na rubrica de prontidão bestseller.`,
    `Responda APENAS JSON no schema "avaliacao-livro/v2": { "schema":"avaliacao-livro/v2", "dimensoes": { "hook_abertura":{"nota":1-10,"evidencia":string}, "premissa_originalidade":{...}, "estrutura_ritmo":{...}, "personagens":{...}, "prosa_oficio":{...}, "payoff":{...}, "coerencia_consistencia":{...}, "final":{...}, "encaixe_mercado":{...}, "acabamento":{...} }, "pontos_fortes": [string], "pontos_fracos": [string], "capitulos_a_reescrever": [{"capitulo": number, "problemas": [string], "instrucoes": [string]}], "resumo": string }.`,
    `REGRAS DA RUBRICA:`,
    `- Cada dimensão exige EVIDÊNCIA com citação/localização específica do manuscrito — nota sem evidência é inválida.`,
    `- Sem inflação: 7 já é um livro genuinamente competitivo; primeiras versões honestas ficam entre 4 e 6; reserve 9–10 para força excepcional REAL naquela dimensão.`,
    `- Avalie o que está NA PÁGINA, não o potencial.`,
    `- Julgue aderência de gênero pelo contrato do pacote (família: ${contrato.familia_editorial}).`,
    `- "capitulos_a_reescrever": APENAS capítulos cuja reescrita muda a nota do livro, com problemas localizados e instruções objetivas.`,
    `- NÃO calcule média nem veredito — o sistema calcula (meta do projeto: ${meta}).`,
  ].join("\n");
}

/** Síntese de arco (manuscritos longos): consolida avaliações de blocos numa visão do livro inteiro. */
export function tarefaSinteseArco(totalBlocos: number): string {
  return [
    `Você recebeu as avaliações por BLOCO (${totalBlocos} blocos, seção AVALIAÇÕES POR BLOCO) e o material de arco (primeiro e último capítulo integrais + fichas).`,
    `Produza a avaliação FINAL do livro inteiro no MESMO schema "avaliacao-livro/v2" (dimensões com evidência).`,
    `As dimensões de ARCO (estrutura_ritmo, payoff, coerencia_consistencia, final) devem julgar o TODO — progressão entre blocos, promessas plantadas vs pagas, consistência cruzada — não a média dos blocos.`,
    `Responda APENAS o JSON.`,
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

/** Editor estrutural: PROPÕE corte/reordenação de capítulos inteiros — nunca escreve prosa. */
export function tarefaEditorEstrutural(totalCaps: number, contrato: SkillContract): string {
  return [
    `Avalie a MACRO-ESTRUTURA do livro completo (${totalCaps} capítulos) — seção CAPÍTULOS — e proponha edições estruturais.`,
    `Você PROPÕE; você NÃO escreve prosa. Saída APENAS JSON no schema "structural-edit/v1": { "schema":"structural-edit/v1", "propostas":[{"tipo":"nenhuma"|"corte"|"reordenacao","capitulos":[number],"nova_ordem"?:[number],"justificativa":string}] }.`,
    `REGRAS DURAS:`,
    `- PROIBIDO propor fusão, reescrita ou qualquer prosa. Só é permitido cortar um capítulo inteiro OU reordenar capítulos.`,
    `- "corte": SOMENTE com justificativa estrutural forte — capítulo redundante que não avança nenhum fio. "capitulos" lista o(s) número(s) a cortar.`,
    `- "reordenacao": "nova_ordem" traz TODOS os números de 1 a ${totalCaps} (menos os cortados) exatamente uma vez, na nova sequência.`,
    `- Na dúvida, responda [{"tipo":"nenhuma","capitulos":[],"justificativa":"estrutura sólida; sem corte nem reordenação"}].`,
    `Julgue pela família editorial "${contrato.familia_editorial}" e pelo motor narrativo "${contrato.motor_narrativo}".`,
    `Responda APENAS o JSON (sem cerca de código, sem comentário).`,
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
