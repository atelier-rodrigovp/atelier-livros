// `npm run prontidao` — três níveis, estados formais SEPARADOS (fatia Q).
//
// A regra que este comando existe para impor: testes verdes, release certificado
// e livro literariamente bom NÃO são sinônimos. Cada um vira um estado próprio,
// e nenhum deles é inferido do outro.
//
// Nível 1 — fiação e mutação: cada gate/campo decisório muda uma decisão?
// Nível 2 — acurácia: fixtures HUMANAS rotuladas confirmam a classificação?
// Nível 3 — ciclo real: ponta a ponta, com provedor determinístico.
//
// Uso: npm run prontidao            (níveis 1 e 2)
//      npm run prontidao -- --ciclo (inclui o nível 3)

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { analisarCalibracao } from "../src/v2/calibracao.js";
import { CAMPOS_DECISORIOS, EXCECOES_NAO_DECISORIAS } from "../src/v2/campos-decisorios.js";
import { fatiasDoInventario, INVENTARIO_DOD } from "../src/v2/inventario-dod.js";

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const RAIZ = path.resolve(AQUI, "..", "..");
const DIR_WORKER = path.resolve(AQUI, "..");

// ---------------------------------------------------------------------------
// Estados formais
// ---------------------------------------------------------------------------

type Estado =
  | "IMPLEMENTACAO_APROVADA" | "IMPLEMENTACAO_REPROVADA"
  | "REGRESSAO_APROVADA" | "REGRESSAO_REPROVADA"
  | "ACURACIA_CALIBRADA" | "ACURACIA_AGUARDANDO_ROTULAGEM_HUMANA"
  | "RELEASE_CERTIFICADO" | "RELEASE_BLOQUEADO"
  | "PROJETO_AUTORIZADO" | "PROJETO_NAO_AUTORIZADO"
  | "PROVA_LITERARIA_APROVADA" | "PROVA_LITERARIA_REPROVADA" | "PROVA_LITERARIA_NAO_EXECUTADA"
  | "INTEGRACAO_MOCK_APROVADA" | "INTEGRACAO_MOCK_REPROVADA" | "INTEGRACAO_MOCK_NAO_EXECUTADA"
  | "BLOQUEADOS_AGUARDANDO_AUTOR";

interface Item {
  item: string;
  ok: boolean | null; // null = não comprovado (não é falha; é ausência de prova)
  evidencia: string;
}

interface Relatorio {
  gerado_em: string;
  duracao_ms: number;
  estados: Record<string, Estado | string>;
  nivel1: { comando: string; itens: Item[] };
  nivel2: { itens: Item[] };
  nivel3: { executado: boolean; itens: Item[] };
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

function rodarVitest(alvos: string[]): { ok: boolean; saida: string } {
  try {
    const saida = execFileSync(
      process.platform === "win32" ? "npx.cmd" : "npx",
      ["vitest", "run", ...alvos, "--reporter=basic"],
      // shell: true — no Windows, `npx`/`npm` são .cmd e execFile sem shell falha
      // silenciosamente (o comando "roda" em 0,2s e reporta zero teste).
      { cwd: DIR_WORKER, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], maxBuffer: 32 * 1024 * 1024, shell: true }
    );
    return { ok: true, saida };
  } catch (e) {
    const err = e as { stdout?: string; stderr?: string };
    return { ok: false, saida: `${err.stdout ?? ""}\n${err.stderr ?? ""}` };
  }
}

/** O vitest colore a saída; sem tirar o ANSI, "Tests 908 passed" não casa. */
function semAnsi(texto: string): string {
  return texto.replace(/\[[0-9;]*m/g, "");
}

function contarTestes(saida: string): { passaram: number; falharam: number; pulados: number } {
  const limpo = semAnsi(saida);
  // A linha "Tests" (não "Test Files") é a que conta testes, não arquivos.
  const linha = /^\s*Tests\s+.*$/m.exec(limpo)?.[0] ?? limpo;
  const passaram = Number(/(\d+) passed/.exec(linha)?.[1] ?? 0);
  const falharam = Number(/(\d+) failed/.exec(linha)?.[1] ?? 0);
  const pulados = Number(/(\d+) skipped/.exec(linha)?.[1] ?? 0);
  return { passaram, falharam, pulados };
}

// ---------------------------------------------------------------------------
// Nível 1 — fiação e mutação
// ---------------------------------------------------------------------------

function nivel1(): { itens: Item[]; comando: string; ok: boolean; garantiasFaltando: string[] } {
  const itens: Item[] = [];
  const alvos = SUITES_MUTACAO.map((s) => s.arquivo).filter((a) => existsSync(path.join(DIR_WORKER, a)));
  const ausentes = SUITES_MUTACAO.filter((s) => !existsSync(path.join(DIR_WORKER, s.arquivo)));
  for (const a of ausentes) {
    itens.push({ item: `suíte de mutação ${a.arquivo}`, ok: false, evidencia: "arquivo não existe" });
  }

  const comando = `npx vitest run ${alvos.join(" ")}`;
  const r = rodarVitest(alvos);
  const c = contarTestes(r.saida);
  itens.push({
    item: "suítes de mutação",
    ok: r.ok && c.falharam === 0,
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

  // D1 — a DoD INTEIRA, garantia por garantia. Sem isto, uma garantia ainda não
  // implementada simplesmente não aparecia no relatório e o estado saía verde
  // por omissão. Garantia cujo teste não existe = implementação REPROVADA.
  const faltando: string[] = [];
  for (const g of INVENTARIO_DOD) {
    const ausentes = g.testes.filter((t) => !existsSync(path.join(DIR_WORKER, t)));
    if (ausentes.length) faltando.push(`[${g.fatia}] ${g.garantia} → falta ${ausentes.join(", ")}`);
  }
  itens.push({
    item: `DoD: ${INVENTARIO_DOD.length} garantias obrigatórias`,
    ok: faltando.length === 0,
    evidencia:
      faltando.length === 0
        ? `todas com teste presente (fatias ${fatiasDoInventario().join(", ")})`
        : `${faltando.length} sem prova: ${faltando.slice(0, 6).join(" · ")}${faltando.length > 6 ? ` · (+${faltando.length - 6})` : ""}`,
  });

  return { itens, comando, ok: itens.every((i) => i.ok !== false), garantiasFaltando: faltando };
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
    const semRotulo = r.pendencias.filter((p) => /rotul|humano|valida/i.test(p));
    itens.push({
      item: "rótulos humanos suficientes",
      ok: semRotulo.length === 0 ? true : null,
      evidencia:
        semRotulo.length === 0
          ? "todas as amostras com status validado_humano"
          : `${semRotulo.length} pendência(s) de rotulagem: ${semRotulo.slice(0, 3).join(" · ")}`,
    });
    for (const p of r.pendencias.filter((x) => !/rotul|humano|valida/i.test(x)).slice(0, 10)) {
      itens.push({ item: "pendência de calibração", ok: null, evidencia: p });
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

function nivel3(executar: boolean): { itens: Item[]; executado: boolean; mockOk: boolean } {
  // O ciclo com MOCK é obrigatório: ele não gasta cota nem chama modelo de prosa,
  // então não há razão para ficar atrás de uma flag. `--ciclo` acrescenta as
  // suítes mais lentas de ponta a ponta.
  const alvosMock = ["src/v2/integracao-mock.test.ts"].filter((a) => existsSync(path.join(DIR_WORKER, a)));
  const rMock = alvosMock.length ? rodarVitest(alvosMock) : { ok: false, saida: "" };
  const cMock = contarTestes(rMock.saida);
  const mockOk = alvosMock.length > 0 && rMock.ok && cMock.falharam === 0 && cMock.passaram > 0;
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
  const r = rodarVitest(alvos);
  const c = contarTestes(r.saida);
  return {
    executado: true,
    mockOk,
    itens: [
      ...itensMock,
      {
        item: "ciclo ponta a ponta com provedor determinístico (ProvedorMock, zero cota)",
        ok: r.ok && c.falharam === 0,
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

function regressao(): { itens: Item[]; ok: boolean } {
  const itens: Item[] = [];
  const r = rodarVitest([]);
  const c = contarTestes(r.saida);
  itens.push({
    item: "suíte completa do worker",
    ok: r.ok && c.falharam === 0,
    evidencia: `${c.passaram} passaram, ${c.falharam} falharam, ${c.pulados} pulados`,
  });
  try {
    execFileSync(process.platform === "win32" ? "npm.cmd" : "npm", ["run", "typecheck"], {
      cwd: DIR_WORKER, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], shell: true,
    });
    itens.push({ item: "typecheck (worker)", ok: true, evidencia: "tsc --noEmit sem erros" });
  } catch (e) {
    const err = e as { stdout?: string };
    itens.push({ item: "typecheck (worker)", ok: false, evidencia: (err.stdout ?? "").slice(-500) });
  }
  return { itens, ok: itens.every((i) => i.ok !== false) };
}

// ---------------------------------------------------------------------------
// Execução
// ---------------------------------------------------------------------------

const t0 = Date.now();
const comCiclo = process.argv.includes("--ciclo");

console.log("== PRONTIDÃO DA ENGINE V2 ==\n");
console.log("Nível 1 — fiação e mutação…");
const n1 = nivel1();
console.log("Nível 2 — acurácia…");
const n2 = nivel2();
console.log(`Nível 3 — ciclo real${comCiclo ? "…" : " (pulado)"}`);
const n3 = nivel3(comCiclo);
console.log("Regressão…\n");
const reg = regressao();

const bloqueios: string[] = [];
const naoComprovados: string[] = [];
for (const i of [...n1.itens, ...n2.itens, ...n3.itens, ...reg.itens]) {
  if (i.ok === false) bloqueios.push(`${i.item}: ${i.evidencia}`);
  if (i.ok === null) naoComprovados.push(`${i.item}: ${i.evidencia}`);
}

// D1 — a implementação só é aprovada com TODAS as garantias da DoD provadas.
// Antes, uma garantia ainda não implementada não aparecia e o estado saía verde.
const implementacao: Estado =
  n1.ok && n1.garantiasFaltando.length === 0 ? "IMPLEMENTACAO_APROVADA" : "IMPLEMENTACAO_REPROVADA";
const regressaoEstado: Estado = reg.ok ? "REGRESSAO_APROVADA" : "REGRESSAO_REPROVADA";
const acuracia: Estado = n2.calibrada ? "ACURACIA_CALIBRADA" : "ACURACIA_AGUARDANDO_ROTULAGEM_HUMANA";
// Certificado exige TUDO: implementação, regressão e calibração humana.
const releaseOk = n1.ok && n1.garantiasFaltando.length === 0 && reg.ok && n2.calibrada;
const release = releaseOk ? "RELEASE_CERTIFICADO" : "RELEASE_BLOQUEADO";
const motivoRelease = releaseOk
  ? ""
  : !n2.calibrada
    ? "CALIBRACAO_HUMANA"
    : !n1.ok
      ? "IMPLEMENTACAO"
      : "REGRESSAO";

const integracaoMock: Estado = n3.mockOk ? "INTEGRACAO_MOCK_APROVADA" : "INTEGRACAO_MOCK_REPROVADA";

const relatorio: Relatorio = {
  gerado_em: new Date().toISOString(),
  duracao_ms: Date.now() - t0,
  estados: {
    implementacao,
    regressao: regressaoEstado,
    integracao_mock: integracaoMock,
    acuracia,
    release: motivoRelease ? `${release}: ${motivoRelease}` : release,
    // Canário NOVO exige decisão do autor: a engine não gera canário sozinha, e
    // sem canário novo não há evidência nova para certificar.
    canarios_novos: "BLOQUEADOS_AGUARDANDO_AUTOR",
    // Autorização é por projeto e vive no banco: este comando não a infere.
    projeto: "PROJETO_NAO_AUTORIZADO (por projeto; consulte engine_autorizacoes_v2)",
    prova_literaria: "PROVA_LITERARIA_NAO_EXECUTADA",
  },
  nivel1: { comando: n1.comando, itens: n1.itens },
  nivel2: { itens: n2.itens },
  nivel3: { executado: n3.executado, itens: n3.itens },
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
secao("REGRESSÃO", reg.itens);

console.log("\n=== ESTADOS FORMAIS ===");
for (const [k, v] of Object.entries(relatorio.estados)) console.log(`  ${k.padEnd(16)} ${v}`);
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
