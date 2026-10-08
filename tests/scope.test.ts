import { readFileSync } from "node:fs";
import { parse } from "jsonc-parser";
import { describe, expect, it } from "vitest";

describe("Hono backend starter", () => {
  it("keeps the HTTP and Durable Object entry without frontend assets", () => {
    const config = parse(readFileSync(new URL("../wrangler.jsonc", import.meta.url), "utf8"));
    expect(config.main).toBe("./celld/index.ts");
    expect(config.assets).toBeUndefined();
    expect(config.durable_objects.bindings).toContainEqual({ name: "ROOM", class_name: "Room" });
  });
});
