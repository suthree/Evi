import { lstat, readFile } from "node:fs/promises";
import { isAbsolute, join, resolve } from "node:path";

import {
  assertAssetSelectionLockHash,
  assetSelectionLockSchema,
  type AssetSelectionLock
} from "./asset_projection.js";
import {
  projectionPointerSchema,
  type ProjectionPointer
} from "./projection_activation.js";

const MAX_PROJECTION_METADATA_BYTES = 128 * 1024;

export type AssetProjectionHealthStatus = "unconfigured" | "absent" | "probation" | "verified" | "invalid";
export type AssetProjectionHealthReason =
  | "projection_root_not_absolute"
  | "projection_root_missing"
  | "projection_root_symlink"
  | "projection_root_not_directory"
  | "active_pointer_missing"
  | "active_pointer_invalid"
  | "active_release_lock_missing"
  | "active_release_lock_invalid"
  | "active_release_lock_mismatch"
  | "previous_pointer_invalid"
  | "previous_pointer_not_verified"
  | "previous_release_lock_missing"
  | "previous_release_lock_invalid"
  | "previous_release_lock_mismatch"
  | "previous_without_active";

export interface AssetProjectionIdentitySummary {
  release_id: string;
  profile_id: string;
  luban_commit: string;
  asset_lock_hash: string;
  runtime_commit: string;
  activation_receipt_id: string;
  status: "probation" | "verified";
}

export interface AssetProjectionRecoverySummary {
  status: "available" | "not_available";
  previous?: AssetProjectionIdentitySummary;
}

export interface AssetProjectionHealthSummary {
  configured: boolean;
  status: AssetProjectionHealthStatus;
  reason?: AssetProjectionHealthReason;
  active?: AssetProjectionIdentitySummary;
  recovery?: AssetProjectionRecoverySummary;
}

/**
 * Reads only the configured projection's pointer and lock identity metadata.
 * It deliberately does not enumerate releases, read projected asset bodies, or
 * read activation receipt bodies.
 */
export async function inspectAssetProjectionHealth(args: {
  projection_root?: string;
}): Promise<AssetProjectionHealthSummary> {
  if (!args.projection_root) return { configured: false, status: "unconfigured" };
  if (!isAbsolute(args.projection_root)) {
    return invalid("projection_root_not_absolute");
  }

  const root = resolve(args.projection_root);
  const rootState = await inspectDirectory(root);
  if (rootState === "missing") return absent("projection_root_missing");
  if (rootState === "symlink") return invalid("projection_root_symlink");
  if (rootState !== "directory") return invalid("projection_root_not_directory");

  const activeRead = await readPointer(root, "active.json");
  if (activeRead.kind === "missing") {
    const previousRead = await readPointer(root, "previous.json");
    if (previousRead.kind === "value") return invalid("previous_without_active");
    if (previousRead.kind === "invalid") return invalid("previous_pointer_invalid");
    return absent("active_pointer_missing");
  }
  if (activeRead.kind === "invalid") return invalid("active_pointer_invalid");

  const activeLock = await readMatchingLock(root, activeRead.value, "active");
  if (activeLock.kind === "missing") return invalid("active_release_lock_missing");
  if (activeLock.kind === "invalid") return invalid(activeLock.reason);

  const previousRead = await readPointer(root, "previous.json");
  if (previousRead.kind === "invalid") return invalid("previous_pointer_invalid");
  if (previousRead.kind === "value") {
    if (previousRead.value.status !== "verified") return invalid("previous_pointer_not_verified");
    const previousLock = await readMatchingLock(root, previousRead.value, "previous");
    if (previousLock.kind === "missing") return invalid("previous_release_lock_missing");
    if (previousLock.kind === "invalid") return invalid(previousLock.reason);
    return summarizeValidatedPointers(activeRead.value, previousRead.value);
  }
  return summarizeValidatedPointers(activeRead.value);
}

function summarizeValidatedPointers(active: ProjectionPointer, previous?: ProjectionPointer): AssetProjectionHealthSummary {
  return {
    configured: true,
    status: active.status,
    active: summarizePointer(active),
    recovery: previous
      ? { status: "available", previous: summarizePointer(previous) }
      : { status: "not_available" }
  };
}

function absent(reason: Extract<AssetProjectionHealthReason, "projection_root_missing" | "active_pointer_missing">): AssetProjectionHealthSummary {
  return { configured: true, status: "absent", reason };
}

function invalid(reason: AssetProjectionHealthReason): AssetProjectionHealthSummary {
  return { configured: true, status: "invalid", reason };
}

function summarizePointer(pointer: ProjectionPointer): AssetProjectionIdentitySummary {
  return {
    release_id: pointer.release_id,
    profile_id: pointer.profile_id,
    luban_commit: pointer.luban_commit,
    asset_lock_hash: pointer.asset_lock_hash,
    runtime_commit: pointer.runtime_commit,
    activation_receipt_id: pointer.activation_receipt_id,
    status: pointer.status
  };
}

type MetadataRead<T> =
  | { kind: "missing" }
  | { kind: "value"; value: T }
  | { kind: "invalid" };

async function readPointer(root: string, name: "active.json" | "previous.json"): Promise<MetadataRead<ProjectionPointer>> {
  const raw = await readMetadataFile(join(root, name));
  if (raw.kind !== "value") return raw;
  try {
    return { kind: "value", value: projectionPointerSchema.parse(JSON.parse(raw.value.toString("utf8"))) };
  } catch {
    return { kind: "invalid" };
  }
}

type LockRead =
  | { kind: "missing" }
  | { kind: "value"; value: AssetSelectionLock }
  | {
    kind: "invalid";
    reason:
      | "active_release_lock_invalid"
      | "active_release_lock_mismatch"
      | "previous_release_lock_invalid"
      | "previous_release_lock_mismatch";
  };

async function readMatchingLock(
  root: string,
  pointer: ProjectionPointer,
  role: "active" | "previous"
): Promise<LockRead> {
  const releasesRoot = join(root, "releases");
  if (await inspectDirectory(releasesRoot) !== "directory") return { kind: "missing" };
  const releaseRoot = join(releasesRoot, pointer.release_id);
  if (await inspectDirectory(releaseRoot) !== "directory") return { kind: "missing" };

  const raw = await readMetadataFile(join(releaseRoot, "asset-lock.json"));
  if (raw.kind === "missing") return raw;
  const invalidReason = `${role}_release_lock_invalid` as const;
  const mismatchReason = `${role}_release_lock_mismatch` as const;
  if (raw.kind === "invalid") return { kind: "invalid", reason: invalidReason };
  try {
    const lock = assetSelectionLockSchema.parse(JSON.parse(raw.value.toString("utf8")));
    assertAssetSelectionLockHash(lock);
    if (
      lock.lock_hash !== pointer.release_id
      || lock.lock_hash !== pointer.asset_lock_hash
      || lock.profile_id !== pointer.profile_id
      || lock.luban_commit !== pointer.luban_commit
    ) {
      return { kind: "invalid", reason: mismatchReason };
    }
    return { kind: "value", value: lock };
  } catch {
    return { kind: "invalid", reason: invalidReason };
  }
}

async function inspectDirectory(path: string): Promise<"missing" | "symlink" | "directory" | "other"> {
  try {
    const info = await lstat(path);
    if (info.isSymbolicLink()) return "symlink";
    return info.isDirectory() ? "directory" : "other";
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return "missing";
    return "other";
  }
}

async function readMetadataFile(path: string): Promise<MetadataRead<Buffer>> {
  try {
    const info = await lstat(path);
    if (!info.isFile() || info.isSymbolicLink() || info.size > MAX_PROJECTION_METADATA_BYTES) return { kind: "invalid" };
    const content = await readFile(path);
    if (content.byteLength > MAX_PROJECTION_METADATA_BYTES) return { kind: "invalid" };
    return { kind: "value", value: content };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return { kind: "missing" };
    return { kind: "invalid" };
  }
}
