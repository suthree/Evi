import { isAbsolute, relative, resolve, sep } from "node:path";
import { AgentStore } from "./store.js";

export type TaskContextReferenceKind = "file" | "folder";

export interface TaskContextReference {
  raw: string;
  kind: TaskContextReferenceKind;
  target: string;
  start: number;
  end: number;
  line_start?: number;
  line_end?: number;
}

export interface RenderedTaskContextReferences {
  markdown: string;
  refs: string[];
  item_count: number;
}

const QUOTED_REFERENCE_VALUE = "(?:`[^`\\n]+`|\"[^\"\\n]+\"|'[^'\\n]+')";
const REFERENCE_PATTERN = new RegExp(
  `@(?<kind>file|folder):(?<value>(?:${QUOTED_REFERENCE_VALUE}(?::\\d+(?:-\\d+)?)?|\\S+))`,
  "g"
);
const TRAILING_PUNCTUATION = ",.;!?";
const MAX_REFERENCES = 5;
const MAX_FILE_CHARS = 1600;
const MAX_FOLDER_FILES = 40;

export function parseTaskContextReferences(message: string): TaskContextReference[] {
  const refs: TaskContextReference[] = [];
  for (const match of message.matchAll(REFERENCE_PATTERN)) {
    const groups = match.groups ?? {};
    const kind = groups.kind;
    if (kind !== "file" && kind !== "folder") continue;
    const rawValue = stripTrailingPunctuation(groups.value ?? "");
    const parsed: { target: string; line_start?: number; line_end?: number } = kind === "file"
      ? parseFileReferenceValue(rawValue)
      : { target: stripReferenceWrappers(rawValue) };
    refs.push({
      raw: `@${kind}:${rawValue}`,
      kind,
      target: parsed.target,
      start: match.index ?? 0,
      end: (match.index ?? 0) + match[0].length,
      ...(parsed.line_start !== undefined ? { line_start: parsed.line_start } : {}),
      ...(parsed.line_end !== undefined ? { line_end: parsed.line_end } : {})
    });
  }
  return refs;
}

export async function renderTaskContextReferences(
  store: AgentStore,
  message: string
): Promise<RenderedTaskContextReferences | null> {
  const parsed = parseTaskContextReferences(message);
  if (parsed.length === 0) return null;
  const selected = parsed.slice(0, MAX_REFERENCES);
  const refs: string[] = [];
  const blocks: string[] = [
    "Bounded task references parsed from accepted_goal. These are local repo reads only; use them as task context, not as proof of completion.",
    `- parsed_refs: ${parsed.length}`,
    `- selected_refs: ${selected.length}`
  ];
  if (parsed.length > selected.length) {
    blocks.push(`- warning: ${parsed.length - selected.length} extra reference(s) omitted by the local context budget.`);
  }
  blocks.push("");

  let renderedItems = 0;
  for (const ref of selected) {
    const rendered = ref.kind === "file"
      ? await renderFileReference(store, ref)
      : await renderFolderReference(store, ref);
    if (rendered.refs.length > 0) refs.push(...rendered.refs);
    blocks.push(...rendered.lines, "");
    renderedItems += 1;
  }

  return {
    markdown: blocks.join("\n").trimEnd(),
    refs: unique(refs),
    item_count: renderedItems
  };
}

async function renderFileReference(
  store: AgentStore,
  ref: TaskContextReference
): Promise<{ lines: string[]; refs: string[] }> {
  const safe = safeRepoRef(store, ref.target);
  if (!safe.ok) {
    return {
      lines: [
        `### ${ref.raw}`,
        `- kind: file`,
        `- warning: ${safe.warning}`
      ],
      refs: []
    };
  }

  let body = "";
  try {
    body = await store.readRepoText(safe.ref, ref.line_start !== undefined ? 24000 : MAX_FILE_CHARS);
  } catch (error) {
    return {
      lines: [
        `### ${ref.raw}`,
        `- kind: file`,
        `- ref: ${safe.ref}`,
        `- warning: ${error instanceof Error ? error.message : String(error)}`
      ],
      refs: [safe.ref]
    };
  }
  if (!body) {
    return {
      lines: [
        `### ${ref.raw}`,
        `- kind: file`,
        `- ref: ${safe.ref}`,
        `- warning: file not found or empty`
      ],
      refs: [safe.ref]
    };
  }
  if (body.includes("\0")) {
    return {
      lines: [
        `### ${ref.raw}`,
        `- kind: file`,
        `- ref: ${safe.ref}`,
        `- warning: binary-like content omitted`
      ],
      refs: [safe.ref]
    };
  }
  const selected = selectLineRange(body, ref);
  return {
    lines: [
      `### ${ref.raw}`,
      `- kind: file`,
      `- ref: ${safe.ref}`,
      `- line_range: ${selected.line_range}`,
      `- chars: ${selected.text.length}`,
      "",
      "```text",
      selected.text.trimEnd() || "No text selected.",
      "```"
    ],
    refs: [safe.ref]
  };
}

async function renderFolderReference(
  store: AgentStore,
  ref: TaskContextReference
): Promise<{ lines: string[]; refs: string[] }> {
  const safe = safeRepoRef(store, ref.target);
  if (!safe.ok) {
    return {
      lines: [
        `### ${ref.raw}`,
        `- kind: folder`,
        `- warning: ${safe.warning}`
      ],
      refs: []
    };
  }

  let files: string[] = [];
  try {
    files = (await store.listRepoFiles(safe.ref)).slice(0, MAX_FOLDER_FILES);
  } catch (error) {
    return {
      lines: [
        `### ${ref.raw}`,
        `- kind: folder`,
        `- ref: ${safe.ref}`,
        `- warning: ${error instanceof Error ? error.message : String(error)}`
      ],
      refs: [safe.ref]
    };
  }
  return {
    lines: [
      `### ${ref.raw}`,
      `- kind: folder`,
      `- ref: ${safe.ref}`,
      `- files_selected: ${files.length}`,
      "",
      ...(files.length > 0 ? files.map((file) => `- ${file}`) : ["- folder not found or empty"])
    ],
    refs: files.length > 0 ? [safe.ref, ...files] : [safe.ref]
  };
}

function selectLineRange(body: string, ref: TaskContextReference): { text: string; line_range: string } {
  if (ref.line_start === undefined) {
    const text = truncate(body, MAX_FILE_CHARS);
    return { text, line_range: "all" };
  }
  const lines = body.split(/\r?\n/);
  const start = Math.max(1, ref.line_start);
  const end = Math.max(start, ref.line_end ?? start);
  const text = truncate(lines.slice(start - 1, end).join("\n"), MAX_FILE_CHARS);
  return {
    text,
    line_range: `${start}-${end}`
  };
}

function parseFileReferenceValue(value: string): { target: string; line_start?: number; line_end?: number } {
  const unwrapped = stripReferenceWrappersWithTail(value);
  const lineMatch = /^(.+):(\d+)(?:-(\d+))?$/.exec(unwrapped);
  if (!lineMatch) return { target: unwrapped };
  const start = Number.parseInt(lineMatch[2] ?? "1", 10);
  const end = Number.parseInt(lineMatch[3] ?? lineMatch[2] ?? "1", 10);
  return {
    target: lineMatch[1] ?? unwrapped,
    line_start: start,
    line_end: end
  };
}

function stripReferenceWrappers(value: string): string {
  return stripReferenceWrappersWithTail(value);
}

function stripReferenceWrappersWithTail(value: string): string {
  const trimmed = value.trim();
  const quote = trimmed[0];
  if ((quote === "\"" || quote === "'" || quote === "`") && trimmed.length > 1) {
    const close = trimmed.indexOf(quote, 1);
    if (close > 0) {
      return `${trimmed.slice(1, close)}${trimmed.slice(close + 1)}`;
    }
  }
  return trimmed;
}

function stripTrailingPunctuation(value: string): string {
  let trimmed = value.trim();
  while (trimmed.length > 0 && TRAILING_PUNCTUATION.includes(trimmed[trimmed.length - 1] ?? "")) {
    trimmed = trimmed.slice(0, -1);
  }
  if (trimmed.endsWith(")") && !trimmed.includes("(")) return trimmed.slice(0, -1);
  return trimmed;
}

function safeRepoRef(store: AgentStore, target: string): { ok: true; ref: string } | { ok: false; warning: string } {
  const trimmed = target.trim();
  if (!trimmed) return { ok: false, warning: "empty reference target" };
  if (isAbsolute(trimmed)) return { ok: false, warning: `absolute repo reference blocked: ${target}` };
  const abs = resolve(store.repoRoot, trimmed);
  const rel = relative(store.repoRoot, abs);
  if (!rel || rel.startsWith("..") || rel === "." || rel.split(sep).includes("..")) {
    return { ok: false, warning: `unsafe repo reference blocked: ${target}` };
  }
  return { ok: true, ref: rel.split(sep).join("/") };
}

function truncate(text: string, maxChars: number): string {
  return text.length > maxChars ? `${text.slice(0, maxChars).trimEnd()}\n...` : text;
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values));
}
