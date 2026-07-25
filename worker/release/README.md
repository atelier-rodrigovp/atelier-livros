# Certificação de release da Engine V2

Fundação e escrita V2 operam em modo **fail-closed**. O worker procura
`engine-v2.json` neste diretório e confere, no checkout atual:

- versão da engine;
- hash determinístico do runtime do worker e lockfile;
- versões e hashes dos contratos;
- versão e hash do corpus;
- calibração/holdout prontos para todas as skills;
- canários com pelo menos dois capítulos por skill, todos `aprovado` pleno;
- laboratório automático aprovado, sem regressão/vazamento;
- avaliação cega automática e avaliação humana com pelo menos 80%.

O arquivo só deve ser criado pelo comando `scripts/v2-certificar-release.ts`.
Editar um JSON à mão não cria as evidências ausentes e o verificador rejeita
qualquer divergência posterior de contrato ou corpus.

Canário de voz e laboratório continuam disponíveis sem certificado, pois são
justamente os fluxos que produzem evidência. `criar_fundacao` e
`escrever_livro` V2 permanecem bloqueados até a certificação.
