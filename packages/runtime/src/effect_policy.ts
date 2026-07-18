import { basename } from "node:path";
import { z } from "zod";
import { prepareGoalExecutionWorkspaceArgumentsSchema } from "./goal_execution_workspace.js";

const shortTextSchema = z.string().trim().min(1).max(2_000);
const toolSchema = z.string().trim().min(1).max(128);
export const effectActionSchema = z.object({
  tool: toolSchema,
  arguments: z.record(z.string(), z.unknown()).default({})
}).strict();

export const effectIntentSchema = z.object({
  operation: z.enum([
    "read_local",
    "read_public_network",
    "write_local_state",
    "write_local_repo",
    "prepare_local_workspace",
    "run_local_verification",
    "delegate_local_code",
    "execute_dynamic_code",
    "write_external",
    "mutate_local_runtime",
    "destructive_local",
    "unknown"
  ]),
  target: z.string().trim().min(1).max(2_000),
  reversibility: z.enum(["read_only", "reversible", "conditional", "irreversible", "unknown"]),
  data_exposure: z.enum(["none", "public_response_to_model", "local_content_to_model", "private_or_secret", "unknown"]),
  authority: z.literal("standing_local_evolution")
}).strict();

export const effectDecisionSchema = z.object({
  outcome: z.enum(["allow", "confirm", "deny"]),
  reason: shortTextSchema,
  intent: effectIntentSchema
}).strict();

export type EffectAction = z.infer<typeof effectActionSchema>;
export type EffectIntent = z.infer<typeof effectIntentSchema>;
export type EffectDecision = z.infer<typeof effectDecisionSchema>;
export type EffectDecisionOutcome = EffectDecision["outcome"];
export type EffectOperation = EffectIntent["operation"];
export type EffectReversibility = EffectIntent["reversibility"];
export type EffectDataExposure = EffectIntent["data_exposure"];

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
  if (intent.operation === "run_local_verification" && intent.reversibility === "conditional") {
    return decision("confirm", "Repo-controlled verification code requires explicit confirmation of this exact effect.", intent);
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
    || intent.operation === "prepare_local_workspace"
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
    case "workspace.prepare":
      return workspacePrepareIntent(args);
    case "codex.run":
      return intent("delegate_local_code", codexTarget(args), "conditional", "local_content_to_model");
    case "code.execute_node":
      return intent("execute_dynamic_code", "local:node", "unknown", "local_content_to_model");
    default:
      return intent("unknown", `tool:${action.tool}`, "unknown", "unknown");
  }
}

function workspacePrepareIntent(args: Record<string, unknown>): EffectIntent {
  const parsed = prepareGoalExecutionWorkspaceArgumentsSchema.safeParse(args);
  if (!parsed.success) return intent("unknown", "workspace:(invalid)", "unknown", "none");
  return intent(
    "prepare_local_workspace",
    `workspace:${parsed.data.branch}@${parsed.data.base_commit}`,
    "reversible",
    "none"
  );
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
    const publicTarget = `${url.protocol}//${url.host}${url.pathname}`;
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return intent("unknown", publicTarget, "unknown", "unknown");
    }
    if (url.username
      || url.password
      || isPrivateNetworkHost(url.hostname)
      || [...url.searchParams.entries()].some(([key, value]) => secretLikeToken(key) || secretLikeToken(value))) {
      return intent("read_public_network", publicTarget, "read_only", "private_or_secret");
    }
    if (url.searchParams.size > 0) {
      return intent("write_external", url.toString(), "conditional", "unknown");
    }
    return intent("read_public_network", publicTarget, "read_only", "public_response_to_model");
  } catch {
    return intent("unknown", "url:(invalid or malformed)", "unknown", "unknown");
  }
}

function commandIntent(args: Record<string, unknown>): EffectIntent {
  const command = basename(stringValue(args.command));
  const argv = stringArray(args.args);
  const cwd = stringValue(args.cwd) || "repo";
  const containsSensitiveData = commandContainsSensitiveData(argv)
    || argv.some((item) => sensitivePath(item))
    || commandHasEnvironment(args);
  const target = containsSensitiveData
    ? `command:${cwd}:${command || "(missing)"} [sensitive arguments redacted]`
    : `command:${cwd}:${[command, ...argv].filter(Boolean).join(" ") || "(missing)"}`;
  if (!command) return intent("unknown", target, "unknown", "unknown");
  if ((cwd !== "repo" && cwd !== "state") || commandEscapesWorkingRoot(argv)) {
    return intent("unknown", target, "unknown", "unknown");
  }
  if (containsSensitiveData) {
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
  let classified: EffectIntent;
  if (command === "git") {
    classified = gitCommandIntent(argv, target);
  } else if (["ls", "pwd", "head", "tail", "wc", "stat"].includes(command)) {
    classified = intent("read_local", target, "read_only", "local_content_to_model");
  } else if (command === "rg") {
    classified = rgCommandIntent(argv, target);
  } else if (command === "sed") {
    classified = sedCommandIntent(argv, target);
  } else if (command === "find") {
    classified = findCommandIntent(argv, target);
  } else if (command === "pnpm") {
    classified = pnpmCommandIntent(argv, target);
  } else if (command === "npm" && argv[0] === "test") {
    classified = intent("run_local_verification", target, "conditional", "local_content_to_model");
  } else if (command === "node" && argv.includes("--test")) {
    classified = intent("run_local_verification", target, "conditional", "local_content_to_model");
  } else {
    classified = intent("execute_dynamic_code", target, "unknown", "unknown");
  }
  if (cwd === "state" && classified.operation !== "read_local") {
    return intent("unknown", target, "unknown", classified.data_exposure);
  }
  return classified;
}

function gitCommandIntent(argv: string[], target: string): EffectIntent {
  const subcommand = argv[0] ?? "";
  if (["status", "diff", "log", "show", "rev-parse"].includes(subcommand)) {
    if (argv.some(gitReadEscapeFlag)) return intent("execute_dynamic_code", target, "unknown", "unknown");
    return intent("read_local", target, "read_only", "local_content_to_model");
  }
  if (subcommand === "push" || subcommand === "fetch" || subcommand === "pull") {
    return intent("write_external", target, "conditional", "unknown");
  }
  if (["reset", "clean", "checkout", "restore"].includes(subcommand)) {
    return intent("destructive_local", target, "conditional", "none");
  }
  if (subcommand === "add") {
    return intent("write_local_repo", target, "reversible", "none");
  }
  if (subcommand === "commit") {
    if (argv.includes("--dry-run")) return intent("unknown", target, "unknown", "none");
    return intent("execute_dynamic_code", target, "conditional", "none");
  }
  if (subcommand === "worktree") {
    const operation = argv[1] ?? "";
    if (operation === "list") return intent("read_local", target, "read_only", "local_content_to_model");
    if (operation === "remove" || operation === "prune") {
      return intent("destructive_local", target, "conditional", "none");
    }
    return intent("mutate_local_runtime", target, "conditional", "none");
  }
  return intent("execute_dynamic_code", target, "unknown", "unknown");
}

function rgCommandIntent(argv: string[], target: string): EffectIntent {
  const canSpawn = argv.some((item) => item === "--pre"
    || item.startsWith("--pre=")
    || item === "--hostname-bin"
    || item.startsWith("--hostname-bin="));
  return canSpawn
    ? intent("execute_dynamic_code", target, "unknown", "local_content_to_model")
    : intent("read_local", target, "read_only", "local_content_to_model");
}

function sedCommandIntent(argv: string[], target: string): EffectIntent {
  const inPlace = argv.some((item) => item === "-i"
    || /^-i.+/.test(item)
    || item === "--in-place"
    || item.startsWith("--in-place="));
  return inPlace
    ? intent("destructive_local", target, "conditional", "none")
    : intent("execute_dynamic_code", target, "unknown", "local_content_to_model");
}

function findCommandIntent(argv: string[], target: string): EffectIntent {
  const changesState = argv.some((item) => ["-delete", "-exec", "-execdir", "-ok", "-okdir", "-fprint", "-fprint0", "-fprintf", "-fls"].includes(item));
  return changesState
    ? intent("destructive_local", target, "conditional", "none")
    : intent("read_local", target, "read_only", "local_content_to_model");
}

function pnpmCommandIntent(argv: string[], target: string): EffectIntent {
  const first = argv[0] ?? "";
  const script = first === "run" ? argv[1] ?? "" : first;
  if (first === "test" || ["check", "test", "lint", "typecheck", "build"].includes(script)) {
    return intent("run_local_verification", target, "conditional", "local_content_to_model");
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

function commandHasEnvironment(args: Record<string, unknown>): boolean {
  return isRecord(args.env) && Object.keys(args.env).length > 0;
}

function commandEscapesWorkingRoot(argv: string[]): boolean {
  return argv.some((item) => {
    const candidate = item.startsWith("--") && item.includes("=")
      ? item.slice(item.indexOf("=") + 1)
      : item;
    const normalized = candidate.replace(/\\/g, "/");
    if (normalized.startsWith("/") || normalized.startsWith("~")) return true;
    if (normalized.split("/").includes("..")) return true;
    const first = normalized.replace(/^\.\//, "").split("/").filter(Boolean)[0] ?? "";
    return first === ".git"
      || first === ".runtime"
      || first.startsWith(".runtime-")
      || first.startsWith(".runtime_")
      || first.startsWith(".local-runtime");
  });
}

function gitReadEscapeFlag(value: string): boolean {
  return value === "--ext-diff"
    || value === "--textconv"
    || value === "--exec-path"
    || value.startsWith("--exec-path=")
    || value === "--output"
    || value.startsWith("--output=");
}

export function isPrivateNetworkHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (host === "localhost"
    || host.endsWith(".localhost")
    || host.endsWith(".local")
    || host.endsWith(".internal")
    || host.endsWith(".home")
    || host.endsWith(".lan")) return true;
  if (host === "::" || host === "::1" || host.startsWith("::ffff:")) return true;
  if (/^(fc|fd|fe8|fe9|fea|feb|ff)[0-9a-f]*:/i.test(host) || host.startsWith("2001:db8:")) return true;
  const octets = host.split(".");
  if (octets.length !== 4 || octets.some((part) => !/^\d{1,3}$/.test(part))) return false;
  const values = octets.map(Number);
  if (values.some((value) => value > 255)) return true;
  const [first, second] = values;
  return first === 0
    || first === 10
    || first === 127
    || (first === 100 && second! >= 64 && second! <= 127)
    || (first === 169 && second === 254)
    || (first === 172 && second! >= 16 && second! <= 31)
    || (first === 192 && (second === 0 || second === 168))
    || (first === 198 && (second === 18 || second === 19 || second === 51))
    || (first === 203 && second === 0)
    || first! >= 224;
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
