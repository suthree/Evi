import { constants, existsSync } from "node:fs";
import { access } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { validateSkillPackages, scanSkillRegistry } from "../../core/src/skill_registry.js";
import { resolveSkillResolver } from "../../core/src/skill_resolver.js";
import { AgentStore } from "../../core/src/store.js";
import { coreToolContracts } from "../../core/src/tool_contracts.js";
import { assertDiscordConfigReady } from "./channels/discord/config.js";
import { assertFeishuConfigReady } from "./channels/feishu/config.js";
import { assertTelegramConfigReady } from "./channels/telegram/config.js";
import {
  loadConfig,
  loadGoalCognitionConfig,
  loadRuntimeAuthDiagnostics,
  type RuntimeAuthDiagnostics,
  type RuntimeConfig
} from "./config.js";
import { assertRuntimeImAdapterSupported } from "./im_adapters.js";
import { loadImScenarioConfig } from "./im_config.js";
import type { ImProvider } from "./im_config.js";

export type DoctorCheckLevel = "ok" | "warn" | "error";

export interface DoctorCheck {
  name: string;
  level: DoctorCheckLevel;
  summary: string;
  details?: Record<string, unknown>;
}

export interface DoctorReport {
  ok: boolean;
  repo_root: string;
  config_dir: string;
  state_root: string | null;
  vault_root: string | null;
  home_root: string | null;
  checks: DoctorCheck[];
}

export interface DoctorOptions {
  repoRoot?: string;
  configDir?: string;
  stateRoot?: string;
  requireAuth?: boolean;
  requireIm?: boolean;
  provider?: ImProvider;
}

export async function runDoctor(options: DoctorOptions = {}): Promise<DoctorReport> {
  const repoRoot = resolve(options.repoRoot ?? ".");
  const configDir = resolve(options.configDir ?? "config");
  const checks: DoctorCheck[] = [];

  await checkPath(checks, "repo_root", repoRoot, constants.R_OK, "Repository root is readable.");

  let config: RuntimeConfig | null = null;
  try {
    config = await loadConfig({
      configDir,
      stateRoot: options.stateRoot,
      skipAuth: true
    });
    checks.push({
      name: "config",
      level: "ok",
      summary: "Config JSONL loaded.",
      details: {
        active_model: config.model.id,
        provider: config.model.provider,
        model: config.model.model,
        api: config.model.api,
        home_root: config.home.root,
        state_root: config.state.root,
        vault_mode: config.vault.mode,
        vault_root: config.vault.root,
        seed_roots: config.vault.seed_roots,
        project_roots: config.vault.project_roots
      }
    });
  } catch (error) {
    checks.push({
      name: "config",
      level: "error",
      summary: errorMessage(error)
    });
    return buildReport(repoRoot, configDir, null, null, null, checks);
  }

  if (options.requireAuth !== false) {
    try {
      await loadConfig({
        configDir,
        stateRoot: options.stateRoot,
        skipAuth: false
      });
      const authDiagnostics = await loadRuntimeAuthDiagnostics({
        configDir,
        stateRoot: options.stateRoot
      });
      checks.push({
        name: "auth",
        level: "ok",
        summary: "Active model auth resolved.",
        details: {
          active_model_auth: authDiagnostics.active_model_auth,
          refs: authDiagnostics.refs,
          boundary: authDiagnostics.boundary
        }
      });
    } catch (error) {
      const authDiagnostics = await safeRuntimeAuthDiagnostics({
        configDir,
        stateRoot: options.stateRoot
      });
      checks.push({
        name: "auth",
        level: "error",
        summary: errorMessage(error),
        ...(authDiagnostics
          ? {
            details: {
              active_model_auth: authDiagnostics.active_model_auth,
              refs: authDiagnostics.refs,
              boundary: authDiagnostics.boundary
            }
          }
          : {})
      });
    }
  } else {
    checks.push({
      name: "auth",
      level: "warn",
      summary: "Auth check skipped by --no-auth."
    });
  }

  const store = new AgentStore(repoRoot, config.state.root);
  await checkStateRoot(checks, store.stateRoot);
  await checkMemoryIndex(checks, store);
  await checkVault(checks, store, config.vault);
  await checkSkills(checks, store, config.vault);
  await checkIm(checks, {
    configDir,
    stateRoot: options.stateRoot,
    activeModelId: config.model.id,
    requireAuth: options.requireAuth,
    requireIm: options.requireIm,
    provider: options.provider,
    authDiagnostics: await safeRuntimeAuthDiagnostics({
      configDir,
      stateRoot: options.stateRoot
    })
  });

  checks.push({
    name: "tool_contracts",
    level: "ok",
    summary: "Core tool contracts are available.",
    details: {
      count: coreToolContracts.length,
      tools: coreToolContracts.map((contract) => contract.tool)
    }
  });

  return buildReport(repoRoot, configDir, config.home.root, config.state.root, config.vault.root, checks);
}

async function checkMemoryIndex(checks: DoctorCheck[], store: AgentStore): Promise<void> {
  const { MemoryStore } = await import("../../core/src/memory_store.js");
  const memory = new MemoryStore(store);
  try {
    const sync = await memory.syncEpisodeEvents();
    const stats = await memory.getStats();
    checks.push({
      name: "memory_index",
      level: "ok",
      summary: stats.events_count > 0
        ? `Memory index is ready with ${stats.events_count} episode event(s).`
        : "Memory index is ready; no episode events found yet.",
      details: { sync, stats }
    });
  } catch (error) {
    checks.push({
      name: "memory_index",
      level: "error",
      summary: errorMessage(error),
      details: { db_path: memory.dbPath }
    });
  } finally {
    memory.close();
  }
}

async function checkPath(
  checks: DoctorCheck[],
  name: string,
  path: string,
  mode: number,
  okSummary: string
): Promise<void> {
  try {
    await access(path, mode);
    checks.push({
      name,
      level: "ok",
      summary: okSummary,
      details: { path }
    });
  } catch (error) {
    checks.push({
      name,
      level: "error",
      summary: errorMessage(error),
      details: { path }
    });
  }
}

async function checkStateRoot(checks: DoctorCheck[], stateRoot: string): Promise<void> {
  if (existsSync(stateRoot)) {
    await checkPath(checks, "state_root", stateRoot, constants.R_OK | constants.W_OK, "State root is readable and writable.");
    return;
  }

  const parent = nearestExistingParent(dirname(stateRoot));
  try {
    await access(parent, constants.R_OK | constants.W_OK);
    checks.push({
      name: "state_root",
      level: "warn",
      summary: "State root does not exist yet; live and pipeline runs will create it.",
      details: { state_root: stateRoot, nearest_existing_parent: parent }
    });
  } catch (error) {
    checks.push({
      name: "state_root",
      level: "error",
      summary: `State root does not exist and no writable parent was found: ${errorMessage(error)}`,
      details: { state_root: stateRoot, nearest_existing_parent: parent }
    });
  }
}

async function checkVault(checks: DoctorCheck[], store: AgentStore, vault: RuntimeConfig["vault"]): Promise<void> {
  const resolver = resolveSkillResolver(vault);
  const path = store.repoPath(resolver.active_root);
  if (!existsSync(path)) {
    const parent = nearestExistingParent(dirname(path));
    try {
      await access(parent, constants.R_OK | constants.W_OK);
      checks.push({
        name: "vault",
        level: "warn",
        summary: "Active vault root does not exist yet; live runs and skills commands will create it.",
        details: { mode: vault.mode, vault_root: resolver.active_root, path, nearest_existing_parent: parent }
      });
    } catch (error) {
      checks.push({
        name: "vault",
        level: "error",
        summary: `Active vault root does not exist and no writable parent was found: ${errorMessage(error)}`,
        details: { mode: vault.mode, vault_root: resolver.active_root, path, nearest_existing_parent: parent }
      });
    }
    return;
  }
  await checkPath(checks, "vault", path, constants.R_OK | constants.W_OK, "Vault root is readable and writable.");

  const seedDetails = resolver.seed_roots.map((root) => ({
    root,
    exists: store.pathExists(root)
  }));
  const missingSeeds = seedDetails.filter((item) => !item.exists);
  checks.push({
    name: "vault_seeds",
    level: missingSeeds.length > 0 ? "warn" : "ok",
    summary: missingSeeds.length > 0
      ? `${missingSeeds.length} configured seed root(s) do not exist.`
      : "Configured seed roots are present.",
    details: { seed_roots: seedDetails }
  });
}

async function checkSkills(checks: DoctorCheck[], store: AgentStore, vaultRoot: RuntimeConfig["vault"]): Promise<void> {
  try {
    const reports = await validateSkillPackages(store, vaultRoot);
    const failed = reports.filter((report) => !report.ok);
    checks.push({
      name: "skills_validate",
      level: failed.length > 0 ? "error" : "ok",
      summary: failed.length > 0
        ? `${failed.length} skill package(s) failed validation.`
        : `Validated ${reports.length} skill package(s) across resolver roots.`,
      details: { reports }
    });
  } catch (error) {
    checks.push({
      name: "skills_validate",
      level: "error",
      summary: errorMessage(error)
    });
  }

  try {
    const entries = await scanSkillRegistry(store, vaultRoot);
    checks.push({
      name: "skills_registry",
      level: "ok",
      summary: `Scanned ${entries.length} active skill registry entr${entries.length === 1 ? "y" : "ies"}.`,
      details: {
        entries: entries.map((entry) => ({
          name: entry.name,
          status: entry.status,
          instructions_ref: entry.instructions_ref
        }))
      }
    });
  } catch (error) {
    checks.push({
      name: "skills_registry",
      level: "error",
      summary: errorMessage(error)
    });
  }
}

async function checkIm(
  checks: DoctorCheck[],
  options: { configDir: string; stateRoot?: string; activeModelId?: string; requireAuth?: boolean; requireIm?: boolean; provider?: ImProvider; authDiagnostics?: RuntimeAuthDiagnostics | null }
): Promise<void> {
  if (options.requireIm === false) {
    checks.push({
      name: "im",
      level: "warn",
      summary: "IM check skipped by --no-im."
    });
    return;
  }

  try {
    const scenario = await loadImScenarioConfig({
      configDir: options.configDir,
      stateRoot: options.stateRoot,
      provider: options.provider
    });
    const goalCognition = await loadGoalCognitionConfig({
      configDir: options.configDir,
      stateRoot: options.stateRoot
    });
    if (scenario.provider === "feishu") {
      await loadConfig({
        configDir: options.configDir,
        stateRoot: options.stateRoot,
        modelId: scenario.legacyPrivateModelId,
        skipAuth: true
      });
      if (options.requireAuth !== false && scenario.legacyPrivateModelId !== options.activeModelId) {
        await loadConfig({
          configDir: options.configDir,
          stateRoot: options.stateRoot,
          modelId: scenario.legacyPrivateModelId,
          skipAuth: false
        });
      }
    }
    assertRuntimeImAdapterSupported(scenario);
    if (scenario.provider === "feishu") assertFeishuConfigReady(scenario.channel);
    if (scenario.provider === "telegram") assertTelegramConfigReady(scenario.channel);
    if (scenario.provider === "discord") assertDiscordConfigReady(scenario.channel);
    const authDiagnostics = await safeRuntimeAuthDiagnostics({
      configDir: options.configDir,
      stateRoot: options.stateRoot,
      channelId: scenario.channelId
    }) ?? options.authDiagnostics;
    checks.push({
      name: "im",
      level: "ok",
      summary: `IM ${scenario.provider} channel and Goal cognition selection resolved.`,
      details: {
        provider: scenario.provider,
        scenario_id: scenario.id,
        channel_id: scenario.channelId,
        execution_owner: "goal_cognition",
        goal_cognition_provider: goalCognition.provider,
        goal_cognition_source_ref: goalCognition.source_ref,
        ...(scenario.provider === "feishu" ? {
          legacy_private_model_id: scenario.legacyPrivateModelId,
          legacy_private_discipline: scenario.legacyPrivateDiscipline,
          legacy_private_reply_policy: scenario.legacyPrivateReplyPolicy,
          domain: scenario.channel.domain,
          allowed_open_ids_count: scenario.channel.allowedOpenIds.length
        } : scenario.provider === "telegram" ? {
          allowed_user_ids_count: scenario.channel.allowedUserIds.length
        } : {
          allowed_user_ids_count: scenario.channel.allowedUserIds.length,
          allowed_guild_ids_count: scenario.channel.allowedGuildIds.length
        }),
        active_channel_auth: authDiagnostics?.active_channel_auth,
        auth_refs: authDiagnostics?.active_channel_auth
          ? authDiagnostics.refs
          : undefined,
        auth_boundary: authDiagnostics?.boundary
      }
    });
  } catch (error) {
    const details = options.authDiagnostics?.active_channel_auth
      ? {
        active_channel_auth: options.authDiagnostics.active_channel_auth,
        auth_refs: options.authDiagnostics.refs,
        auth_boundary: options.authDiagnostics.boundary
      }
      : undefined;
    checks.push({
      name: "im",
      level: "error",
      summary: errorMessage(error),
      ...(details ? { details } : {})
    });
  }
}

async function safeRuntimeAuthDiagnostics(options: { configDir: string; stateRoot?: string; channelId?: string }): Promise<RuntimeAuthDiagnostics | null> {
  try {
    return await loadRuntimeAuthDiagnostics(options);
  } catch {
    return null;
  }
}

function nearestExistingParent(path: string): string {
  let current = path;
  while (!existsSync(current)) {
    const parent = dirname(current);
    if (parent === current) return current;
    current = parent;
  }
  return current;
}

function buildReport(
  repoRoot: string,
  configDir: string,
  homeRoot: string | null,
  stateRoot: string | null,
  vaultRoot: string | null,
  checks: DoctorCheck[]
): DoctorReport {
  return {
    ok: checks.every((check) => check.level !== "error"),
    repo_root: repoRoot,
    config_dir: configDir,
    home_root: homeRoot,
    state_root: stateRoot,
    vault_root: vaultRoot,
    checks
  };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
