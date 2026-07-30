import { afterEach, describe, expect, it, vi } from "vitest";
import type { SimulationWorkerInput } from "../src/core/simulationCore";
import type { SimulationResult } from "../src/types/domain";
import { SimulationQueue } from "../src/workers/simulationQueue";

class FakeWorker {
  static instances: FakeWorker[] = [];
  readonly messages: unknown[] = [];
  terminated = false;
  private listeners = new Map<string, Array<(event: never) => void>>();

  constructor() {
    FakeWorker.instances.push(this);
  }

  addEventListener(type: string, listener: (event: never) => void): void {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
  }

  postMessage(message: unknown): void {
    this.messages.push(message);
  }

  terminate(): void {
    this.terminated = true;
  }

  reply(data: unknown): void {
    for (const listener of this.listeners.get("message") ?? []) listener({ data } as never);
  }
}

const result: SimulationResult = {
  seed: 1,
  iterations: 1000,
  successRate: 100,
  averageTurns: 1,
  minTurns: 1,
  maxTurns: 1,
  survivalRate: 100,
  averageDamage: 1,
  averageRemainingHealth: 1,
  simulatorVersion: "test",
  gameDataVersion: "test",
  completedAt: "2026-07-30T00:00:00Z",
  stale: false,
};

const input = (taskId: string): SimulationWorkerInput => ({
  task: {
    id: taskId,
    questId: "forest01",
    name: "测试",
    map: "森林",
    difficulty: "简单",
    maxMembers: 4,
    memberIds: ["hero-1"],
    barrier: {},
    config: { iterations: 1000, seed: 1, booster: false, elite: false, titanTower: false },
  },
  units: [{
    id: "hero-1",
    kind: "hero",
    name: "英雄",
    classId: "knight",
    className: "骑士",
    element: "光",
    level: 40,
    rank: 1,
    seed: 0,
    titan: false,
    cardLevel: 0,
    skills: [],
    equipment: [],
    stats: { attack: 1, defense: 1, health: 1, evasion: 0, crit: 0 },
  }],
  modifiers: {},
});

describe("single Web Worker simulation queue", () => {
  const originalWorker = globalThis.Worker;

  afterEach(() => {
    FakeWorker.instances = [];
    Object.defineProperty(globalThis, "Worker", { value: originalWorker, configurable: true, writable: true });
  });

  it("runs only one worker, starts the next job after completion, and cancels cleanly", async () => {
    Object.defineProperty(globalThis, "Worker", { value: FakeWorker, configurable: true, writable: true });
    const queue = new SimulationQueue();
    const firstProgress = vi.fn();
    const secondProgress = vi.fn();
    const firstAbort = new AbortController();
    const secondAbort = new AbortController();
    const first = queue.enqueue("task-1", input("task-1"), firstProgress, firstAbort.signal);
    const second = queue.enqueue("task-2", input("task-2"), secondProgress, secondAbort.signal);

    expect(FakeWorker.instances).toHaveLength(1);
    expect(secondProgress).toHaveBeenCalledWith({ taskId: "task-2", completed: 0, total: 1000, phase: "queued" });
    const firstRequest = FakeWorker.instances[0]!.messages[0] as { requestId: string };
    FakeWorker.instances[0]!.reply({ type: "complete", requestId: firstRequest.requestId, result });
    await expect(first).resolves.toEqual(result);
    expect(FakeWorker.instances).toHaveLength(2);
    expect(FakeWorker.instances[0]!.terminated).toBe(true);

    const rejected = expect(second).rejects.toMatchObject({ name: "AbortError" });
    secondAbort.abort();
    await rejected;
    expect(FakeWorker.instances[1]!.terminated).toBe(true);
  });
});
