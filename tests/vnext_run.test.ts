import assert from "node:assert/strict";
import { execFile, spawnSync } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:http";
import { access, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { promisify } from "node:util";
import {
  createRuntimeInspectAction,
  ExecutionLockMismatchError,
  materializeExecutionLock,
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
import { loadLegacyConfigPiAdapter } from "../apps/cli/src/vnext_legacy_config_pi_adapter.js";
import { testExecutionLock, testLegacyConfigPiAdapter } from "./vnext_test_support.js";

const execFileAsync = promisify(execFile);

test("stable vNext CLI binds multiple terminal Runs without duplicating or persisting raw credentials", async () => {
  const fixture = await mkdtemp(join(tmpdir(), "evi-vnext-run-session-"));
  const stateRoot = join(fixture, "state");
  const secret = "synthetic-vnext-stable-secret";
  let executions = 0;
  const dependencies = stableDependencies({}, ({ store, model }) => ({
    create(input) {
      assert.equal("api_key" in model, false);
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
  }), secret);
  try {
    await writeStableCoreFixture(fixture);
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

test("legacy-config Pi adapter keeps the trimmed key private and persists an opaque credential identity", async () => {
  const fixture = await mkdtemp(join(tmpdir(), "evi-vnext-legacy-config-adapter-"));
  const stateRoot = join(fixture, "state");
  const configDir = join(fixture, "config");
  const authId = "sensitive-local-credential-id";
  const secret = "synthetic-trimmed-credential";
  try {
    await writeVNextTestConfig({
      configDir,
      stateRoot,
      baseUrl: "https://provider.example.test/v1",
      secret: ` ${secret} `,
      authId,
      modelId: "legacy-config-model",
      model: "legacy-config-model"
    });
    const adapter = await loadLegacyConfigPiAdapter({ config_dir: configDir, state_root: stateRoot });
    assert.equal("api_key" in adapter.model, false);
    assert.match(adapter.model.credential_ref, /^legacy-config-auth-hmac-sha256:[a-f0-9]{64}$/u);
    assert.equal(adapter.model.credential_ref.includes(authId), false);
    assert.equal(adapter.model.credential_ref.includes(secret), false);
    assert.equal(adapter.redact(`provider echoed ${secret}`), "provider echoed [redacted]");
    assert.equal(adapter.redactError(new Error(`provider echoed ${secret}`)) instanceof Error, true);
    assert.doesNotMatch(
      (adapter.redactError(new Error(`provider echoed ${secret}`)) as Error).message,
      new RegExp(secret)
    );

    const store = new SqliteRuntimeStore(join(stateRoot, "runtime.sqlite"), { state_profile: "stable_cli" });
    try {
      const loops = adapter.createLoopFactory({
        store,
        override: ({ model }) => {
          assert.equal("api_key" in model, false);
          assert.equal(model.credential_ref, adapter.model.credential_ref);
          return { create: () => ({ execute: async () => ({ answer: "adapter test" }) }) };
        }
      });
      assert.equal(typeof loops.create, "function");
      const lock = materializeExecutionLock({
        model: {
          config_id: adapter.model.config_id,
          provider: adapter.model.provider,
          api: "openai-responses",
          base_url: adapter.model.base_url,
          model: adapter.model.model,
          credential_ref: adapter.model.credential_ref,
          reasoning_effort: adapter.model.reasoning_effort,
          context_window_tokens: adapter.model.context_window_tokens,
          max_output_tokens: adapter.model.max_output_tokens,
          timeout_ms: adapter.model.timeout_ms
        },
        authority: { cwd: fixture },
        configuration: { selector: "active_model", source_refs: ["config:active_model"] },
        actions: []
      });
      const started = store.beginRun({ request: "Persist only the opaque binding.", execution_lock: lock }, 30_000);
      store.completeRun(started.execution, "complete");
      const persisted = JSON.stringify(store.getExecutionLock(started.run.id));
      assert.equal(persisted.includes(secret), false);
      assert.equal(persisted.includes(authId), false);
      assert.equal(persisted.includes(adapter.model.credential_ref), true);
    } finally {
      store.close();
    }

    const safeLegacyLock = materializeExecutionLock({
      model: {
        config_id: adapter.model.config_id,
        provider: adapter.model.provider,
        api: "openai-responses",
        base_url: adapter.model.base_url,
        model: adapter.model.model,
        credential_ref: authId,
        reasoning_effort: adapter.model.reasoning_effort,
        context_window_tokens: adapter.model.context_window_tokens,
        max_output_tokens: adapter.model.max_output_tokens,
        timeout_ms: adapter.model.timeout_ms
      },
      authority: { cwd: fixture },
      configuration: { selector: "active_model", source_refs: ["config:active_model"] },
      actions: []
    });
    assert.doesNotThrow(() => adapter.assertCredentialBinding(safeLegacyLock));
    for (const unsafeReference of [
      secret,
      ` ${secret} `,
      `legacy-${secret}-suffix`,
      `https://user:${secret}@provider.example.test/v1?token=${secret}#${secret}`,
      "legacy auth id",
      "legacy-auth-id\u0000"
    ]) {
      assert.throws(() => adapter.assertCredentialBinding({
        ...safeLegacyLock,
        model: { ...safeLegacyLock.model, credential_ref: unsafeReference }
      }), ExecutionLockMismatchError);
    }

    await writeVNextTestConfig({
      configDir,
      stateRoot,
      baseUrl: "https://provider.example.test/v1",
      secret: "rotated-synthetic-credential",
      authId,
      modelId: "legacy-config-model",
      model: "legacy-config-model"
    });
    const rotated = await loadLegacyConfigPiAdapter({ config_dir: configDir, state_root: stateRoot });
    assert.notEqual(rotated.model.credential_ref, adapter.model.credential_ref);
    const originalLock = materializeExecutionLock({
      model: {
        config_id: adapter.model.config_id,
        provider: adapter.model.provider,
        api: "openai-responses",
        base_url: adapter.model.base_url,
        model: adapter.model.model,
        credential_ref: adapter.model.credential_ref,
        reasoning_effort: adapter.model.reasoning_effort,
        context_window_tokens: adapter.model.context_window_tokens,
        max_output_tokens: adapter.model.max_output_tokens,
        timeout_ms: adapter.model.timeout_ms
      },
      authority: { cwd: fixture },
      configuration: { selector: "active_model", source_refs: ["config:active_model"] },
      actions: []
    });
    assert.throws(() => rotated.assertCredentialBinding(originalLock), ExecutionLockMismatchError);
    const unsafeHistoricalLock = {
      ...originalLock,
      model: {
        ...originalLock.model,
        base_url: `https://user:${secret}@provider.example.test/v1?token=${secret}#${secret}`
      }
    };
    assert.throws(
      () => adapter.assertCredentialBinding(unsafeHistoricalLock),
      /without credentials, query, or fragment/u
    );
  } finally {
    await rm(fixture, { recursive: true, force: true });
  }
});

test("legacy-config Pi adapter fails closed before state creation for unsafe URL or missing credential", async () => {
  const fixture = await mkdtemp(join(tmpdir(), "evi-vnext-legacy-config-reject-"));
  const stateRoot = join(fixture, "state");
  const configDir = join(fixture, "config");
  const secret = "synthetic-unsafe-config-key";
  try {
    for (const baseUrl of [
      `https://user:${secret}@provider.example.test/v1`,
      `https://provider.example.test/v1?token=${secret}`,
      `https://provider.example.test/v1#${secret}`
    ]) {
      await writeVNextTestConfig({
        configDir,
        stateRoot,
        baseUrl,
        secret,
        modelId: "unsafe-config-model",
        model: "unsafe-config-model"
      });
      await assert.rejects(
        loadLegacyConfigPiAdapter({ config_dir: configDir, state_root: stateRoot }),
        /without credentials, query, or fragment/u
      );
      await assert.rejects(
        executeVNextRun({
          action: "submit",
          task: "Unsafe config must not create state.",
          state_root: stateRoot,
          config_dir: configDir,
          repo_root: fixture
        }),
        /without credentials, query, or fragment/u
      );
      assert.equal(await exists(join(stateRoot, "runtime.sqlite")), false);
    }

    await writeVNextTestConfig({
      configDir,
      stateRoot,
      baseUrl: "https://provider.example.test/v1",
      secret,
      modelId: "missing-auth-model",
      model: "missing-auth-model"
    });
    await writeFile(join(configDir, "auth.jsonl"), "", "utf8");
    await assert.rejects(
      loadLegacyConfigPiAdapter({ config_dir: configDir, state_root: stateRoot }),
      (error: unknown) => Boolean(error && typeof error === "object"
        && (error as { code?: unknown }).code === "credential_unavailable")
    );
    assert.equal(await exists(join(stateRoot, "runtime.sqlite")), false);
  } finally {
    await rm(fixture, { recursive: true, force: true });
  }
});

test("legacy-config credential compatibility fails closed before Pi loop creation or dispatch", async () => {
  const fixture = await mkdtemp(join(tmpdir(), "evi-vnext-legacy-credential-ref-"));
  const stateRoot = join(fixture, "state");
  const configDir = join(fixture, "config");
  const secret = "synthetic-legacy-credential-secret";
  const authId = "legacy-auth-id";
  const baseUrl = "https://provider.example.test/v1";
  let loopFactoryCreations = 0;
  let dispatches = 0;
  try {
    await writeVNextTestConfig({
      configDir,
      stateRoot,
      baseUrl,
      secret,
      authId,
      modelId: "test-locked-model",
      model: "locked-model"
    });
    const store = new SqliteRuntimeStore(join(stateRoot, "runtime.sqlite"), {
      state_profile: "stable_cli"
    });
    try {
      for (const credentialRef of [
        secret,
        ` ${secret} `,
        `legacy-${secret}-suffix`,
        `https://user:${secret}@provider.example.test/v1?token=${secret}#${secret}`,
        "legacy auth id"
      ]) {
        const executionLock = testExecutionLock({
          cwd: fixture,
          model: lockedTestModel("locked-model", baseUrl),
          configuration_source_refs: stableConfigurationRefs(fixture)
        });
        executionLock.model.credential_ref = credentialRef;
        const started = store.beginRun({
          request: "Reject an unsafe legacy credential reference.",
          execution_lock: executionLock
        }, 30_000);
        store.completeRun(started.execution, "terminal");
        await assert.rejects(executeVNextRun({
          action: "continue",
          run_id: started.run.id,
          state_root: stateRoot,
          config_dir: configDir,
          repo_root: fixture
        }, {
          create_loop_factory: () => {
            loopFactoryCreations += 1;
            return {
              create: () => ({
                execute: async () => {
                  dispatches += 1;
                  return { answer: "must not dispatch" };
                }
              })
            };
          }
        }), ExecutionLockMismatchError);
      }
    } finally {
      store.close();
    }
    assert.equal(loopFactoryCreations, 0);
    assert.equal(dispatches, 0);
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
  const authorizationHeaders: string[] = [];
  const requestBodies: string[] = [];
  const server = createServer(async (request, response) => {
    authorizationHeaders.push(String(request.headers.authorization ?? ""));
    let requestBody = "";
    for await (const chunk of request) requestBody += chunk.toString();
    requestBodies.push(requestBody);
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
    await writeStableCoreFixture(fixture);
    await writeVNextTestConfig({
      configDir,
      stateRoot,
      baseUrl: `http://127.0.0.1:${address.port}/v1`,
      secret: ` ${secret} `,
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
    assert.deepEqual(authorizationHeaders, [`Bearer ${secret}`, `Bearer ${secret}`]);
    assert.equal(requestBodies.some((body) => body.includes(secret)), false);
    assert.equal(JSON.stringify(first).includes(secret), false);
    assert.equal(JSON.stringify(second).includes(secret), false);
    const store = new SqliteRuntimeStore(join(stateRoot, "runtime.sqlite"), { state_profile: "stable_cli" });
    try {
      const persisted = JSON.stringify(store.getExecutionLock(first.vnext.run_id!));
      const piHistory = JSON.stringify(store.getPiSessionEntries(first.vnext.session_id!));
      assert.match(persisted, /legacy-config-auth-hmac-sha256:[a-f0-9]{64}/u);
      assert.equal(persisted.includes(secret), false);
      assert.equal(persisted.includes("test-credential"), false);
      assert.equal(piHistory.includes(secret), false);
    } finally {
      store.close();
    }
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

test("stable vNext continuation accepts a safe legacy credential reference during recovery", async () => {
  const fixture = await mkdtemp(join(tmpdir(), "evi-vnext-run-lock-"));
  const stateRoot = join(fixture, "state");
  const configDir = join(fixture, "config");
  const sqlite = join(stateRoot, "runtime.sqlite");
  let runId = "";
  let dispatches = 0;
  const server = createServer((_request, response) => {
    dispatches += 1;
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
    assert.equal(dispatches, 1);
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
  factory?: VNextRunDependencies["create_loop_factory"],
  secret = "synthetic-stable-key"
): VNextRunDependencies {
  const model: ResolvedVNextModel = {
    config_id: "stable-test-model",
    provider: "test-provider",
    api: "responses",
    base_url: "https://provider.example.test/v1",
    model: "stable-model",
    credential_ref: "test-credential",
    reasoning_effort: null,
    context_window_tokens: 128_000,
    max_output_tokens: 2_400,
    timeout_ms: 120_000,
    ...overrides
  };
  return {
    load_legacy_config_pi_adapter: async () => testLegacyConfigPiAdapter({ model, secret }),
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
  authId?: string;
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
    auth_id: input.authId ?? "test-credential",
    max_output_tokens: 2_400,
    timeout_ms: 10_000,
    store: false
  })}\n`, "utf8");
  await writeFile(join(input.configDir, "auth.jsonl"), `${JSON.stringify({
    type: "api_key",
    id: input.authId ?? "test-credential",
    key: input.secret
  })}\n`, "utf8");
}

async function writeStableCoreFixture(repoRoot: string): Promise<void> {
  const docsRoot = join(repoRoot, "docs");
  await mkdir(docsRoot, { recursive: true });
  await writeFile(join(docsRoot, "CURRENT_DIRECTION.md"), [
    "# Current Direction",
    "",
    "Deterministic local fixture for stable vNext Run tests."
  ].join("\n"), "utf8");
  await writeFile(join(docsRoot, "INDEX.md"), [
    "# Documentation Index",
    "",
    "Stable Core fixture index."
  ].join("\n"), "utf8");
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}
