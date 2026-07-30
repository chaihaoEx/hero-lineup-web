import type { AdventureTask, BuildTemplate, CalculatedSheet, CanonicalEquipment, CanonicalSystem, Champion, ChampionLoadout, Hero, LineupSystem, PartyUnit, SimulationProgress, SimulationResult, UnitStats } from "../types/domain";
import { previewCatalog, type Catalog } from "../data/catalog";
import { loadBrowserCatalog } from "../data/browserCatalog";
import { calculateChampionPreview } from "../data/championPreview";
import { calculateHeroSheet } from "../core/heroCalculator";
import { getCatalogIndex } from "../data/catalogIndex";
import {
  decodeBackup,
  decodeLineup,
  encodeBackup,
  encodeLineup,
  webVersions,
} from "../core/interchange";
import {
  deleteSystem as deleteStoredSystem,
  deleteTemplate as deleteStoredTemplate,
  exportDatabase,
  listSystems as listStoredSystems,
  listTemplates as listStoredTemplates,
  replaceDatabase,
  saveSimulationHistory,
  saveSystem as saveStoredSystem,
  saveTemplate as saveStoredTemplate,
} from "../storage/repository";

const slots = { "武器": "weapon", "头部": "head", "身体": "body", "手部": "hands", "脚部": "feet", "饰品": "accessory" } as const;
const reverseSlots = { weapon: "武器", head: "头部", body: "身体", hands: "手部", feet: "脚部", accessory: "饰品", familiar: "饰品", auraSong: "饰品" } as const;
const qualities = { "普通": "normal", "优质": "superior", "高级": "flawless", "史诗": "epic", "传说": "legendary" } as const;
const reverseQualities = { normal: "普通", superior: "优质", flawless: "高级", epic: "史诗", legendary: "传说" } as const;
let activeCatalog: Catalog = previewCatalog;

export interface ContentStatus {
  source: "bundled" | "installed";
  appVersion: string;
  schemaVersion: number;
  gameDataVersion: string;
  simulatorVersion: string;
  assetVersion: string;
  minimumAppVersion: string;
  createdAt: string;
  files: number;
  totalBytes: number;
  statistics: Record<string, number>;
}

export interface DataPackageInstallResult {
  content: ContentStatus;
  verification: {
    filesChecked: number;
    jsonDocuments: number;
    totalBytes: number;
    warnings: string[];
  };
  staleSimulations: number;
}

const toEquipment = (equipment: LineupSystem["heroes"][number]["equipment"][number]): CanonicalEquipment => ({
  itemId: equipment.itemId ?? "", ...(equipment.name === undefined ? {} : { name: equipment.name }), slot: slots[equipment.slot], quality: qualities[equipment.quality],
  ...(equipment.element === undefined ? {} : { element: equipment.element }), ...(equipment.spirit === undefined ? {} : { spirit: equipment.spirit }), shiny: equipment.shiny,
  transcended: equipment.transcendence > 0, transcendence: equipment.transcendence,
});

const toChampionEquipment = (equipment: NonNullable<ChampionLoadout["familiarEquipment"]>, slot: "familiar" | "auraSong"): CanonicalEquipment => ({
  itemId: equipment.itemId ?? "", ...(equipment.name === undefined ? {} : { name: equipment.name }), slot,
  quality: qualities[equipment.quality], ...(equipment.element === undefined ? {} : { element: equipment.element }),
  ...(equipment.spirit === undefined ? {} : { spirit: equipment.spirit }), shiny: equipment.shiny,
  transcended: equipment.transcendence > 0, transcendence: equipment.transcendence,
});

const fromChampionEquipment = (equipment: CanonicalEquipment | undefined): ChampionLoadout["familiarEquipment"] => equipment ? ({
  ...(equipment.itemId ? { itemId: equipment.itemId } : {}), ...(equipment.name === undefined ? {} : { name: equipment.name }),
  quality: reverseQualities[equipment.quality],
  ...(equipment.element === undefined ? {} : { element: equipment.element }), ...(equipment.spirit === undefined ? {} : { spirit: equipment.spirit }),
  shiny: equipment.shiny, transcendence: equipment.transcendence || (equipment.transcended ? 1 : 0),
}) : undefined;

export function toCanonicalSystem(system: LineupSystem): CanonicalSystem {
  const championIds = new Set(system.championIds);
  return {
    id: system.id, name: system.name, description: system.description, localPublic: system.localPublic, localTag: system.localTag,
    schemaVersion: system.schemaVersion, gameDataVersion: system.gameDataVersion,
    groups: system.taskGroups.map((group, sortOrder) => ({ id: group.id, name: group.name, sortOrder })),
    heroes: system.heroes.map((hero) => ({
      id: hero.id, classId: hero.classId, name: hero.name, level: hero.level, rank: hero.rank, seed: hero.seed,
      cardLevel: hero.cardLevel, className: hero.className, spritePath: hero.spritePath, element: hero.element,
      stats: hero.stats, titan: hero.titan, seedPoints: {}, equipment: hero.equipment.map(toEquipment),
      skillIds: hero.skills.filter(Boolean), cardLevels: {},
    })),
    champions: [...championIds].map((id) => {
      const loadout = system.championLoadouts[id] ?? { level: 1, rank: 1, seed: 0, cardLevel: 0, titan: false, familiar: "", aurasong: "" };
      return { id, loadoutPresent: Object.prototype.hasOwnProperty.call(system.championLoadouts, id), name: "", element: "", level: loadout.level, rank: loadout.rank, seed: loadout.seed, cardLevel: loadout.cardLevel, titan: loadout.titan,
        familiarId: loadout.familiarEquipment?.itemId ?? loadout.familiar, auraSongId: loadout.auraSongEquipment?.itemId ?? loadout.aurasong,
        ...(loadout.familiarEquipment ? { familiar: toChampionEquipment(loadout.familiarEquipment, "familiar") } : {}),
        ...(loadout.auraSongEquipment ? { auraSong: toChampionEquipment(loadout.auraSongEquipment, "auraSong") } : {}),
        stats: loadout.stats ?? { attack: 0, defense: 0, health: 0, evasion: 0, crit: 0 }, cardLevels: {} };
    }),
    equipmentOwnedCounts: system.equipmentOwnedCounts ?? { hero: {}, champion: {} },
    adventureTasks: system.taskGroups.flatMap((group) => group.tasks.map((task) => ({
      id: task.id, questId: task.questId ?? task.map, name: task.name, map: task.map, groupId: group.id,
      heroIds: task.memberIds.filter((id) => system.heroes.some((hero) => hero.id === id)),
      championIds: task.memberIds.filter((id) => championIds.has(id)), difficulty: ({ "简单": 1, "中等": 2, "困难": 3, "究极": 4, "泰坦之墓": 31 } as Record<string, number>)[task.difficulty]
        ?? Number(task.difficulty.match(/\d+/)?.[0] ?? 1),
      maxMembers: task.maxMembers, barrier: task.barrier, config: task.config, result: task.result,
      modifiers: [], simulation: task.result ? { result: task.result } : undefined,
    }))),
    createdAt: system.createdAt, updatedAt: system.updatedAt,
  };
}

export function fromCanonicalSystem(system: CanonicalSystem): LineupSystem {
  const taskGroups = [...system.groups].sort((a, b) => a.sortOrder - b.sortOrder).map((group) => ({
    id: group.id, name: group.name,
    tasks: system.adventureTasks.filter((task) => task.groupId === group.id).map((task) => ({
      id: task.id, questId: task.questId, name: task.name, map: task.map,
      difficulty: (["简单", "简单", "中等", "困难", "究极"][task.difficulty] ?? `难度${task.difficulty}`),
      maxMembers: task.maxMembers, memberIds: [...task.heroIds, ...task.championIds], barrier: task.barrier,
      config: task.config, result: task.result,
    })),
  }));
  return {
    id: system.id, name: system.name, description: system.description, localPublic: system.localPublic,
    localTag: (system.localTag === "示例" || system.localTag === "收藏") ? system.localTag : "本地",
    heroes: system.heroes.map((hero) => ({
      id: hero.id, kind: "hero", name: hero.name, classId: hero.classId, className: hero.className,
      spritePath: hero.spritePath, element: (hero.element || "光") as LineupSystem["heroes"][number]["element"],
      level: hero.level, rank: hero.rank, seed: hero.seed, titan: hero.titan, cardLevel: hero.cardLevel,
      skills: [...hero.skillIds], stats: hero.stats,
      equipment: hero.equipment.map((equipment) => ({ ...(equipment.itemId ? { itemId: equipment.itemId } : {}), ...(equipment.name === undefined ? {} : { name: equipment.name }),
        slot: reverseSlots[equipment.slot], quality: reverseQualities[equipment.quality],
        ...(equipment.element === undefined ? {} : { element: equipment.element as LineupSystem["heroes"][number]["element"] }), ...(equipment.spirit === undefined ? {} : { spirit: equipment.spirit }),
        shiny: equipment.shiny, transcendence: equipment.transcendence || (equipment.transcended ? 1 : 0) })),
    })),
    championIds: system.champions.map((champion) => champion.id),
    championLoadouts: Object.fromEntries(system.champions.filter((champion) => champion.loadoutPresent).map((champion) => [champion.id, {
      level: champion.level, rank: champion.rank, seed: champion.seed, cardLevel: champion.cardLevel, titan: champion.titan,
      familiar: champion.familiarId, aurasong: champion.auraSongId,
      ...(champion.familiar ? { familiarEquipment: fromChampionEquipment(champion.familiar) } : {}),
      ...(champion.auraSong ? { auraSongEquipment: fromChampionEquipment(champion.auraSong) } : {}), stats: champion.stats,
    }])),
    equipmentOwnedCounts: system.equipmentOwnedCounts ?? { hero: {}, champion: {} },
    taskGroups, createdAt: system.createdAt, updatedAt: system.updatedAt,
    schemaVersion: system.schemaVersion, gameDataVersion: system.gameDataVersion,
  };
}

function previewSheet(stats: UnitStats): CalculatedSheet {
  return {
    stats: { health: stats.health, attack: stats.attack, defense: stats.defense,
      baseDefense: stats.baseDefense ?? stats.defense, evasion: stats.evasion,
      critical: stats.crit, criticalDamage: (stats.criticalDamage ?? 200) / 100,
      aggro: stats.aggro ?? 0, elementValue: stats.element ?? 0, regeneration: stats.regeneration ?? 0 },
    issues: [], applied: { source: "browser-preview" },
  };
}

export const desktopBridge = {
  isDesktop: () => false,

  async loadCatalog(): Promise<Catalog> {
    activeCatalog = import.meta.env.MODE === "test" ? previewCatalog : await loadBrowserCatalog();
    getCatalogIndex(activeCatalog);
    return activeCatalog;
  },

  async getContentStatus(): Promise<ContentStatus | null> {
    return null;
  },

  /** Opens the native file picker and atomically installs a verified local `.zysdata` package. */
  async installDataPackage(): Promise<DataPackageInstallResult | null> {
    throw new Error("Web 版游戏数据随静态站点版本更新");
  },

  async listSystems(): Promise<LineupSystem[]> {
    return listStoredSystems();
  },

  async saveSystem(system: LineupSystem): Promise<LineupSystem> {
    const saved = { ...system, updatedAt: new Date().toISOString() };
    return saveStoredSystem(saved);
  },

  async deleteSystem(id: string): Promise<void> {
    await deleteStoredSystem(id);
  },

  async listTemplates(): Promise<BuildTemplate[]> {
    return listStoredTemplates();
  },

  async saveTemplate(template: BuildTemplate): Promise<BuildTemplate> {
    const saved = { ...template, updatedAt: new Date().toISOString() };
    return saveStoredTemplate(saved);
  },

  async deleteTemplate(id: string): Promise<void> {
    await deleteStoredTemplate(id);
  },

  async calculateHero(hero: Hero): Promise<CalculatedSheet> {
    return calculateHeroSheet(activeCatalog, hero);
  },

  async calculateChampion(champion: Champion, loadout: ChampionLoadout, titanTower = false, catalog?: Catalog): Promise<CalculatedSheet> {
    return catalog
      ? calculateChampionPreview(catalog, champion, loadout, titanTower)
      : previewSheet(loadout.stats ?? champion.stats);
  },

  async exportSystems(systems: LineupSystem[]): Promise<string> {
    if (systems.length !== 1) throw new Error(".zyslineup 每个文件只能包含一个体系");
    const system = systems[0]!;
    return encodeLineup(toCanonicalSystem(system), webVersions(system.gameDataVersion));
  },

  async importSystems(payload: string, expectedGameDataVersion: string): Promise<LineupSystem[]> {
    const decoded = await decodeLineup(payload);
    if (decoded.versions.gameDataVersion !== "legacy-unknown"
      && decoded.versions.gameDataVersion !== expectedGameDataVersion) {
      throw new Error(`数据版本不兼容：文件为 ${decoded.versions.gameDataVersion}，当前为 ${expectedGameDataVersion}`);
    }
    const system = fromCanonicalSystem(decoded.system);
    const existing = await listStoredSystems();
    if (existing.some((entry) => entry.id === system.id)) {
      system.id = crypto.randomUUID();
      system.name += "（导入）";
    }
    system.gameDataVersion = expectedGameDataVersion;
    await saveStoredSystem(system);
    return [system];
  },

  async exportBackup(gameDataVersion: string): Promise<string> {
    const backup = await exportDatabase();
    return encodeBackup({
      systems: backup.systems.map(toCanonicalSystem),
      templates: backup.templates,
      settings: backup.settings,
    }, webVersions(gameDataVersion));
  },

  async restoreBackup(payload: string, expectedGameDataVersion: string, confirmed: boolean): Promise<LineupSystem[]> {
    if (!confirmed) throw new Error("恢复完整备份前必须确认");
    const decoded = await decodeBackup(payload);
    if (decoded.versions.gameDataVersion !== "legacy-unknown"
      && decoded.versions.gameDataVersion !== expectedGameDataVersion) {
      throw new Error(`数据版本不兼容：文件为 ${decoded.versions.gameDataVersion}，当前为 ${expectedGameDataVersion}`);
    }
    const systems = decoded.backup.systems.map(fromCanonicalSystem);
    await replaceDatabase({
      systems,
      templates: decoded.backup.templates,
      settings: decoded.backup.settings,
    });
    return systems;
  },

  async saveInterchange(payload: string, suggestedName: string, extension: "zyslineup" | "zysbackup"): Promise<boolean> {
    const filename = suggestedName.endsWith(`.${extension}`) ? suggestedName : `${suggestedName}.${extension}`;
    const href = URL.createObjectURL(new Blob([payload], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = href;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(href);
    return true;
  },

  async openInterchange(extension: "zyslineup" | "zysbackup"): Promise<string | null> {
    return new Promise((resolve, reject) => {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = `.${extension},application/json`;
      input.addEventListener("change", () => {
        const file = input.files?.[0];
        if (!file) {
          resolve(null);
          return;
        }
        file.text().then(resolve, reject);
      }, { once: true });
      input.click();
    });
  },

  async simulate(
    task: AdventureTask,
    units: PartyUnit[],
    onProgress: (progress: SimulationProgress) => void,
    signal: AbortSignal,
    systemId?: string,
  ): Promise<SimulationResult> {
    if (signal.aborted) throw new DOMException("模拟已取消", "AbortError");
    const requestId = crypto.randomUUID();
    const catalogIndex = getCatalogIndex(activeCatalog);
    const quest = task.questId ? catalogIndex.quests.get(task.questId) : undefined;
    const worker = new Worker(new URL("../workers/simulation.worker.ts", import.meta.url), { type: "module" });
    const result = await new Promise<SimulationResult>((resolve, reject) => {
      const abort = () => {
        worker.terminate();
        reject(new DOMException("模拟已取消", "AbortError"));
      };
      signal.addEventListener("abort", abort, { once: true });
      worker.addEventListener("message", (event: MessageEvent<{
        type: "progress" | "complete" | "error";
        requestId: string;
        completed?: number;
        total?: number;
        result?: SimulationResult;
        message?: string;
      }>) => {
        if (event.data.requestId !== requestId) return;
        if (event.data.type === "progress") {
          onProgress({
            taskId: task.id,
            completed: event.data.completed ?? 0,
            total: event.data.total ?? task.config.iterations,
            phase: "running",
          });
          return;
        }
        signal.removeEventListener("abort", abort);
        worker.terminate();
        if (event.data.type === "complete" && event.data.result) resolve(event.data.result);
        else reject(new Error(event.data.message ?? "模拟 Worker 返回无效结果"));
      });
      worker.addEventListener("error", (event) => {
        signal.removeEventListener("abort", abort);
        worker.terminate();
        reject(new Error(event.message || "模拟 Worker 执行失败"));
      }, { once: true });
      worker.postMessage({
        type: "start",
        requestId,
        input: {
          task,
          units: units.map((unit) => {
            const classId = unit.kind === "hero"
              ? unit.classId
              : catalogIndex.champions.get(unit.id)?.classId;
            const classType = classId ? catalogIndex.classes.get(classId)?.type : undefined;
            return { ...unit, ...(classType ? { classType } : {}) };
          }),
          quest,
          modifiers: activeCatalog.simulationModifiers ?? {},
        },
      });
    });
    if (systemId) await saveSimulationHistory(systemId, task.id, result);
    return result;
  },

  async assetUrl(relativePath: string): Promise<string> {
    const safe = relativePath.replace(/^[/\\]+/, "").replace(/\\/g, "/");
    if (safe.split("/").includes("..")) throw new Error("资源路径不能包含上级目录");
    return `/content/${safe}`;
  },
};
