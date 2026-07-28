// Fixtures compartilhadas dos testes do ciclo por capítulo.
//
// Existe porque o ciclo tem papéis demais para cada suíte montar a própria
// resposta "tudo certo" — e uma fixture divergente por arquivo é como um teste
// passa a provar outra coisa do que anuncia.

import { itensExigidos, type ParecerConformidade } from "./conformidade.js";
import type { SceneSpec } from "./tipos.js";

/** A frase mais longa do texto — citação real, que existe mesmo no capítulo. */
export function trechoReal(texto: string): string {
  const frases = texto
    .split(/\n|(?<=[.!?])\s+/)
    .map((f) => f.trim())
    .filter((f) => f.length > 20 && !f.startsWith("#"));
  return frases.sort((a, b) => b.length - a.length)[0] ?? texto.slice(0, 60);
}

/**
 * Parecer de conformidade CONFORME para o par (ficha, texto): declara todos os
 * itens exigidos como cumpridos, citando um trecho que de fato existe no texto.
 */
export function conformidadeOk(ficha: SceneSpec, texto: string): string {
  const trecho = trechoReal(texto);
  const parecer: ParecerConformidade = {
    schema: "conformidade-ficha-prosa/v1",
    afirmacoes: itensExigidos(ficha).map((item) => ({
      item,
      cumprido: true,
      trecho,
      justificativa: `o capítulo entrega "${item}" no trecho citado`,
    })),
  };
  return JSON.stringify(parecer);
}

/** Parecer que reprova UM item — para provar que a conformidade decide. */
export function conformidadeReprovando(ficha: SceneSpec, texto: string, item: string, motivo: string): string {
  const trecho = trechoReal(texto);
  const parecer: ParecerConformidade = {
    schema: "conformidade-ficha-prosa/v1",
    afirmacoes: itensExigidos(ficha).map((i) => ({
      item: i,
      cumprido: i !== item,
      trecho: i === item ? "" : trecho,
      justificativa: i === item ? motivo : `o capítulo entrega "${i}"`,
    })),
  };
  return JSON.stringify(parecer);
}
