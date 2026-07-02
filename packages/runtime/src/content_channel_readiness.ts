import { execFile as execFileCallback } from "node:child_process";
import { promisify } from "node:util";
import {
  XiaohongshuMcpClient,
  summarizeXiaohongshuProbe,
  type XiaohongshuMcpProbeResult
} from "./xiaohongshu_mcp.js";

const execFile = promisify(execFileCallback);

export type ContentChannelRoute = "xiaohongshu-mcp" | "agent-browser-cli" | "blocked";
export type ContentChannelStatus = "ready" | "partial" | "blocked" | "unknown";

export interface ContentChannelCommandResult {
  command: string;
  args: string[];
  exit_code: number;
  stdout: string;
  stderr: string;
}

export type ContentChannelCommandRunner = (
  command: string,
  args: string[],
  options?: { timeoutMs?: number }
) => Promise<ContentChannelCommandResult>;

export interface ContentChannelCheck {
  id: string;
  status: "pass" | "warning" | "blocked";
  summary: string;
  command?: string;
  exit_code?: number;
  stdout_preview?: string;
  stderr_preview?: string;
  next_command?: string;
}

export interface ContentChannelReadinessChannel {
  id: "xiaohongshu-mcp" | "agent-browser-cli";
  status: ContentChannelStatus;
  summary: string;
  checks: ContentChannelCheck[];
}

export interface ContentChannelReadinessResult {
  created_at: string;
  status: "ready" | "degraded" | "blocked";
  recommended_route: ContentChannelRoute;
  channels: {
    xiaohongshu_mcp: ContentChannelReadinessChannel;
    agent_browser_cli: ContentChannelReadinessChannel;
  };
  next_commands: string[];
  boundary: string;
}

export interface ContentChannelReadinessArgs {
  serverUrl?: string;
  publishTool?: string;
  browserLaunchCheck?: boolean;
  commandRunner?: ContentChannelCommandRunner;
  mcpClient?: { probe(args?: { publishTool?: string }): Promise<XiaohongshuMcpProbeResult> };
}

const CONTENT_CHANNEL_READINESS_BOUNDARY = "read-only local content channel readiness audit; may run local agent-browser diagnostics including an about:blank launch check and read-only xiaohongshu-mcp probe calls, never reads draft bodies, image bytes, cookies, calls models, publishes externally, opens Xiaohongshu pages, mutates platform state, writes repository files, or writes the active vault";

export async function inspectContentChannelReadiness(args: ContentChannelReadinessArgs = {}): Promise<ContentChannelReadinessResult> {
  const publishTool = args.publishTool ?? "publish_content";
  const [xiaohongshuMcp, agentBrowser] = await Promise.all([
    inspectXiaohongshuMcpChannel(args.serverUrl, publishTool, args.mcpClient),
    inspectAgentBrowserChannel(args.commandRunner ?? runCommand, Boolean(args.browserLaunchCheck))
  ]);
  const recommendedRoute = recommendedContentChannelRoute(xiaohongshuMcp, agentBrowser);
  return {
    created_at: utcNow(),
    status: recommendedRoute === "blocked"
      ? "blocked"
      : xiaohongshuMcp.status === "ready" && agentBrowser.status === "ready"
      ? "ready"
      : "degraded",
    recommended_route: recommendedRoute,
    channels: {
      xiaohongshu_mcp: xiaohongshuMcp,
      agent_browser_cli: agentBrowser
    },
    next_commands: compact([
      ...xiaohongshuMcp.checks.map((check) => check.next_command),
      ...agentBrowser.checks.map((check) => check.next_command)
    ]),
    boundary: CONTENT_CHANNEL_READINESS_BOUNDARY
  };
}

async function inspectXiaohongshuMcpChannel(
  serverUrl: string | undefined,
  publishTool: string,
  client: ContentChannelReadinessArgs["mcpClient"]
): Promise<ContentChannelReadinessChannel> {
  if (!serverUrl) {
    return {
      id: "xiaohongshu-mcp",
      status: "unknown",
      summary: "xiaohongshu-mcp server URL was not supplied",
      checks: [{
        id: "xiaohongshu_mcp_server_url",
        status: "warning",
        summary: "supply --server-url or runtime content_daily_publish_server_url to probe xiaohongshu-mcp",
        next_command: "pnpm run runtime -- content channel-readiness --server-url http://localhost:18060/mcp"
      }]
    };
  }

  const probe = await (client ?? new XiaohongshuMcpClient({ serverUrl })).probe({ publishTool });
  const checks: ContentChannelCheck[] = [{
    id: "xiaohongshu_mcp_probe",
    status: probe.ok ? "pass" : "blocked",
    summary: probe.ok ? "xiaohongshu-mcp probe completed" : probe.error ?? "xiaohongshu-mcp probe failed",
    ...(probe.error ? { stderr_preview: truncate(probe.error, 500) } : {})
  }, {
    id: "xiaohongshu_mcp_publish_tool",
    status: probe.adapter_available ? "pass" : "blocked",
    summary: probe.adapter_available
      ? `${probe.expected_publish_tool} is available`
      : `${probe.expected_publish_tool} is not available`,
    ...(probe.adapter_available ? {} : { next_command: "start xiaohongshu-mcp with publish_content enabled" })
  }, {
    id: "xiaohongshu_mcp_login",
    status: probe.login_status === "logged_in" ? "pass" : "blocked",
    summary: probe.login_status === "logged_in"
      ? "xiaohongshu-mcp reports a logged-in account"
      : `xiaohongshu-mcp login status is ${probe.login_status}`,
    ...(probe.login_status === "logged_in" ? {} : { next_command: "run the xiaohongshu-mcp login flow, then rerun content channel-readiness" })
  }];
  const ready = checks.every((check) => check.status === "pass");
  return {
    id: "xiaohongshu-mcp",
    status: ready ? "ready" : "blocked",
    summary: ready
      ? "preferred Xiaohongshu MCP route is ready"
      : "xiaohongshu-mcp route is not ready for confirmed publish/feedback operations",
    checks: [
      ...checks,
      {
        id: "xiaohongshu_mcp_probe_summary",
        status: "pass",
        summary: JSON.stringify(summarizeXiaohongshuProbe(probe))
      }
    ]
  };
}

async function inspectAgentBrowserChannel(
  run: ContentChannelCommandRunner,
  browserLaunchCheck: boolean
): Promise<ContentChannelReadinessChannel> {
  const checks: ContentChannelCheck[] = [];
  const version = await run("agent-browser", ["--version"], { timeoutMs: 5000 });
  checks.push(commandCheck({
    id: "agent_browser_cli_installed",
    result: version,
    passSummary: `agent-browser is installed: ${firstLine(version.stdout)}`,
    failSummary: "agent-browser CLI is not available on PATH",
    nextCommand: "install agent-browser and rerun content channel-readiness"
  }));
  if (version.exit_code !== 0) {
    return {
      id: "agent-browser-cli",
      status: "blocked",
      summary: "agent-browser-cli route is unavailable because the CLI is not installed",
      checks
    };
  }

  const sessions = await run("agent-browser", ["session", "list"], { timeoutMs: 5000 });
  checks.push(commandCheck({
    id: "agent_browser_sessions",
    result: sessions,
    passSummary: "agent-browser session list completed",
    failSummary: "agent-browser session list failed"
  }));

  const autoConnect = await run("agent-browser", ["--auto-connect", "get", "url"], { timeoutMs: 5000 });
  checks.push(commandCheck({
    id: "agent_browser_chrome_remote_debugging",
    result: autoConnect,
    passSummary: "agent-browser can connect to an existing Chrome remote debugging session",
    failSummary: "agent-browser cannot auto-connect to Chrome remote debugging",
    nextCommand: "/Applications/Google\\ Chrome.app/Contents/MacOS/Google\\ Chrome --remote-debugging-port=9222"
  }));

  let launchReady = false;
  if (browserLaunchCheck) {
    const launch = await run("agent-browser", ["--session-name", "runtime-readiness", "open", "about:blank"], { timeoutMs: 15000 });
    launchReady = launch.exit_code === 0;
    checks.push(commandCheck({
      id: "agent_browser_playwright_launch",
      result: launch,
      passSummary: "agent-browser can launch its own browser on about:blank",
      failSummary: agentBrowserLaunchFailureSummary(launch),
      nextCommand: agentBrowserLaunchNextCommand(launch)
    }));
    if (launchReady) {
      await run("agent-browser", ["--session-name", "runtime-readiness", "close"], { timeoutMs: 5000 });
    }
  } else {
    checks.push({
      id: "agent_browser_playwright_launch",
      status: "warning",
      summary: "browser launch check was skipped; pass --browser-launch-check to verify local Playwright browser availability",
      next_command: "pnpm run runtime -- content channel-readiness --server-url http://localhost:18060/mcp --browser-launch-check --state-root <state-root>"
    });
  }

  const remoteDebugReady = autoConnect.exit_code === 0;
  const ready = remoteDebugReady || launchReady;
  return {
    id: "agent-browser-cli",
    status: ready ? "ready" : browserLaunchCheck ? "blocked" : "partial",
    summary: ready
      ? "agent-browser-cli route is ready for browser-backed creator metrics work"
      : browserLaunchCheck
      ? "agent-browser-cli route is blocked by local browser prerequisites"
      : "agent-browser-cli CLI is installed, but browser connectivity has not been proven",
    checks
  };
}

function recommendedContentChannelRoute(
  xiaohongshuMcp: ContentChannelReadinessChannel,
  agentBrowser: ContentChannelReadinessChannel
): ContentChannelRoute {
  if (xiaohongshuMcp.status === "ready") return "xiaohongshu-mcp";
  if (agentBrowser.status === "ready") return "agent-browser-cli";
  return "blocked";
}

function commandCheck(args: {
  id: string;
  result: ContentChannelCommandResult;
  passSummary: string;
  failSummary: string;
  nextCommand?: string;
}): ContentChannelCheck {
  return {
    id: args.id,
    status: args.result.exit_code === 0 ? "pass" : "blocked",
    summary: args.result.exit_code === 0 ? args.passSummary : args.failSummary,
    command: [args.result.command, ...args.result.args].join(" "),
    exit_code: args.result.exit_code,
    ...(args.result.stdout ? { stdout_preview: truncate(args.result.stdout, 500) } : {}),
    ...(args.result.stderr ? { stderr_preview: truncate(args.result.stderr, 500) } : {}),
    ...(args.result.exit_code === 0 || !args.nextCommand ? {} : { next_command: args.nextCommand })
  };
}

async function runCommand(command: string, args: string[], options: { timeoutMs?: number } = {}): Promise<ContentChannelCommandResult> {
  try {
    const result = await execFile(command, args, {
      timeout: options.timeoutMs ?? 10000,
      encoding: "utf8"
    });
    return {
      command,
      args,
      exit_code: 0,
      stdout: result.stdout,
      stderr: result.stderr
    };
  } catch (error) {
    const err = error as { stdout?: string; stderr?: string; code?: number | string; message?: string };
    return {
      command,
      args,
      exit_code: typeof err.code === "number" ? err.code : 1,
      stdout: err.stdout ?? "",
      stderr: err.stderr ?? err.message ?? String(error)
    };
  }
}

function agentBrowserLaunchFailureSummary(result: ContentChannelCommandResult): string {
  const text = `${result.stdout}\n${result.stderr}`;
  if (/Executable doesn't exist|playwright install/i.test(text)) return "agent-browser cannot launch because Playwright browser binaries are missing";
  return "agent-browser could not launch a local browser";
}

function agentBrowserLaunchNextCommand(result: ContentChannelCommandResult): string {
  const text = `${result.stdout}\n${result.stderr}`;
  if (/Executable doesn't exist|playwright install/i.test(text)) return "agent-browser install";
  return "agent-browser --session-name runtime-readiness open about:blank";
}

function firstLine(value: string): string {
  return value.trim().split(/\r?\n/)[0] ?? "";
}

function compact(values: Array<string | undefined>): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    if (!value || seen.has(value)) continue;
    seen.add(value);
    result.push(value);
  }
  return result;
}

function truncate(value: string, maxChars: number): string {
  const compacted = value.replace(/\s+/g, " ").trim();
  return compacted.length <= maxChars ? compacted : `${compacted.slice(0, maxChars - 3).trimEnd()}...`;
}

function utcNow(): string {
  return new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
}
