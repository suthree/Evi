import assert from "node:assert/strict";
import { readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { createModels, fauxAssistantMessage, fauxProvider } from "@earendil-works/pi-ai";
import { KernelRuntime } from "../packages/kernel/src/kernel_runtime.js";
import { PiAgentHarnessLoopFactory } from "../packages/kernel/src/pi_agent_harness_adapter.js";
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

test("vNext rejects an unknown SQLite schema before creating runtime tables", async () => {
  const fixture = await createFixture();
  const dbPath = join(fixture, "runtime.sqlite");
  const seed = new DatabaseSync(dbPath);
  seed.exec(`
    CREATE TABLE schema_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    INSERT INTO schema_meta (key, value) VALUES ('schema_version', '999');
  `);
  seed.close();

  try {
    assert.throws(
      () => new SqliteRuntimeStore(dbPath),
      /Unsupported vNext runtime schema version: 999/
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
  } finally {
    await rm(fixture, { recursive: true, force: true });
  }
});

async function createFixture(): Promise<string> {
  const { mkdtemp } = await import("node:fs/promises");
  return mkdtemp(join(tmpdir(), "evi-vnext-kernel-"));
}
