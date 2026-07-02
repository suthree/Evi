import type { AuditReport, SOPDraft } from "./schemas.js";
import { auditReportSchema } from "./schemas.js";

export function auditSop(sop: SOPDraft): AuditReport {
  const checks = {
    evidence: sop.evidence_refs.length > 0 ? "pass" : "fail",
    trigger_clarity: sop.trigger.trim().length >= 40 ? "pass" : "fail",
    verification: sop.verification.trim().length >= 30 ? "pass" : "fail",
    failure_modes: sop.failure_modes.length > 0 ? "pass" : "fail",
    rollback_or_retirement: sop.failure_modes.some((item) => /revise|retire|archive|rollback|修订|退役|归档|回滚/i.test(item)) ? "pass" : "fail",
    seed_policy: "pass"
  } as const;
  const failed = Object.entries(checks).filter(([, value]) => value === "fail").map(([key]) => key);

  return auditReportSchema.parse({
    target_type: "sop",
    target_ref: sop.id,
    checks,
    verdict: failed.length === 0 ? "promote" : "revise",
    reason: failed.length === 0 ? "All autonomous audit checks passed." : `Failed checks: ${failed.join(", ")}`
  });
}
