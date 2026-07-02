import assert from "node:assert/strict";
import { createServer } from "node:http";
import test from "node:test";
import { OpenAICompatibleImageClient } from "../packages/runtime/src/model.js";

test("OpenAI-compatible image client posts image generation requests and decodes b64 output", async () => {
  const requests: Array<Record<string, unknown>> = [];
  const server = createServer((request, response) => {
    assert.equal(request.method, "POST");
    assert.equal(request.url, "/v1/images/generations");
    assert.equal(request.headers.authorization, "Bearer test-image-key");
    let body = "";
    request.setEncoding("utf8");
    request.on("data", (chunk) => {
      body += chunk;
    });
    request.on("end", () => {
      requests.push(JSON.parse(body) as Record<string, unknown>);
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({
        id: "img_response_1",
        data: [{ b64_json: Buffer.from("png bytes", "utf8").toString("base64") }]
      }));
    });
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("expected TCP server address");
    const client = new OpenAICompatibleImageClient({
      type: "image_model",
      id: "image-local",
      provider: "openai-compatible",
      api: "images_generations",
      base_url: `http://127.0.0.1:${address.port}/v1`,
      model: "gpt-image-2",
      auth_id: "image-auth",
      api_key: "test-image-key",
      size: "1024x1024",
      quality: "high",
      output_format: "png",
      timeout_ms: 5000
    });

    const result = await client.generate({
      prompt: "Generate a clean AI market cover",
      model: "gpt-image-2"
    });

    assert.equal(result.provider, "openai-compatible");
    assert.equal(result.api, "images_generations");
    assert.equal(result.model, "gpt-image-2");
    assert.equal(result.responseId, "img_response_1");
    assert.equal(Buffer.from(result.bytes).toString("utf8"), "png bytes");
    assert.equal(requests.length, 1);
    assert.deepEqual(requests[0], {
      model: "gpt-image-2",
      prompt: "Generate a clean AI market cover",
      n: 1,
      size: "1024x1024",
      quality: "high",
      output_format: "png"
    });
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });
  }
});
