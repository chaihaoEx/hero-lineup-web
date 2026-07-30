import { describe, expect, it, vi } from "vitest";
import { runAdvancedRetryFixture, runAdvancedSimulationFixture, runSimulation, type AdvancedSimulationFixture, type SimulationWorkerInput } from "../src/core/simulationCore";
import type { Hero } from "../src/types/domain";
import advancedGolden from "./golden/advanced-combat-rules.json";
import retryGolden from "./golden/timekeeper-retry.json";

function fixture(): SimulationWorkerInput {
  const hero: Hero & { classType: string } = {
    id: "fighter-1",
    kind: "hero",
    name: "测试英雄",
    classId: "soldier",
    className: "战士",
    classType: "fighter",
    element: "火",
    level: 40,
    rank: 1,
    seed: 0,
    titan: false,
    cardLevel: 0,
    skills: [],
    equipment: [],
    stats: { health: 1000, attack: 100, defense: 100, evasion: 0, crit: 0, criticalDamage: 200, element: 0 },
  };
  return {
    task: {
      id: "task-1",
      questId: "fixture",
      name: "固定测试",
      map: "测试地图",
      difficulty: "简单",
      maxMembers: 4,
      memberIds: [hero.id],
      barrier: { 火: 50 },
      config: { iterations: 1000, seed: 20260730, booster: false, elite: false, titanTower: false },
      gameDataVersion: "test-data",
    },
    units: [hero],
    quest: {
      id: "fixture",
      name: "固定测试",
      mapName: "测试地图",
      mapKey: "fixture",
      category: "普通冒险",
      difficulty: "简单",
      difficultyLevel: 0,
      isBoss: false,
      maxMembers: 4,
      barrierPower: 50,
      combat: {
        health: 1000,
        attack: 1,
        defense: 0,
        criticalChance: 0,
        criticalDamage: 1.5,
        defenseThreshold: 0,
        areaDamage: 0,
        areaChance: 0,
      },
    },
    modifiers: {},
  };
}

describe("deterministic TypeScript simulator", () => {
  it("matches the Rust advanced combat golden fixture exactly", () => {
    const { battle, combatRules } = advancedGolden.request;
    const rules = combatRules as Array<Record<string, unknown>>;
    const rule = <T extends Record<string, unknown>>(kind: string) =>
      rules.find((entry) => entry.kind === kind) as T | undefined;
    const threat = Object.fromEntries((rules
      .filter((entry) => entry.kind === "threat") as Array<{ fighterId: string; weight: number }>)
      .map((entry) => [entry.fighterId, entry.weight]));
    const regeneration = Object.fromEntries((rules
      .filter((entry) => entry.kind === "regeneration") as Array<{ fighterId: string; health: number }>)
      .map((entry) => [entry.fighterId, entry.health]));
    const fixture: AdvancedSimulationFixture = {
      seed: battle.seed,
      iterations: battle.iterations,
      fighters: battle.party.map((fighter) => ({
        id: fighter.id,
        health: fighter.stats.health,
        attack: fighter.stats.attack,
        defense: fighter.stats.defense,
        evasion: fighter.stats.evasion,
        critical: fighter.stats.criticalChance,
        criticalDamage: fighter.stats.criticalDamage,
        threat: threat[fighter.id] ?? 1,
        regeneration: regeneration[fighter.id] ?? 0,
      })),
      enemy: {
        health: battle.enemy.health,
        attack: battle.enemy.attack,
        defense: battle.enemy.defense,
        evasion: battle.enemy.evasion,
        critical: battle.enemy.criticalChance,
        criticalDamage: battle.enemy.criticalDamage,
        maxRounds: battle.enemy.maxRounds,
      },
      rules: {
        defenseThreshold: rule<{ threshold: number }>("defenseThreshold")!.threshold,
        timedMonsterModifiers: rules.filter((entry) => entry.kind === "timedMonsterModifier").map((entry) => ({
          duration: entry.duration as number,
          damageDelta: entry.damageDelta as number,
          criticalChanceDelta: entry.criticalChanceDelta as number,
        })),
        monsterDamagePerRound: rule<{ delta: number }>("monsterDamagePerRound")!.delta,
        areaAttack: rule<{ chance: number; damageRatio: number }>("areaAttack")!,
        protectorId: rule<{ protectorId: string }>("lordIntercept")!.protectorId,
        openingFocus: Object.fromEntries((rules
          .filter((entry) => entry.kind === "openingFocus") as Array<{ fighterId: string; criticalChance: number; evasion: number; recoverAfterRounds: number }>)
          .map((entry) => [entry.fighterId, {
            criticalChance: entry.criticalChance,
            evasion: entry.evasion,
            recoverAfterRounds: entry.recoverAfterRounds,
          }])),
        berserker: Object.fromEntries((rules
          .filter((entry) => entry.kind === "berserkerStages") as Array<{ fighterId: string; hpThresholds: [number, number, number]; attackPerStage: number; evasionPerStage: number }>)
          .map((entry) => [entry.fighterId, {
            hpThresholds: entry.hpThresholds,
            attackPerStage: entry.attackPerStage,
            evasionPerStage: entry.evasionPerStage,
          }])),
      },
    };

    expect(runAdvancedSimulationFixture(fixture)).toEqual(advancedGolden.expected);
  });

  it("matches Rust retry ordering and combined Timekeeper booster exactly", () => {
    const { battle, combatRules } = advancedGolden.request;
    const rules = combatRules as Array<Record<string, unknown>>;
    const threat = Object.fromEntries((rules
      .filter((entry) => entry.kind === "threat") as Array<{ fighterId: string; weight: number }>)
      .map((entry) => [entry.fighterId, entry.weight]));
    const regeneration = Object.fromEntries((rules
      .filter((entry) => entry.kind === "regeneration") as Array<{ fighterId: string; health: number }>)
      .map((entry) => [entry.fighterId, entry.health]));
    const retryFixture: AdvancedSimulationFixture = {
      seed: battle.seed,
      iterations: battle.iterations,
      fighters: battle.party.map((fighter) => ({
        id: fighter.id,
        health: fighter.stats.health,
        attack: fighter.stats.attack,
        defense: fighter.stats.defense,
        evasion: fighter.stats.evasion,
        critical: fighter.stats.criticalChance,
        criticalDamage: fighter.stats.criticalDamage,
        threat: threat[fighter.id] ?? 1,
        regeneration: regeneration[fighter.id] ?? 0,
      })),
      enemy: {
        health: retryGolden.fixture.enemyHealth,
        attack: battle.enemy.attack,
        defense: battle.enemy.defense,
        evasion: battle.enemy.evasion,
        critical: battle.enemy.criticalChance,
        criticalDamage: battle.enemy.criticalDamage,
        maxRounds: battle.enemy.maxRounds,
      },
      rules: {
        defenseThreshold: (rules.find((entry) => entry.kind === "defenseThreshold") as { threshold: number }).threshold,
        timedMonsterModifiers: rules.filter((entry) => entry.kind === "timedMonsterModifier").map((entry) => ({
          duration: entry.duration as number,
          damageDelta: entry.damageDelta as number,
          criticalChanceDelta: entry.criticalChanceDelta as number,
        })),
        monsterDamagePerRound: (rules.find((entry) => entry.kind === "monsterDamagePerRound") as { delta: number }).delta,
        areaAttack: rules.find((entry) => entry.kind === "areaAttack") as { chance: number; damageRatio: number },
        protectorId: (rules.find((entry) => entry.kind === "lordIntercept") as { protectorId: string }).protectorId,
        openingFocus: Object.fromEntries((rules
          .filter((entry) => entry.kind === "openingFocus") as Array<{ fighterId: string; criticalChance: number; evasion: number; recoverAfterRounds: number }>)
          .map((entry) => [entry.fighterId, {
            criticalChance: entry.criticalChance,
            evasion: entry.evasion,
            recoverAfterRounds: entry.recoverAfterRounds,
          }])),
        berserker: Object.fromEntries((rules
          .filter((entry) => entry.kind === "berserkerStages") as Array<{ fighterId: string; hpThresholds: [number, number, number]; attackPerStage: number; evasionPerStage: number }>)
          .map((entry) => [entry.fighterId, {
            hpThresholds: entry.hpThresholds,
            attackPerStage: entry.attackPerStage,
            evasionPerStage: entry.evasionPerStage,
          }])),
      },
    };

    expect(runAdvancedRetryFixture(retryFixture, retryGolden.fixture.booster)).toEqual(retryGolden.expected);
  });

  it("returns identical results for the same seed and reports batched progress", () => {
    const progress = vi.fn();
    const first = runSimulation(fixture(), progress);
    const second = runSimulation(fixture());

    expect({ ...first, completedAt: "" }).toEqual({ ...second, completedAt: "" });
    expect(progress).toHaveBeenLastCalledWith(1000, 1000);
    expect(progress.mock.calls.length).toBeLessThanOrEqual(100);
    expect(first.simulatorVersion).toBe("hero-simulator-ts-1.0.0");
  });

  it("applies the elemental barrier damage penalty and force override", () => {
    const blocked = runSimulation(fixture());
    const forcedInput = fixture();
    forcedInput.task.config.selectedElement = "force";
    const forced = runSimulation(forcedInput);

    expect(blocked.successRate).toBe(0);
    expect(forced.successRate).toBe(100);
    expect(forced.averageDamage).toBeGreaterThan(blocked.averageDamage);
  });

  it("applies booster and elite/tower modifiers without changing the source units", () => {
    const input = fixture();
    input.task.config.booster = true;
    input.task.config.boosterLevel = 3;
    input.task.config.elite = true;
    input.task.config.eliteKind = "huge";
    input.task.config.towerModifiers = ["tower"];
    input.modifiers.tower = {
      monsterHealth: 0.25, monsterAttack: 0.1, monsterEvasion: 0, monsterCriticalChance: 0,
      monsterCriticalDamage: 0, monsterDamagePerRound: 0, areaChance: 0, areaDamage: 0, duration: 0,
      fighterAttack: 0.2, fighterHealth: 0.1, fighterEvasion: 0, fighterCriticalChance: 0,
      fighterCriticalDamage: 0, regeneration: 0, aggro: 0, tombCurse: 0,
    };
    const original = structuredClone(input.units);
    const result = runSimulation(input);

    expect(input.units).toEqual(original);
    expect(result.iterations).toBe(1000);
    expect(Number.isFinite(result.successRate)).toBe(true);
  });
});
