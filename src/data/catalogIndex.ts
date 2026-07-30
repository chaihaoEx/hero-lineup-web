import type { Catalog, CatalogChampion, CatalogClass, CatalogItem, CatalogQuest, CatalogSkill } from "./catalog";

export interface CatalogIndex {
  classes: Map<string, CatalogClass>;
  champions: Map<string, CatalogChampion>;
  quests: Map<string, CatalogQuest>;
  items: Map<string, CatalogItem>;
  itemsByName: Map<string, CatalogItem>;
  skills: Map<string, CatalogSkill>;
}

const indexes = new WeakMap<Catalog, CatalogIndex>();

/** Builds the hot-path lookup tables once, immediately after a catalog enters memory. */
export function getCatalogIndex(catalog: Catalog): CatalogIndex {
  const existing = indexes.get(catalog);
  if (existing) return existing;
  const index: CatalogIndex = {
    classes: new Map(catalog.classes.map((entry) => [entry.id, entry])),
    champions: new Map(catalog.champions.map((entry) => [entry.id, entry])),
    quests: new Map(catalog.quests.map((entry) => [entry.id, entry])),
    items: new Map(catalog.items.map((entry) => [entry.id, entry])),
    itemsByName: new Map(catalog.items.map((entry) => [entry.name, entry])),
    skills: new Map(catalog.skills.map((entry) => [entry.id, entry])),
  };
  indexes.set(catalog, index);
  return index;
}
