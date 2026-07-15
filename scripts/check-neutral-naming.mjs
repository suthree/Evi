import { readFile, readdir } from "node:fs/promises";
import { extname, relative, resolve } from "node:path";

const repoRoot = resolve(import.meta.dirname, "..");
const sourceRoots = ["apps", "packages", "config", "scripts"];
const rootFiles = ["package.json"];
const textExtensions = new Set([".ts", ".mts", ".cts", ".js", ".mjs", ".cjs", ".json", ".jsonl", ".md"]);
const reservedNames = [
  ["g", "a"].join(""),
  ["e", "v", "i"].join(""),
  ["h", "e", "r", "m", "e", "s"].join("")
];
const reservedPattern = new RegExp(
  `(?:^|[^a-z0-9])(?:${reservedNames.join("|")})(?=$|[^a-z0-9])`,
  "i"
);

const files = [
  ...rootFiles.map((path) => resolve(repoRoot, path)),
  ...(await Promise.all(sourceRoots.map((path) => listFiles(resolve(repoRoot, path))))).flat()
];
const violations = [];

for (const file of files.sort()) {
  const repoPath = relative(repoRoot, file);
  if (reservedPattern.test(repoPath)) {
    violations.push(`${repoPath}: path contains a project-specific name`);
    continue;
  }
  if (!textExtensions.has(extname(file))) continue;
  const lines = (await readFile(file, "utf8")).split(/\r?\n/);
  for (const [index, line] of lines.entries()) {
    if (reservedPattern.test(line)) {
      violations.push(`${repoPath}:${index + 1}: ${line.trim()}`);
    }
  }
}

if (violations.length > 0) {
  console.error("Runtime implementation naming must remain capability-oriented and project-neutral.");
  console.error(violations.join("\n"));
  process.exit(1);
}

console.log(`Validated neutral naming across ${files.length} implementation file(s).`);

async function listFiles(root) {
  const entries = await readdir(root, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const path = resolve(root, entry.name);
    return entry.isDirectory() ? listFiles(path) : [path];
  }));
  return nested.flat();
}
