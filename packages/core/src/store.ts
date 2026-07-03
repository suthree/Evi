import { mkdir, readFile, writeFile, appendFile, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";

export class AgentStore {
  readonly repoRoot: string;
  readonly stateRoot: string;

  constructor(repoRoot: string, stateRoot?: string) {
    this.repoRoot = resolve(repoRoot);
    this.stateRoot = resolve(stateRoot ?? repoRoot);
  }

  async ensureLayout(): Promise<void> {
    for (const rel of [
      "memory/semantic",
      "memory/episodes",
      "memory/archives",
      "memory/index",
      "memory/working",
      "memory/dreams",
      "memory/retired",
      "sop/drafts",
      "sop/trial",
      "sop/retired",
      "governance/audits",
      "governance/meta-audits",
      "content/daily",
      "content/runs",
      "pipelines",
      "autonomy/runs",
      "autonomy/followups",
      "autonomy/inbox",
      "autonomy/reviews",
      "autonomy/reports",
      "autonomy/ticks",
      "operator/notifications/outbox"
    ]) {
      await mkdir(this.statePath(rel), { recursive: true });
    }
  }

  repoPath(rel: string): string {
    return resolve(this.repoRoot, rel);
  }

  pathExists(rel: string): boolean {
    return existsSync(this.repoPath(rel));
  }

  statePath(rel: string): string {
    return resolve(this.stateRoot, rel);
  }

  async readRepoText(rel: string, maxChars?: number): Promise<string> {
    const path = this.repoPath(rel);
    if (!existsSync(path)) return "";
    return truncate(await readFile(path, "utf8"), maxChars);
  }

  async readStateText(rel: string, maxChars?: number): Promise<string> {
    const path = this.statePath(rel);
    if (!existsSync(path)) return "";
    return truncate(await readFile(path, "utf8"), maxChars);
  }

  async readStateJson<T>(rel: string): Promise<T | null> {
    const text = await this.readStateText(rel);
    if (!text) return null;
    return JSON.parse(text) as T;
  }

  async listRepoFiles(rel: string, filename?: string): Promise<string[]> {
    const root = this.repoPath(rel);
    if (!existsSync(root)) return [];
    const files: string[] = [];
    await walk(root, rel, files, filename);
    return files.sort();
  }

  async listStateFiles(rel: string, filename?: string): Promise<string[]> {
    const root = this.statePath(rel);
    if (!existsSync(root)) return [];
    const files: string[] = [];
    await walk(root, rel, files, filename);
    return files.sort();
  }

  async writeRepoText(rel: string, text: string): Promise<string> {
    const path = this.repoPath(rel);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, text, "utf8");
    return rel;
  }

  async appendRepoJsonl(rel: string, value: unknown): Promise<string> {
    const path = this.repoPath(rel);
    await mkdir(dirname(path), { recursive: true });
    await appendFile(path, `${JSON.stringify(value)}\n`, "utf8");
    return rel;
  }

  async writeText(rel: string, text: string): Promise<string> {
    const path = this.statePath(rel);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, text, "utf8");
    return rel;
  }

  async writeJson(rel: string, value: unknown): Promise<string> {
    return this.writeText(rel, `${JSON.stringify(value, null, 2)}\n`);
  }

  async appendJsonl(rel: string, value: unknown): Promise<string> {
    const path = this.statePath(rel);
    await mkdir(dirname(path), { recursive: true });
    await appendFile(path, `${JSON.stringify(value)}\n`, "utf8");
    return rel;
  }
}

async function walk(absDir: string, relDir: string, files: string[], filename?: string): Promise<void> {
  for (const entry of await readdir(absDir, { withFileTypes: true })) {
    const rel = `${relDir}/${entry.name}`;
    const abs = resolve(absDir, entry.name);
    if (entry.isDirectory()) {
      await walk(abs, rel, files, filename);
    } else if (!filename || entry.name === filename) {
      files.push(rel);
    }
  }
}

function truncate(text: string, maxChars?: number): string {
  if (maxChars === undefined || text.length <= maxChars) return text;
  return `${text.slice(0, maxChars).trimEnd()}\n...`;
}
