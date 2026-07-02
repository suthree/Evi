import assert from "node:assert/strict";
import test from "node:test";
import {
  inspectContentChannelReadiness,
  type ContentChannelCommandResult,
  type ContentChannelCommandRunner
} from "../packages/runtime/src/content_channel_readiness.js";

test("content channel readiness prefers ready xiaohongshu-mcp when agent-browser is blocked", async () => {
  const runner = fakeRunner({
    "agent-browser --version": { exit_code: 0, stdout: "agent-browser 0.15.1\n" },
    "agent-browser session list": { exit_code: 0, stdout: "[]\n" },
    "agent-browser --auto-connect get url": {
      exit_code: 1,
      stderr: "No running Chrome instance with remote debugging found."
    },
    "agent-browser --session-name runtime-readiness open about:blank": {
      exit_code: 1,
      stderr: "Executable doesn't exist at /tmp/chromium_headless_shell. Please run: npx playwright install"
    }
  });

  const result = await inspectContentChannelReadiness({
    serverUrl: "http://localhost:18060/mcp",
    browserLaunchCheck: true,
    commandRunner: runner,
    mcpClient: readyMcpClient()
  });

  assert.equal(result.status, "degraded");
  assert.equal(result.recommended_route, "xiaohongshu-mcp");
  assert.equal(result.channels.xiaohongshu_mcp.status, "ready");
  assert.equal(result.channels.agent_browser_cli.status, "blocked");
  assert.equal(result.next_commands.includes("agent-browser install"), true);
  assert.equal(result.next_commands.some((command) => command.includes("--remote-debugging-port=9222")), true);
  assert.equal(result.boundary.includes("never reads draft bodies"), true);
  assert.equal(result.boundary.includes("opens Xiaohongshu pages"), true);
});

test("content channel readiness can recommend agent-browser when xiaohongshu-mcp is not configured", async () => {
  const runner = fakeRunner({
    "agent-browser --version": { exit_code: 0, stdout: "agent-browser 0.15.1\n" },
    "agent-browser session list": { exit_code: 0, stdout: "[]\n" },
    "agent-browser --auto-connect get url": { exit_code: 0, stdout: "https://creator.xiaohongshu.com/new/note-manager\n" }
  });

  const result = await inspectContentChannelReadiness({
    commandRunner: runner
  });

  assert.equal(result.status, "degraded");
  assert.equal(result.recommended_route, "agent-browser-cli");
  assert.equal(result.channels.xiaohongshu_mcp.status, "unknown");
  assert.equal(result.channels.agent_browser_cli.status, "ready");
  assert.equal(result.channels.agent_browser_cli.checks.some((check) => check.id === "agent_browser_playwright_launch" && check.status === "warning"), true);
});

function readyMcpClient() {
  return {
    async probe() {
      return {
        ok: true,
        adapter: "xiaohongshu-mcp" as const,
        server_url: "http://localhost:18060/mcp",
        expected_publish_tool: "publish_content",
        adapter_available: true,
        login_status: "logged_in" as const,
        tools: [{ name: "publish_content" }, { name: "check_login_status" }],
        login_tool: "check_login_status",
        raw_summary: { login_probe_text_preview: "logged in" }
      };
    }
  };
}

function fakeRunner(
  results: Record<string, Partial<Omit<ContentChannelCommandResult, "command" | "args">>>
): ContentChannelCommandRunner {
  return async (command, args) => {
    const key = [command, ...args].join(" ");
    const result = results[key];
    assert.ok(result, `unexpected command: ${key}`);
    return {
      command,
      args,
      exit_code: result.exit_code ?? 0,
      stdout: result.stdout ?? "",
      stderr: result.stderr ?? ""
    };
  };
}
