import { readFile } from "node:fs/promises";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { loadBrowserCatalog } from "../src/data/browserCatalog";

const localFetch = (mutateManifest: (manifest: Record<string, unknown>) => void) =>
  vi.fn(async (input: string | URL | Request) => {
    const address = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const pathname = new URL(address, "http://localhost").pathname;
    try {
      const body = await readFile(path.resolve(import.meta.dirname, `../public${pathname}`));
      if (pathname === "/content/manifest.json") {
        const manifest = JSON.parse(body.toString("utf8")) as Record<string, unknown>;
        mutateManifest(manifest);
        return new Response(JSON.stringify(manifest), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      return new Response(body, { status: 200, headers: { "Content-Type": "application/json" } });
    } catch {
      return new Response("not found", { status: 404 });
    }
  });

describe("browser catalog manifest gates", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("rejects an unsupported content schema before constructing the catalog", async () => {
    vi.stubGlobal("fetch", localFetch((manifest) => { manifest.schemaVersion = 99; }));
    await expect(loadBrowserCatalog()).rejects.toThrow("不支持的本地数据 schema");
  });

  it("rejects a manifest whose declared catalog count is stale", async () => {
    vi.stubGlobal("fetch", localFetch((manifest) => {
      (manifest.statistics as Record<string, unknown>).classes = 41;
    }));
    await expect(loadBrowserCatalog()).rejects.toThrow("classes 期望 41，实际 42");
  });
});
