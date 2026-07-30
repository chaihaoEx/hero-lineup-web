import "@testing-library/jest-dom/vitest";
import "fake-indexeddb/auto";
import { webcrypto } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { beforeEach } from "vitest";
import { resetDatabaseForTests } from "../src/storage/database";

Object.defineProperty(globalThis, "crypto", {
  value: {
    subtle: webcrypto.subtle,
    randomUUID: () => webcrypto.randomUUID(),
  },
  configurable: true,
});

Object.defineProperty(window, "confirm", { value: () => true, writable: true });
Object.defineProperty(globalThis, "fetch", {
  value: async (input: string | URL | Request) => {
    const address = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const pathname = new URL(address, "http://localhost").pathname;
    try {
      const body = await readFile(path.resolve(import.meta.dirname, `../public${pathname}`));
      return new Response(body, { status: 200, headers: { "Content-Type": "application/json" } });
    } catch {
      return new Response("not found", { status: 404 });
    }
  },
  configurable: true,
});

beforeEach(async () => {
  localStorage.clear();
  await resetDatabaseForTests();
});
