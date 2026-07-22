import assert from "node:assert/strict";
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
    const runtime = new KernelRuntime(store, new PiAgentHarnessLoopFactory({
      store,
      models,
      model: faux.getModel(),
      cwd: fixture,
      system_prompt: "Answer the request without using tools."
    }));

    const outcome = await runtime.submit({ request: "Explain the kernel boundary." });

    completedRunId = outcome.run_id;
    assert.equal(outcome.status, "completed");
    assert.equal(outcome.answer, "Pi owns the loop; Evi owns state and effects.");
    assert.equal(outcome.error, null);
    const inspection = runtime.inspect(outcome.run_id);
    assert.equal(inspection?.goal_id, null);
    assert.equal(inspection?.status, "completed");
    assert.equal(inspection?.event_count, 2);
    assert.equal(inspection?.session_entry_count, 2);
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
    const runtime = new KernelRuntime(store, new PiAgentHarnessLoopFactory({
      store,
      models,
      model: faux.getModel(),
      cwd: fixture
    }));

    const outcome = await runtime.submit({ request: "This request should fail." });

    assert.equal(outcome.status, "failed");
    assert.match(outcome.error ?? "", /simulated provider failure/);
    assert.equal(runtime.inspect(outcome.run_id)?.event_count, 2);
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
    const runtime = new KernelRuntime(store, new PiAgentHarnessLoopFactory({
      store,
      models,
      model: faux.getModel(),
      cwd: fixture,
      action_gateway: gateway
    }));

    const outcome = await runtime.submit({ request: "Inspect this Run once." });

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
    const runtime = new KernelRuntime(store, new PiAgentHarnessLoopFactory({
      store,
      models,
      model: faux.getModel(),
      cwd: fixture,
      action_gateway: gateway
    }));

    const result = await runtime.submit({ request: "Do not complete over unknown action evidence." });

    assert.equal(result.status, "paused");
    assert.equal(result.answer, null);
    assert.match(result.error ?? "", /Action outcome is unknown/);
    assert.equal(runtime.inspect(result.run_id)?.unresolved_action_count, 1);
    assert.equal(runtime.inspect(result.run_id)?.effect_receipt_count, 0);
    assert.equal(executeCalls, 1);
    const recovery = await gateway.reconcileRun(result.run_id);
    assert.equal(recovery[0]?.status, "outcome_unknown");
    assert.equal(executeCalls, 1);
  } finally {
    store.close();
    await rm(fixture, { recursive: true, force: true });
  }
});

test("vNext records a terminal failed Run when Pi returns no text", async () => {
  const fixture = await createFixture();
  const models = createModels();
  const faux = fauxProvider({ provider: `kernel-empty-${Date.now()}` });
  models.setProvider(faux.provider);
  faux.setResponses([fauxAssistantMessage("")]);
  const store = new SqliteRuntimeStore(join(fixture, "runtime.sqlite"));
  try {
    const runtime = new KernelRuntime(store, new PiAgentHarnessLoopFactory({
      store,
      models,
      model: faux.getModel(),
      cwd: fixture
    }));

    const outcome = await runtime.submit({ request: "Do not leave this Run hanging." });

    assert.equal(outcome.status, "failed");
    assert.equal(outcome.error, "Pi AgentHarness returned no text response.");
  } finally {
    store.close();
    await rm(fixture, { recursive: true, force: true });
  }
});

test("vNext leaves no running Run when the loop adapter cannot be constructed", async () => {
  const fixture = await createFixture();
  const store = new SqliteRuntimeStore(join(fixture, "runtime.sqlite"));
  try {
    const runtime = new KernelRuntime(store, {
      create() {
        throw new Error("adapter construction failed");
      }
    });

    const outcome = await runtime.submit({ request: "Record adapter failure." });

    assert.equal(outcome.status, "failed");
    assert.equal(outcome.error, "adapter construction failed");
    assert.equal(runtime.inspect(outcome.run_id)?.session_entry_count, 0);
  } finally {
    store.close();
    await rm(fixture, { recursive: true, force: true });
  }
});

test("only the Pi adapter imports Pi packages inside the vNext kernel", async () => {
  const root = join(process.cwd(), "packages/kernel/src");
  for (const name of await readdir(root)) {
    if (!name.endsWith(".ts") || name === "pi_agent_harness_adapter.ts") continue;
    const source = await readFile(join(root, name), "utf8");
    assert.equal(source.includes("@earendil-works/"), false, `${name} crosses the Pi adapter boundary`);
  }
});

test("vNext rejects pre-gateway and unknown SQLite schemas before creating runtime tables", async () => {
  const fixture = await createFixture();
  try {
    for (const version of ["1", "999"]) {
      const dbPath = join(fixture, `runtime-${version}.sqlite`);
      const seed = new DatabaseSync(dbPath);
      seed.exec(`
        CREATE TABLE schema_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
        INSERT INTO schema_meta (key, value) VALUES ('schema_version', '${version}');
      `);
      seed.close();
      assert.throws(
        () => new SqliteRuntimeStore(dbPath),
        new RegExp(`Unsupported vNext runtime schema version: ${version}`)
      );
      const inspect = new DatabaseSync(dbPath);
      try {
        const runtimeTable = inspect.prepare(
          "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'runs'"
        ).get();
        assert.equal(runtimeTable, undefined);
      } finally {
        inspect.close();
      }
    }
  } finally {
    await rm(fixture, { recursive: true, force: true });
  }
});

async function createFixture(): Promise<string> {
  const { mkdtemp } = await import("node:fs/promises");
  return mkdtemp(join(tmpdir(), "evi-vnext-kernel-"));
}
