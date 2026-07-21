// F2 — contratos de skill como dados: carga, validação, hash e IDENTIDADE
// preservada (anti-CR4: a régua que salva o dan-brown mata o hoover).
import { describe, expect, it } from "vitest";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  ErroContrato,
  MAPA_SKILL_V1_V2,
  carregarContrato,
  hashContrato,
  skillsDisponiveis,
  validarContrato,
  verificarGhostwritingRegras,
} from "./contrato.js";
import type { SkillContract } from "./tipos.js";

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const BASE_EXPLICITA = path.resolve(AQUI, "..", "..", "skills-v2");
const IDS = ["dan-brown", "hoover-mcfadden", "romantasy"] as const;

function clonar(c: SkillContract): SkillContract {
  return JSON.parse(JSON.stringify(c)) as SkillContract;
}

describe("carga e validação dos 3 contratos", () => {
  it.each(IDS)("%s carrega (baseDir default), valida e o id bate com o diretório", (id) => {
    const { contrato, hash, origem } = carregarContrato(id);
    expect(contrato.schema).toBe("skill-contract/v1");
    expect(contrato.id).toBe(id);
    expect(origem).toContain(path.join("skills-v2", id));
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    const val = validarContrato(contrato);
    expect(val.ok).toBe(true);
  });

  it.each(IDS)("%s carrega igual com baseDir explícito (contexto tsx e vitest)", (id) => {
    const padrao = carregarContrato(id);
    const explicito = carregarContrato(id, BASE_EXPLICITA);
    expect(explicito.hash).toBe(padrao.hash);
    expect(explicito.contrato).toEqual(padrao.contrato);
  });

  it("hash é estável entre execuções e não depende da ordem das chaves", () => {
    for (const id of IDS) {
      const a = carregarContrato(id);
      const b = carregarContrato(id);
      expect(a.hash).toBe(b.hash);
      expect(hashContrato(a.contrato)).toBe(a.hash);
      // reordena chaves (clone via JSON preserva; monta objeto com ordem invertida)
      const invertido = Object.fromEntries(Object.entries(a.contrato).reverse()) as unknown as SkillContract;
      expect(hashContrato(invertido)).toBe(a.hash);
    }
  });

  it("hash muda quando o conteúdo muda", () => {
    const { contrato, hash } = carregarContrato("dan-brown");
    const mudado = clonar(contrato);
    mudado.versao = "1.0.1";
    expect(hashContrato(mudado)).not.toBe(hash);
  });

  it("skill desconhecida falha com mensagem clara listando as disponíveis", () => {
    expect(skillsDisponiveis()).toEqual(["dan-brown", "hoover-mcfadden", "romantasy"]);
    try {
      carregarContrato("skill-inexistente");
      expect.unreachable("deveria ter lançado");
    } catch (e) {
      expect(e).toBeInstanceOf(ErroContrato);
      const erro = e as ErroContrato;
      expect(erro.codigo).toBe("CONTRATO_AUSENTE");
      expect(erro.message).toContain("skill-inexistente");
      expect(erro.message).toContain("dan-brown");
      expect(erro.message).toContain("hoover-mcfadden");
      expect(erro.message).toContain("romantasy");
    }
  });
});

describe("validarContrato — rejeições nomeando o campo", () => {
  const base = () => clonar(carregarContrato("dan-brown").contrato);

  it("campo obrigatório ausente é nomeado no erro", () => {
    const c = base() as unknown as Record<string, unknown>;
    delete c.motor_narrativo;
    const val = validarContrato(c);
    expect(val.ok).toBe(false);
    if (!val.ok) expect(val.erros.join("\n")).toContain("motor_narrativo");
  });

  it("regra com id duplicado é rejeitada", () => {
    const c = base();
    c.regras.push({ ...c.regras[0] });
    const val = validarContrato(c);
    expect(val.ok).toBe(false);
    if (!val.ok) expect(val.erros.join("\n")).toMatch(/duplicado/);
  });

  it("regra tipo cota sem cota é rejeitada", () => {
    const c = base();
    delete c.regras.find((r) => r.tipo === "cota")!.cota;
    const val = validarContrato(c);
    expect(val.ok).toBe(false);
    if (!val.ok) expect(val.erros.join("\n")).toMatch(/cota: obrigatória quando tipo="cota"/);
  });

  it("exceção referenciando regra inexistente é rejeitada", () => {
    const c = base();
    c.excecoes.push({ tipo_cena: "climax", regras_suspensas: ["nao-existe"], justificativa: "teste" });
    const val = validarContrato(c);
    expect(val.ok).toBe(false);
    if (!val.ok) expect(val.erros.join("\n")).toContain('"nao-existe" não existe em regras');
  });

  it("faixa_palavras incoerente (min > max) é rejeitada", () => {
    const c = base();
    c.faixa_palavras = { min: 3000, alvo: 2000, max: 1500 };
    const val = validarContrato(c);
    expect(val.ok).toBe(false);
    if (!val.ok) expect(val.erros.join("\n")).toContain("faixa_palavras");
  });

  it("tipos_gancho vazio é rejeitado", () => {
    const c = base();
    c.tipos_gancho = [];
    const val = validarContrato(c);
    expect(val.ok).toBe(false);
    if (!val.ok) expect(val.erros.join("\n")).toContain("tipos_gancho");
  });

  it("pov.rotacao incoerente (fios_min > fios_max) é rejeitada", () => {
    const c = base();
    c.pov.rotacao = { fios_min: 4, fios_max: 2, max_caps_mesmo_fio: 3 };
    const val = validarContrato(c);
    expect(val.ok).toBe(false);
    if (!val.ok) expect(val.erros.join("\n")).toContain("pov.rotacao");
  });
});

describe("IDENTIDADE PRESERVADA (anti-CR4) — as skills NÃO são normalizadas entre si", () => {
  const db = carregarContrato("dan-brown").contrato;
  const hoover = carregarContrato("hoover-mcfadden").contrato;
  const roman = carregarContrato("romantasy").contrato;

  const cotaDe = (c: SkillContract, re: RegExp) =>
    c.regras.find((r) => r.tipo === "cota" && (re.test(r.id) || re.test(r.texto)));

  it("dan-brown tem cotas anti-tique E piso de declarativas", () => {
    expect(cotaDe(db, /gnomico|gnômico/i)?.cota).toMatchObject({ max: 2, por: "capitulo" });
    expect(cotaDe(db, /personificacao|personificação/i)?.cota).toMatchObject({ max: 2, por: "capitulo" });
    expect(cotaDe(db, /sanfona/i)?.cota).toMatchObject({ max: 1, por: "capitulo" });
    expect(cotaDe(db, /declarativ/i)?.cota).toMatchObject({ min: 50, por: "capitulo" });
  });

  it("hoover tem SÓ o anti-tique universal — SEM piso de declarativas nem teto de interioridade (lição CR4)", () => {
    // anti-tique universal presente
    expect(cotaDe(hoover, /gnomico|gnômico/i)?.cota).toMatchObject({ max: 2, por: "capitulo" });
    expect(cotaDe(hoover, /personificacao|personificação/i)?.cota).toMatchObject({ max: 2, por: "capitulo" });
    expect(cotaDe(hoover, /sanfona/i)?.cota).toMatchObject({ max: 1, por: "capitulo" });
    // NENHUMA cota de piso de declarativas
    expect(cotaDe(hoover, /declarativ/i)).toBeUndefined();
    // NENHUMA cota cujo ALVO seja interioridade nem metáfora (são FEATURE aqui;
    // menção protetiva "não confunda com interioridade" em regra anti-tique não conta)
    expect(hoover.regras.some((r) => r.tipo === "cota" && /interioridade|metafora|metáfora/i.test(r.id))).toBe(false);
    expect(
      hoover.regras.some(
        (r) => r.tipo === "cota" && /interioridade/i.test(r.texto) && !/não confunda/i.test(r.texto)
      )
    ).toBe(false);
    expect(hoover.politica_metafora.cota_por_capitulo).toBeUndefined();
    // a proteção é explícita como alvo positivo
    const protecao = hoover.regras.find((r) => r.id === "interioridade-e-feature");
    expect(protecao?.tipo).toBe("alvo_positivo");
    expect(protecao?.texto).toMatch(/sangra na página/);
    expect(hoover.testes_positivos.join("\n")).toMatch(/sangra na página/);
    // a lição CR4 está registrada na descrição
    expect(hoover.acao_interioridade.descricao).toMatch(/CR4/);
  });

  it("relação ação↔interioridade é OPOSTA: hoover interioridade_dominante, dan-brown acao_dominante", () => {
    expect(hoover.acao_interioridade.relacao).toBe("interioridade_dominante");
    expect(db.acao_interioridade.relacao).toBe("acao_dominante");
  });

  it("POV preserva a identidade: hoover 1ª pessoa SEM rotação; dan-brown 3ª múltipla com 2–4 fios", () => {
    expect(hoover.pov.pessoa).toBe("primeira");
    expect(hoover.pov.rotacao).toBeUndefined();
    expect(db.pov.pessoa).toBe("terceira_multipla");
    expect(db.pov.rotacao).toMatchObject({ fios_min: 2, fios_max: 4, max_caps_mesmo_fio: 3 });
  });

  it("romantasy tem rotação de POV 2/2 e campos de spec de custo de magia e slow burn", () => {
    expect(roman.pov.rotacao).toMatchObject({ fios_min: 2, fios_max: 2, max_caps_mesmo_fio: 2 });
    expect(roman.estruturas_exigidas?.campos_spec).toContain("Custo de magia");
    expect(roman.estruturas_exigidas?.campos_spec).toContain("Degrau slow burn");
    expect(roman.regras.some((r) => /custo/i.test(r.id) && /escala/i.test(r.texto))).toBe(true);
  });

  it("as cadências das três NÃO são idênticas (régua de ritmo é per-skill)", () => {
    const cad = (c: SkillContract) => JSON.stringify(c.ritmo.cadencia);
    expect(cad(db)).not.toBe(cad(hoover));
    expect(cad(db)).not.toBe(cad(roman));
    expect(cad(hoover)).not.toBe(cad(roman));
    // e a diferença é a documentada: hoover tem folga de fragmento (voz), dan-brown não
    expect(hoover.ritmo.cadencia?.fragEnfase).toBeGreaterThan(db.ritmo.cadencia?.fragEnfase ?? 0);
    expect(roman.ritmo.cadencia?.fragEnfase).toBeGreaterThan(db.ritmo.cadencia?.fragEnfase ?? 0);
    expect(hoover.ritmo.cadencia?.staccatoFrac).toBeGreaterThan(db.ritmo.cadencia?.staccatoFrac ?? 0);
  });

  it("estruturas exigidas seguem o eixo de cada skill (dossiê vs relógios/narradora)", () => {
    expect(db.estruturas_exigidas?.docs).toContain("dossie-factual.md");
    expect(hoover.estruturas_exigidas?.docs).toEqual(["matriz-de-relogios.md", "regras-da-narradora.md"]);
    expect(hoover.estruturas_exigidas?.campos_spec).toEqual(
      expect.arrayContaining(["Relógios", "Pistas", "Narradora"])
    );
  });

  it("tipos_gancho têm vocabulário próprio por skill", () => {
    expect(hoover.tipos_gancho).toEqual(expect.arrayContaining(["revelacao_narradora", "virada_percepcao", "ameaca_intima"]));
    expect(roman.tipos_gancho).toEqual(expect.arrayContaining(["decisao_impossivel", "desejo_revelado", "confissao"]));
    expect(db.tipos_gancho).toEqual(expect.arrayContaining(["revelacao_parcial", "relogio_apertando"]));
    expect(new Set(db.tipos_gancho)).not.toEqual(new Set(hoover.tipos_gancho));
  });
});

describe("MAPA_SKILL_V1_V2", () => {
  it("cobre as três skills V1 e todo alvo carrega", () => {
    expect(Object.keys(MAPA_SKILL_V1_V2).sort()).toEqual(["hoover-mcfadden", "skill-dan-brown", "skill-romantasy"]);
    for (const [v1, v2] of Object.entries(MAPA_SKILL_V1_V2)) {
      const { contrato } = carregarContrato(v2);
      expect(contrato.id, `V1 "${v1}" → V2 "${v2}"`).toBe(v2);
    }
  });
});

describe("verificarGhostwritingRegras", () => {
  it("nenhum dos 3 contratos carrega prosa-modelo nas regras (e modelos_positivos são vazios até o autor validar)", () => {
    for (const id of IDS) {
      const { contrato } = carregarContrato(id);
      expect(verificarGhostwritingRegras(contrato), id).toEqual([]);
      expect(contrato.modelos_positivos, id).toEqual([]);
    }
  });

  it("regra longa com travessão de diálogo é sinalizada como suspeita", () => {
    const c = clonar(carregarContrato("dan-brown").contrato);
    c.regras.push({
      id: "regra-contaminada",
      texto:
        "O corredor estava escuro quando ela chegou perto da porta pesada e sentiu o frio subir pelos dedos, " +
        "um a um, como se a casa inteira soubesse do segredo que ela carregava desde a noite anterior. " +
        "— Ela disse que voltaria antes do amanhecer, e ninguém acreditou naquela promessa repetida tantas vezes.",
      tipo: "alvo_positivo",
      papeis: ["escritor"],
    });
    const suspeitas = verificarGhostwritingRegras(c);
    expect(suspeitas).toHaveLength(1);
    expect(suspeitas[0]).toContain("regra-contaminada");
  });
});
