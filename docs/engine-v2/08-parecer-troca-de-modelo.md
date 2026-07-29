# Parecer — o CLI executou modelo diferente do pedido (achado A2)

Investigação da fatia 5. **Nenhuma correção foi feita**; o objetivo é permitir
decidir os pins da fatia 6 com evidência em vez de palpite.

## O caso

Run `894dba1a`, papel `arquiteto_enredo`, `2026-07-27 03:02:25+00`:

```
modelo solicitado claude-sonnet-5;
executado(s): claude-haiku-4-5-20251001, claude-sonnet-5
```

`exigirModeloExecutado` recusou e falhou fechado, como devia — a chamada roda
sem ferramentas e sem subagentes, então `modelUsage` deveria ter exatamente uma
chave.

## Fatos

Cada um verificável na consulta ou no arquivo indicado.

**F1 — ocorrência única em toda a história.** Uma linha, num universo de 2.037
runs V2.

```sql
select left(id::text,8), papel, started_at, left(erro->>'mensagem',110)
from public.engine_runs
where erro->>'mensagem' like '%executado%' or erro->>'codigo'='PROVEDOR_MODELO_DIVERGENTE';
-- 1 linha: 894dba1a
```

**F2 — a causa provável já tinha sido diagnosticada, e mitigada.** O provedor
define `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: "1"`, com este comentário no
código:

> sem ela o CLI dispara chamadas internas (haiku, ex.: título de sessão) que
> aparecem no modelUsage e reprovariam `exigirModeloExecutado`

O modelo intruso do run é **exatamente** `claude-haiku-4-5-20251001`, e o
solicitado aparece junto — a assinatura de tráfego não-essencial, não de
substituição do modelo de trabalho.

**F3 — a mitigação precede o run em 3 horas.** Commit `84af5a1`,
`2026-07-27 00:04`; o run é das `03:02` do mesmo dia.

**F4 — nenhuma ocorrência depois.** Os runs seguintes do mesmo papel
(`889f9fc9` às 09:32, `de568246` às 15:37) não registram divergência, nem
nenhum outro papel, em nenhum momento.

**F5 — sem relação com limite de sessão.** Os erros `You've hit your session
limit` do período são de outros runs e outros horários; `894dba1a` falhou em
31 s, com `PROVEDOR_MODELO_DIVERGENTE`, não com throttle.

**F6 — o CLI 2.1.220 não documenta o comportamento.** `--help` não menciona
`modelUsage` nem tráfego interno. Não há changelog local acessível.

## Hipótese

**H1 — o worker ainda rodava o código anterior à mitigação.** É a leitura que
encaixa F1–F4: a variável de ambiente entrou às 00:04, o worker só a aplica
depois de reiniciar, e este projeto já registrou a lição de que *commit ≠
produção*. Sob essa hipótese, `894dba1a` é o último run do código velho, e o
silêncio posterior é a mitigação funcionando.

**Não consegui provar.** O `worker.log` não tem marca de início datada, e não
existe registro de restart no banco. Portanto H1 é a explicação mais
consistente com a evidência, não um fato estabelecido.

## O que isto significa para os pins (fatia 6)

**Não há evidência de que o CLI substitua o modelo de trabalho.** O caso único
tem assinatura de tráfego interno (haiku para tarefa acessória) somado ao modelo
correto, com mitigação já no código e zero reincidência.

Recomendação: **prosseguir com a troca de pins**, com duas condições baratas.

1. **Confirmar que o worker roda o código atual antes de calibrar.** Se H1
   estiver certa, o risco não é o CLI — é o deploy. Vale um registro de versão
   no start do worker; hoje não existe, e foi justamente o que impediu fechar
   este parecer.
2. **Manter `exigirModeloExecutado` intocado.** Ele é a rede que pegou o único
   caso e o transformou em falha legível em vez de calibração contaminada.

Se aparecer uma segunda ocorrência **depois** de confirmado o restart, a
hipótese cai e a investigação recomeça — aí sim antes de qualquer pin.
