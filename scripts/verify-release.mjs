import { closeSync, copyFileSync, existsSync, mkdirSync, openSync, rmSync } from "node:fs";
import { cp, lstat, mkdtemp, mkdir } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { spawn, spawnSync } from "node:child_process";

const repoRoot = resolve(import.meta.dirname, "..");
const keep = process.argv.includes("--keep");
const root = await mkdtemp(resolve(tmpdir(), "local-runtime-release-"));
const sourceRoot = resolve(root, "source");
const userHome = resolve(root, "user-home");
const runtimeHome = resolve(root, "runtime-home");
const stateRoot = resolve(runtimeHome, "state/runtime");
const logRoot = resolve(root, "logs");
let completed = false;

try {
  await copyVersionedWorkspace(sourceRoot);
  await mkdir(resolve(runtimeHome, "config"), { recursive: true });
  await mkdir(userHome, { recursive: true });
  await mkdir(logRoot, { recursive: true });
  copyFileSync(
    resolve(sourceRoot, "config/auth.example.jsonl"),
    resolve(runtimeHome, "config/auth.jsonl")
  );

  const env = {
    ...process.env,
    HOME: userHome,
    LOCAL_RUNTIME_HOME: runtimeHome,
    LOCAL_RUNTIME_MODEL_API_KEY: "release-template-model-key",
    LOCAL_RUNTIME_FEISHU_APP_ID: "release-template-app-id",
    LOCAL_RUNTIME_FEISHU_APP_SECRET: "release-template-app-secret",
    LOCAL_RUNTIME_TELEGRAM_BOT_TOKEN: "release-template-telegram-token",
    LOCAL_RUNTIME_DISCORD_BOT_TOKEN: "release-template-discord-token"
  };

  run("pnpm", ["install", "--frozen-lockfile"], sourceRoot, env);
  run("pnpm", ["run", "check"], sourceRoot, env);
  run("pnpm", [
    "run", "runtime", "--", "doctor",
    "--config-dir", resolve(sourceRoot, "config"),
    "--state-root", stateRoot
  ], sourceRoot, env);

  const port = await reservePort();
  await verifyForegroundDaemon(sourceRoot, stateRoot, logRoot, port, env);

  completed = true;
  console.log(JSON.stringify({
    action: "release-verify",
    ok: true,
    mode: "isolated-structural-clean-room",
    versioned_workspace_only: true,
    external_model_call: false,
    external_im_delivery: false,
    checks: [
      "frozen dependency install",
      "build, tests, skills, and neutral naming",
      "template-backed doctor with model and IM auth placeholders",
      "foreground no-IM daemon and localhost Web API"
    ],
    temporary_root: keep ? root : null
  }, null, 2));
} catch (error) {
  console.error(`Release verification failed. Evidence retained at ${root}`);
  throw error;
} finally {
  if (completed && !keep) rmSync(root, { recursive: true, force: true });
}

async function copyVersionedWorkspace(targetRoot) {
  const listed = spawnSync(
    "git",
    ["ls-files", "--cached", "--others", "--exclude-standard", "-z"],
    { cwd: repoRoot, encoding: "buffer" }
  );
  if (listed.status !== 0) {
    throw new Error(listed.stderr.toString("utf8") || "git ls-files failed");
  }
  const paths = listed.stdout.toString("utf8").split("\0").filter(Boolean);
  for (const repoPath of paths) {
    const source = resolve(repoRoot, repoPath);
    if (!existsSync(source)) continue;
    const target = resolve(targetRoot, repoPath);
    await mkdir(dirname(target), { recursive: true });
    const info = await lstat(source);
    if (info.isDirectory()) continue;
    await cp(source, target, { dereference: false, preserveTimestamps: true });
  }
}

function run(command, args, cwd, env) {
  const result = spawnSync(command, args, { cwd, env, stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} exited with status ${result.status}`);
  }
}

async function verifyForegroundDaemon(sourceRoot, stateRoot, logRoot, port, env) {
  const stdoutPath = resolve(logRoot, "daemon.out.log");
  const stderrPath = resolve(logRoot, "daemon.err.log");
  const stdout = openSync(stdoutPath, "w");
  const stderr = openSync(stderrPath, "w");
  const child = spawn("pnpm", [
    "run", "runtime", "--", "daemon", "serve", "--no-im",
    "--config-dir", resolve(sourceRoot, "config"),
    "--state-root", stateRoot,
    "--host", "127.0.0.1",
    "--port", String(port)
  ], {
    cwd: sourceRoot,
    env,
    stdio: ["ignore", stdout, stderr]
  });

  try {
    const deadline = Date.now() + 30_000;
    let lastError;
    while (Date.now() < deadline) {
      if (child.exitCode !== null) {
        throw new Error(`foreground daemon exited early with status ${child.exitCode}; logs: ${logRoot}`);
      }
      try {
        const response = await fetch(`http://127.0.0.1:${port}/api/sessions`);
        if (response.ok) return;
        lastError = new Error(`Web API returned HTTP ${response.status}`);
      } catch (error) {
        lastError = error;
      }
      await new Promise((resolveDelay) => setTimeout(resolveDelay, 250));
    }
    throw lastError ?? new Error("foreground daemon did not become ready");
  } finally {
    if (child.exitCode === null) child.kill("SIGTERM");
    await Promise.race([
      new Promise((resolveExit) => child.once("exit", resolveExit)),
      new Promise((resolveDelay) => setTimeout(resolveDelay, 5_000))
    ]);
    if (child.exitCode === null) child.kill("SIGKILL");
    closeSync(stdout);
    closeSync(stderr);
  }
}

async function reservePort() {
  return new Promise((resolvePort, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : null;
      server.close((error) => {
        if (error) reject(error);
        else if (!port) reject(new Error("failed to reserve a localhost port"));
        else resolvePort(port);
      });
    });
  });
}
