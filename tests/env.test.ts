import { describe, expect, it } from "vitest";
import { selectWorkerEnvironment, serializeDevVars } from "../scripts/env";

describe("Worker variable boundary", () => {
  it("does not expose infrastructure secrets", () => {
    expect(selectWorkerEnvironment({ GREETING: "hello", CELLD_BUCKET: "private", AWS_SECRET_ACCESS_KEY: "no" })).toEqual({ GREETING: "hello" });
  });
  it("writes a deterministic vars file", () => {
    expect(serializeDevVars({ GREETING: "Hello" })).toBe('GREETING="Hello"\n');
  });
  it("rejects multiline vars", () => {
    expect(() => serializeDevVars({ GREETING: "a\nb" })).toThrow("newline");
  });
});
