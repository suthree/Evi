import { basename } from "node:path";
import { z } from "zod";

const shortTextSchema = z.string().trim().min(1).max(2_000);
const toolSchema = z.string().trim().min(1).max(128);
const effectActionSchema = z.object({
  tool: toolSchema,
  arguments: z.record(z.string(), z.unknown()).default({})
}).strict();

export type EffectDecisionOutcome = "allow" | "confirm" | "deny";
export type EffectOperation =
  | "read_local"
  | "read_public_network"
  | "write_local_state"
  | "write_local_repo"
  | "run_local_verification"
  | "delegate_local_code"
  | "execute_dynamic_code"
  | "write_external"
  | "mutate_local_runtime"
  | "destructive_local"
  | "unknown";
export type EffectReversibility = "read_only" | "reversible" | "conditional" | "irreversible" | "unknown";
export type EffectDataExposure = "none" | "public_response_to_model" | "local_content_to_model" | "private_or_secret" | "unknown";

export type EffectAction = z.infer<typeof effectActionSchema>;

export interface EffectIntent {
  operation: EffectOperation;
  target: string;
  reversibility: EffectReversibility;
  data_exposure: EffectDataExposure;
  authority: "standing_local_evolution";
}

export interface EffectDecision {
  outcome: EffectDecisionOutcome;
  reason: string;
  intent: EffectIntent;
}

export interface EffectEnvelope {
  authority: "standing_local_evolution";
  allow_local_reads: boolean;
  allow_public_network_reads: boolean;
  allow_reversible_local_writes: boolean;
}

export const STANDING_LOCAL_EVOLUTION_ENVELOPE: EffectEnvelope = Object.freeze({
  authority: "standing_local_evolution",
  allow_local_reads: true,
  allow_public_network_reads: true,
  allow_reversible_local_writes: true
});

/**
 * Decides the semantic effect of one proposed action. Tool-specific parsing is
 * deliberately kept inside this module; callers receive operation/target
 * semantics and never grant authority through model-declared side-effect labels.
 */
export class EffectPolicy {
  decide(
    rawAction: EffectAction,
    envelope: EffectEnvelope = STANDING_LOCAL_EVOLUTION_ENVELOPE
  ): EffectDecision {
    const action = parseEffectAction(rawAction);
    const intent = classifyEffect(action);
    return decideIntent(intent, envelope);
  }
}

export function parseEffectAction(value: EffectAction): EffectAction {
  const parsed = effectActionSchema.safeParse(value);
  if (!parsed.success) {
    throw new Error(`Invalid effect action: ${z.prettifyError(parsed.error)}`);
  }
  const serialized = JSON.stringify(parsed.data.arguments);
  if (serialized.length > 60_000) throw new Error("Effect action arguments exceed 60000 characters");
  return parsed.data;
}

function decideIntent(intent: EffectIntent, envelope: EffectEnvelope): EffectDecision {
  if (intent.operation === "destructive_local") {
    return decision("deny", "Destructive local effects are outside the standing execution envelope.", intent);
  }
  if (intent.operation === "unknown") {
    return decision("deny", "The action effect cannot be resolved safely.", intent);
  }
  if (intent.data_exposure === "private_or_secret") {
    return decision("deny", "Secret or private data must not be exposed to the model or another process.", intent);
  }
  if (intent.operation === "write_external" || intent.reversibility === "irreversible") {
    return decision("confirm", "External or irreversible effects require explicit confirmation of this exact effect.", intent);
  }
  if (intent.operation === "mutate_local_runtime" || intent.operation === "execute_dynamic_code") {
    return decision("confirm", "Runtime mutation or dynamic code execution requires explicit confirmation of this exact effect.", intent);
  }
  if (intent.operation === "delegate_local_code") {
    return decision("confirm", "Nested coding execution has a broader authority surface and requires exact-effect confirmation.", intent);
  }
  if (intent.operation === "read_local") {
    return envelope.allow_local_reads
      ? decision("allow", "Bounded local read is inside the standing execution envelope.", intent)
      : decision("confirm", "The current envelope does not allow local reads.", intent);
  }
  if (intent.operation === "read_public_network") {
    return envelope.allow_public_network_reads
      ? decision("allow", "Bounded public network read is inside the standing execution envelope.", intent)
      : decision("confirm", "The current envelope does not allow public network reads.", intent);
  }
  if (intent.operation === "write_local_repo"
    || intent.operation === "write_local_state"
    || intent.operation === "run_local_verification") {
    return envelope.allow_reversible_local_writes
      ? decision("allow", "Reversible local effect is inside the standing execution envelope.", intent)
      : decision("confirm", "The current envelope does not allow reversible local writes.", intent);
  }
  return decision("deny", "The action effect has no applicable authority rule.", intent);
}

function classifyEffect(action: EffectAction): EffectIntent {
  const args = action.arguments;
  switch (action.tool) {
    case "file.read":
      return localReadIntent(stringValue(args.scope) || "repo", stringValue(args.path));
    case "repo.search":
      return localReadIntent("repo", stringValue(args.path) || ".");
    case "file.write_state":
      return localWriteIntent("state", stringValue(args.path));
    case "file.write_repo":
      return localWriteIntent("repo", stringValue(args.path));
    case "http.fetch":
      return httpFetchIntent(stringValue(args.url));
    case "command.run":
      return commandIntent(args);
    case "codex.run":
      return intent("delegate_local_code", codexTarget(args), "conditional", "local_content_to_model");
    case "code.execute_node":
      return intent("execute_dynamic_code", "local:node", "unknown", "local_content_to_model");
    default:
      return intent("unknown", `tool:${action.tool}`, "unknown", "unknown");
  }
}

function localReadIntent(scope: string, path: string): EffectIntent {
  const target = `${scope}:${path || "(missing)"}`;
  if (!validRelativePath(path) || (scope !== "repo" && scope !== "state")) {
    return intent("unknown", target, "unknown", "unknown");
  }
  if (sensitivePath(path)) {
    return intent("read_local", target, "read_only", "private_or_secret");
  }
  return intent("read_local", target, "read_only", "local_content_to_model");
}

function localWriteIntent(scope: "repo" | "state", path: string): EffectIntent {
  const target = `${scope}:${path || "(missing)"}`;
  if (!validRelativePath(path)) return intent("unknown", target, "unknown", "unknown");
  if (sensitivePath(path)) return intent("unknown", target, "unknown", "private_or_secret");
  if (scope === "state" && foregroundControlPlanePath(path)) {
    return intent("unknown", target, "unknown", "none");
  }
  return intent(scope === "repo" ? "write_local_repo" : "write_local_state", target, "reversible", "none");
}

function httpFetchIntent(rawUrl: string): EffectIntent {
  try {
    const url = new URL(rawUrl);
    const target = `${url.protocol}//${url.host}${url.pathname}`;
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return intent("unknown", target, "unknown", "unknown");
    }
    if (url.username || url.password || privateNetworkHost(url.hostname) || [...url.searchParams.keys()].some(secretLikeToken)) {
      return intent("read_public_network", target, "read_only", "private_or_secret");
    }
    return intent("read_public_network", target, "read_only", "public_response_to_model");
  } catch {
    return intent("unknown", `url:${rawUrl || "(missing)"}`, "unknown", "unknown");
  }
}

function commandIntent(args: Record<string, unknown>): EffectIntent {
  const command = basename(stringValue(args.command));
  const argv = stringArray(args.args);
  const containsSensitiveData = commandContainsSensitiveData(argv);
  const target = containsSensitiveData
    ? `command:${command || "(missing)"} [sensitive arguments redacted]`
    : `command:${[command, ...argv].filter(Boolean).join(" ") || "(missing)"}`;
  if (!command) return intent("unknown", target, "unknown", "unknown");
  if (argv.some((item) => sensitivePath(item)) || containsSensitiveData) {
    return intent("read_local", target, "unknown", "private_or_secret");
  }
  if (["rm", "shred", "rmdir", "mkfs", "diskutil"].includes(command)) {
    return intent("destructive_local", target, "irreversible", "none");
  }
  if (["sudo", "launchctl", "kill", "killall", "pkill"].includes(command)) {
    return intent("mutate_local_runtime", target, "conditional", "none");
  }
  if (["gh", "ssh", "scp", "sftp", "rsync", "curl", "wget"].includes(command)) {
    return intent("write_external", target, "conditional", "unknown");
  }
  if (command === "git") return gitCommandIntent(argv, target);
  if (["rg", "ls", "pwd", "sed", "head", "tail", "wc", "stat"].includes(command)) {
    return intent("read_local", target, "read_only", "local_content_to_model");
  }
  if (command === "find") {
    return argv.some((item) => item === "-delete" || item === "-exec" || item === "-execdir")
      ? intent("destructive_local", target, "conditional", "none")
      : intent("read_local", target, "read_only", "local_content_to_model");
  }
  if (command === "pnpm") return pnpmCommandIntent(argv, target);
  if (command === "npm" && argv[0] === "test") {
    return intent("run_local_verification", target, "reversible", "local_content_to_model");
  }
  if (command === "node" && argv.includes("--test")) {
    return intent("run_local_verification", target, "reversible", "local_content_to_model");
  }
  return intent("execute_dynamic_code", target, "unknown", "unknown");
}

function gitCommandIntent(argv: string[], target: string): EffectIntent {
  const subcommand = argv.find((item) => !item.startsWith("-")) ?? "";
  if (["status", "diff", "log", "show", "rev-parse"].includes(subcommand)) {
    return intent("read_local", target, "read_only", "local_content_to_model");
  }
  if (subcommand === "push" || subcommand === "fetch" || subcommand === "pull") {
    return intent("write_external", target, "conditional", "unknown");
  }
  if (subcommand === "reset" || subcommand === "clean") {
    return intent("destructive_local", target, "conditional", "none");
  }
  if (["add", "commit", "worktree"].includes(subcommand)) {
    return intent("write_local_repo", target, "reversible", "none");
  }
  return intent("execute_dynamic_code", target, "unknown", "unknown");
}

function pnpmCommandIntent(argv: string[], target: string): EffectIntent {
  const first = argv[0] ?? "";
  const script = first === "run" ? argv[1] ?? "" : first;
  if (first === "test" || ["check", "test", "lint", "typecheck", "build"].includes(script)) {
    return intent("run_local_verification", target, "reversible", "local_content_to_model");
  }
  return intent("execute_dynamic_code", target, "unknown", "unknown");
}

function codexTarget(args: Record<string, unknown>): string {
  const mode = stringValue(args.mode) || "unknown";
  const worktree = stringValue(args.worktree) || stringValue(args.cwd) || "(missing)";
  return `codex:${mode}:${worktree}`;
}

function intent(
  operation: EffectOperation,
  target: string,
  reversibility: EffectReversibility,
  dataExposure: EffectDataExposure
): EffectIntent {
  return {
    operation,
    target: target.slice(0, 2_000),
    reversibility,
    data_exposure: dataExposure,
    authority: "standing_local_evolution"
  };
}

function decision(outcome: EffectDecisionOutcome, reason: string, value: EffectIntent): EffectDecision {
  return {
    outcome,
    reason: shortTextSchema.parse(reason),
    intent: value
  };
}

function validRelativePath(path: string): boolean {
  return Boolean(path)
    && !path.startsWith("/")
    && !path.startsWith("~")
    && !path.split(/[\\/]+/).includes("..");
}

function foregroundControlPlanePath(path: string): boolean {
  const normalized = path.replace(/^\.\//, "");
  return [
    "goals",
    "runs",
    "autonomy",
    "memory",
    "sop",
    "skills",
    "vault",
    "deployments",
    "governance",
    "services",
    "channels"
  ].some((root) => normalized === root || normalized.startsWith(`${root}/`));
}

function sensitivePath(path: string): boolean {
  const normalized = path.toLowerCase().replace(/\\/g, "/");
  const segments = normalized.split("/").filter(Boolean);
  return segments.some((segment) => segment === ".env"
    || segment.startsWith(".env.")
    || segment === ".ssh"
    || segment === ".gnupg"
    || segment === "credentials"
    || segment === "secrets"
    || /(^|[._-])(secret|token|password|passwd|private[-_]?key|api[-_]?key)([._-]|$)/i.test(segment));
}

function secretLikeToken(value: string): boolean {
  return /(^|[._-])(secret|token|password|passwd|private[-_]?key|api[-_]?key)([._-]|$)/i.test(value);
}

function commandContainsSensitiveData(argv: string[]): boolean {
  return argv.some((item, index) => {
    if (secretLikeToken(item)) return true;
    if (/^authorization\s*:/i.test(item)) return true;
    const prior = argv[index - 1] ?? "";
    return ["-h", "--header", "--token", "--password", "--api-key"].includes(prior.toLowerCase())
      && (/authorization|bearer|token|password|secret|api[-_]?key/i.test(item) || prior.toLowerCase() !== "-h");
  });
}

function privateNetworkHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (host === "localhost" || host === "::1" || host.endsWith(".local")) return true;
  if (/^127\./.test(host) || /^10\./.test(host) || /^192\.168\./.test(host)) return true;
  const match = /^172\.(\d{1,3})\./.exec(host);
  return match ? Number(match[1]) >= 16 && Number(match[1]) <= 31 : false;
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}
