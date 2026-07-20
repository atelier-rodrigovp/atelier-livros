import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { hashText } from "../quality-state.js";
import { Gravador } from "./gravador.js";
import { DiscoPersistencia } from "./persistencia.js";
import { ErroEngine, type Parecer, type Verdict } from "./tipos.js";

let dir: string;
let disco: DiscoPersistencia;
let gravador: Gravador;

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), "engine-v2-grav-"));
  disco = new DiscoPersistencia(dir);
  gravador = new Gravador({ persistencia: disco, projectId: "proj-1" });
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

function escreverCapitulo(nome: string, texto: string): string {
  const caminho = path.join(dir, nome);
  writeFileSync(caminho, texto, "utf8");
  return caminho;
}

function parecer(verdict: Verdict, comEvidencias = true): Parecer {
  const eixo = { nota: 4, evidencia: "trecho localizado" };
  return {
    schema: "parecer/v1",
    dramatic_progression: eixo,
    skill_adherence: eixo,
    clarity: eixo,
    emotional_effect: eixo,
    continuity: eixo,
    hook_effectiveness: eixo,
    verdict,
    evidencias: comEvidencias ? [{ local: "L:12", trecho: "ela abriu a porta", observacao: "evento concreto" }] : [],
    sinais: [],
    correcoes: [],
  };
}

async function esperarErroEngine(promessa: Promise<unknown>, codigo: string): Promise<ErroEngine> {
  try {
    await promessa;
  } catch (e) {
    expect(e).toBeInstanceOf(ErroEngine);
    expect((e as ErroEngine).codigo).toBe(codigo);
    return e as ErroEngine;
  }
  throw new Error(`esperava ErroEngine ${codigo}, mas a promessa resolveu`);
}

describe("Gravador — runs", () => {
  it("iniciar/concluir run persiste ciclo completo com evidências", async () => {
    const id = await gravador.iniciarRun({
      project_id: "proj-1",
      engine_version: "2.0.0",
      papel: "escritor",
      capacidade: "prosa",
      model_provider: "prov",
      model_name: "modelo-x",
      alvo: "capitulo:1",
      evidencias: [],
    });
    await gravador.concluirRun(id, { output_hash: "abc", tokens_out: 99, evidencias: [{ tipo: "hash", referencia: "capitulo-01.md", hash: "abc" }] });
    const runs = await disco.lerRuns();
    expect(runs[0]).toMatchObject({ id, status: "ok", output_hash: "abc", tokens_out: 99, attempt: 1 });
    expect(runs[0]!.finished_at).toBeTruthy();
  });

  it("falharRun grava erro estruturado serializável", async () => {
    const id = await gravador.iniciarRun({
      project_id: "proj-1",
      engine_version: "2.0.0",
      papel: "revisor_literario",
      capacidade: "julgamento",
      model_provider: "prov",
      model_name: "modelo-y",
      alvo: "capitulo:2",
      evidencias: [],
    });
    await gravador.falharRun(id, new ErroEngine({ codigo: "GATE_TRUNCAMENTO", classe: "qualidade", mensagem: "texto truncado" }));
    const runs = await disco.lerRuns();
    expect(runs[0]!.status).toBe("falha");
    expect(runs[0]!.erro).toMatchObject({ codigo: "GATE_TRUNCAMENTO", classe: "qualidade", mensagem: "texto truncado" });
  });
});

describe("Gravador — registrarCapituloEscrito", () => {
  it("verifica o arquivo real no disco e grava o hash correto", async () => {
    const texto = "Ela abriu a porta e o vento apagou a vela.";
    const caminho = escreverCapitulo("capitulo-01.md", texto);
    const cap = await gravador.registrarCapituloEscrito(1, caminho, { palavras: 9, spec_versao: 1, spec_hash: "s1" });
    expect(cap).toMatchObject({ status: "escrito", text_hash: hashText(texto), palavras: 9, spec_versao: 1 });

    const estado = await disco.lerEstado("proj-1");
    expect(estado?.doc.capitulos["1"]).toEqual(cap);
    expect(estado?.versao).toBe(1);
  });

  it("arquivo ausente lança GATE_ARTEFATO_AUSENTE (classe qualidade)", async () => {
    const erro = await esperarErroEngine(
      gravador.registrarCapituloEscrito(3, path.join(dir, "capitulo-03.md"), { palavras: 0 }),
      "GATE_ARTEFATO_AUSENTE"
    );
    expect(erro.classe).toBe("qualidade");
  });

  it("re-registrar o mesmo texto não duplica, não regride status e não incrementa versão", async () => {
    const texto = "Prosa estável.";
    const caminho = escreverCapitulo("capitulo-01.md", texto);
    await gravador.registrarCapituloEscrito(1, caminho, { palavras: 2 });
    await gravador.aprovarCapitulo(1, { id: "rev-1", text_hash: hashText(texto), verdict: "aprovado", parecer: parecer("aprovado") }, caminho);
    const antes = await disco.lerEstado("proj-1");

    const cap = await gravador.registrarCapituloEscrito(1, caminho, { palavras: 2 });
    expect(cap.status).toBe("aprovado"); // não regride
    const depois = await disco.lerEstado("proj-1");
    expect(depois?.versao).toBe(antes?.versao); // não gravou de novo

    // texto NOVO invalida: volta a "escrito" com hash novo
    const caminho2 = escreverCapitulo("capitulo-01.md", "Prosa reescrita.");
    const cap2 = await gravador.registrarCapituloEscrito(1, caminho2, { palavras: 2 });
    expect(cap2.status).toBe("escrito");
    expect(cap2.text_hash).toBe(hashText("Prosa reescrita."));
  });
});

describe("Gravador — aprovarCapitulo", () => {
  const texto = "Cena com virada real.";
  let caminho: string;
  beforeEach(async () => {
    caminho = escreverCapitulo("capitulo-01.md", texto);
    await gravador.registrarCapituloEscrito(1, caminho, { palavras: 4 });
  });

  it("rejeita parecer sem evidências", async () => {
    await esperarErroEngine(
      gravador.aprovarCapitulo(1, { id: "rev-1", text_hash: hashText(texto), verdict: "aprovado", parecer: parecer("aprovado", false) }, caminho),
      "GATE_APROVACAO_SEM_EVIDENCIA"
    );
  });

  it("rejeita verdict reprovado", async () => {
    await esperarErroEngine(
      gravador.aprovarCapitulo(1, { id: "rev-1", text_hash: hashText(texto), verdict: "reprovado", parecer: parecer("reprovado") }, caminho),
      "GATE_APROVACAO_SEM_EVIDENCIA"
    );
  });

  it("rejeita hash divergente do disco com GATE_ESTADO_INCONSISTENTE", async () => {
    await esperarErroEngine(
      gravador.aprovarCapitulo(1, { id: "rev-1", text_hash: hashText("outro texto"), verdict: "aprovado", parecer: parecer("aprovado") }, caminho),
      "GATE_ESTADO_INCONSISTENTE"
    );
  });

  it("caso feliz grava status, review_id e aprovacao hash-bound", async () => {
    await gravador.aprovarCapitulo(1, { id: "rev-9", text_hash: hashText(texto), verdict: "aprovado_com_excecao", parecer: parecer("aprovado_com_excecao") }, caminho);
    const estado = await disco.lerEstado("proj-1");
    expect(estado?.doc.capitulos["1"]).toMatchObject({
      status: "aprovado_com_excecao",
      review_id: "rev-9",
      aprovacao: { review_id: "rev-9", text_hash: hashText(texto) },
    });
  });
});

describe("Gravador — bloqueios e fase", () => {
  it("registrar/remover bloqueio de capítulo alterna status e restaura o anterior", async () => {
    const caminho = escreverCapitulo("capitulo-01.md", "Prosa.");
    await gravador.registrarCapituloEscrito(1, caminho, { palavras: 1 });
    await gravador.registrarBloqueio("GATE_TRUNCAMENTO", "capitulo:1", "texto termina no meio da frase");

    let estado = await disco.lerEstado("proj-1");
    expect(estado?.doc.capitulos["1"]?.status).toBe("bloqueado");
    expect(estado?.doc.bloqueios).toHaveLength(1);

    await gravador.removerBloqueio("GATE_TRUNCAMENTO", "capitulo:1");
    estado = await disco.lerEstado("proj-1");
    expect(estado?.doc.capitulos["1"]?.status).toBe("escrito"); // restaurado
    expect(estado?.doc.bloqueios).toHaveLength(0);
    expect(estado?.doc.capitulos["1"]?.bloqueio).toBeUndefined();
  });

  it("mudarFase aceita transição válida e é idempotente na mesma fase", async () => {
    await gravador.mudarFase("estrutura");
    await gravador.mudarFase("escrita");
    const antes = await disco.lerEstado("proj-1");
    await gravador.mudarFase("escrita"); // no-op
    const depois = await disco.lerEstado("proj-1");
    expect(depois?.doc.fase).toBe("escrita");
    expect(depois?.versao).toBe(antes?.versao);
    // regressão permitida: escrita ← revisao_final
    await gravador.mudarFase("revisao_final");
    await gravador.mudarFase("escrita");
  });

  it("mudarFase rejeita transição inválida com ESTADO_INCONSISTENTE", async () => {
    await esperarErroEngine(gravador.mudarFase("concluido"), "ESTADO_INCONSISTENTE"); // fundacao → concluido
    await gravador.mudarFase("estrutura");
    await esperarErroEngine(gravador.mudarFase("fundacao"), "ESTADO_INCONSISTENTE"); // regressão proibida
  });
});

describe("Gravador — concorrência (duas instâncias, mesma persistência)", () => {
  it("gravação stale faz retry com releitura e converge sem perder atualização", async () => {
    const g2 = new Gravador({ persistencia: disco, projectId: "proj-1" });
    // as duas carregam o estado ANTES de qualquer gravação (cópias versão 0)
    await gravador.carregarEstado();
    await g2.carregarEstado();

    const c1 = escreverCapitulo("capitulo-01.md", "Capítulo um.");
    const c2 = escreverCapitulo("capitulo-02.md", "Capítulo dois.");
    await gravador.registrarCapituloEscrito(1, c1, { palavras: 2 }); // versão 1
    await g2.registrarCapituloEscrito(2, c2, { palavras: 2 });       // stale → retry → versão 2

    const final = await new DiscoPersistencia(dir).lerEstado("proj-1");
    expect(final?.versao).toBe(2);
    expect(final?.doc.capitulos["1"]?.text_hash).toBe(hashText("Capítulo um."));
    expect(final?.doc.capitulos["2"]?.text_hash).toBe(hashText("Capítulo dois."));
  });
});
