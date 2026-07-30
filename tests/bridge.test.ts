import { describe, expect, it } from "vitest";
import { makeDefaultSystem, makeHero, previewCatalog } from "../src/data/catalog";
import { fromCanonicalSystem, toCanonicalSystem } from "../src/platform/bridge";

describe("canonical desktop adapter", () => {
  it("round-trips every editable UI field without loss", () => {
    const original = makeDefaultSystem(previewCatalog);
    const hero = makeHero(previewCatalog, "knight", 1);
    const quest = previewCatalog.quests[0]!;
    original.heroes = [hero];
    original.taskGroups = [{ id: crypto.randomUUID(), name: "日常冒险", tasks: [{ id: crypto.randomUUID(), questId: quest.id, name: quest.name, map: quest.mapName, difficulty: quest.difficulty, maxMembers: quest.maxMembers, memberIds: [hero.id], barrier: {}, config: { iterations: 10000, seed: 1, booster: false, elite: false, titanTower: false } }] }];
    original.localTag = "收藏";
    original.equipmentOwnedCounts = { hero: { "shortsword_传说": 2, "ember_传说": "" }, champion: { "familiar-a_普通": 1 } };
    hero.rank = 12;
    hero.seed = 87;
    hero.cardLevel = 4;
    hero.equipment[0] = { ...hero.equipment[0]!, itemId: "shortsword", name: "学徒短剑", quality: "传说", shiny: true, transcendence: 3 };
    const task = original.taskGroups[0]!.tasks[0]!;
    task.config = { iterations: 1000, seed: 123456, booster: true, elite: true, titanTower: true };
    task.barrier = { 火: 1500 };
    task.result = { successRate: 88, averageTurns: 7, minTurns: 4, maxTurns: 12, survivalRate: 90,
      averageDamage: 1234, averageRemainingHealth: 567, simulatorVersion: "sim", gameDataVersion: original.gameDataVersion,
      completedAt: "2026-07-22T00:00:00Z", stale: false };

    expect(fromCanonicalSystem(toCanonicalSystem(original))).toEqual(original);
  });

  it("keeps all selected heroes, champions and tasks", () => {
    const original = makeDefaultSystem(previewCatalog);
    const canonical = toCanonicalSystem(original);
    expect(canonical.heroes).toHaveLength(original.heroes.length);
    expect(canonical.champions).toHaveLength(original.championIds.length);
    expect(canonical.adventureTasks).toHaveLength(original.taskGroups.flatMap((group) => group.tasks).length);
  });

  it("round-trips complete champion equipment state", () => {
    const original = makeDefaultSystem(previewCatalog);
    original.championLoadouts.argon = {
      level: 40, rank: 71, seed: 80, cardLevel: 3, titan: true, familiar: "familiar-a", aurasong: "aura-a", stats: { attack: 0, defense: 0, health: 0, evasion: 0, crit: 0 },
      familiarEquipment: { itemId: "familiar-a", quality: "传说", element: "ember", spirit: "behemoth", shiny: true, transcendence: 1 },
      auraSongEquipment: { itemId: "aura-a", quality: "高级", shiny: false, transcendence: 0 },
    };
    expect(fromCanonicalSystem(toCanonicalSystem(original)).championLoadouts.argon).toEqual(original.championLoadouts.argon);
  });

  it("normalizes Rust null defaults and preserves ungrouped desktop tasks", () => {
    const original = makeDefaultSystem(previewCatalog);
    const hero = makeHero(previewCatalog, "knight", 1);
    original.heroes = [hero];
    original.taskGroups = [{
      id: crypto.randomUUID(),
      name: "旧桌面任务",
      tasks: [{
        id: crypto.randomUUID(), questId: "forest01", name: "森林", map: "森林", difficulty: "简单",
        maxMembers: 4, memberIds: [hero.id], barrier: {},
        config: { iterations: 10000, seed: 42, booster: false, elite: false, titanTower: false },
      }],
    }];
    const canonical = toCanonicalSystem(original);
    canonical.heroes[0]!.spritePath = null;
    canonical.heroes[0]!.equipment[0]!.name = null;
    canonical.heroes[0]!.equipment[0]!.element = null;
    canonical.heroes[0]!.equipment[0]!.spirit = null;
    canonical.champions[0]!.classId = null;
    canonical.champions[0]!.spritePath = null;
    canonical.champions[0]!.familiar = null;
    canonical.champions[0]!.auraSong = null;
    canonical.adventureTasks[0]!.groupId = null;
    canonical.adventureTasks[0]!.result = null;
    canonical.groups = [];

    const restored = fromCanonicalSystem(canonical);
    expect(restored.heroes[0]).not.toHaveProperty("spritePath");
    expect(restored.heroes[0]!.equipment[0]).not.toHaveProperty("name");
    expect(restored.heroes[0]!.equipment[0]).not.toHaveProperty("element");
    expect(restored.taskGroups).toHaveLength(1);
    expect(restored.taskGroups[0]!.name).toBe("未分组任务");
    expect(restored.taskGroups[0]!.tasks[0]).not.toHaveProperty("result");
  });
});
