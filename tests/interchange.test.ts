import { describe, expect, it } from "vitest";
import { decodeBackup, decodeLineup, encodeBackup, encodeLineup, webVersions } from "../src/core/interchange";
import { makeDefaultSystem, previewCatalog } from "../src/data/catalog";
import { fromCanonicalSystem, toCanonicalSystem } from "../src/platform/bridge";
import {
  exportDatabase,
  listSystems,
  listTemplates,
  replaceDatabase,
  saveSystem,
  saveTemplate,
} from "../src/storage/repository";

describe("portable interchange", () => {
  it("round-trips a lineup with versions and a SHA-256 checksum", async () => {
    const system = makeDefaultSystem(previewCatalog);
    const canonical = toCanonicalSystem(system);
    const versions = webVersions(system.gameDataVersion, "test-assets");
    const encoded = await encodeLineup(canonical, versions);
    const decoded = await decodeLineup(encoded);

    expect(decoded.versions).toEqual(versions);
    expect(fromCanonicalSystem(decoded.system)).toEqual(system);
    const envelope = JSON.parse(encoded) as { checksumSha256: string };
    expect(envelope.checksumSha256).toMatch(/^[a-f0-9]{64}$/);
  });

  it("rejects a modified payload whose checksum no longer matches", async () => {
    const system = makeDefaultSystem(previewCatalog);
    const encoded = await encodeLineup(toCanonicalSystem(system), webVersions(system.gameDataVersion));
    const envelope = JSON.parse(encoded) as { payload: { name: string } };
    envelope.payload.name = "被篡改的体系";

    await expect(decodeLineup(JSON.stringify(envelope))).rejects.toThrow("checksum 校验失败");
  });

  it("round-trips backup content and replaces IndexedDB in one operation", async () => {
    const oldSystem = makeDefaultSystem(previewCatalog);
    await saveSystem(oldSystem);
    const template = {
      id: crypto.randomUUID(),
      name: "离线模板",
      classId: "knight",
      build: { kind: "hero" as const, payload: oldSystem.heroes[0]! },
      updatedAt: new Date().toISOString(),
    };
    await saveTemplate(template);

    const backup = await exportDatabase();
    const encoded = await encodeBackup({
      systems: backup.systems.map(toCanonicalSystem),
      templates: backup.templates,
      settings: backup.settings,
    }, webVersions(oldSystem.gameDataVersion));
    const decoded = await decodeBackup(encoded);

    const replacement = makeDefaultSystem(previewCatalog);
    replacement.id = "replacement";
    replacement.name = "替换前数据";
    await replaceDatabase({ systems: [replacement], templates: [], settings: {} });
    expect((await listSystems()).map(({ id }) => id)).toEqual(["replacement"]);

    await replaceDatabase({
      systems: decoded.backup.systems.map(fromCanonicalSystem),
      templates: decoded.backup.templates,
      settings: decoded.backup.settings,
    });
    expect(await listSystems()).toEqual([oldSystem]);
    expect(await listTemplates()).toEqual([template]);
  });
});
