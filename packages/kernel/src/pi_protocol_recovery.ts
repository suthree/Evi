import { createHash } from "node:crypto";
import { AgentHarness, Session, type AgentMessage } from "@earendil-works/pi-agent-core";
import type { ActionGatewayResult, JsonObject } from "./action_types.js";
import { ActionGateway } from "./action_gateway.js";
import type { RunExecutionLease } from "./execution_types.js";
import { SqliteRuntimeStore } from "./sqlite_runtime_store.js";

type AssistantAgentMessage = Extract<AgentMessage, { role: "assistant" }>;
type PiToolCall = Extract<AssistantAgentMessage["content"][number], { type: "toolCall" }>;

export async function reconcileInterruptedPiProtocol(input: {
  store: SqliteRuntimeStore;
  session: Session;
  harness: AgentHarness;
  gateway: ActionGateway;
  execution: RunExecutionLease;
  run_id: string;
  turn_id: string;
  signal: AbortSignal;
}): Promise<string | null> {
  if (!input.execution.recovery_of_execution_id) return null;
  const recoveryEntries = input.store.getRecoveryPiSessionEntries(input.execution);
  const context = await input.session.buildContext();
  const outstanding = findOutstandingToolCalls(context.messages);
  let unresolved = false;
  for (const toolCall of outstanding) {
    if (input.signal.aborted) throw new Error("Run execution aborted during Pi protocol recovery.");
    const result = await input.gateway.invoke({
      run_id: input.run_id,
      turn_id: input.turn_id,
      invocation_id: toolCall.id,
      action_name: toolCall.name,
      arguments: toolCall.arguments
    }, input.signal);
    await input.harness.appendMessage(toRecoveredToolResult(toolCall, result));
    unresolved ||= result.status === "outcome_unknown";
  }
  if (unresolved) {
    throw new Error("Pi protocol recovery paused because an Action outcome remains unknown.");
  }
  if (outstanding.length > 0) return null;

  const currentLast = context.messages.at(-1);
  const recoveredLast = recoveryEntries
    .map(messageFromPiEntry)
    .filter((message): message is AgentMessage => message !== null)
    .at(-1);
  if (!isRecoverableFinalAssistant(currentLast)
    || !isRecoverableFinalAssistant(recoveredLast)
    || messageDigest(currentLast) !== messageDigest(recoveredLast)) {
    return null;
  }
  input.store.reconcileRecoveredModelDispatch(input.execution, {
    stop_reason: currentLast.stopReason,
    message_digest: messageDigest(currentLast)
  });
  return assistantText(currentLast);
}

export function toPiToolResult(
  result: ActionGatewayResult
): { content: Array<{ type: "text"; text: string }>; details: JsonObject } {
  if (result.status === "denied") {
    throw new Error(`Action denied by Action Gateway: ${result.reason}`);
  }
  if (result.status === "outcome_unknown") {
    throw new Error(
      `Action outcome unknown for reservation ${result.reservation.id}; reconcile it without replay.`
    );
  }
  if (result.receipt.outcome === "failed") {
    throw new Error(`Action failed with receipt ${result.receipt.id}: ${result.receipt.summary}`);
  }
  return {
    content: [{
      type: "text",
      text: `${result.receipt.summary}\n${JSON.stringify(result.receipt.output)}`
    }],
    details: {
      reservation_id: result.reservation.id,
      receipt_id: result.receipt.id,
      outcome: result.receipt.outcome,
      reconciled: result.receipt.reconciled,
      output: result.receipt.output
    }
  };
}

export function assistantText(message: AgentMessage): string {
  if (message.role !== "assistant") return "";
  return message.content
    .filter((part): part is Extract<(typeof message.content)[number], { type: "text" }> => part.type === "text")
    .map((part) => part.text)
    .join("");
}

function findOutstandingToolCalls(messages: AgentMessage[]): PiToolCall[] {
  const pending = new Map<string, PiToolCall>();
  const completed = new Set<string>();
  for (const message of messages) {
    if (message.role === "assistant") {
      const calls = message.content.filter((part): part is PiToolCall => part.type === "toolCall");
      if (calls.length > 0 && pending.size > 0) {
        throw new Error("Pi session contains a new assistant message before prior tool calls closed.");
      }
      for (const call of calls) {
        if (pending.has(call.id) || completed.has(call.id)) {
          throw new Error(`Pi session reuses tool call identity: ${call.id}`);
        }
        pending.set(call.id, call);
      }
      continue;
    }
    if (message.role === "toolResult") {
      const call = pending.get(message.toolCallId);
      if (!call || call.name !== message.toolName) {
        throw new Error(`Pi session tool result identity is invalid: ${message.toolCallId}`);
      }
      pending.delete(message.toolCallId);
      completed.add(message.toolCallId);
      continue;
    }
    if (message.role === "user" && pending.size > 0) {
      throw new Error("Pi session contains a user message before prior tool calls closed.");
    }
  }
  return [...pending.values()];
}

function toRecoveredToolResult(toolCall: PiToolCall, result: ActionGatewayResult): AgentMessage {
  let content: Array<{ type: "text"; text: string }>;
  let details: JsonObject;
  let isError = false;
  try {
    const terminal = toPiToolResult(result);
    content = terminal.content;
    details = terminal.details;
  } catch (error) {
    content = [{ type: "text", text: errorMessage(error) }];
    details = {};
    isError = true;
  }
  return {
    role: "toolResult",
    toolCallId: toolCall.id,
    toolName: toolCall.name,
    content,
    details,
    isError,
    timestamp: Date.now()
  };
}

function messageFromPiEntry(entry: unknown): AgentMessage | null {
  if (!entry || typeof entry !== "object" || !("type" in entry) || entry.type !== "message"
    || !("message" in entry) || !entry.message || typeof entry.message !== "object") {
    return null;
  }
  return entry.message as AgentMessage;
}

function isRecoverableFinalAssistant(message: AgentMessage | undefined): message is AssistantAgentMessage {
  return message?.role === "assistant"
    && message.stopReason !== "error"
    && message.stopReason !== "aborted"
    && !message.content.some((part) => part.type === "toolCall")
    && assistantText(message).trim().length > 0;
}

function messageDigest(message: AgentMessage): string {
  return createHash("sha256").update(JSON.stringify(message)).digest("hex");
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
