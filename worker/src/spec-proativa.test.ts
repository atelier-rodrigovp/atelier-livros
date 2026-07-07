import { describe, it, expect } from "vitest";
import {
  skillExigeSpec, proximaSpecAlvo, gateSpecExistenciaSimulado,
  camposObrigatoriosSpec, instrucaoCamposProativa,
} from "./spec-proativa.js";
import { EXIGENCIAS_ESTRUTURAIS_POR_SKILL } from "./exigencias-skill.js";

const CAMPOS_DAN_BROWN = EXIGENCIAS_ESTRUTURAIS_POR_SKILL["skill-dan-brown"].camposSpec;

function specCompleta(campos: string[]): string {
  return campos.map((c) => `**${c}:** valor de exemplo para "${c}" neste capitulo`).join("\n") + "\n";
}

describe("skillExigeSpec / proximaSpecAlvo — decisao (mesma fonte do gate reativo)", () => {
  it("as 3 skills com EXIGE_SPEC_POR_SKILL exigem spec", () => {
    expect(skillExigeSpec("skill-dan-brown")).toBe(true);
    expect(skillExigeSpec("hoover-mcfadden")).toBe(true);
    expect(skillExigeSpec("skill-romantasy")).toBe(true);
  });

  it("skill sem entrada (ex.: jk-rowling/vesper) nao exige spec", () => {
    expect(skillExigeSpec("skill-jk-rowling")).toBe(false);
    expect(skillExigeSpec("vesper-escritor-de-capitulos")).toBe(false);
    expect(skillExigeSpec(undefined)).toBe(false);
    expect(skillExigeSpec(null)).toBe(false);
  });

  it("alvo = proximo capitulo, dentro do livro", () => {
    expect(proximaSpecAlvo("skill-dan-brown", 5, 32)).toBe(6);
  });

  it("fechar o ULTIMO capitulo -> null (nao ha N+1 dentro do livro)", () => {
    expect(proximaSpecAlvo("skill-dan-brown", 32, 32)).toBeNull();
  });
});

describe("DoD (a) — capitulo N fecha normalmente: spec de N+1 ja existe e completa ANTES do gate rodar", () => {
  it("dan-brown: fechar cap 9 materializa a spec do 10 (mesmo caso medido no Indice)", () => {
    const total = 32;
    const alvo = proximaSpecAlvo("skill-dan-brown", 9, total);
    expect(alvo).toBe(10);

    // A materializacao proativa (Task->livro-editor, MESMO fechamento de N) grava a
    // spec do alvo ANTES de o runner sequer computar `alvo=10` e chamar o gate.
    const discoAposFechamentoDeN: Record<number, string> = { [alvo as number]: specCompleta(CAMPOS_DAN_BROWN) };

    // Quando o runner, na iteracao SEGUINTE, chegar a gate_spec_capitulo(10): a
    // spec ja esta la, completa -> gate (eixo existencia/completude) NAO dispara.
    const motivo = gateSpecExistenciaSimulado(discoAposFechamentoDeN[alvo as number], CAMPOS_DAN_BROWN);
    expect(motivo).toBeNull();
  });

  it("hoover e romantasy tambem materializam completa (campos proprios de cada skill)", () => {
    for (const skill of ["hoover-mcfadden", "skill-romantasy"] as const) {
      const campos = EXIGENCIAS_ESTRUTURAIS_POR_SKILL[skill].camposSpec;
      const alvo = proximaSpecAlvo(skill, 3, 20);
      expect(alvo).toBe(4);
      const texto = specCompleta(campos);
      expect(gateSpecExistenciaSimulado(texto, campos)).toBeNull();
    }
  });
});

describe("DoD (b) — materializacao proativa FALHA: o gate ainda pega e dispara o regen normal", () => {
  it("falha total (nada foi escrito) -> gate reprova EXATAMENTE como hoje (spec ausente)", () => {
    const alvo = proximaSpecAlvo("skill-dan-brown", 14, 32);
    expect(alvo).toBe(15);
    // Simula falha: a materializacao proativa nao gravou nada no disco.
    const discoAposFalha: Record<number, string> = {};
    const motivo = gateSpecExistenciaSimulado(discoAposFalha[alvo as number] ?? null, CAMPOS_DAN_BROWN);
    expect(motivo).toBe("spec ausente");

    // Equivalencia com o comportamento PRE-FIX: no disco original (sem a etapa
    // proativa sequer existir), o mesmo capitulo sem spec dava o MESMO motivo —
    // ou seja, a falha da proativa NAO regride o comportamento de hoje.
    const motivoPreFix = gateSpecExistenciaSimulado(null, CAMPOS_DAN_BROWN);
    expect(motivo).toBe(motivoPreFix);
  });

  it("falha parcial (spec incompleta) -> gate reprova por campo faltante, regen dirigido normal", () => {
    const alvo = proximaSpecAlvo("skill-dan-brown", 28, 32);
    expect(alvo).toBe(29);
    // Simula falha parcial: a materializacao proativa esqueceu "Dia/Hora".
    const campos = CAMPOS_DAN_BROWN.filter((c) => c !== "Dia/Hora");
    const specIncompleta = specCompleta(campos);
    const motivo = gateSpecExistenciaSimulado(specIncompleta, CAMPOS_DAN_BROWN);
    expect(motivo).toBe("spec sem campo(s): Dia/Hora");
  });
});

// FASE 1 (escala/TOKEN): a materializacao proativa emitia spec faltando 2/3 campos porque
// o passo so REFERENCIAVA o formato "SPEC COMPLETA". Agora enumera os campos obrigatorios.
describe("FASE 1 — instrucao proativa enumera os campos obrigatorios (checklist explicito)", () => {
  it("dan-brown: a instrucao lista TODOS os campos do gate, preenchidos", () => {
    const campos = camposObrigatoriosSpec("skill-dan-brown");
    expect(campos).toEqual(EXIGENCIAS_ESTRUTURAIS_POR_SKILL["skill-dan-brown"].camposSpec);
    const instr = instrucaoCamposProativa("skill-dan-brown");
    for (const c of campos) expect(instr).toContain(c);              // cada campo nomeado
    expect(instr.toUpperCase()).toContain("PREENCHIDO");             // exige conteudo, nao so header
    // reforca os 2 campos que a producao omitiu (caps 34/35 do Indice)
    expect(instr).toContain("Fio de POV");
    expect(instr).toContain("Decisão/Ação");
  });

  it("hoover e romantasy: a instrucao usa os campos PROPRIOS de cada skill (sem duplicar lista)", () => {
    for (const skill of ["hoover-mcfadden", "skill-romantasy"] as const) {
      const instr = instrucaoCamposProativa(skill);
      for (const c of EXIGENCIAS_ESTRUTURAIS_POR_SKILL[skill].camposSpec) expect(instr).toContain(c);
    }
  });

  it("skill sem exigencia: instrucao vazia (no-op)", () => {
    expect(instrucaoCamposProativa("skill-jk-rowling")).toBe("");
    expect(instrucaoCamposProativa(undefined)).toBe("");
  });
});

// FASE 1/2 (enabler): presenca por HEADING-ou-LABEL. As specs reais usam formato MISTO
// ('## Fio de POV' vs '- **Decisao/Acao:** valor'); a checagem antiga (substring) casava o
// nome do campo solto na prosa — perigoso para "Modo" ("de modo que"). O gate agora exige
// que o campo apareca como cabecalho OU rotulo.
describe("FASE 1/2 — gate reconhece campo em HEADING e em LABEL; nao casa prosa", () => {
  const campos = ["Fio de POV", "Modo"];
  it("campo como HEADING (## Fio de POV) conta como presente", () => {
    const spec = "## Fio de POV\n### H+R (Helena + Reyland)\n- **Modo:** dramático\n";
    expect(gateSpecExistenciaSimulado(spec, campos)).toBeNull();
  });
  it("campo como LABEL (- **Modo:** dramático) conta como presente", () => {
    const spec = "- **Fio de POV:** Helena\n- **Modo:** confronto\n";
    expect(gateSpecExistenciaSimulado(spec, campos)).toBeNull();
  });
  it("'de modo que' na PROSA nao satisfaz o campo 'Modo' (sem falso-positivo)", () => {
    const spec = "- **Fio de POV:** Helena\n- Beat: ela agiu de modo que a verdade viesse.\n";
    expect(gateSpecExistenciaSimulado(spec, campos)).toBe("spec sem campo(s): Modo");
  });
  it("campo PRESENTE-mas-so-header sem valor ainda conta como presente (heading e presenca legitima)", () => {
    // heading e uma forma valida de declarar o campo (as specs reais usam); o conteudo abaixo
    // do heading e responsabilidade do editor/revisor, nao do gate de existencia.
    const spec = "## Fio de POV\n## Modo\n";
    expect(gateSpecExistenciaSimulado(spec, campos)).toBeNull();
  });
});

describe("DoD (c) — skill sem EXIGE_SPEC_POR_SKILL: no-op, nada muda", () => {
  it("skill-jk-rowling: proximaSpecAlvo nunca pede materializacao, para nenhum capitulo/total", () => {
    for (const n of [1, 5, 10, 49, 50]) {
      expect(proximaSpecAlvo("skill-jk-rowling", n, 50)).toBeNull();
    }
  });

  it("skill desconhecida/ausente: mesmo no-op (paridade com o gate reativo, que tambem e no-op)", () => {
    expect(proximaSpecAlvo(undefined, 5, 50)).toBeNull();
    expect(proximaSpecAlvo("", 5, 50)).toBeNull();
  });
});
