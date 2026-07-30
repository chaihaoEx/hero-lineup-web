import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { loadBrowserCatalog } from "../src/data/browserCatalog";
import { catalogChampions, makeHero } from "../src/data/catalog";
import { calculateHeroSheet } from "../src/core/heroCalculator";
import { calculateChampionPreview } from "../src/data/championPreview";

beforeAll(() => {
  vi.stubGlobal("fetch", async (input: string | URL | Request) => {
    const address = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const pathname = new URL(address, "http://localhost").pathname;
    try {
      const body = await readFile(path.resolve(import.meta.dirname, `../public${pathname}`));
      return new Response(body, { status: 200, headers: { "Content-Type": "application/json" } });
    } catch {
      return new Response("not found", { status: 404 });
    }
  });
});

afterAll(() => {
  vi.unstubAllGlobals();
});

describe("Rust catalog golden parity", () => {
  it("matches the bundled knight and Argon sheet fixture exactly", async () => {
    const catalog = await loadBrowserCatalog();
    const knight = {
      ...makeHero(catalog, "knight", 1),
      name: "金装测试",
      level: 40,
      rank: 1,
      seed: 0,
      cardLevel: 0,
      skills: [],
      equipment: [
        { slot: "武器" as const, itemId: "pike", quality: "普通" as const, shiny: false, transcendence: 0 },
        { slot: "身体" as const, itemId: "breastplate", quality: "普通" as const, shiny: false, transcendence: 0 },
        { slot: "手部" as const, itemId: "knightgauntlets", quality: "普通" as const, shiny: false, transcendence: 0 },
        { slot: "头部" as const, itemId: "knighthelm", quality: "普通" as const, shiny: false, transcendence: 0 },
        { slot: "脚部" as const, itemId: "knightboots", quality: "普通" as const, shiny: false, transcendence: 0 },
        { slot: "饰品" as const, itemId: "oakshield", quality: "普通" as const, shiny: false, transcendence: 0 },
      ],
    };
    const argon = catalogChampions(catalog).find((champion) => champion.id === "argon")!;

    expect(calculateHeroSheet(catalog, knight)).toMatchObject({
      issues: [],
      stats: {
        health: 420,
        attack: 560,
        defense: 1014,
        baseDefense: 1014,
        evasion: 0,
        critical: 5,
        criticalDamage: 2,
        aggro: 90,
        elementValue: 0,
        regeneration: 0,
      },
    });
    expect(calculateChampionPreview(catalog, argon, {
      level: 40,
      rank: 11,
      seed: 0,
      cardLevel: 0,
      titan: false,
      familiar: "troblin",
      aurasong: "t3aura",
      familiarEquipment: { itemId: "troblin", quality: "普通", shiny: false, transcendence: 0 },
      auraSongEquipment: { itemId: "t3aura", quality: "优质", shiny: false, transcendence: 0 },
    })).toMatchObject({
      issues: [],
      stats: {
        health: 742,
        attack: 3211,
        defense: 4441,
        baseDefense: 4441,
        evasion: 0,
        critical: 5,
        criticalDamage: 2,
        aggro: 90,
        elementValue: 80,
        regeneration: 0,
      },
    });
  });
});
