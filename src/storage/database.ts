import Dexie, { type EntityTable } from "dexie";
import type { BuildTemplate, LineupSystem, SimulationResult } from "../types/domain";

export interface SettingRecord {
  key: string;
  value: unknown;
}

export interface MetadataRecord {
  key: string;
  value: unknown;
}

export interface SimulationHistoryRecord {
  id: string;
  systemId: string;
  taskId: string;
  gameDataVersion: string;
  simulatorVersion: string;
  completedAt: string;
  result: SimulationResult;
}

class HeroLineupDatabase extends Dexie {
  systems!: EntityTable<LineupSystem, "id">;
  templates!: EntityTable<BuildTemplate, "id">;
  settings!: EntityTable<SettingRecord, "key">;
  metadata!: EntityTable<MetadataRecord, "key">;
  simulationHistory!: EntityTable<SimulationHistoryRecord, "id">;

  constructor() {
    super("hero-lineup-web");
    this.version(1).stores({
      systems: "id, updatedAt, gameDataVersion",
      templates: "id, classId, updatedAt",
      settings: "key",
      metadata: "key",
      simulationHistory: "id, systemId, taskId, completedAt, gameDataVersion, simulatorVersion",
    });
  }
}

export const database = new HeroLineupDatabase();

const LEGACY_SYSTEMS_KEY = "zys.hero-lineup.systems.v1";
const LEGACY_TEMPLATES_KEY = "zys.hero-lineup.templates.v1";
const LEGACY_MIGRATION_KEY = "legacy-local-storage-v1";

function readLegacy<T>(key: string): T[] {
  if (typeof localStorage === "undefined") return [];
  const value = localStorage.getItem(key);
  if (!value) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? parsed as T[] : [];
  } catch {
    return [];
  }
}

let ready: Promise<void> | undefined;

export function ensureDatabaseReady(): Promise<void> {
  ready ??= database.transaction(
    "rw",
    database.systems,
    database.templates,
    database.metadata,
    async () => {
      if (await database.metadata.get(LEGACY_MIGRATION_KEY)) return;
      const systems = readLegacy<LineupSystem>(LEGACY_SYSTEMS_KEY);
      const templates = readLegacy<BuildTemplate>(LEGACY_TEMPLATES_KEY);
      if (systems.length) await database.systems.bulkPut(systems);
      if (templates.length) await database.templates.bulkPut(templates);
      await database.metadata.put({
        key: LEGACY_MIGRATION_KEY,
        value: { migratedAt: new Date().toISOString(), systems: systems.length, templates: templates.length },
      });
    },
  );
  return ready;
}

export async function resetDatabaseForTests(): Promise<void> {
  database.close();
  await Dexie.delete("hero-lineup-web");
  ready = undefined;
  await database.open();
}
