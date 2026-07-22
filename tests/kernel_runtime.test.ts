import assert from "node:assert/strict";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { once } from "node:events";
import { readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { Type } from "typebox";
import {
  createModels,
  fauxAssistantMessage,
  fauxProvider,
  fauxToolCall
} from "@earendil-works/pi-ai";
import { ActionGateway } from "../packages/kernel/src/action_gateway.js";
import type { ActionHandler } from "../packages/kernel/src/action_types.js";
import { KernelRuntime } from "../packages/kernel/src/kernel_runtime.js";
import { PiAgentHarnessLoopFactory } from "../packages/kernel/src/pi_agent_harness_adapter.js";
import { createRuntimeInspectAction } from "../packages/kernel/src/runtime_inspect_action.js";
import { SqliteRuntimeStore } from "../packages/kernel/src/sqlite_runtime_store.js";
import { testExecutionLock } from "./vnext_test_support.js";

test("vNext executes an ordinary Goal-free Turn through Pi and persists only SQLite state", async () => {
  const fixture = await createFixture();
  const models = createModels();
  const faux = fauxProvider({ provider: `kernel-success-${Date.now()}` });
  models.setProvider(faux.provider);
  faux.setResponses([
    (context) => {
      const userText = context.messages.flatMap((message) =>
        message.role === "user"
          ? message.content.flatMap((part) => part.type === "text" ? [part.text] : [])
          : []
      );
      assert.deepEqual(userText, ["Explain the kernel boundary."]);
      assert.deepEqual(context.tools, []);
      return fauxAssistantMessage("Pi owns the loop; Evi owns state and effects.");
    }
  ]);

  const dbPath = join(fixture, "runtime.sqlite");
  let completedRunId = "";
  const store = new SqliteRuntimeStore(dbPath);
  try {
    const gateway = new ActionGateway(store, []);
    const runtime = new KernelRuntime(store, gateway, new PiAgentHarnessLoopFactory({
      store,
      models,
      model: faux.getModel(),
      cwd: fixture,
      system_prompt: "Answer the request without using tools."
    }));

    const outcome = await runtime.submit({
      request: "Explain the kernel boundary.",
      execution_lock: testExecutionLock({
        cwd: fixture,
        model: faux.getModel(),
        contracts: gateway.contracts()
      })
    });

    completedRunId = outcome.run_id;
    assert.equal(outcome.status, "completed");
    assert.equal(outcome.answer, "Pi owns the loop; Evi owns state and effects.");
    assert.equal(outcome.error, null);
    const inspection = runtime.inspect(outcome.run_id);
    assert.equal(inspection?.goal_id, null);
    assert.equal(inspection?.status, "completed");
    assert.equal(inspection?.event_count, 6);
    assert.equal(inspection?.session_entry_count, 2);
    assert.equal(inspection?.execution_count, 1);
    assert.equal(inspection?.interrupted_execution_count, 0);
    assert.equal(inspection?.model_dispatch_count, 1);
    assert.equal(inspection?.unknown_model_dispatch_count, 0);
  } finally {
    store.close();
  }

  const reopened = new SqliteRuntimeStore(dbPath);
  try {
    assert.equal(reopened.inspectRun(completedRunId)?.status, "completed");
  } finally {
    reopened.close();
  }
  assert.equal((await readdir(fixture)).some((name) => name.endsWith(".jsonl")), false);
  await rm(fixture, { recursive: true, force: true });
});

test("vNext records a terminal failed Run when Pi returns a provider error", async () => {
  const fixture = await createFixture();
  const models = createModels();
  const faux = fauxProvider({ provider: `kernel-failure-${Date.now()}` });
  models.setProvider(faux.provider);
  faux.setResponses([
    fauxAssistantMessage("", { stopReason: "error", errorMessage: "simulated provider failure" })
  ]);
  const store = new SqliteRuntimeStore(join(fixture, "runtime.sqlite"));
  try {
    const gateway = new ActionGateway(store, []);
    const runtime = new KernelRuntime(store, gateway, new PiAgentHarnessLoopFactory({
      store,
      models,
      model: faux.getModel(),
      cwd: fixture
    }));

    const outcome = await runtime.submit({
      request: "This request should fail.",
      execution_lock: testExecutionLock({
        cwd: fixture,
        model: faux.getModel(),
        contracts: gateway.contracts()
      })
    });

    assert.equal(outcome.status, "failed");
    assert.match(outcome.error ?? "", /simulated provider failure/);
    assert.equal(runtime.inspect(outcome.run_id)?.event_count, 6);
  } finally {
    store.close();
    await rm(fixture, { recursive: true, force: true });
  }
});

test("vNext routes a Pi tool call through Action Gateway and records one Effect Receipt", async () => {
  const fixture = await createFixture();
  const models = createModels();
  const faux = fauxProvider({ provider: `kernel-action-${Date.now()}` });
  models.setProvider(faux.provider);
  faux.setResponses([
    (context) => {
      assert.deepEqual(context.tools.map((tool) => tool.name), ["runtime_inspect"]);
      return fauxAssistantMessage(
        fauxToolCall("runtime_inspect", {}, { id: "inspect-call-1" }),
        { stopReason: "toolUse" }
      );
    },
    (context) => {
      const toolResult = context.messages.find((message) => message.role === "toolResult");
      assert.ok(toolResult && toolResult.role === "toolResult");
      const text = toolResult.content
        .filter((part) => part.type === "text")
        .map((part) => part.text)
        .join("");
      assert.match(text, /bounded runtime state was inspected locally/);
      return fauxAssistantMessage("The current Run was inspected through the Action Gateway.");
    }
  ]);
  const store = new SqliteRuntimeStore(join(fixture, "runtime.sqlite"));
  try {
    const gateway = new ActionGateway(store, [createRuntimeInspectAction(store)]);
    const runtime = new KernelRuntime(store, gateway, new PiAgentHarnessLoopFactory({
      store,
      models,
      model: faux.getModel(),
      cwd: fixture
    }));

    const outcome = await runtime.submit({
      request: "Inspect this Run once.",
      execution_lock: testExecutionLock({
        cwd: fixture,
        model: faux.getModel(),
        contracts: gateway.contracts()
      })
    });

    assert.equal(outcome.status, "completed");
    assert.equal(outcome.answer, "The current Run was inspected through the Action Gateway.");
    const inspection = runtime.inspect(outcome.run_id);
    assert.equal(inspection?.action_count, 1);
    assert.equal(inspection?.unresolved_action_count, 0);
    assert.equal(inspection?.effect_receipt_count, 1);
  } finally {
    store.close();
    await rm(fixture, { recursive: true, force: true });
  }
});

test("vNext pauses a Run whose Action outcome remains unknown", async () => {
  const fixture = await createFixture();
  const models = createModels();
  const faux = fauxProvider({ provider: `kernel-action-unknown-${Date.now()}` });
  models.setProvider(faux.provider);
  faux.setResponses([
    fauxAssistantMessage(
      fauxToolCall("unstable_probe", {}, { id: "unstable-call-1" }),
      { stopReason: "toolUse" }
    ),
    fauxAssistantMessage("The model cannot turn unknown effect evidence into completion.")
  ]);
  let executeCalls = 0;
  const handler: ActionHandler = {
    contract: {
      name: "unstable_probe",
      version: "1",
      label: "Unstable probe",
      description: "A synthetic probe that simulates losing the result after dispatch.",
      parameters: Type.Object({}, { additionalProperties: false }),
      effect_class: "local_read"
    },
    prepare() {
      return {};
    },
    async execute() {
      executeCalls += 1;
      throw new Error("simulated result loss after dispatch");
    },
    async reconcile() {
      return null;
    }
  };
  const store = new SqliteRuntimeStore(join(fixture, "runtime.sqlite"));
  try {
    const gateway = new ActionGateway(store, [handler]);
    const runtime = new KernelRuntime(store, gateway, new PiAgentHarnessLoopFactory({
      store,
      models,
      model: faux.getModel(),
      cwd: fixture
    }));

    const result = await runtime.submit({
      request: "Do not complete over unknown action evidence.",
      execution_lock: testExecutionLock({
        cwd: fixture,
        model: faux.getModel(),
        contracts: gateway.contracts()
      })
    });

    assert.equal(result.status, "paused");
    assert.equal(result.answer, null);
    assert.match(result.error ?? "", /Action outcome is unknown/);
    assert.equal(runtime.inspect(result.run_id)?.unresolved_action_count, 1);
    assert.equal(runtime.inspect(result.run_id)?.effect_receipt_count, 0);
    assert.equal(executeCalls, 1);
    const recovery = await gateway.reconcileRun(result.run_id);
    assert.equal(recovery[0]?.status, "outcome_unknown");
    assert.equal(executeCalls, 1);
    const stillPaused = await runtime.continueRun(result.run_id);
    assert.equal(stillPaused.status, "paused");
    assert.equal(runtime.inspect(result.run_id)?.continuation_count, 0);
    assert.equal(executeCalls, 1);
  } finally {
    store.close();
    await rm(fixture, { recursive: true, force: true });
  }
});

test("vNext continues the same Run after restart and terminal Action reconciliation", async () => {
  const fixture = await createFixture();
  const dbPath = join(fixture, "runtime.sqlite");
  const request = "Recover the uncertain probe and finish this same Run.";
  let runId = "";
  let sessionId = "";
  let executeCalls = 0;
  let reconcileCalls = 0;

  const firstModels = createModels();
  const firstFaux = fauxProvider({
    provider: "kernel-continuation-provider",
    api: "kernel-continuation-api"
  });
  firstModels.setProvider(firstFaux.provider);
  firstFaux.setResponses([
    fauxAssistantMessage(
      fauxToolCall("recoverable_probe", {}, { id: "recoverable-call-1" }),
      { stopReason: "toolUse" }
    ),
    fauxAssistantMessage("The probe outcome is still unknown, so this answer must not complete the Run.")
  ]);
  const firstHandler = recoverableProbeHandler({
    async execute() {
      executeCalls += 1;
      throw new Error("connection ended after the probe was dispatched");
    },
    async reconcile() {
      return null;
    }
  });
  const firstStore = new SqliteRuntimeStore(dbPath);
  try {
    const gateway = new ActionGateway(firstStore, [firstHandler]);
    const runtime = new KernelRuntime(firstStore, gateway, new PiAgentHarnessLoopFactory({
      store: firstStore,
      models: firstModels,
      model: firstFaux.getModel(),
      cwd: fixture
    }));
    const paused = await runtime.submit({
      request,
      execution_lock: testExecutionLock({
        cwd: fixture,
        model: firstFaux.getModel(),
        contracts: gateway.contracts()
      })
    });
    assert.equal(paused.status, "paused");
    runId = paused.run_id;
    sessionId = paused.session_id;
    assert.equal(runtime.inspect(runId)?.continuation_count, 0);
  } finally {
    firstStore.close();
  }

  const recoveryModels = createModels();
  const recoveryFaux = fauxProvider({
    provider: "kernel-continuation-provider",
    api: "kernel-continuation-api"
  });
  recoveryModels.setProvider(recoveryFaux.provider);
  recoveryFaux.setResponses([
    (context) => {
      assert.deepEqual(context.tools.map((tool) => tool.name), ["recoverable_probe"]);
      const userText = context.messages
        .filter((message) => message.role === "user")
        .flatMap((message) => message.content)
        .filter((part) => part.type === "text")
        .map((part) => part.text);
      assert.equal(userText[0], request);
      assert.match(userText.at(-1) ?? "", /runtime_action_recovery_evidence/);
      assert.match(userText.at(-1) ?? "", /Recovered terminal evidence for the probe/);
      assert.match(userText.at(-1) ?? "", /"recovered":true/);
      const unknownResult = context.messages.find(
        (message) => message.role === "toolResult" && message.toolCallId === "recoverable-call-1"
      );
      assert.ok(unknownResult && unknownResult.role === "toolResult");
      assert.equal(unknownResult.isError, true);
      return fauxAssistantMessage("The reconciled receipt closes the probe, and the original Run is complete.");
    }
  ]);
  const recoveryHandler = recoverableProbeHandler({
    async execute() {
      executeCalls += 1;
      throw new Error("the original Action must not be replayed");
    },
    async reconcile() {
      reconcileCalls += 1;
      return {
        outcome: "succeeded",
        summary: "Recovered terminal evidence for the probe.",
        output: { recovered: true }
      };
    }
  });
  const recoveryStore = new SqliteRuntimeStore(dbPath);
  try {
    const gateway = new ActionGateway(recoveryStore, [recoveryHandler]);
    const runtime = new KernelRuntime(recoveryStore, gateway, new PiAgentHarnessLoopFactory({
      store: recoveryStore,
      models: recoveryModels,
      model: recoveryFaux.getModel(),
      cwd: fixture
    }));

    const completed = await runtime.continueRun(runId);

    assert.equal(completed.status, "completed");
    assert.equal(completed.run_id, runId);
    assert.equal(completed.session_id, sessionId);
    assert.equal(
      completed.answer,
      "The reconciled receipt closes the probe, and the original Run is complete."
    );
    assert.equal(executeCalls, 1);
    assert.equal(reconcileCalls, 1);
    assert.equal(runtime.inspect(runId)?.unresolved_action_count, 0);
    assert.equal(runtime.inspect(runId)?.effect_receipt_count, 1);
    assert.equal(runtime.inspect(runId)?.continuation_count, 1);
    await assert.rejects(runtime.continueRun(runId), /Run cannot continue/);
  } finally {
    recoveryStore.close();
    await rm(fixture, { recursive: true, force: true });
  }
});

test("vNext recovers the same Run after a provider process is killed with an unsettled dispatch", async () => {
  const fixture = await createFixture();
  const dbPath = join(fixture, "runtime.sqlite");
  const child = spawn(
    process.execPath,
    [
      "--import",
      "tsx",
      join(process.cwd(), "tests/fixtures/vnext_dispatch_crash_child.ts"),
      dbPath,
      fixture
    ],
    { stdio: ["ignore", "pipe", "pipe"] }
  );
  try {
    await waitForChildMarker(child, "PROVIDER_ENTERED", 10_000);
    await delay(450);
    const active = new DatabaseSync(dbPath);
    let runId = "";
    let sessionId = "";
    try {
      const run = active.prepare("SELECT id, session_id, status FROM runs LIMIT 1").get() as {
        id: string;
        session_id: string;
        status: string;
      };
      const dispatch = active.prepare("SELECT state FROM model_dispatches LIMIT 1").get() as {
        state: string;
      };
      const execution = active.prepare(
        "SELECT lease_expires_at FROM run_executions WHERE state = 'active' LIMIT 1"
      ).get() as { lease_expires_at: string };
      runId = run.id;
      sessionId = run.session_id;
      assert.equal(run.status, "running");
      assert.equal(dispatch.state, "dispatching");
      assert.ok(execution.lease_expires_at > new Date().toISOString());
    } finally {
      active.close();
    }

    assert.equal(child.kill("SIGKILL"), true);
    await once(child, "exit");
    await delay(500);

    const recoveryModels = createModels();
    const recoveryFaux = fauxProvider({
      provider: "kernel-crash-provider",
      api: "kernel-crash-api"
    });
    recoveryModels.setProvider(recoveryFaux.provider);
    recoveryFaux.setResponses([
      (context) => {
        const userText = context.messages
          .filter((message) => message.role === "user")
          .flatMap((message) => message.content)
          .filter((part) => part.type === "text")
          .map((part) => part.text);
        assert.equal(userText[0], "Finish this Run after surviving a provider-process crash.");
        assert.equal(userText.length, 2);
        assert.match(userText[1] ?? "", /runtime_model_dispatch_recovery_evidence/);
        assert.match(userText[1] ?? "", /outcome_unknown/);
        return fauxAssistantMessage("The same Run recovered through a new, evidenced model dispatch.");
      }
    ]);
    const recoveryStore = new SqliteRuntimeStore(dbPath);
    try {
      const gateway = new ActionGateway(recoveryStore, []);
      const runtime = new KernelRuntime(
        recoveryStore,
        gateway,
        new PiAgentHarnessLoopFactory({
          store: recoveryStore,
          models: recoveryModels,
          model: recoveryFaux.getModel(),
          cwd: fixture
        }),
        { execution_lease_ms: 300 }
      );

      const completed = await runtime.continueRun(runId);

      assert.equal(completed.status, "completed");
      assert.equal(completed.run_id, runId);
      assert.equal(completed.session_id, sessionId);
      assert.equal(
        completed.answer,
        "The same Run recovered through a new, evidenced model dispatch."
      );
      const inspection = runtime.inspect(runId);
      assert.equal(inspection?.execution_count, 2);
      assert.equal(inspection?.interrupted_execution_count, 1);
      assert.equal(inspection?.model_dispatch_count, 2);
      assert.equal(inspection?.unknown_model_dispatch_count, 1);
      assert.equal(inspection?.continuation_count, 1);
      assert.equal(inspection?.session_entry_count, 3);
    } finally {
      recoveryStore.close();
    }
  } finally {
    if (child.exitCode === null && child.signalCode === null) {
      child.kill("SIGKILL");
      await once(child, "exit");
    }
    await rm(fixture, { recursive: true, force: true });
  }
});

test("vNext keeps provider-internal response retries inside one model dispatch", async () => {
  const fixture = await createFixture();
  const store = new SqliteRuntimeStore(join(fixture, "runtime.sqlite"));
  try {
    const { run, execution } = store.beginRun({
      request: "Observe one retried provider request.",
      execution_lock: testExecutionLock({
        cwd: fixture,
        provider: "retrying-provider",
        model_id: "retrying-model"
      })
    }, 30_000);
    const dispatch = store.startModelDispatch(execution, {
      provider: "retrying-provider",
      model: "retrying-model"
    });

    store.observeModelResponse(execution, dispatch.id, 429);
    const observed = store.observeModelResponse(execution, dispatch.id, 200);
    assert.equal(observed.state, "response_observed");
    assert.equal(observed.response_status, 200);
    store.settleModelDispatch(execution, dispatch.id, {
      stop_reason: "stop",
      message_digest: "a".repeat(64)
    });
    store.completeRun(execution, "One logical dispatch settled after its retry observations.");

    assert.equal(store.inspectRun(run.id)?.status, "completed");
    assert.equal(store.inspectRun(run.id)?.model_dispatch_count, 1);
    assert.equal(store.inspectRun(run.id)?.unknown_model_dispatch_count, 0);
  } finally {
    store.close();
    await rm(fixture, { recursive: true, force: true });
  }
});

test("vNext refuses a second continuation owner while the Run Execution lease is active", async () => {
  const fixture = await createFixture();
  const store = new SqliteRuntimeStore(join(fixture, "runtime.sqlite"));
  try {
    const { run } = store.beginRun({
      request: "Keep exactly one active loop owner.",
      execution_lock: testExecutionLock({ cwd: fixture })
    }, 30_000);
    const gateway = new ActionGateway(store, []);
    const runtime = new KernelRuntime(store, gateway, {
      create() {
        throw new Error("A second Agent Loop must not be created.");
      }
    });

    await assert.rejects(runtime.continueRun(run.id), /Run execution lease is still active/);
    assert.equal(runtime.inspect(run.id)?.status, "running");
    assert.equal(runtime.inspect(run.id)?.execution_count, 1);
    assert.equal(runtime.inspect(run.id)?.interrupted_execution_count, 0);
  } finally {
    store.close();
    await rm(fixture, { recursive: true, force: true });
  }
});

for (const crashPoint of [
  "assistant_persisted",
  "reservation_persisted",
  "receipt_persisted",
  "tool_result_persisted",
  "final_assistant_persisted"
] as const) {
  test(`vNext recovers the exact Pi protocol after SIGKILL at ${crashPoint}`, async () => {
    const recoverySecret = "synthetic-protocol-recovery-secret";
    const fixture = await createFixture();
    const dbPath = join(fixture, "runtime.sqlite");
    const child = spawn(
      process.execPath,
      [
        "--import",
        "tsx",
        join(process.cwd(), "tests/fixtures/vnext_tool_protocol_crash_child.ts"),
        dbPath,
        fixture,
        crashPoint
      ],
      { stdio: ["ignore", "pipe", "pipe"] }
    );
    try {
      await waitForChildMarker(child, `CRASH_POINT:${crashPoint}`, 10_000);
      const active = new DatabaseSync(dbPath);
      let runId = "";
      let sessionId = "";
      try {
        const run = active.prepare("SELECT id, session_id, status FROM runs LIMIT 1").get() as {
          id: string;
          session_id: string;
          status: string;
        };
        runId = run.id;
        sessionId = run.session_id;
        assert.equal(run.status, "running");
        const action = active.prepare("SELECT state FROM action_reservations LIMIT 1").get() as
          | { state: string }
          | undefined;
        const receiptCount = Number((active.prepare(
          "SELECT COUNT(*) AS count FROM effect_receipts"
        ).get() as { count: number }).count);
        const messages = (active.prepare(
          "SELECT entry_json FROM pi_session_entries WHERE type = 'message' ORDER BY seq ASC"
        ).all() as unknown as Array<{ entry_json: string }>).map((row) => JSON.parse(row.entry_json));
        const toolResultCount = messages.filter(
          (entry) => entry.message?.role === "toolResult"
        ).length;
        if (crashPoint === "assistant_persisted") {
          assert.equal(action, undefined);
          assert.equal(receiptCount, 0);
          assert.equal(toolResultCount, 0);
        } else if (crashPoint === "reservation_persisted") {
          assert.equal(action?.state, "reserved");
          assert.equal(receiptCount, 0);
          assert.equal(toolResultCount, 0);
        } else if (crashPoint === "receipt_persisted") {
          assert.equal(action?.state, "terminal");
          assert.equal(receiptCount, 1);
          assert.equal(toolResultCount, 0);
        } else if (crashPoint === "tool_result_persisted") {
          assert.equal(action?.state, "terminal");
          assert.equal(receiptCount, 1);
          assert.equal(toolResultCount, 1);
        } else {
          assert.equal(action, undefined);
          assert.equal(receiptCount, 0);
          assert.equal(toolResultCount, 0);
        }
      } finally {
        active.close();
      }

      assert.equal(child.kill("SIGKILL"), true);
      await once(child, "exit");
      await delay(500);

      const recoveryModels = createModels();
      const recoveryFaux = fauxProvider({
        provider: "kernel-tool-protocol-provider",
        api: "kernel-tool-protocol-api"
      });
      recoveryModels.setProvider(recoveryFaux.provider);
      let recoveryProviderCalls = 0;
      recoveryFaux.setResponses(crashPoint === "final_assistant_persisted"
        ? [() => {
            recoveryProviderCalls += 1;
            throw new Error("A persisted terminal assistant answer must not call the provider again.");
          }]
        : [(context) => {
            recoveryProviderCalls += 1;
            const toolResults = context.messages.filter(
              (message) => message.role === "toolResult"
                && message.toolCallId === "protocol-recovery-call"
            );
            assert.equal(toolResults.length, 1);
            assert.equal(toolResults[0]?.isError, false);
            const userText = context.messages
              .filter((message) => message.role === "user")
              .flatMap((message) => message.content)
              .filter((part) => part.type === "text")
              .map((part) => part.text);
            assert.equal(userText[0], "Recover this exact tool protocol without replay.");
            assert.match(
              userText.at(-1) ?? "",
              /runtime_(model_dispatch|action|tool_protocol)_recovery_evidence/
            );
            const answer = `Recovered ${crashPoint} without replaying a terminal Action.`;
            return fauxAssistantMessage(
              crashPoint === "tool_result_persisted"
                ? `${answer} Provider reflected ${recoverySecret}.`
                : answer
            );
          }]);
      const recoveryStore = new SqliteRuntimeStore(dbPath);
      try {
        const gateway = new ActionGateway(recoveryStore, [createRuntimeInspectAction(recoveryStore)]);
        const runtime = new KernelRuntime(
          recoveryStore,
          gateway,
          new PiAgentHarnessLoopFactory({
            store: recoveryStore,
            models: recoveryModels,
            model: recoveryFaux.getModel(),
            cwd: fixture,
            redact_text: (value) => value.replaceAll(recoverySecret, "[redacted]")
          }),
          { execution_lease_ms: 300 }
        );

        const completed = await runtime.continueRun(runId);

        assert.equal(completed.status, "completed");
        assert.equal(completed.run_id, runId);
        assert.equal(completed.session_id, sessionId);
        assert.equal(
          completed.answer,
          crashPoint === "final_assistant_persisted"
            ? "The persisted assistant answer survived without another provider call."
            : crashPoint === "tool_result_persisted"
              ? "Recovered tool_result_persisted without replaying a terminal Action. Provider reflected [redacted]."
            : `Recovered ${crashPoint} without replaying a terminal Action.`
        );
        assert.equal(recoveryProviderCalls, crashPoint === "final_assistant_persisted" ? 0 : 1);
        const inspection = runtime.inspect(runId);
        assert.doesNotMatch(JSON.stringify(inspection), new RegExp(recoverySecret));
        assert.equal(inspection?.execution_count, 2);
        assert.equal(inspection?.interrupted_execution_count, 1);
        assert.equal(inspection?.continuation_count, 1);
        assert.equal(inspection?.action_count, crashPoint === "final_assistant_persisted" ? 0 : 1);
        assert.equal(inspection?.effect_receipt_count, crashPoint === "final_assistant_persisted" ? 0 : 1);
        const messages = recoveryStore.getPiSessionEntries(sessionId)
          .map((entry) => entry as { type?: string; message?: { role?: string; toolCallId?: string } });
        assert.doesNotMatch(JSON.stringify(messages), new RegExp(recoverySecret));
        if (crashPoint === "tool_result_persisted") {
          assert.match(JSON.stringify(messages), /\[redacted\]/);
        }
        assert.equal(messages.filter(
          (entry) => entry.type === "message"
            && entry.message?.role === "toolResult"
            && entry.message.toolCallId === "protocol-recovery-call"
        ).length, crashPoint === "final_assistant_persisted" ? 0 : 1);

        const inspect = new DatabaseSync(dbPath);
        try {
          const executions = inspect.prepare(`
            SELECT kind, recovery_of_execution_id, session_start_seq
            FROM run_executions
            ORDER BY ordinal ASC
          `).all() as unknown as Array<{
            kind: string;
            recovery_of_execution_id: string | null;
            session_start_seq: number;
          }>;
          assert.equal(executions.length, 2);
          assert.equal(executions[0]?.recovery_of_execution_id, null);
          assert.ok(executions[1]?.recovery_of_execution_id);
          assert.ok((executions[1]?.session_start_seq ?? 0) >= (executions[0]?.session_start_seq ?? 0));
          const expectedKind = crashPoint === "reservation_persisted"
            ? "action_continuation"
            : crashPoint === "receipt_persisted" || crashPoint === "tool_result_persisted"
              ? "protocol_recovery"
              : "dispatch_recovery";
          assert.equal(executions[1]?.kind, expectedKind);
        } finally {
          inspect.close();
        }
      } finally {
        recoveryStore.close();
      }
      for (const name of await readdir(fixture)) {
        const contents = await readFile(join(fixture, name));
        assert.equal(
          contents.includes(Buffer.from(recoverySecret)),
          false,
          `${name} persisted the raw protocol-recovery credential`
        );
      }
    } finally {
      if (child.exitCode === null && child.signalCode === null) {
        child.kill("SIGKILL");
        await once(child, "exit");
      }
      await rm(fixture, { recursive: true, force: true });
    }
  });
}

test("vNext records a terminal failed Run when Pi returns no text", async () => {
  const fixture = await createFixture();
  const models = createModels();
  const faux = fauxProvider({ provider: `kernel-empty-${Date.now()}` });
  models.setProvider(faux.provider);
  faux.setResponses([fauxAssistantMessage("")]);
  const store = new SqliteRuntimeStore(join(fixture, "runtime.sqlite"));
  try {
    const gateway = new ActionGateway(store, []);
    const runtime = new KernelRuntime(store, gateway, new PiAgentHarnessLoopFactory({
      store,
      models,
      model: faux.getModel(),
      cwd: fixture
    }));

    const outcome = await runtime.submit({
      request: "Do not leave this Run hanging.",
      execution_lock: testExecutionLock({
        cwd: fixture,
        model: faux.getModel(),
        contracts: gateway.contracts()
      })
    });

    assert.equal(outcome.status, "failed");
    assert.equal(outcome.error, "Pi AgentHarness returned no text response.");
  } finally {
    store.close();
    await rm(fixture, { recursive: true, force: true });
  }
});

function recoverableProbeHandler(overrides: {
  execute: ActionHandler["execute"];
  reconcile: NonNullable<ActionHandler["reconcile"]>;
}): ActionHandler {
  return {
    contract: {
      name: "recoverable_probe",
      version: "1",
      label: "Recoverable probe",
      description: "A synthetic local-read probe used to verify Run continuation after reconciliation.",
      parameters: Type.Object({}, { additionalProperties: false }),
      effect_class: "local_read"
    },
    prepare() {
      return {};
    },
    execute: overrides.execute,
    reconcile: overrides.reconcile
  };
}

test("vNext leaves no running Run when the loop adapter cannot be constructed", async () => {
  const fixture = await createFixture();
  const store = new SqliteRuntimeStore(join(fixture, "runtime.sqlite"));
  try {
    const gateway = new ActionGateway(store, []);
    const runtime = new KernelRuntime(store, gateway, {
      create() {
        throw new Error("adapter construction failed");
      }
    });

    const outcome = await runtime.submit({
      request: "Record adapter failure.",
      execution_lock: testExecutionLock({
        cwd: fixture,
        contracts: gateway.contracts()
      })
    });

    assert.equal(outcome.status, "failed");
    assert.equal(outcome.error, "adapter construction failed");
    assert.equal(runtime.inspect(outcome.run_id)?.session_entry_count, 0);
  } finally {
    store.close();
    await rm(fixture, { recursive: true, force: true });
  }
});

test("only the Pi adapter implementation imports Pi packages inside the vNext kernel", async () => {
  const root = join(process.cwd(), "packages/kernel/src");
  for (const name of await readdir(root)) {
    if (!name.endsWith(".ts")
      || name === "pi_agent_harness_adapter.ts"
      || name === "pi_protocol_recovery.ts") continue;
    const source = await readFile(join(root, name), "utf8");
    assert.equal(source.includes("@earendil-works/"), false, `${name} crosses the Pi adapter boundary`);
  }
});

test("vNext rejects pre-gateway and unknown SQLite schemas before creating runtime tables", async () => {
  const fixture = await createFixture();
  try {
    for (const version of ["1", "2", "3", "5", "6", "999"]) {
      const dbPath = join(fixture, `runtime-${version}.sqlite`);
      const seed = new DatabaseSync(dbPath);
      seed.exec(`
        CREATE TABLE schema_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
        INSERT INTO schema_meta (key, value) VALUES ('schema_version', '${version}');
      `);
      seed.close();
      const before = await readFile(dbPath);
      assert.throws(
        () => new SqliteRuntimeStore(dbPath),
        new RegExp(`Unsupported vNext runtime schema version: ${version}`)
      );
      const inspect = new DatabaseSync(dbPath);
      try {
        assert.equal(inspect.prepare("PRAGMA journal_mode").get()?.journal_mode, "delete");
        const runtimeTable = inspect.prepare(
          "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'runs'"
        ).get();
        assert.equal(runtimeTable, undefined);
      } finally {
        inspect.close();
      }
      assert.deepEqual(await readFile(dbPath), before);
    }
  } finally {
    await rm(fixture, { recursive: true, force: true });
  }
});

async function createFixture(): Promise<string> {
  const { mkdtemp } = await import("node:fs/promises");
  return mkdtemp(join(tmpdir(), "evi-vnext-kernel-"));
}

async function waitForChildMarker(
  child: ChildProcessWithoutNullStreams,
  marker: string,
  timeoutMs: number
): Promise<void> {
  let stdout = "";
  let stderr = "";
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk: string) => {
    stdout += chunk;
  });
  child.stderr.on("data", (chunk: string) => {
    stderr += chunk;
  });
  const startedAt = Date.now();
  while (!stdout.includes(marker)) {
    if (child.exitCode !== null || child.signalCode !== null) {
      throw new Error(`Crash fixture exited before ${marker}: ${stderr}`);
    }
    if (Date.now() - startedAt > timeoutMs) {
      throw new Error(`Crash fixture did not emit ${marker}: ${stderr}`);
    }
    await delay(20);
  }
}

async function delay(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}
