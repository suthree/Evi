import {
  resolveServiceDefinition,
  resolveServiceConfigSelectors,
  type ServiceTarget
} from "../../../packages/runtime/src/service.js";
import {
  DeploymentControllerHandoffRequiredError,
  getLocalDeploymentStatus,
  handoffDeploymentController,
  listLocalDeployments,
  reconcileLocalDeploymentBaseline,
  reportLocalDeploymentFailure,
  requestLocalDeployment
} from "../../../packages/runtime/src/deployment.js";
import type { ImProvider } from "../../../packages/runtime/src/im_config.js";

type DeploymentAction = "request" | "reconcile" | "controller-handoff" | "status" | "fail" | "history";

export interface DeploymentCommandOptions {
  action?: DeploymentAction;
  configDir: string;
  repoRoot: string;
  stateRoot?: string;
  limit: number;
  serviceTarget: ServiceTarget;
  provider?: ImProvider;
  channelId?: string;
  scenarioId?: string;
  enableIm: boolean;
  enableWeb: boolean;
  webHost: string;
  webPort: number;
  deploymentId?: string;
  repairOf?: string;
  verificationRefs: string[];
  evidenceRefs: string[];
  reason?: string;
}

export async function runDeploymentCommand(options: DeploymentCommandOptions): Promise<number> {
  const action = options.action ?? "status";
  const selectors = await resolveServiceConfigSelectors({
    target: options.serviceTarget,
    configDir: options.configDir,
    stateRoot: options.stateRoot
  });
  if (action === "request") {
    const definition = await resolveDeploymentServiceDefinition(options, selectors.stateRoot, "restart", true);
    try {
      const result = await requestLocalDeployment(definition, {
        verificationRefs: options.verificationRefs,
        repairOf: options.repairOf
      });
      console.log(JSON.stringify({ action, ...result }, null, 2));
      return 0;
    } catch (error) {
      if (!(error instanceof DeploymentControllerHandoffRequiredError)) throw error;
      console.log(JSON.stringify({
        action,
        code: error.code,
        controller_readiness: error.readiness
      }, null, 2));
      return 1;
    }
  }
  if (action === "reconcile") {
    const definition = await resolveDeploymentServiceDefinition(options, selectors.stateRoot, "status", false);
    const result = await reconcileLocalDeploymentBaseline(definition, {
      reason: required(options.reason, "deployment reconcile requires --reason"),
      verificationRefs: options.verificationRefs
    });
    console.log(JSON.stringify({ action, ...result }, null, 2));
    return 0;
  }
  if (action === "controller-handoff") {
    const definition = await resolveDeploymentServiceDefinition(options, selectors.stateRoot, "status", false);
    const result = await handoffDeploymentController(definition);
    console.log(JSON.stringify(result, null, 2));
    return result.ok ? 0 : 1;
  }
  if (action === "fail") {
    const result = await reportLocalDeploymentFailure(selectors.stateRoot, {
      deploymentId: options.deploymentId,
      reason: required(options.reason, "deployment fail requires --reason"),
      evidenceRefs: options.evidenceRefs
    });
    console.log(JSON.stringify({ action, ...result }, null, 2));
    return 0;
  }
  if (action === "history") {
    console.log(JSON.stringify({
      action,
      boundary: "read-only local deployment history",
      deployments: await listLocalDeployments(selectors.stateRoot, options.limit)
    }, null, 2));
    return 0;
  }
  console.log(JSON.stringify({ action, ...await getLocalDeploymentStatus(selectors.stateRoot) }, null, 2));
  return 0;
}

async function resolveDeploymentServiceDefinition(
  options: DeploymentCommandOptions,
  stateRoot: string,
  action: "restart" | "status",
  requireScenario: boolean
) {
  return resolveServiceDefinition({
    action,
    target: options.serviceTarget,
    configDir: options.configDir,
    repoRoot: options.repoRoot,
    stateRoot,
    provider: options.provider,
    channelId: options.channelId,
    scenarioId: options.scenarioId,
    enableIm: options.enableIm,
    enableWeb: options.enableWeb,
    webHost: options.webHost,
    webPort: options.webPort
  }, requireScenario);
}

function required<T>(value: T | undefined, message: string): T {
  if (!value) throw new Error(message);
  return value;
}
