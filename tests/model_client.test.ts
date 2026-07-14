import assert from "node:assert/strict";
import { createServer } from "node:http";
import test from "node:test";
import { OpenAICompatibleClient } from "../packages/runtime/src/model.js";

test("OpenAI-compatible model client retries one transient HTTP failure and records bounded attempt metadata", async () => {
  let requests = 0;
  const server = createServer((_request, response) => {
    requests += 1;
    if (requests === 1) {
      response.writeHead(408, { "content-type": "application/json" });
      response.end(JSON.stringify({ error: { message: "transient stream timeout" } }));
      return;
    }
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({
      id: "response-after-retry",
      output_text: JSON.stringify({ summary: "ready", actions: [], completion_claim: { status: "not_done", verification_refs: [] } })
    }));
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("expected TCP server address");
    const client = new OpenAICompatibleClient({
      type: "model",
      id: "model-local",
      provider: "openai-compatible",
      api: "responses",
      base_url: `http://127.0.0.1:${address.port}/v1`,
      model: "test-model",
      auth_id: "test-auth",
      api_key: "test-key",
      max_output_tokens: 2400,
      timeout_ms: 5000,
      json_object: true,
      store: false
    });

    const result = await client.create({ instructions: "Return JSON.", input: "Test bounded retry." });

    assert.equal(requests, 2);
    assert.equal(result.responseId, "response-after-retry");
    assert.equal(result.requestAttempts, 2);
    assert.deepEqual(result.recoveredRequestFailures, ["http_408"]);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });
  }
});

test("OpenAI-compatible model client does not retry non-transient authentication failures", async () => {
  let requests = 0;
  const server = createServer((_request, response) => {
    requests += 1;
    response.writeHead(401, { "content-type": "application/json" });
    response.end(JSON.stringify({ error: { message: "invalid api key" } }));
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("expected TCP server address");
    const client = new OpenAICompatibleClient({
      type: "model",
      id: "model-local",
      provider: "openai-compatible",
      api: "responses",
      base_url: `http://127.0.0.1:${address.port}/v1`,
      model: "test-model",
      auth_id: "test-auth",
      api_key: "test-key",
      max_output_tokens: 2400,
      timeout_ms: 5000,
      json_object: true,
      store: false
    });

    await assert.rejects(
      () => client.create({ instructions: "Return JSON.", input: "Do not retry auth failures." }),
      /401 Unauthorized/
    );
    assert.equal(requests, 1);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });
  }
});
