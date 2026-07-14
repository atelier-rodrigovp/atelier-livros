# Shape CONGELADO do resolvedor único (S7) — consumido pela UI (S5/S8)

Fechado ao concluir S6+S9+S10 (backend). O frontend NÃO reinterpreta estado: chama
`resolveOperationalState(input)` e renderiza a saída. Este é o contrato de dados.

## 1. Fontes que o resolvedor lê (e de onde vêm)

O frontend não tem acesso ao disco. As fontes são banco + heartbeat:

| Campo | Origem | Observação |
|---|---|---|
| job vigente de escrita | `jobs` via `selecionarJobVigenteEscrita` (S6) | escrever_livro de maior `created_at`; ignora tipos e antigos |
| `progresso` do vigente | `jobs.progresso` (jsonb) | shape §2 — engine/fase/cap_atual/quality_* etc. |
| linhas de capítulo | `chapters` (edição origem) | agora com `text_sha256`, `quality_status`, `quality_stage`, `approved_at` |
| worker online? | `worker_heartbeats` | heurística já existente |
| total previsto | `projects.total_capitulos` | denominador |
| pausa de produção | `worker_control.enabled` | nível 6 da hierarquia |

**Regra S6 (vigente×histórico):** o dashboard e a página de projeto passam a usar
`selecionarJobVigenteEscrita(jobsDoProjeto)` — jobs `escrever_livro` pausados antigos
e jobs de outros tipos (`telemetria`, `qualidade_editorial`) **nunca** governam o
estado de escrita. Módulo: `worker/src/job-vigente.ts` (espelhar em `src/lib`).

## 2. `progresso` do job de escrita (shape canônico, S4/S10)

Gravado pelo worker; **preservado por merge** em toda pausa (fix Bug B). Campos que a
UI pode ler (todos opcionais — o resolvedor tolera ausência):

```ts
interface ProgressoEscrita {
  // contadores/fase
  fase?: string;            // ESCRITA | REVISAO_CAPITULO | DESMANEIRISMO | CONCLUIDO ...
  cap_atual?: number;       // capítulos no disco (produzidos) — verdade do disco no run
  total?: number;
  palavras?: number;
  nota?: number | null;     // auto-nota provisória (não é a nota oficial de avaliação)
  continua?: boolean;
  // engine (S10/1.7) — alinhado a engine_calls (provedor/modelo)
  engine?: string;          // "claude-code" (hoje) | engine hospedada (futuro)
  provedor?: string;        // "anthropic"
  modelo?: string;          // "opus" (escritor)
  // bloqueio de qualidade
  quality_status?: "blocked_quality" | "blocked_infrastructure" | string;
  quality_stage?: string;   // REVISAO_CAPITULO | SPEC_CAPITULO | DESMANEIRISMO | PUBLICATION_GATE
  quality_blockers?: string[];
  // cota / infra / retomada
  aguardando_reset?: boolean;
  retry_at?: string | null; // ISO
  motivo?: string;
  infrastructure_retry?: unknown;
  // redução registrada
  reducao_qualidade?: string;
}
```

## 3. Contadores semânticos (derivados, uma única origem)

O frontend deriva os contadores de `chapters` + `progresso` (sem disco):

- **sincronizados** = nº de linhas em `chapters` da edição origem.
- **aprovados** = nº de linhas em `chapters` que **não** carregam status bloqueado
  (`quality_status ∉ {blocked_quality, blocked_infrastructure}`). **Invariante S3:**
  o worker só sincroniza capítulos aprovados — logo uma linha existente é aprovada;
  linhas legadas (sem `quality_status`/`text_sha256`) contam como aprovadas por
  PRESUNÇÃO DE LEITURA (nunca escrevemos "approved" numa linha legada — respeita a
  regra "não aprovar arquivo só porque existe"). Um capítulo bloqueado nunca ganha linha.
- **produzidos** = `max(progresso.cap_atual ?? 0, sincronizados)`. (Capítulo no disco
  ainda não sincronizado — ex.: o 38 em correção — aparece em produzidos, não em
  aprovados.)
- **em_correcao / capitulo_bloqueado** = se `progresso.quality_status ===
  "blocked_quality"`, o capítulo bloqueado ≈ `progresso.cap_atual` (o que estava em
  revisão); `quality_blockers` dá o texto humano.

Para o caso 53abdade: chapters=37 (após reconciliação), progresso.cap_atual=38,
quality_status=blocked_quality → **"38 produzidos · 37 aprovados · 37 sincronizados ·
capítulo 38 em correção"**. (Server-side, `worker/src/chapter-state.ts` já produz o
mesmo agregado a partir de fatos completos — a UI usa a versão sem-disco acima.)

## 4. Saída: `OperationalState`

```ts
type Situacao =
  | "executando"            // 1
  | "aguardando_cota"       // 2  (paused_free_quota)
  | "retry_infra"           // 3
  | "bloqueado_qualidade"   // 4  (blocked_quality)
  | "aguardando_decisao"    // 5
  | "pausado_manual"        // 6
  | "na_fila"               // 7
  | "interrompido_retomavel"// 8
  | "concluido";            // 9

interface OperationalState {
  situacao: Situacao;
  badge: string;            // rótulo curto ("Correção necessária no cap 38")
  tone: "info" | "success" | "warning" | "danger" | "neutral";
  mensagem_humana: string;  // SEMPRE traduzida (nunca o erro cru do runner)
  diagnostico_tecnico: string | null; // erro cru vai AQUI (área de diagnóstico)
  contadores: { produzidos: number; aprovados: number; sincronizados: number; em_correcao: number };
  capitulo_bloqueado: number | null;
  blocker_humano: string | null;     // ex.: "2 usos de 'coisa' no cap 38 — trocar pela coisa concreta"
  proxima_acao: string | null;       // ex.: "Corrigir capítulo 38"
  engine_info: { engine: string; provedor: string; modelo: string } | null;
  botoes: Array<{ id: string; label: string; habilitado: boolean }>;
}
```

## 5. Hierarquia de precedência (nível 1 vence)

1. `executando` — vigente `running` + heartbeat vivo.
2. `aguardando_cota` — `queued` + `aguardando_reset`/`retry_at` de cota (limite Max).
3. `retry_infra` — `progresso.infrastructure_retry` agendado.
4. `bloqueado_qualidade` — `paused` + `quality_status === "blocked_quality"`.
5. `aguardando_decisao` — bloqueio com decisão autoral pendente (ex.: exceção sugerida).
6. `pausado_manual` — `worker_control.enabled === false` (produção pausada).
7. `na_fila` — `queued` sem retry.
8. `interrompido_retomavel` — `running` sem heartbeat (órfão) mas retomável do disco.
9. `concluido` — `done` / edição pronta.

**Invariante:** job pausado por qualidade nunca aparece como só "Pausado" (nível 4
vence o 6). Mapa alinhado aos estados hosted (`paused_free_quota`, `blocked_quality`).

## 6. Tradução do erro cru (S8)

`job.erro` (ex.: "time escritor->revisor->editor esgotou o orçamento…") **nunca** é
`mensagem_humana`. Vai em `diagnostico_tecnico`. Mapa mínimo:

| Padrão em `job.erro` / `quality_stage` | `mensagem_humana` |
|---|---|
| `REVISAO_CAPITULO` + muleta | "Capítulo N precisa de uma correção de estilo (muleta repetida)." |
| `SPEC_CAPITULO` | "Capítulo N não cumpriu a especificação estrutural." |
| `PUBLICATION_GATE` | "O livro ainda não está pronto para publicar." |
| limite do Max / `aguardando_reset` | "Aguardando a cota do plano — retoma ~HH:MM." |
| rede/infra | "Instabilidade técnica — retomando automaticamente." |

## 7. Botões contextuais (S8)

Derivados de `situacao` + contadores:

- `bloqueado_qualidade` → **"Corrigir capítulo N"**, **"Ver diagnóstico"**,
  **"Reconciliar aprovados"** (se produzidos > sincronizados).
- **"Continuar a partir do N+1"** só habilitado quando o capítulo N está aprovado
  (não há bloqueio vigente).
- `concluido` → "Ver edição", "Publicar".

## 8. Módulos a criar no frontend (S7/S8)

- `src/lib/resolveOperationalState.ts` — implementa §4/§5/§6/§7 (substitui
  `status.ts:displayProjectStatus`, `operationalStatus.ts:deriveWritingStatus` e o
  inline de `Projeto.tsx:730`).
- `src/lib/jobVigente.ts` — porta de `worker/src/job-vigente.ts` (S6).
- Telas passam a consumir SÓ `resolveOperationalState`. Teste de paridade
  dashboard↔projeto (mesma entrada → mesma saída).

**Congelado.** Mudanças neste shape exigem nova rodada de contrato.
