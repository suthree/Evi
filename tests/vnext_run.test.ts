import assert from "node:assert/strict";
import { execFile, spawnSync } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:http";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { promisify } from "node:util";
import {
  createRuntimeInspectAction,
  ExecutionLockMismatchError,
  RuntimeSchemaIncompatibleError,
  RuntimeSessionBusyError,
  RuntimeSessionNotFoundError,
  RuntimeStateProfileIncompatibleError,
  SqliteRuntimeStore,
  type ExecutionLock
} from "../packages/kernel/src/index.js";
import {
  executeVNextRun,
  VNEXT_RUN_MARKER,
  vnextRunErrorEnvelope,
  type ResolvedVNextModel,
  type VNextRunDependencies,
  type VNextRunEnvelope
} from "../apps/cli/src/vnext_run.js";
import { testExecutionLock } from "./vnext_test_support.js";

const execFileAsync = promisify(execFile);

test("stable vNext CLI binds multiple terminal Runs without duplicating or persisting raw credentials", async () => {
  const fixture = await mkdtemp(join(tmpdir(), "evi-vnext-run-session-"));
  const stateRoot = join(fixture, "state");
  const secret = "synthetic-vnext-stable-secret";
  let executions = 0;
  const dependencies = stableDependencies({ api_key: secret }, ({ store }) => ({
    create(input) {
      assert.equal(input.execution_lock.actions[0]?.name, "runtime_inspect");
      return {
        execute: async (request) => {
          assert.doesNotMatch(request, new RegExp(secret));
          if (executions === 0) assert.match(request, /\[redacted\]/);
          const session = store.getPiSession(input.session_id);
          assert.ok(session);
          const ordinal = ++executions;
          store.appendPiSessionEntry(input.session_id, {
            id: `stable-entry-${ordinal}`,
            parentId: session.leaf_id,
            type: "test_history",
            timestamp: new Date().toISOString(),
            ordinal
          });
          return { answer: `stable answer ${ordinal}` };
        }
      };
    }
  }));
  try {
    const first = await executeVNextRun({
      action: "submit",
      task: `Open one durable Session without storing ${secret}.`,
      state_root: stateRoot,
      repo_root: fixture
    }, dependencies);
    assert.equal(first.vnext.marker, VNEXT_RUN_MARKER);
    assert.equal(first.vnext.status, "completed");
    assert.ok(first.vnext.session_id);
    assert.ok(first.vnext.execution_lock_digest);

    const second = await executeVNextRun({
      action: "submit",
      task: "Create a new Run in the same Session.",
      session_id: first.vnext.session_id,
      state_root: stateRoot,
      repo_root: fixture
    }, dependencies);
    assert.equal(second.vnext.status, "completed");
    assert.equal(second.vnext.session_id, first.vnext.session_id);
    assert.notEqual(second.vnext.run_id, first.vnext.run_id);

    const inspected = await executeVNextRun({
      action: "inspect",
      session_id: first.vnext.session_id,
      state_root: stateRoot
    });
    assert.equal(inspected.vnext.status, "completed");
    const session = inspected.vnext.result;
    assert.ok(session && "run_count" in session);
    assert.equal(session.run_count, 2);
    assert.equal(session.active_run_id, null);
    assert.equal(session.session_entry_count, 2);
    assert.deepEqual(session.runs.map((run) => run.status), ["completed", "completed"]);

    const inspectedRun = await executeVNextRun({
      action: "inspect",
      run_id: first.vnext.run_id,
      state_root: stateRoot
    });
    const run = inspectedRun.vnext.result;
    assert.ok(run && "execution_lock" in run);
    assert.equal(run.execution_lock.model.config_id, "stable-test-model");
    assert.equal(run.execution_lock.model.credential_ref, "test-credential");
    assert.equal(JSON.stringify(run.execution_lock).includes(secret), false);

    const database = new DatabaseSync(join(stateRoot, "runtime.sqlite"));
    try {
      const runColumns = database.prepare("PRAGMA table_info(runs)").all() as Array<{ name: string }>;
      assert.equal(runColumns.some((column) => column.name === "request"), false);
      const requests = database.prepare("SELECT request FROM turns ORDER BY created_at").all() as Array<{ request: string }>;
      assert.equal(requests[0]?.request.includes(secret), false);
      assert.match(requests[0]?.request ?? "", /\[redacted\]/);
    } finally {
      database.close();
    }
    for (const name of await readdir(stateRoot)) {
      const contents = await readFile(join(stateRoot, name));
      assert.equal(contents.includes(Buffer.from(secret)), false, `${name} persisted the raw credential`);
    }
  } finally {
    await rm(fixture, { recursive: true, force: true });
  }
});

test("stable vNext CLI preserves one Session across independent CLI processes", async () => {
  const fixture = await mkdtemp(join(tmpdir(), "evi-vnext-run-processes-"));
  const stateRoot = join(fixture, "state");
  const configDir = join(fixture, "config");
  const secret = "synthetic-cross-process-key";
  let responseOrdinal = 0;
  const server = createServer((_request, response) => {
    responseOrdinal += 1;
    const message = {
      id: `msg_process_${responseOrdinal}`,
      type: "message",
      status: "completed",
      role: "assistant",
      content: [{ type: "output_text", text: `process answer ${responseOrdinal}`, annotations: [] }]
    };
    response.writeHead(200, { "content-type": "text/event-stream" });
    for (const event of [
      { type: "response.output_item.done", output_index: 0, item: message },
      {
        type: "response.completed",
        response: {
          id: `resp_process_${responseOrdinal}`,
          status: "completed",
          output: [message],
          usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 }
        }
      }
    ]) response.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
    response.end("data: [DONE]\n\n");
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address === "object");
  try {
    await writeVNextTestConfig({
      configDir,
      stateRoot,
      baseUrl: `http://127.0.0.1:${address.port}/v1`,
      secret,
      modelId: "cross-process-model",
      model: "cross-process-model"
    });
    const first = await runVNextCli([
      "submit", "--task", "Open a durable cross-process Session.",
      "--vnext-state-root", stateRoot, "--config-dir", configDir, "--repo-root", fixture
    ]);
    assert.equal(first.vnext.status, "completed");
    assert.ok(first.vnext.session_id);

    const second = await runVNextCli([
      "submit", "--task", "Continue from a second CLI process.",
      "--session-id", first.vnext.session_id,
      "--vnext-state-root", stateRoot, "--config-dir", configDir, "--repo-root", fixture
    ]);
    assert.equal(second.vnext.status, "completed");
    assert.equal(second.vnext.session_id, first.vnext.session_id);
    assert.notEqual(second.vnext.run_id, first.vnext.run_id);

    const inspected = await runVNextCli([
      "inspect", "--session-id", first.vnext.session_id,
      "--vnext-state-root", stateRoot
    ]);
    const session = inspected.vnext.result;
    assert.ok(session && "run_count" in session);
    assert.equal(session.run_count, 2);
    assert.equal(responseOrdinal, 2);
  } finally {
    await new Promise<void>((resolveClose, reject) => server.close((error) => error ? reject(error) : resolveClose()));
    await rm(fixture, { recursive: true, force: true });
  }
});

test("stable vNext CLI fails closed when a second Run attaches to a busy Session", async () => {
  const fixture = await mkdtemp(join(tmpdir(), "evi-vnext-run-busy-"));
  const stateRoot = join(fixture, "state");
  let announceSession!: (sessionId: string) => void;
  const sessionReady = new Promise<string>((resolveReady) => { announceSession = resolveReady; });
  let releaseLoop!: () => void;
  const released = new Promise<void>((resolveRelease) => { releaseLoop = resolveRelease; });
  const dependencies = stableDependencies({}, () => ({
    create(input) {
      announceSession(input.session_id);
      return { execute: async () => { await released; return { answer: "released" }; } };
    }
  }));
  try {
    const first = executeVNextRun({
      action: "submit",
      task: "Hold this Run open.",
      state_root: stateRoot,
      repo_root: fixture
    }, dependencies);
    const sessionId = await sessionReady;
    await assert.rejects(executeVNextRun({
      action: "submit",
      task: "Do not attach concurrently.",
      session_id: sessionId,
      state_root: stateRoot,
      repo_root: fixture
    }, dependencies), RuntimeSessionBusyError);
    releaseLoop();
    assert.equal((await first).vnext.status, "completed");
  } finally {
    releaseLoop();
    await rm(fixture, { recursive: true, force: true });
  }
});

test("vNext SQLite rejects non-canonical Pi timestamps and keeps Session time monotonic", async () => {
  const fixture = await mkdtemp(join(tmpdir(), "evi-vnext-run-session-time-"));
  const store = new SqliteRuntimeStore(join(fixture, "runtime.sqlite"), { state_profile: "stable_cli" });
  try {
    const gateway = createRuntimeInspectAction(store);
    const started = store.beginRun({
      request: "Keep canonical Session time.",
      execution_lock: testExecutionLock({ cwd: fixture, contracts: [gateway.contract] })
    }, 30_000);
    const before = store.inspectSession(started.run.session_id)?.updated_at;
    assert.ok(before);
    assert.throws(() => store.appendPiSessionEntry(started.run.session_id, {
      id: "invalid-time-entry",
      parentId: null,
      type: "test_history",
      timestamp: "yesterday"
    }), /canonical ISO 8601 UTC/);
    store.appendPiSessionEntry(started.run.session_id, {
      id: "old-but-canonical-entry",
      parentId: null,
      type: "test_history",
      timestamp: "2000-01-01T00:00:00.000Z"
    });
    const after = store.inspectSession(started.run.session_id)?.updated_at;
    assert.ok(after);
    assert.equal(after >= before, true);
    assert.notEqual(after, "2000-01-01T00:00:00.000Z");
  } finally {
    store.close();
    await rm(fixture, { recursive: true, force: true });
  }
});

test("stable vNext continuation recovers in a new CLI process under the persisted Execution Lock", async () => {
  const fixture = await mkdtemp(join(tmpdir(), "evi-vnext-run-lock-"));
  const stateRoot = join(fixture, "state");
  const configDir = join(fixture, "config");
  const sqlite = join(stateRoot, "runtime.sqlite");
  let runId = "";
  const server = createServer((_request, response) => {
    const message = {
      id: "msg_recovered_process",
      type: "message",
      status: "completed",
      role: "assistant",
      content: [{ type: "output_text", text: "recovered under locked identity", annotations: [] }]
    };
    response.writeHead(200, { "content-type": "text/event-stream" });
    response.write(`event: response.output_item.done\ndata: ${JSON.stringify({
      type: "response.output_item.done", output_index: 0, item: message
    })}\n\n`);
    response.write(`event: response.completed\ndata: ${JSON.stringify({
      type: "response.completed",
      response: {
        id: "resp_recovered_process",
        status: "completed",
        output: [message],
        usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 }
      }
    })}\n\n`);
    response.end("data: [DONE]\n\n");
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const baseUrl = `http://127.0.0.1:${address.port}/v1`;
  await writeVNextTestConfig({
    configDir,
    stateRoot,
    baseUrl,
    secret: "synthetic-recovery-key",
    modelId: "test-locked-model",
    model: "changed-model"
  });
  const store = new SqliteRuntimeStore(sqlite, { state_profile: "stable_cli" });
  try {
    const inspect = createRuntimeInspectAction(store);
    const started = store.beginRun({
      request: "Recover this exact dispatch.",
      execution_lock: testExecutionLock({
        cwd: fixture,
        contracts: [inspect.contract],
        model: lockedTestModel("locked-model", baseUrl),
        configuration_source_refs: stableConfigurationRefs(fixture)
      })
    }, 100);
    runId = started.run.id;
    store.startModelDispatch(started.execution, {
      provider: "test-provider",
      model: "locked-model"
    });
  } finally {
    store.close();
  }
  await delay(150);

  try {
    const continued = await runVNextCli([
      "continue", "--run-id", runId,
      "--vnext-state-root", stateRoot, "--config-dir", configDir, "--repo-root", fixture
    ]);
    assert.equal(continued.vnext.status, "completed");
    const reopened = new SqliteRuntimeStore(sqlite, { state_profile: "stable_cli" });
    try {
      const lock = reopened.getExecutionLock(runId);
      assert.equal(lock.model.model, "locked-model");
      assert.equal(continued.vnext.execution_lock_digest, lock.digest);
      assert.equal(reopened.inspectRun(runId)?.status, "completed");
    } finally {
      reopened.close();
    }
  } finally {
    await new Promise<void>((resolveClose, reject) => server.close((error) => error ? reject(error) : resolveClose()));
    await rm(fixture, { recursive: true, force: true });
  }
});

test("stable vNext CLI refuses a diagnostic canary database instead of promoting it", async () => {
  const fixture = await mkdtemp(join(tmpdir(), "evi-vnext-run-profile-"));
  const stateRoot = join(fixture, "state");
  const store = new SqliteRuntimeStore(join(stateRoot, "runtime.sqlite"), {
    state_profile: "diagnostic_canary"
  });
  store.close();
  try {
    await assert.rejects(executeVNextRun({
      action: "inspect",
      run_id: "run_missing",
      state_root: stateRoot
    }), RuntimeStateProfileIncompatibleError);
    const incompatible = vnextRunErrorEnvelope(
      new RuntimeStateProfileIncompatibleError("stable_cli", "diagnostic_canary"),
      "inspect"
    );
    assert.equal(incompatible.vnext.diagnostic?.code, "schema_incompatible");
  } finally {
    await rm(fixture, { recursive: true, force: true });
  }
});

test("stable vNext continuation rejects credential binding drift before reopening a terminal Run", async () => {
  const fixture = await mkdtemp(join(tmpdir(), "evi-vnext-run-credential-drift-"));
  const stateRoot = join(fixture, "state");
  let runId = "";
  const store = new SqliteRuntimeStore(join(stateRoot, "runtime.sqlite"), {
    state_profile: "stable_cli"
  });
  try {
    const inspect = createRuntimeInspectAction(store);
    const started = store.beginRun({
      request: "Keep the credential reference immutable.",
      execution_lock: testExecutionLock({
        cwd: fixture,
        contracts: [inspect.contract],
        model: lockedTestModel("locked-model"),
        configuration_source_refs: stableConfigurationRefs(fixture)
      })
    }, 30_000);
    store.completeRun(started.execution, "terminal");
    runId = started.run.id;
  } finally {
    store.close();
  }
  try {
    await assert.rejects(executeVNextRun({
      action: "continue",
      run_id: runId,
      state_root: stateRoot,
      repo_root: join(fixture, "changed-cwd")
    }, stableDependencies({
      config_id: "test-locked-model",
      credential_ref: "test-credential"
    })), ExecutionLockMismatchError);

    await assert.rejects(executeVNextRun({
      action: "continue",
      run_id: runId,
      state_root: stateRoot,
      repo_root: fixture
    }, stableDependencies({
      config_id: "test-locked-model",
      credential_ref: "changed-credential"
    })), ExecutionLockMismatchError);
  } finally {
    await rm(fixture, { recursive: true, force: true });
  }
});

test("stable vNext CLI emits its own structured not-found and invalid-input envelopes", async () => {
  const fixture = await mkdtemp(join(tmpdir(), "evi-vnext-run-cli-"));
  let providerDispatches = 0;
  const noDispatchDependencies = stableDependencies({}, () => ({
    create: () => {
      providerDispatches += 1;
      return { execute: async () => ({ answer: "must not dispatch" }) };
    }
  }));
  try {
    await assert.rejects(executeVNextRun({
      action: "submit",
      task: "Do not create a missing Session.",
      session_id: "session_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      state_root: join(fixture, "missing-session-state"),
      repo_root: fixture
    }, noDispatchDependencies), RuntimeSessionNotFoundError);

    await assert.rejects(executeVNextRun({
      action: "submit",
      task: "Reject the invalid Session identity.",
      session_id: "session_invalid",
      state_root: join(fixture, "invalid-session-state"),
      repo_root: fixture
    }, noDispatchDependencies), /Runtime Session id is invalid/u);
    assert.equal(providerDispatches, 0);

    const inspected = spawnSync(process.execPath, [
      "--import", "tsx", "apps/cli/src/main.ts", "vnext", "run", "inspect",
      "--run-id", "run_missing", "--vnext-state-root", join(fixture, "state")
    ], { cwd: process.cwd(), encoding: "utf8" });
    assert.equal(inspected.status, 1, inspected.stderr);
    const response = JSON.parse(inspected.stdout) as {
      vnext: { marker: string; status: string; diagnostic: { code: string } };
    };
    assert.equal(response.vnext.marker, VNEXT_RUN_MARKER);
    assert.equal(response.vnext.status, "not_found");
    assert.equal(response.vnext.diagnostic.code, "run_not_found");

    const missingSession = vnextRunErrorEnvelope(
      new RuntimeSessionNotFoundError("session_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"),
      "submit"
    );
    assert.equal(missingSession.vnext.diagnostic?.code, "session_not_found");

    const invalid = vnextRunErrorEnvelope(
      new Error("vnext run inspect requires exactly one identity"),
      "inspect"
    );
    assert.equal(invalid.vnext.diagnostic?.code, "invalid_input");

    const incompatible = vnextRunErrorEnvelope(
      new RuntimeSchemaIncompatibleError("4"),
      "inspect"
    );
    assert.equal(incompatible.vnext.diagnostic?.code, "schema_incompatible");
  } finally {
    await rm(fixture, { recursive: true, force: true });
  }
});

function stableDependencies(
  overrides: Partial<ResolvedVNextModel> = {},
  factory?: VNextRunDependencies["create_loop_factory"]
): VNextRunDependencies {
  const model: ResolvedVNextModel = {
    config_id: "stable-test-model",
    provider: "test-provider",
    api: "responses",
    base_url: "https://provider.example.test/v1",
    model: "stable-model",
    credential_ref: "test-credential",
    api_key: "synthetic-stable-key",
    reasoning_effort: null,
    context_window_tokens: 128_000,
    max_output_tokens: 2_400,
    timeout_ms: 120_000,
    ...overrides
  };
  return {
    load_model: async () => model,
    create_loop_factory: factory ?? (() => ({
      create: () => ({ execute: async () => ({ answer: "stable test answer" }) })
    }))
  };
}

function lockedTestModel(modelId: string, baseUrl = "https://provider.example.test/v1") {
  return {
    id: modelId,
    api: "openai-responses",
    provider: "test-provider",
    baseUrl,
    contextWindow: 128_000,
    maxTokens: 2_400
  };
}

function stableConfigurationRefs(repoRoot: string): string[] {
  return [
    "config:active_model",
    `config_dir:${join(repoRoot, "config")}`,
    "models:test-locked-model",
    "auth:test-credential"
  ];
}

async function runVNextCli(args: string[]): Promise<VNextRunEnvelope> {
  const { stdout } = await execFileAsync(process.execPath, [
    "--import", "tsx", "apps/cli/src/main.ts", "vnext", "run", ...args
  ], {
    cwd: process.cwd(),
    encoding: "utf8",
    env: { ...process.env, NODE_NO_WARNINGS: "1" },
    maxBuffer: 4 * 1024 * 1024
  });
  return JSON.parse(stdout) as VNextRunEnvelope;
}

async function writeVNextTestConfig(input: {
  configDir: string;
  stateRoot: string;
  baseUrl: string;
  secret: string;
  modelId: string;
  model: string;
}): Promise<void> {
  await mkdir(input.configDir, { recursive: true });
  await writeFile(join(input.configDir, "config.jsonl"), [
    JSON.stringify({ type: "home", root: join(input.stateRoot, "home") }),
    JSON.stringify({ type: "state", root: input.stateRoot }),
    JSON.stringify({ type: "active_model", model_id: input.modelId })
  ].join("\n") + "\n", "utf8");
  await writeFile(join(input.configDir, "models.jsonl"), `${JSON.stringify({
    type: "model",
    id: input.modelId,
    provider: "openai-compatible",
    api: "responses",
    base_url: input.baseUrl,
    model: input.model,
    auth_id: "test-credential",
    max_output_tokens: 2_400,
    timeout_ms: 10_000,
    store: false
  })}\n`, "utf8");
  await writeFile(join(input.configDir, "auth.jsonl"), `${JSON.stringify({
    type: "api_key",
    id: "test-credential",
    key: input.secret
  })}\n`, "utf8");
}
