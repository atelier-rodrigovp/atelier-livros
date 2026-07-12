import { describe, expect, it } from "vitest";
import { classifyRunnerOutcome } from "./runner-outcome.js";

describe("runner outcome", () => {
  it("aceita somente rc zero", () => expect(classifyRunnerOutcome({ code: 0 }).kind).toBe("ok"));
  it("classifica timeout", () => expect(classifyRunnerOutcome({ code: 124, err: "timeout" }).kind).toBe("timeout"));
  it("classifica processo morto sem rc", () => expect(classifyRunnerOutcome({ code: -1 }).kind).toBe("no_exit_code"));
  it("classifica rc não-zero", () => expect(classifyRunnerOutcome({ code: 1, err: "boom" })).toMatchObject({ kind: "failed", message: expect.stringContaining("rc=1") }));
});
