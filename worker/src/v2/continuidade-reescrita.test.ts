// Fatia F — continuidade na reescrita.
// Antes: a meta-9 reescrevia SEM passar os anteriores (o gate de repetição nem
// rodava) e os vizinhos nunca eram revalidados; a edição estrutural só renomeava
// arquivos, deixando o "## Capítulo N" antigo na prosa.
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { renumerarCabecalhoCapitulo } from "./estrutural.js";
import { gateRepeticaoQuaseLiteral } from "./gates.js";
import { revalidarVizinhanca, vizinhancaDoCapitulo } from "./meta9.js";
import type { ContratoCompilado, SkillContract } from "./tipos.js";

const contrato: SkillContract = {
  schema: "skill-contract/v1",
  id: "teste",
  versao: "1.0.0",
  nome: "T",
  familia_editorial: "thriller",
  motor_narrativo: "m",
  unidade_dramatica: "cena",
  pov: { pessoa: "terceira_proxima" },
  temporalidade: "linear",
  faixa_palavras: {},
  ritmo: { descricao: "m" },
  acao_interioridade: { relacao: "equilibrio", descricao: "d" },
  politica_exposicao: "d",
  politica_dialogo: { descricao: "d" },
  politica_metafora: { descricao: "d" },
  tipos_gancho: ["ameaca"],
  regras: [],
  testes_positivos: [],
  sinais_negativos: [],
  excecoes: [],
  referencias: [],
  modelos_positivos: [],
};
const compilado: ContratoCompilado = { contrato, hash: "h", origem: "teste" };

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), "continuidade-"));
  mkdirSync(dir, { recursive: true });
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

function cap(n: number, corpo: string): void {
  writeFileSync(
    path.join(dir, `capitulo-${String(n).padStart(2, "0")}.md`),
    `## Capítulo ${n}\n\n${corpo}\n`,
    "utf8"
  );
}

describe("vizinhança entregue à reescrita", () => {
  it("reescrever o capítulo 5 recebe os 4 anteriores e a cauda do 4", () => {
    for (let n = 1; n <= 6; n++) cap(n, `Corpo distinto do capítulo ${n}. Última frase do ${n}.`);

    const v = vizinhancaDoCapitulo(dir, 5);

    // Antes, isto era uma lista vazia — o gate de repetição não tinha contra o que rodar.
    expect(v.anteriores.map((a) => a.numero)).toEqual([1, 2, 3, 4]);
    expect(v.anteriores[0].trecho).toContain("Corpo distinto do capítulo 1");
    // Continuidade imediata: a cauda do capítulo anterior.
    expect(v.trechosAnteriores).toHaveLength(1);
    expect(v.trechosAnteriores[0].titulo).toContain("FINAL DO CAPÍTULO 4");
    expect(v.trechosAnteriores[0].texto).toContain("Última frase do 4");
  });

  it("o capítulo 1 não tem vizinhança (sem falhar)", () => {
    cap(1, "Abertura.");
    const v = vizinhancaDoCapitulo(dir, 1);
    expect(v.anteriores).toEqual([]);
    expect(v.trechosAnteriores).toEqual([]);
  });

  it("capítulo ausente no disco é pulado, não quebra", () => {
    cap(1, "Um.");
    cap(3, "Três.");
    expect(vizinhancaDoCapitulo(dir, 4).anteriores.map((a) => a.numero)).toEqual([1, 3]);
  });
});

describe("revalidação da vizinhança após reescrita", () => {
  it("vizinho íntegro não acusa nada", () => {
    cap(1, "Marina abriu a porta do arquivo e contou as pastas na estante de metal.");
    cap(2, "Helena desligou o telefone e olhou o relógio na parede do escritório vazio.");
    expect(revalidarVizinhanca(dir, 1, 2, compilado)).toEqual([]);
  });

  it("vizinho truncado é acusado com o gate e a evidência", () => {
    cap(1, "Marina abriu a porta do arquivo e contou as pastas na estante.");
    cap(2, "Helena desligou o telefone e");
    const p = revalidarVizinhanca(dir, 1, 2, compilado);
    expect(p).toHaveLength(1);
    expect(p[0].capitulo).toBe(2);
    expect(p[0].gates.map((g) => g.gate)).toContain("texto_truncado");
    expect(p[0].gates[0].evidencia).toBeTruthy();
  });

  it("assinatura aforística reciclada do vizinho é pega pelo gate de repetição", () => {
    // O detector mede SLOT AFORÍSTICO: parágrafo de uma frase só, 3–16 palavras —
    // a "assinatura" que o modelo recicla entre capítulos. Frase enterrada no meio
    // de um parágrafo não é slot, e o gate (corretamente) não a persegue.
    const assinatura = "O silêncio do farol era uma forma de confissão.";
    cap(1, `Marina entrou no arquivo do consulado e contou as pastas.\n\n${assinatura}`);
    cap(2, `Helena esperou o elevador descer até o subsolo.\n\n${assinatura}`);
    const p = revalidarVizinhanca(dir, 1, 2, compilado);
    expect(p).toHaveLength(1);
    const gate = p[0].gates.find((g) => g.gate === "repeticao_quase_literal");
    expect(gate).toBeDefined();
    expect(gate!.evidencia).toContain("cap 1");
  });

  it("último capítulo não tem vizinho seguinte", () => {
    cap(1, "Um capítulo qualquer com uma frase inteira e ponto final.");
    expect(revalidarVizinhanca(dir, 1, 1, compilado)).toEqual([]);
  });
});

describe("edição estrutural renumera o cabeçalho da prosa", () => {
  it("troca o número mantendo nível, palavra e subtítulo", () => {
    expect(renumerarCabecalhoCapitulo("## Capítulo 9\n\nProsa.", 7)).toBe("## Capítulo 7\n\nProsa.");
    expect(renumerarCabecalhoCapitulo("# Capítulo 12 — A Torre\n\nProsa.", 3)).toBe(
      "# Capítulo 3 — A Torre\n\nProsa."
    );
    expect(renumerarCabecalhoCapitulo("### Cap. 4\n\nProsa.", 1)).toBe("### Cap. 1\n\nProsa.");
  });

  it("não inventa cabeçalho onde não há", () => {
    const semCabecalho = "Marina abriu a porta.\n\nE entrou.";
    expect(renumerarCabecalhoCapitulo(semCabecalho, 5)).toBe(semCabecalho);
  });

  it("não toca a prosa, só a primeira linha de cabeçalho", () => {
    const t = "## Capítulo 9\n\nEle leu o Capítulo 9 do manual e riu.\n\n## Capítulo 9 (nota)";
    const r = renumerarCabecalhoCapitulo(t, 2);
    expect(r).toContain("## Capítulo 2\n");
    // Menção no corpo e cabeçalho posterior permanecem intactos.
    expect(r).toContain("leu o Capítulo 9 do manual");
    expect(r).toContain("## Capítulo 9 (nota)");
  });

  it("preserva CRLF do checkout Windows", () => {
    expect(renumerarCabecalhoCapitulo("## Capítulo 9\r\n\r\nProsa.", 4)).toBe("## Capítulo 4\r\n\r\nProsa.");
  });

  it("texto vazio não quebra", () => {
    expect(renumerarCabecalhoCapitulo("", 3)).toBe("");
  });
});

describe("gate de repetição: capítulo inteiro vs. slots do ledger", () => {
  it("REGRESSÃO: alimentado com o capítulo INTEIRO, o gate continua funcionando", () => {
    // Achado 2026-07-28: `detectarRepeticaoCrossCapitulo` compara os slots do
    // capítulo atual contra cada `trecho` anterior e espera SLOTS ali. A V2 sempre
    // passou o capítulo inteiro — um slot de ~8 shingles contra os ~1500 de um
    // capítulo dá Jaccard ≈0,005 e o gate NUNCA disparava. `gateRepeticaoQuaseLiteral`
    // passou a converter o anterior em slots. Se alguém reverter essa conversão,
    // este teste falha.
    const assinatura = "O silêncio do farol era uma forma de confissão.";
    const anterior = `## Capítulo 1\n\n${"Marina contou as pastas na estante de metal do arquivo. ".repeat(40)}\n\n${assinatura}\n`;
    const atual = `## Capítulo 2\n\nHelena esperou o elevador descer até o subsolo do prédio.\n\n${assinatura}\n`;

    const g = gateRepeticaoQuaseLiteral(atual, [{ numero: 1, trecho: anterior }]);
    expect(g.passou).toBe(false);
    expect(g.evidencia).toContain("cap 1");
    expect(g.evidencia).toContain("silêncio do farol");
  });

  it("capítulo anterior longo e SEM assinatura repetida não gera falso positivo", () => {
    const anterior = `## Capítulo 1\n\n${"Marina contou as pastas na estante de metal do arquivo. ".repeat(40)}\n\nA chave estava fria.\n`;
    const atual = `## Capítulo 2\n\nHelena esperou o elevador descer até o subsolo do prédio.\n\nO relógio marcava três horas.\n`;
    expect(gateRepeticaoQuaseLiteral(atual, [{ numero: 1, trecho: anterior }]).passou).toBe(true);
  });
});
