import { describe, expect, it } from "vitest";
import { mdToHtml, primeiroTitulo } from "./reader";

describe("mdToHtml", () => {
  it("agrupa linhas em parágrafos e separa por linha em branco", () => {
    expect(mdToHtml("uma\nfrase\n\noutra")).toBe("<p>uma frase</p>\n<p>outra</p>");
  });

  it("renderiza títulos por nível", () => {
    expect(mdToHtml("# Capítulo 1")).toBe("<h1>Capítulo 1</h1>");
    expect(mdToHtml("### sub")).toBe("<h3>sub</h3>");
  });

  it("aplica ênfase negrito e itálico", () => {
    expect(mdToHtml("um **forte** e *suave*")).toBe(
      "<p>um <strong>forte</strong> e <em>suave</em></p>"
    );
  });

  it("trata separador de cena", () => {
    expect(mdToHtml("a\n\n---\n\nb")).toBe('<p>a</p>\n<hr class="cena" />\n<p>b</p>');
  });

  it("agrupa citações consecutivas", () => {
    expect(mdToHtml("> linha um\n> linha dois")).toBe(
      "<blockquote>linha um linha dois</blockquote>"
    );
  });

  it("escapa HTML para evitar injeção", () => {
    expect(mdToHtml("a <script>x</script>")).toBe(
      "<p>a &lt;script&gt;x&lt;/script&gt;</p>"
    );
  });

  it("primeiroTitulo extrai o primeiro heading", () => {
    expect(primeiroTitulo("# Capítulo 7 — A Fenda\n\ntexto")).toBe("Capítulo 7 — A Fenda");
    expect(primeiroTitulo("sem título")).toBeNull();
  });
});
