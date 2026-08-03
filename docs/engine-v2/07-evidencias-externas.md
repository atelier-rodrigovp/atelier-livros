# Evidências de verificação externa

O que a máquina local não pode provar. Cada evidência é um documento
`evidencia-externa/v2` (schema em `worker/src/v2/evidencia-externa.ts`) que o
`npm run prontidao` lê para decidir os estados de produção.

> **Pasta unica.** Existiu por um tempo uma `evidencias-externas/` versionada ao
> lado desta. Duas pastas para a mesma coisa e convite a evidencia orfa: este
> documento virou `docs/engine-v2/`, e TODA evidencia vive em `.evidencias/`.

## Onde vivem: FORA do Git

Em **`.evidencias/`**, na raiz do repositório, ignorado pelo `.gitignore`.

Dois motivos, os dois decisivos:

1. **O remoto é público.** A evidência carrega project id do Supabase, caminhos
   de Storage, identificador do executor e log de execução.
2. **Versionar era contraditório.** A v1 dizia "documento versionado" e se
   mordia: a evidência apontava para o HEAD X, commitá-la criava o HEAD Y, e o
   próprio prontidão a invalidava no commit seguinte.

Não é solução híbrida: nenhuma evidência entra no histórico. Em CI, o diretório
é artefato do job, guardado com a mesma proteção de um segredo.

## Como caducam: por fingerprint do código, não por commit

A evidência registra `tested_code_commit` para rastreabilidade, mas a validação
**não** compara com o HEAD atual. O que ela compara são os hashes do código que
a verificação de fato exercitou:

| fingerprint | cobre |
|---|---|
| `migrations_source_hash` | os arquivos `.sql` locais |
| `contratos_hash` | `worker/skills-v2/*/contrato.json` |
| `worker_hash` | código do worker (sem testes) |
| `interface_hash` | código da interface (sem testes) |

Mudou o worker, a evidência morre sozinha. Commitou um README, ela continua
valendo — que é o comportamento certo nos dois casos.

## Hash local ≠ schema remoto

São campos diferentes de propósito. `migrations_source_hash` é o hash dos `.sql`
que estão no disco; `remoto.remote_schema_hash` é o hash da **introspecção do
banco real** (tabelas, colunas, constraints, policies, triggers, índices e
migrations observadas). A v1
chamava um pelo nome do outro — certificava o schema remoto medindo arquivo
local. A validação hoje recusa evidência em que os dois sejam iguais, porque
isso significa que não houve introspecção nenhuma.

## Como são produzidas

Só pelo harness:

```bash
cd worker
npx tsx scripts/gerar-evidencia.ts --tipo migracoes_remotas --project-id <id> --executor <ref>
```

O gerador (`worker/src/v2/gerador-evidencia.ts`):

- exige worktree limpa nos caminhos que a verificação exercita;
- captura o HEAD real (`git rev-parse HEAD`) — falha aborta, não vira rótulo;
- executa cada passo e guarda o **código de saída real**;
- sanitiza os logs (JWT, chave, URL do Supabase, e-mail);
- calcula hash e bytes do que foi **realmente baixado**;
- aborta no primeiro passo com código diferente de zero, **sem escrever arquivo**;
- grava de forma atômica (tmp + rename).

**Não existe parâmetro que declare "aprovado".** O resultado é derivado dos
códigos de saída. Um JSON escrito à mão não passa na validação: sem passos com
`exit_code`, sem log, sem introspecção e sem artefato, ele é recusado item a
item — ver `worker/src/v2/gerador-evidencia.test.ts`.

| arquivo | atesta | estado que libera |
|---|---|---|
| `migracoes_remotas.json` | migrations aplicadas e schema conferido no banco real | `MIGRACOES_REMOTAS_COMPROVADAS` |
| `integracao_real.json` | interface → worker → Storage, download e hash conferidos | `INTEGRACAO_REAL_APROVADA` |
| `ui_autenticada.json` | sessão autenticada abre e baixa os documentos V2 | `UI_AUTENTICADA_APROVADA` |
| `provedor_real.json` | smoke do provedor, **sem escrita literária** | `PROVEDOR_REAL_APROVADO` |

Ausente = `NÃO COMPROVADO`. Não é zero, não é sucesso, não certifica nada.
