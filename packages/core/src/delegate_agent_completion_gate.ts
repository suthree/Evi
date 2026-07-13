import { delegateAgentCompletionGateCheckId } from "./action_contracts.js";
import type { CompletionVerificationReport, DelegatedResult } from "./schemas.js";

export function delegatedResultsCheck(
  delegatedResults: DelegatedResult[],
  isDoneClaim: boolean,
  recoveryEvidenceRefs: string[] = []
): CompletionVerificationReport["checks"][number] {
  const failedDelegations = delegatedResults.filter((result) => !result.ok);
  let status: CompletionVerificationReport["checks"][number]["status"] = "skipped";
  if (failedDelegations.length > 0) {
    status = isDoneClaim && recoveryEvidenceRefs.length === 0 ? "fail" : "warning";
  } else if (delegatedResults.length > 0) {
    status = "pass";
  }
  const failureKinds = summarizeDelegatedResultFailureKinds(failedDelegations);
  return {
    id: delegateAgentCompletionGateCheckId.delegatedResults,
    status,
    summary: failedDelegations.length > 0
      ? recoveryEvidenceRefs.length > 0
        ? `Failed delegated result(s): ${failedDelegations.length}; result_failure_kinds=${failureKinds}; later main-harness recovery evidence recorded.`
        : `Failed delegated result(s): ${failedDelegations.length}; result_failure_kinds=${failureKinds}.`
      : delegatedResults.length > 0
        ? `All ${delegatedResults.length} delegated result(s) passed contract validation; they are not completion proof.`
        : "No delegated result was required for this completion claim.",
    refs: compactRefs([...delegatedResults.map((result) => result.id), ...recoveryEvidenceRefs])
  };
}

export function summarizeDelegatedResultFailureKindCounts(
  failedDelegations: DelegatedResult[]
): CompletionVerificationReport["delegated_result_failure_kinds"] {
  const counts = new Map<DelegatedResult["result_failure_kind"], number>();
  for (const result of failedDelegations) {
    const kind = result.result_failure_kind ?? "none";
    counts.set(kind, (counts.get(kind) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([result_failure_kind, count]) => ({ result_failure_kind, count }));
}

export function mainHarnessRecoveryEvidenceAfterDelegationFailure(args: {
  delegatedResults: DelegatedResult[];
  independentEvidenceRefs: string[];
  verificationEvidenceRounds: Map<string, number>;
}): string[] {
  const failedRounds = args.delegatedResults
    .filter((result) => !result.ok)
    .map((result) => result.round);
  if (failedRounds.length === 0) return [];
  const latestFailedRound = Math.max(...failedRounds);
  return compactRefs(args.independentEvidenceRefs.filter((ref) => {
    const evidenceRound = args.verificationEvidenceRounds.get(ref);
    return typeof evidenceRound === "number" && evidenceRound > latestFailedRound;
  }));
}

export function mainHarnessIndependentEvidenceAfterLatestDelegation(args: {
  delegatedResults: DelegatedResult[];
  independentEvidenceRefs: string[];
  verificationEvidenceRounds: Map<string, number>;
}): string[] {
  const delegatedRounds = args.delegatedResults.map((result) => result.round);
  if (delegatedRounds.length === 0) return args.independentEvidenceRefs;
  const latestDelegatedRound = Math.max(...delegatedRounds);
  return compactRefs(args.independentEvidenceRefs.filter((ref) => {
    const evidenceRound = args.verificationEvidenceRounds.get(ref);
    return typeof evidenceRound === "number" && evidenceRound > latestDelegatedRound;
  }));
}

export function delegatedVerificationRefs(
  claimedRefs: string[],
  delegatedResults: DelegatedResult[],
  delegatedArtifactRefs: string[]
): string[] {
  if (claimedRefs.length === 0 || delegatedResults.length === 0) return [];
  const delegatedProofRefSet = new Set([
    ...delegatedResults.map((result) => result.id),
    ...delegatedArtifactRefs
  ]);
  return compactRefs(claimedRefs.filter((ref) => delegatedProofRefSet.has(ref)));
}

function summarizeDelegatedResultFailureKinds(failedDelegations: DelegatedResult[]): string {
  return summarizeDelegatedResultFailureKindCounts(failedDelegations)
    .map((item) => `${item.result_failure_kind}:${item.count}`)
    .join(",");
}

function compactRefs(refs: Array<string | null | undefined>): string[] {
  return [...new Set(refs.filter((ref): ref is string => typeof ref === "string" && ref.length > 0))];
}
