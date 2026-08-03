# Corpus automático da Engine V2

O diretório `v1/` contém amostras versionadas, hashes, splits `calibracao` e
`holdout` e as classes `aprovada`/`contraste` das três skills.

O corpus tem duas funções:

1. provar que amostras, contratos e detectores continuam estruturalmente
   compatíveis com o checkout;
2. alimentar o laboratório cego antes dos canários e da certificação.

Ele não pede rotulagem humana e não promove cotas automaticamente. As cotas
ativas permanecem nos contratos versionados; qualquer mudança exige código,
testes, laboratório cego e novos canários.

Os JSONs históricos em `labels/` preservam a cobertura posicional dos
detectores, mas seus status não liberam nem bloqueiam release. O julgamento de
falsos positivos no caminho de produção é responsabilidade da cascata editorial
real. O julgamento do autor ocorre sobre os canários ou sobre a obra.

## Verificação

```powershell
cd worker
npx tsx scripts/v2-calibrar-cotas.ts
```

O comando é somente leitura e nunca altera contratos.
