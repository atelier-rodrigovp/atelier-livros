# Arquitetura de confiabilidade e qualidade

## Arquitetura real

- **Web:** React/Vite/TypeScript, publicada pelo workflow `.github/workflows/deploy.yml`
  no branch `gh-pages`, com base `/atelier-livros/`.
- **Supabase:** dados, Auth, Storage, Realtime, fila e coordenação distribuída.
- **Worker local:** reivindica jobs por `claim_job`, executa processos e promove
  artefatos somente após pós-condições.
- **Runner Python:** escreve/revisa, mede novamente o arquivo gravado e persiste
  Quality State por capítulo em `quality/capitulo-NN.json`.

O banco é a fonte da fila e dos estados operacionais. O disco é a fonte do texto
durante a produção. Aprovação pertence ao par `(hash do texto, versão do detector)`.

## Máquina de estados

### Job

`queued -> running -> done` para sucesso; `running -> queued` apenas para retry com
política; `running -> paused` para `blocked_quality` ou `blocked_infrastructure`;
`running -> error` para erro determinístico esgotado. Finalização exige o mesmo
`locked_by` que reivindicou o job.

### Quality State

`pending -> evaluating -> approved` ou `rewrite_required`. Ao atingir o teto com
blockers: `blocked_quality`. Falha de dependência no teto: `blocked_infrastructure`.
Mudança no hash: `stale`. `approved_with_exception` exige identidade, data, motivo e
todos os blockers explicitamente aceitos. A exceção é registrada por um job
`aceitar_excecao_qualidade`; nunca é inferida pelo runner.

### Publicação

Capítulos aprovados -> manuscrito consolidado -> EPUB -> gate final -> manifest ->
staging idempotente -> RPC transacional -> edição/projeto `pronto`. Qualquer blocker
interrompe antes da promoção de status. Tradução e revisão permanecem em `revisao`
até um EPUB atual passar por essa mesma promoção.

## Política dos gates

Todo gate determinístico segue: medir -> corrigir -> reler -> recontar -> decidir.
Uma chamada ao agente ou alteração de arquivo não prova correção. O teto encerra
chamadas automáticas, preserva o texto e bloqueia; nunca aprova.

| Gate | Fonte | Bloqueia quando | Evidência |
|---|---|---|---|
| capítulo/tiques | runner + `maneirismo.ts` | recontagem residual | Quality State com hash |
| revisão por capítulo | runner | piso, ledger, cadência, agência ou streak falham | JSON do capítulo |
| book-wide | runner | qualquer diagnóstico residual após teto | estado `blocked_quality` |
| publicação | `publication-gate.ts` | capítulo stale, artefato ausente/incompatível, meta-texto, continuidade ou skill drift | `publication-manifest.json` |

## Política de retry

| Classe | Política | Estado no teto |
|---|---|---|
| throttle Max | horário informado ou backoff dedicado; não conta erro | queued aguardando reset |
| rede/runner interrompido | 2, 4, 8, 16, 30 min; máximo 6 falhas ou 2 h | blocked_infrastructure |
| qualidade | correções limitadas e recontadas | blocked_quality |
| determinístico/configuração | attempts do job | error |

## Concorrência e idempotência

`supabase/reliability.sql` fornece claim transacional com advisory lock por projeto.
Não existe fallback local. Artefatos usam identidade única
`(edition_id,tipo,storage_path)` e upsert, impedindo duplicação em retomadas.
Capítulos, manuscrito e EPUB são enviados para uma chave versionada pelo hash do
manifest. `promote_publication` torna capítulos, artefatos e status visíveis numa única
transação; falha anterior deixa apenas staging órfão, nunca edição parcialmente pronta.

## Skill patches

`worker/skill-patches/manifest.json` é canônico para os arquivos críticos. O preflight
compara repositório e instalação e bloqueia o worker se houver diferença. Atualização
continua manual; o worker nunca sobrescreve a instalação.

## Segurança do executor

O modo padrão do Claude é `acceptEdits`, limitado ao fluxo de edição solicitado. O modo
`bypassPermissions` só pode ser reativado por `CLAUDE_PERMISSION_MODE` explícito e deve
ser tratado como exceção operacional auditável.

O worker usa `service_role`, portanto leituras/mutações das tabelas de usuário explicitam
`owner`. Caminhos locais e segmentos de Storage rejeitam traversal, separadores e valores
vazios antes de qualquer operação.
