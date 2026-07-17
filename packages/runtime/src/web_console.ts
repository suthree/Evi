import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { URL } from "node:url";
import {
  bindRuntimeSessionSource,
  listRuntimeInbox,
  listRuntimeSessionBindings,
  listRuntimeSessions,
  listRuntimeTaskRuns
} from "../../core/src/runtime_sessions.js";
import {
  isRuntimeChannelKind,
  runtimeChannelSourceFromRouteKey
} from "../../core/src/runtime_channel_messages.js";
import { AgentStore } from "../../core/src/store.js";
import type { GoalIngressPort } from "./goal_ingress.js";
import type { GoalView } from "./goal_runtime.js";

export interface RuntimeWebConsoleOptions {
  store: AgentStore;
  host?: string;
  port?: number;
  goalIngress?: GoalIngressPort;
}

export interface RuntimeWebConsoleHandle {
  server: Server;
  url: string;
  close: () => Promise<void>;
}

const DEFAULT_HOST = "127.0.0.1";
const DEFAULT_PORT = 8765;

export async function startRuntimeWebConsole(options: RuntimeWebConsoleOptions): Promise<RuntimeWebConsoleHandle> {
  await options.store.ensureLayout();
  const host = options.host ?? DEFAULT_HOST;
  const port = options.port ?? DEFAULT_PORT;
  const server = createServer((request, response) => {
    void handleRequest(options, request, response);
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => {
      server.off("error", reject);
      resolve();
    });
  });
  const address = server.address();
  const actualPort = typeof address === "object" && address ? address.port : port;
  return {
    server,
    url: `http://${host}:${actualPort}`,
    close: () => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
  };
}

async function handleRequest(
  options: RuntimeWebConsoleOptions,
  request: IncomingMessage,
  response: ServerResponse
): Promise<void> {
  try {
    const url = new URL(request.url ?? "/", "http://local-runtime");
    if (request.method === "GET" && url.pathname === "/") {
      writeText(response, 200, renderConsoleHtml());
      return;
    }
    if (request.method === "GET" && url.pathname === "/api/sessions") {
      writeJson(response, 200, {
        sessions: await listRuntimeSessions(options.store),
        bindings: await listRuntimeSessionBindings(options.store),
        boundary: "local runtime session control state"
      });
      return;
    }
    const inboxMatch = url.pathname.match(/^\/api\/sessions\/([^/]+)\/inbox$/);
    if (request.method === "GET" && inboxMatch) {
      writeJson(response, 200, {
        session_id: decodeURIComponent(inboxMatch[1] ?? ""),
        entries: await listRuntimeInbox(options.store, decodeURIComponent(inboxMatch[1] ?? ""))
      });
      return;
    }
    const profileMatch = url.pathname.match(/^\/api\/sessions\/([^/]+)\/profile$/);
    if (request.method === "POST" && profileMatch) {
      const sessionId = decodeURIComponent(profileMatch[1] ?? "");
      const body = await readJsonBody(request);
      const profile = stringField(body, "profile")?.trim();
      if (!profile) {
        writeJson(response, 400, { error: "profile is required" });
        return;
      }
      const sessions = await listRuntimeSessions(options.store);
      const session = sessions.find((item) => item.id === sessionId);
      if (!session) {
        writeJson(response, 404, { error: "session not found" });
        return;
      }
      if (!session.source_route_key || !isRuntimeChannelKind(session.source_kind)) {
        writeJson(response, 400, { error: "only channel-backed sessions can be profile-bound by route" });
        return;
      }
      const source = runtimeChannelSourceFromRouteKey(session.source_route_key, profile);
      if (!source || source.kind !== session.source_kind) {
        writeJson(response, 400, { error: "invalid channel route key" });
        return;
      }
      const binding = await bindRuntimeSessionSource(options.store, {
        source,
        runtimeSessionId: session.id,
        profile,
        createdByActorId: null
      });
      writeJson(response, 200, { binding, sessions: await listRuntimeSessions(options.store) });
      return;
    }
    if (request.method === "GET" && url.pathname === "/api/runs") {
      writeJson(response, 200, {
        runs: await listRuntimeTaskRuns(options.store),
        boundary: "local runtime task run index"
      });
      return;
    }
    if (request.method === "POST" && url.pathname === "/api/runs") {
      if (!options.goalIngress) {
        writeJson(response, 503, { error: "Goal ingress is not configured for this console" });
        return;
      }
      const body = await readJsonBody(request);
      const task = stringField(body, "task")?.trim();
      if (!task) {
        writeJson(response, 400, { error: "task is required" });
        return;
      }
      if (body.execution_contract !== undefined) {
        writeJson(response, 400, {
          error: "execution_contract belongs to the legacy runner and cannot be mapped into a Goal; use GoalRuntime effect confirmation"
        });
        return;
      }
      if (body.runtime_session_id !== undefined) {
        writeJson(response, 400, {
          error: "runtime_session_id belongs to legacy task-run orchestration; submit a standalone Goal objective"
        });
        return;
      }
      const goal = await options.goalIngress.submit(task);
      writeJson(response, 200, {
        goal,
        continue_hint: goalContinuationHint(goal)
      });
      return;
    }
    writeJson(response, 404, { error: "not found" });
  } catch (error) {
    writeJson(response, 500, { error: error instanceof Error ? error.message : String(error) });
  }
}

export function goalContinuationHint(goal: GoalView): string {
  if (goal.status === "completed") {
    return `Goal ${goal.goal_id} is completed; no continuation command is required.`;
  }
  if (goal.status === "abandoned") {
    return `Goal ${goal.goal_id} is abandoned; no continuation command is allowed.`;
  }
  if (goal.status === "paused" && goal.pending_effect?.state === "awaiting_confirmation") {
    return `Run goal resume --goal ${goal.goal_id} --confirm-effect ${goal.pending_effect.effect_id} to confirm this exact effect.`;
  }
  if (goal.status === "paused" && goal.pending_effect?.state === "outcome_unknown") {
    return `No safe continuation command: effect ${goal.pending_effect.effect_id} has an unknown outcome and must be reconciled from evidence before any new action.`;
  }
  if (goal.status === "paused") {
    return `Run goal resume --goal ${goal.goal_id} to resume this manually paused Goal.`;
  }
  return `Run goal continue --goal ${goal.goal_id} to continue this Goal.`;
}

async function readJsonBody(request: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  const text = Buffer.concat(chunks).toString("utf8").trim();
  if (!text) return {};
  const parsed = JSON.parse(text) as unknown;
  return isRecord(parsed) ? parsed : {};
}

function writeJson(response: ServerResponse, status: number, value: unknown): void {
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store"
  });
  response.end(`${JSON.stringify(value, null, 2)}\n`);
}

function writeText(response: ServerResponse, status: number, text: string): void {
  response.writeHead(status, {
    "content-type": "text/html; charset=utf-8",
    "cache-control": "no-store"
  });
  response.end(text);
}

function stringField(value: Record<string, unknown>, field: string): string | null {
  const raw = value[field];
  return typeof raw === "string" ? raw : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function renderConsoleHtml(): string {
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Local Runtime</title>
  <style>
    :root { color-scheme: light; --ink: #202124; --muted: #5f6368; --line: #d7dce2; --bg: #f7f8fa; --panel: #ffffff; --accent: #1a73e8; --ok: #137333; --warn: #b06000; }
    * { box-sizing: border-box; }
    body { margin: 0; font: 14px/1.45 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color: var(--ink); background: var(--bg); }
    header { height: 56px; display: flex; align-items: center; justify-content: space-between; padding: 0 20px; background: #ffffff; border-bottom: 1px solid var(--line); }
    h1 { margin: 0; font-size: 18px; font-weight: 650; letter-spacing: 0; }
    main { display: grid; grid-template-columns: minmax(280px, 360px) minmax(380px, 1fr); gap: 0; min-height: calc(100vh - 56px); }
    aside { border-right: 1px solid var(--line); background: #ffffff; min-width: 0; }
    section { min-width: 0; }
    .bar { height: 48px; display: flex; align-items: center; gap: 8px; padding: 0 12px; border-bottom: 1px solid var(--line); background: #ffffff; }
    .bar h2 { margin: 0; font-size: 14px; font-weight: 650; flex: 1; }
    button { border: 1px solid var(--line); background: #fff; color: var(--ink); border-radius: 6px; height: 32px; padding: 0 10px; cursor: pointer; }
    button.primary { background: var(--accent); border-color: var(--accent); color: #fff; }
    button:disabled { opacity: .55; cursor: default; }
    input, textarea, select { width: 100%; border: 1px solid var(--line); border-radius: 6px; padding: 8px; font: inherit; background: #fff; }
    textarea { min-height: 104px; resize: vertical; }
    table { width: 100%; border-collapse: collapse; table-layout: fixed; }
    th, td { padding: 8px 10px; border-bottom: 1px solid var(--line); text-align: left; vertical-align: top; overflow-wrap: anywhere; }
    th { color: var(--muted); font-size: 12px; font-weight: 600; background: #fafbfc; }
    tr.selected { background: #e8f0fe; }
    .status { display: inline-block; min-width: 64px; border-radius: 999px; padding: 2px 8px; font-size: 12px; text-align: center; background: #eef2f6; }
    .status.active, .status.done { color: var(--ok); background: #e6f4ea; }
    .status.pending, .status.queued, .status.running { color: var(--warn); background: #fef7e0; }
    .status.failed, .status.blocked { color: #a50e0e; background: #fce8e6; }
    .content { display: grid; grid-template-rows: auto minmax(180px, 1fr) minmax(220px, 42vh); min-height: calc(100vh - 56px); }
    .split { display: grid; grid-template-columns: 1fr 320px; gap: 0; min-height: 0; }
    .pane { background: var(--panel); border-bottom: 1px solid var(--line); min-width: 0; overflow: auto; }
    .form { display: grid; gap: 10px; padding: 12px; border-left: 1px solid var(--line); background: #fbfcfd; }
    .form label { display: grid; gap: 4px; color: var(--muted); font-size: 12px; }
    .msg { padding: 8px 10px; border-bottom: 1px solid var(--line); }
    .msg pre { margin: 4px 0 0; white-space: pre-wrap; overflow-wrap: anywhere; font: inherit; }
    .empty { padding: 18px; color: var(--muted); }
    @media (max-width: 840px) { main, .split { grid-template-columns: 1fr; } aside { border-right: 0; border-bottom: 1px solid var(--line); } .content { grid-template-rows: auto auto auto; } }
  </style>
</head>
<body>
  <header><h1>Local Runtime</h1><button id="refresh">Refresh</button></header>
  <main>
    <aside>
      <div class="bar"><h2>Sessions</h2></div>
      <div id="sessions"></div>
    </aside>
    <section class="content">
      <div class="split">
        <div class="pane">
          <div class="bar"><h2>Inbox</h2></div>
          <div id="inbox"></div>
        </div>
        <form id="bindForm" class="form">
          <label>Profile<input id="profile" name="profile" placeholder="ops"></label>
          <button class="primary" type="submit">Bind</button>
        </form>
      </div>
      <div class="split">
        <div class="pane">
          <div class="bar"><h2>Legacy runs</h2></div>
          <div id="runs"></div>
        </div>
        <form id="runForm" class="form">
          <label>Goal task<textarea id="task" name="task"></textarea></label>
          <button class="primary" type="submit">Start Goal</button>
          <div id="goalResult" class="empty">New web tasks create one Goal and one Continue tranche.</div>
        </form>
      </div>
    </section>
  </main>
  <script>
    const state = { sessions: [], bindings: [], runs: [], selected: null };
    const $ = (id) => document.getElementById(id);
    $("refresh").onclick = () => refresh();
    $("bindForm").onsubmit = async (event) => {
      event.preventDefault();
      if (!state.selected) return;
      const profile = $("profile").value.trim();
      if (!profile) return;
      await fetch("/api/sessions/" + encodeURIComponent(state.selected) + "/profile", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ profile })
      });
      $("profile").value = "";
      await refresh();
    };
    $("runForm").onsubmit = async (event) => {
      event.preventDefault();
      const task = $("task").value.trim();
      if (!task) return;
      $("runForm").querySelector("button").disabled = true;
      try {
        const response = await fetch("/api/runs", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ task })
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "Goal submission failed");
        $("goalResult").textContent = "Goal " + result.goal.goal_id + ": " + result.continue_hint;
        $("task").value = "";
        await refresh();
      } catch (error) {
        $("goalResult").textContent = error instanceof Error ? error.message : String(error);
      } finally {
        $("runForm").querySelector("button").disabled = false;
      }
    };
    async function refresh() {
      const [sessions, runs] = await Promise.all([
        fetch("/api/sessions").then((r) => r.json()),
        fetch("/api/runs").then((r) => r.json())
      ]);
      state.sessions = sessions.sessions || [];
      state.bindings = sessions.bindings || [];
      state.runs = runs.runs || [];
      if (!state.selected && state.sessions[0]) state.selected = state.sessions[0].id;
      renderSessions();
      renderRuns();
      await renderInbox();
    }
    function renderSessions() {
      if (!state.sessions.length) {
        $("sessions").innerHTML = '<div class="empty">No sessions</div>';
        return;
      }
      $("sessions").innerHTML = '<table><thead><tr><th>Title</th><th>Status</th><th>Profile</th></tr></thead><tbody>' +
        state.sessions.map((s) => '<tr data-id="' + escapeHtml(s.id) + '" class="' + (s.id === state.selected ? "selected" : "") + '"><td>' + escapeHtml(s.title) + '<br><small>' + escapeHtml(s.id) + '</small></td><td><span class="status ' + escapeHtml(s.status) + '">' + escapeHtml(s.status) + '</span></td><td>' + escapeHtml(s.profile) + '</td></tr>').join("") +
        '</tbody></table>';
      document.querySelectorAll("#sessions tr[data-id]").forEach((row) => {
        row.onclick = () => { state.selected = row.getAttribute("data-id"); renderSessions(); renderInbox(); };
      });
    }
    async function renderInbox() {
      if (!state.selected) {
        $("inbox").innerHTML = '<div class="empty">No session selected</div>';
        return;
      }
      const data = await fetch("/api/sessions/" + encodeURIComponent(state.selected) + "/inbox").then((r) => r.json());
      const entries = data.entries || [];
      $("inbox").innerHTML = entries.length ? entries.map((entry) =>
        '<div class="msg"><strong>' + escapeHtml(entry.trigger_kind) + '</strong> <small>' + escapeHtml(entry.created_at) + '</small><pre>' + escapeHtml(entry.text) + '</pre></div>'
      ).join("") : '<div class="empty">No inbox entries</div>';
    }
    function renderRuns() {
      if (!state.runs.length) {
        $("runs").innerHTML = '<div class="empty">No runs</div>';
        return;
      }
      $("runs").innerHTML = '<table><thead><tr><th>Task</th><th>Status</th><th>Session</th></tr></thead><tbody>' +
        state.runs.map((run) => '<tr><td>' + escapeHtml(run.task) + '<br><small>' + escapeHtml(run.id) + '</small></td><td><span class="status ' + escapeHtml(run.status) + '">' + escapeHtml(run.status) + '</span></td><td>' + escapeHtml(run.runtime_session_id || run.source_kind) + '</td></tr>').join("") +
        '</tbody></table>';
    }
    function escapeHtml(value) {
      return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
    }
    refresh();
  </script>
</body>
</html>`;
}
