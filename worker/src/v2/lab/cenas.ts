// Engine V2 — cenas fixas do laboratório de regressão literária (F7).
// MESMOS fatos para todas as skills: o que muda é a voz. A distinguibilidade
// entre skills com material idêntico é exatamente o que o laboratório mede.
// Mini-história neutra ("O Registro de Aveiro") sem vínculo com obras do acervo.

import type { SceneSpec, SkillContract } from "../tipos.js";

export type CategoriaCena =
  | "abertura"
  | "perseguicao"
  | "exposicao_sob_pressao"
  | "revelacao_emocional"
  | "confronto"
  | "encerramento";

export interface CenaLab {
  categoria: CategoriaCena;
  /** ficha base SEM gancho.tipo (resolvido por contrato) e SEM campos_skill */
  base: Omit<SceneSpec, "gancho" | "campos_skill"> & { gancho: { descricao: string } };
  /** preferência de tipo de gancho por palavras-chave (casadas contra contrato.tipos_gancho) */
  ganchoPreferido: string[];
}

const FATOS_COMUNS = [
  "Marina Sarti, 34, restauradora de documentos, herdou do irmão Tomás uma chave de cofre",
  "Tomás morreu há 11 dias em um acidente de barco não testemunhado",
  "O registro consular de Aveiro de 1987 liga o pai deles a um nome apagado",
  "O arquivista Heitor Braga trabalha no consulado há 31 anos",
];

export const CENAS_LAB: CenaLab[] = [
  {
    categoria: "abertura",
    ganchoPreferido: ["pergunta", "revelacao", "virada_percepcao", "gancho_cruel"],
    base: {
      schema: "scene-spec/v1",
      capitulo: 1,
      pov: "Marina",
      local: "apartamento do irmão morto, caixas por desfazer",
      tempo: "Dia 1, 21h",
      objetivo: "encontrar o testamento entre as caixas do irmão",
      obstaculo: "a chave de cofre não corresponde a nenhum banco conhecido",
      acao_fisica: "ela esvazia caixas, abre correspondência atrasada, compara a chave com fotos de cadeados online",
      informacao_nova: "um recibo de aluguel de cofre em Aveiro, pago pelo irmão 3 dias antes de morrer",
      virada: "a data do recibo contradiz a agenda dele: nesse dia, ele deveria estar em outra cidade",
      mudanca_estado: "de luto passivo para pergunta ativa: o irmão mentiu para ela",
      gancho: { descricao: "o telefone do apartamento do irmão toca; ninguém deveria ter esse número" },
      fatos_obrigatorios: FATOS_COMUNS.slice(0, 2),
      conhecimentos_proibidos: ["Marina não sabe do registro de 1987", "Marina não sabe quem é Heitor Braga"],
      fios_avancados: ["misterio_tomas"],
      fios_ausentes: ["registro_1987"],
    },
  },
  {
    categoria: "perseguicao",
    ganchoPreferido: ["ameaca", "ameaca_intima", "relogio", "gancho_cruel"],
    base: {
      schema: "scene-spec/v1",
      capitulo: 2,
      pov: "Marina",
      local: "estação rodoviária de Aveiro, plataforma coberta, chuva",
      tempo: "Dia 2, 18h40",
      objetivo: "chegar ao consulado antes do fechamento com o recibo do cofre",
      obstaculo: "um homem de casaco cinza a segue desde o embarque",
      acao_fisica: "ela troca de plataforma, entra no fluxo de passageiros, abandona a mala para andar mais rápido, corta pelo estacionamento",
      informacao_nova: "o homem carrega uma cópia da MESMA chave de cofre pendurada no cordão do crachá",
      virada: "ele não a persegue: ele a ultrapassa em direção ao consulado — ela é que está atrasada",
      mudanca_estado: "de presa para competidora: outra pessoa quer o conteúdo do cofre",
      gancho: { descricao: "as luzes do consulado se apagam uma a uma com os dois ainda na rua" },
      fatos_obrigatorios: [FATOS_COMUNS[0], FATOS_COMUNS[3]],
      conhecimentos_proibidos: ["Marina não sabe o nome do homem de cinza"],
      fios_avancados: ["misterio_tomas", "corrida_cofre"],
      fios_ausentes: ["passado_do_pai"],
    },
  },
  {
    categoria: "exposicao_sob_pressao",
    ganchoPreferido: ["revelacao", "pergunta", "revelacao_narradora"],
    base: {
      schema: "scene-spec/v1",
      capitulo: 3,
      pov: "Marina",
      local: "sala de arquivo do consulado, prateleiras numeradas, luz fraca",
      tempo: "Dia 3, 9h15",
      objetivo: "entender o que é o registro consular de 1987 antes que Heitor volte da pausa",
      obstaculo: "os livros de registro usam um código de referência que ela não domina; 10 minutos de janela",
      acao_fisica: "ela cruza o índice remissivo com o livro-caixa, fotografa páginas, recoloca volumes no lugar exato",
      informacao_nova: "o registro de 1987 lista o pai como acompanhante de um nome raspado à lâmina",
      virada: "a mesma lâmina raspou o nome em TRÊS registros de anos diferentes — é sistemático, não acidente",
      mudanca_estado: "de curiosa para cúmplice involuntária: agora ela sabe que alguém apaga esse nome há décadas",
      gancho: { descricao: "passos de Heitor no corredor; a página fotografada está fora do lugar" },
      fatos_obrigatorios: [FATOS_COMUNS[2], FATOS_COMUNS[3]],
      conhecimentos_proibidos: ["Marina não sabe que Heitor conhecia Tomás"],
      fios_avancados: ["registro_1987"],
      fios_ausentes: ["corrida_cofre"],
    },
  },
  {
    categoria: "revelacao_emocional",
    ganchoPreferido: ["virada_percepcao", "revelacao_narradora", "revelacao", "ameaca_intima"],
    base: {
      schema: "scene-spec/v1",
      capitulo: 4,
      pov: "Marina",
      local: "quarto de pensão em Aveiro, madrugada, fotos espalhadas na cama",
      tempo: "Dia 3, 2h30",
      objetivo: "montar a linha do tempo do irmão nos últimos 30 dias",
      obstaculo: "as fotos do celular dele param 9 dias antes da morte — apagadas em bloco",
      acao_fisica: "ela restaura miniaturas do backup, ordena recibos por data, refaz o trajeto dele num mapa de papel",
      informacao_nova: "na última foto restaurada, Tomás está na porta do consulado — abraçado a Heitor",
      virada: "o irmão não descobriu o segredo por acaso: ele trabalhava nisso com Heitor, e escondeu dela",
      mudanca_estado: "do luto pelo irmão à raiva por ter sido excluída — e medo do que ele a protegia",
      gancho: { descricao: "no verso do recibo mais antigo, a letra do PAI: 'não deixe a Marina tocar nisso'" },
      fatos_obrigatorios: [FATOS_COMUNS[1], FATOS_COMUNS[3]],
      conhecimentos_proibidos: ["Marina não sabe por que o pai escreveu o bilhete"],
      fios_avancados: ["misterio_tomas", "passado_do_pai"],
      fios_ausentes: ["corrida_cofre"],
    },
  },
  {
    categoria: "confronto",
    ganchoPreferido: ["ameaca", "gancho_cruel", "relogio", "ameaca_intima"],
    base: {
      schema: "scene-spec/v1",
      capitulo: 5,
      pov: "Marina",
      local: "sala dos cofres do banco de Aveiro, porta com fechadura dupla",
      tempo: "Dia 4, 11h",
      objetivo: "abrir o cofre do irmão antes que o banco acione a polícia",
      obstaculo: "Heitor está lá dentro, com a segunda chave, e o cofre exige as DUAS",
      acao_fisica: "os dois giram as chaves em sequência; ela bloqueia a porta com o pé; ele tenta tirar o envelope da bandeja primeiro",
      informacao_nova: "dentro do cofre: passaportes do pai com dois nomes diferentes e uma confissão assinada",
      virada: "Heitor não quer destruir a confissão — quer publicá-la; quem quer destruir chegou no corredor",
      mudanca_estado: "de adversários a aliados por necessidade, com o inimigo real identificado",
      gancho: { descricao: "o alarme de incêndio dispara sem fumaça: alguém quer o prédio evacuado" },
      fatos_obrigatorios: [FATOS_COMUNS[0], FATOS_COMUNS[2]],
      conhecimentos_proibidos: ["Marina não sabe quem acionou o alarme"],
      fios_avancados: ["corrida_cofre", "passado_do_pai"],
      fios_ausentes: [],
    },
  },
  {
    categoria: "encerramento",
    ganchoPreferido: ["pergunta", "revelacao", "virada_percepcao"],
    base: {
      schema: "scene-spec/v1",
      capitulo: 6,
      pov: "Marina",
      local: "cais de Aveiro, fim de tarde, barco do irmão devolvido pela perícia",
      tempo: "Dia 6, 17h50",
      objetivo: "decidir o destino da confissão do pai — publicar ou queimar",
      obstaculo: "publicar destrói o nome da família; queimar apaga a única prova do que fizeram com o nome raspado",
      acao_fisica: "ela sobe no barco, confere o motor lacrado pela perícia, guarda a confissão no colete salva-vidas do irmão",
      informacao_nova: "o laudo no banco do barco: o motor foi sabotado — a morte de Tomás não foi acidente",
      virada: "a escolha muda de natureza: não é mais sobre o passado do pai, é sobre o assassino do irmão",
      mudanca_estado: "do encerramento do luto para a decisão de continuar — com a prova escondida onde ninguém procuraria",
      gancho: { descricao: "no registro de visitas da perícia, uma assinatura reconhecível: o homem do casaco cinza" },
      fatos_obrigatorios: [FATOS_COMUNS[1], FATOS_COMUNS[2]],
      conhecimentos_proibidos: [],
      fios_avancados: ["misterio_tomas", "corrida_cofre", "passado_do_pai"],
      fios_ausentes: [],
    },
  },
];

/** Valores neutros para campos extras exigidos por skill (mesmos fatos, sem prosa). */
const CAMPOS_SKILL_NEUTROS: Record<string, (c: CenaLab) => string> = {
  "Dia/Hora": (c) => c.base.tempo,
  "Relógios": (c) => `prazo externo ativo (${c.base.tempo}); contagem da cena corre até o gancho`,
  "Narradora": () => "primeira pessoa presente; retém o que sabe sobre o irmão até a virada",
  "Fio de POV": (c) => c.base.pov,
  "Decisão/Ação": (c) => c.base.acao_fisica.split(",")[0],
  "Modo": () => "cena dramatizada",
  "Novidade": (c) => c.base.informacao_nova,
  "Pistas": (c) => c.base.informacao_nova,
  "Gancho": (c) => c.base.gancho.descricao,
  "Ponto de vista": (c) => c.base.pov,
  "Degrau slow burn": () => "degrau 1 — tensão reconhecida, não nomeada",
  "Custo de magia": () => "não se aplica nesta cena de laboratório (mundo sem magia); custo narrativo: exaustão física acumulada",
};

/** Adapta a cena fixa ao contrato: escolhe gancho válido e preenche campos_skill exigidos. */
export function adaptarFichaParaSkill(cena: CenaLab, contrato: SkillContract): SceneSpec {
  const tipos = contrato.tipos_gancho;
  const tipo = cena.ganchoPreferido.find((g) => tipos.includes(g)) ?? tipos[0];
  const exigidos = contrato.estruturas_exigidas?.campos_spec ?? [];
  const campos_skill: Record<string, string> = {};
  for (const nome of exigidos) {
    const gera = CAMPOS_SKILL_NEUTROS[nome];
    campos_skill[nome] = gera ? gera(cena) : `${nome}: coberto pela ficha (${cena.base.tempo})`;
  }
  return {
    ...cena.base,
    gancho: { tipo, descricao: cena.base.gancho.descricao },
    ...(exigidos.length ? { campos_skill } : {}),
  };
}
