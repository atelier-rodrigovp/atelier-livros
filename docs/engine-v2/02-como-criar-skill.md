# Engine V2 — Como criar uma skill nova (sem alterar o núcleo)

Uma skill V2 é **um diretório de dados**. Nenhum `if` no núcleo, nenhum patch em agente, nenhum espelho Python.

## Passos

1. **Crie `worker/skills-v2/<id>/contrato.json`** no schema `skill-contract/v1` (tipos em `worker/src/v2/tipos.ts::SkillContract`). Campos que definem a identidade:
   - `familia_editorial`, `motor_narrativo`, `unidade_dramatica`, `temporalidade`
   - `pov` (+ `rotacao` se multi-fio), `faixa_palavras`, `ritmo.cadencia` (cotas próprias — **nunca copie as de outra skill**)
   - `acao_interioridade` — declare o que é FEATURE deste gênero (lição CR4: a régua que salva um gênero mata outro)
   - `politica_exposicao`, `politica_dialogo`, `politica_metafora`
   - `tipos_gancho` — vocabulário próprio (as fichas só aceitam estes)
   - `regras[]` — formulação POSITIVA; cotas com ids convencionais (`cota.gnomico`, `cota.personificacao`, `cota.sanfona`, `piso.declarativas`, `cota.metafora`, `teto.interioridade_run`) para os detectores universais lerem
   - `testes_positivos` — o que PROVA a identidade em avaliação cega
   - `excecoes[]` por tipo de cena, referenciando ids de regras
   - `estruturas_exigidas` — docs de fundação + campos extras da ficha (`campos_spec`)
   - `modelos_positivos` — só trechos CURTOS validados pelo autor (nunca gerados; aforismo proibido)
2. **Registre o mapeamento V1→V2** (se houver skill V1 correspondente) em `worker/src/v2/contrato.ts::MAPA_SKILL_V1_V2`.
3. **Valide:** `cd worker && npx vitest run src/v2/contrato.test.ts` — contrato inválido é rejeitado nomeando o campo. Adicione ao teste de identidade (anti-CR4) o que diferencia a skill nova.
4. **Se a skill exige campos de ficha próprios**, adicione geradores neutros em `worker/src/v2/lab/cenas.ts::CAMPOS_SKILL_NEUTROS` para o laboratório poder rodá-la.
5. **Rode o laboratório** antes de usar em produção:
   ```bash
   # via UI (Laboratório) ou job laboratorio_v2 com payload {"skills": ["<id>", ...]}
   ```
   Critério de release: distinguível às cegas, sem vazamento de POV, sem regressão nas skills existentes.
6. **Versione:** qualquer mudança de conteúdo do contrato = bump de `versao` (semver). O hash do contrato entra em cada run; o runtime registra a versão realmente usada.

## O que NUNCA fazer

- Condicional por nome de skill em qualquer módulo de `worker/src/v2/` (o teste de contrato e o code review devem barrar).
- Cota "universal" de estilo — cota nasce no contrato, por skill.
- Parágrafo-modelo gerado por máquina no contrato (fundação amplificada por 40 capítulos foi a causa nº 1 do tique de IA).
