import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { inspectAssetProjectionHealth } from "../packages/core/src/asset_projection_health.js";

const RUNTIME_COMMIT = "a".repeat(40);
const LUBAN_COMMIT = "b".repeat(40);
const CONTENT_HASH = "c".repeat(64);

test("asset projection health stays unconfigured until a root is explicitly supplied", async () => {
  assert.deepEqual(await inspectAssetProjectionHealth({}), {
    configured: false,
    status: "unconfigured"
  });
});

test("asset projection health reports an explicitly configured but absent root", async () => {
  const root = await mkdtemp(join(tmpdir(), "asset-projection-health-"));
  try {
    const result = await inspectAssetProjectionHealth({ projection_root: join(root, "missing") });
    assert.deepEqual(result, {
      configured: true,
      status: "absent",
      reason: "projection_root_missing"
    });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("asset projection health summarizes verified identity metadata without projected asset bodies", async () => {
  const root = await mkdtemp(join(tmpdir(), "asset-projection-health-"));
  try {
    const active = await writeRelease(root, "active-skill");
    const previous = await writeRelease(root, "previous-skill");
    await writePointer(root, "active.json", pointerFor(active, "verified", "projection_receipt_active"));
    await writePointer(root, "previous.json", pointerFor(previous, "verified", "projection_receipt_previous"));

    const result = await inspectAssetProjectionHealth({ projection_root: root });

    assert.equal(result.status, "verified");
    assert.equal(result.active?.release_id, active.lock_hash);
    assert.equal(result.active?.profile_id, "node-default");
    assert.equal(result.recovery?.status, "available");
    assert.equal(result.recovery?.previous?.release_id, previous.lock_hash);
    const serialized = JSON.stringify(result);
    assert.equal(serialized.includes("private-entrypoint.md"), false);
    assert.equal(serialized.includes("private/projected/body"), false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("asset projection health fails closed for malformed active pointers and lock drift", async () => {
  const root = await mkdtemp(join(tmpdir(), "asset-projection-health-"));
  try {
    await mkdir(root, { recursive: true });
    await writeFile(join(root, "active.json"), "{not-json", "utf8");
    assert.deepEqual(await inspectAssetProjectionHealth({ projection_root: root }), {
      configured: true,
      status: "invalid",
      reason: "active_pointer_invalid"
    });

    const active = await writeRelease(root, "drift-skill");
    await writePointer(root, "active.json", {
      ...pointerFor(active, "verified", "projection_receipt_drift"),
      asset_lock_hash: "d".repeat(64)
    });
    assert.deepEqual(await inspectAssetProjectionHealth({ projection_root: root }), {
      configured: true,
      status: "invalid",
      reason: "active_release_lock_mismatch"
    });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("asset projection health keeps probation and verified rollback identity distinct", async () => {
  const root = await mkdtemp(join(tmpdir(), "asset-projection-health-"));
  try {
    const active = await writeRelease(root, "candidate-skill");
    const previous = await writeRelease(root, "stable-skill");
    await writePointer(root, "active.json", pointerFor(active, "probation", "projection_receipt_candidate"));
    await writePointer(root, "previous.json", pointerFor(previous, "verified", "projection_receipt_stable"));

    const result = await inspectAssetProjectionHealth({ projection_root: root });

    assert.equal(result.status, "probation");
    assert.equal(result.active?.status, "probation");
    assert.equal(result.recovery?.status, "available");
    assert.equal(result.recovery?.previous?.status, "verified");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

async function writeRelease(root: string, skillId: string): Promise<{
  profile_id: string;
  luban_commit: string;
  lock_hash: string;
}> {
  const base = {
    schema_version: 1 as const,
    profile_id: "node-default",
    luban_commit: LUBAN_COMMIT,
    assets: [{
      kind: "skill" as const,
      id: skillId,
      content_hash: CONTENT_HASH,
      content_root: "private/projected/body",
      entrypoint: "private-entrypoint.md",
      files: [{
        path: "private-entrypoint.md",
        media_type: "text/markdown",
        sha256: CONTENT_HASH,
        executable: false
      }]
    }]
  };
  const lock_hash = sha256(JSON.stringify(base));
  const lock = { ...base, lock_hash };
  const releaseRoot = join(root, "releases", lock_hash);
  await mkdir(releaseRoot, { recursive: true });
  await writeFile(join(releaseRoot, "asset-lock.json"), `${JSON.stringify(lock)}\n`, "utf8");
  return lock;
}

function pointerFor(
  lock: { profile_id: string; luban_commit: string; lock_hash: string },
  status: "probation" | "verified",
  activation_receipt_id: string
): Record<string, unknown> {
  return {
    schema_version: 1,
    release_id: lock.lock_hash,
    profile_id: lock.profile_id,
    luban_commit: lock.luban_commit,
    asset_lock_hash: lock.lock_hash,
    runtime_commit: RUNTIME_COMMIT,
    status,
    activation_receipt_id
  };
}

async function writePointer(root: string, name: "active.json" | "previous.json", pointer: Record<string, unknown>): Promise<void> {
  await writeFile(join(root, name), `${JSON.stringify(pointer)}\n`, "utf8");
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
