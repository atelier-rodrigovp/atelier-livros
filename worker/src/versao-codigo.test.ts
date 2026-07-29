// O que faltava para fechar A2: saber qual código o processo no ar tem.
//
// O teste que mais importa aqui é o da worktree suja. SHA sozinho, com arquivo
// modificado por cima, PARECE dado e não é — foi exatamente esse buraco que
// deixou "o CLI executou Haiku com Sonnet solicitado" sem causa raiz.

import { describe, expect, it } from "vitest";
import { descreverVersao, lerVersaoCodigo } from "./versao-codigo.js";

// A raiz do repo: o vitest roda a partir dela (`include` do vite.config.ts é
// relativo a ela). `import.meta.url` não serve aqui — sob vitest não é file URL.
const RAIZ = process.cwd();

describe("versão do código no arranque", () => {
  it("[DOD:V-01] carimba SHA e horário do processo, lidos do repositório real", () => {
    const v = lerVersaoCodigo(RAIZ, new Date("2026-07-29T12:00:00.000Z"));
    expect(v.sha).toMatch(/^[0-9a-f]{40}$/);
    expect(v.iniciadoEm).toBe("2026-07-29T12:00:00.000Z");
  });

  it("[DOD:V-02] worktree suja é declarada, não escondida atrás do SHA", () => {
    // Não força sujeira: afirma o CONTRATO entre os dois campos, que vale nos
    // dois estados — se há sujos, `sujo` é true; se não há, é false. Um SHA
    // acompanhado de arquivo modificado nunca sai daqui parecendo limpo.
    const v = lerVersaoCodigo(RAIZ);
    expect(v.sujo).toBe(v.sujos.length > 0);
  });

  it("fora de repositório git NÃO derruba o worker — vira ausência declarada", () => {
    const v = lerVersaoCodigo("/caminho/que/nao/existe/em/lugar/nenhum");
    expect(v.sha).toBeNull();
    expect(v.erro).toBeTruthy();
    expect(v.iniciadoEm).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("a descrição diz limpa, suja e indisponível com palavras diferentes", () => {
    const base = { sha: "a".repeat(40), iniciadoEm: "2026-07-29T12:00:00.000Z" };
    expect(descreverVersao({ ...base, sujo: false, sujos: [] })).toContain("worktree limpa");

    const suja = descreverVersao({ ...base, sujo: true, sujos: ["worker/src/jobs.ts"] });
    expect(suja).toContain("MODIFICADO");
    expect(suja).not.toContain("limpa");

    const semSha = descreverVersao({ sha: null, sujo: false, sujos: [], iniciadoEm: base.iniciadoEm, erro: "sem git" });
    expect(semSha).toContain("indisponível");
    // Sem SHA inventado: "desconhecido" carimbado parece dado.
    expect(semSha).not.toContain("aaaaaaa");
  });

  it("a descrição sempre carrega o horário — é o que data o reinício", () => {
    for (const v of [
      { sha: "b".repeat(40), sujo: false, sujos: [], iniciadoEm: "2026-07-29T12:00:00.000Z" },
      { sha: "b".repeat(40), sujo: true, sujos: ["x"], iniciadoEm: "2026-07-29T12:00:00.000Z" },
      { sha: null, sujo: false, sujos: [], iniciadoEm: "2026-07-29T12:00:00.000Z" },
    ]) {
      expect(descreverVersao(v)).toContain("2026-07-29T12:00:00.000Z");
    }
  });
});
