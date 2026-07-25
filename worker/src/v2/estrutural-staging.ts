// Apoio à pré-validação de fusões sem tocar no estado canônico.

import type { PersistenciaV2 } from "./persistencia.js";
import type {
  EstadoCanonico,
  ReviewRegistro,
  RunRegistro,
  SceneSpec,
  SpecRegistro,
} from "./tipos.js";

function unicos(xs: string[]): string[] {
  return [...new Set(xs.filter((x) => x.trim()))];
}

/**
 * Funde fichas, nunca prosa. Uma fusão entre POVs diferentes é estruturalmente
 * insegura e precisa ser reformulada pelo editor, não improvisada pelo worker.
 */
export function fundirFichas(fichas: SceneSpec[], novoCapitulo: number): SceneSpec {
  if (fichas.length < 2) throw new Error("fusão de fichas exige ao menos duas fichas");
  const povs = unicos(fichas.map((f) => f.pov));
  if (povs.length !== 1) throw new Error(`fusão cruza POVs incompatíveis: ${povs.join(", ")}`);
  const primeira = fichas[0];
  const ultima = fichas[fichas.length - 1];
  const chavesCampos = unicos(fichas.flatMap((f) => Object.keys(f.campos_skill ?? {})));
  const campos_skill = Object.fromEntries(
    chavesCampos.map((chave) => [
      chave,
      unicos(fichas.map((f) => f.campos_skill?.[chave] ?? "")).join(" → "),
    ])
  );
  return {
    schema: "scene-spec/v1",
    capitulo: novoCapitulo,
    pov: primeira.pov,
    local: unicos(fichas.map((f) => f.local)).join(" → "),
    tempo: `${primeira.tempo} → ${ultima.tempo}`,
    objetivo: unicos(fichas.map((f) => f.objetivo)).join("; depois, "),
    obstaculo: unicos(fichas.map((f) => f.obstaculo)).join("; "),
    acao_fisica: unicos(fichas.map((f) => f.acao_fisica)).join("; "),
    informacao_nova: unicos(fichas.map((f) => f.informacao_nova)).join("; "),
    virada: ultima.virada,
    mudanca_estado: `${primeira.mudanca_estado} → ${ultima.mudanca_estado}`,
    gancho: structuredClone(ultima.gancho),
    fatos_obrigatorios: unicos(fichas.flatMap((f) => f.fatos_obrigatorios)),
    conhecimentos_proibidos: unicos(fichas.flatMap((f) => f.conhecimentos_proibidos)),
    fios_avancados: unicos(fichas.flatMap((f) => f.fios_avancados)),
    fios_ausentes: [
      ...fichas
        .map((f) => new Set(f.fios_ausentes))
        .reduce((intersecao, atual) => new Set([...intersecao].filter((x) => atual.has(x)))),
    ],
    ...(chavesCampos.length ? { campos_skill } : {}),
  };
}

/**
 * Ledger real, estado isolado. Runs/reviews continuam auditáveis na persistência
 * principal; gravarEstado afeta apenas a cópia em memória até a promoção.
 */
export class PersistenciaEstadoIsolado implements PersistenciaV2 {
  private estado: EstadoCanonico;

  constructor(
    private readonly principal: PersistenciaV2,
    estadoBase: EstadoCanonico
  ) {
    this.estado = structuredClone(estadoBase);
  }

  inserirRun(run: RunRegistro): Promise<string> {
    return this.principal.inserirRun(run);
  }
  atualizarRun(id: string, patch: Partial<RunRegistro>): Promise<void> {
    return this.principal.atualizarRun(id, patch);
  }
  inserirReview(review: ReviewRegistro): Promise<string> {
    return this.principal.inserirReview(review);
  }
  inserirSpec(spec: SpecRegistro): Promise<string> {
    return this.principal.inserirSpec(spec);
  }
  maiorVersaoSpec(projectId: string, capitulo: number): Promise<number> {
    return this.principal.maiorVersaoSpec(projectId, capitulo);
  }
  lerFichaMaisRecente(projectId: string, capitulo: number): Promise<SceneSpec | null> {
    return this.principal.lerFichaMaisRecente(projectId, capitulo);
  }
  async lerEstado(projectId: string): Promise<EstadoCanonico | null> {
    return this.estado.project_id === projectId ? structuredClone(this.estado) : null;
  }
  async gravarEstado(estado: EstadoCanonico): Promise<void> {
    if (estado.project_id !== this.estado.project_id || estado.versao !== this.estado.versao) {
      throw new Error(`estado isolado divergente: esperado ${this.estado.project_id}@${this.estado.versao}`);
    }
    const copia = structuredClone(estado);
    copia.versao++;
    copia.updated_at = new Date().toISOString();
    estado.versao = copia.versao;
    this.estado = copia;
  }
  disponivel(): Promise<boolean> {
    return Promise.resolve(true);
  }
}
