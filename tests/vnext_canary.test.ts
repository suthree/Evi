import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
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
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import {
  createModels,
  fauxAssistantMessage,
  fauxProvider,
  fauxToolCall
} from "@earendil-works/pi-ai";
import {
  ActionGateway,
  DIAGNOSTIC_CANARY_EXPERIENCE_SCHEMA_META_KEY,
  DIAGNOSTIC_CANARY_EXPERIENCE_SCHEMA_VERSION,
  type ActionHandler,
  type AgentLoopFactory,
  createRuntimeInspectAction,
  KernelRuntime,
  PiAgentHarnessLoopFactory,
  SqliteRuntimeStore
} from "../packages/kernel/src/index.js";
import {
  canaryErrorEnvelope,
  executeVNextCanary,
  VNEXT_CANARY_DIAGNOSTIC_CHANNEL,
  VNEXT_CANARY_MARKER
} from "../apps/cli/src/vnext_canary.js";
import { testExecutionLock } from "./vnext_test_support.js";

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
      task: "Explain the isolated canary.",
      base_url: "https://canary.example.test/v1",
      model: "canary-test-model",
      api_key_env: "CANARY_TEST_UNUSED_KEY"
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
    assert.equal(inspected.canary.result && "action_count" in inspected.canary.result
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

test("vNext canary projects one successful synthetic Pi runtime_inspect receipt without retaining payloads", async () => {
  const fixture = await mkdtemp(join(tmpdir(), "evi-vnext-canary-experience-synthetic-"));
  const sqlite = join(fixture, "canary.sqlite");
  const syntheticPrompt = "synthetic-canary-prompt-must-not-enter-experience";
  const syntheticPiMessage = "synthetic-Pi-message-must-not-enter-experience";
  const syntheticCredentialReference = "SYNTHETIC_CANARY_CREDENTIAL_MUST_NOT_ENTER_EXPERIENCE";
  const models = createModels();
  const faux = fauxProvider({ provider: `canary-experience-${Date.now()}` });
  models.setProvider(faux.provider);
  faux.setResponses([
    (context) => {
      assert.deepEqual(context.tools.map((tool) => tool.name), ["runtime_inspect"]);
      return fauxAssistantMessage(
        fauxToolCall("runtime_inspect", {}, { id: "synthetic-canary-inspect-call" }),
        { stopReason: "toolUse" }
      );
    },
    (context) => {
      const toolResult = context.messages.find((message) => message.role === "toolResult");
      assert.ok(toolResult && toolResult.role === "toolResult");
      return fauxAssistantMessage(syntheticPiMessage);
    }
  ]);

  const store = new SqliteRuntimeStore(sqlite, { state_profile: "diagnostic_canary" });
  let runId = "";
  let expectedRecords: unknown[] = [];
  try {
    const gateway = new ActionGateway(store, [createRuntimeInspectAction(store)]);
    const runtime = new KernelRuntime(store, gateway, new PiAgentHarnessLoopFactory({
      store,
      models,
      model: faux.getModel(),
      cwd: fixture
    }));
    const executionLock = testExecutionLock({
      cwd: fixture,
      model: faux.getModel(),
      contracts: gateway.contracts()
    });
    executionLock.model.credential_ref = syntheticCredentialReference;
    const outcome = await runtime.submit({
      request: syntheticPrompt,
      execution_lock: executionLock
    });

    runId = outcome.run_id;
    assert.equal(outcome.status, "completed");
    assert.equal(runtime.inspect(runId)?.unresolved_action_count, 0);
    assert.equal(runtime.inspect(runId)?.effect_receipt_count, 1);
    const experience = store.inspectCanaryExperience(runId);
    assert.equal(experience.record_count, 1);
    assert.equal(experience.records.length, 1);
    const record = experience.records[0]!;
    assert.equal(record.run_id, runId);
    assert.equal(record.action_name, "runtime_inspect");
    assert.equal(record.contract_version, "1");
    assert.equal(record.effect_class, "local_read");
    assert.equal(record.cost, "unavailable");
    assert.match(record.action_digest, /^[a-f0-9]{64}$/);
    assert.doesNotMatch(JSON.stringify(record), new RegExp(syntheticPrompt));
    assert.doesNotMatch(JSON.stringify(record), new RegExp(syntheticPiMessage));
    assert.doesNotMatch(JSON.stringify(record), new RegExp(syntheticCredentialReference));
    assert.doesNotMatch(JSON.stringify(record), /bounded runtime state was inspected locally/);
    expectedRecords = experience.records;

    await assert.rejects(runtime.continueRun(runId), /Run cannot continue/);
    assert.deepEqual(store.inspectCanaryExperience(runId).records, expectedRecords);
  } finally {
    store.close();
  }

  try {
    const reopened = new SqliteRuntimeStore(sqlite, { state_profile: "diagnostic_canary" });
    try {
      assert.deepEqual(reopened.inspectCanaryExperience(runId).records, expectedRecords);
    } finally {
      reopened.close();
    }
    const inspected = await executeVNextCanary(
      { action: "inspect", sqlite, run_id: runId },
      { path_boundary: isolatedPathBoundary(fixture) }
    );
    const result = inspected.canary.result;
    assert.ok(result && "canary_experience" in result);
    assert.deepEqual(result.canary_experience.records, expectedRecords);
    assert.deepEqual(Object.keys(result).sort(), [
      "action_count",
      "canary_experience",
      "continuation_count",
      "created_at",
      "effect_receipt_count",
      "execution_count",
      "interrupted_execution_count",
      "model_dispatch_count",
      "run_id",
      "session_id",
      "status",
      "turn_id",
      "unknown_model_dispatch_count",
      "unresolved_action_count",
      "updated_at"
    ]);
    const inspectEnvelope = JSON.stringify(inspected);
    assert.doesNotMatch(inspectEnvelope, new RegExp(syntheticPrompt));
    assert.doesNotMatch(inspectEnvelope, new RegExp(syntheticPiMessage));
    assert.doesNotMatch(inspectEnvelope, new RegExp(syntheticCredentialReference));
    assert.doesNotMatch(
      inspectEnvelope,
      /"request"|"answer"|"error"|"execution_lock"|"credential_ref"|"output"|"message"/
    );
  } finally {
    await rm(fixture, { recursive: true, force: true });
  }
});

test("vNext canary inspect DTO excludes a synthetic terminal failure body", async () => {
  const fixture = await mkdtemp(join(tmpdir(), "evi-vnext-canary-inspect-failure-synthetic-"));
  const sqlite = join(fixture, "canary.sqlite");
  const syntheticFailure = "synthetic-failure-body-must-not-enter-inspect";
  const store = new SqliteRuntimeStore(sqlite, { state_profile: "diagnostic_canary" });
  let runId = "";
  try {
    const gateway = new ActionGateway(store, [createRuntimeInspectAction(store)]);
    const runtime = new KernelRuntime(store, gateway, {
      create: () => ({ execute: async () => { throw new Error(syntheticFailure); } })
    });
    const failed = await runtime.submit({
      request: "Synthetic inspect-failure request.",
      execution_lock: testExecutionLock({ cwd: fixture, contracts: gateway.contracts() })
    });
    runId = failed.run_id;
    assert.equal(failed.status, "failed");
  } finally {
    store.close();
  }

  try {
    const inspected = await executeVNextCanary(
      { action: "inspect", sqlite, run_id: runId },
      { path_boundary: isolatedPathBoundary(fixture) }
    );
    assert.equal(inspected.canary.status, "failed");
    const inspectEnvelope = JSON.stringify(inspected);
    assert.doesNotMatch(inspectEnvelope, new RegExp(syntheticFailure));
    assert.doesNotMatch(
      inspectEnvelope,
      /"request"|"answer"|"error"|"execution_lock"|"credential_ref"|"output"|"message"/
    );
  } finally {
    await rm(fixture, { recursive: true, force: true });
  }
});

test("vNext canary projection schema is versioned, verified, and absent from stable state", async () => {
  const fixture = await mkdtemp(join(tmpdir(), "evi-vnext-canary-schema-synthetic-"));
  const compatible = join(fixture, "compatible.sqlite");
  const incompatibleVersion = join(fixture, "incompatible-version.sqlite");
  const incompatibleStructure = join(fixture, "incompatible-structure.sqlite");
  const stable = join(fixture, "stable.sqlite");
  try {
    const first = new SqliteRuntimeStore(compatible, { state_profile: "diagnostic_canary" });
    first.close();
    const compatibleDb = new DatabaseSync(compatible);
    try {
      const version = compatibleDb.prepare("SELECT value FROM schema_meta WHERE key = ?")
        .get(DIAGNOSTIC_CANARY_EXPERIENCE_SCHEMA_META_KEY) as { value: string };
      assert.equal(version.value, DIAGNOSTIC_CANARY_EXPERIENCE_SCHEMA_VERSION);
    } finally {
      compatibleDb.close();
    }
    const reopened = new SqliteRuntimeStore(compatible, { state_profile: "diagnostic_canary" });
    reopened.close();

    const versioned = new SqliteRuntimeStore(incompatibleVersion, { state_profile: "diagnostic_canary" });
    versioned.close();
    const incompatibleVersionDb = new DatabaseSync(incompatibleVersion);
    incompatibleVersionDb.prepare("UPDATE schema_meta SET value = '999' WHERE key = ?")
      .run(DIAGNOSTIC_CANARY_EXPERIENCE_SCHEMA_META_KEY);
    incompatibleVersionDb.close();
    assert.throws(
      () => new SqliteRuntimeStore(incompatibleVersion, { state_profile: "diagnostic_canary" }),
      /unsupported version 999/
    );

    const structured = new SqliteRuntimeStore(incompatibleStructure, { state_profile: "diagnostic_canary" });
    structured.close();
    const incompatibleStructureDb = new DatabaseSync(incompatibleStructure);
    incompatibleStructureDb.exec("DROP TABLE canary_experience_records");
    incompatibleStructureDb.close();
    assert.throws(
      () => new SqliteRuntimeStore(incompatibleStructure, { state_profile: "diagnostic_canary" }),
      /canary_experience_records table is missing/
    );

    const stableStore = new SqliteRuntimeStore(stable, { state_profile: "stable_cli" });
    assert.throws(
      () => stableStore.inspectCanaryExperience("run_synthetic_missing"),
      /only available to the diagnostic_canary state profile/
    );
    stableStore.close();
    const stableDb = new DatabaseSync(stable);
    try {
      const table = stableDb.prepare(`
        SELECT 1 AS present
        FROM sqlite_master
        WHERE type = 'table' AND name = 'canary_experience_records'
      `).get() as { present: number } | undefined;
      assert.equal(table, undefined);
    } finally {
      stableDb.close();
    }
  } finally {
    await rm(fixture, { recursive: true, force: true });
  }
});

test("vNext canary leaves failed, unknown, and no-tool synthetic Runs without Experience Records", async () => {
  const fixture = await mkdtemp(join(tmpdir(), "evi-vnext-canary-experience-negative-synthetic-"));
  const store = new SqliteRuntimeStore(join(fixture, "canary.sqlite"), { state_profile: "diagnostic_canary" });
  try {
    const runtimeInspect = createRuntimeInspectAction(store);
    const gateway = new ActionGateway(store, [runtimeInspect]);
    const runtime = new KernelRuntime(store, gateway, {
      create: () => ({ execute: async () => ({ answer: "Synthetic no-tool completion." }) })
    });
    const noTool = await runtime.submit({
      request: "Synthetic no-tool Run.",
      execution_lock: testExecutionLock({ cwd: fixture, contracts: gateway.contracts() })
    });
    assert.equal(noTool.status, "completed");
    assert.equal(store.inspectCanaryExperience(noTool.run_id).record_count, 0);

    const failedRuntime = new KernelRuntime(store, gateway, {
      create: () => ({ execute: async () => { throw new Error("Synthetic Pi failure."); } })
    });
    const failed = await failedRuntime.submit({
      request: "Synthetic failed Run.",
      execution_lock: testExecutionLock({ cwd: fixture, contracts: gateway.contracts() })
    });
    assert.equal(failed.status, "failed");
    assert.equal(store.inspectCanaryExperience(failed.run_id).record_count, 0);

    const failedReceipt = store.beginRun({
      request: "Synthetic failed-receipt Run.",
      execution_lock: testExecutionLock({ cwd: fixture, contracts: gateway.contracts() })
    }, 30_000);
    const failedReservation = store.reserveAction({
      run_id: failedReceipt.run.id,
      turn_id: failedReceipt.run.turn_id,
      invocation_id: "synthetic-failed-runtime-inspect",
      action_name: runtimeInspect.contract.name,
      contract_version: runtimeInspect.contract.version,
      action_digest: actionDigestForTest(runtimeInspect, {}),
      effect_class: runtimeInspect.contract.effect_class,
      decision_reason: "Synthetic failed-receipt fixture.",
      arguments: {}
    });
    store.completeAction(failedReservation.reservation.id, {
      outcome: "failed",
      summary: "Synthetic runtime inspection failure.",
      output: { synthetic: true }
    }, false);
    store.completeRun(failedReceipt.execution, "Synthetic Run completed after a failed receipt.");
    assert.equal(store.inspectCanaryExperience(failedReceipt.run.id).record_count, 0);

    const unknown = store.beginRun({
      request: "Synthetic unknown Action Run.",
      execution_lock: testExecutionLock({ cwd: fixture, contracts: gateway.contracts() })
    }, 30_000);
    const reserved = store.reserveAction({
      run_id: unknown.run.id,
      turn_id: unknown.run.turn_id,
      invocation_id: "synthetic-unknown-runtime-inspect",
      action_name: runtimeInspect.contract.name,
      contract_version: runtimeInspect.contract.version,
      action_digest: actionDigestForTest(runtimeInspect, {}),
      effect_class: runtimeInspect.contract.effect_class,
      decision_reason: "Synthetic unknown-action fixture.",
      arguments: {}
    });
    store.markActionOutcomeUnknown(reserved.reservation.id, "Synthetic unknown result.");
    store.pauseRun(unknown.execution, "Synthetic unknown Action is unresolved.");
    assert.equal(store.inspectRun(unknown.run.id)?.status, "paused");
    assert.equal(store.inspectCanaryExperience(unknown.run.id).record_count, 0);
  } finally {
    store.close();
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

test("vNext canary continue reconciles its exact local-read Action and never registers write or external Actions", async () => {
  const fixture = await mkdtemp(join(tmpdir(), "evi-vnext-canary-continue-"));
  const sqlite = join(fixture, "canary.sqlite");
  let runId = "";
  const store = new SqliteRuntimeStore(sqlite, { state_profile: "diagnostic_canary" });
  try {
    const runtimeInspect = createRuntimeInspectAction(store);
    const started = store.beginRun({
      request: "Resume only after exact action reconciliation.",
      execution_lock: testExecutionLock({ cwd: fixture, contracts: [runtimeInspect.contract] })
    }, 30_000);
    runId = started.run.id;
    const reserved = store.reserveAction({
      run_id: started.run.id,
      turn_id: started.run.turn_id,
      invocation_id: "unsettled-read",
      action_name: runtimeInspect.contract.name,
      contract_version: runtimeInspect.contract.version,
      action_digest: actionDigestForTest(runtimeInspect, {}),
      effect_class: runtimeInspect.contract.effect_class,
      decision_reason: "synthetic crash before terminal evidence",
      arguments: {}
    });
    store.markActionDispatching(reserved.reservation.id);
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
    assert.equal(continued.canary.status, "completed");
    const inspected = await executeVNextCanary(
      { action: "inspect", sqlite, run_id: runId },
      { path_boundary: isolatedPathBoundary(fixture) }
    );
    const inspection = inspected.canary.result;
    assert.equal(inspection && "action_count" in inspection ? inspection.unresolved_action_count : -1, 0);
    assert.equal(inspection && "action_count" in inspection ? inspection.effect_receipt_count : -1, 1);
  } finally {
    await rm(fixture, { recursive: true, force: true });
  }
});

test("vNext canary continue keeps a drifted reserved Action paused without dispatch or receipt", async () => {
  const fixture = await mkdtemp(join(tmpdir(), "evi-vnext-canary-drifted-reservation-"));
  const sqlite = join(fixture, "canary.sqlite");
  let runId = "";
  const store = new SqliteRuntimeStore(sqlite, { state_profile: "diagnostic_canary" });
  try {
    const runtimeInspect = createRuntimeInspectAction(store);
    const started = store.beginRun({
      request: "Reject corrupted recovery authority.",
      execution_lock: testExecutionLock({ cwd: fixture, contracts: [runtimeInspect.contract] })
    }, 30_000);
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
    const reopened = new SqliteRuntimeStore(sqlite, { state_profile: "diagnostic_canary" });
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
    assert.doesNotMatch(JSON.stringify(inspected), /\[redacted\]/);
    assert.doesNotMatch(JSON.stringify(inspected), new RegExp(secret));

    const reopened = new SqliteRuntimeStore(sqlite, { state_profile: "diagnostic_canary" });
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

function actionDigestForTest(handler: ActionHandler, arguments_: Record<string, unknown>): string {
  return createHash("sha256").update(stableJsonForTest({
    name: handler.contract.name,
    version: handler.contract.version,
    effect_class: handler.contract.effect_class,
    arguments: arguments_
  })).digest("hex");
}

function stableJsonForTest(input: unknown): string {
  if (input === null || typeof input !== "object") return JSON.stringify(input);
  if (Array.isArray(input)) return `[${input.map(stableJsonForTest).join(",")}]`;
  const record = input as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) =>
    `${JSON.stringify(key)}:${stableJsonForTest(record[key])}`
  ).join(",")}}`;
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
