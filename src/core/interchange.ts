import type { BuildTemplate, CanonicalSystem } from "../types/domain";

export interface Versions {
  appVersion: string;
  gameDataVersion: string;
  simulatorVersion: string;
  assetVersion: string;
}

interface PortableEnvelope<T> {
  format: "zyslineup" | "zysbackup";
  schemaVersion: number;
  exportedAt: string;
  versions: Versions;
  checksumSha256: string;
  payload: T;
}

export interface CanonicalBackup {
  systems: CanonicalSystem[];
  templates: BuildTemplate[];
  settings: Record<string, unknown>;
}

const textEncoder = new TextEncoder();

function assertVersions(versions: Versions): void {
  for (const [name, value] of Object.entries(versions)) {
    if (typeof value !== "string" || !value.trim()) throw new Error(`${name} 不能为空`);
  }
}

function assertCanonicalSystem(system: CanonicalSystem): void {
  if (!system || typeof system !== "object") throw new Error("体系内容无效");
  if (!system.id || !system.name.trim()) throw new Error("体系缺少 id 或名称");
  if (!Array.isArray(system.heroes) || !Array.isArray(system.champions)) throw new Error("体系成员结构无效");
  if (!Array.isArray(system.groups) || !Array.isArray(system.adventureTasks)) throw new Error("体系任务结构无效");
}

async function sha256(value: unknown): Promise<string> {
  const bytes = textEncoder.encode(JSON.stringify(value));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function encodeEnvelope<T>(
  format: PortableEnvelope<T>["format"],
  payload: T,
  versions: Versions,
): Promise<string> {
  assertVersions(versions);
  const envelope: PortableEnvelope<T> = {
    format,
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    versions,
    checksumSha256: await sha256(payload),
    payload,
  };
  return JSON.stringify(envelope, null, 2);
}

async function decodeEnvelope<T>(
  source: string,
  expectedFormat: PortableEnvelope<T>["format"],
): Promise<{ payload: T; versions: Versions }> {
  let raw: unknown;
  try {
    raw = JSON.parse(source);
  } catch {
    throw new Error("文件不是有效 JSON");
  }
  if (!raw || typeof raw !== "object") throw new Error("文件内容无效");
  const envelope = raw as Partial<PortableEnvelope<T>>;
  if (envelope.format !== expectedFormat) throw new Error(`文件格式不是 ${expectedFormat}`);
  if ((envelope.schemaVersion ?? 0) > 1) throw new Error(`不支持 schema ${String(envelope.schemaVersion)}`);
  if (!envelope.versions || envelope.payload === undefined || !envelope.checksumSha256) {
    throw new Error("文件缺少版本、内容或 checksum");
  }
  assertVersions(envelope.versions);
  if (await sha256(envelope.payload) !== envelope.checksumSha256) throw new Error("文件 checksum 校验失败");
  return { payload: envelope.payload, versions: envelope.versions };
}

export function webVersions(gameDataVersion: string, assetVersion = "web-static-content"): Versions {
  return {
    appVersion: "0.1.0",
    gameDataVersion: gameDataVersion || "unknown",
    simulatorVersion: "hero-simulator-ts-0.1.0",
    assetVersion,
  };
}

export async function encodeLineup(system: CanonicalSystem, versions: Versions): Promise<string> {
  assertCanonicalSystem(system);
  return encodeEnvelope("zyslineup", system, versions);
}

export async function decodeLineup(
  source: string,
): Promise<{ system: CanonicalSystem; versions: Versions }> {
  const decoded = await decodeEnvelope<CanonicalSystem>(source, "zyslineup");
  assertCanonicalSystem(decoded.payload);
  return { system: decoded.payload, versions: decoded.versions };
}

export async function encodeBackup(backup: CanonicalBackup, versions: Versions): Promise<string> {
  backup.systems.forEach(assertCanonicalSystem);
  return encodeEnvelope("zysbackup", backup, versions);
}

export async function decodeBackup(
  source: string,
): Promise<{ backup: CanonicalBackup; versions: Versions }> {
  const decoded = await decodeEnvelope<CanonicalBackup>(source, "zysbackup");
  if (!Array.isArray(decoded.payload.systems) || !Array.isArray(decoded.payload.templates)) {
    throw new Error("备份结构无效");
  }
  decoded.payload.systems.forEach(assertCanonicalSystem);
  return { backup: decoded.payload, versions: decoded.versions };
}
