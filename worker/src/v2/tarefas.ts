// Engine V2 — templates de tarefa por papel (F3).
// Genéricos por PAPEL, nunca por skill: tudo que é específico da skill chega pelo
// pacote compilado (contrato → instruções; perfil/ficha/fatos → seções).

import { nomeIdioma, type BriefingFundacao } from "./briefing.js";
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

/**
 * Contextualizador: só fatos e continuidade — proibido escrever prosa.
 *
 * Ele SELECIONA do material do pacote; não lembra nem deduz. O pacote passou a
 * trazer BÍBLIA, MAPA, ESTRUTURA, LEDGER DE REVELAÇÕES e as fichas condensadas dos
 * capítulos anteriores — antes ele recebia zero capítulo e era instruído a listar
 * "fatos com origem" e "repetições recentes", o que só podia sair de invenção
 * (raiz do diagnóstico). Cada lista abaixo está amarrada a uma seção que existe no
 * pacote, e a origem tem de citá-la.
 */
export function tarefaContextualizador(capitulo: number): string {
  return [
    `Selecione o contexto factual mínimo para escrever o capítulo ${capitulo}.`,
    `Responda APENAS JSON: { "fatos": [{"fato": string, "origem": string}], "continuidade": [{"item": string, "origem": string}], "repeticoes_recentes": [string] }.`,
    `- "fatos": fatos estabelecidos que este capítulo NÃO pode contradizer (nomes, datas, lugares, quem sabe o quê).`,
    `- "continuidade": estados abertos que este capítulo toca (objetos, ferimentos, promessas, posições).`,
    `- "repeticoes_recentes": informações que o LEDGER DE REVELAÇÕES registra como já entregues ao leitor e que o escritor não pode reapresentar como novidade.`,
    `REGRA DE PROCEDÊNCIA (dura): todo item TEM de sair de uma seção presente neste pacote — BÍBLIA DA OBRA, MAPA DE PERSONAGENS, ESTRUTURA DO LIVRO, LEDGER DE REVELAÇÕES ou CAPÍTULOS ANTERIORES (fichas condensadas). "origem" cita a seção e, quando houver, o capítulo (ex.: "ledger R07.1, cap 7"; "ficha cap 3"; "bíblia").`,
    `Se o pacote não sustenta um item, ele NÃO existe: liste menos. É proibido inferir, completar lacuna ou supor o que "provavelmente" foi estabelecido — lista curta e verdadeira vale mais que lista longa e inventada.`,
    `REGRAS DURAS: você NÃO escreve prosa, metáfora, imagem, pensamento ou frase literária. Só fato seco com origem. Máx 15 itens por lista.`,
  ].join("\n");
}

/** Escritor: o ÚNICO papel autorizado a produzir prosa. */
export function tarefaEscritor(ficha: SceneSpec, contrato: SkillContract, idioma = "pt-BR"): string {
  const faixa = contrato.faixa_palavras;
  return [
    `Escreva o capítulo ${ficha.capitulo} em prosa final, em ${nomeIdioma(idioma)}, seguindo a FICHA DA CENA e as instruções do pacote.`,
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
export function tarefaCanarioVoz(ideia: string, contrato: SkillContract, ajusteAutor?: string, idioma = "pt-BR"): string {
  return [
    `Escreva UMA cena curta de amostra (300–500 palavras), em ${nomeIdioma(idioma)}, demonstrando a VOZ desta skill para a ideia do autor.`,
    `Ideia do autor: ${ideia}`,
    ajusteAutor?.trim() ? `Ajuste solicitado pelo autor após ler a amostra anterior: ${ajusteAutor.trim()}` : "",
    `A cena deve ter: um objetivo concreto, um obstáculo, uma virada e um gancho final (tipo permitido: ${contrato.tipos_gancho.join(", ")}).`,
    `É uma AMOSTRA de voz, não o capítulo 1: personagens podem ser provisórios; a voz e a cadência do contrato são o que está em prova.`,
    `Não mencione o processo, a skill ou o pacote. Sem título.`,
    `Responda APENAS a prosa da cena.`,
  ].filter(Boolean).join("\n");
}

/** Revisor do canário: avalia a voz sem fingir que a amostra curta é um capítulo final. */
export function tarefaRevisorCanario(resumoSinais: string, contrato: SkillContract): string {
  return [
    `Avalie a AMOSTRA DE VOZ (seção TEXTO A AVALIAR) contra o contrato da skill.`,
    `A amostra tem deliberadamente 300–500 palavras: NÃO a reprove por ficar abaixo da faixa de um capítulo completo.`,
    `A amostra é UMA cena única, PRÉ-FUNDAÇÃO: exigências estruturais do livro (docs factuais/dossiê, rotação ou corte de fios, ficha de cena, montagem paralela) NÃO se aplicam — ausência delas não é defeito, não vira "necessita_decisao_humana" nem reprova. Julgue APENAS voz, cadência, transparência e a mecânica da cena (objetivo/obstáculo/virada/gancho).`,
    `Responda APENAS JSON no schema "parecer/v1": { "schema":"parecer/v1", "dramatic_progression":{"nota":0-5,"evidencia":string}, "skill_adherence":{...}, "clarity":{...}, "emotional_effect":{...}, "continuity":{...}, "hook_effectiveness":{...}, "verdict":"aprovado"|"aprovado_com_excecao"|"reprovado"|"necessita_decisao_humana", "evidencias":[{"local","trecho","observacao"}], "sinais":[{"sinal","valor","disposicao","evidencia","ocorrencias_citadas"?:[{"trecho","posicao"?}],"falsos_positivos"?:number}], "correcoes":[{"local","problema","instrucao"}] }.`,
    `## SINAIS MEDIDOS (a contagem de palavras foi removida porque esta é uma amostra curta)`,
    resumoSinais,
    `Disponha todo sinal FORA DA COTA; sinal dentro da cota NÃO entra em "sinais". "disposicao" aceita SOMENTE: "violacao_confirmada", "excecao_valida", "falso_positivo", "necessita_decisao_humana" (rótulos como "conforme"/"ok" invalidam o parecer). Para "violacao_confirmada", cite exatamente cada ocorrência medida que é defeito real; use "falsos_positivos" para fechar a contagem.`,
    `Aprovação exige evidência positiva localizada e aderência material aos testes da skill: ${contrato.testes_positivos.slice(0, 4).join("; ") || "—"}.`,
    `Se a voz estiver genérica, a cadência contrariar o contrato ou a amostra não tiver evento/virada/gancho, reprove e dê correções objetivas.`,
    `Não transforme preferência autoral em aprovação por exceção: "aprovado_com_excecao" continua sendo uma ressalva visível.`,
  ].join("\n");
}

/** Revisor literário: parecer estruturado (parecer/v1) com disposição de cada sinal. */
export function tarefaRevisor(capitulo: number, resumoSinais: string, contrato: SkillContract): string {
  return [
    `Avalie o capítulo ${capitulo} (seção TEXTO A AVALIAR) contra o contrato da skill e a ficha.`,
    `Responda APENAS JSON no schema "parecer/v1": { "schema":"parecer/v1", "dramatic_progression":{"nota":0-5,"evidencia":string}, "skill_adherence":{...}, "clarity":{...}, "emotional_effect":{...}, "continuity":{...}, "hook_effectiveness":{...}, "verdict":"aprovado"|"aprovado_com_excecao"|"reprovado"|"necessita_decisao_humana", "evidencias":[{"local","trecho","observacao"}], "sinais":[{"sinal","valor","disposicao","evidencia","ocorrencias_citadas"?:[{"trecho","posicao"?}],"falsos_positivos"?:number}], "correcoes":[{"local","problema","instrucao"}] }.`,
    `## SINAIS MEDIDOS (medições determinísticas reais — disponha cada um)`,
    resumoSinais,
    `Para cada sinal medido acima, inclua um item em "sinais" com disposicao: "violacao_confirmada" (o sinal é defeito real AQUI), "excecao_valida" (a cena justifica; explique), "falso_positivo" (o detector errou; explique) ou "necessita_decisao_humana". Esses quatro rótulos são os ÚNICOS válidos — "conforme"/"ok"/"dentro_da_cota" invalidam o parecer; sinal dentro da cota e sem defeito fica FORA da lista "sinais".`,
    `REGRA DOS SINAIS DE CONTAGEM (sanfona, gnômico, personificação, metáfora, cadência): o NÚMERO do detector NUNCA confirma violação sozinho — detectores por regex supercontam (enumerações e acúmulos legítimos contam como tique). As ocorrências medidas estão TODAS listadas e numeradas acima. Para dispor "violacao_confirmada": preencha "ocorrencias_citadas" com CADA ocorrência que julgou defeito real (trecho literal em "trecho"; "posicao" opcional) e justifique em "evidencia"; ocorrência não citada conta como falso positivo — se você citar menos ocorrências do que o valor medido, declare o resto em "falsos_positivos" (número; citadas + falsos_positivos = valor). Se, lidas as ocorrências, nenhuma for defeito real, a disposição correta é "falso_positivo" mesmo com contagem acima da cota.`,
    `"necessita_decisao_humana" é RARO: reserve para escolha genuinamente autoral (voz, exceção de contrato, rumo da trama). Defeito de ofício corrigível (tique, cota estourada, cena morta) é "violacao_confirmada" + entrada em "correcoes" + veredito "reprovado" — a correção dirigida resolve sem parar a produção.`,
    `REGRAS DO VEREDITO:`,
    `- "aprovado" exige evidência POSITIVA em "evidencias" (o que está vivo e funciona, localizado) — ausência de defeito não basta.`,
    `- Qualquer "violacao_confirmada" exige entrada correspondente em "correcoes" e veredito "reprovado".`,
    `- Capítulo competente mas MORTO (sem evento, sem avanço) reprova mesmo dentro das cotas.`,
    `- REPETIÇÃO DE REVELAÇÃO: a seção LEDGER DE REVELAÇÕES lista o que o leitor JÁ SABE. Se este capítulo reapresenta como novidade algo que o ledger já registra — ainda que com outras palavras, outra cena ou outro personagem descobrindo —, isso é defeito: acrescente o sinal "revelacao_ja_no_ledger" com disposicao "violacao_confirmada", cite em "evidencia" o id/capítulo da entrada do ledger e o trecho do capítulo, e reprove. O detector automático só pega repetição literal; a repetição REESCRITA é sua responsabilidade. Avançar, complicar ou pagar uma revelação antiga NÃO é repetir — repetir é entregá-la de novo como se fosse nova.`,
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

/** Arquiteto de enredo: fundação (bíblia + mapa de personagens + perfil + estrutura), sem semear ornamento. */
export function tarefaArquitetoEnredo(briefing: BriefingFundacao, contrato: SkillContract): string {
  return [
    `Monte a fundação do livro "${briefing.titulo}" (${briefing.totalCapitulos} capítulos, escrito em ${nomeIdioma(briefing.idioma)}) para a skill do pacote.`,
    `Premissa do autor: ${briefing.premissa}`,
    briefing.detalhes ? `BRIEFING COMPLETO DO AUTOR (decisões vinculantes — a fundação as respeita, nunca as substitui):\n${briefing.detalhes}` : "",
    `Responda APENAS JSON: { "perfil_voz": string, "biblia": string, "mapa_personagens": [{"nome": string, "papel": string, "ferida": string, "segredo": string, "desejo": string, "voz": string, "arco": string}], "estrutura": [{"capitulo": number, "fio": string, "resumo_estrutural": string}], "fios": [string], "promessa_editorial": string }.`,
    `- "perfil_voz": descrição de voz em markdown curto (≤300 palavras) coerente com o contrato (${contrato.familia_editorial}; ${contrato.acao_interioridade.relacao}). PROIBIDO incluir parágrafos-modelo, aforismos ou frases de exemplo — a fundação não semeia ornamento (o perfil descreve, não demonstra).`,
    `- "biblia": bíblia da obra em markdown (≤1200 palavras): mundo/ambientação, cânone factual, linha do tempo, final planejado e proibições do autor. Fatos secos e decisões — sem prosa de cena, sem diálogo, sem parágrafo-modelo.`,
    `- "mapa_personagens": um item por personagem relevante (protagonistas, antagonistas, apoio com função na trama); cada campo ≤25 palavras; "voz" descreve o registro de fala, nunca cita falas prontas.`,
    `- "estrutura": um item por capítulo; "resumo_estrutural" aponta objetivo/virada em ≤25 palavras, sem prosa.`,
    `- "fios": nomes dos fios narrativos${contrato.pov.rotacao ? ` (entre ${contrato.pov.rotacao.fios_min} e ${contrato.pov.rotacao.fios_max})` : ""}.`,
  ].filter(Boolean).join("\n");
}

/** Editor estrutural: PROPÕE corte/fusão/reordenação — nunca escreve prosa. */
export function tarefaEditorEstrutural(totalCaps: number, contrato: SkillContract): string {
  return [
    `Avalie a MACRO-ESTRUTURA do livro completo (${totalCaps} capítulos) — seção CAPÍTULOS — e proponha edições estruturais.`,
    `Você PROPÕE; você NÃO escreve prosa. Saída APENAS JSON no schema "structural-edit/v1": { "schema":"structural-edit/v1", "propostas":[{"tipo":"nenhuma"|"corte"|"fusao"|"reordenacao","capitulos":[number],"nova_ordem"?:[number],"justificativa":string}] }.`,
    `REGRAS DURAS:`,
    `- PROIBIDO escrever ou reescrever prosa. O worker pré-valida qualquer fusão pelo pipeline literário antes de promovê-la.`,
    `- "corte": SOMENTE com justificativa estrutural forte — capítulo redundante que não avança nenhum fio. "capitulos" lista o(s) número(s) a cortar.`,
    `- "fusao": dois ou mais capítulos ADJACENTES e em ordem crescente, quando cumprem a mesma unidade dramática e separados produzem repetição/queda de tensão. O primeiro número identifica a unidade resultante.`,
    `- "reordenacao": "nova_ordem" traz cada unidade sobrevivente exatamente uma vez: números cortados e números absorvidos por fusão (todos menos o primeiro de cada fusão) ficam de fora.`,
    `- Na dúvida, responda [{"tipo":"nenhuma","capitulos":[],"justificativa":"estrutura sólida; sem corte, fusão nem reordenação"}].`,
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
