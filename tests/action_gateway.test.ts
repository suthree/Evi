import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { Type } from "typebox";
import { ActionGateway } from "../packages/kernel/src/action_gateway.js";
import type { ActionHandler, JsonObject } from "../packages/kernel/src/action_types.js";
import { SqliteRuntimeStore } from "../packages/kernel/src/sqlite_runtime_store.js";

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
    const { run } = store.beginRun({ request: "Exercise one reserved action." }, 30_000);
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
    const { run } = store.beginRun({ request: "Reject a changed action digest." }, 30_000);
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
    const { run } = store.beginRun({ request: "Bind one invocation to one contract version." }, 30_000);
    const firstGateway = new ActionGateway(store, [probeHandler({ execute }, "1")]);
    const invocation = {
      run_id: run.id,
      turn_id: run.turn_id,
      invocation_id: "versioned-call",
      action_name: "synthetic_probe",
      arguments: {}
    };
    await firstGateway.invoke(invocation);

    const upgradedGateway = new ActionGateway(store, [probeHandler({ execute }, "2")]);
    await assert.rejects(
      upgradedGateway.invoke(invocation),
      /Action invocation identity mismatch/
    );
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
    const { run } = firstStore.beginRun({ request: "Recover an uncertain dispatch." }, 30_000);
    runId = run.id;
    turnId = run.turn_id;
    const gateway = new ActionGateway(firstStore, [probeHandler({
      async execute() {
        executeCalls += 1;
        throw new Error("transport ended after dispatch");
      },
      async reconcile() {
        throw new Error("first process must not reconcile");
      }
    })]);

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
    const { run } = store.beginRun({ request: "Keep writes disabled." }, 30_000);
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
