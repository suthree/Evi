import { basename } from "node:path";
import type { CapabilityLayer } from "./capabilities.js";
import { newId, utcNow } from "./ids.js";
import type { ExpertOrchestrationRoleId } from "./expert_orchestration.js";
import type { GaProjectDesignImplementationContract } from "./ga_project_design.js";
import type { AgentStore } from "./store.js";

export interface SelfEvolutionIterationContract {
  schema_version: 1;
  id: string;
  ref: string;
  kind: "self_evolution_iteration_contract";
  status: "recorded";
  summary: string;
  layer: CapabilityLayer;
  owner_surface: string;
  proposed_slice: string;
  source_ref?: string;
  implementation_contract?: GaProjectDesignImplementationContract;
  evidence_refs: string[];
  verification_commands: string[];
  non_goals: string[];
  advisory_expert_roles: ExpertOrchestrationRoleId[];
  outcome?: SelfEvolutionIterationOutcome;
  created_at: string;
  boundary: string;
}

export type SelfEvolutionIterationOutcomeStatus = "verified" | "partial" | "failed";

export interface SelfEvolutionIterationOutcome {
  status: SelfEvolutionIterationOutcomeStatus;
  summary: string;
  evidence_refs: string[];
  verification_commands: string[];
  verification_claims: string[];
  next_moves: string[];
  recorded_at: string;
  boundary: string;
}

export interface SelfEvolutionIterationListResult {
  action: "iterations";
  created_at: string;
  count: number;
  iteration_refs: string[];
  iterations: SelfEvolutionIterationContract[];
  boundary: string;
}

export interface SelfEvolutionIterationDetailResult {
  action: "iterations";
  iteration: SelfEvolutionIterationContract;
  boundary: string;
}

export interface SelfEvolutionIterationRecordResult {
  action: "record-iteration";
  created: boolean;
  reused_existing: boolean;
  iteration: SelfEvolutionIterationContract;
  inspect_command: string;
  boundary: string;
}

export interface SelfEvolutionIterationOutcomeRecordResult {
  action: "record-iteration-outcome";
  iteration: SelfEvolutionIterationContract;
  inspect_command: string;
  boundary: string;
}

const ITERATION_ROOT = "self-evolution/iterations";
const ITERATION_BOUNDARY = "self-evolution iteration contract writes one bounded local state record only; it declares layer, owner surface, evidence, verification commands, and advisory expert roles; it does not invoke models, execute tools, mutate repo files, write the active vault, manage services, publish externally, promote SOPs, promote skills, or prove completion";
const OUTCOME_BOUNDARY = "self-evolution iteration outcome updates one existing local iteration record only; it records operator-supplied verification evidence and next moves; it does not run verification commands, invoke models, execute tools, mutate repo files, write the active vault, manage services, publish externally, promote SOPs, promote skills, or prove completion beyond the cited evidence";

export async function recordSelfEvolutionIteration(
  store: AgentStore,
  args: {
    summary: string;
    layer: CapabilityLayer;
    ownerSurface: string;
    proposedSlice: string;
    sourceRef?: string;
    implementationContract?: GaProjectDesignImplementationContract;
    evidenceRefs?: string[];
    verificationCommands?: string[];
    nonGoals?: string[];
    reuseOpen?: boolean;
  }
): Promise<SelfEvolutionIterationRecordResult> {
  const summary = args.summary.trim();
  const ownerSurface = args.ownerSurface.trim();
  const proposedSlice = args.proposedSlice.trim();
  const sourceRef = args.sourceRef?.trim();
  if (!summary) throw new Error("self-evolution iteration summary is required");
  if (!ownerSurface) throw new Error("self-evolution iteration owner surface is required");
  if (!proposedSlice) throw new Error("self-evolution iteration proposed slice is required");
  if (args.reuseOpen) {
    const existing = (await readSelfEvolutionIterations(store)).find((iteration) =>
      !iteration.outcome
      && iteration.layer === args.layer
      && iteration.owner_surface === ownerSurface
      && iteration.proposed_slice === proposedSlice
      && (iteration.source_ref ?? "") === (sourceRef ?? "")
    );
    if (existing) {
      const implementationContract = mergeOpenImplementationContract(
        existing.implementation_contract,
        args.implementationContract
      );
      const iteration = implementationContract === existing.implementation_contract
        ? existing
        : { ...existing, implementation_contract: implementationContract };
      if (iteration !== existing) await store.writeJson(iteration.ref, iteration);
      return {
        action: "record-iteration",
        created: false,
        reused_existing: true,
        iteration,
        inspect_command: `pnpm run runtime -- governance iterations --iteration ${iteration.id} --state-root <state-root>`,
        boundary: iteration === existing
          ? `${ITERATION_BOUNDARY}; reused existing open iteration matching layer, owner surface, proposed slice, and source ref; no new state record was written`
          : `${ITERATION_BOUNDARY}; reused existing open iteration matching layer, owner surface, proposed slice, and source ref; persisted supplied implementation contract fields on the existing state record`
      };
    }
  }
  const id = newId("iteration_contract");
  const ref = `${ITERATION_ROOT}/${id}.json`;
  const iteration: SelfEvolutionIterationContract = {
    schema_version: 1,
    id,
    ref,
    kind: "self_evolution_iteration_contract",
    status: "recorded",
    summary,
    layer: args.layer,
    owner_surface: ownerSurface,
    proposed_slice: proposedSlice,
    ...(sourceRef ? { source_ref: sourceRef } : {}),
    ...(args.implementationContract ? { implementation_contract: args.implementationContract } : {}),
    evidence_refs: compact(args.evidenceRefs ?? []),
    verification_commands: compact(args.verificationCommands ?? [
      "pnpm run check",
      "pnpm run runtime -- governance scorecard --state-root <state-root>",
      "pnpm run runtime -- governance iterations --iteration <iteration-ref> --state-root <state-root>"
    ]),
    non_goals: compact(args.nonGoals ?? [
      "does not execute the proposed slice",
      "does not prove completion",
      "does not grant external-write, service-control, repo-write, SOP-promotion, or active-vault authority"
    ]),
    advisory_expert_roles: rolesForLayer(args.layer),
    created_at: utcNow(),
    boundary: ITERATION_BOUNDARY
  };
  await store.writeJson(ref, iteration);
  return {
    action: "record-iteration",
    created: true,
    reused_existing: false,
    iteration,
    inspect_command: `pnpm run runtime -- governance iterations --iteration ${id} --state-root <state-root>`,
    boundary: ITERATION_BOUNDARY
  };
}

function mergeOpenImplementationContract(
  existing: GaProjectDesignImplementationContract | undefined,
  supplied: GaProjectDesignImplementationContract | undefined
): GaProjectDesignImplementationContract | undefined {
  if (!existing || !supplied) return existing ?? supplied;
  const intent = existing.intent ?? supplied.intent;
  const acceptanceCriteria = existing.acceptance_criteria ?? supplied.acceptance_criteria;
  const requiredVerificationEntrypoints = existing.required_verification_entrypoints ?? supplied.required_verification_entrypoints;
  const delegationContract = existing.delegation_contract ?? supplied.delegation_contract;
  const outcomeEvidenceScope = existing.outcome_evidence_scope ?? supplied.outcome_evidence_scope;
  const rollbackStrategy = existing.rollback_strategy ?? supplied.rollback_strategy;
  if (intent === existing.intent
    && acceptanceCriteria === existing.acceptance_criteria
    && requiredVerificationEntrypoints === existing.required_verification_entrypoints
    && delegationContract === existing.delegation_contract
    && outcomeEvidenceScope === existing.outcome_evidence_scope
    && rollbackStrategy === existing.rollback_strategy) {
    return existing;
  }
  return {
    ...existing,
    ...(intent ? { intent } : {}),
    ...(acceptanceCriteria ? { acceptance_criteria: acceptanceCriteria } : {}),
    ...(requiredVerificationEntrypoints ? { required_verification_entrypoints: requiredVerificationEntrypoints } : {}),
    ...(delegationContract ? { delegation_contract: delegationContract } : {}),
    ...(outcomeEvidenceScope ? { outcome_evidence_scope: outcomeEvidenceScope } : {}),
    ...(rollbackStrategy ? { rollback_strategy: rollbackStrategy } : {})
  };
}

export async function listSelfEvolutionIterations(
  store: AgentStore,
  args: { limit?: number } = {}
): Promise<SelfEvolutionIterationListResult> {
  const iterations = await readSelfEvolutionIterations(store);
  const limit = args.limit === undefined ? iterations.length : Math.max(0, args.limit);
  const selected = iterations.slice(0, limit);
  return {
    action: "iterations",
    created_at: utcNow(),
    count: selected.length,
    iteration_refs: selected.map((iteration) => iteration.ref),
    iterations: selected,
    boundary: ITERATION_BOUNDARY
  };
}

export async function getSelfEvolutionIteration(
  store: AgentStore,
  args: { iterationRef: string }
): Promise<SelfEvolutionIterationDetailResult> {
  const requested = args.iterationRef.trim();
  const iteration = (await readSelfEvolutionIterations(store)).find((item) =>
    item.id === requested
    || item.ref === requested
    || basename(item.ref) === requested
  );
  if (!iteration) throw new Error(`Self-evolution iteration not found: ${args.iterationRef}`);
  return {
    action: "iterations",
    iteration,
    boundary: ITERATION_BOUNDARY
  };
}

export async function recordSelfEvolutionIterationOutcome(
  store: AgentStore,
  args: {
    iterationRef: string;
    status: SelfEvolutionIterationOutcomeStatus;
    summary: string;
    evidenceRefs?: string[];
    verificationCommands?: string[];
    verificationClaims?: string[];
    nextMoves?: string[];
    mergeExisting?: boolean;
  }
): Promise<SelfEvolutionIterationOutcomeRecordResult> {
  const summary = args.summary.trim();
  if (!summary) throw new Error("self-evolution iteration outcome summary is required");
  const detail = await getSelfEvolutionIteration(store, { iterationRef: args.iterationRef });
  const existing = args.mergeExisting ? detail.iteration.outcome : undefined;
  const outcome: SelfEvolutionIterationOutcome = {
    status: args.status,
    summary,
    evidence_refs: compact([...(existing?.evidence_refs ?? []), ...(args.evidenceRefs ?? [])]),
    verification_commands: compact([...(existing?.verification_commands ?? []), ...(args.verificationCommands ?? [])]),
    verification_claims: compact([...(existing?.verification_claims ?? []), ...(args.verificationClaims ?? [])]),
    next_moves: compact([...(existing?.next_moves ?? []), ...(args.nextMoves ?? [])]),
    recorded_at: utcNow(),
    boundary: args.mergeExisting
      ? `${OUTCOME_BOUNDARY}; merged existing outcome evidence refs, verification commands, verification claims, and next moves before adding supplied values`
      : OUTCOME_BOUNDARY
  };
  const iteration = { ...detail.iteration, outcome };
  await store.writeJson(iteration.ref, iteration);
  return {
    action: "record-iteration-outcome",
    iteration,
    inspect_command: `pnpm run runtime -- governance iterations --iteration ${iteration.id} --state-root <state-root>`,
    boundary: OUTCOME_BOUNDARY
  };
}

export async function getLatestSelfEvolutionIteration(
  store: AgentStore
): Promise<SelfEvolutionIterationContract | null> {
  return (await readSelfEvolutionIterations(store))[0] ?? null;
}

async function readSelfEvolutionIterations(store: AgentStore): Promise<SelfEvolutionIterationContract[]> {
  const items: SelfEvolutionIterationContract[] = [];
  for (const ref of (await store.listStateFiles(ITERATION_ROOT)).filter((item) => item.endsWith(".json"))) {
    const record = await store.readStateJson<unknown>(ref);
    if (isIteration(record)) items.push(record);
  }
  return items.sort((a, b) => b.created_at.localeCompare(a.created_at) || b.id.localeCompare(a.id));
}

function isIteration(value: unknown): value is SelfEvolutionIterationContract {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return record.schema_version === 1
    && record.kind === "self_evolution_iteration_contract"
    && typeof record.id === "string"
    && typeof record.ref === "string"
    && typeof record.summary === "string"
    && typeof record.layer === "string"
    && typeof record.owner_surface === "string"
    && typeof record.proposed_slice === "string";
}

function rolesForLayer(layer: CapabilityLayer): ExpertOrchestrationRoleId[] {
  if (layer === "core_runtime") return ["architect", "verification_reviewer", "orchestration_planner"];
  if (layer === "basic_entrypoint") return ["runtime_operator", "verification_reviewer"];
  if (layer === "local_learning") return ["learning_curator", "verification_reviewer"];
  if (layer === "application_slice") return ["architect", "runtime_operator", "verification_reviewer"];
  return ["verification_reviewer"];
}

function compact(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}
