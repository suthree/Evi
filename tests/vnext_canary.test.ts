import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { channel } from "node:diagnostics_channel";
import { once } from "node:events";
import type { Dirent } from "node:fs";
import { createServer } from "node:http";
import {
  mkdir,
  readFile,
  readdir,
  mkdtemp,
  rm,
  symlink,
  writeFile
} from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { Type } from "typebox";
import {
  ActionGateway,
  type ActionHandler,
  type AgentLoopFactory,
  SqliteRuntimeStore
} from "../packages/kernel/src/index.js";
import {
  canaryErrorEnvelope,
  executeVNextCanary,
  VNEXT_CANARY_DIAGNOSTIC_CHANNEL,
  VNEXT_CANARY_MARKER
} from "../apps/cli/src/vnext_canary.js";

test("vNext canary submit and inspect use one isolated SQLite database and mark every response", async () => {
  const fixture = await mkdtemp(join(tmpdir(), "evi-vnext-canary-"));
  const canaryRoot = join(fixture, "canary");
  const sqlite = join(canaryRoot, "runtime.sqlite");
  const v02Root = join(fixture, "v02-state");
  const v02Sentinel = join(v02Root, "sentinel.json");
  await mkdir(dirname(v02Sentinel), { recursive: true });
  await writeFile(v02Sentinel, "v0.2 sentinel must remain untouched");
  const canonicalized: string[] = [];
  const forbiddenIdentities: string[] = [];
  const pathBoundary = {
    forbidden_v02_root: v02Root,
    canonicalize_forbidden_root: async (root: string) => {
      forbiddenIdentities.push(root);
      return root;
    },
    canonicalize_candidate: async (candidate: string) => {
      canonicalized.push(candidate);
      return candidate;
    }
  };
  const dispatches: unknown[] = [];
  const diagnosticChannel = channel(VNEXT_CANARY_DIAGNOSTIC_CHANNEL);
  const recordDispatch = (message: unknown) => dispatches.push(message);
  diagnosticChannel.subscribe(recordDispatch);
  let createCalls = 0;
  const loopFactory: AgentLoopFactory = {
    create(input) {
      createCalls += 1;
      assert.deepEqual(input.action_gateway.contracts().map((contract) => contract.name), ["runtime_inspect"]);
      return { execute: async (request) => ({ answer: `canary answer: ${request}` }) };
    }
  };

  try {
    const submitted = await executeVNextCanary({
      action: "submit",
      sqlite,
      task: "Explain the isolated canary."
    }, { loop_factory: loopFactory, cwd: fixture, path_boundary: pathBoundary });

    assert.equal(submitted.canary.marker, VNEXT_CANARY_MARKER);
    assert.equal(submitted.canary.surface, "cli");
    assert.equal(submitted.canary.action, "submit");
    assert.equal(submitted.canary.status, "completed");
    assert.equal(submitted.canary.result && "answer" in submitted.canary.result
      ? submitted.canary.result.answer
      : null, "canary answer: Explain the isolated canary.");
    assert.equal(createCalls, 1);
    assert.deepEqual(canonicalized, [resolve(sqlite)]);
    assert.deepEqual(forbiddenIdentities, [resolve(v02Root)]);
    assert.equal(await readFile(v02Sentinel, "utf8"), "v0.2 sentinel must remain untouched");
    assert.deepEqual(await readdir(canaryRoot), ["runtime.sqlite"]);

    const inspected = await executeVNextCanary({
      action: "inspect",
      sqlite,
      run_id: submitted.canary.run_id
    }, { path_boundary: pathBoundary });
    assert.equal(inspected.canary.marker, VNEXT_CANARY_MARKER);
    assert.equal(inspected.canary.action, "inspect");
    assert.equal(inspected.canary.status, "completed");
    assert.equal(inspected.canary.result && "event_count" in inspected.canary.result
      ? inspected.canary.result.action_count
      : -1, 0);
    assert.deepEqual(canonicalized, [resolve(sqlite), resolve(sqlite)]);
    assert.deepEqual(forbiddenIdentities, [resolve(v02Root), resolve(v02Root)]);
    assert.deepEqual(dispatches, [
      { marker: VNEXT_CANARY_MARKER, surface: "cli", action: "submit" },
      { marker: VNEXT_CANARY_MARKER, surface: "cli", action: "inspect" }
    ]);
  } finally {
    diagnosticChannel.unsubscribe(recordDispatch);
    await rm(fixture, { recursive: true, force: true });
  }
});

test("vNext canary rejects a candidate symlink into a forbidden v0.2 root without opening state", async () => {
  const fixture = await mkdtemp(join(tmpdir(), "evi-vnext-canary-symlink-"));
  const v02Root = join(fixture, "v02-state");
  const alias = join(fixture, "candidate-alias");
  await symlink(v02Root, alias, "dir");
  try {
    await assert.rejects(executeVNextCanary({
      action: "inspect",
      sqlite: join(alias, "runtime.sqlite"),
      run_id: "run_missing"
    }, {
      path_boundary: {
        forbidden_v02_root: v02Root
      }
    }), /must not overlap the default v0\.2 shared state root/);
    await assert.rejects(readFile(v02Root), /ENOENT/);
  } finally {
    await rm(fixture, { recursive: true, force: true });
  }
});

test("vNext canary rejects the physical target of a symlinked forbidden v0.2 root", async () => {
  const fixture = await mkdtemp(join(tmpdir(), "evi-vnext-canary-forbidden-alias-"));
  const physicalV02Root = join(fixture, "physical-v02-state");
  const declaredV02Root = join(fixture, "declared-v02-state");
  await mkdir(physicalV02Root);
  await symlink(physicalV02Root, declaredV02Root, "dir");
  try {
    await assert.rejects(executeVNextCanary({
      action: "inspect",
      sqlite: join(physicalV02Root, "runtime.sqlite"),
      run_id: "run_missing"
    }, {
      path_boundary: { forbidden_v02_root: declaredV02Root }
    }), /must not overlap the default v0\.2 shared state root/);
    assert.deepEqual(await readdir(physicalV02Root), []);
  } finally {
    await rm(fixture, { recursive: true, force: true });
  }
});

test("vNext canary rejects a physical root reached through a symlinked forbidden ancestor", async () => {
  const fixture = await mkdtemp(join(tmpdir(), "evi-vnext-canary-forbidden-ancestor-"));
  const physicalParent = join(fixture, "physical-parent");
  const declaredParent = join(fixture, "declared-parent");
  const physicalV02Root = join(physicalParent, "v02-state");
  await mkdir(physicalV02Root, { recursive: true });
  await symlink(physicalParent, declaredParent, "dir");
  try {
    await assert.rejects(executeVNextCanary({
      action: "inspect",
      sqlite: join(physicalV02Root, "runtime.sqlite"),
      run_id: "run_missing"
    }, {
      path_boundary: { forbidden_v02_root: join(declaredParent, "v02-state") }
    }), /must not overlap the default v0\.2 shared state root/);
    assert.deepEqual(await readdir(physicalV02Root), []);
  } finally {
    await rm(fixture, { recursive: true, force: true });
  }
});

test("vNext canary rejects case aliases on case-insensitive filesystems", async () => {
  const fixture = await mkdtemp(join(tmpdir(), "evi-vnext-canary-case-alias-"));
  try {
    await assert.rejects(executeVNextCanary({
      action: "inspect",
      sqlite: join(fixture, "v02-state", "runtime.sqlite"),
      run_id: "run_missing"
    }, {
      path_boundary: {
        forbidden_v02_root: join(fixture, "V02-STATE"),
        case_insensitive: true
      }
    }), /must not overlap the default v0\.2 shared state root/);
  } finally {
    await rm(fixture, { recursive: true, force: true });
  }
});

test("vNext canary continue preserves unresolved Action recovery and never registers write or external Actions", async () => {
  const fixture = await mkdtemp(join(tmpdir(), "evi-vnext-canary-continue-"));
  const sqlite = join(fixture, "canary.sqlite");
  let executeCalls = 0;
  let runId = "";
  const store = new SqliteRuntimeStore(sqlite);
  try {
    const started = store.beginRun({ request: "Resume only after exact action reconciliation." }, 30_000);
    runId = started.run.id;
    const failingRead: ActionHandler = {
      contract: {
        name: "synthetic_uncertain_read",
        version: "1",
        label: "Synthetic uncertain read",
        description: "Test-only local read that leaves an unknown Action outcome.",
        parameters: Type.Object({}),
        effect_class: "local_read"
      },
      prepare: () => ({}),
      async execute() {
        executeCalls += 1;
        throw new Error("effect entered dispatch without terminal evidence");
      }
    };
    const gateway = new ActionGateway(store, [failingRead]);
    const unknown = await gateway.invoke({
      run_id: started.run.id,
      turn_id: started.run.turn_id,
      invocation_id: "unsettled-read",
      action_name: failingRead.contract.name,
      arguments: {}
    });
    assert.equal(unknown.status, "outcome_unknown");
    store.pauseRun(started.execution, "Pause for exact Action reconciliation.");
  } finally {
    store.close();
  }

  try {
    const continued = await executeVNextCanary({
      action: "continue",
      sqlite,
      run_id: runId
    }, {
      loop_factory: { create: () => ({ execute: async () => ({ answer: "must not run" }) }) },
      cwd: fixture,
      path_boundary: isolatedPathBoundary(fixture)
    });
    assert.equal(continued.canary.marker, VNEXT_CANARY_MARKER);
    assert.equal(continued.canary.status, "paused");
    assert.equal(executeCalls, 1);
    const inspected = await executeVNextCanary(
      { action: "inspect", sqlite, run_id: runId },
      { path_boundary: isolatedPathBoundary(fixture) }
    );
    const inspection = inspected.canary.result;
    assert.equal(inspection && "action_count" in inspection ? inspection.unresolved_action_count : -1, 1);
  } finally {
    await rm(fixture, { recursive: true, force: true });
  }
});

test("vNext canary continue keeps a drifted reserved Action paused without dispatch or receipt", async () => {
  const fixture = await mkdtemp(join(tmpdir(), "evi-vnext-canary-drifted-reservation-"));
  const sqlite = join(fixture, "canary.sqlite");
  let runId = "";
  const store = new SqliteRuntimeStore(sqlite);
  try {
    const started = store.beginRun({ request: "Reject corrupted recovery authority." }, 30_000);
    runId = started.run.id;
    store.reserveAction({
      run_id: started.run.id,
      turn_id: started.run.turn_id,
      invocation_id: "corrupted-runtime-inspect",
      action_name: "runtime_inspect",
      contract_version: "1",
      action_digest: "0".repeat(64),
      effect_class: "local_write",
      decision_reason: "synthetic corrupted decision",
      arguments: {}
    });
    store.pauseRun(started.execution, "Wait for exact recovery authority.");
  } finally {
    store.close();
  }

  try {
    await assert.rejects(executeVNextCanary({
      action: "continue",
      sqlite,
      run_id: runId
    }, {
      loop_factory: { create: () => ({ execute: async () => ({ answer: "must not run" }) }) },
      path_boundary: isolatedPathBoundary(fixture)
    }), /Action reservation identity mismatch/);
    const reopened = new SqliteRuntimeStore(sqlite);
    try {
      assert.equal(reopened.inspectRun(runId)?.status, "paused");
      assert.equal(reopened.inspectRun(runId)?.unresolved_action_count, 1);
      assert.equal(reopened.inspectRun(runId)?.effect_receipt_count, 0);
      assert.equal(reopened.listUnresolvedActions(runId)[0]?.state, "reserved");
    } finally {
      reopened.close();
    }
  } finally {
    await rm(fixture, { recursive: true, force: true });
  }
});

test("vNext canary redacts a provider-reflected credential from failed Run state and output", async () => {
  const fixture = await mkdtemp(join(tmpdir(), "evi-vnext-canary-credential-"));
  const sqlite = join(fixture, "canary.sqlite");
  const secret = "synthetic-canary-secret-for-redaction";
  const envName = "CANARY_PROVIDER_REFLECTION_SECRET";
  const previous = process.env[envName];
  let authorization = "";
  const server = createServer((request, response) => {
    authorization = request.headers.authorization ?? "";
    response.writeHead(401, { "content-type": "application/json" });
    response.end(JSON.stringify({
      error: { message: `provider reflected ${secret}`, type: "authentication_error" }
    }));
  });
  process.env[envName] = secret;
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address === "object");

  try {
    const result = await executeVNextCanary({
      action: "submit",
      sqlite,
      task: "Exercise a credential-safe provider failure.",
      base_url: `http://127.0.0.1:${address.port}/v1`,
      model: "credential-reflection-test",
      api_key_env: envName
    }, { cwd: fixture, path_boundary: isolatedPathBoundary(fixture) });

    assert.equal(authorization, `Bearer ${secret}`);
    assert.equal(result.canary.marker, VNEXT_CANARY_MARKER);
    assert.equal(result.canary.status, "failed");
    assert.match(JSON.stringify(result), /\[redacted\]/);
    assert.doesNotMatch(JSON.stringify(result), new RegExp(secret));
    for (const name of await readdir(fixture)) {
      const contents = await readFile(join(fixture, name));
      assert.equal(contents.includes(Buffer.from(secret)), false, `${name} persisted the raw credential`);
    }
  } finally {
    await new Promise<void>((resolveClose, reject) => server.close((error) => error ? reject(error) : resolveClose()));
    if (previous === undefined) delete process.env[envName];
    else process.env[envName] = previous;
    await rm(fixture, { recursive: true, force: true });
  }
});

test("vNext canary redacts a credential echoed in a successful provider answer everywhere", async () => {
  const fixture = await mkdtemp(join(tmpdir(), "evi-vnext-canary-success-credential-"));
  const sqlite = join(fixture, "canary.sqlite");
  const secret = "synthetic-success-canary-secret";
  const envName = "CANARY_SUCCESS_REFLECTION_SECRET";
  const previous = process.env[envName];
  let authorization = "";
  const server = createServer((request, response) => {
    authorization = request.headers.authorization ?? "";
    response.writeHead(200, { "content-type": "text/event-stream" });
    const message = {
      id: "msg_canary_success",
      type: "message",
      status: "completed",
      role: "assistant",
      content: [{ type: "output_text", text: `provider echoed ${secret}`, annotations: [] }]
    };
    for (const event of [
      { type: "response.output_item.done", output_index: 0, item: message },
      {
        type: "response.completed",
        response: {
          id: "resp_canary_success",
          status: "completed",
          output: [message],
          usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 }
        }
      }
    ]) {
      response.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
    }
    response.end("data: [DONE]\n\n");
  });
  process.env[envName] = secret;
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address === "object");

  try {
    const pathBoundary = isolatedPathBoundary(fixture);
    const result = await executeVNextCanary({
      action: "submit",
      sqlite,
      task: "Exercise a credential-safe successful provider response.",
      base_url: `http://127.0.0.1:${address.port}/v1`,
      model: "credential-success-reflection-test",
      api_key_env: envName
    }, { cwd: fixture, path_boundary: pathBoundary });

    assert.equal(authorization, `Bearer ${secret}`);
    assert.equal(result.canary.status, "completed");
    assert.match(JSON.stringify(result), /\[redacted\]/);
    assert.doesNotMatch(JSON.stringify(result), new RegExp(secret));

    const inspected = await executeVNextCanary({
      action: "inspect",
      sqlite,
      run_id: result.canary.run_id
    }, { path_boundary: pathBoundary });
    assert.match(JSON.stringify(inspected), /\[redacted\]/);
    assert.doesNotMatch(JSON.stringify(inspected), new RegExp(secret));

    const reopened = new SqliteRuntimeStore(sqlite);
    try {
      const sessionId = result.canary.session_id;
      assert.ok(sessionId);
      assert.doesNotMatch(JSON.stringify(reopened.inspectRun(result.canary.run_id!)), new RegExp(secret));
      assert.doesNotMatch(JSON.stringify(reopened.getPiSessionEntries(sessionId)), new RegExp(secret));
    } finally {
      reopened.close();
    }
    await assertDirectoryExcludesText(fixture, secret);
  } finally {
    await new Promise<void>((resolveClose, reject) => server.close((error) => error ? reject(error) : resolveClose()));
    if (previous === undefined) delete process.env[envName];
    else process.env[envName] = previous;
    await rm(fixture, { recursive: true, force: true });
  }
});

test("vNext canary reports invalid paths and diagnostics in the canary envelope without secret disclosure", async () => {
  const secret = "not-for-output";
  const before = process.env.CANARY_TEST_SECRET;
  process.env.CANARY_TEST_SECRET = secret;
  try {
    await assert.rejects(
      executeVNextCanary({ action: "inspect", sqlite: "relative.sqlite", run_id: "run_missing" }),
      /absolute path/
    );
    await assert.rejects(
      executeVNextCanary({
        action: "inspect",
        sqlite: join(homedir(), ".local-runtime/state/evi/canary.sqlite"),
        run_id: "run_missing"
      }),
      /must not overlap the default v0\.2 shared state root/
    );
    const envelope = canaryErrorEnvelope(new Error(`provider said ${secret}`), "submit", "CANARY_TEST_SECRET");
    assert.equal(envelope.canary.marker, VNEXT_CANARY_MARKER);
    assert.equal(envelope.canary.status, "error");
    assert.doesNotMatch(JSON.stringify(envelope), new RegExp(secret));
  } finally {
    if (before === undefined) delete process.env.CANARY_TEST_SECRET;
    else process.env.CANARY_TEST_SECRET = before;
  }
});

test("vNext CLI marks an omitted canary opt-in as a canary error response", () => {
  const result = spawnSync(
    process.execPath,
    ["--import", "tsx", "apps/cli/src/main.ts", "vnext", "submit", "--task", "missing canary token"],
    { cwd: process.cwd(), encoding: "utf8" }
  );
  assert.equal(result.status, 1, result.stderr);
  const response = JSON.parse(result.stdout) as {
    canary: { marker: string; status: string; diagnostic?: { message?: string } };
  };
  assert.equal(response.canary.marker, VNEXT_CANARY_MARKER);
  assert.equal(response.canary.status, "error");
  assert.match(response.canary.diagnostic?.message ?? "", /explicit canary surface/);
});

function isolatedPathBoundary(fixture: string) {
  const forbiddenRoot = `${fixture}-v02-state`;
  return {
    forbidden_v02_root: forbiddenRoot,
    canonicalize_forbidden_root: async () => forbiddenRoot
  };
}

async function assertDirectoryExcludesText(root: string, text: string): Promise<void> {
  for (const entry of await readdir(root, { withFileTypes: true })) {
    await assertEntryExcludesText(root, entry, text);
  }
}

async function assertEntryExcludesText(parent: string, entry: Dirent, text: string): Promise<void> {
  const path = join(parent, entry.name);
  if (entry.isDirectory()) {
    await assertDirectoryExcludesText(path, text);
    return;
  }
  if (!entry.isFile()) return;
  assert.equal((await readFile(path)).includes(Buffer.from(text)), false, `${path} persisted the raw credential`);
}
