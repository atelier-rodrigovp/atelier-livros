# Prompt para o Claude Code — configurar Lena Agarti (Romantasy) + criar a skill dedicada

Você roda na minha máquina, repositório `ATELIER-LIVROS` (e tem acesso à pasta de skills do projeto). Faça tudo de forma autônoma. Duas entregas: (1) definir o pseudônimo **Lena Agarti** como autora de **romantasy** (persona pronta para quando o registro de autores for aplicado) e (2) **criar uma skill de escrita dedicada** a ela, no mesmo padrão das skills dos outros autores. Ao final: `npm run build` limpo, testes ok, `git commit` + `git push` do que for da app; a skill é um diretório novo (não precisa de Supabase). Não exponha segredos.

## Contexto
Os outros pseudônimos têm motor de escrita próprio: `skill-dan-brown` (Iago), `hoover-mcfadden` (Mia), `vesper-escritor-de-capitulos` / `skill-jk-rowling` (Iago/épico). A Lena estava "a definir". Decisão: **Lena Agarti = Romantasy** (fantasia romântica) — a faixa de maior venda atual (BookTok; ~46% da lista combinada de ficção do NYT). Referências de gênero: Sarah J. Maas, Rebecca Yarros, Jennifer L. Armentrout. **Emular convenções do gênero, nunca reproduzir texto, mundo, personagens ou magia de obras protegidas.**

## Parte 1 — Persona da Lena (seed/defaults)
Onde o seed/registro de autores define a Lena (ex.: `worker/scripts/seed-autores.mjs` e/ou o registro no-DDL em `briefing`, e quaisquer defaults na UI/types), troque "a definir" por:
- **nome:** Lena Agarti
- **estilo:** "Romantasy — fantasia romântica de alto risco e tensão amorosa"
- **genero:** "Fantasia / romance (new adult)"
- **referencias:** "Sarah J. Maas, Rebecca Yarros, Jennifer L. Armentrout"
- **bio:** "Mundos perigosos onde o romance é a maior das apostas. Inimigos que viram amantes, juramentos que cobram preço, magia com regras e um slow burn que não deixa respirar. Fantasia épica com o coração na garganta — feita para virar a noite e a página."
- **personalidade:** "Intensa e calorosa, sensual sem vulgaridade, fala direto com a leitora; vive de tensão romântica, lealdade e escolhas impossíveis; adora um gancho cruel no fim do capítulo."
- **skill_escrita (ponteiro):** `skill-romantasy`
(Observação: se o registro de autores ainda não existir por causa do bloqueio de DDL, apenas garanta que o seed/default já nasce assim — materializa quando Autores for aplicado.)
Inclua `skill-romantasy` na lista de skills de escrita aceitas pela app/worker (onde hoje constam dan-brown/hoover-mcfadden/jk-rowling/vesper).

## Parte 2 — Criar a skill `skill-romantasy`
Crie um diretório de skill novo seguindo **o mesmo padrão das skills de escrita já existentes** — leia antes `hoover-mcfadden` e `skill-dan-brown` (SKILL.md + assets: perfil de voz, estrutura, checklist, fluxo spec-driven capítulo-a-capítulo com validação) e espelhe a estrutura. A skill é **agnóstica de obra** (serve para qualquer livro da Lena), escreve em PT-BR, translatável, e valida cada capítulo por checklist. Conteúdo mínimo do `SKILL.md` + assets:

**Voz e PdV**
- Imersiva, calorosa, sensorial; tensão romântica constante.
- **POV duplo** alternado entre os dois protagonistas-amantes (3ª pessoa próxima ou 1ª, definido por obra); troca de POV só quando entrega informação/tensão nova.
- "Yearning" (desejo contido) como motor; a cena abre com gancho e fecha em cliffhanger.

**Estrutura (dois arcos entrelaçados)**
- **Arco de romance:** encontro → atração/negação → forced proximity/conflito → ponto de quase → ruptura → reunião → custo. **Slow burn calibrado** (marcos de proximidade física/emocional dosados).
- **Arco de fantasia:** mundo com regras claras, **sistema de magia com custo** (fair-play; nada de deus-ex), ameaça externa/missão, intriga de corte. Os dois arcos colidem no clímax (o romântico decide o épico e vice-versa).

**Tropes do gênero (usar com consciência, subverter clichê)**
- enemies-to-lovers, fated mates / vínculo, forced proximity / only-one-bed, "touch her and die", academia/treino, corte e política, segredo de identidade. Cada trope precisa de função e fair-play, nunca preguiça.

**Calor / spice (configurável por obra)**
- Escada de spice: do fade-to-black ao explícito elegante; **consentimento e agência** sempre; intimidade revela personagem, não enche linguiça.

**Ritmo e mercado**
- Capítulos curtos a médios com gancho; **frases-soco citáveis** (apelo BookTok) sem soar fabricado; piso de palavras por capítulo; densidade de cena de 7 camadas (como as outras skills).
- Fair-play **da trama e do romance**: a virada emocional e a mágica estavam plantadas.

**Anti-maçada / originalidade**
- Anti-clichê, anti-repetição (mapa do que a leitora já sabe), tensão por desejo e por relógio. **Originalidade absoluta:** emula técnica/convenção do gênero; jamais copia texto/mundo/personagens de Maas, Yarros ou qualquer obra protegida.

**Assets** (espelhando as outras skills): um template de `perfil-de-voz.md` (romantasy), um esqueleto de `Estrutura-do-Livro.md` (os dois arcos + marcos de slow burn + escada de spice), e um **checklist de conformidade por capítulo** (POV correto, gancho, marco de slow burn movido, custo da magia respeitado, fair-play, frase-soco, piso de palavras).

Garanta que a skill seja descoberta/disparável pelo mesmo mecanismo das demais (descrição com gatilhos como "escreva o capítulo da Lena", "romantasy", "fantasia romântica", "continue o livro da Lena").

## Aceite
- [ ] Lena Agarti definida como romantasy na seed/defaults (estilo, gênero, referências, bio, personalidade, `skill_escrita = skill-romantasy`); `skill-romantasy` na lista de skills aceitas.
- [ ] Skill `skill-romantasy` criada no padrão das existentes (SKILL.md + perfil de voz + estrutura + checklist), original e agnóstica de obra, em PT-BR e translatável.
- [ ] `npm run build` limpo, testes ok, commit + push do que é da app; a skill commitada/entregue conforme o projeto guarda as outras skills.

## Limites
- Não copie nem parafraseie texto/mundo/personagens de obras protegidas — só convenções do gênero.
- Não dependa de DDL/Supabase para a skill nem para o seed (a persona materializa quando Autores for aplicado).
- Sem libs novas pesadas; não exponha segredos.
