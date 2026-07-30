import type { AdventureTask, PartyUnit, SimulationAttemptResult, SimulationResult } from "../types/domain";
import type { CatalogQuest, CatalogSimulationModifier } from "../data/catalog";
import { ChaCha8Rng } from "./chacha8";

export interface SimulationWorkerInput {
  task: AdventureTask & { gameDataVersion?: string };
  units: Array<PartyUnit & { classType?: string; allElements?: boolean }>;
  quest?: CatalogQuest;
  modifiers: Record<string, CatalogSimulationModifier>;
}

interface Fighter {
  id: string;
  health: number;
  attack: number;
  defense: number;
  evasion: number;
  critical: number;
  criticalDamage: number;
  element: PartyUnit["element"];
  elementPower: number;
  threat: number;
  regeneration: number;
  classId?: string;
  classType?: string;
  allElements: boolean;
  timedEvasion: Array<{ duration: number; delta: number }>;
}

interface Enemy {
  health: number;
  attack: number;
  defense: number;
  evasion: number;
  critical: number;
  baseCritical: number;
  criticalDamage: number;
  maxRounds: number;
}

export interface AdvancedCombatRuleSet {
  defenseThreshold?: number;
  timedMonsterModifiers?: Array<{ duration: number; damageDelta: number; criticalChanceDelta: number }>;
  monsterDamagePerRound?: number;
  areaAttack?: { chance: number; damageRatio: number };
  protectorId?: string;
  openingFocus?: Record<string, { criticalChance: number; evasion: number; recoverAfterRounds?: number }>;
  berserker?: Record<string, { hpThresholds: [number, number, number]; attackPerStage: number; evasionPerStage: number }>;
}

export interface AdvancedSimulationFixture {
  seed: number;
  iterations: number;
  fighters: Array<Omit<Fighter, "element" | "elementPower" | "threat" | "regeneration" | "allElements" | "timedEvasion"> & {
    threat?: number;
    regeneration?: number;
  }>;
  enemy: Omit<Enemy, "baseCritical"> & { baseCritical?: number };
  partyDamageMultiplier?: number;
  rules?: AdvancedCombatRuleSet;
}

interface PreparedSimulation {
  fighters: Fighter[];
  enemy: Enemy;
  partyDamageMultiplier: number;
  rules: AdvancedCombatRuleSet;
  retry: "none" | "chronomancer" | "timekeeper";
  seed: number;
  iterations: number;
}

interface AttemptState {
  won: boolean;
  rounds: number;
  health: number[];
  damage: number[];
}

interface AttemptAccumulator {
  attempts: number;
  wins: number;
  successfulRounds: number;
  minimumSuccessfulRounds: number;
  maximumSuccessfulRounds: number;
  survived: number[];
  damages: number[];
  remaining: number[];
}

const normalizeRate = (value: number): number => value > 1 ? value / 100 : value;
const clamp = (value: number, minimum: number, maximum: number): number => Math.max(minimum, Math.min(maximum, value));
const eliteModifier: Record<string, Partial<{ health: number; attack: number; evasion: number; critical: number }>> = {
  agile: { evasion: 0.4 },
  huge: { health: 1 },
  dire: { health: 0.5, critical: 3 },
  wealthy: {},
  epic: { health: 0.5, attack: 0.25, evasion: 0.1, critical: 0.5 },
};
const booster = [
  { attack: 0, defense: 0, critical: 0, criticalDamage: 0 },
  { attack: 0.2, defense: 0.2, critical: 0.1, criticalDamage: 0 },
  { attack: 0.4, defense: 0.4, critical: 0.15, criticalDamage: 0 },
  { attack: 0.8, defense: 0.8, critical: 0.3, criticalDamage: 0.5 },
];

function titanBonuses(floorValue: number, reductionValue: number) {
  const floor = clamp(Math.round(floorValue), 1, 500);
  const value = floor;
  let health: number;
  let attack: number;
  let defense: number;
  if (floor >= 31) {
    health = 200 + (value - 31) * 10;
    attack = 100 + (value - 31) * 10;
    defense = 40 + (value - 31) * 2;
  } else {
    health = floor <= 16 ? 5 + (value - 1) * (19 / 3) : 100 + (value - 16) * (20 / 3);
    attack = floor <= 16 ? 5 + (value - 1) * (7 / 3) : 40 + (value - 16) * 4;
    defense = floor <= 11 ? 5 + (value - 1) * 1.5 : 20 + (value - 11);
  }
  const retained = 1 - clamp(reductionValue, 0, 1);
  return { health: health * retained / 100, attack: attack * retained / 100, defense: defense * retained / 100 };
}

export function normalDamageAfterThreshold(defense: number, damage: number, threshold: number): number {
  const lerp = (start: number, end: number, ratio: number) => start + (end - start) * clamp(ratio, 0, 1);
  const multiplier = threshold > 0 && defense <= threshold
    ? lerp(1.5, 1, defense / threshold)
    : threshold > 0 && defense <= 2 * threshold
      ? lerp(1, 0.5, (defense - threshold) / threshold)
      : threshold > 0 && defense <= 4 * threshold
        ? lerp(0.5, 0.3, (defense - 2 * threshold) / (2 * threshold))
        : threshold > 0 && defense <= 12 * threshold
          ? lerp(0.3, 0.25, (defense - 4 * threshold) / (8 * threshold))
          : 0.25;
  return Math.round(multiplier * damage);
}

function criticalDamageAfterThreshold(
  defense: number,
  threshold: number,
  damage: number,
  criticalMultiplier: number,
): number {
  const defenseMultiplier = threshold > 0 && defense <= threshold
    ? 1.5 - 0.5 * clamp(defense / threshold, 0, 1)
    : threshold <= 0 && defense <= 0 ? 1.5 : 1;
  return Math.round(damage * criticalMultiplier * defenseMultiplier);
}

function barrierMultiplier(task: AdventureTask, fighters: Fighter[]): number {
  if (task.config.selectedElement === "force") return 1;
  const entries = Object.entries(task.barrier).filter((entry): entry is [PartyUnit["element"], number] => typeof entry[1] === "number");
  if (!entries.length) return 1;
  const tokenToElement = { fire: "火", water: "水", earth: "土", air: "风", light: "光", dark: "暗" } as const;
  const selected = task.config.selectedElement ? tokenToElement[task.config.selectedElement] : undefined;
  const candidates = selected ? entries.filter(([element]) => element === selected) : entries;
  const effective = Math.floor(Math.max(...candidates.map(([element]) => fighters.reduce((sum, fighter) =>
    sum + (fighter.allElements ? fighter.elementPower * 0.5 : fighter.element === element ? fighter.elementPower : 0), 0))));
  return effective >= (candidates[0]?.[1] ?? 0) ? 1 : 0.2;
}

function prepare(input: SimulationWorkerInput): PreparedSimulation {
  const { task, quest } = input;
  const difficulty = ({ 中等: 1.25, 困难: 1.5, 究极: 1.75 } as Record<string, number>)[task.difficulty] ?? 1;
  const combat = quest?.combat;
  const fighters: Fighter[] = input.units.map((unit) => ({
    id: unit.id,
    health: Math.max(1, Math.round(unit.stats.health)),
    attack: Math.max(1, Math.round(unit.stats.attack)),
    defense: Math.max(0, Math.round(unit.stats.defense)),
    evasion: clamp(normalizeRate(unit.stats.evasion), 0, 0.75),
    critical: clamp(normalizeRate(unit.stats.crit), 0, 1),
    criticalDamage: Math.max(1, normalizeRate(unit.stats.criticalDamage ?? 200)),
    element: unit.element,
    elementPower: unit.stats.element ?? 0,
    threat: unit.stats.aggro ?? 1,
    regeneration: 0,
    allElements: unit.allElements ?? false,
    timedEvasion: [],
    ...("classId" in unit && unit.classId ? { classId: unit.classId } : {}),
    ...(unit.classType ? { classType: unit.classType } : {}),
  }));
  const enemy: Enemy = {
    health: Math.round(combat?.health || 22000 * difficulty),
    attack: Math.round(combat?.attack || 720 * difficulty),
    defense: Math.round(combat?.defense || 0),
    evasion: 0,
    critical: combat?.criticalChance || 0.1,
    baseCritical: combat?.criticalChance || 0.1,
    criticalDamage: combat?.criticalDamage || 1.5,
    maxRounds: task.config.titanTower ? 25 : 20,
  };
  const boostLevel = task.config.boosterLevel ?? (task.config.booster ? 1 : 0);
  const boost = booster[boostLevel] ?? booster[0]!;
  const eliteKind = task.config.eliteKind ?? (task.config.elite ? "epic" : "none");
  const elite = eliteModifier[eliteKind] ?? {};
  const selectedModifiers = (task.config.towerModifiers ?? [])
    .map((id) => input.modifiers[id])
    .filter((modifier): modifier is CatalogSimulationModifier => Boolean(modifier));
  const environment = {
    health: elite.health ?? 0,
    attack: elite.attack ?? 0,
    evasion: elite.evasion ?? 0,
    critical: elite.critical ?? 0,
    criticalDamage: 0,
  };
  const eliteRecord = input.modifiers[eliteKind];
  let areaChanceDelta = eliteRecord?.areaChance ?? 0;
  let areaDamageDelta = eliteRecord?.areaDamage ?? 0;
  let monsterDamagePerRound = 0;
  const timedMonsterModifiers: NonNullable<AdvancedCombatRuleSet["timedMonsterModifiers"]> = [];

  for (const modifier of selectedModifiers) {
    environment.health += modifier.monsterHealth;
    environment.evasion += modifier.monsterEvasion;
    environment.criticalDamage += modifier.monsterCriticalDamage;
    if (modifier.duration > 0 && (modifier.monsterAttack !== 0 || modifier.monsterCriticalChance !== 0)) {
      timedMonsterModifiers.push({
        duration: modifier.duration,
        damageDelta: modifier.monsterAttack,
        criticalChanceDelta: modifier.monsterCriticalChance,
      });
    } else {
      environment.attack += modifier.monsterAttack;
      environment.critical += modifier.monsterCriticalChance;
    }
    areaChanceDelta += modifier.areaChance;
    areaDamageDelta += modifier.areaDamage;
    monsterDamagePerRound += modifier.monsterDamagePerRound;
  }

  for (const fighter of fighters) {
    let attackDelta = 0;
    let healthDelta = 0;
    let evasionDelta = 0;
    let criticalDelta = 0;
    let criticalDamageDelta = 0;
    let threatDelta = 0;
    for (const modifier of selectedModifiers) {
      if (modifier.classes?.length && (!fighter.classType || !modifier.classes.includes(fighter.classType))) continue;
      attackDelta += modifier.fighterAttack;
      healthDelta += modifier.fighterHealth;
      criticalDelta += modifier.fighterCriticalChance;
      criticalDamageDelta += modifier.fighterCriticalDamage;
      fighter.regeneration += modifier.regeneration;
      threatDelta += modifier.aggro;
      if (modifier.fighterEvasion !== 0 && modifier.duration > 0) {
        fighter.timedEvasion.push({ duration: modifier.duration, delta: modifier.fighterEvasion });
      } else {
        evasionDelta += modifier.fighterEvasion;
      }
    }
    if (attackDelta !== 0) {
      const preBoosterMultiplier = (1 + attackDelta + boost.attack) / (1 + boost.attack);
      fighter.attack = Math.round(fighter.attack * Math.max(0, preBoosterMultiplier));
    }
    if (healthDelta !== 0) fighter.health = Math.round(fighter.health * Math.max(0, 1 + healthDelta));
    fighter.evasion = clamp(fighter.evasion + evasionDelta, 0, 0.75);
    fighter.critical = clamp(fighter.critical + criticalDelta, 0, 1);
    fighter.criticalDamage = Math.max(0, fighter.criticalDamage + criticalDamageDelta);
    if (fighter.threat > 0) fighter.threat *= 1 + Math.max(0, threatDelta);
  }

  for (const fighter of fighters) {
    fighter.attack = Math.round(fighter.attack * (1 + boost.attack));
    fighter.defense = Math.round(fighter.defense * (1 + boost.defense));
    fighter.critical = clamp(fighter.critical + boost.critical, 0, 1);
    fighter.criticalDamage = Math.max(1, fighter.criticalDamage + boost.criticalDamage);
  }
  enemy.health = Math.round(enemy.health * Math.max(0, 1 + environment.health));
  enemy.attack = Math.round(enemy.attack * Math.max(0, 1 + environment.attack));
  enemy.evasion = clamp(enemy.evasion + environment.evasion, 0, 0.75);
  enemy.critical = clamp(enemy.critical * (1 + environment.critical), 0, 1);
  enemy.criticalDamage = Math.max(1, enemy.criticalDamage + environment.criticalDamage);

  if (task.config.titanTower) {
    const curse = input.modifiers[`si_tombcurse${task.config.tombCurseBooster ?? 0}`]?.tombCurse ?? 0;
    const titan = titanBonuses(task.config.tombFloor ?? Number(task.questId?.match(/\d+/)?.[0] ?? 1), curse);
    enemy.health = Math.round(enemy.health * (1 + titan.health));
    enemy.attack = Math.round(enemy.attack * (1 + titan.attack));
    enemy.defense = Math.round(enemy.defense * (1 + titan.defense));
  }

  const hasAreaAttack = Boolean(combat?.areaChance && combat.areaDamage && enemy.attack > 0);
  const areaAttack = hasAreaAttack ? {
    chance: normalizeRate(combat!.areaChance * (1 + areaChanceDelta)),
    damageRatio: combat!.areaDamage * (1 + areaDamageDelta) / enemy.attack,
  } : undefined;
  const rules: AdvancedCombatRuleSet = {
    ...(combat?.defenseThreshold ? { defenseThreshold: combat.defenseThreshold } : {}),
    ...(timedMonsterModifiers.length ? { timedMonsterModifiers } : {}),
    ...(monsterDamagePerRound ? { monsterDamagePerRound } : {}),
    ...(areaAttack ? { areaAttack } : {}),
  };
  const hasTimekeeper = fighters.some((fighter) => fighter.classId === "timekeeper");
  const hasChronomancer = fighters.some((fighter) => fighter.classId === "chronomancer");
  return {
    fighters,
    enemy,
    partyDamageMultiplier: barrierMultiplier(task, fighters),
    rules,
    retry: hasTimekeeper ? "timekeeper" : hasChronomancer ? "chronomancer" : "none",
    seed: task.config.seed || 1,
    iterations: clamp(task.config.iterations, 1, 100000),
  };
}

function berserkerStage(health: number, maximum: number, thresholds: [number, number, number]): number {
  if (health <= 0 || maximum <= 0 || health >= thresholds[0] * maximum) return 0;
  if (health >= thresholds[1] * maximum) return 1;
  if (health >= thresholds[2] * maximum) return 2;
  return 3;
}

function weightedTarget(fighters: Fighter[], living: boolean[], roll: number): number {
  const total = fighters.reduce((sum, fighter, index) => sum + (living[index] ? Math.max(0, fighter.threat) : 0), 0);
  if (total <= 0) return living.findIndex(Boolean);
  let cursor = roll * total;
  for (let index = fighters.length - 1; index >= 0; index -= 1) {
    if (!living[index]) continue;
    cursor -= Math.max(0, fighters[index]!.threat);
    if (cursor <= 0) return index;
  }
  return living.findIndex(Boolean);
}

function runOnce(
  fighters: Fighter[],
  enemy: Enemy,
  partyDamageMultiplier: number,
  rules: AdvancedCombatRuleSet,
  random: ChaCha8Rng,
): AttemptState {
  let enemyHealth = enemy.health;
  const maximumHealth = fighters.map((fighter) => fighter.health);
  const health = [...maximumHealth];
  const dealt = fighters.map(() => 0);
  const focusLostRound: Array<number | undefined> = fighters.map(() => undefined);
  const protector = rules.protectorId ? fighters.findIndex((fighter) => fighter.id === rules.protectorId) : -1;
  let protectorAvailable = protector >= 0;

  for (let round = 1; round <= Math.max(1, enemy.maxRounds); round += 1) {
    for (let index = 0; index < fighters.length; index += 1) {
      const focus = rules.openingFocus?.[fighters[index]!.id];
      const lost = focusLostRound[index];
      if (lost !== undefined && focus?.recoverAfterRounds !== undefined && round >= lost + focus.recoverAfterRounds) {
        focusLostRound[index] = undefined;
      }
    }
    const living = health.map((value) => value > 0);
    const livingIndices = living.flatMap((alive, index) => alive ? [index] : []);
    if (!livingIndices.length) return { won: false, rounds: round, health, damage: dealt };
    const timedDamage = (rules.timedMonsterModifiers ?? [])
      .filter((modifier) => round <= modifier.duration)
      .reduce((sum, modifier) => sum + modifier.damageDelta, 0);
    const timedCritical = (rules.timedMonsterModifiers ?? [])
      .filter((modifier) => round <= modifier.duration)
      .reduce((sum, modifier) => sum + modifier.criticalChanceDelta, 0);
    const roundMultiplier = (1 + (rules.monsterDamagePerRound ?? 0) * (round - 1)) * (1 + timedDamage);
    const isArea = rules.areaAttack !== undefined
      && livingIndices.length > 1
      && random.nextFloat64() < rules.areaAttack.chance;
    const targets = isArea ? livingIndices : [weightedTarget(fighters, living, random.nextFloat64())];

    for (const target of targets) {
      const fighter = fighters[target]!;
      const berserker = rules.berserker?.[fighter.id];
      const stage = berserker ? berserkerStage(health[target]!, maximumHealth[target]!, berserker.hpThresholds) : 0;
      const focus = focusLostRound[target] === undefined ? rules.openingFocus?.[fighter.id] : undefined;
      const timedEvasion = fighter.timedEvasion
        .filter((modifier) => round <= modifier.duration)
        .reduce((sum, modifier) => sum + modifier.delta, 0);
      const evasion = clamp(
        fighter.evasion + timedEvasion + (berserker?.evasionPerStage ?? 0) * stage + (focus?.evasion ?? 0),
        0,
        0.75,
      );
      if (random.nextFloat64() < evasion) continue;
      const threshold = rules.defenseThreshold;
      const normal = threshold !== undefined
        ? normalDamageAfterThreshold(fighter.defense, enemy.attack, threshold)
        : enemy.attack * 100 / (100 + fighter.defense);
      const critical = threshold !== undefined
        ? criticalDamageAfterThreshold(fighter.defense, threshold, enemy.attack, enemy.criticalDamage)
        : normal * enemy.criticalDamage;
      const damage = isArea
        ? Math.ceil(normal * (rules.areaAttack?.damageRatio ?? 1))
        : Math.round((random.nextFloat64() < clamp(enemy.critical + enemy.baseCritical * timedCritical, 0, 1) ? critical : normal) * roundMultiplier);
      const previous = health[target]!;
      health[target] = Math.max(0, previous - damage);
      if (damage > 0 && rules.openingFocus?.[fighter.id]) focusLostRound[target] = round;
      if (health[target] <= 0 && protectorAvailable && protector !== target && health[protector]! > 0) {
        protectorAvailable = false;
        health[target] = previous;
        health[protector] = Math.max(0, health[protector]! - damage);
        if (damage > 0 && rules.openingFocus?.[fighters[protector]!.id]) focusLostRound[protector] = round;
      }
    }
    if (health.every((value) => value <= 0)) return { won: false, rounds: round, health, damage: dealt };

    for (let index = 0; index < fighters.length; index += 1) {
      const fighter = fighters[index]!;
      if (health[index]! <= 0 || random.nextFloat64() < clamp(enemy.evasion, 0, 0.75)) continue;
      const berserker = rules.berserker?.[fighter.id];
      const stage = berserker ? berserkerStage(health[index]!, maximumHealth[index]!, berserker.hpThresholds) : 0;
      const focus = focusLostRound[index] === undefined ? rules.openingFocus?.[fighter.id] : undefined;
      const critical = random.nextFloat64() < clamp(fighter.critical + (focus?.criticalChance ?? 0), 0, 1);
      const raw = fighter.attack * (1 + (berserker?.attackPerStage ?? 0) * stage) * (critical ? fighter.criticalDamage : 1);
      const damage = raw * 100 / (100 + enemy.defense) * partyDamageMultiplier;
      enemyHealth -= damage;
      dealt[index]! += damage;
    }
    if (enemyHealth <= 0) return { won: true, rounds: round, health, damage: dealt };
    for (let index = 0; index < fighters.length; index += 1) {
      if (health[index]! > 0) health[index] = Math.min(maximumHealth[index]!, health[index]! + fighters[index]!.regeneration);
    }
  }
  return { won: enemyHealth <= 0, rounds: Math.max(1, enemy.maxRounds), health, damage: dealt };
}

function createAccumulator(memberCount: number): AttemptAccumulator {
  return {
    attempts: 0,
    wins: 0,
    successfulRounds: 0,
    minimumSuccessfulRounds: Number.POSITIVE_INFINITY,
    maximumSuccessfulRounds: 0,
    survived: Array.from({ length: memberCount }, () => 0),
    damages: Array.from({ length: memberCount }, () => 0),
    remaining: Array.from({ length: memberCount }, () => 0),
  };
}

function recordAttempt(accumulator: AttemptAccumulator, state: AttemptState): void {
  accumulator.attempts += 1;
  if (state.won) {
    accumulator.wins += 1;
    accumulator.successfulRounds += state.rounds;
    accumulator.minimumSuccessfulRounds = Math.min(accumulator.minimumSuccessfulRounds, state.rounds);
    accumulator.maximumSuccessfulRounds = Math.max(accumulator.maximumSuccessfulRounds, state.rounds);
  }
  for (let index = 0; index < state.health.length; index += 1) {
    if (state.health[index]! > 0) accumulator.survived[index]! += 1;
    accumulator.damages[index]! += state.damage[index]!;
    accumulator.remaining[index]! += Math.max(0, state.health[index]!);
  }
}

function finishAttempt(accumulator: AttemptAccumulator, fighters: Fighter[]): SimulationAttemptResult {
  const count = accumulator.attempts;
  return {
    iterations: count,
    successRate: count ? accumulator.wins / count * 100 : 0,
    averageTurns: accumulator.wins ? accumulator.successfulRounds / accumulator.wins : 0,
    minTurns: accumulator.wins ? accumulator.minimumSuccessfulRounds : 0,
    maxTurns: accumulator.wins ? accumulator.maximumSuccessfulRounds : 0,
    memberResults: fighters.map((fighter, index) => ({
      id: fighter.id,
      survivalRate: count ? accumulator.survived[index]! / count * 100 : 0,
      averageDamage: count ? accumulator.damages[index]! / count : 0,
      averageRemainingHealth: count ? accumulator.remaining[index]! / count : 0,
    })),
  };
}

function withTimekeeperBooster(prepared: PreparedSimulation): PreparedSimulation {
  const minimum = booster[1]!;
  const fighters = prepared.fighters.map((fighter) => ({
    ...fighter,
    timedEvasion: fighter.timedEvasion.map((entry) => ({ ...entry })),
    attack: Math.round(fighter.attack * (1 + minimum.attack)),
    defense: Math.round(fighter.defense * (1 + minimum.defense)),
    critical: clamp(fighter.critical + minimum.critical, 0, 1),
    criticalDamage: Math.max(1, fighter.criticalDamage + minimum.criticalDamage),
  }));
  return { ...prepared, fighters };
}

function execute(
  prepared: PreparedSimulation,
  onProgress?: (completed: number, total: number) => void,
): {
  first: SimulationAttemptResult;
  second?: SimulationAttemptResult;
  successRate: number;
  overallMemberResults: Array<{ id: string; survivalRate: number }>;
} {
  const random = new ChaCha8Rng(prepared.seed);
  const firstAccumulator = createAccumulator(prepared.fighters.length);
  const secondPrepared = prepared.retry === "timekeeper" ? withTimekeeperBooster(prepared) : prepared;
  const secondAccumulator = createAccumulator(prepared.fighters.length);
  const overallSurvived = prepared.fighters.map(() => 0);
  let overallWins = 0;
  const reportEvery = Math.max(1, Math.floor(prepared.iterations / 100));

  for (let iteration = 0; iteration < prepared.iterations; iteration += 1) {
    const firstState = runOnce(prepared.fighters, prepared.enemy, prepared.partyDamageMultiplier, prepared.rules, random);
    recordAttempt(firstAccumulator, firstState);
    const finalState = !firstState.won && prepared.retry !== "none"
      ? runOnce(secondPrepared.fighters, secondPrepared.enemy, secondPrepared.partyDamageMultiplier, secondPrepared.rules, random)
      : firstState;
    if (finalState !== firstState) recordAttempt(secondAccumulator, finalState);
    if (finalState.won) {
      overallWins += 1;
      for (let index = 0; index < finalState.health.length; index += 1) {
        if (finalState.health[index]! > 0) overallSurvived[index]! += 1;
      }
    }
    if ((iteration + 1) % reportEvery === 0 || iteration + 1 === prepared.iterations) {
      onProgress?.(iteration + 1, prepared.iterations);
    }
  }
  return {
    first: finishAttempt(firstAccumulator, prepared.fighters),
    ...(secondAccumulator.attempts ? { second: finishAttempt(secondAccumulator, secondPrepared.fighters) } : {}),
    successRate: overallWins / prepared.iterations * 100,
    overallMemberResults: prepared.fighters.map((fighter, index) => ({
      id: fighter.id,
      survivalRate: overallSurvived[index]! / prepared.iterations * 100,
    })),
  };
}

export function runAdvancedSimulationFixture(fixture: AdvancedSimulationFixture): SimulationAttemptResult {
  const fighters: Fighter[] = fixture.fighters.map((fighter) => ({
    ...fighter,
    element: "光",
    elementPower: 0,
    threat: fighter.threat ?? 1,
    regeneration: fighter.regeneration ?? 0,
    allElements: false,
    timedEvasion: [],
  }));
  const prepared: PreparedSimulation = {
    fighters,
    enemy: { ...fixture.enemy, baseCritical: fixture.enemy.baseCritical ?? fixture.enemy.critical },
    partyDamageMultiplier: fixture.partyDamageMultiplier ?? 1,
    rules: fixture.rules ?? {},
    retry: "none",
    seed: fixture.seed,
    iterations: fixture.iterations,
  };
  return execute(prepared).first;
}

export function runSimulation(
  input: SimulationWorkerInput,
  onProgress?: (completed: number, total: number) => void,
): SimulationResult {
  if (!input.units.length) throw new Error("队伍不能为空");
  const prepared = prepare(input);
  const attempts = execute(prepared, onProgress);
  const first = attempts.first;
  const memberResults = first.memberResults.map((member) => ({
    ...member,
    survivalRate: attempts.overallMemberResults.find((entry) => entry.id === member.id)?.survivalRate ?? member.survivalRate,
  }));
  return {
    seed: prepared.seed,
    iterations: first.iterations,
    successRate: attempts.successRate,
    averageTurns: first.averageTurns,
    minTurns: first.minTurns,
    maxTurns: first.maxTurns,
    survivalRate: attempts.overallMemberResults.reduce((sum, member) => sum + member.survivalRate, 0)
      / attempts.overallMemberResults.length,
    averageDamage: first.memberResults.reduce((sum, member) => sum + member.averageDamage, 0),
    averageRemainingHealth: first.memberResults.reduce((sum, member) => sum + member.averageRemainingHealth, 0),
    memberResults,
    firstAttempt: first,
    ...(attempts.second ? { secondAttempt: attempts.second, hasSecondAttempt: true } : { hasSecondAttempt: false }),
    ...(prepared.retry !== "none" ? { overallMemberResults: attempts.overallMemberResults } : {}),
    simulatorVersion: "hero-simulator-ts-1.0.0",
    gameDataVersion: input.task.gameDataVersion ?? "unknown",
    completedAt: new Date().toISOString(),
    stale: false,
  };
}
