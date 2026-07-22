// Engine V2 — tipos do domínio (espinhaço de F1–F6).
// Regra: nenhum nome de skill ou de modelo hardcoded aqui ou em qualquer módulo v2/.

export const ENGINE_V2_VERSION = "2.0.0";

// ---------------------------------------------------------------------------
// Papéis e classes de capacidade (F3)
// ---------------------------------------------------------------------------

export type Papel =
  | "arquiteto_enredo"      // fundação, estrutura, revelações, promessa editorial
  | "arquiteto_cena"        // objetivo, obstáculo, evento, mudança, gancho (ficha)
  | "contextualizador"      // fatos, continuidade, seleção de contexto — proibido prosa
  | "escritor"              // ÚNICO autor de prosa
  | "revisor_literario"     // voz, transparência, emoção, propulsão, aderência
  | "auditor_factual"       // nomes, datas, geografia, continuidade, conhecimento
  | "editor_estrutural";    // cortes, fusões, ordem, macro-ritmo (propõe; worker aplica)
// O "gravador de estado" NÃO é um papel: é código determinístico (gravador.ts).

export type ClasseCapacidade = "raciocinio" | "fatos" | "prosa" | "julgamento";

/** Papel → classe. Modelo concreto vem da configuração (mapa classe→modelo), nunca do núcleo. */
export const CLASSE_POR_PAPEL: Record<Papel, ClasseCapacidade> = {
  arquiteto_enredo: "raciocinio",
  arquiteto_cena: "raciocinio",
  contextualizador: "fatos",
  escritor: "prosa",
  revisor_literario: "julgamento",
  auditor_factual: "fatos",
  editor_estrutural: "raciocinio",
};

export interface MapaModelos {
  raciocinio: string;
  fatos: string;
  prosa: string;
  julgamento: string;
}

// ---------------------------------------------------------------------------
// Contrato de skill (F2) — schema "skill-contract/v1"
// ---------------------------------------------------------------------------

export interface PoliticaEscala {
  /** alvo por capítulo; gate/sinal usa min/max quando presentes */
  alvo?: number;
  min?: number;
  max?: number;
}

export interface RegraDeclarada {
  id: string;                     // estável dentro do contrato
  texto: string;                  // formulação positiva ("faça X"), não só proibição
  tipo: "alvo_positivo" | "proibicao" | "cota";
  cota?: { max?: number; min?: number; por: "capitulo" | "cena" | "1000_palavras" };
  papeis: Papel[];                // quem precisa ver esta regra
}

export interface ExcecaoCena {
  tipo_cena: string;              // ex.: "revelacao_emocional", "climax"
  regras_suspensas: string[];     // ids de RegraDeclarada
  justificativa: string;
}

export interface ModeloPositivo {
  id: string;
  tecnica: string;                // o que o trecho demonstra (nunca "copie")
  texto: string;                  // curto (≤120 palavras), validado pelo autor
}

export interface SkillContract {
  schema: "skill-contract/v1";
  id: string;                     // ex.: "dan-brown" (id V2; mapeia de skill_escrita V1)
  versao: string;                 // semver do contrato; mudança de conteúdo exige bump
  nome: string;
  familia_editorial: string;      // ex.: "thriller_enigma", "suspense_intimista", "romantasy"
  motor_narrativo: string;        // ex.: "pergunta → obstáculo → revelação → corte"
  unidade_dramatica: string;      // ex.: "cena com virada", "beat emocional"
  pov: {
    pessoa: "primeira" | "terceira_proxima" | "terceira_multipla";
    rotacao?: { fios_min: number; fios_max: number; max_caps_mesmo_fio: number; max_caps_mesmo_fio_absoluto?: number; janela?: number; max_caps_fio_ausente?: number };
  };
  temporalidade: string;          // ex.: "relógio comprimido 72h", "linear com flashbacks marcados"
  faixa_palavras: PoliticaEscala; // por capítulo
  ritmo: {
    descricao: string;
    cadencia?: Record<string, number>; // cotas de cadência (fragEnfase, fragColados, staccato…)
  };
  acao_interioridade: {
    relacao: "acao_dominante" | "equilibrio" | "interioridade_dominante";
    descricao: string;            // ex.: hoover — interioridade é FEATURE (lição CR4)
  };
  politica_exposicao: string;
  politica_dialogo: { descricao: string; piso_percentual?: number };
  politica_metafora: { descricao: string; cota_por_capitulo?: number };
  tipos_gancho: string[];         // vocabulário de ganchos válidos p/ ficha e revisor
  regras: RegraDeclarada[];       // substituem TODO condicional por skill no núcleo
  testes_positivos: string[];     // o que PROVA identidade da skill (avaliação cega)
  sinais_negativos: string[];     // sinais editoriais a vigiar (nunca bloqueio direto)
  excecoes: ExcecaoCena[];
  estruturas_exigidas?: {         // docs de fundação que o arquiteto deve produzir
    docs: string[];               // ex.: ["dossie-factual.md", "matriz-de-relogios.md"]
    campos_spec: string[];        // campos extras obrigatórios na ficha de cena
  };
  referencias: string[];          // arquivos em referencias/ (relativos ao contrato)
  modelos_positivos: ModeloPositivo[];
}

export interface ContratoCompilado {
  contrato: SkillContract;
  hash: string;                   // sha256 do JSON canônico do contrato + referências
  origem: string;                 // caminho no repo
}

// ---------------------------------------------------------------------------
// Ficha de cena (F5) — schema "scene-spec/v1" (SEM prosa)
// ---------------------------------------------------------------------------

export interface SceneSpec {
  schema: "scene-spec/v1";
  capitulo: number;
  pov: string;                    // personagem/fio
  local: string;
  tempo: string;                  // ex.: "Dia 2, 14h30"
  objetivo: string;
  obstaculo: string;
  acao_fisica: string;            // ação principal concreta
  informacao_nova: string;
  virada: string;
  mudanca_estado: string;         // estado do personagem/trama antes → depois
  gancho: { tipo: string; descricao: string };  // tipo ∈ contrato.tipos_gancho
  fatos_obrigatorios: string[];
  conhecimentos_proibidos: string[];  // o que personagens/leitor NÃO podem saber ainda
  fios_avancados: string[];
  fios_ausentes: string[];        // deliberadamente fora deste capítulo
  campos_skill?: Record<string, string>; // campos extras exigidos pelo contrato (ex.: "Relógios")
  excecao_editorial?: { regra_id: string; justificativa: string };
}

// ---------------------------------------------------------------------------
// Parecer do revisor (F6) — persistido, hash-bound
// ---------------------------------------------------------------------------

export type Disposicao = "violacao_confirmada" | "excecao_valida" | "falso_positivo" | "necessita_decisao_humana";

export interface SinalDisposto {
  sinal: string;                  // ex.: "gnomico", "personificacao", "dialogo_baixo"
  valor: number | string;         // medição do detector
  disposicao: Disposicao;
  evidencia: string;              // trecho/linha localizados
  /** violacao_confirmada em sinal de contagem exige as ocorrências julgadas reais, citadas uma a uma */
  ocorrencias_citadas?: { trecho: string; posicao?: string }[];
  /** disposição parcial: nº de ocorrências medidas julgadas falso positivo (citadas + falsos = valor) */
  falsos_positivos?: number;
}

export interface EvidenciaLocalizada {
  local: string;                  // ex.: "L:142" ou "cap 3, cena 2"
  trecho: string;
  observacao: string;
}

export type Verdict = "aprovado" | "aprovado_com_excecao" | "reprovado" | "necessita_decisao_humana";

export interface Parecer {
  schema: "parecer/v1";
  dramatic_progression: { nota: number; evidencia: string };  // notas 0–5
  skill_adherence: { nota: number; evidencia: string };
  clarity: { nota: number; evidencia: string };
  emotional_effect: { nota: number; evidencia: string };
  continuity: { nota: number; evidencia: string };
  hook_effectiveness: { nota: number; evidencia: string };
  verdict: Verdict;
  evidencias: EvidenciaLocalizada[];   // aprovação exige ≥1 evidência POSITIVA
  sinais: SinalDisposto[];             // disposição de cada sinal editorial detectado
  correcoes: { local: string; problema: string; instrucao: string }[];
}

// ---------------------------------------------------------------------------
// Runs e estado canônico (F1)
// ---------------------------------------------------------------------------

export type RunStatus = "running" | "ok" | "falha" | "cancelado";

export interface RunRegistro {
  id?: string;
  project_id: string | null;
  edition_id?: string | null;
  job_id?: string | null;
  parent_run_id?: string | null;
  engine_version: string;
  skill_id?: string | null;
  skill_version?: string | null;
  foundation_version?: string | null;
  papel: Papel;
  capacidade: ClasseCapacidade;
  model_provider: string;
  model_name: string;
  alvo: string;
  input_bundle_hash?: string | null;
  output_hash?: string | null;
  status: RunStatus;
  attempt: number;
  started_at: string;
  finished_at?: string | null;
  tokens_in?: number | null;
  tokens_out?: number | null;
  evidencias: Evidencia[];
  erro?: ErroEstruturado | null;
  payload?: Record<string, unknown>;
}

export interface Evidencia {
  tipo: "arquivo" | "hash" | "review" | "gate" | "metrica" | "referencia";
  referencia: string;             // caminho, id ou nome do gate
  hash?: string;
  detalhe?: string;
}

export interface ErroEstruturado {
  codigo: string;                 // ex.: "GATE_TRUNCAMENTO", "SCHEMA_INVALIDO", "CONTRATO_AUSENTE"
  classe: "tecnica" | "quota" | "qualidade" | "configuracao" | "infra";
  mensagem: string;
  detalhe?: unknown;
}

/** Erro lançável que carrega o ErroEstruturado (gates e inconsistências da engine). */
export class ErroEngine extends Error implements ErroEstruturado {
  readonly codigo: string;
  readonly classe: ErroEstruturado["classe"];
  readonly detalhe?: unknown;
  constructor(erro: ErroEstruturado) {
    super(erro.mensagem);
    this.name = "ErroEngine";
    this.codigo = erro.codigo;
    this.classe = erro.classe;
    this.detalhe = erro.detalhe;
  }
  /** Forma serializável (para persistir em runs.erro). */
  get mensagem(): string {
    return this.message;
  }
  toJSON(): ErroEstruturado {
    return { codigo: this.codigo, classe: this.classe, mensagem: this.message, detalhe: this.detalhe };
  }
}

// ---------------------------------------------------------------------------
// Registros persistidos de review e spec (F1) — espelham engine_reviews/engine_scene_specs
// ---------------------------------------------------------------------------

export interface ReviewRegistro {
  id?: string;
  project_id: string;
  edition_id?: string | null;
  run_id?: string | null;
  capitulo?: number | null;       // null = parecer de livro/fundação
  text_hash: string;              // sha256 do texto exato avaliado
  verdict: Verdict;
  parecer: Parecer;
}

export interface SpecRegistro {
  id?: string;
  project_id: string;
  edition_id?: string | null;
  capitulo: number;
  versao: number;
  hash: string;                   // sha256 da ficha canônica
  status: "rascunho" | "validada" | "rejeitada" | "substituida";
  ficha: SceneSpec;
  origem_run_id?: string | null;
}

export type CapituloStatusV2 =
  | "planejado"        // ficha existe
  | "escrito"          // prosa no disco, hash registrado
  | "em_revisao"
  | "reprovado"
  | "aprovado"         // parecer + evidência + hash conferido
  | "aprovado_com_excecao"
  | "bloqueado"        // gate universal ou decisão humana pendente
  | "legado_sem_evidencia"; // migrado da V1 sem evidência de aprovação

export interface CapituloEstado {
  status: CapituloStatusV2;
  text_hash?: string;
  palavras?: number;
  spec_versao?: number;
  spec_hash?: string;
  review_id?: string;
  aprovacao?: { review_id: string; run_id?: string; text_hash: string; em: string };
  bloqueio?: { codigo: string; detalhe: string; desde: string };
}

export interface EstadoCanonicoDoc {
  schema: "engine-state/v1";
  // Ordem lógica: escrita → revisao_final → consolidacao → avaliacao → concluido.
  fase:
    | "fundacao"
    | "estrutura"
    | "escrita"
    | "revisao_final"
    | "consolidacao"
    | "avaliacao"
    | "concluido"
    | "bloqueado";
  skill?: { id: string; versao: string; hash: string };
  fundacao?: { versao: string; hash: string; docs: Record<string, string> }; // doc → sha256
  total_capitulos?: number;
  // Edição estrutural (editor_estrutural PROPÕE; o pipeline aplica os cortes/reordenações).
  edicao_estrutural?: { run_id?: string; propostas: number; aplicadas: number; detalhe: string[]; em: string };
  // Meta-nota (avaliação de livro): última nota alcançada e o alvo comercial.
  avaliacao?: { nota?: number; meta: number; iteracoes: number; relatorio_path?: string; em: string };
  capitulos: Record<string, CapituloEstado>;
  // status_anterior: guarda o status do capítulo antes do bloqueio, para restauração fiel
  bloqueios: { codigo: string; alvo: string; detalhe: string; desde: string; status_anterior?: CapituloStatusV2 }[];
  migracao?: { origem: "v1"; em: string; relatorio_path?: string; divergencias?: number };
}

export interface EstadoCanonico {
  project_id: string;
  engine_version: string;
  versao: number;                 // optimistic lock; incrementa a cada gravação
  doc: EstadoCanonicoDoc;
  updated_at?: string;
}

// ---------------------------------------------------------------------------
// Gates universais vs sinais (F6) — vocabulário
// ---------------------------------------------------------------------------

export type GateUniversal =
  | "artefato_ausente"
  | "texto_truncado"
  | "contradicao_factual"
  | "violacao_conhecimento"
  | "pov_impossivel"
  | "repeticao_quase_literal"
  | "estado_inconsistente"
  | "skill_ou_contexto_invalido"
  | "fora_do_schema"
  | "aprovacao_sem_evidencia";

export interface ResultadoGate {
  gate: GateUniversal;
  passou: boolean;
  evidencia?: string;
}
