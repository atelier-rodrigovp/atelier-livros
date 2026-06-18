import { z } from "zod";
import { IDIOMAS } from "./types";

// FASE 0: criação mínima de projeto pelo painel (wizard completo do briefing = FASE 1).
export const novoProjetoSchema = z.object({
  titulo: z.string().trim().min(2, "Título muito curto").max(160),
  genero: z.string().trim().max(80).optional().or(z.literal("")),
  idioma_origem: z.enum(IDIOMAS).default("pt-BR"),
  paginas_alvo: z.coerce.number().int().positive().max(2000).optional(),
  total_capitulos: z.coerce.number().int().positive().max(200).optional(),
  piso_palavras: z.coerce.number().int().min(200).max(20000).default(1400),
  meta_nota: z.coerce.number().min(0).max(10).default(9.0),
});

export type NovoProjeto = z.infer<typeof novoProjetoSchema>;

export const loginSchema = z.object({
  email: z.string().trim().email("E-mail inválido"),
  senha: z.string().min(1, "Informe a senha"),
});
export type LoginInput = z.infer<typeof loginSchema>;
