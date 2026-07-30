import { describe, expect, it } from "vitest";
import { makeDefaultSystem, previewCatalog } from "../src/data/catalog";
import { database, reopenDatabaseForTests } from "../src/storage/database";
import {
  deleteSystem,
  listSystems,
  listTemplates,
  saveSystem,
  saveTemplate,
  subscribeRepositoryChanges,
} from "../src/storage/repository";

describe("IndexedDB repository", () => {
  it("persists systems and templates", async () => {
    const changes: string[] = [];
    const unsubscribe = subscribeRepositoryChanges((change) => changes.push(`${change.entity}:${change.action}`));
    const system = makeDefaultSystem(previewCatalog);
    await saveSystem(system);
    expect(await listSystems()).toEqual([system]);

    const template = {
      id: crypto.randomUUID(),
      name: "骑士模板",
      classId: "knight",
      build: { kind: "hero" as const, payload: system.heroes[0]! },
      updatedAt: new Date().toISOString(),
    };
    await saveTemplate(template);
    expect(await listTemplates()).toEqual([template]);

    await deleteSystem(system.id);
    expect(await listSystems()).toEqual([]);
    expect(changes).toEqual(["system:save", "template:save", "system:delete"]);
    unsubscribe();
  });

  it("migrates legacy localStorage exactly once across database reopen", async () => {
    const original = makeDefaultSystem(previewCatalog);
    localStorage.setItem("zys.hero-lineup.systems.v1", JSON.stringify([original]));
    expect((await listSystems()).map(({ id }) => id)).toEqual([original.id]);

    await deleteSystem(original.id);
    const lateLegacyValue = makeDefaultSystem(previewCatalog);
    lateLegacyValue.id = crypto.randomUUID();
    localStorage.setItem("zys.hero-lineup.systems.v1", JSON.stringify([lateLegacyValue]));
    await reopenDatabaseForTests();

    expect(await listSystems()).toEqual([]);
    expect(await database.metadata.get("legacy-local-storage-v1")).toMatchObject({
      key: "legacy-local-storage-v1",
      value: { systems: 1 },
    });
  });

  it("persists and reloads one hundred independent systems", async () => {
    const systems = Array.from({ length: 100 }, (_, index) => {
      const system = makeDefaultSystem(previewCatalog);
      system.id = crypto.randomUUID();
      system.name = `批量体系 ${String(index + 1).padStart(3, "0")}`;
      system.updatedAt = new Date(Date.UTC(2026, 0, 1, 0, 0, index)).toISOString();
      return system;
    });
    for (const system of systems) await saveSystem(system);
    await reopenDatabaseForTests();

    const loaded = await listSystems();
    expect(loaded).toHaveLength(100);
    expect(new Set(loaded.map(({ id }) => id))).toEqual(new Set(systems.map(({ id }) => id)));
  });
});
