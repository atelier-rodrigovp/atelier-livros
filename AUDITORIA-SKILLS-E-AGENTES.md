# Auditoria — skills, agentes e arquitetura do Atelier
*Leitura direta dos arquivos (não delegada). 30/06/2026.*

## Veredito em uma linha
A arquitetura é boa e as skills são fortes. O que falhou o mês inteiro foram as **emendas** (a craft não chegava à caneta) e um **teto inerente** (o pipeline foi engenheirado para *matar defeito*, não para *criar prosa viva*). Não foi engenharia jogada fora.

---

## 1. O mapa: como as peças se encaixam

```
IDEIA
  │
  ▼
[arquiteto-de-enredo]  ── fábrica de fundação (entrevista + portão + gera 5 agentes)
  │   produz: Bíblia, Estrutura, Mapa, perfil-de-voz, ESTADO_LIVRO.json, .claude/agents/
  ▼
[livro-do-zero-ao-epub / livro_runner.py]  ── o MOTOR (orquestra as fases)
  │   ESTRUTURA → ESCRITA → CONSOLIDAÇÃO → REVIEW → REESCRITA → DESMANEIRISMO → EPUB
  ▼
  por capítulo, dentro da ESCRITA:
     [livro-contextualizador (haiku)] → destila o digest do capítulo
     [livro-escritor (opus)]          → escreve a prosa (lê digest + spec + perfil-de-voz)
     [livro-revisor (sonnet)]         → adversarial; aprova/reprova + edições cirúrgicas
     [livro-editor (opus)]            → orquestra specs/estado, delega (não escreve prosa)
     [livro-arquiteto-comercial(sonnet)] → audita TRAÇÃO macro nos checkpoints
  ▼
[book-bestseller-review]  ── juiz honesto final (nota + relatório)
  ▼
[edicao-kindle]  ── EPUB
```
A `skill_escrita` (skill-dan-brown / hoover-mcfadden / jk-rowling / vésper / romantasy) **deveria** ser invocada pelo escritor para dar a VOZ/craft do gênero. É aqui que mora o problema central (seção 4).

---

## 2. As skills, uma a uma (estrutura + veredito)

### arquiteto-de-enredo (a fábrica de fundação) — **FORTE, com 1 defeito físico**
- **Estrutura:** monolítica (um `SKILL.md` v6.1, 26 KB, autossuficiente). Sem pasta de references — tudo embutido em seções "REFERÊNCIA EMBUTIDA".
- **Conteúdo:** entrevista em blocos; **Portão de qualidade (Fase 1.5)** com scorecard + auditoria adversarial + densidade; **Política anti-repetição** (Mapa de Conhecimento do Leitor); **Política de densidade e entrelaçamento** (anti-linguiça); modelos por agente; regras invioláveis (escritor sempre opus). É um documento de método sério.
- **Defeito físico:** o arquivo tem **3.189 bytes nulos** espalhados (encoding poluído). O texto sobrevive à leitura (`tr -d '\000'`), mas **quebra o editor** — por isso ninguém consegue editá-lo com segurança, e por isso todas as nossas correções de voz tiveram que viver no worker, fora da skill. Não é conteúdo ruim; é um arquivo corrompido que deveria ser regravado limpo.

### skill-dan-brown — **MUITO FORTE**
- **Estrutura:** `SKILL.md` + `Runbook` + `assets/` (checklist de conformidade, spec de capítulo) + `references/` (arquitetura, **metamodelo-thriller**, processo-de-livro, **voz-e-oficio**).
- **Conteúdo:** o **motor** (capítulos curtos 1.300–2.200, corte no pico, relógio 12–48h, montagem paralela, cold open, caça a pistas) + as **5 regras de qualidade** (fair-play, exposição dramatizada, interioridade com custo, prosa fresca/ritmo variado, sem coincidência), cada uma com par antes/depois. É craft de verdade, bem escrita.
- **Veredito:** a skill não é o problema. O problema é que essa craft **não estava chegando ao escritor** (seção 4).

### As outras skills de autor (estrutura)
- **hoover-mcfadden** (thriller-romance doméstico): a mais "carnuda" — além de SKILL/references/voz-e-oficio, **embute uma obra inteira de exemplo** (Bíblia, Estrutura, Mapa, capítulo 01). Referência rica de "cena vivida em 7 camadas".
- **skill-jk-rowling** (prosa imersiva): references bem fatiadas — `cadencia-e-respiracao`, `imersao-e-ponto-de-vista`, `enredo-ganchos-e-revelacao`, `personagem-voz-e-nomes`. Foco em imersão/encantamento, não em thriller.
- **vesper-escritor-de-capitulos** (trilogia VÉSPER): arquitetura + continuidade-trilogia + voz-e-oficio. Dedicada a uma obra específica.
- **skill-romantasy**: citada na lista de skills conhecidas do worker (romantasy).
- **arquiteto-enredo-deepseek**: variante do arquiteto rodando 100% DeepSeek (pipeline barata).
- **Padrão comum:** todas seguem o mesmo molde — `SKILL.md` + `references/voz-e-oficio.md` (a craft) + `assets/` (spec + checklist). São consistentes e bem organizadas.

### Skills de apoio
- **livro-do-zero-ao-epub** = o **motor** (`livro_runner.py`) + briefing-modelo. É o orquestrador determinístico (verdade do disco, fases, gates).
- **book-bestseller-review** = o **juiz**: rubrica de pontuação, fiction/nonfiction, line-copy-editing, pacote comercial. Honesto por design.
- **edicao-kindle** = empacotador EPUB (scripts de build/validação).

---

## 3. Os agentes (escritor, revisor, editor) — a divisão funciona?

A separação de papéis é **fisicamente imposta** (cada agente tem ferramentas limitadas — o editor nem tem como escrever prosa). Isso é design correto e raro.

| Agente | Modelo | Função | Lê o quê | Veredito |
|---|---|---|---|---|
| **contextualizador** | haiku | destila o *digest* do capítulo | Bíblia+Mapa+Estrutura+ledger | economia de contexto — **mas comprime a voz** (ver 4) |
| **escritor** | opus | escreve UM capítulo | **digest + spec + perfil-de-voz** | onde a prosa nasce; só ele escreve |
| **revisor** | sonnet | adversarial, aprova/reprova + edições | capítulo + spec + checklist + ledger | read-only, cirúrgico — bom |
| **editor** | opus→haiku* | orquestra specs/estado, delega | estado + grade | não escreve prosa (proposital) |
| **arquiteto-comercial** | sonnet | audita TRAÇÃO macro nos checkpoints | manuscrito+estado+promessa | "book-review durante a escrita" |

*o pin determinístico (worker) fixou editor=haiku; os agentes da Saga ainda mostram opus — herança que o pin corrige nos projetos do Atelier.

**A divisão é boa.** O problema não é "os papéis não colaboram"; é **o que o escritor recebe** (seção 4).

---

## 4. A causa-raiz (por que ficou "bem escrito e CHATO")

Três emendas furadas, em ordem de importância:

1. **A craft da skill não chegava ao escritor.** O `SKILL.md` do arquiteto **manda** (linha 408) que o `livro-escritor.md` gerado diga: *"Antes de escrever, INVOQUE a skill `skill_escrita` e aplique a técnica dela combinada com o perfil-de-voz."* Mas os agentes gerados (e o prompt do runner) **não carregavam isso de forma confiável** — o escritor lia a fundação, nunca o `voz-e-oficio.md` do Dan Brown. A craft existia, bem escrita, num arquivo que ninguém no caminho de escrita era obrigado a abrir. *(Corrigido recentemente com o bloco CRAFT-SKILL injetado no perfil — mas é um RESUMO da craft, não a skill inteira.)*

2. **A voz é comprimida por um haiku antes de chegar ao escritor.** O escritor trata o **digest** (feito pelo contextualizador, modelo **haiku**) como "fonte de canon". O trabalho do digest é destilar FATOS (relógios, pistas, quem está em cena) — não preservar VOZ. Então o escritor recebe "o que acontece", não "como o Dan Brown escreveria". O perfil-de-voz é input secundário. Resultado: prosa correta e sem alma.

3. **O gate por capítulo mata defeito, não cria craft — e nem converge.** Os gates (cadência, muleta, maneirismo) flagram e cortam tique, mas (a) só removem defeito, não injetam propulsão/montagem; (b) o gate por capítulo flagra mas **não itera até zerar** — a limpeza forte só está no DESMANEIRISMO do fim. "Bem escrito e chato" é a assinatura exata de **remoção de defeito sem injeção de craft**.

---

## 5. A verdade sobre o "1 mês que não funcionou"

O sistema foi engenheirado, com competência, para uma coisa: **impor estrutura e eliminar defeito** (fair-play, anti-repetição, densidade, cadência, verdade do disco, anti-trapaça). Nisso ele funciona — é provavelmente o pipeline de controle de qualidade de livro mais rigoroso que dá para montar.

O que ele **não** foi engenheirado para fazer é **criar prosa viva** — e é isso que você está cobrando, com razão. Um pipeline de portões deixa a prosa *correta*, não *inesquecível*. A peça que deveria dar vida é a **skill de voz** — e era exatamente a emenda que estava solta. Você passou o mês construindo componentes bons e caçando, um a um, os bugs de fiação entre eles. Não foi desperdício: foi a fundação. Mas o salto de "competente" para "Dan Brown de verdade" tem um teto que nenhum gate alcança — parte dele é autoria humana, e parte é a craft chegando inteira (não resumida) à caneta.

---

## 6. Caminho realista (curto)

1. **Regravar o `arquiteto-de-enredo/SKILL.md` limpo** (sem os 3.189 nulls) — destrava poder editar a fundação na origem, em vez de remendar no worker.
2. **Fechar a emenda 1 de verdade:** o escritor deve receber o `voz-e-oficio.md` da skill **na íntegra** (ou trechos-chave), não só o resumo CRAFT-SKILL. A craft tem que chegar inteira.
3. **Resolver a emenda 2:** o digest do contextualizador (haiku) precisa **preservar a craft/voz**, ou o escritor precisa ler a craft por fora do digest. Hoje a voz morre na compressão.
4. **Provar na PÁGINA, não no documento:** toda auditoria daqui pra frente lê prosa gerada e julga contra a craft — nunca mais "PASS" por marcador presente.
5. **Aceitar o teto honestamente:** o sistema te leva a "competente forte"; o "inesquecível" é onde sua autoria entra. Calibrar a expectativa evita o próximo mês de frustração.
