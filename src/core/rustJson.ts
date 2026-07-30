import type {
  BuildTemplate,
  CanonicalEquipment,
  CanonicalHero,
  CanonicalSystem,
  CanonicalTask,
  SimulationConfig,
  UnitStats,
} from "../types/domain";

type BackupPayload = {
  systems: CanonicalSystem[];
  templates: BuildTemplate[];
  settings: Record<string, unknown>;
};

const string = (value: string): string => JSON.stringify(value);
const integer = (value: number): string => String(Math.trunc(value));
const boolean = (value: boolean): string => value ? "true" : "false";
const optionalString = (value: string | undefined | null): string => value == null ? "null" : string(value);
const text = (value: unknown, fallback: string): string => typeof value === "string" ? value : fallback;
const dateTime = (value: string): string => string(value.endsWith(".000Z") ? `${value.slice(0, -5)}Z` : value);

function float(value: number): string {
  if (!Number.isFinite(value)) throw new Error("Rust 兼容 checksum 不支持非有限浮点数");
  if (Object.is(value, -0)) return "-0.0";
  return Number.isInteger(value) ? `${value}.0` : JSON.stringify(value);
}

const array = <T>(values: T[], encode: (value: T) => string): string =>
  `[${values.map(encode).join(",")}]`;
const object = (entries: Array<[string, string]>): string =>
  `{${entries.map(([key, value]) => `${string(key)}:${value}`).join(",")}}`;

function jsonValue(value: unknown): string {
  if (value === null || value === undefined) return "null";
  if (typeof value === "string") return string(value);
  if (typeof value === "boolean") return boolean(value);
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("checksum 内容包含非有限数字");
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return array(value, jsonValue);
  if (typeof value === "object") {
    return object(Object.entries(value as Record<string, unknown>)
      .filter(([, entry]) => entry !== undefined)
      .map(([key, entry]) => [key, jsonValue(entry)]));
  }
  throw new Error(`checksum 内容包含不支持的 ${typeof value}`);
}

function stringMap<T>(value: Record<string, T>, encode: (entry: T) => string): string {
  return object(Object.entries(value)
    .sort(([left], [right]) => left.localeCompare(right, "en"))
    .map(([key, entry]) => [key, encode(entry)]));
}

function stats(value: UnitStats): string {
  return object([
    ["attack", float(value.attack ?? 0)],
    ["defense", float(value.defense ?? 0)],
    ["baseDefense", value.baseDefense == null ? "null" : float(value.baseDefense)],
    ["health", float(value.health ?? 0)],
    ["evasion", float(value.evasion ?? 0)],
    ["crit", float(value.crit ?? 0)],
    ["element", value.element == null ? "null" : float(value.element)],
    ["aggro", value.aggro == null ? "null" : float(value.aggro)],
    ["criticalDamage", value.criticalDamage == null ? "null" : float(value.criticalDamage)],
    ["regeneration", float(value.regeneration ?? 0)],
  ]);
}

function equipment(value: CanonicalEquipment): string {
  return object([
    ["itemId", string(value.itemId ?? "")],
    ["name", optionalString(value.name)],
    ["slot", string(value.slot)],
    ["quality", string(value.quality)],
    ["element", optionalString(value.element)],
    ["spirit", optionalString(value.spirit)],
    ["shiny", boolean(value.shiny ?? false)],
    ["transcended", boolean(value.transcended ?? false)],
    ["transcendence", integer(value.transcendence ?? 0)],
  ]);
}

function hero(value: CanonicalHero): string {
  const seedPointOrder = ["health", "attack", "defense", "evasion", "criticalChance", "criticalDamage"];
  const seedPoints = object(seedPointOrder
    .filter((key) => Object.prototype.hasOwnProperty.call(value.seedPoints, key))
    .map((key) => [key, integer(value.seedPoints[key] ?? 0)]));
  return object([
    ["id", string(value.id)],
    ["classId", string(value.classId)],
    ["name", string(value.name)],
    ["level", integer(value.level)],
    ["rank", integer(value.rank)],
    ["seed", integer(value.seed)],
    ["cardLevel", integer(value.cardLevel)],
    ["className", string(value.className ?? "")],
    ["spritePath", optionalString(value.spritePath)],
    ["element", string(value.element ?? "")],
    ["stats", stats(value.stats)],
    ["titan", boolean(value.titan ?? false)],
    ["seedPoints", seedPoints],
    ["equipment", array(value.equipment, equipment)],
    ["skillIds", array(value.skillIds, string)],
    ["cardLevels", stringMap(value.cardLevels, integer)],
  ]);
}

function champion(value: CanonicalSystem["champions"][number]): string {
  return object([
    ["id", string(value.id)],
    ["loadoutPresent", boolean(value.loadoutPresent ?? false)],
    ["name", string(value.name ?? "")],
    ["classId", optionalString(value.classId)],
    ["spritePath", optionalString(value.spritePath)],
    ["element", string(value.element ?? "")],
    ["level", integer(value.level)],
    ["rank", integer(value.rank)],
    ["seed", integer(value.seed ?? 0)],
    ["cardLevel", integer(value.cardLevel ?? 0)],
    ["titan", boolean(value.titan ?? false)],
    ["familiarId", string(value.familiarId ?? "")],
    ["auraSongId", string(value.auraSongId ?? "")],
    ["stats", stats(value.stats)],
    ["familiar", value.familiar ? equipment(value.familiar) : "null"],
    ["auraSong", value.auraSong ? equipment(value.auraSong) : "null"],
    ["cardLevels", stringMap(value.cardLevels, integer)],
  ]);
}

function simulationConfig(value: SimulationConfig): string {
  return object([
    ["iterations", integer(value.iterations ?? 10_000)],
    ["seed", integer(value.seed ?? 1)],
    ["booster", boolean(value.booster ?? false)],
    ["boosterLevel", integer(value.boosterLevel ?? 0)],
    ["elite", boolean(value.elite ?? false)],
    ["eliteKind", optionalString(value.eliteKind)],
    ["selectedElement", optionalString(value.selectedElement)],
    ["titanTower", boolean(value.titanTower ?? false)],
    ["xpBooster", integer(value.xpBooster ?? 0)],
    ["tombCurseBooster", integer(value.tombCurseBooster ?? 0)],
    ["adventureMasteryXp", value.adventureMasteryXp == null ? "null" : boolean(value.adventureMasteryXp)],
    ["guildXpBoost", value.guildXpBoost == null ? "null" : boolean(value.guildXpBoost)],
    ["eventXpBoost", value.eventXpBoost == null ? "null" : boolean(value.eventXpBoost)],
    ["towerModifiers", array(value.towerModifiers ?? [], string)],
    ["towerModifierElements", stringMap(value.towerModifierElements ?? {}, string)],
    ["tombFloor", value.tombFloor == null ? "null" : integer(value.tombFloor)],
  ]);
}

function simulationSnapshot(value: Record<string, unknown> | null | undefined): string {
  if (!value) return "null";
  return object([
    ["simulatorVersion", string(text(value.simulatorVersion, "unknown"))],
    ["gameDataVersion", string(text(value.gameDataVersion, "unknown"))],
    ["seed", integer(Number(value.seed ?? 0))],
    ["iterations", integer(Number(value.iterations ?? 0))],
    ["result", jsonValue(value.result ?? {})],
    ["completedAt", dateTime(text(value.completedAt, new Date(0).toISOString()))],
    ["stale", boolean(Boolean(value.stale ?? false))],
  ]);
}

function task(value: CanonicalTask): string {
  return object([
    ["id", string(value.id)],
    ["questId", string(value.questId)],
    ["name", string(value.name ?? "")],
    ["map", string(value.map ?? "")],
    ["groupId", optionalString(value.groupId)],
    ["heroIds", array(value.heroIds, string)],
    ["championIds", array(value.championIds, string)],
    ["difficulty", integer(value.difficulty)],
    ["maxMembers", integer(value.maxMembers ?? 4)],
    ["barrier", stringMap(value.barrier ?? {}, float)],
    ["config", simulationConfig(value.config)],
    ["result", value.result === undefined ? "null" : jsonValue(value.result)],
    ["modifiers", array(value.modifiers ?? [], string)],
    ["simulation", simulationSnapshot(value.simulation)],
  ]);
}

export function rustLineupJson(value: CanonicalSystem): string {
  return object([
    ["id", string(value.id)],
    ["name", string(value.name)],
    ["description", string(value.description ?? "")],
    ["localPublic", boolean(value.localPublic ?? false)],
    ["localTag", string(value.localTag || "本地")],
    ["schemaVersion", integer(value.schemaVersion ?? 1)],
    ["gameDataVersion", string(value.gameDataVersion ?? "")],
    ["groups", array(value.groups ?? [], (group) => object([
      ["id", string(group.id)],
      ["name", string(group.name)],
      ["sortOrder", integer(group.sortOrder)],
    ]))],
    ["heroes", array(value.heroes ?? [], hero)],
    ["champions", array(value.champions ?? [], champion)],
    ["equipmentOwnedCounts", object([
      ["hero", stringMap(value.equipmentOwnedCounts?.hero ?? {}, jsonValue)],
      ["champion", stringMap(value.equipmentOwnedCounts?.champion ?? {}, jsonValue)],
    ])],
    ["adventureTasks", array(value.adventureTasks ?? [], task)],
    ["createdAt", dateTime(value.createdAt)],
    ["updatedAt", dateTime(value.updatedAt)],
  ]);
}

export function rustBackupJson(value: BackupPayload): string {
  return object([
    ["systems", array(value.systems, rustLineupJson)],
    ["templates", array(value.templates, (template) => object([
      ["id", string(template.id)],
      ["name", string(template.name)],
      ["classId", optionalString(template.classId)],
      ["build", jsonValue(template.build)],
      ["updatedAt", dateTime(template.updatedAt)],
    ]))],
    ["settings", stringMap(value.settings, jsonValue)],
  ]);
}
