import "@testing-library/jest-dom/vitest";
import "fake-indexeddb/auto";
import { webcrypto } from "node:crypto";
import { beforeEach } from "vitest";
import { resetDatabaseForTests } from "../src/storage/database";

Object.defineProperty(globalThis, "crypto", {
  value: {
    subtle: webcrypto.subtle,
    randomUUID: () => `test-${Math.random().toString(16).slice(2)}`,
  },
  configurable: true,
});

Object.defineProperty(window, "confirm", { value: () => true, writable: true });

beforeEach(async () => {
  localStorage.clear();
  await resetDatabaseForTests();
});
