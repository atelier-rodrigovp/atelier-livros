import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { carregarContrato } from "./contrato.js";
import { Gravador } from "./gravador.js";
import { revisarCanarioVoz } from "./integracao.js";
import { DiscoPersistencia } from "./persistencia.js";
import { ProvedorMock } from "./provedor.js";
import { medirSinais } from "./sinais.js";

const TEXTO = [
  "A porta do arquivo fechou atrás de Lia. Ela precisava do registro antes que o guarda voltasse.",
  "Abriu a primeira gaveta. Nada. Na segunda, encontrou um envelope com o próprio nome.",
  "O trinco se moveu do lado de fora. Lia guardou o envelope sob a camisa e apagou a lanterna.",
].join("\n\n");

describe("revisarCanarioVoz", () => {
  const dirs: string[] = [];
  afterEach(() => {
    for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
  });

  it("usa revisor e ledger reais, mostra a régua ativa e não aplica a faixa de capítulo à amostra curta", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "engine-v2-canario-"));
    dirs.push(dir);
    const persistencia = new DiscoPersistencia(dir);
    const gravador = new Gravador({ persistencia, projectId: "proj-canario" });
    const provedor = new ProvedorMock();
    const contrato = carregarContrato("dan-brown");
    const sinais = medirSinais(TEXTO, contrato.contrato).filter((s) => s.sinal !== "palavras");
    const eixo = { nota: 4, evidencia: "A abertura fixa objetivo, obstáculo e ameaça em ações concretas." };
    provedor.enfileirar("revisor_literario", JSON.stringify({
      schema: "parecer/v1",
      dramatic_progression: eixo,
      skill_adherence: eixo,
      clarity: eixo,
      emotional_effect: eixo,
      continuity: eixo,
      hook_effectiveness: eixo,
      verdict: "aprovado",
      evidencias: [{
        local: "parágrafo 3",
        trecho: "O trinco se moveu do lado de fora.",
        observacao: "gancho físico e imediato",
      }],
      sinais: sinais.map((s) => ({
        sinal: s.sinal,
        valor: s.valor,
        disposicao: "falso_positivo",
        evidencia: "não configura defeito nesta amostra",
      })),
      correcoes: [],
    }));

    const resultado = await revisarCanarioVoz({
      gravador,
      provedor,
      mapa: { raciocinio: "r", fatos: "f", prosa: "p", julgamento: "j" },
      contrato,
      perfil: {
        texto: "Amostra pré-fundação.",
        skillId: contrato.contrato.id,
        hash: "perfil",
        validado: true,
      },
      texto: TEXTO,
    });

    expect(resultado.parecer.verdict).toBe("aprovado");
    expect(resultado.problemasProtocolo).toEqual([]);
    expect(provedor.chamadas).toHaveLength(1);
    expect(provedor.chamadas[0].prompt).toContain(`dan-brown@${contrato.contrato.versao}`);
    expect(provedor.chamadas[0].prompt).toContain("300–500 palavras");
    expect(provedor.chamadas[0].prompt).not.toMatch(/\n- palavras:/);
    expect((await persistencia.lerRuns())[0]).toMatchObject({
      papel: "revisor_literario",
      alvo: "canario-voz",
      status: "ok",
    });
  });
});
