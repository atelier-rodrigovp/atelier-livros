// Interpretação do relatório JSON do vitest.
//
// Separado do script para poder ser testado: o defeito que mora aqui é sutil e
// só aparece numa combinação específica — relatório com todos os testes verdes E
// processo terminando com código diferente de zero. Acontece em crash do runner,
// erro não tratado dentro de um worker, teardown que explode e falha de
// configuração. O JSON parcial que sobra parece sucesso.
//
// Regra: o código de saída manda. Verde no relatório nunca sobrepõe processo
// que morreu.

export interface ResultadoTesteColetado {
  arquivo: string;
  nome: string;
  estado: "passou" | "falhou" | "pulado";
}

export interface ExecucaoVitest {
  ok: boolean;
  erro?: string;
  passaram: number;
  falharam: number;
  pulados: number;
  total: number;
  resultados: ResultadoTesteColetado[];
}

export interface RelatorioBruto {
  numTotalTests?: number;
  testResults?: {
    name?: string;
    assertionResults?: { fullName?: string; title?: string; status?: string }[];
  }[];
}

const VAZIO: ExecucaoVitest = { ok: false, passaram: 0, falharam: 0, pulados: 0, total: 0, resultados: [] };

/**
 * @param bruto     JSON do reporter, ou `null` se não foi produzido/é ilegível.
 * @param erroExec  Mensagem do processo quando ele saiu != 0; `undefined` se saiu 0.
 * @param relativizar Converte o caminho absoluto do arquivo em caminho do repo.
 */
export function interpretarRelatorioVitest(
  bruto: RelatorioBruto | null,
  erroExec: string | undefined,
  relativizar: (abs: string) => string
): ExecucaoVitest {
  if (!bruto) {
    return { ...VAZIO, erro: `relatório JSON ausente ou ilegível${erroExec ? ` — ${erroExec}` : ""}` };
  }
  if (!Array.isArray(bruto.testResults)) {
    return { ...VAZIO, erro: "relatório JSON incompleto: sem `testResults`" };
  }

  const resultados: ResultadoTesteColetado[] = [];
  let passaram = 0;
  let falharam = 0;
  let pulados = 0;
  for (const arquivo of bruto.testResults) {
    const rel = arquivo.name ? relativizar(arquivo.name) : "?";
    for (const t of arquivo.assertionResults ?? []) {
      // Só `passed` aprova. `pending`, `todo` e `skipped` são não-execução.
      const estado = t.status === "passed" ? "passou" : t.status === "failed" ? "falhou" : "pulado";
      if (estado === "passou") passaram++;
      else if (estado === "falhou") falharam++;
      else pulados++;
      resultados.push({ arquivo: rel, nome: t.fullName ?? t.title ?? "", estado });
    }
  }
  const total = resultados.length;

  // FAIL-CLOSED. As três condições são independentes e todas obrigatórias.
  const ok = falharam === 0 && total > 0 && erroExec === undefined;
  let erro: string | undefined;
  if (erroExec && falharam === 0) {
    // O caso que o código antigo escondia: verde no papel, processo morto.
    erro = `o vitest terminou com erro apesar do relatório verde: ${erroExec}`;
  } else if (erroExec) {
    erro = erroExec;
  } else if (total === 0) {
    erro = "a execução não coletou nenhum teste";
  }
  return { ok, erro, passaram, falharam, pulados, total, resultados };
}
