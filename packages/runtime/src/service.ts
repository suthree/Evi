import { execFile as execFileCallback } from "node:child_process";
import { existsSync } from "node:fs";
import { cp, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { homedir, userInfo } from "node:os";
import { dirname, resolve } from "node:path";
import { promisify } from "node:util";
import { summarizeContentDailyEffectiveStatus } from "../../core/src/service_health.js";
import { AgentStore } from "../../core/src/store.js";
import { loadFeishuScenarioConfig } from "./channels/feishu/config.js";
import { loadConfig, loadConfigSelectors, type ConfigSelectors } from "./config.js";
import type { ContentDailyLoopStatus } from "./content_daily_service.js";
import type { ContentCreatorMetricsLoopStatus } from "./content_creator_metrics_service.js";
import type { ContentFeedbackRefreshLoopStatus } from "./content_feedback_refresh_service.js";
import type { ReviewTickLoopStatus } from "./review_tick_service.js";
import type { DisciplineMode } from "./runner.js";
import { readServiceRuntimeBuild, type ServiceRuntimeBuild } from "./service_runtime_build.js";

const execFile = promisify(execFileCallback);

export type ServiceAction = "install" | "start" | "stop" | "restart" | "status" | "logs" | "uninstall";
export type ServiceTarget = "im";

export interface ServiceCommandOptions {
  action: ServiceAction;
  target: ServiceTarget;
  configDir?: string;
  repoRoot?: string;
  stateRoot?: string;
  channelId?: string;
  scenarioId?: string;
  discipline?: DisciplineMode;
  limit?: number;
}

export interface CommandResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export type CommandRunner = (command: string, args: string[], options?: { timeoutMs?: number }) => Promise<CommandResult>;

export interface ServiceDefinitionInput {
  repoRoot: string;
  configDir: string;
  stateRoot: string;
  homeRoot: string;
  channelId?: string;
  scenarioId?: string;
  discipline?: DisciplineMode;
  nodePath?: string;
  pathEnv?: string;
}

export interface ServiceDefinition {
  target: ServiceTarget;
  label: string;
  domain: string;
  plistPath: string;
  manifestPath: string;
  workingDirectory: string;
  repoRoot: string;
  sourceConfigDir: string;
  configDir: string;
  stateRoot: string;
  homeRoot: string;
  runtimeRoot: string;
  runtimeCurrentRoot: string;
  runtimeNextRoot: string;
  runtimeBuildPath: string;
  runtimeConfigDir: string;
  logDir: string;
  stdoutPath: string;
  stderrPath: string;
  heartbeatPath: string;
  reviewTickStatusPath: string;
  contentDailyStatusPath: string;
  contentFeedbackRefreshStatusPath: string;
  contentCreatorMetricsStatusPath: string;
  autonomyPausePath: string;
  runnerFiles: string[];
  programArguments: string[];
  environment: Record<string, string>;
}

export interface ServiceCommandResult {
  ok: boolean;
  action: ServiceAction;
  target: ServiceTarget;
  label: string;
  plist_path: string;
  manifest_path: string;
  state_root: string;
  home_root: string;
  logs: {
    stdout: string;
    stderr: string;
    stdout_tail?: string;
    stderr_tail?: string;
  };
  launchd?: LaunchdStatus;
  runtime?: ServiceRuntimeBuild | null;
  heartbeat?: ServiceHeartbeat | null;
  review_tick?: ReviewTickLoopStatus | null;
  content_daily?: ContentDailyLoopStatus | null;
  content_feedback_refresh?: ContentFeedbackRefreshLoopStatus | null;
  content_creator_metrics?: ContentCreatorMetricsLoopStatus | null;
  autonomy_pause?: AutonomyPauseStatus | null;
  message?: string;
}

export interface LaunchdStatus {
  supported: boolean;
  installed: boolean;
  loaded: boolean;
  pid: number | null;
  detail: string;
}

export interface ServiceHeartbeat {
  service: ServiceTarget;
  state: string;
  pid: number;
  repo_root: string;
  state_root: string;
  channel_id?: string;
  scenario_id?: string;
  runtime_build?: ServiceRuntimeBuild;
  started_at: string;
  updated_at: string;
}

export interface AutonomyPauseStatus {
  ref: "autonomy/runs/pause_signal.json";
  id?: string;
  action_type?: string;
  status?: string;
  scope?: string;
  reason?: string;
  resume_hint?: string;
  requested_by?: string;
  session_id?: string;
  turn_id?: string;
  created_at?: string;
  boundary?: string;
  artifact_refs?: string[];
}

export async function runServiceCommand(
  options: ServiceCommandOptions,
  deps: { run?: CommandRunner; platform?: NodeJS.Platform } = {}
): Promise<ServiceCommandResult> {
  const action = options.action;
  const validateRuntime = action === "install" || action === "start" || action === "restart";
  const definition = await resolveServiceDefinition(options, validateRuntime);
  const run = deps.run ?? runCommand;
  const platform = deps.platform ?? process.platform;

  if (platform !== "darwin") {
    if (action === "status" || action === "logs") return buildResult(action, definition, {
      launchd: {
        supported: false,
        installed: existsSync(definition.plistPath),
        loaded: false,
        pid: null,
        detail: "local runtime service management currently supports macOS launchd only."
      },
      heartbeat: await readHeartbeat(definition),
      reviewTick: await readReviewTickStatus(definition),
      contentDaily: await readContentDailyStatus(definition),
      contentFeedbackRefresh: await readContentFeedbackRefreshStatus(definition),
      contentCreatorMetrics: await readContentCreatorMetricsStatus(definition),
      runtime: await readRuntimeBuild(definition),
      autonomyPause: await readAutonomyPauseStatus(definition)
    });
    throw new Error("local runtime service management currently supports macOS launchd only.");
  }

  if (action === "install") {
    await stopLaunchd(definition, run);
    await writeServiceFiles(definition);
    return buildResult(action, definition, {
      launchd: await inspectLaunchd(definition, run),
      heartbeat: await readHeartbeat(definition),
      reviewTick: await readReviewTickStatus(definition),
      contentDaily: await readContentDailyStatus(definition),
      contentFeedbackRefresh: await readContentFeedbackRefreshStatus(definition),
      contentCreatorMetrics: await readContentCreatorMetricsStatus(definition),
      runtime: await readRuntimeBuild(definition),
      autonomyPause: await readAutonomyPauseStatus(definition),
      message: "Service definition installed. Run service start to load it."
    });
  }

  if (action === "start") {
    await stopLaunchd(definition, run);
    await writeServiceFiles(definition);
    await startLaunchd(definition, run);
    return buildResult(action, definition, {
      launchd: await inspectLaunchd(definition, run),
      heartbeat: await readHeartbeat(definition),
      reviewTick: await readReviewTickStatus(definition),
      contentDaily: await readContentDailyStatus(definition),
      contentFeedbackRefresh: await readContentFeedbackRefreshStatus(definition),
      contentCreatorMetrics: await readContentCreatorMetricsStatus(definition),
      runtime: await readRuntimeBuild(definition),
      autonomyPause: await readAutonomyPauseStatus(definition),
      message: "Service start requested."
    });
  }

  if (action === "stop") {
    await stopLaunchd(definition, run);
    return buildResult(action, definition, {
      launchd: await inspectLaunchd(definition, run),
      heartbeat: await readHeartbeat(definition),
      reviewTick: await readReviewTickStatus(definition),
      contentDaily: await readContentDailyStatus(definition),
      contentFeedbackRefresh: await readContentFeedbackRefreshStatus(definition),
      contentCreatorMetrics: await readContentCreatorMetricsStatus(definition),
      runtime: await readRuntimeBuild(definition),
      autonomyPause: await readAutonomyPauseStatus(definition),
      message: "Service stop requested."
    });
  }

  if (action === "restart") {
    await stopLaunchd(definition, run);
    await writeServiceFiles(definition);
    await startLaunchd(definition, run);
    return buildResult(action, definition, {
      launchd: await inspectLaunchd(definition, run),
      heartbeat: await readHeartbeat(definition),
      reviewTick: await readReviewTickStatus(definition),
      contentDaily: await readContentDailyStatus(definition),
      contentFeedbackRefresh: await readContentFeedbackRefreshStatus(definition),
      contentCreatorMetrics: await readContentCreatorMetricsStatus(definition),
      runtime: await readRuntimeBuild(definition),
      autonomyPause: await readAutonomyPauseStatus(definition),
      message: "Service restart requested."
    });
  }

  if (action === "uninstall") {
    await stopLaunchd(definition, run);
    return buildResult(action, definition, {
      launchd: await inspectLaunchd(definition, run),
      heartbeat: await readHeartbeat(definition),
      reviewTick: await readReviewTickStatus(definition),
      contentDaily: await readContentDailyStatus(definition),
      contentFeedbackRefresh: await readContentFeedbackRefreshStatus(definition),
      contentCreatorMetrics: await readContentCreatorMetricsStatus(definition),
      runtime: await readRuntimeBuild(definition),
      autonomyPause: await readAutonomyPauseStatus(definition),
      message: "Service unloaded. Remove the plist manually if you want to delete the installed definition."
    });
  }

  if (action === "logs") {
    return buildResult(action, definition, {
      launchd: await inspectLaunchd(definition, run),
      heartbeat: await readHeartbeat(definition),
      reviewTick: await readReviewTickStatus(definition),
      contentDaily: await readContentDailyStatus(definition),
      contentFeedbackRefresh: await readContentFeedbackRefreshStatus(definition),
      contentCreatorMetrics: await readContentCreatorMetricsStatus(definition),
      runtime: await readRuntimeBuild(definition),
      autonomyPause: await readAutonomyPauseStatus(definition),
      stdoutTail: await tailFile(definition.stdoutPath, options.limit ?? 80),
      stderrTail: await tailFile(definition.stderrPath, options.limit ?? 80)
    });
  }

  return buildResult(action, definition, {
    launchd: await inspectLaunchd(definition, run),
    heartbeat: await readHeartbeat(definition),
    reviewTick: await readReviewTickStatus(definition),
    contentDaily: await readContentDailyStatus(definition),
    contentFeedbackRefresh: await readContentFeedbackRefreshStatus(definition),
    contentCreatorMetrics: await readContentCreatorMetricsStatus(definition),
    runtime: await readRuntimeBuild(definition),
    autonomyPause: await readAutonomyPauseStatus(definition)
  });
}

export async function resolveServiceDefinition(
  options: ServiceCommandOptions,
  validateRuntime = false
): Promise<ServiceDefinition> {
  if (options.target !== "im") throw new Error(`Unsupported service target: ${options.target}`);
  const serviceSelectors = await resolveServiceConfigSelectors(options);

  let channelId = options.channelId ?? serviceSelectors.activeChannelId ?? undefined;
  let scenarioId = options.scenarioId ?? serviceSelectors.activeScenarioId ?? undefined;
  let discipline: "query_todo" | undefined = options.discipline === "query_todo" ? "query_todo" : undefined;

  if (validateRuntime) {
    const scenario = await loadFeishuScenarioConfig({
      configDir: options.configDir,
      stateRoot: serviceSelectors.stateRoot,
      channelId: options.channelId,
      scenarioId: options.scenarioId
    });
    await loadConfig({
      configDir: options.configDir,
      stateRoot: serviceSelectors.stateRoot,
      modelId: scenario.modelId
    });
    channelId = scenario.channelId;
    scenarioId = scenario.id;
    discipline = options.discipline === "query_todo"
      ? "query_todo"
      : scenario.discipline === "query_todo"
        ? "query_todo"
        : undefined;
  }

  return buildImServiceDefinition({
    repoRoot: resolve(options.repoRoot ?? "."),
    configDir: serviceSelectors.configDir,
    stateRoot: serviceSelectors.stateRoot,
    homeRoot: serviceSelectors.homeRoot,
    channelId,
    scenarioId,
    discipline
  });
}

export async function resolveServiceConfigSelectors(
  options: Pick<ServiceCommandOptions, "target" | "configDir" | "stateRoot">
): Promise<ConfigSelectors> {
  if (options.target !== "im") throw new Error(`Unsupported service target: ${options.target}`);
  const selectors = await loadConfigSelectors({
    configDir: options.configDir,
    stateRoot: options.stateRoot
  });
  const serviceStateRoot = options.stateRoot
    ? selectors.stateRoot
    : resolve(selectors.homeRoot, "state/runtime");
  const serviceSelectors = await loadConfigSelectors({
    configDir: options.configDir,
    stateRoot: serviceStateRoot
  });
  return serviceSelectors;
}

export function buildImServiceDefinition(input: ServiceDefinitionInput): ServiceDefinition {
  const label = "local.runtime.im";
  const repoRoot = resolve(input.repoRoot);
  const configDir = resolve(input.configDir);
  const stateRoot = resolve(input.stateRoot);
  const homeRoot = resolve(input.homeRoot);
  const logDir = resolve(homeRoot, "logs");
  const serviceDir = resolve(homeRoot, "service");
  const runtimeRoot = resolve(serviceDir, "runtime");
  const runtimeCurrentRoot = resolve(runtimeRoot, "current");
  const runtimeNextRoot = resolve(runtimeRoot, "next");
  const runtimeConfigDir = resolve(runtimeCurrentRoot, "config");
  const runtimeBuildPath = resolve(runtimeCurrentRoot, "build.json");
  const stdoutPath = resolve(logDir, "im.out.log");
  const stderrPath = resolve(logDir, "im.err.log");
  const runtimeCliEntry = resolve(runtimeCurrentRoot, "dist/apps/cli/src/main.js");
  const runtimeNodeModules = resolve(runtimeCurrentRoot, "node_modules");
  const imArgs = [
    "im",
    "serve",
    "--config-dir",
    runtimeConfigDir,
    "--repo-root",
    repoRoot,
    "--state-root",
    stateRoot
  ];
  if (input.scenarioId) imArgs.push("--scenario", input.scenarioId);
  if (input.channelId) imArgs.push("--channel", input.channelId);
  if (input.discipline && input.discipline !== "none") imArgs.push("--discipline", input.discipline);
  imArgs.push("--runtime-build", runtimeBuildPath);

  return {
    target: "im",
    label,
    domain: `gui/${process.getuid?.() ?? 501}`,
    plistPath: resolve(homedir(), "Library/LaunchAgents", `${label}.plist`),
    manifestPath: resolve(serviceDir, "im.json"),
    workingDirectory: homeRoot,
    repoRoot,
    sourceConfigDir: configDir,
    configDir: runtimeConfigDir,
    stateRoot,
    homeRoot,
    runtimeRoot,
    runtimeCurrentRoot,
    runtimeNextRoot,
    runtimeBuildPath,
    runtimeConfigDir,
    logDir,
    stdoutPath,
    stderrPath,
    heartbeatPath: resolve(stateRoot, "services/im/heartbeat.json"),
    reviewTickStatusPath: resolve(stateRoot, "services/im/review_tick.json"),
    contentDailyStatusPath: resolve(stateRoot, "services/im/content_daily.json"),
    contentFeedbackRefreshStatusPath: resolve(stateRoot, "services/im/content_feedback_refresh.json"),
    contentCreatorMetricsStatusPath: resolve(stateRoot, "services/im/content_creator_metrics.json"),
    autonomyPausePath: resolve(stateRoot, "autonomy/runs/pause_signal.json"),
    runnerFiles: [runtimeCliEntry, runtimeNodeModules],
    programArguments: [
      input.nodePath ?? process.execPath,
      runtimeCliEntry,
      ...imArgs
    ],
    environment: {
      LOCAL_RUNTIME_HOME: homeRoot,
      HOME: homedir(),
      USER: currentUserName(),
      LOGNAME: currentUserName(),
      PATH: input.pathEnv ?? process.env.PATH ?? "/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"
    }
  };
}

export function renderLaunchdPlist(definition: ServiceDefinition): string {
  return [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">`,
    `<plist version="1.0">`,
    `<dict>`,
    `  <key>Label</key>`,
    `  <string>${escapeXml(definition.label)}</string>`,
    `  <key>ProgramArguments</key>`,
    `  <array>`,
    ...definition.programArguments.map((arg) => `    <string>${escapeXml(arg)}</string>`),
    `  </array>`,
    `  <key>WorkingDirectory</key>`,
    `  <string>${escapeXml(definition.workingDirectory)}</string>`,
    `  <key>EnvironmentVariables</key>`,
    `  <dict>`,
    ...Object.entries(definition.environment).flatMap(([key, value]) => [
      `    <key>${escapeXml(key)}</key>`,
      `    <string>${escapeXml(value)}</string>`
    ]),
    `  </dict>`,
    `  <key>LimitLoadToSessionType</key>`,
    `  <array>`,
    `    <string>Aqua</string>`,
    `    <string>Background</string>`,
    `  </array>`,
    `  <key>RunAtLoad</key>`,
    `  <true/>`,
    `  <key>KeepAlive</key>`,
    `  <true/>`,
    `  <key>StandardOutPath</key>`,
    `  <string>${escapeXml(definition.stdoutPath)}</string>`,
    `  <key>StandardErrorPath</key>`,
    `  <string>${escapeXml(definition.stderrPath)}</string>`,
    `</dict>`,
    `</plist>`,
    ``
  ].join("\n");
}

async function writeServiceFiles(definition: ServiceDefinition): Promise<void> {
  if (!existsSync(definition.programArguments[0])) {
    throw new Error(`node executable not found: ${definition.programArguments[0]}`);
  }
  await syncServiceRuntimeBundle(definition);
  for (const file of definition.runnerFiles) {
    if (!existsSync(file)) throw new Error(`Local Runtime service runner file not found: ${file}`);
  }
  await mkdir(dirname(definition.plistPath), { recursive: true });
  await mkdir(definition.logDir, { recursive: true });
  await mkdir(dirname(definition.manifestPath), { recursive: true });
  await writeFile(definition.plistPath, renderLaunchdPlist(definition), "utf8");
  await writeFile(definition.manifestPath, `${JSON.stringify({
    target: definition.target,
    label: definition.label,
    plist_path: definition.plistPath,
    working_directory: definition.workingDirectory,
    repo_root: definition.repoRoot,
    source_config_dir: definition.sourceConfigDir,
    config_dir: definition.configDir,
    state_root: definition.stateRoot,
    home_root: definition.homeRoot,
    runtime_root: definition.runtimeRoot,
    runtime_current_root: definition.runtimeCurrentRoot,
    runtime_build_path: definition.runtimeBuildPath,
    stdout_path: definition.stdoutPath,
    stderr_path: definition.stderrPath,
    heartbeat_path: definition.heartbeatPath,
    review_tick_status_path: definition.reviewTickStatusPath,
    content_daily_status_path: definition.contentDailyStatusPath,
    content_feedback_refresh_status_path: definition.contentFeedbackRefreshStatusPath,
    content_creator_metrics_status_path: definition.contentCreatorMetricsStatusPath,
    autonomy_pause_path: definition.autonomyPausePath,
    runner_files: definition.runnerFiles,
    program_arguments: definition.programArguments,
    updated_at: new Date().toISOString()
  }, null, 2)}\n`, "utf8");
}

async function syncServiceRuntimeBundle(definition: ServiceDefinition): Promise<void> {
  const sourceDist = resolve(definition.repoRoot, "dist");
  const sourceCliEntry = resolve(sourceDist, "apps/cli/src/main.js");
  const sourceNodeModules = resolve(definition.repoRoot, "node_modules");

  if (!existsSync(sourceCliEntry)) {
    throw new Error(`Built runtime CLI not found: ${sourceCliEntry}; run pnpm run build before service install/start.`);
  }
  if (!existsSync(sourceNodeModules)) {
    throw new Error(`node_modules not found: ${sourceNodeModules}; run pnpm install before service install/start.`);
  }
  if (!existsSync(definition.sourceConfigDir)) {
    throw new Error(`Config directory not found: ${definition.sourceConfigDir}`);
  }

  await rm(definition.runtimeNextRoot, { recursive: true, force: true });
  await mkdir(definition.runtimeNextRoot, { recursive: true });
  await cp(sourceDist, resolve(definition.runtimeNextRoot, "dist"), { recursive: true, force: true });
  await cp(sourceNodeModules, resolve(definition.runtimeNextRoot, "node_modules"), {
    recursive: true,
    force: true
  });
  await cp(definition.sourceConfigDir, resolve(definition.runtimeNextRoot, "config"), { recursive: true, force: true });
  await writeFile(resolve(definition.runtimeNextRoot, "build.json"), `${JSON.stringify(
    await buildServiceRuntimeBuild(definition),
    null,
    2
  )}\n`, "utf8");
  await writeFile(resolve(definition.runtimeNextRoot, "package.json"), `${JSON.stringify({
    private: true,
    type: "module"
  }, null, 2)}\n`, "utf8");
  await rm(definition.runtimeCurrentRoot, { recursive: true, force: true });
  await rename(definition.runtimeNextRoot, definition.runtimeCurrentRoot);
}

async function buildServiceRuntimeBuild(definition: ServiceDefinition): Promise<ServiceRuntimeBuild> {
  const [sourceCommit, sourceBranch, sourceStatus] = await Promise.all([
    gitText(definition.repoRoot, ["rev-parse", "HEAD"]),
    gitText(definition.repoRoot, ["branch", "--show-current"]),
    gitText(definition.repoRoot, ["status", "--porcelain"])
  ]);
  return {
    schema_version: 1,
    target: definition.target,
    runtime_current_root: definition.runtimeCurrentRoot,
    repo_root: definition.repoRoot,
    built_at: new Date().toISOString(),
    node_version: process.version,
    source_commit: sourceCommit ?? undefined,
    source_commit_short: sourceCommit ? sourceCommit.slice(0, 12) : undefined,
    source_branch: sourceBranch || undefined,
    source_is_dirty: sourceStatus === null ? undefined : sourceStatus.length > 0
  };
}

async function gitText(repoRoot: string, args: string[]): Promise<string | null> {
  const result = await runCommand("git", ["-C", repoRoot, ...args], { timeoutMs: 5000 });
  if (result.exitCode !== 0) return null;
  return result.stdout.trim();
}

async function startLaunchd(definition: ServiceDefinition, run: CommandRunner): Promise<void> {
  const current = await inspectLaunchd(definition, run);
  if (current.loaded) {
    const bootout = await run("launchctl", ["bootout", `${definition.domain}/${definition.label}`], { timeoutMs: 30000 });
    if (bootout.exitCode !== 0) throw new Error(`launchctl bootout failed before start: ${bootout.stderr || bootout.stdout}`);
  }
  const bootstrap = await run("launchctl", ["bootstrap", definition.domain, definition.plistPath], { timeoutMs: 30000 });
  if (bootstrap.exitCode !== 0) throw new Error(`launchctl bootstrap failed: ${bootstrap.stderr || bootstrap.stdout}`);
  const kickstart = await run("launchctl", ["kickstart", "-k", `${definition.domain}/${definition.label}`], { timeoutMs: 30000 });
  if (kickstart.exitCode !== 0) throw new Error(`launchctl kickstart failed: ${kickstart.stderr || kickstart.stdout}`);
}

async function stopLaunchd(definition: ServiceDefinition, run: CommandRunner): Promise<void> {
  const current = await inspectLaunchd(definition, run);
  if (!current.loaded) return;
  const bootout = await run("launchctl", ["bootout", `${definition.domain}/${definition.label}`], { timeoutMs: 30000 });
  if (bootout.exitCode !== 0) throw new Error(`launchctl bootout failed: ${bootout.stderr || bootout.stdout}`);
}

async function inspectLaunchd(definition: ServiceDefinition, run: CommandRunner): Promise<LaunchdStatus> {
  const installed = existsSync(definition.plistPath);
  const result = await run("launchctl", ["print", `${definition.domain}/${definition.label}`], { timeoutMs: 10000 });
  if (result.exitCode !== 0) {
    return {
      supported: true,
      installed,
      loaded: false,
      pid: null,
      detail: (result.stderr || result.stdout || "launchd job is not loaded").trim()
    };
  }
  return {
    supported: true,
    installed,
    loaded: true,
    pid: parseLaunchdPid(result.stdout),
    detail: result.stdout.trim()
  };
}

export function parseLaunchdPid(output: string): number | null {
  const match = output.match(/\bpid\s*=\s*(\d+)/);
  if (!match) return null;
  const pid = Number.parseInt(match[1], 10);
  return Number.isFinite(pid) && pid > 0 ? pid : null;
}

async function readHeartbeat(definition: ServiceDefinition): Promise<ServiceHeartbeat | null> {
  try {
    const raw = await readFile(definition.heartbeatPath, "utf8");
    return JSON.parse(raw) as ServiceHeartbeat;
  } catch {
    return null;
  }
}

async function readRuntimeBuild(definition: ServiceDefinition): Promise<ServiceRuntimeBuild | null> {
  return await readServiceRuntimeBuild(definition.runtimeBuildPath);
}

async function readReviewTickStatus(definition: ServiceDefinition): Promise<ReviewTickLoopStatus | null> {
  try {
    const raw = await readFile(definition.reviewTickStatusPath, "utf8");
    return JSON.parse(raw) as ReviewTickLoopStatus;
  } catch {
    return null;
  }
}

async function readContentDailyStatus(definition: ServiceDefinition): Promise<ContentDailyLoopStatus | null> {
  try {
    const raw = await readFile(definition.contentDailyStatusPath, "utf8");
    const status = JSON.parse(raw) as ContentDailyLoopStatus;
    const effective = await summarizeContentDailyEffectiveStatus(
      new AgentStore(definition.repoRoot, definition.stateRoot),
      status as unknown as Record<string, unknown>
    );
    return effective.status
      ? {
        ...status,
        last_effective_job_status: effective.status
      }
      : status;
  } catch {
    return null;
  }
}

async function readContentFeedbackRefreshStatus(
  definition: ServiceDefinition
): Promise<ContentFeedbackRefreshLoopStatus | null> {
  try {
    const raw = await readFile(definition.contentFeedbackRefreshStatusPath, "utf8");
    return JSON.parse(raw) as ContentFeedbackRefreshLoopStatus;
  } catch {
    return null;
  }
}

async function readContentCreatorMetricsStatus(
  definition: ServiceDefinition
): Promise<ContentCreatorMetricsLoopStatus | null> {
  try {
    const raw = await readFile(definition.contentCreatorMetricsStatusPath, "utf8");
    return JSON.parse(raw) as ContentCreatorMetricsLoopStatus;
  } catch {
    return null;
  }
}

async function readAutonomyPauseStatus(definition: ServiceDefinition): Promise<AutonomyPauseStatus | null> {
  try {
    const raw = await readFile(definition.autonomyPausePath, "utf8");
    const value = JSON.parse(raw) as Partial<AutonomyPauseStatus>;
    return {
      ...value,
      ref: "autonomy/runs/pause_signal.json"
    };
  } catch {
    return null;
  }
}

async function tailFile(path: string, limit: number): Promise<string> {
  try {
    const raw = await readFile(path, "utf8");
    const lines = raw.trimEnd().split(/\r?\n/);
    return lines.slice(-Math.max(1, limit)).join("\n");
  } catch {
    return "";
  }
}

function buildResult(
  action: ServiceAction,
  definition: ServiceDefinition,
  args: {
    launchd?: LaunchdStatus;
    heartbeat?: ServiceHeartbeat | null;
    reviewTick?: ReviewTickLoopStatus | null;
    contentDaily?: ContentDailyLoopStatus | null;
    contentFeedbackRefresh?: ContentFeedbackRefreshLoopStatus | null;
    contentCreatorMetrics?: ContentCreatorMetricsLoopStatus | null;
    runtime?: ServiceRuntimeBuild | null;
    autonomyPause?: AutonomyPauseStatus | null;
    message?: string;
    stdoutTail?: string;
    stderrTail?: string;
  }
): ServiceCommandResult {
  return {
    ok: !args.launchd || args.launchd.supported,
    action,
    target: definition.target,
    label: definition.label,
    plist_path: definition.plistPath,
    manifest_path: definition.manifestPath,
    state_root: definition.stateRoot,
    home_root: definition.homeRoot,
    logs: {
      stdout: definition.stdoutPath,
      stderr: definition.stderrPath,
      stdout_tail: args.stdoutTail,
      stderr_tail: args.stderrTail
    },
    launchd: args.launchd,
    runtime: args.runtime,
    heartbeat: args.heartbeat,
    review_tick: args.reviewTick,
    content_daily: args.contentDaily,
    content_feedback_refresh: args.contentFeedbackRefresh,
    content_creator_metrics: args.contentCreatorMetrics,
    autonomy_pause: args.autonomyPause,
    message: args.message
  };
}

async function runCommand(command: string, args: string[], options: { timeoutMs?: number } = {}): Promise<CommandResult> {
  try {
    const result = await execFile(command, args, {
      timeout: options.timeoutMs ?? 30000,
      encoding: "utf8"
    });
    return {
      stdout: result.stdout,
      stderr: result.stderr,
      exitCode: 0
    };
  } catch (error) {
    const err = error as { stdout?: string; stderr?: string; code?: number | string };
    return {
      stdout: err.stdout ?? "",
      stderr: err.stderr ?? String(error),
      exitCode: typeof err.code === "number" ? err.code : 1
    };
  }
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function currentUserName(): string {
  return process.env.USER ?? process.env.LOGNAME ?? userInfo().username;
}
