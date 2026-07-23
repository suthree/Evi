import { runDurableCodexDispatchWorker } from "./tools.js";

const chunks: Buffer[] = [];
process.stdin.on("data", (chunk: Buffer) => {
  chunks.push(chunk);
});
process.stdin.once("end", () => {
  const raw = Buffer.concat(chunks).toString("utf8");
  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    process.exitCode = 1;
    return;
  }
  runDurableCodexDispatchWorker(payload).catch(() => {
    process.exitCode = 1;
  });
});
