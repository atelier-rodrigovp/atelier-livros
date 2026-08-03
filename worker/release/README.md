# Certificação de release da Engine V2

Fundação e escrita V2 operam em modo **fail-closed**. O worker procura
`engine-v2.json` neste diretório e confere, no checkout atual:

- versão da engine;
- hash determinístico do runtime do worker e lockfile;
- IDs fixos dos modelos (`Opus 5` na prosa, `Sonnet 5` em
  raciocínio/julgamento e `Haiku 4.5` em fatos);
- versões e hashes dos contratos;
- versão e hash do corpus;
- corpus automático íntegro, com calibration/holdout e classes aprovada/contraste;
- canários com pelo menos dois capítulos por skill, todos `aprovado` pleno;
- laboratório automático aprovado, sem regressão/vazamento;
- avaliação cega automática com os pisos de distinguibilidade, aderência e notas.

Não existe etapa de rotulagem ou avaliação manual obrigatória. O julgamento do
autor acontece sobre os canários ou sobre a obra, não sobre linhas de detector.

O arquivo só deve ser criado pelo comando `scripts/v2-certificar-release.ts`.
Editar um JSON à mão não cria as evidências ausentes e o verificador rejeita
qualquer divergência posterior de contrato, corpus, runtime ou modelo.

Canário de voz e laboratório continuam disponíveis sem certificado, pois são
justamente os fluxos que produzem evidência. `criar_fundacao` e
`escrever_livro` V2 permanecem bloqueados até a certificação.
