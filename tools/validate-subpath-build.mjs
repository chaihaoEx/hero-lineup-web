#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(process.argv[2] ?? "dist-subpath");
const expectedBase = process.argv[3] ?? "/hero-lineup/";
const [html, manifestText, serviceWorker] = await Promise.all([
  readFile(resolve(root, "index.html"), "utf8"),
  readFile(resolve(root, "manifest.webmanifest"), "utf8"),
  readFile(resolve(root, "sw.js"), "utf8"),
]);
const manifest = JSON.parse(manifestText);

if (!html.includes(`${expectedBase}assets/`)) throw new Error(`index assets do not use ${expectedBase}`);
if (manifest.start_url !== expectedBase) throw new Error(`manifest.start_url is ${String(manifest.start_url)}, expected ${expectedBase}`);
if (!serviceWorker.includes(`${expectedBase}index.html`)) throw new Error(`Service Worker fallback does not use ${expectedBase}`);

const precachedUrls = [...serviceWorker.matchAll(/\{url:"([^"]+)"/g)].map((match) => match[1]);
if (precachedUrls.length > 100) throw new Error(`Service Worker eagerly precaches ${precachedUrls.length} files; expected at most 100`);
if (precachedUrls.some((url) => url.includes("content/Sprite/"))) throw new Error("Service Worker must cache sprites on demand instead of precaching them");
for (const path of ["content/manifest.json", "content/TextAsset/items.json", "content/TextAsset/texts_zh.json"]) {
  if (!precachedUrls.includes(path)) throw new Error(`Service Worker does not precache ${path}`);
}

console.log(`Subpath build verified at ${expectedBase}: ${precachedUrls.length} core files precached, sprites cached on demand`);
