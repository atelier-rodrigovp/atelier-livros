// `npm run prontidao` — três níveis, estados formais SEPARADOS (fatia Q).
//
// A regra que este comando existe para impor: testes verdes, release certificado
// e livro literariamente bom NÃO são sinônimos. Cada um vira um estado próprio,
// e nenhum deles é inferido do outro.
//
// Nível 1 — fiação e mutação: cada gate/campo decisório muda uma decisão?
// Nível 2 — corpus automático: integridade, cobertura e cotas congeladas.
// Nível 3 — ciclo real: ponta a ponta, com provedor determinístico.
//
// Uso: npm run prontidao            (níveis 1 e 2)
//      npm run prontidao -- --ciclo (inclui o nível 3)

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { analisarCalibracao } from "../src/v2/calibracao.js";
import { CAMPOS_DECISORIOS, EXCECOES_NAO_DECISORIAS } from "../src/v2/campos-decisorios.js";
import { interpretarRelatorioVitest, type ExecucaoVitest, type RelatorioBruto } from "../src/v2/coleta-vitest.js";
import { conferirDod, resumoConferencia, type ConferenciaDod } from "../src/v2/dod-conferencia.js";
import { capturarHead, rodarComando } from "../src/v2/execucao.js";
import { DIR_EVIDENCIAS, validarEvidencia, type FingerprintsCodigo, type TipoEvidencia } from "../src/v2/evidencia-externa.js";
import { resumoLimitacoes } from "../src/limitacoes-conhecidas.js";
import { fatiasDoInventario, INVENTARIO_DOD } from "../src/v2/inventario-dod.js";
import { compararVersaoWorker } from "../../src/lib/versaoWorker.js";
import { workerOnline } from "../../src/lib/status.js";
import { verificarReleaseAtual } from "../src/v2/release.js";

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const RAIZ = path.resolve(AQUI, "..", "..");
const DIR_WORKER = path.resolve(AQUI, "..");

// ---------------------------------------------------------------------------
// Estados formais
// ---------------------------------------------------------------------------

// Saúde LOCAL e prontidão de PRODUÇÃO são estados distintos. Misturá-los num
// único `RELEASE_CERTIFICADO` fazia a suíte verde da máquina do autor parecer
// certificado de produção — sem nunca ter tocado o banco, o Storage ou o
// provedor reais.
type Estado =
  | "IMPLEMENTACAO_LOCAL_APROVADA" | "IMPLEMENTACAO_LOCAL_REPROVADA"
  | "REGRESSAO_LOCAL_APROVADA" | "REGRESSAO_LOCAL_REPROVADA"
  | "INTEGRACAO_MOCK_APROVADA" | "INTEGRACAO_MOCK_REPROVADA" | "INTEGRACAO_MOCK_NAO_EXECUTADA"
  | "CORPUS_AUTOMATICO_PRONTO_PARA_LAB" | "CORPUS_AUTOMATICO_REPROVADO"
  | "MIGRACOES_REMOTAS_COMPROVADAS" | "MIGRACOES_REMOTAS_NAO_COMPROVADAS"
  | "INTEGRACAO_REAL_APROVADA" | "INTEGRACAO_REAL_NAO_COMPROVADA"
  | "UI_AUTENTICADA_APROVADA" | "UI_AUTENTICADA_NAO_COMPROVADA"
  | "PROVEDOR_REAL_APROVADO" | "PROVEDOR_REAL_NAO_COMPROVADO"
  | "PAPEIS_REAIS_APROVADOS" | "PAPEIS_REAIS_NAO_COMPROVADOS"
  | "PRE_CANARY_READY" | "PRE_CANARY_BLOQUEADO"
  | "RELEASE_PRODUCAO_CERTIFICADO" | "RELEASE_PRODUCAO_BLOQUEADO"
  | "PROJETO_AUTORIZADO" | "PROJETO_NAO_AUTORIZADO"
  | "PROVA_LITERARIA_APROVADA" | "PROVA_LITERARIA_REPROVADA" | "PROVA_LITERARIA_NAO_EXECUTADA"
  | "BLOQUEADOS_AGUARDANDO_AUTOR";

interface Item {
  item: string;
  ok: boolean | null; // null = não comprovado (não é falha; é ausência de prova)
  evidencia: string;
}

interface Relatorio {
  gerado_em: string;
  /** HEAD real da execucao. Sem fallback: git que nao responde aborta. */
  head: string;
  duracao_ms: number;
  estados: Record<string, Estado | string>;
  nivel1: { comando: string; itens: Item[]; dod: ConferenciaDod };
  nivel2: { itens: Item[] };
  nivel3: { executado: boolean; itens: Item[] };
  regressao: { itens: Item[] };
  /** O codigo que o worker no ar executa, comparado com o HEAD acima. */
  versao_worker: Item;
  externas: { itens: Item[] };
  /** Dívida reportada mas não bloqueante (bundle, lint warning). */
  avisos: string[];
  bloqueios_producao: string[];
  bloqueios: string[];
  nao_comprovados: string[];
}

// ---------------------------------------------------------------------------
// Suítes de mutação: cada arquivo prova que MUDAR O CAMPO MUDA A DECISÃO.
// Um teste que só chama a função e confere o retorno não entra nesta lista.
// ---------------------------------------------------------------------------

const SUITES_MUTACAO = [
  { arquivo: "src/v2/fiacao-decisoria.test.ts", prova: "pov_violado e promessa não paga mudam o veredito" },
  { arquivo: "src/v2/correcao.test.ts", prova: "escada de correção: estratégias distintas e circuit breaker" },
  { arquivo: "src/v2/arco.test.ts", prova: "rotação de POV, ficha × grade de arco, promessa não paga" },
  { arquivo: "src/v2/portao-fundacao.test.ts", prova: "portão da fundação: bloqueios editoriais e macro × micro" },
  { arquivo: "src/v2/release-allowlist.test.ts", prova: "certificado e autorização são garantias separadas" },
  { arquivo: "src/v2/encadeamento.test.ts", prova: "checkpoint e devolução à fila" },
  { arquivo: "src/v2/cotas-vivas.test.ts", prova: "cotas do contrato produzem sinal fora da cota" },
  { arquivo: "src/v2/ledger.test.ts", prova: "revelação repetida reprova a ficha" },
  { arquivo: "src/v2/gates.test.ts", prova: "gates universais bloqueiam o capítulo" },
  { arquivo: "src/v2/autorizacao-politica.test.ts", prova: "RLS: dono do projeto, imutabilidade, revogação" },
  { arquivo: "src/v2/documentos.test.ts", prova: "documentos: disco, Storage e índice da interface" },
  { arquivo: "src/v2/briefing-aprovacao.test.ts", prova: "briefing aprovado com hash; sem default silencioso" },
  { arquivo: "src/v2/conformidade.test.ts", prova: "ficha → prosa com evidência localizada" },
  { arquivo: "src/v2/memoria-prosa.test.ts", prova: "memória derivada da prosa aprovada" },
  { arquivo: "src/v2/repeticao.test.ts", prova: "repetição literal, semântica e maneirismo" },
  { arquivo: "src/v2/idioma.test.ts", prova: "gate de idioma e variante" },
  { arquivo: "src/v2/revalidacao.test.ts", prova: "revalidação transitiva e teto de cascata" },
  { arquivo: "src/v2/canario-snapshot.test.ts", prova: "canário como snapshot e invalidação" },
  { arquivo: "src/v2/historico.test.ts", prova: "histórico append-only" },
  { arquivo: "src/v2/integracao-mock.test.ts", prova: "ciclo interface → worker → Storage → Leitor" },
];

// ---------------------------------------------------------------------------
// Coleta estruturada da DoD (defeito D1)
//
// Roda os testes que provam a DoD e lê o RESULTADO de cada um. A execução sai da
// RAIZ porque o inventário cita tanto suítes do worker quanto da interface, e é
// a config da raiz que enxerga as duas.
// ---------------------------------------------------------------------------

/** Caminho do inventário (relativo a `worker/`) normalizado para a raiz do repo. */
function caminhoDaRaiz(teste: string): string {
  return path.relative(RAIZ, path.resolve(DIR_WORKER, teste)).replace(/\\/g, "/");
}

type ExecucaoJson = ExecucaoVitest;

/**
 * Roda a suíte e devolve o resultado ESTRUTURADO. Uma execução só — a da raiz,
 * que é a config capaz de enxergar worker e interface — alimenta a regressão, a
 * coleta global de IDs da DoD e os recortes (SQL/RLS, ciclo mock, interface).
 * Rodar tudo de novo por recorte seria desperdício sem ganho de garantia.
 */
function rodarVitestJson(cwd: string, alvos: string[], saidaRel: string): ExecucaoJson {
  // RELATIVO de propósito: com `shell: true` (obrigatório no Windows para achar
  // o `npx.cmd`), um caminho absoluto contendo espaço — "…/Rodrigo Paiva/…" — é
  // re-dividido pelo shell e o vitest grava o relatório em outro lugar. O sintoma
  // é o pior possível: a DoD reprova inteira por falta de dados, não por defeito.
  const saidaJson = path.join(cwd, saidaRel);
  mkdirSync(path.dirname(saidaJson), { recursive: true });
  rmSync(saidaJson, { force: true });

  let erroExec: string | undefined;
  try {
    execFileSync(
      process.platform === "win32" ? "npx.cmd" : "npx",
      ["vitest", "run", ...alvos, "--reporter=json", `--outputFile=${saidaRel}`],
      { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], maxBuffer: 128 * 1024 * 1024, shell: true }
    );
  } catch (e) {
    // Teste vermelho faz o vitest sair != 0. O relatório JSON ainda é escrito, e
    // é ele que diz QUAL garantia caiu — engolir aqui seria repetir o defeito.
    // Guardamos o erro mesmo assim: se o JSON não vier, ele é a única pista.
    erroExec = String((e as { stderr?: string })?.stderr ?? e).slice(-400);
  }

  let bruto: RelatorioBruto | null = null;
  if (existsSync(saidaJson)) {
    try {
      bruto = JSON.parse(readFileSync(saidaJson, "utf8")) as RelatorioBruto;
    } catch {
      bruto = null;
    }
  }
  return interpretarRelatorioVitest(bruto, erroExec, (abs) => path.relative(RAIZ, abs).split("\\").join("/"));
}

/**
 * Recorte de uma execução já feita. O casamento é por SUBSTRING, não por sufixo:
 * um recorte de diretório (`src/lib/`) precisa casar, e sufixo nunca casaria.
 * Como os testes do worker vivem sob `worker/src/`, `src/lib/` não os apanha.
 */
function recorte(exec: ExecucaoJson, arquivos: string[]): { passaram: number; falharam: number; pulados: number } {
  const alvo = exec.resultados.filter((r) => arquivos.some((a) => r.arquivo.includes(a)));
  return {
    passaram: alvo.filter((r) => r.estado === "passou").length,
    falharam: alvo.filter((r) => r.estado === "falhou").length,
    pulados: alvo.filter((r) => r.estado === "pulado").length,
  };
}

/**
 * A conferência da DoD roda sobre a suíte INTEIRA, não sobre os arquivos que o
 * inventário cita. Coletar só o que o inventário aponta é circular: um arquivo
 * novo com `[DOD:X]` esquecido fora do inventário jamais apareceria.
 */
function coletarDod(suite: ExecucaoJson): ConferenciaDod {
  const ausentes = [...new Set(
    INVENTARIO_DOD.filter((g) => g.escopo === "local").flatMap((g) => g.testes.map(caminhoDaRaiz))
  )]
    .filter((a) => !existsSync(path.join(RAIZ, a)))
    .sort();
  return conferirDod(INVENTARIO_DOD, suite.resultados, {
    erro: suite.erro,
    arquivosAusentes: ausentes,
    totalTestesColetados: suite.total,
  });
}

// ---------------------------------------------------------------------------
// Nível 1 — fiação e mutação
// ---------------------------------------------------------------------------

function nivel1(suiteRaiz: ExecucaoJson): { itens: Item[]; comando: string; ok: boolean; garantiasFaltando: string[]; dod: ConferenciaDod } {
  const itens: Item[] = [];
  const alvos = SUITES_MUTACAO.map((s) => s.arquivo).filter((a) => existsSync(path.join(DIR_WORKER, a)));
  const ausentes = SUITES_MUTACAO.filter((s) => !existsSync(path.join(DIR_WORKER, s.arquivo)));
  for (const a of ausentes) {
    itens.push({ item: `suíte de mutação ${a.arquivo}`, ok: false, evidencia: "arquivo não existe" });
  }

  // Recorte da execução única da raiz — estas suítes já rodaram lá. Rodá-las de
  // novo custaria um minuto e não acrescentaria garantia nenhuma.
  const comando = `recorte de ${alvos.length} suíte(s) de mutação da execução da raiz`;
  const c = recorte(suiteRaiz, alvos.map((a) => a.replace(/^src\//, "src/")));
  itens.push({
    item: "suítes de mutação",
    ok: c.falharam === 0 && c.passaram > 0,
    evidencia: `${c.passaram} passaram, ${c.falharam} falharam, ${c.pulados} pulados em ${alvos.length} arquivo(s)`,
  });

  // Inventário de campos decisórios: cada entrada declara onde decide e que teste
  // prova. A checagem ESTÁTICA sozinha nunca vale — ela só confere que a suíte
  // citada existe e passou acima.
  for (const campo of CAMPOS_DECISORIOS) {
    const testes = campo.teste.split(",").map((t) => t.trim());
    const existem = testes.every((t) => existsSync(path.join(DIR_WORKER, "src", "v2", t)));
    itens.push({
      item: `campo decisório ${campo.campo}`,
      ok: existem,
      evidencia: existem
        ? `decide em ${campo.decideEm} — ${campo.decisao} (${campo.teste})`
        : `teste declarado não encontrado: ${campo.teste}`,
    });
  }
  itens.push({
    item: "exceções não-decisórias documentadas",
    ok: EXCECOES_NAO_DECISORIAS.every((e) => e.razao.trim().length > 40),
    evidencia: EXCECOES_NAO_DECISORIAS.map((e) => e.campo).join(", "),
  });

  // D1 — a DoD INTEIRA, garantia por garantia, POR EXECUÇÃO. A versão anterior
  // conferia se o arquivo de teste existia: bastava apagar o teste de dentro (ou
  // marcá-lo `skip`) para a garantia sumir e o estado continuar verde. Agora cada
  // garantia tem um ID que o teste declara no título, e só aprova o ID que foi
  // encontrado, executado e passou.
  const conf = coletarDod(suiteRaiz);
  const faltando = conf.problemas;
  for (const f of conf.falhasDeColeta) itens.push({ item: "coleta estruturada da DoD", ok: false, evidencia: f });
  itens.push({
    item: `DoD: ${conf.inventariadas} garantias obrigatórias (por execução)`,
    ok: conf.ok,
    evidencia: conf.ok
      ? `${resumoConferencia(conf)} — fatias ${fatiasDoInventario().join(", ")}`
      : `${resumoConferencia(conf)} · ${conf.problemas.slice(0, 6).join(" · ")}${conf.problemas.length > 6 ? ` · (+${conf.problemas.length - 6})` : ""}`,
  });
  // Cada modo de falha aparece em linha própria: "reprovou" sem dizer POR QUE é
  // o que fazia o relatório envelhecer sem ninguém notar.
  const detalhes: [string, string[]][] = [
    ["garantias sem teste declarando o ID", conf.semTeste],
    ["garantias com teste pulado (não conta como aprovada)", conf.naoExecutadas.map((p) => p.id)],
    ["garantias com teste falhando", conf.reprovadas.map((p) => p.id)],
    ["IDs duplicados no inventário", conf.duplicadosInventario],
    ["IDs declarados em teste e ausentes do inventário", conf.orfaos],
  ];
  for (const [rotulo, ids] of detalhes) {
    if (ids.length) itens.push({ item: rotulo, ok: false, evidencia: ids.join(", ") });
  }

  return { itens, comando, ok: itens.every((i) => i.ok !== false), garantiasFaltando: faltando, dod: conf };
}

// ---------------------------------------------------------------------------
// Nível 2 — acurácia (exige rótulo HUMANO; stub determinístico não serve)
// ---------------------------------------------------------------------------

function nivel2(): { itens: Item[]; calibrada: boolean } {
  const itens: Item[] = [];
  const dirCorpus = path.join(DIR_WORKER, "calibration", "v1");
  if (!existsSync(dirCorpus)) {
    itens.push({ item: "corpus de calibração", ok: null, evidencia: `ausente em ${dirCorpus}` });
    return { itens, calibrada: false };
  }
  try {
    const r = analisarCalibracao(dirCorpus);
    itens.push({
      item: "corpus de calibração",
      ok: true,
      evidencia: `versão ${r.corpus_versao}, hash ${r.corpus_hash.slice(0, 12)}, ${r.skills.length} skill(s)`,
    });
    itens.push({
      item: "corpus automático pronto para laboratório",
      ok: r.pendencias.length === 0,
      evidencia: r.pendencias.length === 0
        ? "hashes, contratos, splits e classes aprovadas/contraste conferem; cotas permanecem congeladas"
        : r.pendencias.slice(0, 3).join(" · "),
    });
    for (const p of r.pendencias.slice(0, 10)) {
      itens.push({ item: "pendência de calibração", ok: null, evidencia: p });
    }
    // Limitação de recall conhecida é dívida de ACURÁCIA, não de implementação:
    // o detector funciona, só não alcança uma construção. Antes disso viver num
    // `it.skip`, invisível, convivendo calado com release "certificado".
    for (const l of resumoLimitacoes()) {
      itens.push({ item: "limitação de recall conhecida", ok: null, evidencia: l });
    }
    return { itens, calibrada: r.pendencias.length === 0 };
  } catch (e) {
    itens.push({
      item: "corpus de calibração",
      ok: false,
      evidencia: `falha ao analisar: ${e instanceof Error ? e.message : String(e)}`,
    });
    return { itens, calibrada: false };
  }
}

// ---------------------------------------------------------------------------
// Nível 3 — ciclo real (opt-in; nunca inferido)
// ---------------------------------------------------------------------------

function nivel3(executar: boolean, suiteRaiz: ExecucaoJson): { itens: Item[]; executado: boolean; mockOk: boolean } {
  // O ciclo com MOCK é obrigatório: ele não gasta cota nem chama modelo de prosa,
  // então não há razão para ficar atrás de uma flag. `--ciclo` acrescenta as
  // suítes mais lentas de ponta a ponta. Ambos saem do recorte da execução única.
  const alvosMock = ["src/v2/integracao-mock.test.ts"].filter((a) => existsSync(path.join(DIR_WORKER, a)));
  const cMock = recorte(suiteRaiz, ["v2/integracao-mock.test.ts"]);
  const mockOk = alvosMock.length > 0 && cMock.falharam === 0 && cMock.passaram > 0;
  const itensMock: Item[] = [
    {
      item: "ciclo interface → worker → gates → Storage → Leitor (mock)",
      ok: alvosMock.length ? mockOk : false,
      evidencia: alvosMock.length
        ? `${cMock.passaram} passaram, ${cMock.falharam} falharam`
        : "src/v2/integracao-mock.test.ts não existe",
    },
  ];
  if (!executar) {
    return {
      executado: false,
      mockOk,
      itens: [
        ...itensMock,
        {
          item: "ciclo ponta a ponta completo com provedor determinístico",
          ok: null,
          evidencia: "não executado nesta invocação (use `npm run prontidao -- --ciclo`)",
        },
      ],
    };
  }
  const alvos = ["src/v2/pipeline.test.ts", "src/v2/integracao-estrutural.test.ts", "src/v2/lab/lab.test.ts"]
    .filter((a) => existsSync(path.join(DIR_WORKER, a)));
  const c = recorte(suiteRaiz, ["v2/pipeline.test.ts", "v2/integracao-estrutural.test.ts", "v2/lab/lab.test.ts"]);
  return {
    executado: true,
    mockOk,
    itens: [
      ...itensMock,
      {
        item: "ciclo ponta a ponta com provedor determinístico (ProvedorMock, zero cota)",
        ok: c.falharam === 0 && c.passaram > 0,
        evidencia: `${c.passaram} passaram, ${c.falharam} falharam (${alvos.join(", ")})`,
      },
      {
        item: "smoke com modelos reais",
        ok: null,
        evidencia: "exige Claude Code logado, autorização de projeto e cota — não executado por este comando",
      },
      {
        item: "downloads reais dos documentos pela interface",
        ok: null,
        evidencia: "exige sessão autenticada no app — verificação manual",
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Regressão
// ---------------------------------------------------------------------------

/**
 * REGRESSAO_LOCAL só é aprovada com a Definition of Done local INTEIRA. Antes,
 * ela olhava a suíte do worker e o typecheck do worker — e dizia "aprovada" com
 * build quebrado, lint vermelho ou a interface sem rodar. Isso é pior que não
 * medir: dá nome de garantia a uma amostra.
 *
 * A suíte da raiz vem pronta (execução única compartilhada com a DoD); a do
 * worker roda à parte de propósito, porque provar independência de diretório
 * corrente exige rodar dos DOIS lugares.
 */
function regressao(suiteRaiz: ExecucaoJson): { itens: Item[]; ok: boolean; avisos: string[] } {
  const itens: Item[] = [];
  const avisos: string[] = [];

  itens.push({
    item: "suíte completa a partir da RAIZ (inclui interface)",
    ok: suiteRaiz.ok,
    evidencia: suiteRaiz.erro
      ? suiteRaiz.erro
      : `${suiteRaiz.passaram} passaram, ${suiteRaiz.falharam} falharam, ${suiteRaiz.pulados} pulados (${suiteRaiz.total} testes)`,
  });

  const suiteWorker = rodarVitestJson(DIR_WORKER, [], ".prontidao/suite-worker.json");
  itens.push({
    item: "suíte completa a partir de `worker/` (independência de cwd)",
    ok: suiteWorker.ok,
    evidencia: suiteWorker.erro
      ? suiteWorker.erro
      : `${suiteWorker.passaram} passaram, ${suiteWorker.falharam} falharam, ${suiteWorker.pulados} pulados`,
  });

  const tcRaiz = rodarComando(RAIZ, "npx", ["tsc", "-b", "--force"]);
  itens.push({
    item: "typecheck (raiz)",
    ok: tcRaiz.ok,
    evidencia: tcRaiz.ok ? "tsc -b sem erros" : `${tcRaiz.stdout}
${tcRaiz.stderr}`.slice(-500),
  });

  const tcWorker = rodarComando(DIR_WORKER, "npm", ["run", "typecheck"]);
  itens.push({
    item: "typecheck (worker)",
    ok: tcWorker.ok,
    evidencia: tcWorker.ok ? "tsc --noEmit sem erros" : `${tcWorker.stdout}
${tcWorker.stderr}`.slice(-500),
  });

  const build = rodarComando(RAIZ, "npm", ["run", "build"]);
  const avisoBundle = /chunks are larger than/i.test(build.stdout);
  itens.push({
    item: "build de produção",
    ok: build.ok,
    evidencia: build.ok ? "tsc -b && vite build concluído" : `${build.stdout}
${build.stderr}`.slice(-500),
  });
  if (avisoBundle) {
    // Aviso de tamanho de bundle é dívida de performance, não defeito editorial.
    // Aparece separado: nem vira bloqueio, nem some do relatório.
    avisos.push("build: bundle acima de 500 kB (aviso de performance do vite, não bloqueia)");
  }

  const lint = rodarComando(RAIZ, "npm", ["run", "lint"]);
  const mErros = /(\d+) errors?/.exec(lint.stdout);
  const mAvisos = /(\d+) warnings?/.exec(lint.stdout);
  const nErros = Number(mErros?.[1] ?? (lint.ok ? 0 : 1));
  const nAvisos = Number(mAvisos?.[1] ?? 0);
  itens.push({
    item: "lint (zero erros)",
    ok: nErros === 0,
    evidencia: `${nErros} erro(s), ${nAvisos} aviso(s)`,
  });
  if (nAvisos > 0) avisos.push(`lint: ${nAvisos} aviso(s) — reportados, não escondidos`);

  const sql = recorte(suiteRaiz, [
    "v2/historico.test.ts",
    "v2/autorizacao-politica.test.ts",
    "reliability-sql.test.ts",
    "owner-scope.test.ts",
    "v2/release-allowlist.test.ts",
  ]);
  itens.push({
    item: "SQL/RLS local (política espelhada e contrato sobre o texto do SQL)",
    ok: sql.falharam === 0 && sql.passaram > 0,
    evidencia: `${sql.passaram} passaram, ${sql.falharam} falharam`,
  });

  const mock = recorte(suiteRaiz, ["v2/integracao-mock.test.ts", "v2/pipeline.test.ts", "v2/integracao-estrutural.test.ts"]);
  itens.push({
    item: "ciclo determinístico com ProvedorMock",
    ok: mock.falharam === 0 && mock.passaram > 0,
    evidencia: `${mock.passaram} passaram, ${mock.falharam} falharam`,
  });

  // Chamar tudo em `src/lib` de "teste de interface" mascarava o que faltava:
  // logica pura passava, e nenhum componente era renderizado em teste nenhum.
  const logica = recorte(suiteRaiz, ["src/lib/"]);
  itens.push({
    item: "interface — logica (src/lib)",
    ok: logica.falharam === 0 && logica.passaram > 0,
    evidencia: `${logica.passaram} passaram, ${logica.falharam} falharam`,
  });

  const componentes = recorte(suiteRaiz, ["src/components/"]);
  itens.push({
    item: "interface — componentes RENDERIZADOS (src/components)",
    ok: componentes.falharam === 0 && componentes.passaram > 0,
    evidencia: componentes.passaram
      ? `${componentes.passaram} passaram, ${componentes.falharam} falharam`
      : "nenhum componente renderizado em teste",
  });

  const paginas = recorte(suiteRaiz, ["src/pages/"]);
  itens.push({
    item: "interface — paginas/rotas (src/pages)",
    ok: paginas.falharam === 0 && paginas.passaram > 0,
    evidencia: paginas.passaram ? `${paginas.passaram} passaram, ${paginas.falharam} falharam` : "nenhum smoke de pagina",
  });

  itens.push({
    item: "interface — smoke de NAVEGADOR (sessao autenticada real)",
    ok: null,
    evidencia: "nao existe nesta fase; exige sessao autenticada — cobre-se por evidencia externa ui_autenticada",
  });

  return { itens, ok: itens.every((i) => i.ok !== false), avisos };
}

// ---------------------------------------------------------------------------
// O código que o worker no ar realmente executa
// ---------------------------------------------------------------------------

/**
 * O worker carimba o SHA com que subiu (`worker_heartbeats.status.codigo`);
 * aqui esse carimbo vira BLOQUEIO. Sem isto, "commit não é produção" continua
 * sendo uma frase: um worker de anteontem produz capítulo com a régua de
 * anteontem e nada na saída deste comando diz isso.
 *
 * Worker OFFLINE não é bloqueio, é ausência de prova: se nada está no ar, nada
 * produz com código velho.
 */
async function versaoDoWorkerNoAr(): Promise<Item> {
  const item = "código do worker no ar × HEAD do repositório";
  let shaRepo: string;
  try {
    shaRepo = capturarHead(RAIZ);
  } catch (e) {
    return { item, ok: null, evidencia: `HEAD indisponível: ${(e as Error).message}` };
  }
  let hb: { last_seen?: string; status?: { codigo?: unknown } } | null;
  try {
    const { sb } = await import("../src/supabase.js");
    const { data, error } = await sb
      .from("worker_heartbeats")
      .select("last_seen,status")
      .order("last_seen", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(error.message);
    hb = data as typeof hb;
  } catch (e) {
    // Sem credencial ou sem rede: ausência de prova, nunca verde por omissão.
    return { item, ok: null, evidencia: `heartbeat ilegível: ${(e as Error).message.slice(0, 120)}` };
  }
  if (!workerOnline(hb as never)) {
    const quando = hb?.last_seen ? `último sinal ${hb.last_seen}` : "nenhum heartbeat";
    return { item, ok: null, evidencia: `worker offline (${quando}) — nada em execução para comparar` };
  }
  const c = compararVersaoWorker(hb?.status?.codigo as never, shaRepo);
  return { item, ok: !c.bloqueia, evidencia: c.mensagem };
}

// ---------------------------------------------------------------------------
// Evidência externa — o que a máquina local não pode provar
// ---------------------------------------------------------------------------

/** Hash estável de um conjunto de arquivos, para carimbar a evidência. */
function hashDe(arquivos: string[]): string {
  const h = createHash("sha256");
  for (const a of arquivos.sort()) {
    h.update(a);
    try {
      h.update(readFileSync(a));
    } catch {
      h.update("<ausente>");
    }
  }
  return h.digest("hex").slice(0, 16);
}

function listarArquivos(dir: string, filtro: RegExp): string[] {
  if (!existsSync(dir)) return [];
  const saida: string[] = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) saida.push(...listarArquivos(p, filtro));
    else if (filtro.test(e.name)) saida.push(p);
  }
  return saida;
}

/**
 * Impressao do CODIGO. Nao inclui o commit: a evidencia caduca por fingerprint,
 * nao por HEAD - senao commitar um README invalidaria uma verificacao remota que
 * continua valendo, que era a contradicao do modelo anterior.
 */
function fingerprintsAtuais(): FingerprintsCodigo {
  const migracoes = listarArquivos(path.join(RAIZ, "supabase"), /\.sql$/);
  return {
    migrations_source_hash: hashDe(migracoes),
    contratos_hash: hashDe(listarArquivos(path.join(DIR_WORKER, "skills-v2"), /contrato\.json$/)),
    worker_hash: hashDe(listarArquivos(path.join(DIR_WORKER, "src"), /\.ts$/).filter((f) => !/\.test\.ts$/.test(f))),
    interface_hash: hashDe(listarArquivos(path.join(RAIZ, "src"), /\.tsx?$/).filter((f) => !/\.test\.tsx?$/.test(f))),
  };
}

/** Ref do projeto Supabase esperado. Evidencia de outro projeto e recusada. */
const PROJETO_SUPABASE_ESPERADO = process.env.SUPABASE_PROJECT_REF ?? "dzgbatsecbkjmucmigjv";

const TIPOS_EXTERNOS: { tipo: TipoEvidencia; rotulo: string }[] = [
  { tipo: "migracoes_remotas", rotulo: "migrações aplicadas e verificadas no banco real" },
  { tipo: "integracao_real", rotulo: "fluxo real interface → worker → Storage com download conferido" },
  { tipo: "ui_autenticada", rotulo: "interface autenticada: abertura e download dos documentos V2" },
  { tipo: "provedor_real", rotulo: "smoke do provedor real (sem escrita literária)" },
  { tipo: "papeis_reais", rotulo: "11 papéis com modelo real e cascata em duas passadas" },
];

/**
 * Cada verificação externa é um documento versionado no repositório, vinculado
 * ao commit e aos hashes do que estava valendo. Ausente ou caduca = NÃO
 * COMPROVADA — que não é zero, não é sucesso e não certifica nada.
 */
function externas(): { itens: Item[]; aprovadas: Record<TipoEvidencia, boolean> } {
  const fingerprints = fingerprintsAtuais();
  const dir = path.join(RAIZ, DIR_EVIDENCIAS);
  const itens: Item[] = [];
  const aprovadas = {} as Record<TipoEvidencia, boolean>;
  for (const { tipo, rotulo } of TIPOS_EXTERNOS) {
    const arquivo = path.join(dir, `${tipo}.json`);
    if (!existsSync(arquivo)) {
      aprovadas[tipo] = false;
      itens.push({
        item: rotulo,
        ok: null,
        evidencia: `sem evidência em ${DIR_EVIDENCIAS}/${tipo}.json — gere com o harness; JSON escrito à mão não certifica`,
      });
      continue;
    }
    let doc: unknown;
    try {
      doc = JSON.parse(readFileSync(arquivo, "utf8"));
    } catch (e) {
      aprovadas[tipo] = false;
      itens.push({ item: rotulo, ok: false, evidencia: `evidência ilegível: ${e instanceof Error ? e.message : String(e)}` });
      continue;
    }
    const v = validarEvidencia(doc, { tipo, ambiente: "producao", supabase_project_ref: PROJETO_SUPABASE_ESPERADO, fingerprints });
    aprovadas[tipo] = v.valida;
    itens.push({
      item: rotulo,
      // Evidência presente e INVÁLIDA é bloqueio (alguém afirmou algo que não
      // se sustenta); evidência ausente é apenas ausência de prova.
      ok: v.valida ? true : false,
      evidencia: v.valida
        ? `evidência válida — testou ${String((doc as { tested_code_commit?: string }).tested_code_commit ?? "?").slice(0, 7)}, fingerprints do código conferem`
        : v.motivos.join(" · "),
    });
  }
  return { itens, aprovadas };
}

// ---------------------------------------------------------------------------
// Execução
// ---------------------------------------------------------------------------

const t0 = Date.now();
const comCiclo = process.argv.includes("--ciclo");

console.log("== PRONTIDÃO DA ENGINE V2 ==\n");
console.log("Suíte completa (raiz) — base da regressão e da coleta da DoD…");
const suiteRaiz = rodarVitestJson(RAIZ, [], ".prontidao/suite-raiz.json");
console.log("Nível 1 — fiação e mutação…");
const n1 = nivel1(suiteRaiz);
console.log("Nível 2 — acurácia…");
const n2 = nivel2();
console.log(`Nível 3 — ciclo real${comCiclo ? "…" : " (pulado)"}`);
const n3 = nivel3(comCiclo, suiteRaiz);
console.log("Regressão local completa…");
const reg = regressao(suiteRaiz);
console.log("Evidências externas…\n");
const ext = externas();
const versaoWorker = await versaoDoWorkerNoAr();
const releaseAtual = verificarReleaseAtual();
const certificadoExiste = existsSync(path.join(DIR_WORKER, "release", "engine-v2.json"));
const certificadoRelease: Item = {
  item: "certificado final de release contra o checkout atual",
  // Ausente antes do canário é NÃO COMPROVADO, não falha local. Presente e
  // inválido é falha: alguém publicou uma alegação que não se sustenta.
  ok: releaseAtual.ok ? true : certificadoExiste ? false : null,
  evidencia: releaseAtual.ok
    ? `certificado válido para ${releaseAtual.certificado!.codigo_commit.slice(0, 7)}`
    : releaseAtual.erros.join(" · "),
};

const bloqueios: string[] = [];
const naoComprovados: string[] = [];
for (const i of [...n1.itens, ...n2.itens, ...n3.itens, ...reg.itens, versaoWorker, ...ext.itens, certificadoRelease]) {
  if (i.ok === false) bloqueios.push(`${i.item}: ${i.evidencia}`);
  if (i.ok === null) naoComprovados.push(`${i.item}: ${i.evidencia}`);
}

// D1 — a implementação só é aprovada com TODAS as garantias da DoD provadas
// POR EXECUÇÃO: ID encontrado, teste executado e passando. Arquivo presente não
// aprova mais nada — era exatamente por ali que uma garantia sumia sem alarme.
const dodOk = n1.dod.ok;

// LOCAL e PRODUÇÃO são coisas diferentes e ganham nomes diferentes. O nome
// antigo (RELEASE_CERTIFICADO para saúde local) prometia produção certificada
// com prova que nunca saiu desta máquina.
const implementacao: Estado = n1.ok && dodOk ? "IMPLEMENTACAO_LOCAL_APROVADA" : "IMPLEMENTACAO_LOCAL_REPROVADA";
const regressaoEstado: Estado = reg.ok ? "REGRESSAO_LOCAL_APROVADA" : "REGRESSAO_LOCAL_REPROVADA";
const acuracia: Estado = n2.calibrada ? "CORPUS_AUTOMATICO_PRONTO_PARA_LAB" : "CORPUS_AUTOMATICO_REPROVADO";
const integracaoMock: Estado = n3.mockOk ? "INTEGRACAO_MOCK_APROVADA" : "INTEGRACAO_MOCK_REPROVADA";

const migracoes: Estado = ext.aprovadas.migracoes_remotas ? "MIGRACOES_REMOTAS_COMPROVADAS" : "MIGRACOES_REMOTAS_NAO_COMPROVADAS";
const integracaoReal: Estado = ext.aprovadas.integracao_real ? "INTEGRACAO_REAL_APROVADA" : "INTEGRACAO_REAL_NAO_COMPROVADA";
const uiAutenticada: Estado = ext.aprovadas.ui_autenticada ? "UI_AUTENTICADA_APROVADA" : "UI_AUTENTICADA_NAO_COMPROVADA";
const provedorReal: Estado = ext.aprovadas.provedor_real ? "PROVEDOR_REAL_APROVADO" : "PROVEDOR_REAL_NAO_COMPROVADO";
const papeisReais: Estado = ext.aprovadas.papeis_reais ? "PAPEIS_REAIS_APROVADOS" : "PAPEIS_REAIS_NAO_COMPROVADOS";

// PRE_CANARY é um gate próprio. Calibração e certificado final vêm depois;
// misturá-los permitia chamar "release certificada" a saúde local sem sequer
// existir `worker/release/engine-v2.json`.
const bloqueiosPreCanary: string[] = [];
if (!(n1.ok && dodOk)) bloqueiosPreCanary.push("IMPLEMENTACAO_LOCAL");
if (!reg.ok) bloqueiosPreCanary.push("REGRESSAO_LOCAL");
if (!n3.mockOk) bloqueiosPreCanary.push("INTEGRACAO_MOCK");
if (!ext.aprovadas.migracoes_remotas) bloqueiosPreCanary.push("MIGRACOES_REMOTAS");
if (!ext.aprovadas.integracao_real) bloqueiosPreCanary.push("INTEGRACAO_REAL");
if (!ext.aprovadas.ui_autenticada) bloqueiosPreCanary.push("DOWNLOAD_AUTENTICADO");
if (!ext.aprovadas.provedor_real) bloqueiosPreCanary.push("PROVEDOR_REAL");
if (!ext.aprovadas.papeis_reais) bloqueiosPreCanary.push("ONZE_PAPEIS_E_CASCATA_REAL");
// Worker rodando codigo que nao e o do repositorio bloqueia producao: a regua
// em execucao nao e a regua auditada. Para PRE_CANARY, offline também bloqueia:
// a definição exige worker ATIVO no SHA atual.
if (versaoWorker.ok !== true) bloqueiosPreCanary.push("WORKER_ATIVO_SHA_ATUAL");

const preCanaryReady = bloqueiosPreCanary.length === 0;
const bloqueiosProducao = [...bloqueiosPreCanary];
if (!n2.calibrada) bloqueiosProducao.push("CORPUS_AUTOMATICO");
if (!releaseAtual.ok) bloqueiosProducao.push("CERTIFICADO_RELEASE");

const releaseProducao = bloqueiosProducao.length === 0 && releaseAtual.ok
  ? "RELEASE_PRODUCAO_CERTIFICADO"
  : "RELEASE_PRODUCAO_BLOQUEADO";

const relatorio: Relatorio = {
  gerado_em: new Date().toISOString(),
  // HEAD real, capturado com fail-closed: se o git não responder, `capturarHead`
  // lança e o comando morre aqui. A versão anterior engolia a falha e gravava a
  // string "desconhecido", que num relatório de prontidão passa por dado.
  head: capturarHead(RAIZ),
  duracao_ms: Date.now() - t0,
  estados: {
    implementacao_local: implementacao,
    regressao_local: regressaoEstado,
    integracao_mock: integracaoMock,
    acuracia,
    migracoes_remotas: migracoes,
    integracao_real: integracaoReal,
    ui_autenticada: uiAutenticada,
    provedor_real: provedorReal,
    papeis_reais: papeisReais,
    pre_canary: preCanaryReady
      ? "PRE_CANARY_READY"
      : `PRE_CANARY_BLOQUEADO: ${bloqueiosPreCanary.join(", ")}`,
    release_producao: bloqueiosProducao.length
      ? `${releaseProducao}: ${bloqueiosProducao.join(", ")}`
      : releaseProducao,
    canarios_novos: !preCanaryReady
      ? `BLOQUEADOS: ${bloqueiosPreCanary.join(", ")}`
      : "CANARIO_AUTORIZADO_PELO_GATE",
    // Autorização é por projeto e vive no banco: este comando não a infere.
    projeto: "PROJETO_NAO_AUTORIZADO (por projeto; consulte engine_autorizacoes_v2)",
    prova_literaria: "PROVA_LITERARIA_NAO_EXECUTADA",
  },
  nivel1: { comando: n1.comando, itens: n1.itens, dod: n1.dod },
  nivel2: { itens: n2.itens },
  nivel3: { executado: n3.executado, itens: n3.itens },
  regressao: { itens: reg.itens },
  versao_worker: versaoWorker,
  externas: { itens: ext.itens },
  avisos: reg.avisos,
  bloqueios_producao: bloqueiosProducao,
  bloqueios,
  nao_comprovados: naoComprovados,
};

const simbolo = (ok: boolean | null) => (ok === true ? "OK  " : ok === false ? "FALHA" : "N/COMPROV");
const secao = (titulo: string, itens: Item[]) => {
  console.log(`\n--- ${titulo} ---`);
  for (const i of itens) console.log(`  [${simbolo(i.ok)}] ${i.item} — ${i.evidencia}`);
};

secao("NÍVEL 1 — fiação e mutação", n1.itens);
secao("NÍVEL 2 — acurácia", n2.itens);
secao("NÍVEL 3 — ciclo real", n3.itens);
secao("REGRESSÃO LOCAL (DoD completa)", reg.itens);
secao("CÓDIGO EM EXECUÇÃO", [versaoWorker]);
secao("VERIFICAÇÃO EXTERNA (fora do alcance desta máquina)", ext.itens);
secao("CERTIFICADO FINAL", [certificadoRelease]);

if (reg.avisos.length) {
  console.log("\n--- AVISOS (não bloqueiam, não somem) ---");
  for (const a of reg.avisos) console.log(`  [AVISO] ${a}`);
}

console.log("\n=== ESTADOS FORMAIS ===");
for (const [k, v] of Object.entries(relatorio.estados)) console.log(`  ${k.padEnd(19)} ${v}`);
console.log(`\nBloqueios: ${bloqueios.length} · Não comprovados: ${naoComprovados.length}`);
console.log(`Duração: ${(relatorio.duracao_ms / 1000).toFixed(1)}s`);

const destino = path.join(RAIZ, ".prontidao");
mkdirSync(destino, { recursive: true });
const arquivo = path.join(destino, "prontidao.json");
writeFileSync(arquivo, JSON.stringify(relatorio, null, 2), "utf8");
console.log(`\nArtefato estruturado: ${arquivo}`);

// Sai 1 só quando há BLOQUEIO. "Não comprovado" não é falha — é ausência de prova,
// e o relatório a nomeia item por item.
process.exit(bloqueios.length ? 1 : 0);
