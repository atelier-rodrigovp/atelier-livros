import { describe, it, expect } from "vitest";
import {
  detectarRepeticaoCrossCapitulo, extrairSlotsAforisticos, entradasLedgerDoCapitulo,
  parseDiaHora, checarDiaHoraSequencia, contarMuletas,
} from "./maneirismo.js";
import { avaliarRotacaoFio } from "./exigencias-skill.js";

// ---- Fase 1: repetição verbatim cross-capítulo (o caso real do Índice) ----
describe("detectarRepeticaoCrossCapitulo (gap 1)", () => {
  const cap12 = "Ele parou no corredor.\n\nA mão soube antes da cabeça, do jeito que a mão de um velho sabia bater no manômetro, e se fechou.\n\nO relógio sumiu no bolso.";
  const cap20 = "A estrada tinha uma matemática limpa.\n\nA mão soube antes da cabeça, esterçou para a rampa, e ele deixou.\n\nO motel apareceu à direita.";

  it("pega a assinatura verbatim/quase-verbatim entre capítulos", () => {
    const ledger = entradasLedgerDoCapitulo(12, cap12).map((e) => ({ numero: e.capitulo, trecho: e.trecho_original }));
    const hits = detectarRepeticaoCrossCapitulo(cap20, ledger);
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0].capituloAnterior).toBe(12);
    expect(hits[0].trecho.toLowerCase()).toContain("a mão soube antes da cabeça");
  });
  it("verbatim exato = tipo verbatim, score 1", () => {
    const frase = "A verdade não se esconde, ela apenas espera.";
    const ledger = [{ numero: 3, trecho: frase }];
    const hits = detectarRepeticaoCrossCapitulo(`Parágrafo.\n\n${frase}\n\nOutro.`, ledger);
    expect(hits.some((h) => h.tipo === "verbatim" && h.score === 1)).toBe(true);
  });
  it("prosa diferente NÃO dá falso positivo", () => {
    const ledger = entradasLedgerDoCapitulo(1, "Ela abriu a porta devagar.\n\nO vento entrou frio pela fresta da janela.").map((e) => ({ numero: e.capitulo, trecho: e.trecho_original }));
    const hits = detectarRepeticaoCrossCapitulo("Ninguém esperava a chuva.\n\nO trem partiu às seis em ponto.", ledger);
    expect(hits.length).toBe(0);
  });
  it("extrai slots aforísticos (frase isolada + após dois-pontos)", () => {
    const slots = extrairSlotsAforisticos("Longo parágrafo com várias frases aqui dentro. E mais uma.\n\nCuradores não perguntam: eles curam o que não entendem.");
    expect(slots.length).toBeGreaterThan(0);
  });
});

// ---- Fase 3b: aritmética de Dia/Hora (o bug spec-16/17 do Índice) ----
describe("Dia/Hora (gap 3b)", () => {
  it("parseDiaHora extrai dia-da-semana + offset", () => {
    expect(parseDiaHora("Dia/Hora corrente: SEXTA-FEIRA, DIA N+3 — 08h00")).toEqual({ dia: 5, offset: 3 });
    expect(parseDiaHora("SÁBADO, DIA N+5 — noite")).toEqual({ dia: 6, offset: 5 });
    expect(parseDiaHora("sem dia nem offset")).toBeNull();
  });
  it("pega o salto SEXTA N+3 → SEXTA N+4 (offset avança, dia não)", () => {
    const bad = checarDiaHoraSequencia([
      { numero: 16, diaHoraLinha: "SEXTA-FEIRA, DIA N+3 — 08h00" },
      { numero: 17, diaHoraLinha: "SEXTA-FEIRA, DIA N+4 — 17h00" },
    ]);
    expect(bad.length).toBe(1);
    expect(bad[0].capitulo).toBe(17);
    expect(bad[0].motivo).toMatch(/sexta.*N\+4/i);
  });
  it("sequência coerente PASSA", () => {
    const ok = checarDiaHoraSequencia([
      { numero: 13, diaHoraLinha: "QUARTA-FEIRA, DIA N+1 — 17h00" },
      { numero: 14, diaHoraLinha: "QUINTA-FEIRA, DIA N+2 — 10h00" },
      { numero: 16, diaHoraLinha: "SEXTA-FEIRA, DIA N+3 — 08h00" },
    ]);
    expect(ok.length).toBe(0);
  });
  it("specs sem o campo são ignoradas (degrade gracioso)", () => {
    const r = checarDiaHoraSequencia([
      { numero: 12, diaHoraLinha: "" },
      { numero: 13, diaHoraLinha: "QUARTA-FEIRA, DIA N+1 — 17h00" },
    ]);
    expect(r.length).toBe(0);
  });
});

// ---- Fase 2: guarda de monotonia de POV (os 7 Helena seguidos do Índice) ----
describe("avaliarRotacaoFio (gap 2)", () => {
  const EX = { maxCapsMesmoFioAbsoluto: 5, janelaDiversidade: { tamanho: 10, ratioMax: 0.7 } };
  it("reprova 6º cap consecutivo no mesmo fio (teto absoluto, mesmo com justificativa)", () => {
    const fios = ["H", "H", "C", "H", "H", "H", "H", "H", "H"]; // caps 4–9 = 6 Helena seguidos
    const r = avaliarRotacaoFio(fios, 9, EX);
    expect(r.some((m) => /teto absoluto/.test(m))).toBe(true);
  });
  it("reprova monotonia na janela (8 de 10 = o real do Índice, caps 12–21)", () => {
    const fios = ["C", "H", "H", "H", "H", "H", "H", "H", "C", "H"]; // 8 H em 10 = 80% > 70%
    const r = avaliarRotacaoFio(fios, 10, { janelaDiversidade: { tamanho: 10, ratioMax: 0.7 } });
    expect(r.some((m) => /monotonia/.test(m))).toBe(true);
  });
  it("rotação saudável PASSA", () => {
    const fios = ["H", "C", "H", "R", "H", "C", "H", "R", "H", "C"];
    expect(avaliarRotacaoFio(fios, 10, EX).length).toBe(0);
  });
});

// ---- Fase 3a: léxico llegou/llegó ----
describe("léxico estrangeiro (gap 3a)", () => {
  it("llegou/llegó estouram (alvo 0)", () => {
    const m = contarMuletas("O homem que risca nomes já llegou há quanto tempo?");
    expect(m.some((x) => x.termo.includes("estrangeiro") && x.n > 0 && x.acima)).toBe(true);
  });
  it("PT-BR legítimo não estoura por 'llegou'", () => {
    const m = contarMuletas("Ele chegou cedo e esperou na porta.");
    expect(m.some((x) => x.termo.includes("estrangeiro"))).toBe(false);
  });
});
