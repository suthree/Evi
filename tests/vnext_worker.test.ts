import assert from "node:assert/strict";
import { execFile, spawn } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:http";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { setTimeout as delay } from "node:timers/promises";
import test from "node:test";
import { promisify } from "node:util";
import { SqliteRuntimeStore } from "../packages/kernel/src/index.js";
import {
  executeVNextRun,
  type ResolvedVNextModel,
  type VNextRunEnvelope
} from "../apps/cli/src/vnext_run.js";
import { testLegacyConfigPiAdapter } from "./vnext_test_support.js";
import {
  VNEXT_WORKER_MARKER,
  type VNextWorkerEnvelope
} from "../apps/cli/src/vnext_worker.js";

const execFileAsync = promisify(execFile);

test("stable vNext runs one discussion Worker in a separate CLI process and wakes the same parent Run", async () => {
  const fixture = await mkdtemp(join(tmpdir(), "evi-vnext-worker-process-"));
  const stateRoot = join(fixture, "state");
  const configDir = join(fixture, "config");
  const secret = "synthetic-worker-process-key";
  let responseOrdinal = 0;
  const providerRequests: Array<Record<string, unknown>> = [];
  const server = createServer(async (request, response) => {
    let requestBody = "";
    for await (const chunk of request) requestBody += chunk.toString();
    providerRequests.push(JSON.parse(requestBody) as Record<string, unknown>);
    responseOrdinal += 1;
    const answer = responseOrdinal === 1
      ? "The separate worker process produced bounded advisory evidence."
      : "The parent Supervisor integrated the delivered worker evidence.";
    const message = {
      id: `msg_worker_process_${responseOrdinal}`,
      type: "message",
      status: "completed",
      role: "assistant",
      content: [{ type: "output_text", text: answer, annotations: [] }]
    };
    response.writeHead(200, { "content-type": "text/event-stream" });
    for (const event of [
      { type: "response.output_item.done", output_index: 0, item: message },
      {
        type: "response.completed",
        response: {
          id: `resp_worker_process_${responseOrdinal}`,
          status: "completed",
          output: [message],
          usage: { input_tokens: 1, output_tokens: 7, total_tokens: 8 }
        }
      }
    ]) response.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
    response.end("data: [DONE]\n\n");
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const model: ResolvedVNextModel = {
    config_id: "worker-process-model",
    provider: "openai-compatible",
    api: "responses",
    base_url: `http://127.0.0.1:${address.port}/v1`,
    model: "worker-process-model",
    credential_ref: "worker-process-credential",
    reasoning_effort: null,
    context_window_tokens: 128_000,
    max_output_tokens: 2_400,
    timeout_ms: 10_000
  };
  let workerId = "";

  try {
    await writeConfig({ configDir, stateRoot, model, secret });
    const submitted = await executeVNextRun({
      action: "submit",
      task: "Dispatch one read-only discussion worker and wait for its evidence.",
      state_root: stateRoot,
      config_dir: configDir,
      repo_root: fixture
    }, {
      load_legacy_config_pi_adapter: async () => testLegacyConfigPiAdapter({ model, secret }),
      create_loop_factory: () => ({
        create(input) {
          return {
            execute: async () => {
              const dispatched = await input.action_gateway.invoke({
                run_id: input.run_id,
                turn_id: input.turn_id,
                invocation_id: "cross-process-worker-dispatch",
                action_name: "worker_dispatch",
                arguments: {
                  objective: "Inspect bounded vNext architecture evidence.",
                  expected_result: "Return one concise advisory finding.",
                  context_refs: ["docs/ARCHITECTURE.md"],
                  artifact_refs: ["artifact:vnext-architecture-snapshot"],
                  constraints: ["read-only"],
                  verification_requirements: ["cite the explicit context ref"],
                  deadline_at: new Date(Date.now() + 60_000).toISOString(),
                  budget: { max_output_tokens: 400, timeout_ms: 10_000 }
                }
              });
              assert.equal(dispatched.status, "completed");
              if (dispatched.status !== "completed") throw new Error("worker dispatch failed");
              workerId = String(dispatched.receipt.output.worker_id);
              return { answer: "Parent is waiting for the separate process." };
            }
          };
        }
      })
    });
    assert.equal(submitted.vnext.status, "waiting");
    assert.ok(submitted.vnext.run_id);
    assert.ok(workerId);

    const workerOutput = await runCli([
      "worker", "execute", "--worker-id", workerId,
      "--vnext-state-root", stateRoot,
      "--config-dir", configDir,
      "--repo-root", fixture
    ]) as VNextWorkerEnvelope;
    assert.equal(workerOutput.worker.marker, VNEXT_WORKER_MARKER);
    assert.equal(workerOutput.worker.surface, "cli_process");
    assert.equal(workerOutput.worker.status, "completed");
    assert.ok(workerOutput.worker.child_run_id);
    assert.ok(workerOutput.worker.result_envelope_digest);
    assert.equal(JSON.stringify(workerOutput).includes(secret), false);

    const store = new SqliteRuntimeStore(join(stateRoot, "runtime.sqlite"), {
      state_profile: "stable_cli"
    });
    try {
      assert.equal(store.inspectRun(submitted.vnext.run_id!)?.status, "waiting");
      assert.equal(store.inspectRun(submitted.vnext.run_id!)?.deliverable_worker_count, 1);
      assert.equal(store.inspectWorker(workerId)?.result_delivered_to_turn_id, null);
      assert.equal(store.inspectWorker(workerId)?.result_envelope?.consumed.output_tokens, 7);
      assert.equal(store.inspectWorker(workerId)?.result_envelope?.actual_execution.provider, model.provider);
      assert.equal(store.inspectWorker(workerId)?.result_envelope?.actual_execution.model, model.model);
      assert.equal(
        store.inspectWorker(workerId)?.result_envelope?.actual_execution.model_dispatch_ids.length,
        1
      );
      assert.deepEqual(store.inspectWorker(workerId)?.task_envelope.artifact_refs, [
        "artifact:vnext-architecture-snapshot"
      ]);
      assert.equal(JSON.stringify(store.getExecutionLock(submitted.vnext.run_id!)).includes(secret), false);
      assert.equal(JSON.stringify(store.getPiSessionEntries(
        store.inspectWorker(workerId)!.child_session_id!
      )).includes(secret), false);
    } finally {
      store.close();
    }

    const continued = await runCli([
      "run", "continue", "--run-id", submitted.vnext.run_id!,
      "--vnext-state-root", stateRoot,
      "--config-dir", configDir,
      "--repo-root", fixture
    ]) as VNextRunEnvelope;
    assert.equal(continued.vnext.status, "completed");
    assert.match(
      continued.vnext.result && "answer" in continued.vnext.result
        ? continued.vnext.result.answer ?? ""
        : "",
      /parent Supervisor integrated/
    );
    assert.equal(responseOrdinal, 2);
    assert.equal(providerRequests.length, 2);
    assert.match(runtimeContextText(providerRequests[0]!), /runtime_discussion_task_envelope/);
    assert.match(runtimeContextText(providerRequests[0]!), /artifact:vnext-architecture-snapshot/);
    assert.doesNotMatch(userMessageText(providerRequests[0]!), /runtime_discussion_task_envelope/);
    assert.doesNotMatch(userMessageText(providerRequests[0]!), /Inspect bounded vNext architecture evidence/);
    assert.match(runtimeContextText(providerRequests[1]!), /runtime_worker_result_delivery/);
    assert.match(runtimeContextText(providerRequests[1]!), /separate worker process produced bounded advisory evidence/);
    assert.doesNotMatch(userMessageText(providerRequests[1]!), /runtime_worker_result_delivery/);
    assert.doesNotMatch(
      userMessageText(providerRequests[1]!),
      /separate worker process produced bounded advisory evidence/
    );
  } finally {
    await new Promise<void>((resolveClose, reject) => server.close((error) => {
      if (error) reject(error);
      else resolveClose();
    }));
    await rm(fixture, { recursive: true, force: true });
  }
});

test("vnext worker execute recovers after SIGKILL with one Result and exact model lineage", async () => {
  const fixture = await mkdtemp(join(tmpdir(), "evi-vnext-worker-sigkill-"));
  const stateRoot = join(fixture, "state");
  const configDir = join(fixture, "config");
  const secret = "synthetic-worker-sigkill-key";
  let requestCount = 0;
  let firstRequestObserved!: () => void;
  const firstRequest = new Promise<void>((resolveRequest) => {
    firstRequestObserved = resolveRequest;
  });
  const server = createServer(async (request, response) => {
    for await (const _chunk of request) {
      // Drain the request before deciding whether this process-loss probe responds.
    }
    requestCount += 1;
    if (requestCount === 1) {
      firstRequestObserved();
      return;
    }
    const message = {
      id: "msg_worker_sigkill_recovery",
      type: "message",
      status: "completed",
      role: "assistant",
      content: [{ type: "output_text", text: "Recovered the killed Worker exactly once.", annotations: [] }]
    };
    response.writeHead(200, { "content-type": "text/event-stream" });
    for (const event of [
      { type: "response.output_item.done", output_index: 0, item: message },
      {
        type: "response.completed",
        response: {
          id: "resp_worker_sigkill_recovery",
          status: "completed",
          output: [message],
          usage: { input_tokens: 1, output_tokens: 9, total_tokens: 10 }
        }
      }
    ]) response.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
    response.end("data: [DONE]\n\n");
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const model: ResolvedVNextModel = {
    config_id: "worker-sigkill-model",
    provider: "openai-compatible",
    api: "responses",
    base_url: `http://127.0.0.1:${address.port}/v1`,
    model: "worker-sigkill-model",
    credential_ref: "worker-sigkill-credential",
    reasoning_effort: null,
    context_window_tokens: 128_000,
    max_output_tokens: 2_400,
    timeout_ms: 10_000
  };
  let workerId = "";
  let child: ReturnType<typeof spawn> | null = null;

  try {
    await writeConfig({ configDir, stateRoot, model, secret });
    const submitted = await executeVNextRun({
      action: "submit",
      task: "Dispatch one Worker that will survive a killed CLI owner.",
      state_root: stateRoot,
      config_dir: configDir,
      repo_root: fixture
    }, {
      load_legacy_config_pi_adapter: async () => testLegacyConfigPiAdapter({ model, secret }),
      create_loop_factory: () => ({
        create(input) {
          return {
            execute: async () => {
              const dispatched = await input.action_gateway.invoke({
                run_id: input.run_id,
                turn_id: input.turn_id,
                invocation_id: "sigkill-worker-dispatch",
                action_name: "worker_dispatch",
                arguments: {
                  objective: "Recover one killed read-only Worker process.",
                  expected_result: "Return one exact advisory Result.",
                  context_refs: ["issue:142"],
                  constraints: ["read-only", "single Result"],
                  verification_requirements: ["preserve model lineage"],
                  deadline_at: new Date(Date.now() + 60_000).toISOString(),
                  budget: { max_output_tokens: 400, timeout_ms: 10_000 }
                }
              });
              assert.equal(dispatched.status, "completed");
              if (dispatched.status !== "completed") throw new Error("worker dispatch failed");
              workerId = String(dispatched.receipt.output.worker_id);
              return { answer: "Parent waits while the Worker process is crash-tested." };
            }
          };
        }
      })
    });
    assert.equal(submitted.vnext.status, "waiting");
    assert.ok(workerId);

    child = spawn(process.execPath, [
      "--import", "tsx", "apps/cli/src/main.ts", "vnext",
      "worker", "execute", "--worker-id", workerId,
      "--vnext-state-root", stateRoot,
      "--config-dir", configDir,
      "--repo-root", fixture
    ], {
      cwd: process.cwd(),
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, NODE_NO_WARNINGS: "1" }
    });
    await waitForWorkerRequest(child, firstRequest, 10_000);
    const sqlite = join(stateRoot, "runtime.sqlite");
    const active = new DatabaseSync(sqlite);
    let childRunId = "";
    try {
      const worker = active.prepare(`
        SELECT status, lease_ordinal, child_run_id
        FROM worker_sessions WHERE id = ?
      `).get(workerId) as { status: string; lease_ordinal: number; child_run_id: string };
      const dispatch = active.prepare(`
        SELECT state FROM model_dispatches WHERE run_id = ? ORDER BY ordinal DESC LIMIT 1
      `).get(worker.child_run_id) as { state: string };
      assert.equal(worker.status, "running");
      assert.equal(worker.lease_ordinal, 1);
      assert.equal(dispatch.state, "dispatching");
      childRunId = worker.child_run_id;
    } finally {
      active.close();
    }

    assert.equal(child.kill("SIGKILL"), true);
    await once(child, "exit");
    child = null;
    const expiredAt = new Date(Date.now() - 1_000).toISOString();
    const expire = new DatabaseSync(sqlite);
    try {
      expire.prepare("UPDATE worker_sessions SET lease_expires_at = ? WHERE id = ?")
        .run(expiredAt, workerId);
      expire.prepare(`
        UPDATE run_executions SET lease_expires_at = ?
        WHERE run_id = ? AND state = 'active'
      `).run(expiredAt, childRunId);
    } finally {
      expire.close();
    }

    const recovered = await runCli([
      "worker", "execute", "--worker-id", workerId,
      "--vnext-state-root", stateRoot,
      "--config-dir", configDir,
      "--repo-root", fixture
    ]) as VNextWorkerEnvelope;
    assert.equal(recovered.worker.status, "completed");
    assert.equal(requestCount, 2);

    const store = new SqliteRuntimeStore(sqlite, { state_profile: "stable_cli" });
    try {
      const worker = store.inspectWorker(workerId)!;
      const childRun = store.inspectRun(worker.child_run_id!)!;
      const producer = store.getResultProducingRunExecution(worker.child_run_id!);
      assert.equal(worker.status, "completed");
      assert.equal(worker.lease_ordinal, 2);
      assert.equal(worker.result_envelope?.actual_execution.execution_id, producer.execution_id);
      assert.deepEqual(
        worker.result_envelope?.actual_execution.model_dispatch_ids,
        producer.dispatches.map((dispatch) => dispatch.id)
      );
      assert.equal(worker.result_envelope?.actual_execution.provider, model.provider);
      assert.equal(worker.result_envelope?.actual_execution.model, model.model);
      assert.equal(childRun.execution_count, 2);
      assert.equal(childRun.interrupted_execution_count, 1);
      assert.equal(childRun.model_dispatch_count, 2);
      assert.equal(childRun.unknown_model_dispatch_count, 1);
      const raw = new DatabaseSync(sqlite);
      try {
        const ready = raw.prepare(`
          SELECT COUNT(*) AS count FROM runtime_events
          WHERE kind = 'worker_result_ready' AND payload_json LIKE ?
        `).get(`%${workerId}%`) as { count: number };
        assert.equal(Number(ready.count), 1);
      } finally {
        raw.close();
      }
    } finally {
      store.close();
    }
  } finally {
    if (child && child.exitCode === null && child.signalCode === null) {
      child.kill("SIGKILL");
      await once(child, "exit");
    }
    await new Promise<void>((resolveClose, reject) => server.close((error) => {
      if (error) reject(error);
      else resolveClose();
    }));
    await delay(10);
    await rm(fixture, { recursive: true, force: true });
  }
});

async function runCli(args: string[]): Promise<VNextWorkerEnvelope | VNextRunEnvelope> {
  const { stdout } = await execFileAsync(process.execPath, [
    "--import", "tsx", "apps/cli/src/main.ts", "vnext", ...args
  ], {
    cwd: process.cwd(),
    encoding: "utf8",
    env: { ...process.env, NODE_NO_WARNINGS: "1" },
    maxBuffer: 4 * 1024 * 1024
  });
  return JSON.parse(stdout) as VNextWorkerEnvelope | VNextRunEnvelope;
}

async function waitForWorkerRequest(
  child: ReturnType<typeof spawn>,
  observed: Promise<void>,
  timeoutMs: number
): Promise<void> {
  await new Promise<void>((resolveWait, rejectWait) => {
    let stderr = "";
    const onStderr = (chunk: Buffer | string) => {
      stderr = `${stderr}${chunk.toString()}`.slice(-4_000);
    };
    const cleanup = () => {
      clearTimeout(timer);
      child.off("exit", onExit);
      child.stderr?.off("data", onStderr);
    };
    const fail = (message: string) => {
      cleanup();
      rejectWait(new Error(`${message}${stderr.trim() ? `; stderr=${stderr.trim()}` : ""}`));
    };
    const onExit = (code: number | null, signal: NodeJS.Signals | null) => {
      fail(`vnext worker exited before its provider request: code=${code}, signal=${signal}`);
    };
    const timer = setTimeout(() => {
      fail(`vnext worker did not reach its provider request within ${timeoutMs}ms`);
    }, timeoutMs);
    child.stderr?.on("data", onStderr);
    child.once("exit", onExit);
    observed.then(() => {
      cleanup();
      resolveWait();
    }, (error) => {
      cleanup();
      rejectWait(error);
    });
  });
}

function runtimeContextText(request: Record<string, unknown>): string {
  const input = Array.isArray(request.input) ? request.input : [];
  return JSON.stringify(input.filter((item) => item && typeof item === "object"
    && ((item as Record<string, unknown>).role === "system"
      || (item as Record<string, unknown>).role === "developer")));
}

function userMessageText(request: Record<string, unknown>): string {
  const input = Array.isArray(request.input) ? request.input : [];
  return JSON.stringify(input.filter((item) => item && typeof item === "object"
    && (item as Record<string, unknown>).role === "user"));
}

async function writeConfig(input: {
  configDir: string;
  stateRoot: string;
  model: ResolvedVNextModel;
  secret: string;
}): Promise<void> {
  await mkdir(input.configDir, { recursive: true });
  await writeFile(join(input.configDir, "config.jsonl"), [
    JSON.stringify({ type: "home", root: join(input.stateRoot, "home") }),
    JSON.stringify({ type: "state", root: input.stateRoot }),
    JSON.stringify({ type: "active_model", model_id: input.model.config_id })
  ].join("\n") + "\n", "utf8");
  await writeFile(join(input.configDir, "models.jsonl"), `${JSON.stringify({
    type: "model",
    id: input.model.config_id,
    provider: input.model.provider,
    api: input.model.api,
    base_url: input.model.base_url,
    model: input.model.model,
    auth_id: input.model.credential_ref,
    context_window_tokens: input.model.context_window_tokens,
    max_output_tokens: input.model.max_output_tokens,
    timeout_ms: input.model.timeout_ms,
    store: false
  })}\n`, "utf8");
  await writeFile(join(input.configDir, "auth.jsonl"), `${JSON.stringify({
    type: "api_key",
    id: input.model.credential_ref,
    key: input.secret
  })}\n`, "utf8");
}
