import type { BuildTemplate, CanonicalSystem } from "../types/domain";
import Ajv2020, { type ValidateFunction } from "ajv/dist/2020";
import addFormats from "ajv-formats";
import { SIMULATOR_VERSION } from "./simulationCore";
import { rustBackupJson, rustLineupJson } from "./rustJson";

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
const CONTENT_ROOT = `${import.meta.env.BASE_URL}content`.replace(/\/+$/, "");
let validatorsPromise: Promise<Record<PortableEnvelope<unknown>["format"], ValidateFunction>> | undefined;

async function validators(): Promise<Record<PortableEnvelope<unknown>["format"], ValidateFunction>> {
  validatorsPromise ??= Promise.all([
    fetch(`${CONTENT_ROOT}/schemas/zyslineup.schema.json`).then((response) => {
      if (!response.ok) throw new Error(`无法加载体系 schema (${response.status})`);
      return response.json() as Promise<object>;
    }),
    fetch(`${CONTENT_ROOT}/schemas/zysbackup.schema.json`).then((response) => {
      if (!response.ok) throw new Error(`无法加载备份 schema (${response.status})`);
      return response.json() as Promise<object>;
    }),
  ]).then(([lineupSchema, sourceBackupSchema]) => {
    const backupSchema = JSON.parse(JSON.stringify(sourceBackupSchema).replaceAll(
      "zyslineup.schema.json#",
      "urn:zys:schema:lineup:1#",
    )) as object;
    const ajv = new Ajv2020({ allErrors: true, strict: false });
    addFormats(ajv);
    ajv.addSchema(lineupSchema);
    return {
      zyslineup: ajv.getSchema("urn:zys:schema:lineup:1")!,
      zysbackup: ajv.compile(backupSchema),
    };
  });
  return validatorsPromise;
}

async function assertSchema(format: PortableEnvelope<unknown>["format"], value: unknown): Promise<void> {
  const validate = (await validators())[format];
  if (validate(value)) return;
  const detail = validate.errors?.slice(0, 3).map((error) => `${error.instancePath || "/"} ${error.message ?? "无效"}`).join("；");
  throw new Error(`${format} schema 校验失败${detail ? `：${detail}` : ""}`);
}

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

async function sha256Text(value: string): Promise<string> {
  const bytes = textEncoder.encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function encodeEnvelope<T>(
  format: PortableEnvelope<T>["format"],
  payload: T,
  versions: Versions,
  checksumJson: string,
): Promise<string> {
  assertVersions(versions);
  const envelope: PortableEnvelope<T> = {
    format,
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    versions,
    checksumSha256: await sha256Text(checksumJson),
    payload,
  };
  await assertSchema(format, envelope);
  return JSON.stringify(envelope, null, 2);
}

async function decodeEnvelope<T>(
  source: string,
  expectedFormat: PortableEnvelope<T>["format"],
  checksumJson: (payload: T) => string,
): Promise<{ payload: T; versions: Versions }> {
  let raw: unknown;
  try {
    raw = JSON.parse(source);
  } catch {
    throw new Error("文件不是有效 JSON");
  }
  await assertSchema(expectedFormat, raw);
  if (!raw || typeof raw !== "object") throw new Error("文件内容无效");
  const envelope = raw as Partial<PortableEnvelope<T>>;
  if (envelope.format !== expectedFormat) throw new Error(`文件格式不是 ${expectedFormat}`);
  if ((envelope.schemaVersion ?? 0) > 1) throw new Error(`不支持 schema ${String(envelope.schemaVersion)}`);
  if (!envelope.versions || envelope.payload === undefined || !envelope.checksumSha256) {
    throw new Error("文件缺少版本、内容或 checksum");
  }
  assertVersions(envelope.versions);
  if (await sha256Text(checksumJson(envelope.payload)) !== envelope.checksumSha256) throw new Error("文件 checksum 校验失败");
  return { payload: envelope.payload, versions: envelope.versions };
}

export function webVersions(gameDataVersion: string, assetVersion = "web-static-content"): Versions {
  return {
    appVersion: "0.1.0",
    gameDataVersion: gameDataVersion || "unknown",
    simulatorVersion: SIMULATOR_VERSION,
    assetVersion,
  };
}

export async function encodeLineup(system: CanonicalSystem, versions: Versions): Promise<string> {
  assertCanonicalSystem(system);
  return encodeEnvelope("zyslineup", system, versions, rustLineupJson(system));
}

export async function decodeLineup(
  source: string,
): Promise<{ system: CanonicalSystem; versions: Versions }> {
  const decoded = await decodeEnvelope<CanonicalSystem>(source, "zyslineup", rustLineupJson);
  assertCanonicalSystem(decoded.payload);
  return { system: decoded.payload, versions: decoded.versions };
}

export async function encodeBackup(backup: CanonicalBackup, versions: Versions): Promise<string> {
  backup.systems.forEach(assertCanonicalSystem);
  return encodeEnvelope("zysbackup", backup, versions, rustBackupJson(backup));
}

export async function decodeBackup(
  source: string,
): Promise<{ backup: CanonicalBackup; versions: Versions }> {
  const decoded = await decodeEnvelope<CanonicalBackup>(source, "zysbackup", rustBackupJson);
  if (!Array.isArray(decoded.payload.systems) || !Array.isArray(decoded.payload.templates)) {
    throw new Error("备份结构无效");
  }
  decoded.payload.systems.forEach(assertCanonicalSystem);
  return { backup: decoded.payload, versions: decoded.versions };
}
