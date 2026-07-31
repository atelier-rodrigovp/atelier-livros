import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { BriefingFundacao } from "./briefing.js";
import {
  gerarFundacaoV2,
  type DepsFundacao,
  type FundacaoV2,
} from "./fundacao.js";
import { Gravador } from "./gravador.js";
import { DiscoPersistencia } from "./persistencia.js";
import { ProvedorMock } from "./provedor.js";
import type { ContratoCompilado, SkillContract } from "./tipos.js";

const contratoBase: SkillContract = {
  schema: "skill-contract/v1",
  id: "retomada-teste",
  versao: "1.0.0",
  nome: "Retomada de teste",
  familia_editorial: "thriller",
  motor_narrativo: "pergunta → revelação",
  unidade_dramatica: "cena",
  pov: { pessoa: "terceira_proxima" },
  temporalidade: "linear",
  faixa_palavras: { alvo: 1200 },
  ritmo: { descricao: "progressivo" },
  acao_interioridade: { relacao: "equilibrio", descricao: "equilíbrio" },
  politica_exposicao: "dramatizada",
  politica_dialogo: { descricao: "funcional" },
  politica_metafora: { descricao: "rara" },
  tipos_gancho: ["ameaca"],
  regras: [],
  testes_positivos: [],
  sinais_negativos: [],
  excecoes: [],
  referencias: [],
  modelos_positivos: [],
};

const contrato: ContratoCompilado = {
  contrato: contratoBase,
  hash: "c".repeat(64),
  origem: "teste/fundacao-retomada",
};

const macro: FundacaoV2 = {
  perfil_voz: "Voz seca, concreta, próxima da percepção e sem ornamento gratuito. ".repeat(3),
  biblia:
    "Marina Alencar guarda o farol de Ponta Rasa e teme reabrir o arquivo de 1987. " +
    "Helena Duarte controla o inventário municipal e tenta impedir a investigação. " +
    "A descoberta do livro de bordo altera a relação entre as duas e conduz à exposição pública. ".repeat(2),
  mapa_personagens: [
    {
      nome: "Marina Alencar",
      papel: "protagonista",
      ferida: "perdeu o irmão",
      segredo: "omitiu uma página",
      desejo: "descobrir a verdade",
      voz: "direta e cautelosa",
      arco: "de guardiã evasiva a denunciante pública",
    },
    {
      nome: "Helena Duarte",
      papel: "antagonista",
      ferida: "teme perder o legado",
      segredo: "adulterou o inventário",
      desejo: "preservar o controle",
      voz: "formal e cortante",
      arco: "de autoridade incontestada a responsável exposta",
    },
  ],
  estrutura: [],
  fios: ["investigacao"],
  promessa_editorial: "um enigma marítimo curto com revelação verificável e pagamento integral",
};

const microValida: FundacaoV2["estrutura"] = [
  {
    capitulo: 1,
    fio: "investigacao",
    resumo_estrutural: "Marina encontra a página retirada do livro de bordo e decide confrontar o inventário",
  },
  {
    capitulo: 2,
    fio: "investigacao",
    resumo_estrutural: "Marina demonstra a adulteração, expõe Helena e publica a origem do arquivo",
  },
];

const microInvalida: FundacaoV2["estrutura"] = [microValida[0]];

const briefing: BriefingFundacao = {
  titulo: "Retomada no farol",
  premissa: "uma faroleira encontra a página que prova a adulteração de um arquivo histórico",
  totalCapitulos: 2,
  idioma: "pt-BR",
  detalhes: "- Tom: seco\n- Final: fechado",
};

let dir: string;
let persistencia: DiscoPersistencia;
let gravador: Gravador;

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), "fundacao-retomada-"));
  persistencia = new DiscoPersistencia(dir);
  gravador = new Gravador({ persistencia, projectId: "projeto-retomada" });
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

function deps(provedor: ProvedorMock, contratoAtual = contrato): DepsFundacao {
  return {
    gravador,
    persistencia,
    provedor,
    mapa: { raciocinio: "modelo-r", fatos: "modelo-f", prosa: "modelo-p", julgamento: "modelo-j" },
    contrato: contratoAtual,
    dirProjeto: dir,
    jobId: "job-retomada",
  };
}

function enfileirarMicro(provedor: ProvedorMock, estrutura: FundacaoV2["estrutura"], vezes = 1): void {
  for (let i = 0; i < vezes; i++) {
    provedor.enfileirar("arquiteto_enredo", JSON.stringify({ estrutura }));
  }
}

describe("retomada e auditoria da fundação em duas passadas", () => {
  it("reutiliza macro aprovada entre jobs, invalida por entrada e preserva candidatos reprovados", async () => {
    const primeira = new ProvedorMock();
    primeira.enfileirar("arquiteto_enredo", JSON.stringify(macro));
    enfileirarMicro(primeira, microInvalida, 3);

    await expect(gerarFundacaoV2(deps(primeira), briefing)).rejects.toMatchObject({
      name: "ErroEngine",
      codigo: "FUNDACAO_REPROVADA",
    });
    expect(primeira.chamadas).toHaveLength(4);

    const checkpoint = path.join(dir, "engine-v2", "fundacao-macro-checkpoint.json");
    const pastaTentativas = path.join(dir, "engine-v2", "fundacao-tentativas");
    expect(existsSync(checkpoint)).toBe(true);
    const reprovadas = readdirSync(pastaTentativas).filter((nome) => nome.startsWith("micro-"));
    expect(reprovadas).toHaveLength(3);
    const auditoria = JSON.parse(readFileSync(path.join(pastaTentativas, reprovadas[0]), "utf8"));
    expect(auditoria).toMatchObject({
      schema: "engine-v2/fundacao-tentativa/v1",
      passada: "micro",
      resultado: "reprovada",
      valor: microInvalida,
    });
    expect(auditoria.bloqueios.some((b: { codigo: string }) => b.codigo === "ESTRUTURA_CAPITULOS_INCOERENTES")).toBe(true);

    // Mesmo briefing + mesmo contrato: só a micro chama o modelo.
    const segunda = new ProvedorMock();
    enfileirarMicro(segunda, microValida);
    const retomada = await gerarFundacaoV2(deps(segunda), briefing);
    expect(retomada.fundacao.estrutura).toEqual(microValida);
    expect(segunda.chamadas).toHaveLength(1);
    expect(retomada.portao.runIdMacro).toBeTruthy();
    expect(retomada.portao.retries).toBe(3);
    expect(retomada.portao.reprovacoes).toHaveLength(3);

    // Mudança autoral altera o hash: checkpoint antigo não pode vazar.
    const terceira = new ProvedorMock();
    terceira.enfileirar("arquiteto_enredo", JSON.stringify(macro));
    enfileirarMicro(terceira, microValida);
    const alterado = { ...briefing, premissa: `${briefing.premissa}; agora a prova vem do consulado` };
    await gerarFundacaoV2(deps(terceira), alterado);
    expect(terceira.chamadas).toHaveLength(2);
  });
});
