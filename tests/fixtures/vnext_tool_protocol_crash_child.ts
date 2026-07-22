import {
  createModels,
  fauxAssistantMessage,
  fauxProvider,
  fauxToolCall
} from "@earendil-works/pi-ai";
import { ActionGateway } from "../../packages/kernel/src/action_gateway.js";
import { KernelRuntime } from "../../packages/kernel/src/kernel_runtime.js";
import { PiAgentHarnessLoopFactory } from "../../packages/kernel/src/pi_agent_harness_adapter.js";
import { createRuntimeInspectAction } from "../../packages/kernel/src/runtime_inspect_action.js";
import { SqliteRuntimeStore } from "../../packages/kernel/src/sqlite_runtime_store.js";

type CrashPoint =
  | "assistant_persisted"
  | "reservation_persisted"
  | "receipt_persisted"
  | "tool_result_persisted"
  | "final_assistant_persisted";

const [dbPath, cwd, crashPointInput] = process.argv.slice(2);
if (!dbPath || !cwd || !isCrashPoint(crashPointInput)) {
  throw new Error("Tool protocol crash fixture requires a database path, cwd, and crash point.");
}
const crashPoint = crashPointInput;
const store = new SqliteRuntimeStore(dbPath);
installCrashPoint(store, crashPoint);

const models = createModels();
const faux = fauxProvider({ provider: `kernel-tool-protocol-child-${process.pid}` });
models.setProvider(faux.provider);
faux.setResponses(crashPoint === "final_assistant_persisted"
  ? [fauxAssistantMessage("The persisted assistant answer survived without another provider call.")]
  : [
      fauxAssistantMessage(
        fauxToolCall("runtime_inspect", {}, { id: "protocol-recovery-call" }),
        { stopReason: "toolUse" }
      ),
      async () => await new Promise<never>(() => undefined)
    ]);

const gateway = new ActionGateway(store, [createRuntimeInspectAction(store)]);
const runtime = new KernelRuntime(
  store,
  gateway,
  new PiAgentHarnessLoopFactory({
    store,
    models,
    model: faux.getModel(),
    cwd
  }),
  { execution_lease_ms: 300 }
);

await runtime.submit({ request: "Recover this exact tool protocol without replay." });

function installCrashPoint(runtimeStore: SqliteRuntimeStore, point: CrashPoint): void {
  const appendEntry = runtimeStore.appendPiSessionEntry.bind(runtimeStore);
  runtimeStore.appendPiSessionEntry = (sessionId, entry) => {
    const message = sessionMessage(entry);
    const assistantHasToolCall = message?.role === "assistant"
      && message.content.some((part) => part.type === "toolCall");
    if (point === "assistant_persisted" && assistantHasToolCall) {
      appendEntry(sessionId, entry);
      blockAt(point);
    }
    if (point === "final_assistant_persisted"
      && message?.role === "assistant"
      && !assistantHasToolCall) {
      appendEntry(sessionId, entry);
      blockAt(point);
    }
    if (point === "receipt_persisted" && message?.role === "toolResult") {
      blockAt(point);
    }
    appendEntry(sessionId, entry);
    if (point === "tool_result_persisted" && message?.role === "toolResult") {
      blockAt(point);
    }
  };

  if (point === "reservation_persisted") {
    const reserveAction = runtimeStore.reserveAction.bind(runtimeStore);
    runtimeStore.reserveAction = (input) => {
      const reserved = reserveAction(input);
      if (reserved.created) blockAt(point);
      return reserved;
    };
  }
}

function sessionMessage(entry: unknown): Record<string, any> | null {
  if (!entry || typeof entry !== "object" || !("type" in entry) || entry.type !== "message"
    || !("message" in entry) || !entry.message || typeof entry.message !== "object") {
    return null;
  }
  return entry.message as Record<string, any>;
}

function blockAt(point: CrashPoint): never {
  process.stdout.write(`CRASH_POINT:${point}\n`);
  const lock = new Int32Array(new SharedArrayBuffer(4));
  Atomics.wait(lock, 0, 0);
  throw new Error("unreachable");
}

function isCrashPoint(value: string | undefined): value is CrashPoint {
  return [
    "assistant_persisted",
    "reservation_persisted",
    "receipt_persisted",
    "tool_result_persisted",
    "final_assistant_persisted"
  ].includes(value ?? "");
}
