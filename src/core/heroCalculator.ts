import type { CalculatedSheet, CalculationIssue, EquipmentSlot, Hero } from "../types/domain";
import type { Catalog, CatalogClass, CatalogItem, CatalogSkill } from "../data/catalog";
import { elementFamily, previewEquipmentStats, resolveSpiritSkill } from "../data/equipmentPreview";
import { getCatalogIndex } from "../data/catalogIndex";

interface MutableStats {
  health: number;
  attack: number;
  defense: number;
  evasion: number;
  critical: number;
  criticalDamage: number;
  aggro: number;
  regeneration: number;
}

const elementToken = {
  火: "fire", 水: "water", 土: "earth", 风: "air", 光: "light", 暗: "dark",
} as const;
const slotIndex: Record<EquipmentSlot["slot"], number> = {
  武器: 0, 身体: 1, 手部: 2, 头部: 3, 脚部: 4, 饰品: 5,
};

function levelValue(start: number, atForty: number, atFifty: number, level: number): number {
  if (level <= 1) return Math.round(start);
  const clamped = Math.max(1, Math.min(50, level));
  if (clamped <= 40) {
    const increment = (atForty - start) / 100;
    const steps = clamped - 1;
    const weighted = Math.min(steps, 8)
      + 2 * Math.max(0, Math.min(steps, 19) - 8)
      + 3 * Math.max(0, Math.min(steps, 29) - 19)
      + 4 * Math.max(0, steps - 29);
    return Math.round(start + increment * weighted);
  }
  return Math.round(atForty + (atFifty - atForty) * ((clamped - 40) / 10));
}

function classCore(classRecord: CatalogClass, hero: Hero): MutableStats {
  const calculation = classRecord.calculation;
  const levelStats = calculation ? {
    health: levelValue(calculation.levelOne.health, classRecord.stats.health, calculation.levelFifty.health, hero.level),
    attack: levelValue(calculation.levelOne.attack, classRecord.stats.attack, calculation.levelFifty.attack, hero.level),
    defense: levelValue(calculation.levelOne.defense, classRecord.stats.defense, calculation.levelFifty.defense, hero.level),
  } : classRecord.stats;
  return {
    health: levelStats.health + hero.seed,
    attack: levelStats.attack + hero.seed * 4,
    defense: levelStats.defense + hero.seed * 4,
    evasion: classRecord.stats.evasion / 100,
    critical: classRecord.stats.crit / 100,
    criticalDamage: (classRecord.stats.criticalDamage ?? 200) / 100,
    aggro: classRecord.stats.aggro ?? 0,
    regeneration: classRecord.stats.regeneration ?? 0,
  };
}

function attachment(catalog: Catalog, id: string | undefined, kind: "element" | "spirit"): CatalogItem | undefined {
  if (!id) return undefined;
  const index = getCatalogIndex(catalog);
  return index.items.get(id) ?? index.itemsByName.get(id)
    ?? (kind === "element" ? catalog.items.find((item) => elementFamily(item) === id) : undefined);
}

function skillForFamily(catalog: Catalog, family: string, elementValue: number, maxTier: number): CatalogSkill | undefined {
  for (let tier = maxTier; tier >= 1; tier -= 1) {
    const skill = getCatalogIndex(catalog).skills.get(`${family}${tier}`);
    if (skill && elementValue >= skill.elements) return skill;
  }
  return undefined;
}

function resolveSkills(
  catalog: Catalog,
  classRecord: CatalogClass,
  hero: Hero,
  elementValue: number,
  issues: CalculationIssue[],
): { innate?: CatalogSkill; selected: CatalogSkill[] } {
  const innate = classRecord.innateSkillFamily
    ? skillForFamily(catalog, classRecord.innateSkillFamily, elementValue, classRecord.maxSkillLevel)
    : undefined;
  const selected: CatalogSkill[] = [];
  const families = new Set<string>();
  const categories = new Set<string>();
  hero.skills.forEach((id, index) => {
    if (!id) return;
    const unlock = classRecord.skillUnlockLevels[index] ?? 0;
    if (index >= 4 || unlock === 0 || hero.level < unlock) {
      issues.push({ severity: "warning", code: "skill_slot_locked", message: "技能所在槽位尚未解锁", itemId: id });
      return;
    }
    const chosen = getCatalogIndex(catalog).skills.get(id);
    if (!chosen) {
      issues.push({ severity: "warning", code: "missing_skill", message: "本地数据中不存在该技能 ID", itemId: id });
      return;
    }
    const allowed = chosen.classes.includes("*")
      || chosen.classes.includes(classRecord.id)
      || chosen.classes.includes(classRecord.type);
    if (chosen.family === classRecord.innateSkillFamily || !allowed) {
      issues.push({ severity: "warning", code: "skill_not_allowed", message: "该职业不能选择此技能", itemId: id });
      return;
    }
    if (families.has(chosen.family)) {
      issues.push({ severity: "warning", code: "duplicate_skill_family", message: "同一技能族只应用一次", itemId: id });
      return;
    }
    if (chosen.category && categories.has(chosen.category)) {
      issues.push({ severity: "warning", code: "duplicate_skill_category", message: "同一技能类别只应用一次", itemId: id });
      return;
    }
    families.add(chosen.family);
    if (chosen.category) categories.add(chosen.category);
    selected.push(skillForFamily(catalog, chosen.family, elementValue, classRecord.maxSkillLevel) ?? chosen);
  });
  return { ...(innate ? { innate } : {}), selected };
}

function itemMatchesTypes(item: CatalogItem, types: string[]): boolean {
  return types.includes("*") || types.includes(item.itemType)
    || Boolean(item.multiTypes?.some((type) => types.includes(type)));
}

function applyItemSkill(stats: MutableStats, item: CatalogItem, skill: CatalogSkill | undefined): void {
  const types = skill?.itemTypes;
  const percent = skill?.modifiers?.item ?? 0;
  if (!types?.length || !percent || !itemMatchesTypes(item, types)) return;
  if (skill?.affectSecondaryStats) {
    stats.attack = Math.round(stats.attack * (1 + percent));
    stats.defense = Math.round(stats.defense * (1 + percent));
    stats.health = Math.round(stats.health * (1 + percent));
    return;
  }
  if ((item.attack ?? 0) > 0 && (item.attack ?? 0) >= (item.defense ?? 0) && (item.attack ?? 0) >= (item.health ?? 0)) {
    stats.attack = Math.round(stats.attack * (1 + percent));
  } else if ((item.health ?? 0) > (item.defense ?? 0)) {
    stats.health = Math.round(stats.health * (1 + percent));
  } else {
    stats.defense = Math.round(stats.defense * (1 + percent));
  }
}

function add(target: MutableStats, source: MutableStats): void {
  for (const key of Object.keys(target) as Array<keyof MutableStats>) target[key] += source[key];
}

function emptyStats(): MutableStats {
  return { health: 0, attack: 0, defense: 0, evasion: 0, critical: 0, criticalDamage: 0, aggro: 0, regeneration: 0 };
}

function validateItem(
  catalog: Catalog,
  classRecord: CatalogClass,
  hero: Hero,
  equipment: EquipmentSlot,
  item: CatalogItem,
  issues: CalculationIssue[],
): boolean {
  const allowedTypes = classRecord.slots[slotIndex[equipment.slot]] ?? [];
  let valid = true;
  if (!itemMatchesTypes(item, allowedTypes)) {
    issues.push({ severity: "error", code: "slot_type_not_allowed", message: "装备类型不在职业槽位代码中", itemId: item.id, slot: equipment.slot });
    valid = false;
  }
  const restrictions = item.restrictedClass?.split(",").map((value) => value.trim()).filter(Boolean) ?? [];
  if (restrictions.length && !restrictions.some((value) => value === hero.classId || value === classRecord.type || value === "*")) {
    issues.push({ severity: "error", code: "class_restricted", message: "装备限制不允许该职业", itemId: item.id, slot: equipment.slot });
    valid = false;
  }
  const maxTier = catalog.equipmentTiers?.[Math.max(1, Math.min(50, hero.level))] ?? Number.POSITIVE_INFINITY;
  if (item.tier > maxTier) {
    issues.push({ severity: "error", code: "tier_locked", message: "装备阶数高于当前英雄等级可用阶数", itemId: item.id, slot: equipment.slot });
    valid = false;
  }
  return valid;
}

/** Exact browser port of the archived Rust/data-driven hero sheet calculation. */
export function calculateHeroSheet(catalog: Catalog, hero: Hero): CalculatedSheet {
  const index = getCatalogIndex(catalog);
  const classRecord = index.classes.get(hero.classId);
  if (!classRecord) {
    return {
      stats: { health: 1, attack: 0, defense: 0, baseDefense: 0, evasion: 0, critical: 0, criticalDamage: 0, aggro: 0, elementValue: 0, regeneration: 0 },
      issues: [{ severity: "error", code: "missing_class", message: "本地数据中不存在该职业" }],
      applied: { source: "browser-exact", classOrChampionId: hero.classId, equipmentCount: 0, skillIds: [] },
    };
  }
  const issues: CalculationIssue[] = [];
  if (hero.level < 1 || hero.level > 50) {
    issues.push({ severity: "error", code: "invalid_level", message: "等级必须在 1–50 之间；计算时已按归档规则钳制" });
  }
  const seen = new Set<string>();
  const resolved = hero.equipment.flatMap((equipment) => {
    if (!equipment.itemId) return [];
    if (seen.has(equipment.slot)) {
      issues.push({ severity: "error", code: "duplicate_slot", message: "装备槽位重复", itemId: equipment.itemId, slot: equipment.slot });
      return [];
    }
    seen.add(equipment.slot);
    const item = index.items.get(equipment.itemId);
    if (!item) {
      issues.push({ severity: "error", code: "missing_item", message: "本地数据中不存在该装备 ID", itemId: equipment.itemId, slot: equipment.slot });
      return [];
    }
    return validateItem(catalog, classRecord, hero, equipment, item, issues) ? [{ equipment, item }] : [];
  });
  const unitElement = classRecord.allElements ? "all" : elementToken[classRecord.element];
  const elementValue = resolved.reduce((total, { equipment, item }) => {
    const elementItem = attachment(catalog, item.builtInElementId ?? equipment.element, "element");
    return total + previewEquipmentStats(item, equipment, { elementItem, unitElement }).elementValue;
  }, 0);
  const skills = resolveSkills(catalog, classRecord, hero, elementValue, issues);
  const base = classCore(classRecord, hero);
  const equipmentTotal = emptyStats();
  for (const { equipment, item } of resolved) {
    const elementItem = attachment(catalog, item.builtInElementId ?? equipment.element, "element");
    const spiritItem = attachment(catalog, item.builtInSpiritId ?? equipment.spirit, "spirit");
    const itemPreview = previewEquipmentStats(item, equipment, {
      elementItem, spiritItem, skills: catalog.skills, unitElement, titanTower: hero.titan,
    });
    const itemStats: MutableStats = {
      health: itemPreview.health, attack: itemPreview.attack, defense: itemPreview.defense,
      evasion: itemPreview.evasion, critical: itemPreview.critical,
      criticalDamage: 0, aggro: 0, regeneration: 0,
    };
    applyItemSkill(itemStats, item, skills.innate);
    for (const skill of skills.selected) applyItemSkill(itemStats, item, skill);
    add(equipmentTotal, itemStats);
    const spiritModifier = resolveSpiritSkill(item, spiritItem, catalog.skills)?.modifiers;
    if (spiritModifier) {
      const scale = item.itemType === "xi" ? 2 : 1;
      equipmentTotal.attack += spiritModifier.attackFlat * scale;
      equipmentTotal.defense += spiritModifier.defenseFlat * scale;
      equipmentTotal.health += spiritModifier.healthFlat * scale;
      equipmentTotal.evasion += spiritModifier.evasion * scale;
      equipmentTotal.critical += spiritModifier.critical * scale;
      equipmentTotal.criticalDamage += spiritModifier.criticalDamage * scale;
      equipmentTotal.aggro += spiritModifier.aggro * scale;
      equipmentTotal.regeneration += spiritModifier.regeneration * scale;
    }
  }
  add(base, equipmentTotal);
  const cardMultiplier = 1 + ([0, 0.05, 0.1, 0.25][Math.min(hero.cardLevel, 3)] ?? 0);
  const baseDefense = base.defense * cardMultiplier;
  const skillPercent = emptyStats();
  for (const skill of [skills.innate, ...skills.selected]) {
    const modifier = skill?.modifiers;
    if (!modifier) continue;
    skillPercent.attack += modifier.attack;
    skillPercent.defense += modifier.defense;
    skillPercent.health += modifier.health;
    skillPercent.evasion += modifier.evasion;
    skillPercent.critical += modifier.critical;
    skillPercent.criticalDamage += modifier.criticalDamage;
    skillPercent.aggro += modifier.aggro;
    skillPercent.regeneration += modifier.regeneration;
  }
  base.attack = Math.floor(base.attack * (1 + skillPercent.attack));
  base.defense = Math.floor(base.defense * (1 + skillPercent.defense));
  base.health = Math.round(base.health * (1 + skillPercent.health));
  base.evasion += skillPercent.evasion;
  base.critical += skillPercent.critical;
  base.criticalDamage += skillPercent.criticalDamage;
  base.aggro += skillPercent.aggro;
  base.regeneration += skillPercent.regeneration;
  base.attack *= cardMultiplier;
  base.defense *= cardMultiplier;
  base.health *= cardMultiplier;
  return {
    stats: {
      health: Math.max(1, Math.round(base.health)),
      attack: Math.max(0, Math.floor(base.attack)),
      defense: Math.max(0, Math.floor(base.defense)),
      baseDefense: Math.max(0, baseDefense),
      evasion: base.evasion * 100,
      critical: base.critical * 100,
      criticalDamage: base.criticalDamage,
      aggro: base.aggro,
      elementValue,
      regeneration: base.regeneration,
    },
    issues,
    applied: {
      source: "browser-exact",
      levelCurve: "archived-bundle-segmented-1-50",
      equipmentFormula: "archived-bundle-quality-element-spirit-shiny-transcend",
      classOrChampionId: hero.classId,
      equipmentCount: resolved.length,
      skillIds: skills.selected.map((skill) => skill.id),
      titanApplied: hero.titan,
    },
  };
}
