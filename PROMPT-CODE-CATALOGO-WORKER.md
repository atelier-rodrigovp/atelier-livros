# Prompt para o Claude Code — Catálogo + controle do Worker pela interface

Cole no Claude Code na raiz do repositório `ATELIER-LIVROS`. Stack: React + Vite + TS, shadcn/ui, Tailwind, Supabase; worker TS local em `worker/`. Deploy em GitHub Pages.

**Antes de tudo:** rode `git status`. Se algum de `src/pages/{Dashboard,Configuracoes,Projeto}.tsx` ou `src/lib/status.ts` estiver modificado e incompleto/truncado (sessão anterior interrompida), restaure a versão íntegra do commit com `git show HEAD:<arquivo> > <arquivo>` (não use `git checkout` — o filesystem pode bloquear o unlink). Ao final: `npm run build` limpo, depois `git commit` + `git push` (dispara o deploy do GitHub Pages).

---

## 1) Catálogo (`src/pages/Catalogo.tsx`) — capas repetidas

Problema: o mesmo livro aparece em duas prateleiras; capas sem arte viram ícone cinza quebrado; volumes de uma trilogia têm título idêntico truncado.

- **Cada edição aparece UMA vez.** Sem prateleiras sobrepostas. Agrupar por `serie` (saga junta, volumes ordenados por `volume`); livros sem série em "Livros avulsos".
- **Capa de fallback tipográfica** quando não há arte: gradiente com cor determinística (hash do título), título em `font-serif` branco, rótulo "Vol. N"/"Série"/"Livro" e um traço decorativo — parece intencional, nunca quebrado.
- **Diferenciar volumes:** selo "Vol. N" sobre a capa; título abaixo da capa.
- **Busca** por título/série + filtros (idioma, status) como chips. Incluir `volume` no `select` de `projects`. `loading="lazy"`, cache das URLs assinadas, `alt` descritivo, responsivo.

(Já há uma versão dessa reescrita aplicada no arquivo — revise, mantenha o que estiver correto e garanta o build.)

## 2) Worker — controle 100% na interface, sem terminal nem atalho

Decisão de produto: **todo o controle do worker vive no app**. Nada de instruções de terminal, `.bat` ou atalho do Windows na UI — remova qualquer texto desse tipo de `src/pages/Configuracoes.tsx`.

O backend já suporta isso: o worker faz `heartbeat` a cada 30s e lê `worker_control.enabled` (quando `false`, ele **fica ocioso mas continua vivo e batendo heartbeat**). Então o app controla tudo via Supabase.

Implemente em **Configurações** um painel de Worker enxuto:

- **Botão primário grande "Ligar produção" / "Desligar produção"** (substitui o Switch atual), gravando `worker_control.enabled` em `worker_control`. "Desligar" **pausa** (worker fica ocioso, não mata o processo); "Ligar" retoma. Otimista + toast, como já está.
- **Indicador de estado** com base no heartbeat (`workerOnline`, já existe):
  - heartbeat recente + `enabled` → **"Produzindo"** (verde).
  - heartbeat recente + `!enabled` → **"Pausado"** (âmbar).
  - sem heartbeat recente → **"Parado"** (cinza), com a frase: *"O worker não está em execução nesta máquina."*
- **Botão "Rodar teste (ping)"** continua.
- Garanta que o worker (`worker/src/index.ts`) **mande heartbeat mesmo quando `enabled=false`** (hoje ele já bate em vários estados — confirme que no estado pausado o heartbeat segue saindo a cada 30s, para o app mostrar "Pausado" e não "Parado").

### Limitação real a deixar explícita (uma frase na UI, sem terminal)
Uma página no navegador **não consegue iniciar um processo morto** na máquina — é barreira do próprio navegador, não dá para "ignorar". Por isso o worker deve rodar de forma **residente**: uma vez em execução, **liga/desliga/pausa e status passam a ser 100% pelo app** (via `worker_control`), e ele nunca mais precisa de terminal. Quando o estado for "Parado", mostre só: *"Inicie o worker uma vez para que o app passe a controlá-lo."* — sem comandos.

### Opcional (já que não há preocupação com segurança)
Para controle local direto, o worker pode subir um pequeno servidor HTTP em `localhost` (ex.: `/status`, `/pause`, `/resume`) e o app, quando servido em `http://localhost`, chamá-lo. Atenção: a partir do GitHub Pages (https) o navegador bloqueia chamada a `http://localhost` (mixed content) — por isso **o canal de controle padrão deve continuar sendo o Supabase** (`worker_control`), que funciona de qualquer origem. Só implemente o servidor local se for rodar o app localmente.

## 3) Aceite

- [ ] Catálogo sem itens repetidos; saga por volume; capas de fallback tipográficas; busca + filtros.
- [ ] Configurações sem qualquer instrução de terminal/`.bat`/atalho.
- [ ] Botão Ligar/Desligar produção controla `worker_control.enabled`; estados Produzindo/Pausado/Parado corretos.
- [ ] Worker bate heartbeat também quando pausado (mostra "Pausado", não "Parado").
- [ ] `npm run build` limpo; commit + push feitos.

**Não faça:** migração de dados (saga continua N projetos, agrupamento só na UI); não adicione libs novas pesadas (use shadcn/ui + Tailwind).
