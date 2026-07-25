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

Comandos:

```powershell
npx tsx worker/scripts/v2-calibrar-cotas.ts
npx tsx worker/scripts/v2-calibrar-cotas.ts --json worker/calibration/v1/resultado.json
```

O comando nunca edita contratos. Uma cota candidata precisa passar pelos
limites de precisão/recall no holdout e, depois, pelo laboratório cego.
