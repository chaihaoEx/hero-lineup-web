#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFile, readdir, stat } from "node:fs/promises";
import { join, normalize, relative, resolve, sep } from "node:path";

const root = resolve(process.argv[2] ?? "public/content");
const manifestPath = join(root, "manifest.json");
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));

if (!Array.isArray(manifest.files)) {
  throw new Error("manifest.files must be an array");
}

let totalBytes = 0;
let jsonDocuments = 0;
const manifestPaths = new Set();
const documents = new Map();
for (const expected of manifest.files) {
  if (typeof expected.path !== "string" || expected.path.includes("\\")) {
    throw new Error(`non-portable manifest path: ${String(expected.path)}`);
  }

  const path = normalize(join(root, expected.path));
  if (path !== root && !path.startsWith(`${root}${sep}`)) {
    throw new Error(`unsafe manifest path: ${expected.path}`);
  }

  const details = await stat(path);
  if (!details.isFile() || details.size !== expected.size) {
    throw new Error(`size mismatch: ${expected.path}`);
  }

  const bytes = await readFile(path);
  const digest = createHash("sha256").update(bytes).digest("hex");
  if (digest !== expected.sha256) {
    throw new Error(`checksum mismatch: ${expected.path}`);
  }
  if (manifestPaths.has(expected.path)) throw new Error(`duplicate manifest path: ${expected.path}`);
  manifestPaths.add(expected.path);
  if (expected.path.endsWith(".json")) {
    try {
      documents.set(expected.path, JSON.parse(bytes.toString("utf8")));
      jsonDocuments += 1;
    } catch (error) {
      throw new Error(`invalid JSON: ${expected.path}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  totalBytes += bytes.byteLength;
}

if (manifest.files.some((entry) => entry.path === "manifest.json")) {
  throw new Error("manifest must not include itself");
}

async function allFiles(directory) {
  const result = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) result.push(...await allFiles(path));
    else if (entry.isFile()) result.push(relative(root, path).split(sep).join("/"));
  }
  return result;
}

const diskPaths = new Set((await allFiles(root)).filter((path) => path !== "manifest.json"));
for (const path of diskPaths) {
  if (!manifestPaths.has(path)) throw new Error(`content file missing from manifest: ${path}`);
}
for (const path of manifestPaths) {
  if (!diskPaths.has(path)) throw new Error(`manifest references missing content file: ${path}`);
}

const statistics = manifest.statistics ?? {};
const expectedStatistics = {
  bytes: totalBytes,
  files: manifest.files.length,
  jsonDocuments,
  sprites: manifest.files.filter((entry) => entry.kind === "sprite").length,
};
for (const [key, actual] of Object.entries(expectedStatistics)) {
  if (statistics[key] !== actual) throw new Error(`manifest.statistics.${key} expected ${actual}, got ${String(statistics[key])}`);
}

const requiredDocument = (path) => {
  const value = documents.get(path);
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`required object document missing: ${path}`);
  return value;
};
const classes = requiredDocument("TextAsset/classes.json");
const heroes = requiredDocument("TextAsset/heroes.json");
const quests = requiredDocument("TextAsset/quests.json");
const items = requiredDocument("TextAsset/items.json");
const skills = requiredDocument("TextAsset/skills.json");
const modifiers = requiredDocument("TextAsset/qmodifiers.json");
const levels = requiredDocument("TextAsset/levels.json").levels;
const texts = requiredDocument("TextAsset/texts_zh.json").texts;
const rawCounts = {
  classes: Object.keys(classes).length,
  heroes: Object.keys(heroes).length,
  quests: Object.keys(quests).length,
  items: Object.keys(items).length,
  skills: Object.keys(skills).length,
  qmodifiers: Object.keys(modifiers).length,
  levels: Array.isArray(levels) ? levels.length : 0,
  texts_zh: texts && typeof texts === "object" && !Array.isArray(texts) ? Object.keys(texts).length : 0,
};
for (const [key, actual] of Object.entries(rawCounts)) {
  if (statistics[key] !== actual) throw new Error(`manifest.statistics.${key} expected ${actual}, got ${String(statistics[key])}`);
}

const skillFamilies = new Set(Object.values(skills).map((skill) => skill?.family).filter((value) => typeof value === "string"));
for (const [id, value] of Object.entries(classes)) {
  if (value?.innate && !skillFamilies.has(value.innate)) throw new Error(`class ${id} references missing innate skill family ${value.innate}`);
  if (!manifestPaths.has(`Sprite/icon_global_class_${id}.png`)) throw new Error(`class ${id} is missing its sprite`);
}
for (const [id, value] of Object.entries(heroes)) {
  if (value?.class && !Object.hasOwn(classes, value.class)) throw new Error(`champion ${id} references missing class ${value.class}`);
  for (let slot = 1; slot <= 4; slot += 1) {
    const skill = value?.[`skill${slot}`];
    if (skill && !Object.hasOwn(modifiers, skill)) throw new Error(`champion ${id} references missing team skill ${skill}`);
  }
  if (!manifestPaths.has(`Sprite/icon_global_${id}.png`)) throw new Error(`champion ${id} is missing its sprite`);
}
for (const [id, value] of Object.entries(items)) {
  if (value?.skill && !Object.hasOwn(modifiers, value.skill) && !Object.hasOwn(skills, value.skill)) {
    throw new Error(`item ${id} references missing skill ${value.skill}`);
  }
  for (const field of ["lTag2", "lTag3"]) {
    if (value?.[field] && !Object.hasOwn(items, value[field])) throw new Error(`item ${id} references missing ${field} item ${value[field]}`);
  }
  if (Number(value?.tier) > 0 && !manifestPaths.has(`Sprite/${id}.png`)) throw new Error(`item ${id} is missing its sprite`);
}

console.log(`Content verified: ${manifest.files.length} files, ${jsonDocuments} JSON documents, ${totalBytes} bytes, references valid.`);
