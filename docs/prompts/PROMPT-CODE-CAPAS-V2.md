# Prompt para o Claude Code — capas v2: FLUX grátis, 5 opções, logo Maremonti, multilíngue padronizado

Você roda na minha máquina, repositório `ATELIER-LIVROS` (front React+Vite+TS + worker TS local + `worker/scripts/compose_cover.py` em Pillow). Faça de forma autônoma. Ao final: `npm run build` limpo, testes ok, `git commit` + `git push`; valide com Playwright (senha `<SENHA_DO_APP>`) e, se possível, gere um exemplo real de capa pra screenshot. Não exponha segredos.

## Estado atual (parta daqui)
- O job `gerar_capas` (`worker/src/jobs.ts`) gera **UMA arte-mestra sem texto** via **Pollinations.ai/Flux** (default fraco) e cai em canvas-design (Claude) como fallback.
- `compose_cover.py` desenha título/subtítulo/autor sobre a arte com **layout fixo** (já padroniza idiomas: mesma arte, só o texto muda). **Não aplica logo.**
- A capa aprovada por idioma vira artifact e é exigida pelo EPUB.

## Objetivo (4 melhorias)
1. **Motor de imagem melhor, porém GRÁTIS — FLUX.1 via provedor com token gratuito.**
2. **Pelo menos 5 opções** de arte-mestra (sem texto) por briefing, para escolher.
3. **Padronizar capas multilíngue**: ao escolher 1 arte, todos os idiomas são compostos da **mesma arte**, layout idêntico, só o texto traduz.
4. **Logo Maremonti em TODAS as capas**, sempre **centro-inferior, pequeno e padrão** (mesmo tamanho/posição em todo livro).

## Parte 1 — Motor de imagem FLUX (grátis) + 5 opções
Implemente um **provider de imagem configurável** no worker, com cadeia de fallback. Variável `IMAGE_PROVIDER` no `worker/.env` (default `cloudflare`), e o worker escolhe o endpoint conforme as credenciais presentes. Ordem de qualidade/recomendação:

- **Hugging Face Inference — `black-forest-labs/FLUX.1-dev`** (melhor qualidade grátis): `POST https://api-inference.huggingface.co/models/black-forest-labs/FLUX.1-dev`, header `Authorization: Bearer $HF_API_TOKEN`, body `{ "inputs": <prompt>, "parameters": { "width":1024, "height":1536 } }` → retorna **bytes de imagem**. Token grátis em huggingface.co (sem cartão); pode ter "cold start"/rate-limit — trate retry.
- **Cloudflare Workers AI — `@cf/black-forest-labs/flux-1-schnell`** (grátis, rápido, sem cartão): `POST https://api.cloudflare.com/client/v4/accounts/$CF_ACCOUNT_ID/ai/run/@cf/black-forest-labs/flux-1-schnell`, header `Authorization: Bearer $CF_API_TOKEN`, body `{ "prompt": <prompt> }` → retorna **base64** (decodifique).
- **Together.ai — `black-forest-labs/FLUX.1-schnell-Free`**: `POST https://api.together.xyz/v1/images/generations`, header `Authorization: Bearer $TOGETHER_API_KEY`, body `{ "model":"black-forest-labs/FLUX.1-schnell-Free", "prompt":<prompt>, "width":1024, "height":1536, "n":1 }`.
- **Fallback sem chave: Pollinations** (mantém o atual `image.pollinations.ai`, modelo `flux`) — usado se nenhum token existir.
- **Upgrade opcional pago: OpenAI `gpt-image-1`** se `OPENAI_API_KEY` existir (use-o no topo da cadeia quando presente).

Adicione ao `worker/.env.example` (sem valores): `IMAGE_PROVIDER`, `HF_API_TOKEN`, `CF_ACCOUNT_ID`, `CF_API_TOKEN`, `TOGETHER_API_KEY`, `OPENAI_API_KEY`. Eu colo as credenciais do provedor que escolher. Documente na UI de capas qual provedor está ativo e que é grátis com token.

Fluxo novo: o job (ex.: `gerar_capas_opcoes`) gera **5 artes-mestra SEM TEXTO** a partir do *briefing visual* + gênero + autor/estilo, **variando seed/ângulo/composição** para diversidade real (não 5 quase iguais). Ajuste cada uma para 1600×2560 (o `cover_resize` já preenche/corta). Suba as 5 como artifacts (`tipo='capa_opcao'`, `meta.idx`, `meta.seed`) e exponha no front. Prompt de imagem: reforce "sem nenhum texto/letra/título", direção de arte do briefing, paleta, mood do gênero, retrato, alta qualidade, "evite cara de IA".

## Parte 2 — Logo Maremonti (asset + composição)
- Copie `C:\Users\Rodrigo Paiva\Desktop\PESSOAL\LIVROS\Maremonti.png` (1254×1254, fundo branco) para o repo como asset versionado `worker/assets/maremonti.png`. Gere também, via Pillow, uma versão **branca com fundo transparente** `worker/assets/maremonti-white.png` (remova o branco, recolora para branco) — para ler sobre o scrim escuro da base.
- Em `compose_cover.py`, adicione `--logo` e componha a logo em **posição/tamanho FIXOS e iguais em todo livro**: centralizada na horizontal, na **base**, largura ≈ 20–22% da largura (≈ 340–360 px em 1600), margem inferior fixa (≈ 90–110 px), **abaixo** do bloco de autor. Use a versão branca/transparente; reforce o scrim inferior se precisar de contraste. A logo entra em TODAS as capas automaticamente, sem opção de desligar.

## Parte 3 — Padronização multilíngue
Mantenha o princípio do `compose_cover.py` (mesma arte, layout fixo, só texto traduzido). Ao **escolher** uma das 5 artes, ela vira a `master` do projeto; cada idioma é composto dessa master única (título/subtítulo/autor traduzidos + a mesma logo, mesma posição). Adicionar um idioma depois **reaproveita a master** (sem regerar arte) — instantâneo.

## Parte 4 — UI (aba Capas do Projeto)
- Botão **"Gerar 5 opções"** (enfileira o job). Mostra estado/heartbeat; ao concluir, **galeria das 5 artes** (sem texto) para escolha.
- Usuário **seleciona 1** → compõe a capa final do idioma de origem (texto + logo) e a versão padronizada de cada idioma escolhido. Preview lado a lado. Botão **Aprovar** fixa a capa de cada edição (a que EPUB/Catálogo usam).
- **"Regerar 5 opções"** (novo briefing) e **"Trocar arte"** (volta à galeria) sem perder os textos. Indique o provedor ativo; se nenhum token, avise que está usando o fallback Pollinations (qualidade menor).
- Worker offline → job aguarda na fila com aviso (coerente com a UI honesta do worker).

## Aceite
- [ ] Provider FLUX grátis funcionando (HF/Cloudflare/Together conforme token); fallback Pollinations sem chave; gpt-image-1 opcional se houver chave.
- [ ] 5 opções reais e diversas por briefing; escolher 1 → composição multilíngue padronizada da mesma master.
- [ ] Logo Maremonti (branca/transparente) em TODAS as capas, centro-inferior, tamanho/posição idênticos entre livros; assets versionados; `compose_cover.py --logo` ok.
- [ ] `.env.example` atualizado; `npm run build` limpo, testes ok, commit + push; screenshot da galeria de 5 e de uma capa final com logo.

## Limites
- Não comite tokens/segredos (vão só no `.env` local).
- Logo obrigatória e padronizada — sem variação por livro.
- Use o worker + fila (não chame a IA de imagem do front). Sem libs novas pesadas no front.
