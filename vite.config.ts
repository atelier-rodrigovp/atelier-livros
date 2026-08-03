/// <reference types="vitest" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { execFileSync } from "node:child_process";

// De qual commit ESTA interface foi construída. É o que ela pode comparar com o
// SHA que o worker carimba no heartbeat — sem isto, a tela não tem como saber
// que o worker roda código de outro dia. String vazia = git indisponível no
// build, e aí a tela diz que não sabe, em vez de fingir igualdade.
const COMMIT_SHA = (() => {
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  } catch {
    return "";
  }
})();
const BUILD_DIRTY = (() => {
  try {
    return execFileSync("git", ["status", "--porcelain", "--untracked-files=no"], { encoding: "utf8" }).trim().length > 0;
  } catch {
    // Sem git não dá para provar limpeza: fail-closed.
    return true;
  }
})();

export default defineConfig({
  // Em GitHub Pages o site é servido em /atelier-livros/. No Netlify (raiz) fica "/".
  base: process.env.GHPAGES ? "/atelier-livros/" : "/",
  plugins: [react()],
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
  define: {
    __COMMIT_SHA__: JSON.stringify(COMMIT_SHA),
    __BUILD_DIRTY__: JSON.stringify(BUILD_DIRTY),
  },
  test: {
    environment: "jsdom",
    globals: true,
    // Cobre também a lógica pura do worker (ex.: trava antivazamento de capítulos).
    include: ["src/**/*.test.ts", "src/**/*.test.tsx", "worker/src/**/*.test.ts"],
  },
});
