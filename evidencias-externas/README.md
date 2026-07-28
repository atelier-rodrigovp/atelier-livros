# Evidências de verificação externa

O que a máquina local não pode provar mora aqui. Cada arquivo é um documento
`evidencia-externa/v1` (schema em `worker/src/v2/evidencia-externa.ts`) e o
`npm run prontidao` os lê para decidir os estados de produção.

| arquivo | atesta | estado que libera |
|---|---|---|
| `migracoes_remotas.json` | migrations aplicadas e schema/policies/índices conferidos no banco real | `MIGRACOES_REMOTAS_COMPROVADAS` |
| `integracao_real.json` | fluxo real interface → worker → Storage, com download e hash conferidos | `INTEGRACAO_REAL_APROVADA` |
| `ui_autenticada.json` | sessão autenticada abre e baixa os documentos V2 | `UI_AUTENTICADA_APROVADA` |
| `provedor_real.json` | smoke do provedor real, **sem escrita literária** | `PROVEDOR_REAL_APROVADO` |

Ausente = `NÃO COMPROVADO`. Não é zero, não é sucesso e não certifica nada.

## Por que não é um checkbox

Um booleano não diz contra qual commit rodou, em qual ambiente, com qual schema,
nem o que baixou. Por isso a evidência carrega uma impressão do que estava
valendo (`dependencias`): commit, versão das migrations, hash do schema, dos
contratos, do worker e da interface.

**Mudou qualquer uma dessas coisas, a evidência caduca sozinha.** Ninguém precisa
lembrar de revogá-la — é o que impede o "rodei semana passada, deve valer".

Também não vale: evidência de outro ambiente (`local` não certifica `producao`),
de outro tipo, incompleta, sem artefato baixado, com artefato de 0 byte, com
qualquer passo reprovado ou com erro registrado. Falha não vira aprovação em
nenhum caminho.

Os testes que provam cada uma dessas recusas estão em
`worker/src/v2/evidencia-externa.test.ts`.

## Como gerar

Estes documentos são produzidos pela execução real pré-canário, depois de
autorização explícita do autor. Não escreva um à mão para destravar um estado:
o `prontidao` confere as dependências contra o repositório e a fraude aparece
como "dependencias.X mudou desde a verificação".
