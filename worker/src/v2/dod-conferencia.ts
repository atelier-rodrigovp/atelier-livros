// Conferência da DoD por EXECUÇÃO, não por existência de arquivo (defeito D1).
//
// A versão anterior aprovava uma garantia quando o arquivo de teste citado
// existia. Bastava apagar o teste de dentro do arquivo — ou deixá-lo `skip` —
// para a garantia sumir e o comando continuar emitindo IMPLEMENTACAO_APROVADA.
// Arquivo presente nunca foi prova de comportamento preservado.
//
// Agora cada garantia tem um ID estável, o teste que a prova declara esse ID no
// título (`[DOD:<id>]`), e a conferência trabalha sobre o RESULTADO da execução:
// o ID foi encontrado, rodou e passou — ou a implementação reprova.
//
// A coleta é GLOBAL (toda a suíte da raiz), não apenas os arquivos que o
// inventário cita. Coletar só o que o inventário aponta seria circular: um
// arquivo novo com `[DOD:X]` esquecido fora do inventário nunca apareceria.
//
// Esta camada é pura de propósito: recebe o inventário e os resultados já
// coletados. É o que permite aos meta-testes provarem que ela REPROVA nos casos
// negativos sem precisar mutilar o repositório.

import type { GarantiaDoD } from "./inventario-dod.js";

/** Como um teste terminou. `pulado` cobre skip, todo e qualquer não-execução. */
export type EstadoTeste = "passou" | "falhou" | "pulado";

export interface ResultadoTesteDod {
  /** Caminho do arquivo, relativo à raiz do repo. Só entra no relatório. */
  arquivo: string;
  /** Nome completo do teste (ancestrais + título), de onde o ID é lido. */
  nome: string;
  estado: EstadoTeste;
}

export interface PendenciaDod {
  id: string;
  motivo: string;
}

/** Contexto da coleta. Falha de coleta REPROVA — nunca vira silêncio. */
export interface ColetaDod {
  /** Mensagem de erro se a execução/parse falhou. */
  erro?: string;
  /** Arquivos citados pelo inventário que não existem no disco. */
  arquivosAusentes?: string[];
  /** Total de testes que a execução reportou, para pegar coleta vazia. */
  totalTestesColetados?: number;
}

export interface ConferenciaDod {
  ok: boolean;
  inventariadas: number;
  /** Garantias de escopo local — as únicas que a execução local pode aprovar. */
  locais: number;
  encontradas: number;
  executadas: number;
  aprovadas: number;
  /** Inventariada, nenhum teste declara o ID. A garantia deixou de ser provada. */
  semTeste: string[];
  /** Declarada, mas algum teste do ID não rodou (skip/todo). */
  naoExecutadas: PendenciaDod[];
  /** Declarada e rodou, mas algum teste do ID falhou. */
  reprovadas: PendenciaDod[];
  /** O mesmo ID aparece duas vezes no inventário. */
  duplicadosInventario: string[];
  /** ID declarado por teste e ausente do inventário — também é denunciado. */
  orfaos: string[];
  /** Arquivos que o inventário cita e não existem. */
  arquivosAusentes: string[];
  /** Garantias que só evidência externa pode aprovar (nunca a suíte local). */
  externas: string[];
  /** Falhas da própria coleta: execução quebrada, JSON incompleto, zero testes. */
  falhasDeColeta: string[];
  /** Mensagens legíveis, na ordem em que devem ser lidas. */
  problemas: string[];
}

/**
 * Um teste pode declarar mais de um ID e um ID pode ser provado por mais de um
 * teste (garantia com várias dimensões, como o cruzamento macro × micro).
 */
export function idsDeclarados(nome: string): string[] {
  return [...nome.matchAll(/\[DOD:([A-Za-z0-9_-]+)\]/g)].map((m) => m[1]);
}

export function conferirDod(
  inventario: GarantiaDoD[],
  resultados: ResultadoTesteDod[],
  coleta: ColetaDod = {}
): ConferenciaDod {
  const problemas: string[] = [];
  const falhasDeColeta: string[] = [];

  // A coleta precisa se provar antes de julgar qualquer garantia. Execução que
  // quebrou, JSON truncado ou zero testes NUNCA podem passar por "tudo certo":
  // era assim que uma suíte que nem rodou sairia verde.
  if (coleta.erro) falhasDeColeta.push(`coleta falhou: ${coleta.erro}`);
  if (resultados.length === 0) falhasDeColeta.push("nenhum resultado de teste coletado — a suíte não rodou");
  if (coleta.totalTestesColetados === 0) falhasDeColeta.push("a execução reportou zero testes");
  const arquivosAusentes = coleta.arquivosAusentes ?? [];
  for (const a of arquivosAusentes) falhasDeColeta.push(`arquivo de teste citado pelo inventário não existe: ${a}`);
  problemas.push(...falhasDeColeta);

  // Duplicidade no inventário: dois IDs iguais tornam a contagem mentirosa.
  const vistos = new Set<string>();
  const duplicadosInventario: string[] = [];
  for (const g of inventario) {
    if (vistos.has(g.id)) duplicadosInventario.push(g.id);
    vistos.add(g.id);
  }
  for (const id of [...new Set(duplicadosInventario)]) {
    problemas.push(`ID duplicado no inventário: ${id}`);
  }

  // Índice: ID → estados observados na execução.
  const porId = new Map<string, ResultadoTesteDod[]>();
  for (const r of resultados) {
    for (const id of idsDeclarados(r.nome)) {
      if (!porId.has(id)) porId.set(id, []);
      porId.get(id)!.push(r);
    }
  }

  const semTeste: string[] = [];
  const naoExecutadas: PendenciaDod[] = [];
  const reprovadas: PendenciaDod[] = [];
  const externas: string[] = [];
  let encontradas = 0;
  let executadas = 0;
  let aprovadas = 0;
  let locais = 0;

  for (const g of inventario) {
    // Garantia de escopo externo não é aprovável pela suíte local por definição.
    // Ela vive no relatório como NÃO COMPROVADA e bloqueia produção — o que não
    // se pode fazer é deixá-la aprovar junto com as locais.
    if (g.escopo === "externo") {
      externas.push(g.id);
      if ((porId.get(g.id) ?? []).length > 0) {
        problemas.push(`[${g.id}] garantia externa não pode ser aprovada por teste local`);
      }
      continue;
    }
    locais++;

    const testes = porId.get(g.id) ?? [];
    if (testes.length === 0) {
      semTeste.push(g.id);
      problemas.push(`[${g.id}] sem teste declarando o ID — garantia não provada: ${g.garantia}`);
      continue;
    }
    encontradas++;

    const pulados = testes.filter((t) => t.estado === "pulado");
    const falhos = testes.filter((t) => t.estado === "falhou");
    const passos = testes.filter((t) => t.estado === "passou");

    // Rodou de fato? Um ID só provado por teste pulado não foi executado.
    if (passos.length > 0 || falhos.length > 0) executadas++;

    if (falhos.length > 0) {
      reprovadas.push({ id: g.id, motivo: `${falhos.length} teste(s) falharam: ${falhos.map((t) => t.nome).join(" · ")}` });
      problemas.push(`[${g.id}] teste falhou — garantia não vale: ${g.garantia}`);
      continue;
    }
    if (pulados.length > 0) {
      naoExecutadas.push({ id: g.id, motivo: `${pulados.length} teste(s) pulados: ${pulados.map((t) => t.nome).join(" · ")}` });
      problemas.push(`[${g.id}] teste pulado não aprova garantia: ${g.garantia}`);
      continue;
    }
    if (passos.length === 0) {
      naoExecutadas.push({ id: g.id, motivo: "nenhum teste executado" });
      problemas.push(`[${g.id}] nenhum teste executado: ${g.garantia}`);
      continue;
    }
    aprovadas++;
  }

  // ID que os testes declaram e o inventário não conhece: ou a DoD está
  // desatualizada, ou alguém errou o ID. Nos dois casos é defeito. Só é possível
  // detectar porque a coleta varre a suíte INTEIRA, não os arquivos do inventário.
  const orfaos = [...porId.keys()].filter((id) => !vistos.has(id)).sort();
  for (const id of orfaos) problemas.push(`ID declarado em teste e ausente do inventário: ${id}`);

  return {
    ok:
      falhasDeColeta.length === 0 &&
      duplicadosInventario.length === 0 &&
      semTeste.length === 0 &&
      naoExecutadas.length === 0 &&
      reprovadas.length === 0 &&
      orfaos.length === 0,
    inventariadas: inventario.length,
    locais,
    encontradas,
    executadas,
    aprovadas,
    semTeste,
    naoExecutadas,
    reprovadas,
    duplicadosInventario: [...new Set(duplicadosInventario)],
    orfaos,
    arquivosAusentes,
    externas,
    falhasDeColeta,
    problemas,
  };
}

/** Uma linha para o relatório do prontidão. */
export function resumoConferencia(c: ConferenciaDod): string {
  return (
    `${c.aprovadas}/${c.locais} garantias locais aprovadas ` +
    `(encontradas ${c.encontradas}, executadas ${c.executadas}` +
    `${c.externas.length ? `; ${c.externas.length} externa(s) fora do alcance local` : ""})`
  );
}
