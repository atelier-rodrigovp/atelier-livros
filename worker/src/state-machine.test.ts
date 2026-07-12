import { describe, expect, it } from "vitest";
import { advanceEditionStatus } from "./state-machine.js";

describe("máquina de estado da edição", () => {
  it("não rebaixa pronto", () => expect(advanceEditionStatus("pronto", "pendente")).toBe("pronto"));
  it("avança pendente para revisão", () => expect(advanceEditionStatus("pendente", "revisao")).toBe("revisao"));
  it("representa escrita sem confundir com pronto", () => expect(advanceEditionStatus("pendente", "escrevendo")).toBe("escrevendo"));
  it("proíbe pronto fora do gate", () => expect(() => advanceEditionStatus("revisao", "pronto")).toThrow("gate transacional"));
  it("permite pronto somente com prova do gate", () => expect(advanceEditionStatus("revisao", "pronto", true)).toBe("pronto"));
});
