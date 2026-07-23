import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { Type } from "typebox";
import { ActionGateway } from "../packages/kernel/src/action_gateway.js";
import type { ActionHandler, JsonObject } from "../packages/kernel/src/action_types.js";
import { SqliteRuntimeStore } from "../packages/kernel/src/sqlite_runtime_store.js";
import { testExecutionLock } from "./vnext_test_support.js";

test("Action Gateway reserves before dispatch and reuses one terminal receipt", async () => {
  const fixture = await createFixture();
  const store = new SqliteRuntimeStore(join(fixture, "runtime.sqlite"));
  let executeCalls = 0;
  const handler = probeHandler({
    async execute(dispatch) {
      executeCalls += 1;
      assert.equal(dispatch.reservation.state, "dispatching");
      assert.equal(store.inspectRun(dispatch.reservation.run_id)?.action_count, 1);
      assert.equal(store.inspectRun(dispatch.reservation.run_id)?.unresolved_action_count, 1);
      assert.equal(store.inspectRun(dispatch.reservation.run_id)?.effect_receipt_count, 0);
      return {
        outcome: "succeeded",
        summary: "Synthetic local-read probe completed.",
        output: { echoed: dispatch.arguments.value ?? null }
      };
    }
  });
  try {
    const { run } = store.beginRun({
      request: "Exercise one reserved action.",
      execution_lock: testExecutionLock({ cwd: fixture, contracts: [handler.contract] })
    }, 30_000);
    const gateway = new ActionGateway(store, [handler]);
    const invocation = {
      run_id: run.id,
      turn_id: run.turn_id,
      invocation_id: "tool-call-1",
      action_name: handler.contract.name,
      arguments: { value: "bounded" }
    };

    const first = await gateway.invoke(invocation);
    assert.equal(first.status, "completed");
    if (first.status !== "completed") return;
    assert.equal(first.receipt.outcome, "succeeded");
    assert.equal(first.receipt.reconciled, false);
    assert.equal(first.reservation.state, "terminal");

    const repeated = await gateway.invoke(invocation);
    assert.equal(repeated.status, "completed");
    if (repeated.status !== "completed") return;
    assert.equal(repeated.receipt.id, first.receipt.id);
    assert.equal(executeCalls, 1);
    const inspection = store.inspectRun(run.id);
    assert.equal(inspection?.action_count, 1);
    assert.equal(inspection?.unresolved_action_count, 0);
    assert.equal(inspection?.effect_receipt_count, 1);
  } finally {
    store.close();
    await rm(fixture, { recursive: true, force: true });
  }
});

test("Action Gateway safely dispatches an exact reservation that never entered dispatch", async () => {
  const fixture = await createFixture();
  const store = new SqliteRuntimeStore(join(fixture, "runtime.sqlite"));
  let executeCalls = 0;
  const handler = probeHandler({
    async execute() {
      executeCalls += 1;
      return { outcome: "succeeded", summary: "Reserved invocation dispatched once.", output: {} };
    }
  });
  try {
    const { run } = store.beginRun({
      request: "Recover a pre-dispatch reservation.",
      execution_lock: testExecutionLock({ cwd: fixture, contracts: [handler.contract] })
    }, 30_000);
    const gateway = new ActionGateway(store, [handler]);
    const invocation = {
      run_id: run.id,
      turn_id: run.turn_id,
      invocation_id: "reserved-only-call",
      action_name: handler.contract.name,
      arguments: {}
    };
    const markDispatching = store.markActionDispatching.bind(store);
    store.markActionDispatching = () => {
      throw new Error("simulated crash after reservation");
    };
    await assert.rejects(gateway.invoke(invocation), /simulated crash after reservation/);
    assert.equal(store.listUnresolvedActions(run.id)[0]?.state, "reserved");
    assert.equal(executeCalls, 0);

    store.markActionDispatching = markDispatching;
    const recovered = await gateway.invoke(invocation);
    assert.equal(recovered.status, "completed");
    assert.equal(executeCalls, 1);
    assert.equal(store.inspectRun(run.id)?.unresolved_action_count, 0);
    assert.equal(store.inspectRun(run.id)?.effect_receipt_count, 1);
  } finally {
    store.close();
    await rm(fixture, { recursive: true, force: true });
  }
});

test("Action Gateway keeps the default argument bound and permits one validated handler override", async () => {
  const fixture = await createFixture();
  const store = new SqliteRuntimeStore(join(fixture, "runtime.sqlite"));
  const largeValue = "x".repeat(20 * 1024);
  const base = probeHandler({
    async execute() {
      return { outcome: "succeeded", summary: "Bounded override accepted.", output: {} };
    }
  });
  try {
    const { run } = store.beginRun({
      request: "Exercise one action-specific prepared argument bound.",
      execution_lock: testExecutionLock({ cwd: fixture, contracts: [base.contract] })
    }, 30_000);
    const invocation = {
      run_id: run.id,
      turn_id: run.turn_id,
      invocation_id: "large-prepared-argument",
      action_name: base.contract.name,
      arguments: { value: largeValue }
    };

    const denied = await new ActionGateway(store, [base]).invoke(invocation);
    assert.equal(denied.status, "denied");
    assert.match(denied.status === "denied" ? denied.reason : "", /exceeds 16384 bytes/iu);
    assert.equal(store.listUnresolvedActions(run.id).length, 0);

    const enlarged = { ...base, prepared_argument_max_bytes: 32 * 1024 };
    const completed = await new ActionGateway(store, [enlarged]).invoke(invocation);
    assert.equal(completed.status, "completed", JSON.stringify(completed));

    assert.throws(
      () => new ActionGateway(store, [{ ...base, prepared_argument_max_bytes: 128 * 1024 + 1 }]),
      /prepared argument limit is invalid/iu
    );
  } finally {
    store.close();
    await rm(fixture, { recursive: true, force: true });
  }
});

test("Action Gateway rejects invocation identity drift without replay", async () => {
  const fixture = await createFixture();
  const store = new SqliteRuntimeStore(join(fixture, "runtime.sqlite"));
  let executeCalls = 0;
  const handler = probeHandler({
    async execute() {
      executeCalls += 1;
      return { outcome: "succeeded", summary: "First identity completed.", output: {} };
    }
  });
  try {
    const { run } = store.beginRun({
      request: "Reject a changed action digest.",
      execution_lock: testExecutionLock({ cwd: fixture, contracts: [handler.contract] })
    }, 30_000);
    const gateway = new ActionGateway(store, [handler]);
    await gateway.invoke({
      run_id: run.id,
      turn_id: run.turn_id,
      invocation_id: "stable-call",
      action_name: handler.contract.name,
      arguments: { value: "first" }
    });

    await assert.rejects(gateway.invoke({
      run_id: run.id,
      turn_id: run.turn_id,
      invocation_id: "stable-call",
      action_name: handler.contract.name,
      arguments: { value: "changed" }
    }), /Action invocation identity mismatch/);
    assert.equal(executeCalls, 1);
  } finally {
    store.close();
    await rm(fixture, { recursive: true, force: true });
  }
});

test("Action Gateway binds an invocation to the exact Tool Contract version", async () => {
  const fixture = await createFixture();
  const store = new SqliteRuntimeStore(join(fixture, "runtime.sqlite"));
  let executeCalls = 0;
  const execute: ActionHandler["execute"] = async () => {
    executeCalls += 1;
    return { outcome: "succeeded", summary: "Version one completed.", output: {} };
  };
  try {
    const firstHandler = probeHandler({ execute }, "1");
    const { run } = store.beginRun({
      request: "Bind one invocation to one contract version.",
      execution_lock: testExecutionLock({ cwd: fixture, contracts: [firstHandler.contract] })
    }, 30_000);
    const firstGateway = new ActionGateway(store, [firstHandler]);
    const invocation = {
      run_id: run.id,
      turn_id: run.turn_id,
      invocation_id: "versioned-call",
      action_name: "synthetic_probe",
      arguments: {}
    };
    await firstGateway.invoke(invocation);

    const upgradedGateway = new ActionGateway(store, [probeHandler({ execute }, "2")]);
    const denied = await upgradedGateway.invoke(invocation);
    assert.equal(denied.status, "denied");
    assert.match("reason" in denied ? denied.reason : "", /immutable Execution Lock/);
    assert.equal(executeCalls, 1);
  } finally {
    store.close();
    await rm(fixture, { recursive: true, force: true });
  }
});

test("Action Gateway reconciles an unknown outcome after SQLite reopen without replay", async () => {
  const fixture = await createFixture();
  const dbPath = join(fixture, "runtime.sqlite");
  let executeCalls = 0;
  let reconcileCalls = 0;
  let runId = "";
  let turnId = "";

  const firstStore = new SqliteRuntimeStore(dbPath);
  try {
    const firstHandler = probeHandler({
      async execute() {
        executeCalls += 1;
        throw new Error("transport ended after dispatch");
      },
      async reconcile() {
        throw new Error("first process must not reconcile");
      }
    });
    const { run } = firstStore.beginRun({
      request: "Recover an uncertain dispatch.",
      execution_lock: testExecutionLock({ cwd: fixture, contracts: [firstHandler.contract] })
    }, 30_000);
    runId = run.id;
    turnId = run.turn_id;
    const gateway = new ActionGateway(firstStore, [firstHandler]);

    const unknown = await gateway.invoke({
      run_id: run.id,
      turn_id: run.turn_id,
      invocation_id: "uncertain-call",
      action_name: "synthetic_probe",
      arguments: { value: "recoverable" }
    });
    assert.equal(unknown.status, "outcome_unknown");
    assert.equal(firstStore.inspectRun(run.id)?.unresolved_action_count, 1);
  } finally {
    firstStore.close();
  }

  const reopened = new SqliteRuntimeStore(dbPath);
  try {
    const handler = probeHandler({
      async execute() {
        executeCalls += 1;
        throw new Error("replay is forbidden");
      },
      async reconcile(dispatch) {
        reconcileCalls += 1;
        return {
          outcome: "succeeded",
          summary: "Recovered matching terminal evidence.",
          output: { recovered_value: dispatch.arguments.value ?? null }
        };
      }
    });
    const gateway = new ActionGateway(reopened, [handler]);
    const reconciled = await gateway.reconcileRun(runId);
    assert.equal(reconciled.length, 1);
    assert.equal(reconciled[0]?.status, "completed");
    if (reconciled[0]?.status !== "completed") return;
    assert.equal(reconciled[0].receipt.reconciled, true);
    assert.equal(executeCalls, 1);
    assert.equal(reconcileCalls, 1);

    const repeated = await gateway.invoke({
      run_id: runId,
      turn_id: turnId,
      invocation_id: "uncertain-call",
      action_name: handler.contract.name,
      arguments: { value: "recoverable" }
    });
    assert.equal(repeated.status, "completed");
    assert.equal(executeCalls, 1);
    assert.equal(reopened.inspectRun(runId)?.unresolved_action_count, 0);
    assert.equal(reopened.inspectRun(runId)?.effect_receipt_count, 1);
  } finally {
    reopened.close();
    await rm(fixture, { recursive: true, force: true });
  }
});

test("Action Gateway denies write effects before preparation, reservation, or dispatch", async () => {
  const fixture = await createFixture();
  const store = new SqliteRuntimeStore(join(fixture, "runtime.sqlite"));
  let prepareCalls = 0;
  let executeCalls = 0;
  const handler: ActionHandler = {
    contract: {
      name: "synthetic_write",
      version: "1",
      label: "Synthetic write",
      description: "A test-only write contract that must remain disabled.",
      parameters: Type.Object({}),
      effect_class: "local_write"
    },
    prepare() {
      prepareCalls += 1;
      return {};
    },
    async execute() {
      executeCalls += 1;
      return { outcome: "succeeded", summary: "must not execute", output: {} };
    }
  };
  try {
    const { run } = store.beginRun({
      request: "Keep writes disabled.",
      execution_lock: testExecutionLock({ cwd: fixture, contracts: [handler.contract] })
    }, 30_000);
    const gateway = new ActionGateway(store, [handler]);
    const denied = await gateway.invoke({
      run_id: run.id,
      turn_id: run.turn_id,
      invocation_id: "denied-write",
      action_name: handler.contract.name,
      arguments: {}
    });

    assert.equal(denied.status, "denied");
    assert.equal(prepareCalls, 0);
    assert.equal(executeCalls, 0);
    assert.equal(store.inspectRun(run.id)?.action_count, 0);
  } finally {
    store.close();
    await rm(fixture, { recursive: true, force: true });
  }
});

test("Action Gateway rechecks effect policy before dispatching an existing reserved Action", async () => {
  const fixture = await createFixture();
  const store = new SqliteRuntimeStore(join(fixture, "runtime.sqlite"));
  let prepareCalls = 0;
  let executeCalls = 0;
  const handler: ActionHandler = {
    contract: {
      name: "synthetic_write",
      version: "1",
      label: "Synthetic write",
      description: "A test-only write reservation that must remain paused.",
      parameters: Type.Object({}),
      effect_class: "local_write"
    },
    prepare() {
      prepareCalls += 1;
      return {};
    },
    async execute() {
      executeCalls += 1;
      return { outcome: "succeeded", summary: "must not execute", output: {} };
    }
  };
  try {
    const started = store.beginRun({
      request: "Keep an inherited write reservation paused.",
      execution_lock: testExecutionLock({ cwd: fixture, contracts: [handler.contract] })
    }, 30_000);
    store.reserveAction({
      run_id: started.run.id,
      turn_id: started.run.turn_id,
      invocation_id: "reserved-write",
      action_name: handler.contract.name,
      contract_version: handler.contract.version,
      action_digest: testActionDigest(handler, {}),
      effect_class: handler.contract.effect_class,
      decision_reason: "synthetic inherited decision",
      arguments: {}
    });
    store.pauseRun(started.execution, "Wait for policy-safe reconciliation.");

    const results = await new ActionGateway(store, [handler]).reconcileRun(started.run.id);

    assert.equal(results.length, 1);
    assert.equal(results[0]?.status, "denied");
    assert.equal(prepareCalls, 0);
    assert.equal(executeCalls, 0);
    assert.equal(store.listUnresolvedActions(started.run.id)[0]?.state, "reserved");
    assert.equal(store.inspectRun(started.run.id)?.unresolved_action_count, 1);
    assert.equal(store.inspectRun(started.run.id)?.effect_receipt_count, 0);
  } finally {
    store.close();
    await rm(fixture, { recursive: true, force: true });
  }
});

test("Action Gateway fails closed on reserved Action identity drift before dispatch", async () => {
  const fixture = await createFixture();
  const store = new SqliteRuntimeStore(join(fixture, "runtime.sqlite"));
  let executeCalls = 0;
  const handler = probeHandler({
    async execute() {
      executeCalls += 1;
      return { outcome: "succeeded", summary: "must not execute", output: {} };
    }
  });
  try {
    const started = store.beginRun({
      request: "Reject a corrupted reserved identity.",
      execution_lock: testExecutionLock({ cwd: fixture, contracts: [handler.contract] })
    }, 30_000);
    store.reserveAction({
      run_id: started.run.id,
      turn_id: started.run.turn_id,
      invocation_id: "drifted-reservation",
      action_name: handler.contract.name,
      contract_version: handler.contract.version,
      action_digest: "0".repeat(64),
      effect_class: "local_write",
      decision_reason: "synthetic corrupted decision",
      arguments: {}
    });
    store.pauseRun(started.execution, "Wait for identity-safe reconciliation.");

    await assert.rejects(
      new ActionGateway(store, [handler]).reconcileRun(started.run.id),
      /Action reservation identity mismatch/
    );
    assert.equal(executeCalls, 0);
    assert.equal(store.listUnresolvedActions(started.run.id)[0]?.state, "reserved");
    assert.equal(store.inspectRun(started.run.id)?.effect_receipt_count, 0);
  } finally {
    store.close();
    await rm(fixture, { recursive: true, force: true });
  }
});

function probeHandler(overrides: {
  execute: ActionHandler["execute"];
  reconcile?: ActionHandler["reconcile"];
}, version = "1"): ActionHandler {
  return {
    contract: {
      name: "synthetic_probe",
      version,
      label: "Synthetic probe",
      description: "A synthetic local-read action used only at the Action Gateway interface.",
      parameters: Type.Object({ value: Type.Optional(Type.String()) }, { additionalProperties: false }),
      effect_class: "local_read"
    },
    prepare(argumentsInput: unknown): JsonObject {
      if (!argumentsInput || typeof argumentsInput !== "object" || Array.isArray(argumentsInput)) {
        throw new Error("Synthetic probe arguments must be an object.");
      }
      const value = (argumentsInput as { value?: unknown }).value;
      if (value !== undefined && typeof value !== "string") {
        throw new Error("Synthetic probe value must be a string.");
      }
      return value === undefined ? {} : { value };
    },
    execute: overrides.execute,
    ...(overrides.reconcile ? { reconcile: overrides.reconcile } : {})
  };
}

async function createFixture(): Promise<string> {
  return mkdtemp(join(tmpdir(), "evi-action-gateway-"));
}

function testActionDigest(handler: ActionHandler, arguments_: JsonObject): string {
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
