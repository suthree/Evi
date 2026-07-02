import assert from "node:assert/strict";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import test from "node:test";
import { XiaohongshuMcpClient } from "../packages/runtime/src/xiaohongshu_mcp.js";

test("XiaohongshuMcpClient calls MCP tools/call and extracts publish proof", async () => {
  let received: Record<string, unknown> | null = null;
  const requests: Record<string, unknown>[] = [];
  const server = createServer(async (request: IncomingMessage, response: ServerResponse) => {
    assert.equal(request.method, "POST");
    assert.equal(request.url, "/mcp");
    const body = JSON.parse(await readRequestBody(request)) as Record<string, unknown>;
    requests.push(body);
    if (respondToMcpLifecycle(request, response, body)) return;
    received = body;
    response.setHeader("Content-Type", "application/json");
    response.end(JSON.stringify({
      jsonrpc: "2.0",
      id: body.id,
      result: {
        content: [{
          type: "text",
          text: "发布成功 https://www.xiaohongshu.com/explore/test-post"
        }]
      }
    }));
  });

  try {
    await listen(server);
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("expected TCP server address");
    const client = new XiaohongshuMcpClient({
      serverUrl: `http://127.0.0.1:${address.port}/mcp`,
      timeoutMs: 5000
    });

    const result = await client.publish({
      tool: "publish_content",
      arguments: {
        title: "AI算力早报",
        content: "content",
        images: ["/tmp/cover.png"],
        tags: ["AI资讯"]
      }
    });

    assert.deepEqual(requests.map((item) => item.method), ["initialize", "notifications/initialized", "tools/call"]);
    assert.equal(received?.jsonrpc, "2.0");
    assert.equal(received?.method, "tools/call");
    const params = received?.params as Record<string, unknown>;
    assert.equal(params.name, "publish_content");
    assert.deepEqual(params.arguments, {
      title: "AI算力早报",
      content: "content",
      images: ["/tmp/cover.png"],
      tags: ["AI资讯"]
    });
    assert.equal(result.ok, true);
    assert.equal(result.adapter, "xiaohongshu-mcp");
    assert.equal(result.tool, "publish_content");
    assert.equal(result.post_url, "https://www.xiaohongshu.com/explore/test-post");
    assert.equal(result.post_id, "test-post");
  } finally {
    await close(server);
  }
});

test("XiaohongshuMcpClient verifies published proof from current user feed when publish result has no URL", async () => {
  const requests: Record<string, unknown>[] = [];
  const server = createServer(async (request: IncomingMessage, response: ServerResponse) => {
    if (request.method === "GET" && request.url === "/api/v1/user/me") {
      response.setHeader("Content-Type", "application/json");
      response.end(JSON.stringify({
        success: true,
        data: {
          data: {
            feeds: [{
              id: "6a44db1b000000000803edac",
              noteCard: {
                displayTitle: "AI算力早报 "
              }
            }]
          }
        }
      }));
      return;
    }
    const received = JSON.parse(await readRequestBody(request)) as Record<string, unknown>;
    requests.push(received);
    if (respondToMcpLifecycle(request, response, received)) return;
    response.setHeader("Content-Type", "application/json");
    response.end(JSON.stringify({
      jsonrpc: "2.0",
      id: received.id,
      result: {
        content: [{ type: "text", text: "内容发布成功: status=发布完成" }]
      }
    }));
  });

  try {
    await listen(server);
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("expected TCP server address");
    const client = new XiaohongshuMcpClient({
      serverUrl: `http://127.0.0.1:${address.port}/mcp`,
      timeoutMs: 5000
    });

    const result = await client.publish({
      tool: "publish_content",
      arguments: {
        title: "AI算力早报",
        content: "content",
        images: ["/tmp/cover.png"]
      }
    });

    assert.deepEqual(requests.map((item) => item.method), ["initialize", "notifications/initialized", "tools/call"]);
    assert.equal(result.ok, true);
    assert.equal(result.post_id, "6a44db1b000000000803edac");
    assert.equal(result.post_url, "https://www.xiaohongshu.com/explore/6a44db1b000000000803edac");
    assert.equal(result.raw_summary?.proof_source, "xiaohongshu-mcp /api/v1/user/me");
  } finally {
    await close(server);
  }
});

test("XiaohongshuMcpClient captures feedback metrics from current user feed", async () => {
  const server = createServer(async (request: IncomingMessage, response: ServerResponse) => {
    assert.equal(request.method, "GET");
    assert.equal(request.url, "/api/v1/user/me");
    response.setHeader("Content-Type", "application/json");
    response.end(JSON.stringify({
      success: true,
      data: {
        data: {
          feeds: [{
            id: "6a44db1b000000000803edac",
            noteCard: {
              displayTitle: "AI算力早报 ",
              interactInfo: {
                likedCount: "1",
                sharedCount: "",
                commentCount: "2",
                collectedCount: "3"
              }
            }
          }]
        }
      }
    }));
  });

  try {
    await listen(server);
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("expected TCP server address");
    const client = new XiaohongshuMcpClient({
      serverUrl: `http://127.0.0.1:${address.port}/mcp`,
      timeoutMs: 5000
    });

    const result = await client.captureFeedback({
      post_url: "https://www.xiaohongshu.com/explore/6a44db1b000000000803edac",
      title: "AI算力早报"
    });

    assert.equal(result.ok, true);
    assert.equal(result.source, "xiaohongshu-mcp /api/v1/user/me");
    assert.equal(result.matched_by, "post_id");
    assert.equal(result.post_id, "6a44db1b000000000803edac");
    assert.equal(result.metrics?.like_count, 1);
    assert.equal(result.metrics?.comment_count, 2);
    assert.equal(result.metrics?.collect_count, 3);
    assert.equal(result.metrics?.share_count, 0);
    assert.equal(result.raw_summary?.view_count_available, false);
  } finally {
    await close(server);
  }
});

test("XiaohongshuMcpClient reports current-user feed timeout as typed feedback failure", async () => {
  const server = createServer((request: IncomingMessage, response: ServerResponse) => {
    assert.equal(request.method, "GET");
    assert.equal(request.url, "/api/v1/user/me");
    request.on("close", () => {
      response.destroy();
    });
  });

  try {
    await listen(server);
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("expected TCP server address");
    const client = new XiaohongshuMcpClient({
      serverUrl: `http://127.0.0.1:${address.port}/mcp`,
      currentUserFeedTimeoutMs: 25
    });

    const result = await client.captureFeedback({
      post_id: "timeout-post",
      title: "AI应用早报"
    });

    assert.equal(result.ok, false);
    assert.equal(result.source, "xiaohongshu-mcp /api/v1/user/me");
    assert.match(result.error ?? "", /\/api\/v1\/user\/me timed out after 25ms/);
    assert.equal(result.raw_summary?.endpoint, "/api/v1/user/me");
    assert.equal(result.raw_summary?.timeout_ms, 25);
    assert.equal(result.raw_summary?.timed_out, true);
  } finally {
    await close(server);
  }
});

test("XiaohongshuMcpClient prefers post id over duplicate current-user feed titles", async () => {
  const server = createServer(async (request: IncomingMessage, response: ServerResponse) => {
    assert.equal(request.method, "GET");
    assert.equal(request.url, "/api/v1/user/me");
    response.setHeader("Content-Type", "application/json");
    response.end(JSON.stringify({
      success: true,
      data: {
        data: {
          feeds: [
            {
              id: "newer-same-title",
              noteCard: {
                displayTitle: "AI应用早报",
                interactInfo: {
                  likedCount: "9",
                  commentCount: "9",
                  collectedCount: "9",
                  sharedCount: "9"
                }
              }
            },
            {
              id: "older-target-post",
              noteCard: {
                displayTitle: "AI应用早报",
                interactInfo: {
                  likedCount: "1",
                  commentCount: "2",
                  collectedCount: "3",
                  sharedCount: "4"
                }
              }
            }
          ]
        }
      }
    }));
  });

  try {
    await listen(server);
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("expected TCP server address");
    const client = new XiaohongshuMcpClient({
      serverUrl: `http://127.0.0.1:${address.port}/mcp`,
      timeoutMs: 5000
    });

    const result = await client.captureFeedback({
      post_id: "older-target-post",
      title: "AI应用早报"
    });

    assert.equal(result.ok, true);
    assert.equal(result.matched_by, "post_id");
    assert.equal(result.post_id, "older-target-post");
    assert.equal(result.metrics?.like_count, 1);
    assert.equal(result.metrics?.comment_count, 2);
    assert.equal(result.metrics?.collect_count, 3);
    assert.equal(result.metrics?.share_count, 4);
  } finally {
    await close(server);
  }
});

test("XiaohongshuMcpClient does not fall back to title when requested post id is absent", async () => {
  const server = createServer(async (request: IncomingMessage, response: ServerResponse) => {
    assert.equal(request.method, "GET");
    assert.equal(request.url, "/api/v1/user/me");
    response.setHeader("Content-Type", "application/json");
    response.end(JSON.stringify({
      success: true,
      data: {
        data: {
          feeds: [{
            id: "newer-same-title",
            noteCard: {
              displayTitle: "AI应用早报",
              interactInfo: {
                likedCount: "9"
              }
            }
          }]
        }
      }
    }));
  });

  try {
    await listen(server);
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("expected TCP server address");
    const client = new XiaohongshuMcpClient({
      serverUrl: `http://127.0.0.1:${address.port}/mcp`,
      timeoutMs: 5000
    });

    const result = await client.captureFeedback({
      post_id: "older-target-post",
      title: "AI应用早报"
    });

    assert.equal(result.ok, false);
    assert.match(result.error ?? "", /not found/);
    assert.equal(result.matched_by, undefined);
    assert.equal(result.post_id, undefined);
    assert.equal(result.metrics, undefined);
    assert.equal(result.raw_summary?.requested_post_id, "older-target-post");
    assert.equal(result.raw_summary?.requested_title, "AI应用早报");
  } finally {
    await close(server);
  }
});

test("XiaohongshuMcpClient probes tools and login status without publishing", async () => {
  const requests: Record<string, unknown>[] = [];
  const server = createServer(async (request: IncomingMessage, response: ServerResponse) => {
    const received = JSON.parse(await readRequestBody(request)) as Record<string, unknown>;
    requests.push(received);
    if (respondToMcpLifecycle(request, response, received)) return;
    response.setHeader("Content-Type", "application/json");
    if (received.method === "tools/list") {
      response.end(JSON.stringify({
        jsonrpc: "2.0",
        id: received.id,
        result: {
          tools: [
            { name: "publish_content", description: "Publish Xiaohongshu content" },
            { name: "check_login_status", description: "Check login" }
          ]
        }
      }));
      return;
    }
    response.end(JSON.stringify({
      jsonrpc: "2.0",
      id: received.id,
      result: {
        content: [{ type: "text", text: "已登录" }]
      }
    }));
  });

  try {
    await listen(server);
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("expected TCP server address");
    const client = new XiaohongshuMcpClient({
      serverUrl: `http://127.0.0.1:${address.port}/mcp`,
      timeoutMs: 5000
    });

    const probe = await client.probe({ publishTool: "publish_content" });

    assert.equal(probe.ok, true);
    assert.equal(probe.adapter_available, true);
    assert.equal(probe.login_status, "logged_in");
    assert.equal(probe.login_tool, "check_login_status");
    assert.deepEqual(probe.tools.map((tool) => tool.name), ["publish_content", "check_login_status"]);
    assert.deepEqual(requests.map((item) => item.method), ["initialize", "notifications/initialized", "tools/list", "tools/call"]);
    assert.equal((requests[3].params as Record<string, unknown>).name, "check_login_status");
    assert.deepEqual((requests[3].params as Record<string, unknown>).arguments, {});
  } finally {
    await close(server);
  }
});

test("XiaohongshuMcpClient treats JSON-RPC errors from tools/list as probe failures", async () => {
  const server = createServer(async (request: IncomingMessage, response: ServerResponse) => {
    const received = JSON.parse(await readRequestBody(request)) as Record<string, unknown>;
    if (respondToMcpLifecycle(request, response, received)) return;
    response.setHeader("Content-Type", "application/json");
    response.end(JSON.stringify({
      jsonrpc: "2.0",
      id: received.id,
      error: {
        code: -32000,
        message: "tools unavailable"
      }
    }));
  });

  try {
    await listen(server);
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("expected TCP server address");
    const client = new XiaohongshuMcpClient({
      serverUrl: `http://127.0.0.1:${address.port}/mcp`,
      timeoutMs: 5000
    });

    const probe = await client.probe({ publishTool: "publish_content" });

    assert.equal(probe.ok, false);
    assert.equal(probe.adapter_available, false);
    assert.equal(probe.login_status, "unknown");
    assert.match(probe.error ?? "", /tools unavailable/);
  } finally {
    await close(server);
  }
});

test("XiaohongshuMcpClient bounds tool-name diagnostics while keeping full probe tools", async () => {
  const longToolName = "tool_" + "x".repeat(120);
  const tools = [
    { name: "publish_content" },
    { name: "check_login_status" },
    ...Array.from({ length: 25 }, (_, index) => ({ name: `${longToolName}_${index}` }))
  ];
  const server = createServer(async (request: IncomingMessage, response: ServerResponse) => {
    const received = JSON.parse(await readRequestBody(request)) as Record<string, unknown>;
    if (respondToMcpLifecycle(request, response, received)) return;
    response.setHeader("Content-Type", "application/json");
    if (received.method === "tools/list") {
      response.end(JSON.stringify({
        jsonrpc: "2.0",
        id: received.id,
        result: { tools }
      }));
      return;
    }
    response.end(JSON.stringify({
      jsonrpc: "2.0",
      id: received.id,
      result: { content: [{ type: "text", text: "已登录" }] }
    }));
  });

  try {
    await listen(server);
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("expected TCP server address");
    const client = new XiaohongshuMcpClient({
      serverUrl: `http://127.0.0.1:${address.port}/mcp`,
      timeoutMs: 5000
    });

    const probe = await client.probe({ publishTool: "publish_content" });

    assert.equal(probe.ok, true);
    assert.equal(probe.tools.length, 27);
    assert.equal(probe.raw_summary.tool_count, 27);
    assert.equal((probe.raw_summary.tool_names as string[]).length, 20);
    assert.equal(probe.raw_summary.tool_names_truncated, true);
    assert.equal((probe.raw_summary.tool_names as string[]).every((name) => name.length <= 80), true);
  } finally {
    await close(server);
  }
});

test("XiaohongshuMcpClient parses SSE JSON-RPC and reports request failures", async () => {
  let publishCallCount = 0;
  const server = createServer(async (request: IncomingMessage, response: ServerResponse) => {
    const received = JSON.parse(await readRequestBody(request)) as Record<string, unknown>;
    if (respondToMcpLifecycle(request, response, received)) return;
    publishCallCount += 1;
    if (publishCallCount === 1) {
      response.setHeader("Content-Type", "text/event-stream");
      response.end(`event: message\ndata: ${JSON.stringify({
        jsonrpc: "2.0",
        id: received.id,
        result: {
          content: [{ type: "text", text: "发布成功 https://www.xiaohongshu.com/explore/sse-post" }]
        }
      })}\n\n`);
      return;
    }
    response.statusCode = 503;
    response.end("service unavailable");
  });

  try {
    await listen(server);
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("expected TCP server address");
    const client = new XiaohongshuMcpClient({
      serverUrl: `http://127.0.0.1:${address.port}/mcp`,
      timeoutMs: 5000
    });

    const published = await client.publish({
      tool: "publish_content",
      arguments: { title: "t" }
    });
    const failed = await client.publish({
      tool: "publish_content",
      arguments: { title: "t" }
    });

    assert.equal(published.ok, true);
    assert.equal(published.post_id, "sse-post");
    assert.equal(failed.ok, false);
    assert.match(failed.error ?? "", /503/);
  } finally {
    await close(server);
  }
});

function readRequestBody(request: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    request.on("data", (chunk: Buffer) => chunks.push(chunk));
    request.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    request.on("error", reject);
  });
}

function listen(server: ReturnType<typeof createServer>): Promise<void> {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      resolve();
    });
  });
}

function respondToMcpLifecycle(
  request: IncomingMessage,
  response: ServerResponse,
  received: Record<string, unknown>
): boolean {
  if (received.method === "initialize") {
    response.setHeader("Content-Type", "application/json");
    response.setHeader("Mcp-Session-Id", "test-session");
    response.end(JSON.stringify({
      jsonrpc: "2.0",
      id: received.id,
      result: {
        capabilities: { tools: { listChanged: true } },
        protocolVersion: "2025-06-18",
        serverInfo: { name: "xiaohongshu-mcp", version: "test" }
      }
    }));
    return true;
  }
  assert.equal(request.headers["mcp-session-id"], "test-session");
  if (received.method === "notifications/initialized") {
    response.statusCode = 202;
    response.end("");
    return true;
  }
  return false;
}

function close(server: ReturnType<typeof createServer>): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
}
