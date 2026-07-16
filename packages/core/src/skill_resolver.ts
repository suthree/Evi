import type { AgentStore } from "./store.js";

export type SkillSourceKind = "personal" | "installed" | "seed" | "project" | "vault" | "bundled";

export interface SkillResolverInput {
  root: string;
  seed_roots?: string[];
  project_roots?: string[];
}

export interface SkillSearchRoot {
  root: string;
  skills_dir: string;
  source: "personal" | "seed" | "project";
  writable: boolean;
}

export interface SkillResolver {
  active_root: string;
  seed_roots: string[];
  project_roots: string[];
  search_roots: SkillSearchRoot[];
}

export type SkillResolverLike = string | SkillResolverInput | SkillResolver;

export function resolveSkillResolver(input: SkillResolverLike = "vault"): SkillResolver {
  if (typeof input !== "string" && "active_root" in input && "search_roots" in input) {
    return input;
  }

  const activeRoot = typeof input === "string" ? input : input.root;
  const seedRoots = typeof input === "string" ? ["skills"] : input.seed_roots ?? ["skills"];
  const projectRoots = typeof input === "string" ? [] : input.project_roots ?? [];
  const searchRoots: SkillSearchRoot[] = [
    {
      root: activeRoot,
      skills_dir: joinRef(activeRoot, "skills"),
      source: "personal",
      writable: true
    }
  ];

  for (const root of seedRoots) {
    searchRoots.push({
      root,
      skills_dir: skillCollectionRoot(root),
      source: "seed",
      writable: false
    });
  }

  for (const root of projectRoots) {
    searchRoots.push({
      root,
      skills_dir: skillCollectionRoot(root),
      source: "project",
      writable: false
    });
  }

  return {
    active_root: activeRoot,
    seed_roots: unique(seedRoots).sort(),
    project_roots: unique(projectRoots).sort(),
    search_roots: dedupeSearchRoots(searchRoots)
  };
}

export function activeVaultRef(scope: SkillResolverLike, rel: string): string {
  return joinRef(resolveSkillResolver(scope).active_root, rel);
}

export function skillRootExists(store: AgentStore, root: string): boolean {
  return store.pathExists(root);
}

export function joinRef(root: string, rel: string): string {
  const cleanRoot = root.replace(/\/+$/, "");
  const cleanRel = rel.replace(/^\/+/, "");
  return cleanRoot ? `${cleanRoot}/${cleanRel}` : cleanRel;
}

function skillCollectionRoot(root: string): string {
  const normalized = root.replace(/\/+$/, "");
  if (normalized === "skills" || normalized.endsWith("/skills")) return normalized;
  return joinRef(normalized, "skills");
}

function dedupeSearchRoots(roots: SkillSearchRoot[]): SkillSearchRoot[] {
  const seen = new Set<string>();
  const result: SkillSearchRoot[] = [];
  for (const root of roots) {
    const key = `${root.source}\0${root.skills_dir}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(root);
  }
  return result.sort((left, right) =>
    sourceRank(left.source) - sourceRank(right.source)
    || left.skills_dir.localeCompare(right.skills_dir)
  );
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values));
}

function sourceRank(source: SkillSearchRoot["source"]): number {
  if (source === "personal") return 0;
  if (source === "seed") return 1;
  return 2;
}
