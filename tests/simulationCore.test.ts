import { describe, expect, it, vi } from "vitest";
import { runSimulation, type SimulationWorkerInput } from "../src/core/simulationCore";
import type { Hero } from "../src/types/domain";

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
