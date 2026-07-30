import type { BuildTemplate, LineupSystem, SimulationResult } from "../types/domain";
import {
  database,
  ensureDatabaseReady,
  type SettingRecord,
  type SimulationHistoryRecord,
} from "./database";

export async function listSystems(): Promise<LineupSystem[]> {
  await ensureDatabaseReady();
  return database.systems.orderBy("updatedAt").reverse().toArray();
}

export async function saveSystem(system: LineupSystem): Promise<LineupSystem> {
  await ensureDatabaseReady();
  await database.systems.put(structuredClone(system));
  return system;
}

export async function deleteSystem(id: string): Promise<void> {
  await ensureDatabaseReady();
  await database.transaction("rw", database.systems, database.simulationHistory, async () => {
    await database.systems.delete(id);
    await database.simulationHistory.where("systemId").equals(id).delete();
  });
}

export async function listTemplates(): Promise<BuildTemplate[]> {
  await ensureDatabaseReady();
  return database.templates.orderBy("updatedAt").reverse().toArray();
}

export async function saveTemplate(template: BuildTemplate): Promise<BuildTemplate> {
  await ensureDatabaseReady();
  await database.templates.put(structuredClone(template));
  return template;
}

export async function deleteTemplate(id: string): Promise<void> {
  await ensureDatabaseReady();
  await database.templates.delete(id);
}

export async function listSettings(): Promise<Record<string, unknown>> {
  await ensureDatabaseReady();
  return Object.fromEntries((await database.settings.toArray()).map(({ key, value }) => [key, value]));
}

export async function saveSetting(key: string, value: unknown): Promise<void> {
  await ensureDatabaseReady();
  await database.settings.put({ key, value });
}

export async function saveSimulationHistory(
  systemId: string,
  taskId: string,
  result: SimulationResult,
): Promise<void> {
  await ensureDatabaseReady();
  const record: SimulationHistoryRecord = {
    id: `${systemId}:${taskId}:${result.completedAt}`,
    systemId,
    taskId,
    gameDataVersion: result.gameDataVersion,
    simulatorVersion: result.simulatorVersion,
    completedAt: result.completedAt,
    result: structuredClone(result),
  };
  await database.simulationHistory.put(record);
}

export interface DatabaseBackup {
  systems: LineupSystem[];
  templates: BuildTemplate[];
  settings: Record<string, unknown>;
}

export async function exportDatabase(): Promise<DatabaseBackup> {
  await ensureDatabaseReady();
  const [systems, templates, settings] = await Promise.all([
    database.systems.toArray(),
    database.templates.toArray(),
    listSettings(),
  ]);
  return { systems, templates, settings };
}

export async function replaceDatabase(backup: DatabaseBackup): Promise<void> {
  await ensureDatabaseReady();
  await database.transaction(
    "rw",
    database.systems,
    database.templates,
    database.settings,
    database.simulationHistory,
    async () => {
      await Promise.all([
        database.systems.clear(),
        database.templates.clear(),
        database.settings.clear(),
        database.simulationHistory.clear(),
      ]);
      if (backup.systems.length) await database.systems.bulkAdd(structuredClone(backup.systems));
      if (backup.templates.length) await database.templates.bulkAdd(structuredClone(backup.templates));
      const settings: SettingRecord[] = Object.entries(backup.settings).map(([key, value]) => ({ key, value }));
      if (settings.length) await database.settings.bulkAdd(settings);
    },
  );
}
