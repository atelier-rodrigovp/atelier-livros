// Fatia L — canário como snapshot imutável e invalidação de artefatos.
// Fixtures apenas: este teste NUNCA gera canário (não chama modelo de prosa).
import { describe, expect, it } from "vitest";
import { hashText } from "../quality-state.js";
import {
  compararPremissas,
  criarSnapshotCanario,
  decidirComPremissaAlterada,
  DEPENDENCIAS,
  derivarPerfilDoCanario,
  hashPremissas,
  invalidarPorPremissa,
  perfilDerivaDoCanario,
  snapshotIntacto,
  type Premissas,
} from "./canario-snapshot.js";

// Amostra de canário APROVADA — fixture fixa, nunca gerada aqui.
const AMOSTRA = [
  "O farol apagou às três da manhã e Marina soube, antes de olhar o relógio, que não era falta de luz.",
  "Ela desceu os degraus de ferro contando cada um, como fazia quando o irmão ainda morava na ilha.",
  "No último degrau havia uma chave que não era dela.",
].join(" ");

const snapshot = () =>
  criarSnapshotCanario({
    texto: AMOSTRA,
    skill: { id: "dan-brown", versao: "1.0.0", hash: "hskill" },
    modelo: "modelo-prosa",
    projectId: "proj-1",
    aprovadoPor: "rodrigo",
    aprovadoEm: "2026-07-28T00:00:00.000Z",
  });

function premissas(over: Partial<Premissas> = {}): Premissas {
  return {
    canario_hash: hashText(AMOSTRA),
    briefing_hash: "hbrief",
    idioma: "pt-BR",
    skill_id: "dan-brown",
    skill_hash: "hskill",
    contrato_hash: "hcontrato",
    total_capitulos: 12,
    docs: { "fundacao/biblia-da-obra.md": "hbiblia", "estrutura.json": "hestrutura" },
    ...over,
  };
}

describe("snapshot do canário é imutável e completo", () => {
  it("guarda o texto INTEGRAL, hash, contrato, modelo, data e decisão do autor", () => {
    const s = snapshot();
    expect(s.texto).toBe(AMOSTRA);
    expect(s.hash).toBe(hashText(AMOSTRA));
    expect(s.skill.id).toBe("dan-brown");
    expect(s.modelo).toBe("modelo-prosa");
    expect(s.aprovado_por).toBe("rodrigo");
    expect(s.aprovado_em).toBe("2026-07-28T00:00:00.000Z");
    expect(s.projectId).toBe("proj-1");
  });

  it("recusa snapshot sem o texto (resumo não é snapshot)", () => {
    expect(() =>
      criarSnapshotCanario({
        texto: "   ",
        skill: { id: "x", versao: "1", hash: "h" },
        modelo: "m",
        projectId: "p",
        aprovadoPor: "a",
        aprovadoEm: "d",
      })
    ).toThrow(/texto integral/);
  });

  it("adulteração do texto é DETECTÁVEL", () => {
    const s = { ...snapshot(), texto: AMOSTRA.replace("chave", "moeda") };
    expect(snapshotIntacto(s)).toBe(false);
  });

  it("snapshot íntegro confere", () => {
    expect(snapshotIntacto(snapshot())).toBe(true);
  });

  it("registra o ajuste que o autor pediu antes de aprovar", () => {
    const s = criarSnapshotCanario({
      texto: AMOSTRA,
      skill: { id: "d", versao: "1", hash: "h" },
      modelo: "m",
      projectId: "p",
      aprovadoPor: "rodrigo",
      aprovadoEm: "d",
      ajusteAutor: "menos interioridade, mais ação concreta",
    });
    expect(s.ajuste_autor).toContain("menos interioridade");
  });
});

describe("o perfil de voz DERIVA do snapshot, de forma verificável", () => {
  it("o perfil carrega o hash do canário aprovado", () => {
    const s = snapshot();
    const p = derivarPerfilDoCanario(s, "Voz seca, frase curta, sem ornamento.");
    expect(p.canario_hash).toBe(s.hash);
    expect(perfilDerivaDoCanario(p, s)).toBe(true);
  });

  it("perfil SEM proveniência não conta como derivado (era a afirmação sem verificação)", () => {
    expect(perfilDerivaDoCanario({}, snapshot())).toBe(false);
  });

  it("perfil derivado de OUTRO canário é detectado", () => {
    const outro = criarSnapshotCanario({
      texto: "Uma amostra completamente diferente, com outra voz e outro ritmo de frase.",
      skill: { id: "d", versao: "1", hash: "h" },
      modelo: "m",
      projectId: "p",
      aprovadoPor: "a",
      aprovadoEm: "d",
    });
    const p = derivarPerfilDoCanario(outro, "Voz X");
    expect(perfilDerivaDoCanario(p, snapshot())).toBe(false);
  });

  it("não deriva perfil de snapshot adulterado", () => {
    const s = { ...snapshot(), texto: AMOSTRA + " frase acrescentada depois da aprovação." };
    expect(() => derivarPerfilDoCanario(s, "Voz")).toThrow(/adulterado/);
  });
});

describe("mudança de premissa invalida os artefatos dependentes", () => {
  it("premissas iguais não invalidam nada", () => {
    expect(compararPremissas(premissas(), premissas())).toEqual([]);
    expect(invalidarPorPremissa([])).toBeNull();
  });

  it("trocar o CANÁRIO invalida perfil, fundação, fichas, capítulos e avaliação", () => {
    const m = compararPremissas(premissas(), premissas({ canario_hash: "outro" }));
    const inv = invalidarPorPremissa(m)!;
    expect(inv.artefatos).toEqual(DEPENDENCIAS.canario_hash);
    expect(inv.motivo).toContain("canario_hash");
  });

  it("trocar o BRIEFING invalida fundação em diante", () => {
    const inv = invalidarPorPremissa(compararPremissas(premissas(), premissas({ briefing_hash: "novo" })))!;
    expect(inv.artefatos).toContain("fundacao");
    expect(inv.artefatos).toContain("capitulos");
  });

  it("trocar a SKILL invalida tudo que a voz sustenta", () => {
    const inv = invalidarPorPremissa(compararPremissas(premissas(), premissas({ skill_id: "hoover-mcfadden" })))!;
    expect(inv.artefatos).toContain("perfil_de_voz");
  });

  it("trocar o IDIOMA invalida a prosa escrita", () => {
    const inv = invalidarPorPremissa(compararPremissas(premissas(), premissas({ idioma: "en-US" })))!;
    expect(inv.artefatos).toContain("capitulos");
  });

  it("mudar o TOTAL DE CAPÍTULOS invalida fundação, fichas e manuscrito", () => {
    const inv = invalidarPorPremissa(compararPremissas(premissas(), premissas({ total_capitulos: 20 })))!;
    expect(inv.artefatos).toEqual(expect.arrayContaining(["fundacao", "fichas", "manuscrito"]));
  });

  it("substituir um DOCUMENTO CENTRAL invalida fichas e capítulos", () => {
    const inv = invalidarPorPremissa(
      compararPremissas(premissas(), premissas({ docs: { "fundacao/biblia-da-obra.md": "OUTRA", "estrutura.json": "hestrutura" } }))
    )!;
    expect(inv.artefatos).toContain("fichas");
  });

  it("o motivo diz ao autor o que deixou de valer e o que fazer", () => {
    const inv = invalidarPorPremissa(compararPremissas(premissas(), premissas({ idioma: "en-US" })))!;
    expect(inv.motivo).toContain("Reconstrua ou migre");
    expect(inv.motivo).toContain("não são válidos sob a nova");
  });

  it("o hash de premissas muda quando qualquer uma muda", () => {
    expect(hashPremissas(premissas())).not.toBe(hashPremissas(premissas({ idioma: "en-US" })));
  });
});

describe("portão: nada segue sobre base alterada", () => {
  const inv = () => invalidarPorPremissa(compararPremissas(premissas(), premissas({ canario_hash: "novo" })));

  it("sem mudança, segue", () => {
    expect(decidirComPremissaAlterada(null).acao).toBe("seguir");
  });

  it("com mudança e SEM escolha do autor, BLOQUEIA", () => {
    const d = decidirComPremissaAlterada(inv());
    expect(d.acao).toBe("bloquear");
    expect(d).toMatchObject({ invalidacao: { artefatos: expect.arrayContaining(["capitulos"]) } });
  });

  it("o autor pode escolher reconstruir", () => {
    expect(decidirComPremissaAlterada(inv(), "reconstruir").acao).toBe("reconstruir");
  });

  it("o autor pode escolher migrar", () => {
    expect(decidirComPremissaAlterada(inv(), "migrar").acao).toBe("migrar");
  });

  it("NÃO existe caminho em que a engine siga escrevendo sobre base alterada", () => {
    for (const escolha of [undefined, "cancelar"] as const) {
      expect(decidirComPremissaAlterada(inv(), escolha).acao).not.toBe("seguir");
    }
  });
});
