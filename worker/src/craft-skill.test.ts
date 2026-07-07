import { describe, it, expect } from "vitest";
import {
  garantirCraftNoPerfil, blocoOrcamentoPagina,
  MARCADOR_CRAFT, MARCADOR_CRAFT_V2, MARCADOR_CRAFT_FIM,
  registroVozDaSkill, montarGateConsistenciaVoz, vozConsistenciaRegistrada,
  sinalConsistenciaVoz, MARCADOR_VOZ_CONSISTENCIA, REGISTRO_VOZ_POR_SKILL,
} from "./craft-skill.js";

const contar = (s: string, sub: string) => s.split(sub).length - 1;
const PERFIL = "# Perfil\n\n## 1. Assinatura\n- frase curta.\n";

describe("garantirCraftNoPerfil", () => {
  it("injeta o bloco da dan-brown (motor + 5 regras + ORÇAMENTO) quando falta", () => {
    const r = garantirCraftNoPerfil(PERFIL, "skill-dan-brown");
    expect(r.mudou).toBe(true);
    expect(r.texto).toContain(MARCADOR_CRAFT_V2);
    expect(r.texto).toMatch(/Montagem paralela/);
    expect(r.texto).toMatch(/Fair-play honesto/);
    expect(r.texto).toMatch(/Sem coincidência/);
    expect(r.texto).toMatch(/corte no PICO/);
    // SPEC-06: os números do gate chegam à caneta
    expect(r.texto).toMatch(/ORÇAMENTO DE PÁGINA/);
    expect(r.texto).toMatch(/"coisa"\/"coisas" ≤1/);
    expect(r.texto).toMatch(/símile-andaime/);
    // SPEC-09: sem banda de palavras conflitante com a Estrutura
    expect(r.texto).not.toMatch(/1\.300–2\.200/);
  });

  it("é AGNÓSTICO: jk-rowling injeta bloco DIFERENTE (imersão, não montagem)", () => {
    const r = garantirCraftNoPerfil(PERFIL, "skill-jk-rowling");
    expect(r.mudou).toBe(true);
    expect(r.texto).toMatch(/prosa imersiva|imersão calorosa/i);
    expect(r.texto).not.toMatch(/Montagem paralela/); // craft do Brown não vaza
  });

  it("orçamento usa os NÚMEROS DA SKILL (hoover ganha a folga da cadência rápida)", () => {
    const brown = blocoOrcamentoPagina("skill-dan-brown");
    const hoover = blocoOrcamentoPagina("hoover-mcfadden");
    expect(brown).toMatch(/fragmentos de ênfase ≤2 \(nunca dois colados\)/);
    expect(brown).toMatch(/até ~35% da narração/);
    expect(hoover).toMatch(/fragmentos de ênfase ≤20/);
    expect(hoover).toMatch(/até ~55% da narração/);
  });

  it("idempotente: 2ª passada não duplica (marcador 1×)", () => {
    const um = garantirCraftNoPerfil(PERFIL, "skill-dan-brown").texto;
    const dois = garantirCraftNoPerfil(um, "skill-dan-brown");
    expect(dois.mudou).toBe(false);
    expect(contar(dois.texto, MARCADOR_CRAFT_V2)).toBe(1);
  });

  it("UPGRADE v1→v2: bloco legado ganha o orçamento in-place, sem duplicar", () => {
    // simula perfil injetado antes da SPEC-06 (marcador v1, sem orçamento)
    const v1 =
      PERFIL + `\n${MARCADOR_CRAFT}\n\n## CRAFT DA SKILL \`skill-dan-brown\`\n\n` +
      `### Motor\n- Capítulo curto.\n\n${MARCADOR_CRAFT_FIM}\n`;
    const r = garantirCraftNoPerfil(v1, "skill-dan-brown");
    expect(r.mudou).toBe(true);
    expect(r.texto).toContain(MARCADOR_CRAFT_V2);
    expect(r.texto).not.toContain(`${MARCADOR_CRAFT}\n`); // v1 promovido
    expect(r.texto).toMatch(/ORÇAMENTO DE PÁGINA/);
    expect(contar(r.texto, "## CRAFT DA SKILL")).toBe(1); // sem bloco duplicado
    expect(garantirCraftNoPerfil(r.texto, "skill-dan-brown").mudou).toBe(false); // idempotente
  });

  it("skill desconhecida / nula → no-op (não inventa craft)", () => {
    expect(garantirCraftNoPerfil(PERFIL, "nenhuma").mudou).toBe(false);
    expect(garantirCraftNoPerfil(PERFIL, null).mudou).toBe(false);
    expect(garantirCraftNoPerfil(PERFIL, undefined).mudou).toBe(false);
  });
});

// FASE 1 — Gate de consistência de voz. GENÉRICO: o mesmo código serve QUALQUER skill.
// Nenhum teste (nem o código) trata uma skill como caso especial.
describe("FASE 1 — consistência de voz é GENÉRICA (≥2 skills, mesmo código)", () => {
  const SKILLS = ["skill-dan-brown", "hoover-mcfadden", "skill-romantasy", "skill-jk-rowling"];

  it("cada skill declara SEU registro de voz, distinto — mesma função, saídas diferentes", () => {
    const regs = SKILLS.map((s) => registroVozDaSkill(s));
    for (const r of regs) expect(r).toBeTruthy();
    // distintos entre si (o mecanismo não colapsa todas numa voz genérica)
    expect(new Set(regs).size).toBe(SKILLS.length);
    // e cada um carrega o DNA da própria skill
    expect(registroVozDaSkill("skill-dan-brown")).toMatch(/enigma|propulsiv|montagem/i);
    expect(registroVozDaSkill("hoover-mcfadden")).toMatch(/1ª pessoa PRESENTE|intimista|não-confiável/i);
  });

  it("skill fora do mapa (ou nula) = no-op (sem registro, sem gate)", () => {
    expect(registroVozDaSkill("skill-inexistente")).toBeNull();
    expect(registroVozDaSkill(null)).toBeNull();
    expect(montarGateConsistenciaVoz("skill-inexistente")).toBeNull();
    expect(sinalConsistenciaVoz("", "skill-inexistente").precisaRegistrar).toBe(false);
  });

  it("a PERGUNTA de comparação é o MESMO template p/ toda skill — só o registro injetado muda", () => {
    const dan = montarGateConsistenciaVoz("skill-dan-brown", "prosa lírica, contemplativa, fria")!;
    const hoo = montarGateConsistenciaVoz("hoover-mcfadden", "3ª pessoa distante, documental")!;
    // mesmo esqueleto de pergunta (prova de que não há ramo por skill)
    for (const g of [dan, hoo]) {
      expect(g.pergunta).toContain("declara este registro de voz");
      expect(g.pergunta).toMatch(/ALINHADOS, ou você está escolhendo DIVERGIR/);
      expect(g.marcador).toBe(MARCADOR_VOZ_CONSISTENCIA);
    }
    // só o registro da skill difere
    expect(dan.registroSkill).not.toBe(hoo.registroSkill);
    expect(dan.pergunta).toContain("skill-dan-brown");
    expect(hoo.pergunta).toContain("hoover-mcfadden");
  });
});

describe("FASE 1 — (a) alinhado / (b) divergência: veredito registrado vs faltando (2 skills)", () => {
  for (const skill of ["skill-dan-brown", "hoover-mcfadden"]) {
    it(`${skill}: (a) perfil consistente → registra "alinhado", sinal não dispara`, () => {
      const biblia = `# Bíblia\n## Diagnóstico de Fundação\n${MARCADOR_VOZ_CONSISTENCIA} alinhado — o perfil segue o registro da skill.\n`;
      expect(vozConsistenciaRegistrada(biblia)).toBe(true);
      expect(sinalConsistenciaVoz(biblia, skill).precisaRegistrar).toBe(false);
    });

    it(`${skill}: (b) divergência consciente registrada → também conta como decidido`, () => {
      const biblia = `# Bíblia\n${MARCADOR_VOZ_CONSISTENCIA} divergência consciente: quero o motor da skill com pele própria.\n`;
      expect(vozConsistenciaRegistrada(biblia)).toBe(true);
      expect(sinalConsistenciaVoz(biblia, skill).precisaRegistrar).toBe(false);
    });

    it(`${skill}: veredito AUSENTE → sinal força a decisão (a "pergunta" da entrevista)`, () => {
      const s = sinalConsistenciaVoz("# Bíblia sem veredito de voz\n", skill);
      expect(s.precisaRegistrar).toBe(true);
      expect(s.aviso).toContain(skill);
      expect(s.aviso).toContain(MARCADOR_VOZ_CONSISTENCIA);
    });
  }
});

// Anti-hardcode: nenhuma skill recebe tratamento especial no MECANISMO (só dado no mapa).
describe("FASE 1 — sem hardcode: dan-brown não é caso especial", () => {
  it("toda skill do mapa passa pelo MESMO caminho de código", () => {
    for (const skill of Object.keys(REGISTRO_VOZ_POR_SKILL)) {
      const g = montarGateConsistenciaVoz(skill, "perfil qualquer");
      expect(g).not.toBeNull();
      expect(g!.pergunta).toContain(skill);         // o skill entra só como dado
      expect(sinalConsistenciaVoz("", skill).precisaRegistrar).toBe(true); // sem veredito → sinaliza, p/ TODA skill
    }
  });
});
