import { createModels, fauxProvider } from "@earendil-works/pi-ai";
import { ActionGateway } from "../../packages/kernel/src/action_gateway.js";
import { KernelRuntime } from "../../packages/kernel/src/kernel_runtime.js";
import { PiAgentHarnessLoopFactory } from "../../packages/kernel/src/pi_agent_harness_adapter.js";
import { SqliteRuntimeStore } from "../../packages/kernel/src/sqlite_runtime_store.js";

const [dbPath, cwd] = process.argv.slice(2);
if (!dbPath || !cwd) throw new Error("Crash fixture requires a database path and working directory.");

const models = createModels();
const faux = fauxProvider({ provider: `kernel-crash-child-${process.pid}` });
models.setProvider(faux.provider);
faux.setResponses([
  async () => {
    process.stdout.write("PROVIDER_ENTERED\n");
    return await new Promise<never>(() => undefined);
  }
]);

const store = new SqliteRuntimeStore(dbPath);
const gateway = new ActionGateway(store, []);
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

await runtime.submit({ request: "Finish this Run after surviving a provider-process crash." });
