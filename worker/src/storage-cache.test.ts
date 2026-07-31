import { describe, expect, it } from "vitest";
import { cacheControlUpload } from "./storage-cache.js";

describe("cache de objetos publicados", () => {
  it("não permite cache de manuscritos mutáveis no mesmo caminho", () => {
    expect(cacheControlUpload("manuscritos")).toBe("0");
  });

  it("mantém cache para artefatos que não são a fonte mutável do Leitor", () => {
    expect(cacheControlUpload("capas")).toBe("3600");
    expect(cacheControlUpload("epubs")).toBe("3600");
    expect(cacheControlUpload("pacotes")).toBe("3600");
  });
});
