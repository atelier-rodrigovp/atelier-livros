// Sweep: injeta a seção LEXICO-PTBR no perfil-de-voz.md de um projeto (retrofit).
// Idempotente (marcador). Aditivo — não reescreve prosa. Projetos vivos também pegam
// a seção automaticamente no início do próximo escrever_livro (via jobs.ts).
// Uso: [WORK_DIR=<real>] npx tsx worker/scripts/aplicar-lexico-ptbr.ts [<project_id>]
import path from "node:path";
import { normalizarLexicoPtbr } from "../src/lexico-ptbr.js";

const WORK = process.env.WORK_DIR;
const PID = process.argv[2];
if (!WORK || !PID) throw new Error("uso: defina WORK_DIR e informe <project_id>");
const r = await normalizarLexicoPtbr(path.join(WORK, PID));
console.log(`lexico-ptbr: ${PID} → ${r.arquivo} mudou=${r.mudou}`);
