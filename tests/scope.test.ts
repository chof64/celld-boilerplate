import { readFileSync } from "node:fs";
import { parse } from "jsonc-parser";
import { describe, expect, it } from "vitest";

describe("Hono API-first starter", () => {
  it("keeps HTTP and Durable Objects as the default without mandatory frontend assets", () => {
    const config = parse(readFileSync(new URL("../wrangler.jsonc", import.meta.url), "utf8"));
    expect(config.main).toBe("./celld/index.ts");
    expect(config.assets).toBeUndefined();
    expect(config.durable_objects.bindings).toContainEqual({ name: "ROOM", class_name: "Room" });
  });
});
