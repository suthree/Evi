import { resolve } from "node:path";
import { AgentStore } from "../../../packages/core/src/store.js";
import { loadConfigSelectors } from "../../../packages/runtime/src/config.js";
import { LocalGitHubDiscoveryRadar } from "../../../packages/runtime/src/github_discovery_radar.js";

export type GitHubDiscoveryAction = "scan" | "reports" | "report";

export interface GitHubDiscoveryCommandOptions {
  action?: GitHubDiscoveryAction;
  configDir: string;
  repoRoot: string;
  stateRoot?: string;
  limit: number;
  businessNeed?: string;
  reportId?: string;
}

export async function runGitHubDiscoveryCommand(options: GitHubDiscoveryCommandOptions): Promise<number> {
  const action = options.action;
  if (!action) throw new Error("discovery github requires an action: scan, reports, or report");
  const selectors = await loadConfigSelectors({
    configDir: options.configDir,
    stateRoot: options.stateRoot
  });
  const radar = new LocalGitHubDiscoveryRadar(new AgentStore(resolve(options.repoRoot), selectors.stateRoot));
  if (action === "scan") {
    const report = await radar.scan({
      businessNeed: required(options.businessNeed, "discovery github scan requires --need"),
      limit: options.limit
    });
    console.log(JSON.stringify({ action, report }, null, 2));
    return report.status === "completed" ? 0 : 1;
  }
  if (action === "reports") {
    console.log(JSON.stringify({
      action,
      boundary: "read-only discovery report summaries; reports remain outside default context",
      reports: await radar.list({ limit: options.limit })
    }, null, 2));
    return 0;
  }
  const report = await radar.inspect({ reportId: required(options.reportId, "discovery github report requires --report") });
  if (!report) throw new Error("GitHub discovery report not found");
  console.log(JSON.stringify({ action, report }, null, 2));
  return 0;
}

function required<T>(value: T | undefined, message: string): T {
  if (!value) throw new Error(message);
  return value;
}
