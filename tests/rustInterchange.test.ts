import { expect, it } from "vitest";
import { decodeBackup, decodeLineup, encodeBackup, encodeLineup, webVersions } from "../src/core/interchange";
import { rustBackupJson, rustLineupJson } from "../src/core/rustJson";
import { makeDefaultSystem, makeHero, previewCatalog } from "../src/data/catalog";
import { toCanonicalSystem } from "../src/platform/bridge";

it("emits the exact checksum accepted by the Rust desktop decoder", async () => {
  const system = makeDefaultSystem(previewCatalog);
  const hero = makeHero(previewCatalog, "knight", 1);
  system.id = "10000000-0000-4000-8000-000000000001";
  system.createdAt = "2026-07-30T00:00:00.000Z";
  system.updatedAt = "2026-07-30T01:02:03.000Z";
  hero.id = "20000000-0000-4000-8000-000000000002";
  hero.level = 40;
  hero.rank = 16;
  hero.seed = 80;
  hero.cardLevel = 3;
  hero.skills = ["p_cleave1"];
  hero.equipment[0] = {
    ...hero.equipment[0]!,
    itemId: "shortsword",
    name: "学徒短剑",
    quality: "传说",
    shiny: true,
    transcendence: 1,
    element: "ember",
    spirit: "behemoth",
  };
  system.heroes = [hero];
  system.taskGroups = [{
    id: "30000000-0000-4000-8000-000000000003",
    name: "兼容性任务",
    tasks: [{
      id: "40000000-0000-4000-8000-000000000004",
      questId: "forest01",
      name: "咆哮森林",
      map: "咆哮森林",
      difficulty: "简单",
      maxMembers: 4,
      memberIds: [hero.id, "argon"],
      barrier: { 火: 50 },
      config: {
        iterations: 1000,
        seed: 42,
        booster: true,
        boosterLevel: 2,
        elite: false,
        titanTower: false,
        towerModifiers: ["modifier-a"],
        towerModifierElements: { "modifier-a": "fire" },
      },
      result: {
        seed: 42,
        iterations: 1000,
        successRate: 88.5,
        averageTurns: 7,
        minTurns: 4,
        maxTurns: 12,
        survivalRate: 90,
        averageDamage: 1234.5,
        averageRemainingHealth: 567,
        simulatorVersion: "hero-simulator-ts-1.0.0",
        gameDataVersion: system.gameDataVersion,
        completedAt: "2026-07-30T01:00:00.000Z",
        stale: false,
      },
    }],
  }];
  const canonical = toCanonicalSystem(system);
  const payload = await encodeLineup(canonical, webVersions(system.gameDataVersion));
  const envelope = JSON.parse(payload) as { checksumSha256: string; payload: unknown };

  expect(envelope.checksumSha256).toBe("f02ea7499116bb538f96f01e32dd6a3e628cfce2c02fffb3acf4a0a26426d906");
  expect((await decodeLineup(payload)).system).toEqual(canonical);
  envelope.payload = JSON.parse(rustLineupJson(canonical));
  expect((await decodeLineup(JSON.stringify(envelope))).system.name).toBe("默认体系");
});

it("emits a full backup checksum accepted by the Rust desktop decoder", async () => {
  const system = makeDefaultSystem(previewCatalog);
  system.id = "10000000-0000-4000-8000-000000000001";
  system.createdAt = "2026-07-30T00:00:00.000Z";
  system.updatedAt = "2026-07-30T01:02:03.000Z";
  const backup = {
    systems: [toCanonicalSystem(system)],
    templates: [{
      id: "50000000-0000-4000-8000-000000000005",
      name: "Rust 兼容模板",
      build: { kind: "champion-loadout" as const, payload: {
        level: 40, rank: 11, seed: 80, cardLevel: 3, titan: true,
        familiar: "familiar-a", aurasong: "aura-a",
        stats: { attack: 1, defense: 2, health: 3, evasion: 4, crit: 5 },
      } },
      updatedAt: "2026-07-30T01:00:00.000Z",
    }],
    settings: { theme: "light", nested: { enabled: true, count: 2 } },
  };
  const payload = await encodeBackup(backup, webVersions(system.gameDataVersion));
  const envelope = JSON.parse(payload) as { checksumSha256: string; payload: unknown };

  expect(envelope.checksumSha256).toBe("7f67c1469ac9a133e3f8876e1e79b621b394d9a3fc5c05ec8cc35a781a05a48f");
  expect((await decodeBackup(payload)).backup).toEqual(backup);
  envelope.payload = JSON.parse(rustBackupJson(backup));
  expect((await decodeBackup(JSON.stringify(envelope))).backup.templates[0]!.name).toBe("Rust 兼容模板");
});
