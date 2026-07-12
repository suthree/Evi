import type { RuntimeChannelKind } from "../../core/src/runtime_channel_messages.js";

export type { RuntimeChannelKind } from "../../core/src/runtime_channel_messages.js";
export type RuntimeChannelState = "running" | "stopped" | "error";
export type RuntimeChannelInboundState = "observed" | "not_observed";

export interface RuntimeChannelInboundHealth {
  state: RuntimeChannelInboundState;
  last_accepted_at?: string;
}

export interface RuntimeChannelHealth {
  kind: RuntimeChannelKind;
  channel_id: string;
  state: RuntimeChannelState;
  detail?: string;
  inbound?: RuntimeChannelInboundHealth;
}

export interface RuntimeChannelAdapter {
  readonly kind: RuntimeChannelKind;
  readonly channelId: string;
  start(): Promise<void>;
  stop(): Promise<void>;
  health(): RuntimeChannelHealth;
}

export interface RuntimeMessageGatewayHealth {
  state: RuntimeChannelState;
  channels: RuntimeChannelHealth[];
}

export class RuntimeMessageGateway {
  private readonly adapters: RuntimeChannelAdapter[];
  private startError: { kind: RuntimeChannelKind; channelId: string; message: string } | null = null;

  constructor(adapters: RuntimeChannelAdapter[]) {
    this.adapters = adapters;
  }

  async start(): Promise<void> {
    this.startError = null;
    const started: RuntimeChannelAdapter[] = [];
    for (const adapter of this.adapters) {
      try {
        await adapter.start();
        started.push(adapter);
      } catch (error) {
        this.startError = {
          kind: adapter.kind,
          channelId: adapter.channelId,
          message: error instanceof Error ? error.message : String(error)
        };
        for (const current of started.reverse()) {
          await current.stop().catch(() => undefined);
        }
        throw error;
      }
    }
  }

  async stop(): Promise<void> {
    for (const adapter of [...this.adapters].reverse()) {
      await adapter.stop();
    }
    this.startError = null;
  }

  health(): RuntimeMessageGatewayHealth {
    const channels = this.adapters.map((adapter) => {
      const health = adapter.health();
      return this.startError?.channelId === adapter.channelId && this.startError.kind === adapter.kind
        ? {
          ...health,
          state: "error" as const,
          detail: this.startError.message
        }
        : health;
    });
    return {
      state: channels.some((channel) => channel.state === "error")
        ? "error"
        : channels.some((channel) => channel.state === "running")
          ? "running"
          : "stopped",
      channels
    };
  }
}
