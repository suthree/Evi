import { assertTelegramConfigReady } from "./config.js";
import type {
  TelegramChannelConfig,
  TelegramSendResult,
  TelegramTransport,
  TelegramUpdate
} from "./types.js";

interface TelegramApiResponse<T> {
  ok: boolean;
  result?: T;
  description?: string;
  error_code?: number;
}

export class TelegramBotApiTransport implements TelegramTransport {
  private readonly config: TelegramChannelConfig;
  private running = false;
  private offset: number | null = null;

  constructor(config: TelegramChannelConfig) {
    assertTelegramConfigReady(config);
    this.config = config;
  }

  async start(
    onUpdate: (update: TelegramUpdate) => void | Promise<void>,
    options: { offset?: number | null } = {}
  ): Promise<void> {
    if (this.running) return;
    this.running = true;
    this.offset = options.offset ?? null;
    void this.poll(onUpdate);
  }

  async stop(): Promise<void> {
    this.running = false;
  }

  async sendText(chatId: string, text: string, options: { threadId?: string | null } = {}): Promise<TelegramSendResult> {
    const payload: Record<string, unknown> = {
      chat_id: chatId,
      text
    };
    if (options.threadId) payload.message_thread_id = Number(options.threadId);
    const response = await this.call<{ message_id?: number }>("sendMessage", payload);
    const messageId = response.result?.message_id === undefined ? null : String(response.result.message_id);
    return {
      ok: response.ok,
      messageId,
      summary: response.ok
        ? `Sent Telegram text message${messageId ? ` ${messageId}` : ""}.`
        : `Telegram send failed: code=${response.error_code ?? "unknown"} msg=${response.description ?? "unknown"}`,
      raw: response
    };
  }

  private async poll(onUpdate: (update: TelegramUpdate) => void | Promise<void>): Promise<void> {
    while (this.running) {
      try {
        const response = await this.call<TelegramUpdate[]>("getUpdates", {
          offset: this.offset ?? undefined,
          timeout: this.config.pollTimeoutSeconds,
          allowed_updates: ["message"]
        });
        if (response.ok) {
          for (const update of response.result ?? []) {
            this.offset = update.update_id + 1;
            await onUpdate(update);
          }
        }
      } catch (error) {
        console.error(error instanceof Error ? error.message : String(error));
        await sleep(1000);
      }
    }
  }

  private async call<T>(method: string, payload: Record<string, unknown>): Promise<TelegramApiResponse<T>> {
    const response = await fetch(`https://api.telegram.org/bot${this.config.botToken}/${method}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload)
    });
    return await response.json() as TelegramApiResponse<T>;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
