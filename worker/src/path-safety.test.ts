import { describe, expect, it } from "vitest";
import path from "node:path";
import { assertSafeSegment, safeResolveWithin } from "./path-safety.js";

describe("path safety", () => {
  it("mantém projeto dentro do WORK_DIR", () => expect(safeResolveWithin("C:/work", "abc-123")).toBe(path.resolve("C:/work", "abc-123")));
  for (const bad of ["..", ".", "../fora", "a/b", "a\\b", "\0"])
    it(`rejeita ${JSON.stringify(bad)}`, () => expect(() => assertSafeSegment(bad)).toThrow("inseguro"));
});
