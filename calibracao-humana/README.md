# Rotulagem humana — fluxo encerrado

Esta pasta contém somente um artefato histórico local. Não preencha, importe ou
revise o CSV: rotulagem de ocorrências não é requisito da Engine V2, do
laboratório, dos canários, do certificado nem da escrita.

A verificação vigente usa:

- corpus automático versionado, com hashes, splits e classes contrastivas;
- contratos e cotas congelados no código;
- julgamento cego automático com modelos reais;
- gates editoriais e canários completos.

O julgamento do autor fica sobre o texto literário. Ler canários é permitido e
útil, mas não produz uma métrica obrigatória nem desbloqueia o sistema.

O importador CSV permanece apenas para arqueologia/reprodução de versões antigas
e não é consumido por `prontidao`, pelo certificado ou pelo worker de produção.

## Nenhuma limitação de detector depende desta pasta

Isto ficou dito em um lugar só e contradito em outro. Até 2026-08-03,
`worker/src/limitacoes-conhecidas.ts` afirmava que o falso negativo REC-03 do
detector `contarSanfona` destravava com "amostra rotulada por humano" — enquanto
este README já declarava a rotulagem encerrada. As duas coisas não podiam ser
verdade ao mesmo tempo, e a que estava errada era a primeira.

O que passa a valer, escrito nos dois lugares:

- **Os detectores de transparência são CONSULTIVOS.** O número que produzem nunca
  confirma violação sozinho. Quem decide é o revisor-modelo: `tarefaRevisor`
  (REGRA DOS SINAIS DE CONTAGEM) exige que ele cite em `ocorrencias_citadas` o
  índice de cada ocorrência julgada defeito real — ocorrência não citada conta
  como falso positivo, e citadas + `falsos_positivos` têm de fechar o valor medido.
- **Por isso um falso negativo de detector não deixa capítulo ruim passar**: não
  era o detector que reprovava.
- **Recalibrar detector não é trabalho de rotulagem humana.** Exige processo
  separado — corpus automático versionado, precisão/recall e holdout — ou decisão
  explícita do autor. A régua dos contratos 1.0.0 está congelada.

Base medida, não suposta: `docs/engine-v2/investigacao-sanfona-hoover.md` mediu a
precisão de `contarSanfona` na voz hoover em 0–15% (0–2 sanfonas genuínas em 13
contadas). O `rotulos.local.csv` desta pasta tem 778 linhas cujas justificativas
seguem no texto-placeholder — e continuam assim de propósito: preenchê-las não
destrava nada.
