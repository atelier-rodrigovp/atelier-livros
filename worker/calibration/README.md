# Calibração da Engine V2

O diretório `v1/` contém o corpus autocontido, seus hashes e os rótulos por
ocorrência. Os splits são definidos antes da rotulagem:

- `calibracao`: deriva a cota candidata;
- `holdout`: mede a candidata sem participar da derivação.

Cada ocorrência produzida pelo detector deve conservar seu `indice_detector` e
ser classificada como `violacao` ou `legitima`, com justificativa específica.
Padrões relevantes que o detector não encontrou entram em `nao_detectadas`,
permitindo calcular recall. Índices tornam auditáveis ocorrências textualmente
idênticas em posições diferentes.

Um arquivo só pode mudar para `validado_humano` no `corpus.json` depois da
revisão integral dos seus rótulos, com `revisor` e `revisado_em`. Pré-rótulos
automáticos não são evidência de calibração.

## Rotulagem humana por planilha

Não edite `corpus.json` ou os arquivos em `labels/` diretamente. Exporte um
CSV UTF-8 compatível com Excel:

```powershell
cd worker
npx tsx scripts/v2-rotulos-humanos.ts --export rotulos-pendentes.csv
```

Filtros opcionais: `--skill dan-brown` ou
`--amostra dan-brown-aprovado-01`. A planilha inclui:

- uma linha `detectada` para cada ocorrência do detector;
- uma linha `atestacao` para cada sinal em cada amostra;
- linhas `nao_detectada`, adicionadas pelo revisor quando ele encontrar no
  texto um padrão relevante que o detector deixou passar.

O revisor humano deve conferir o texto completo, classificar cada linha
`detectada` como `violacao` ou `legitima`, substituir todas as justificativas
marcadoras e atestar separadamente a busca de falsos negativos em cada sinal.
Trechos de falsos negativos precisam ser citações literais da amostra.

Primeiro valide sem escrever:

```powershell
npx tsx scripts/v2-rotulos-humanos.ts --import rotulos-pendentes.csv --revisor "Nome completo"
```

Somente depois do dry-run válido, aplique:

```powershell
npx tsx scripts/v2-rotulos-humanos.ts --import rotulos-pendentes.csv --revisor "Nome completo" --apply
```

A importação rejeita mudanças de hash, skill, split, arquivo, sinal, índice ou
trecho; ocorrências omitidas/duplicadas; justificativas automáticas; atestações
ausentes; e falsos negativos que não existam literalmente no texto. O
`corpus.json` é promovido por último, mantendo a calibração fechada se houver
falha intermediária. Uma amostra validada não pode ser sobrescrita pelo fluxo.
As atestações, o nome do revisor, a data e o SHA-256 do CSV importado ficam
preservados nos JSONs versionados; o calibrador rejeita qualquer divergência.

## Derivação das cotas

Comandos:

```powershell
npx tsx worker/scripts/v2-calibrar-cotas.ts
npx tsx worker/scripts/v2-calibrar-cotas.ts --json worker/calibration/v1/resultado.json
```

O comando nunca edita contratos. Uma cota candidata precisa passar pelos
limites de precisão/recall no holdout e, depois, pelo laboratório cego.
