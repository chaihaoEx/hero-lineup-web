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

console.log(`Subpath build verified at ${expectedBase}`);
