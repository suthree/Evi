import * as Lark from "@larksuiteoapi/node-sdk";
import { randomUUID } from "node:crypto";
import { assertFeishuConfigReady } from "./config.js";
import type {
  FeishuChannelConfig,
  FeishuDomain,
  FeishuInboundEvent,
  FeishuSendResult,
  FeishuTransport
} from "./types.js";

type LarkClient = InstanceType<typeof Lark.Client>;
type LarkWsClient = InstanceType<typeof Lark.WSClient>;

export class LarkSdkFeishuTransport implements FeishuTransport {
  private readonly config: FeishuChannelConfig;
  private readonly client: LarkClient;
  private wsClient: LarkWsClient | null = null;

  constructor(config: FeishuChannelConfig) {
    assertFeishuConfigReady(config);
    this.config = config;
    this.client = new Lark.Client({
      appId: config.appId,
      appSecret: config.appSecret,
      appType: Lark.AppType.SelfBuild,
      domain: resolveLarkDomain(config.domain),
      loggerLevel: Lark.LoggerLevel.warn,
      source: "local-agent-feishu"
    });
  }

  async start(onMessage: (event: FeishuInboundEvent) => void | Promise<void>): Promise<void> {
    const dispatcher = new Lark.EventDispatcher({}).register({
      "im.message.receive_v1": async (data: FeishuInboundEvent) => {
        await onMessage(data);
      }
    });
    this.wsClient = new Lark.WSClient({
      appId: this.config.appId,
      appSecret: this.config.appSecret,
      domain: resolveLarkDomain(this.config.domain),
      loggerLevel: Lark.LoggerLevel.info,
      source: "local-agent-feishu",
      wsConfig: {
        pingTimeout: 3
      }
    });
    await this.wsClient.start({ eventDispatcher: dispatcher });
  }

  async stop(): Promise<void> {
    this.wsClient?.close();
    this.wsClient = null;
  }

  async sendText(openId: string, text: string): Promise<FeishuSendResult> {
    return this.sendTextToReceiveId(openId, "open_id", text);
  }

  async sendTextToChat(chatId: string, text: string): Promise<FeishuSendResult> {
    return this.sendTextToReceiveId(chatId, "chat_id", text);
  }

  private async sendTextToReceiveId(
    receiveId: string,
    receiveIdType: "open_id" | "chat_id",
    text: string
  ): Promise<FeishuSendResult> {
    const response = await this.client.im.message.create({
      data: {
        receive_id: receiveId,
        msg_type: "text",
        content: JSON.stringify({ text }),
        uuid: randomUUID()
      },
      params: {
        receive_id_type: receiveIdType
      }
    });
    const code = response?.code ?? 0;
    const ok = code === 0;
    const messageId = response?.data?.message_id ?? null;
    return {
      ok,
      messageId,
      summary: ok
        ? `Sent Feishu text message${messageId ? ` ${messageId}` : ""}.`
        : `Feishu send failed: code=${code} msg=${response?.msg ?? "unknown"}`,
      raw: response
    };
  }
}

function resolveLarkDomain(domain: FeishuDomain): Lark.Domain {
  return domain === "lark" ? Lark.Domain.Lark : Lark.Domain.Feishu;
}
