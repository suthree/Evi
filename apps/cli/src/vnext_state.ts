import { lstat, readlink, realpath } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, dirname, isAbsolute, relative, resolve } from "node:path";
import { DEFAULT_SHARED_STATE_ROOT } from "../../../packages/runtime/src/config.js";

export interface VNextStatePathBoundary {
  forbidden_v02_root: string;
  canonicalize_candidate?: (path: string) => Promise<string>;
  canonicalize_forbidden_root?: (path: string) => Promise<string>;
  case_insensitive?: boolean;
}

export interface VNextStatePathMessages {
  missing: string;
  relative: string;
  overlap: string;
  symlink_limit: string;
}

export async function resolveIsolatedVNextSqlite(
  value: string,
  messages: VNextStatePathMessages,
  boundary?: VNextStatePathBoundary
): Promise<string> {
  if (!value?.trim()) throw new Error(messages.missing);
  if (!isAbsolute(value)) throw new Error(messages.relative);
  const requested = resolve(value);
  const v02Root = resolve(
    boundary?.forbidden_v02_root
      ?? resolve(homedir(), DEFAULT_SHARED_STATE_ROOT.replace(/^~\//u, ""))
  );
  const caseInsensitive = boundary?.case_insensitive ?? process.platform === "darwin";
  if (overlaps(dirname(requested), v02Root, caseInsensitive)) {
    throw new Error(messages.overlap);
  }
  const physicalV02Root = resolve(await (
    boundary?.canonicalize_forbidden_root ?? canonicalizeDeclaredPath
  )(v02Root));
  const forbiddenRoots = uniquePathIdentities([v02Root, physicalV02Root], caseInsensitive);
  if (forbiddenRoots.some((root) => overlaps(dirname(requested), root, caseInsensitive))) {
    throw new Error(messages.overlap);
  }
  const sqlite = boundary?.canonicalize_candidate
    ? resolve(await boundary.canonicalize_candidate(requested))
    : await canonicalizeCandidatePath(requested, forbiddenRoots, caseInsensitive, messages);
  const sqliteDirectory = dirname(sqlite);
  if (forbiddenRoots.some((root) => overlaps(sqliteDirectory, root, caseInsensitive))) {
    throw new Error(messages.overlap);
  }
  return sqlite;
}

async function canonicalizeDeclaredPath(path: string): Promise<string> {
  let existing = resolve(path);
  const missing: string[] = [];
  while (true) {
    try {
      return resolve(await realpath(existing), ...missing.reverse());
    } catch (error) {
      if (!(error instanceof Error) || !("code" in error) || error.code !== "ENOENT") throw error;
      const parent = dirname(existing);
      if (parent === existing) throw error;
      missing.push(basename(existing));
      existing = parent;
    }
  }
}

async function canonicalizeCandidatePath(
  path: string,
  forbiddenRoots: string[],
  caseInsensitive: boolean,
  messages: VNextStatePathMessages
): Promise<string> {
  let current = "/";
  const pending = resolve(path).split("/").filter(Boolean);
  let followedLinks = 0;
  while (pending.length > 0) {
    const component = pending.shift()!;
    const next = resolve(current, component);
    assertOutsideForbiddenRoots(next, forbiddenRoots, caseInsensitive, messages.overlap);
    try {
      const metadata = await lstat(next);
      if (!metadata.isSymbolicLink()) {
        current = next;
        continue;
      }
      followedLinks += 1;
      if (followedLinks > 40) throw new Error(messages.symlink_limit);
      const link = await readlink(next);
      const target = resolve(dirname(next), link);
      assertOutsideForbiddenRoots(target, forbiddenRoots, caseInsensitive, messages.overlap);
      pending.unshift(...target.split("/").filter(Boolean));
      current = "/";
    } catch (error) {
      if (!(error instanceof Error) || !("code" in error) || error.code !== "ENOENT") throw error;
      const unresolved = resolve(next, ...pending);
      assertOutsideForbiddenRoots(unresolved, forbiddenRoots, caseInsensitive, messages.overlap);
      return unresolved;
    }
  }
  return current;
}

function assertOutsideForbiddenRoots(
  path: string,
  forbiddenRoots: string[],
  caseInsensitive: boolean,
  message: string
): void {
  if (forbiddenRoots.some((root) => isWithin(path, root, caseInsensitive))) {
    throw new Error(message);
  }
}

function uniquePathIdentities(paths: string[], caseInsensitive: boolean): string[] {
  const identities = new Set<string>();
  const result: string[] = [];
  for (const path of paths) {
    const identity = normalizedPathIdentity(path, caseInsensitive);
    if (identities.has(identity)) continue;
    identities.add(identity);
    result.push(resolve(path));
  }
  return result;
}

function overlaps(left: string, right: string, caseInsensitive: boolean): boolean {
  return isWithin(left, right, caseInsensitive) || isWithin(right, left, caseInsensitive);
}

function isWithin(path: string, root: string, caseInsensitive: boolean): boolean {
  const difference = relative(
    normalizedPathIdentity(root, caseInsensitive),
    normalizedPathIdentity(path, caseInsensitive)
  );
  return difference === "" || (!difference.startsWith("..") && !isAbsolute(difference));
}

function normalizedPathIdentity(path: string, caseInsensitive: boolean): string {
  const normalized = resolve(path).normalize("NFC");
  return caseInsensitive ? normalized.toLowerCase() : normalized;
}
