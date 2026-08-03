// Meta-testes: provam que a conferência da DoD REPROVA nos casos negativos.
//
// Um verificador que só sabe dizer "tudo certo" não verifica nada. A correção do
// defeito D1 só vale se estes casos reprovarem de verdade — e é por isso que a
// lógica em `dod-conferencia.ts` é pura: dá para simular a execução (teste
// apagado, pulado, falhando, duplicado) sem mutilar o repositório.

import { describe, expect, it } from "vitest";
import { conferirDod, idsDeclarados, type ResultadoTesteDod } from "./dod-conferencia.js";
import { INVENTARIO_DOD, type GarantiaDoD } from "./inventario-dod.js";

const INV: GarantiaDoD[] = [
  { fatia: "X", escopo: "local", id: "X-01", garantia: "a coisa acontece", testes: ["src/v2/x.test.ts"] },
  { fatia: "X", escopo: "local", id: "X-02", garantia: "a outra coisa acontece", testes: ["src/v2/x.test.ts"] },
];

const teste = (nome: string, estado: ResultadoTesteDod["estado"] = "passou"): ResultadoTesteDod => ({
  arquivo: "src/v2/x.test.ts",
  nome,
  estado,
});

const TODOS_OK = [teste("[DOD:X-01] prova a coisa"), teste("[DOD:X-02] prova a outra")];

describe("extração de ID do título", () => {
  it("lê o ID declarado", () => {
    expect(idsDeclarados("[DOD:B-01] MUTAÇÃO: pov_violado reprova")).toEqual(["B-01"]);
  });

  it("um teste pode declarar mais de um ID", () => {
    expect(idsDeclarados("[DOD:P-01] [DOD:P-02] update e correção")).toEqual(["P-01", "P-02"]);
  });

  it("título sem marcação não declara nada (não conta como prova de coisa alguma)", () => {
    expect(idsDeclarados("update é recusado — nem para o worker")).toEqual([]);
  });
});

describe("caso positivo", () => {
  it("todos os IDs presentes, executados e passando APROVAM", () => {
    const c = conferirDod(INV, TODOS_OK);
    expect(c.ok).toBe(true);
    expect(c.inventariadas).toBe(2);
    expect(c.encontradas).toBe(2);
    expect(c.executadas).toBe(2);
    expect(c.aprovadas).toBe(2);
    expect(c.problemas).toEqual([]);
  });

  it("uma garantia provada por VÁRIOS testes aprova quando todos passam", () => {
    const c = conferirDod(INV, [
      teste("[DOD:X-01] dimensão A"),
      teste("[DOD:X-01] dimensão B"),
      teste("[DOD:X-02] prova a outra"),
    ]);
    expect(c.ok).toBe(true);
    expect(c.aprovadas).toBe(2);
  });
});

describe("caso negativo: o ID esperado sumiu", () => {
  it("remover um ID esperado REPROVA a implementação", () => {
    const c = conferirDod(INV, [teste("[DOD:X-01] prova a coisa")]);
    expect(c.ok).toBe(false);
    expect(c.semTeste).toEqual(["X-02"]);
    expect(c.aprovadas).toBe(1);
    expect(c.problemas.join(" ")).toContain("X-02");
  });

  it("o arquivo continua existindo, mas sem o teste/ID: REPROVA", () => {
    // O defeito original: `existsSync` do arquivo dizia sim. Aqui o arquivo
    // "existe" (outros testes dele rodaram), e ainda assim reprova.
    const c = conferirDod(INV, [
      teste("[DOD:X-01] prova a coisa"),
      teste("um teste qualquer que não declara ID nenhum"),
    ]);
    expect(c.ok).toBe(false);
    expect(c.semTeste).toEqual(["X-02"]);
  });

  it("nenhum teste declarando nada reprova as duas", () => {
    const c = conferirDod(INV, [teste("teste solto")]);
    expect(c.ok).toBe(false);
    expect(c.semTeste).toEqual(["X-01", "X-02"]);
    expect(c.encontradas).toBe(0);
    expect(c.aprovadas).toBe(0);
  });
});

describe("caso negativo: o teste não rodou", () => {
  it("teste SKIPPED não conta como aprovado", () => {
    const c = conferirDod(INV, [teste("[DOD:X-01] prova a coisa"), teste("[DOD:X-02] prova a outra", "pulado")]);
    expect(c.ok).toBe(false);
    expect(c.aprovadas).toBe(1);
    expect(c.executadas).toBe(1);
    expect(c.naoExecutadas.map((p) => p.id)).toEqual(["X-02"]);
    expect(c.problemas.join(" ")).toContain("pulado");
  });

  it("um teste pulado contamina o ID mesmo com outro passando", () => {
    // Garantia com várias dimensões: dimensão pulada = dimensão não provada.
    const c = conferirDod(INV, [
      teste("[DOD:X-01] dimensão A"),
      teste("[DOD:X-01] dimensão B", "pulado"),
      teste("[DOD:X-02] prova a outra"),
    ]);
    expect(c.ok).toBe(false);
    expect(c.naoExecutadas.map((p) => p.id)).toEqual(["X-01"]);
  });
});

describe("caso negativo: o teste falhou", () => {
  it("teste FALHANDO não conta como aprovado", () => {
    const c = conferirDod(INV, [teste("[DOD:X-01] prova a coisa"), teste("[DOD:X-02] prova a outra", "falhou")]);
    expect(c.ok).toBe(false);
    expect(c.aprovadas).toBe(1);
    expect(c.executadas).toBe(2); // rodou — mas rodou vermelho
    expect(c.reprovadas.map((p) => p.id)).toEqual(["X-02"]);
  });

  it("falha pesa mais que passagem: um verde não salva o ID", () => {
    const c = conferirDod(INV, [
      teste("[DOD:X-01] dimensão A"),
      teste("[DOD:X-01] dimensão B", "falhou"),
      teste("[DOD:X-02] prova a outra"),
    ]);
    expect(c.ok).toBe(false);
    expect(c.reprovadas.map((p) => p.id)).toEqual(["X-01"]);
  });
});

describe("caso negativo: inventário incoerente", () => {
  it("ID DUPLICADO no inventário reprova", () => {
    const dup: GarantiaDoD[] = [
      ...INV,
      { fatia: "X", escopo: "local", id: "X-01", garantia: "repetida", testes: ["src/v2/x.test.ts"] },
    ];
    const c = conferirDod(dup, TODOS_OK);
    expect(c.ok).toBe(false);
    expect(c.duplicadosInventario).toEqual(["X-01"]);
    expect(c.problemas.join(" ")).toContain("duplicado");
  });

  it("ID declarado em teste e AUSENTE do inventário é denunciado", () => {
    const c = conferirDod(INV, [...TODOS_OK, teste("[DOD:X-99] garantia que ninguém inventariou")]);
    expect(c.ok).toBe(false);
    expect(c.orfaos).toEqual(["X-99"]);
    expect(c.problemas.join(" ")).toContain("ausente do inventário");
  });

  it("ID órfão em ARQUIVO QUE O INVENTÁRIO NÃO CITA também é pego", () => {
    // O buraco que a coleta restrita deixava: rodar só os arquivos do inventário
    // nunca enxergaria um `[DOD:]` esquecido num arquivo novo. Por isso a coleta
    // varre a suíte inteira, e é essa varredura que este caso representa.
    const c = conferirDod(INV, [
      ...TODOS_OK,
      { arquivo: "src/v2/suite-nova-fora-do-inventario.test.ts", nome: "[DOD:Z-01] garantia solta", estado: "passou" },
    ]);
    expect(c.ok).toBe(false);
    expect(c.orfaos).toEqual(["Z-01"]);
  });

  it("arquivo citado pelo inventário e AUSENTE do disco reprova", () => {
    const c = conferirDod(INV, TODOS_OK, { arquivosAusentes: ["src/v2/sumiu.test.ts"] });
    expect(c.ok).toBe(false);
    expect(c.arquivosAusentes).toEqual(["src/v2/sumiu.test.ts"]);
    expect(c.problemas.join(" ")).toContain("não existe");
  });
});

describe("caso negativo: a própria coleta falhou", () => {
  it("erro de execução ou JSON incompleto REPROVA", () => {
    const c = conferirDod(INV, TODOS_OK, { erro: "o vitest não produziu o relatório JSON" });
    expect(c.ok).toBe(false);
    expect(c.falhasDeColeta.join(" ")).toContain("coleta falhou");
  });

  it("ZERO testes coletados nunca é sucesso", () => {
    // Suíte que não rodou não tem garantia reprovada nem aprovada — e era assim
    // que um comando quebrado poderia sair verde por vacuidade.
    const c = conferirDod([], []);
    expect(c.ok).toBe(false);
    expect(c.falhasDeColeta.join(" ")).toContain("não rodou");
  });

  it("execução que reporta zero testes reprova mesmo com resultados no array", () => {
    const c = conferirDod(INV, TODOS_OK, { totalTestesColetados: 0 });
    expect(c.ok).toBe(false);
    expect(c.falhasDeColeta.join(" ")).toContain("zero testes");
  });
});

describe("garantia de escopo externo", () => {
  const comExterna: GarantiaDoD[] = [
    ...INV,
    { fatia: "X", escopo: "externo", id: "X-90", garantia: "sobe ao serviço real", testes: [] },
  ];

  it("não é aprovada pela suíte local e não conta como local faltando", () => {
    const c = conferirDod(comExterna, TODOS_OK);
    expect(c.ok).toBe(true); // as locais estão todas provadas
    expect(c.externas).toEqual(["X-90"]);
    expect(c.locais).toBe(2);
    expect(c.aprovadas).toBe(2);
    expect(c.semTeste).toEqual([]);
  });

  it("teste local que tenta aprovar garantia externa é denunciado", () => {
    // Mock não é integração real: se alguém marcar `[DOD:X-90]` num teste local,
    // o relatório precisa dizer que aquilo não prova o que promete.
    const c = conferirDod(comExterna, [...TODOS_OK, teste("[DOD:X-90] finge que subiu ao Storage")]);
    expect(c.problemas.join(" ")).toContain("não pode ser aprovada por teste local");
  });
});

describe("o inventário real", () => {
  it("tem 64 garantias, todas com ID único", () => {
    expect(INVENTARIO_DOD).toHaveLength(64);
    const ids = INVENTARIO_DOD.map((g) => g.id);
    expect(new Set(ids).size).toBe(64);
  });

  it("garantia externa não declara teste local (mock não prova integração real)", () => {
    for (const g of INVENTARIO_DOD.filter((x) => x.escopo === "externo")) {
      expect(g.testes, `${g.id} não pode apontar teste local`).toEqual([]);
    }
    expect(INVENTARIO_DOD.some((g) => g.escopo === "externo")).toBe(true);
  });

  it("toda garantia local aponta ao menos um arquivo de teste", () => {
    for (const g of INVENTARIO_DOD.filter((x) => x.escopo === "local")) {
      expect(g.testes.length, `${g.id} sem arquivo de teste`).toBeGreaterThan(0);
    }
  });

  it("todo ID segue o formato <fatia>-<n> e casa com a fatia declarada", () => {
    for (const g of INVENTARIO_DOD) {
      expect(g.id, g.garantia).toMatch(/^[A-Z0-9]+-\d{2}$/);
      expect(g.id.startsWith(`${g.fatia}-`), `${g.id} não casa com a fatia ${g.fatia}`).toBe(true);
    }
  });
});
