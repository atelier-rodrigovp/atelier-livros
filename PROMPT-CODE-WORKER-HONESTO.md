# Prompt para o Claude Code — Worker: UI honesta (modo manual)

Cole no Claude Code na raiz do `ATELIER-LIVROS`. **Substitui a seção 3 (Configurações/Worker) do PROMPT-CODE-FINAL.md.** Só mexe em `src/pages/Configuracoes.tsx` (e copy). Ao final: `npm run build` limpo, testes ok, commit + push, screenshot Playwright.

## Problema
O botão "Ligar produção" grava `worker_control.enabled=true` no banco, mas **não inicia o processo do worker** — uma página web não pode iniciar um processo morto na máquina. Com o worker **Parado**, clicar não faz nada → parece quebrado. Decisão do produto: **manter o worker manual** (iniciado uma vez na máquina) e deixar a interface **honesta**, sem fingir que liga.

## O que implementar (Configurações → bloco Worker)

Separar visualmente **dois conceitos distintos**, nunca mistura-los num botão só:

### A) Worker (o processo na máquina) — só status, não é controlável pelo app
- Indicador grande: **Produzindo** (verde, pulsante) · **Pausado** (âmbar) · **Parado** (cinza) + "último sinal …" (heartbeat).
- Quando **Parado**: frase curta e honesta — *"O worker não está em execução nesta máquina. O app só controla a produção quando ele está rodando."*
- Um disclosure discreto **"Como iniciar o worker"** (um `<details>`/accordion fechado por padrão, **não** um aviso amarelo grande) que, ao abrir, mostra **uma linha**: rodar o worker uma vez na máquina (ex.: `npm run dev` na pasta `worker/`). É a única menção a comando em toda a UI, e fica escondida até o usuário pedir.

### B) Produção (a fila de jobs) — isto sim o app controla, via `worker_control.enabled`
- Botão **"Ligar produção" / "Desligar produção"** (reflete `enabled`, ação oposta visível).
- **Quando o worker está Parado (offline): desabilite este botão** (estilo disabled + `cursor-not-allowed`) com tooltip/legenda: *"Disponível quando o worker estiver em execução."* Assim ninguém clica num botão que não faz nada.
- Quando o worker está **online**: o botão funciona normalmente (Ligar → começa a processar a fila; Desligar → pausa, worker fica ocioso mas vivo). Otimista + toast, como já é.
- Mantenha "Rodar teste (ping)" — mas também **desabilitado quando Parado** (não há quem processe o ping), com a mesma legenda.

### Resumo do comportamento por estado
- **Parado:** status cinza + frase honesta + "Como iniciar" (oculto); botões de produção e ping **desabilitados**. Nada de "Ligar produção" clicável que não liga.
- **Pausado (online, enabled=false):** botão "Ligar produção" ativo; status âmbar.
- **Produzindo (online, enabled=true):** botão "Desligar produção" ativo; status verde pulsante.

Mantenha a seção "Atividade" (histórico de jobs). Sem `.bat`, sem atalho, sem aviso amarelo de terminal — só o disclosure mínimo.

## Aceite (screenshot Playwright)
- [ ] Worker (status) e Produção (fila) são blocos visualmente separados.
- [ ] Com worker Parado: botões de produção e ping desabilitados, com legenda clara; "Como iniciar" é um disclosure fechado (uma linha).
- [ ] Com worker online: Ligar/Desligar produção funciona e alterna corretamente.
- [ ] Build limpo, testes ok, commit + push, bundle novo servindo.

**Não faça:** prometer que o app inicia o worker; aviso amarelo grande de terminal; mudar o worker (`worker/`); libs novas.
