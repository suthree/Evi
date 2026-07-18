import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  runDeploymentCommand,
  type DeploymentCommandOptions
} from "../apps/cli/src/deployment_command.js";

test("deployment command exposes status and history as CLI-visible JSON", async () => {
  const stateRoot = await mkdtemp(join(tmpdir(), "evi-deployment-command-"));
  try {
    const status = await captureDeploymentCommand(baseOptions(stateRoot));
    assert.equal(status.exitCode, 0);
    assert.equal(status.output.action, "status");

    const history = await captureDeploymentCommand({
      ...baseOptions(stateRoot),
      action: "history"
    });
    assert.equal(history.exitCode, 0);
    assert.equal(history.output.action, "history");
    assert.equal(history.output.boundary, "read-only local deployment history");
    assert.deepEqual(history.output.deployments, []);
  } finally {
    await rm(stateRoot, { recursive: true, force: true });
  }
});

test("deployment command preserves the CLI error for a missing failure reason", async () => {
  const stateRoot = await mkdtemp(join(tmpdir(), "evi-deployment-command-"));
  try {
    await assert.rejects(
      runDeploymentCommand({
        ...baseOptions(stateRoot),
        action: "fail",
        deploymentId: "deployment_candidate"
      }),
      /deployment fail requires --reason/
    );
  } finally {
    await rm(stateRoot, { recursive: true, force: true });
  }
});

function baseOptions(stateRoot: string): DeploymentCommandOptions {
  return {
    configDir: "config",
    repoRoot: process.cwd(),
    stateRoot,
    limit: 5,
    serviceTarget: "runtime",
    enableIm: false,
    enableWeb: false,
    webHost: "127.0.0.1",
    webPort: 8787,
    verificationRefs: [],
    evidenceRefs: []
  };
}

async function captureDeploymentCommand(options: DeploymentCommandOptions): Promise<{
  exitCode: number;
  output: Record<string, unknown>;
}> {
  const messages: string[] = [];
  const originalLog = console.log;
  console.log = (...args: unknown[]) => messages.push(args.map(String).join(" "));
  try {
    const exitCode = await runDeploymentCommand(options);
    assert.equal(messages.length, 1);
    return {
      exitCode,
      output: JSON.parse(messages[0]!) as Record<string, unknown>
    };
  } finally {
    console.log = originalLog;
  }
}
