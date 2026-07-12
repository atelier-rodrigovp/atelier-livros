# Runbook operacional

## Antes de iniciar o worker após esta mudança

1. Audite duplicatas em `artifacts` pela identidade edição/tipo/caminho.
2. Aplique manualmente `supabase/reliability.sql`.
3. Revise `worker/skill-patches/manifest.json`.
4. Com autorização, aplique os patches das skills e rode os testes requeridos.
5. Inicie o worker; o preflight deve confirmar a versão do manifest.

## Estados e ações

- **Worker offline:** iniciar o processo; não reenfileirar repetidamente.
- **Job órfão:** confirmar heartbeat e lease; a recuperação só deve ocorrer após stale.
- **Throttle:** aguardar `retry_at`; horário vencido com worker offline não é throttle ativo.
- **Bloqueado por qualidade:** ler `quality_stage` e `quality_blockers`; corrigir a
  estratégia/texto e retomar explicitamente. Não apagar marcadores sem diagnóstico.
- **Exceção editorial consciente:** enfileirar `aceitar_excecao_qualidade` com
  `project_id`, edição quando aplicável, `capitulo`, `motivo` e `blocker_codes`. O worker
  registra o UID do owner, horário, motivo e hash. Se o texto mudou ou algum blocker não
  foi nomeado, a exceção é rejeitada.
- **Bloqueado por infraestrutura:** restabelecer a dependência e zerar o circuit
  breaker apenas numa retomada explícita.
- **Skill divergente:** comparar hashes; não copiar automaticamente. Atualizar manifest
  somente quando a versão versionada for deliberadamente alterada e testada.
- **Publicação parcial:** a edição não deve estar pronta. Verificar o manifest local e
  repetir o mesmo job; staging usa a mesma chave de conteúdo e a promoção no banco é
  atômica. Objetos de staging órfãos podem ser limpos somente após confirmar que nenhum
  manifest os referencia.

## Observabilidade

“Executando agora” exige job running e heartbeat ativo. “Órfão”, “na fila”, “retry
vencido”, “bloqueado por qualidade” e “bloqueado por infraestrutura” são estados
distintos. Custos e papéis são estimativas históricas, não faturamento nem tracing exato.
