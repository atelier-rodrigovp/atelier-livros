import { describe, expect, it } from "vitest";
import { interpretarRelatorioVitest, type RelatorioBruto } from "./coleta-vitest.js";

const rel = (abs: string) => abs.replace(/^.*[\\/](src|worker)[\\/]/, "$1/");

const verde: RelatorioBruto = {
  testResults: [
    {
      name: "/repo/worker/src/x.test.ts",
      assertionResults: [
        { fullName: "a passa", status: "passed" },
        { fullName: "b passa", status: "passed" },
      ],
    },
  ],
};

describe("execução saudável", () => {
  it("relatório verde e processo zero aprova", () => {
    const r = interpretarRelatorioVitest(verde, undefined, rel);
    expect(r.ok).toBe(true);
    expect(r.passaram).toBe(2);
    expect(r.erro).toBeUndefined();
  });
});

describe("fail-closed: o código de saída manda", () => {
  it("JSON VERDE + processo NÃO ZERO reprova", () => {
    // O caso que o código antigo escondia: crash do runner, erro não tratado num
    // worker ou teardown quebrado sai != 0 sem marcar teste vermelho. O relatório
    // parcial que sobrava era lido como sucesso.
    const r = interpretarRelatorioVitest(verde, "Error: worker exited unexpectedly", rel);
    expect(r.ok).toBe(false);
    expect(r.falharam).toBe(0);
    expect(r.erro).toContain("apesar do relatório verde");
  });

  it("o erro do processo nunca é descartado só porque existe JSON", () => {
    const r = interpretarRelatorioVitest(verde, "Unhandled rejection em setup", rel);
    expect(r.erro).toContain("Unhandled rejection");
  });

  it("teste vermelho reprova e reporta a contagem", () => {
    const comFalha: RelatorioBruto = {
      testResults: [{ name: "/repo/worker/src/y.test.ts", assertionResults: [{ fullName: "cai", status: "failed" }] }],
    };
    const r = interpretarRelatorioVitest(comFalha, "exit 1", rel);
    expect(r.ok).toBe(false);
    expect(r.falharam).toBe(1);
  });
});

describe("coleta degenerada nunca é sucesso", () => {
  it("relatório ausente reprova", () => {
    const r = interpretarRelatorioVitest(null, "spawn falhou", rel);
    expect(r.ok).toBe(false);
    expect(r.erro).toContain("ausente ou ilegível");
  });

  it("relatório sem `testResults` reprova", () => {
    const r = interpretarRelatorioVitest({ numTotalTests: 10 }, undefined, rel);
    expect(r.ok).toBe(false);
    expect(r.erro).toContain("incompleto");
  });

  it("ZERO testes coletados reprova mesmo com processo zero", () => {
    const r = interpretarRelatorioVitest({ testResults: [] }, undefined, rel);
    expect(r.ok).toBe(false);
    expect(r.total).toBe(0);
    expect(r.erro).toContain("nenhum teste");
  });
});

describe("classificação dos estados", () => {
  it("pending, todo e skipped contam como PULADO, nunca como passou", () => {
    const r = interpretarRelatorioVitest(
      {
        testResults: [
          {
            name: "/repo/worker/src/z.test.ts",
            assertionResults: [
              { fullName: "p", status: "pending" },
              { fullName: "t", status: "todo" },
              { fullName: "s", status: "skipped" },
              { fullName: "ok", status: "passed" },
            ],
          },
        ],
      },
      undefined,
      rel
    );
    expect(r.pulados).toBe(3);
    expect(r.passaram).toBe(1);
  });
});
