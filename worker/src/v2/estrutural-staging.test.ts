import { describe, expect, it } from "vitest";
import { DiscoPersistencia } from "./persistencia.js";
import { PersistenciaEstadoIsolado, fundirFichas } from "./estrutural-staging.js";
import type { EstadoCanonico, SceneSpec } from "./tipos.js";

function ficha(capitulo: number, pov = "Marina"): SceneSpec {
  return {
    schema: "scene-spec/v1",
    capitulo,
    pov,
    local: `local ${capitulo}`,
    tempo: `dia ${capitulo}`,
    objetivo: `objetivo ${capitulo}`,
    obstaculo: `obstáculo ${capitulo}`,
    acao_fisica: `ação ${capitulo}`,
    informacao_nova: `informação ${capitulo}`,
    virada: `virada ${capitulo}`,
    mudanca_estado: `mudança ${capitulo}`,
    gancho: { tipo: "ameaca", descricao: `gancho ${capitulo}` },
    fatos_obrigatorios: [`fato ${capitulo}`],
    conhecimentos_proibidos: [`segredo ${capitulo}`],
    fios_avancados: ["mistério"],
    fios_ausentes: ["romance", ...(capitulo === 1 ? ["família"] : [])],
    campos_skill: { Relogio: `T+${capitulo}` },
  };
}

describe("staging estrutural", () => {
  it("funde fichas preservando começo, virada/gancho final, fatos e interseção de fios ausentes", () => {
    const f = fundirFichas([ficha(1), ficha(2)], 1);
    expect(f).toMatchObject({
      capitulo: 1,
      pov: "Marina",
      local: "local 1 → local 2",
      virada: "virada 2",
      gancho: { descricao: "gancho 2" },
      fios_ausentes: ["romance"],
    });
    expect(f.fatos_obrigatorios).toEqual(["fato 1", "fato 2"]);
    expect(f.campos_skill?.Relogio).toBe("T+1 → T+2");
  });

  it("rejeita fusão que cruza POVs", () => {
    expect(() => fundirFichas([ficha(1, "Marina"), ficha(2, "Heitor")], 1)).toThrow(/POVs incompatíveis/);
  });

  it("isola o estado, mas delega o ledger de reviews", async () => {
    const principal = new DiscoPersistencia("nao-usado-no-teste");
    const estado: EstadoCanonico = {
      project_id: "p",
      engine_version: "2",
      versao: 3,
      doc: { schema: "engine-state/v1", fase: "revisao_final", capitulos: {}, bloqueios: [] },
    };
    const isolada = new PersistenciaEstadoIsolado(principal, estado);
    const copia = (await isolada.lerEstado("p"))!;
    copia.doc.fase = "avaliacao";
    await isolada.gravarEstado(copia);
    expect((await isolada.lerEstado("p"))?.doc.fase).toBe("avaliacao");
    expect(estado.doc.fase).toBe("revisao_final");
    expect(estado.versao).toBe(3);
  });
});
