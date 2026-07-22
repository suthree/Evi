import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:http";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { promisify } from "node:util";
import { SqliteRuntimeStore } from "../packages/kernel/src/index.js";
import {
  executeVNextRun,
  type ResolvedVNextModel,
  type VNextRunEnvelope
} from "../apps/cli/src/vnext_run.js";
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
  const server = createServer((_request, response) => {
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
    api_key: secret,
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
      load_model: async () => model,
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
  } finally {
    await new Promise<void>((resolveClose, reject) => server.close((error) => {
      if (error) reject(error);
      else resolveClose();
    }));
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
