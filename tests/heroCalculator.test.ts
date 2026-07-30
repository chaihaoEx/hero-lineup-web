import { describe, expect, it } from "vitest";
import { calculateHeroSheet } from "../src/core/heroCalculator";
import type { Catalog } from "../src/data/catalog";
import { makeHero, previewCatalog } from "../src/data/catalog";

function exactCatalog(): Catalog {
  return {
    ...previewCatalog,
    classes: [{
      id: "soldier",
      name: "战士",
      type: "fighter",
      skillSlots: 2,
      skillUnlockLevels: [4, 9, 0, 0],
      maxSkillLevel: 3,
      element: "土",
      color: "#9a7a52",
      slots: [["w2"], ["ah"], ["gh"], ["bh"], ["up"], ["xs"]],
      stats: { health: 300, attack: 350, defense: 450, evasion: 0, crit: 5, criticalDamage: 200, aggro: 90 },
      calculation: {
        levelOne: { health: 30, attack: 10, defense: 15 },
        levelFifty: { health: 450, attack: 525, defense: 675 },
      },
    }],
    items: [
      {
        id: "demondualwield", name: "末日碎片", itemType: "w2", multiTypes: ["wa", "wd"], typeName: "双持",
        tier: 16, attack: 1780, critical: 0.05, shinyMultiplier: 1.25, transcendMultiplier: 1.1,
        transcendAttack: 178, transcendCritical: 0.02,
      },
      {
        id: "tombheavyarmor", name: "三叶草护甲衣", itemType: "ah", typeName: "重甲",
        tier: 16, defense: 775, shinyMultiplier: 1.25, transcendMultiplier: 1.1,
        transcendDefense: 194, transcendHealth: 116,
      },
      {
        id: "tombpotion", name: "泰坦药剂", itemType: "up", typeName: "药剂",
        tier: 16, health: 171, shinyMultiplier: 1.25, transcendMultiplier: 1.1,
        transcendHealth: 43, transcendAttack: 86,
      },
    ],
    skills: [],
    equipmentTiers: { 40: 16 },
  };
}

describe("exact browser hero calculator", () => {
  it("matches the captured online T16 legendary/star-forged/transcended totals", () => {
    const catalog = exactCatalog();
    const hero = makeHero(catalog, "soldier", 1);
    hero.level = 40;
    hero.equipment = [
      { slot: "武器", itemId: "demondualwield", quality: "传说", shiny: true, transcendence: 1 },
      { slot: "身体", itemId: "tombheavyarmor", quality: "传说", shiny: true, transcendence: 1 },
      { slot: "脚部", itemId: "tombpotion", quality: "传说", shiny: true, transcendence: 1 },
    ];

    const sheet = calculateHeroSheet(catalog, hero);
    expect(sheet.issues).toEqual([]);
    expect(sheet.stats).toMatchObject({
      attack: 8628,
      defense: 4374,
      health: 1637,
    });
    expect(sheet.stats.critical).toBeCloseTo(12);
  });

  it("applies the archived segmented level curve, uniform seeds and card multiplier", () => {
    const catalog = exactCatalog();
    const hero = makeHero(catalog, "soldier", 1);
    hero.level = 40;
    hero.seed = 3;
    hero.cardLevel = 2;
    hero.equipment = [];

    const sheet = calculateHeroSheet(catalog, hero);
    expect(sheet.stats.health).toBe(Math.round(303 * 1.1));
    expect(sheet.stats.attack).toBe(Math.floor(362 * 1.1));
    expect(sheet.stats.defense).toBe(Math.floor(462 * 1.1));
    expect(sheet.stats.baseDefense).toBeCloseTo(462 * 1.1);
  });

  it("rejects equipment above the hero's current tier curve", () => {
    const catalog = exactCatalog();
    catalog.equipmentTiers = { 1: 1 };
    const hero = makeHero(catalog, "soldier", 1);
    hero.level = 1;
    hero.equipment = [{ slot: "武器", itemId: "demondualwield", quality: "普通", shiny: false, transcendence: 0 }];

    const sheet = calculateHeroSheet(catalog, hero);
    expect(sheet.issues.map(({ code }) => code)).toContain("tier_locked");
    expect(sheet.stats.attack).toBe(10);
  });
});
