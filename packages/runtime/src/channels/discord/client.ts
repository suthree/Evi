import { assertDiscordConfigReady } from "./config.js";
import type {
  DiscordChannelConfig,
  DiscordGatewayReady,
  DiscordMessage,
  DiscordSendResult,
  DiscordTransport
} from "./types.js";

const OP_DISPATCH = 0;
const OP_HEARTBEAT = 1;
const OP_IDENTIFY = 2;
const OP_RECONNECT = 7;
const OP_INVALID_SESSION = 9;
const OP_HELLO = 10;

interface DiscordGatewayPayload {
  op: number;
  d?: unknown;
  s?: number | null;
  t?: string | null;
}

interface DiscordApiError {
  message?: string;
  code?: number;
}

type RuntimeWebSocketEvent = { data?: unknown };
type RuntimeWebSocket = {
  addEventListener(type: string, listener: (event: RuntimeWebSocketEvent) => void): void;
  send(data: string): void;
  close(code?: number, reason?: string): void;
};

type RuntimeWebSocketConstructor = new (url: string) => RuntimeWebSocket;

export class DiscordGatewayTransport implements DiscordTransport {
  private readonly config: DiscordChannelConfig;
  private socket: RuntimeWebSocket | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private sequence: number | null = null;
  private running = false;

  constructor(config: DiscordChannelConfig) {
    assertDiscordConfigReady(config);
    this.config = config;
  }

  async start(onMessage: (message: DiscordMessage) => void | Promise<void>): Promise<void> {
    if (this.running) return;
    const WebSocketCtor = (globalThis as unknown as { WebSocket?: RuntimeWebSocketConstructor }).WebSocket;
    if (!WebSocketCtor) throw new Error("Discord gateway requires globalThis.WebSocket in this Node runtime.");
    this.running = true;
    const socket = new WebSocketCtor(this.config.gatewayUrl);
    this.socket = socket;
    socket.addEventListener("message", (event) => {
      void this.handleGatewayMessage(event.data, onMessage);
    });
    socket.addEventListener("close", () => {
      this.stopHeartbeat();
      this.socket = null;
      this.running = false;
    });
    socket.addEventListener("error", () => {
      this.stopHeartbeat();
      this.socket = null;
      this.running = false;
    });
  }

  async stop(): Promise<void> {
    this.running = false;
    this.stopHeartbeat();
    this.socket?.close(1000, "runtime stop");
    this.socket = null;
  }

  async sendText(channelId: string, text: string): Promise<DiscordSendResult> {
    const response = await fetch(`${this.config.apiBaseUrl}/channels/${encodeURIComponent(channelId)}/messages`, {
      method: "POST",
      headers: {
        authorization: `Bot ${this.config.botToken}`,
        "content-type": "application/json"
      },
      body: JSON.stringify({ content: text })
    });
    const raw = await safeJson(response);
    const messageId = isRecord(raw) && typeof raw.id === "string" ? raw.id : null;
    return {
      ok: response.ok,
      messageId,
      summary: response.ok
        ? `Sent Discord message${messageId ? ` ${messageId}` : ""}.`
        : `Discord send failed: status=${response.status} msg=${discordErrorSummary(raw)}`,
      raw
    };
  }

  private async handleGatewayMessage(
    data: unknown,
    onMessage: (message: DiscordMessage) => void | Promise<void>
  ): Promise<void> {
    const payload = parseGatewayPayload(data);
    if (!payload) return;
    if (typeof payload.s === "number") this.sequence = payload.s;

    if (payload.op === OP_HELLO) {
      const heartbeatInterval = isRecord(payload.d) && typeof payload.d.heartbeat_interval === "number"
        ? payload.d.heartbeat_interval
        : 45000;
      this.startHeartbeat(heartbeatInterval);
      this.identify();
      return;
    }
    if (payload.op === OP_HEARTBEAT) {
      this.heartbeat();
      return;
    }
    if (payload.op === OP_RECONNECT) {
      await this.stop();
      return;
    }
    if (payload.op === OP_INVALID_SESSION) {
      this.sequence = null;
      setTimeout(() => this.identify(), 1000).unref?.();
      return;
    }
    if (payload.op !== OP_DISPATCH) return;

    if (payload.t === "READY") {
      const ready = payload.d as DiscordGatewayReady;
      if (ready.user?.id) this.config.botUserId = ready.user.id;
      return;
    }
    if (payload.t === "MESSAGE_CREATE" && isDiscordMessage(payload.d)) {
      await onMessage(payload.d);
    }
  }

  private identify(): void {
    this.send({
      op: OP_IDENTIFY,
      d: {
        token: this.config.botToken,
        intents: this.config.intents,
        properties: {
          os: process.platform,
          browser: "local-runtime",
          device: "local-runtime"
        }
      }
    });
  }

  private startHeartbeat(intervalMs: number): void {
    this.stopHeartbeat();
    this.heartbeat();
    this.heartbeatTimer = setInterval(() => this.heartbeat(), intervalMs);
    this.heartbeatTimer.unref?.();
  }

  private stopHeartbeat(): void {
    if (!this.heartbeatTimer) return;
    clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = null;
  }

  private heartbeat(): void {
    this.send({ op: OP_HEARTBEAT, d: this.sequence });
  }

  private send(payload: DiscordGatewayPayload): void {
    if (!this.socket) return;
    this.socket.send(JSON.stringify(payload));
  }
}

async function safeJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text.trim()) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function parseGatewayPayload(data: unknown): DiscordGatewayPayload | null {
  const text = typeof data === "string"
    ? data
    : data instanceof ArrayBuffer
      ? Buffer.from(data).toString("utf8")
      : Buffer.isBuffer(data)
        ? data.toString("utf8")
        : null;
  if (!text) return null;
  try {
    const parsed = JSON.parse(text) as DiscordGatewayPayload;
    return typeof parsed.op === "number" ? parsed : null;
  } catch {
    return null;
  }
}

function isDiscordMessage(value: unknown): value is DiscordMessage {
  return isRecord(value)
    && typeof value.id === "string"
    && typeof value.channel_id === "string"
    && typeof value.content === "string";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function discordErrorSummary(raw: unknown): string {
  if (isRecord(raw)) {
    const error = raw as DiscordApiError;
    return `${error.code ?? "unknown"} ${error.message ?? "unknown"}`;
  }
  return String(raw ?? "unknown");
}
