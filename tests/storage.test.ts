import { describe, expect, it } from "vitest";
import { makeDefaultSystem, previewCatalog } from "../src/data/catalog";
import {
  deleteSystem,
  listSystems,
  listTemplates,
  saveSystem,
  saveTemplate,
} from "../src/storage/repository";

describe("IndexedDB repository", () => {
  it("persists systems and templates", async () => {
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
  });
});
