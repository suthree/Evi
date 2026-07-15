import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  getSopEvolutionLedger,
  renderSopEvolutionLedgerMarkdown
} from "../packages/core/src/sop_evolution_ledger.js";
import { AgentStore } from "../packages/core/src/store.js";

test("SOP evolution ledger summarizes drafts, audits, follow-ups, and skill events without raw skill content", async () => {
  const root = await mkdtemp(join(tmpdir(), "local-runtime-sop-evolution-"));
  const repoRoot = join(root, "repo");
  const stateRoot = join(root, "state");
  const store = new AgentStore(repoRoot, stateRoot);
  try {
    await store.ensureLayout();
    await store.writeJson("sop/drafts/sop_promoted.json", sopDraft({
      id: "sop_promoted",
      title: "Promote audited SOPs through explicit gates",
      status: "audited"
    }));
    await store.writeJson("governance/audits/audit_promote.json", {
      id: "audit_promote",
      target_type: "sop",
      target_ref: "sop_promoted",
      verdict: "promote",
      reason: "Evidence, trigger, verification, and rollback all pass.",
      checks: passingChecks(),
      created_at: "2026-06-30T00:01:00.000Z"
    });
    await store.writeJson("autonomy/followups/follow_up_confirmation_promoted.json", {
      id: "follow_up_confirmation_promoted",
      status: "executed",
      created_at: "2026-06-30T00:02:00.000Z",
      executed_at: "2026-06-30T00:03:00.000Z",
      review_ref: "autonomy/reviews/background_review_promoted.json",
      proposal_id: "review_proposal_promoted",
      action_kind: "promote_sop",
      confirmation_required: true,
      execution_allowed: false,
      action: {
        id: "follow_up_action_promote_sop",
        kind: "promote_sop",
        title: "Promote audited SOP",
        required_refs: ["sop/drafts/sop_promoted.json", "governance/audits/audit_promote.json"],
        would_write: ["active_vault"]
      },
      required_refs: ["sop/drafts/sop_promoted.json", "governance/audits/audit_promote.json"],
      would_write: ["active_vault"],
      safety_boundary: ["RAW_SAFETY_BOUNDARY_SHOULD_NOT_RENDER"],
      next_step: "Already executed.",
      execution_result: {
        kind: "promote_sop",
        status: "promoted",
        sop_ref: "sop/drafts/sop_promoted.json",
        audit_ref: "governance/audits/audit_promote.json",
        skill_name: "explicit-sop-gate",
        skill_ref: "vault/skills/explicit-sop-gate/SKILL.md",
        candidate_ref: "vault/skill-candidates/sop_promoted-explicit-sop-gate/SKILL.md",
        registry_ref: "vault/registry/skills.jsonl",
        event_ref: "vault/registry/skill-events.jsonl#skill_event_promoted",
        duplicate_skill_ref: null,
        evidence_event_id: "evidence_promoted"
      }
    });
    await store.writeRepoText("vault/skills/explicit-sop-gate/SKILL.md", "RAW_SKILL_CONTENT_SHOULD_NOT_RENDER");
    await store.appendRepoJsonl("vault/registry/skill-events.jsonl", {
      id: "skill_event_promoted",
      kind: "promoted",
      skill_name: "explicit-sop-gate",
      instructions_ref: "vault/skills/explicit-sop-gate/SKILL.md",
      source_sop_ref: "sop/drafts/sop_promoted.json",
      audit_ref: "governance/audits/audit_promote.json",
      evidence_refs: ["memory/episodes/events.jsonl#evidence_promoted"],
      artifact_refs: [
        "sop/drafts/sop_promoted.json",
        "governance/audits/audit_promote.json",
        "vault/skills/explicit-sop-gate/SKILL.md"
      ],
      summary: "Promoted audited SOP into a reusable skill.",
      created_at: "2026-06-30T00:04:00.000Z"
    });
    await store.appendJsonl("memory/episodes/events.jsonl", {
      id: "evidence_promoted",
      session_id: "sop_promoted",
      turn_id: "audit_promote",
      kind: "report",
      summary: "Promoted audited SOP sop_promoted into vault skill explicit-sop-gate.",
      artifact_refs: [
        "sop/drafts/sop_promoted.json",
        "governance/audits/audit_promote.json",
        "vault/skills/explicit-sop-gate/SKILL.md"
      ],
      created_at: "2026-06-30T00:05:00.000Z"
    });

    await store.writeJson("sop/drafts/sop_duplicate.json", sopDraft({
      id: "sop_duplicate",
      title: "Avoid duplicate SOP promotion",
      status: "audited"
    }));
    await store.writeJson("governance/audits/audit_duplicate.json", {
      id: "audit_duplicate",
      target_type: "sop",
      target_ref: "sop_duplicate",
      verdict: "promote",
      reason: "The draft is structurally valid, but an existing skill covers it.",
      checks: passingChecks(),
      created_at: "2026-06-30T00:06:00.000Z"
    });
    await store.writeJson("autonomy/followups/follow_up_confirmation_duplicate.json", {
      id: "follow_up_confirmation_duplicate",
      status: "executed",
      created_at: "2026-06-30T00:07:00.000Z",
      executed_at: "2026-06-30T00:08:00.000Z",
      review_ref: "autonomy/reviews/background_review_duplicate.json",
      proposal_id: "review_proposal_duplicate",
      action_kind: "promote_sop",
      confirmation_required: true,
      execution_allowed: false,
      action: {
        id: "follow_up_action_promote_duplicate",
        kind: "promote_sop",
        title: "Skip duplicate SOP",
        required_refs: ["sop/drafts/sop_duplicate.json", "governance/audits/audit_duplicate.json"],
        would_write: ["active_vault"]
      },
      required_refs: ["sop/drafts/sop_duplicate.json", "governance/audits/audit_duplicate.json"],
      would_write: ["active_vault"],
      safety_boundary: ["RAW_DUPLICATE_BOUNDARY_SHOULD_NOT_RENDER"],
      next_step: "Already executed.",
      execution_result: {
        kind: "promote_sop",
        status: "reused_skill",
        sop_ref: "sop/drafts/sop_duplicate.json",
        audit_ref: "governance/audits/audit_duplicate.json",
        skill_name: "explicit-sop-gate",
        skill_ref: null,
        candidate_ref: null,
        registry_ref: null,
        event_ref: null,
        duplicate_skill_ref: "vault/skills/explicit-sop-gate/SKILL.md",
        evidence_event_id: "evidence_duplicate"
      }
    });

    const ledger = await getSopEvolutionLedger(store, { vaultRoot: "vault", limit: 5 });
    const promoted = ledger.entries.find((item) => item.sop_id === "sop_promoted");
    const duplicate = ledger.entries.find((item) => item.sop_id === "sop_duplicate");
    const rendered = renderSopEvolutionLedgerMarkdown(ledger);

    assert.equal(ledger.counts.sop_drafts.total, 2);
    assert.equal(ledger.counts.audits.by_verdict.promote, 2);
    assert.equal(ledger.counts.review_followups.executed, 2);
    assert.equal(ledger.counts.skill_events.by_kind.promoted, 1);
    assert.equal(promoted?.latest_decision, "promoted");
    assert.equal(promoted?.skill_refs.includes("vault/skills/explicit-sop-gate/SKILL.md"), true);
    assert.equal(duplicate?.latest_decision, "reused_skill");
    assert.equal(duplicate?.duplicate_skill_refs.includes("vault/skills/explicit-sop-gate/SKILL.md"), true);
    assert.match(rendered, /SOP Evolution Ledger/);
    assert.match(rendered, /sop_promoted/);
    assert.match(rendered, /sop_duplicate/);
    assert.match(rendered, /skill_event_promoted/);
    assert.doesNotMatch(rendered, /RAW_SKILL_CONTENT_SHOULD_NOT_RENDER/);
    assert.doesNotMatch(rendered, /RAW_SAFETY_BOUNDARY_SHOULD_NOT_RENDER/);
    assert.doesNotMatch(rendered, /RAW_DUPLICATE_BOUNDARY_SHOULD_NOT_RENDER/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("SOP evolution ledger exposes structured operator next commands for open chains", async () => {
  const root = await mkdtemp(join(tmpdir(), "local-runtime-sop-evolution-command-"));
  const repoRoot = join(root, "repo");
  const stateRoot = join(root, "state with spaces");
  const store = new AgentStore(repoRoot, stateRoot);
  try {
    await store.ensureLayout();
    await store.writeJson("sop/drafts/sop_command_draft.json", sopDraft({
      id: "sop_command_draft",
      title: "Audit command-ready draft",
      status: "draft"
    }));
    await store.writeJson("sop/drafts/sop_command_audited.json", sopDraft({
      id: "sop_command_audited",
      title: "Promote command-ready audited SOP",
      status: "audited"
    }));
    await store.writeJson("governance/audits/audit_command_promote.json", {
      id: "audit_command_promote",
      target_type: "sop",
      target_ref: "sop_command_audited",
      verdict: "promote",
      reason: "The SOP is ready for explicit promotion.",
      checks: passingChecks(),
      created_at: "2026-06-30T00:01:00.000Z"
    });

    const ledger = await getSopEvolutionLedger(store, { vaultRoot: "vault", limit: 10 });
    const draft = ledger.entries.find((item) => item.sop_id === "sop_command_draft");
    const audited = ledger.entries.find((item) => item.sop_id === "sop_command_audited");
    const rendered = renderSopEvolutionLedgerMarkdown(ledger);

    assert.equal(draft?.next_command?.action_kind, "audit_sop");
    assert.equal(draft?.next_command?.command, `pnpm run runtime -- review audit-sop --sop sop_command_draft --state-root '${stateRoot}'`);
    assert.equal(draft?.next_command?.request_command, `pnpm run runtime -- review request-sop-confirmation --sop sop_command_draft --state-root '${stateRoot}'`);
    assert.deepEqual(draft?.next_command?.required_refs, ["sop/drafts/sop_command_draft.json"]);
    assert.deepEqual(draft?.next_command?.would_write, ["state"]);
    assert.equal(audited?.next_command?.action_kind, "promote_sop");
    assert.equal(audited?.next_command?.command, `pnpm run runtime -- review promote-sop --sop sop_command_audited --audit audit_command_promote --state-root '${stateRoot}'`);
    assert.equal(audited?.next_command?.request_command, `pnpm run runtime -- review request-sop-confirmation --sop sop_command_audited --state-root '${stateRoot}'`);
    assert.deepEqual(audited?.next_command?.required_refs, [
      "sop/drafts/sop_command_audited.json",
      "governance/audits/audit_command_promote.json"
    ]);
    assert.deepEqual(audited?.next_command?.would_write, ["state", "active_vault"]);
    assert.match(rendered, /command: pnpm run runtime -- review audit-sop --sop sop_command_draft/);
    assert.match(rendered, /request_command: pnpm run runtime -- review request-sop-confirmation --sop sop_command_draft/);
    assert.match(rendered, /command_writes: state/);
    assert.match(rendered, /command_writes: state, active_vault/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("SOP evolution ledger keeps cited draft evidence out of lifecycle refs", async () => {
  const root = await mkdtemp(join(tmpdir(), "local-runtime-sop-evolution-cited-"));
  const repoRoot = join(root, "repo");
  const stateRoot = join(root, "state");
  const store = new AgentStore(repoRoot, stateRoot);
  try {
    await store.ensureLayout();
    await store.writeJson("sop/drafts/sop_old.json", sopDraft({
      id: "sop_old",
      title: "Old cited SOP",
      status: "audited"
    }));
    await store.writeJson("governance/audits/audit_old.json", {
      id: "audit_old",
      target_type: "sop",
      target_ref: "sop_old",
      verdict: "promote",
      reason: "The old SOP audit is only cited by the new draft.",
      checks: passingChecks(),
      created_at: "2026-06-30T00:01:00.000Z"
    });
    await store.writeRepoText("vault/skills/old-skill/SKILL.md", "RAW_OLD_SKILL_SHOULD_NOT_RENDER");
    await store.writeJson("sop/drafts/sop_new.json", sopDraft({
      id: "sop_new",
      title: "New draft with cited evidence",
      status: "draft",
      evidence_refs: [
        "autonomy/reviews/background_review_new.json",
        "sop/drafts/sop_old.json",
        "governance/audits/audit_old.json",
        "vault/skills/old-skill/SKILL.md"
      ]
    }));
    await store.writeJson("autonomy/followups/follow_up_confirmation_new.json", {
      id: "follow_up_confirmation_new",
      status: "executed",
      created_at: "2026-06-30T00:02:00.000Z",
      executed_at: "2026-06-30T00:03:00.000Z",
      review_ref: "autonomy/reviews/background_review_new.json",
      proposal_id: "review_proposal_new",
      action_kind: "draft_sop",
      confirmation_required: true,
      execution_allowed: false,
      action: {
        id: "follow_up_action_draft_new",
        kind: "draft_sop",
        title: "Draft new SOP",
        required_refs: [
          "autonomy/reviews/background_review_new.json",
          "sop/drafts/sop_old.json",
          "governance/audits/audit_old.json",
          "vault/skills/old-skill/SKILL.md"
        ],
        would_write: ["state"]
      },
      required_refs: [
        "autonomy/reviews/background_review_new.json",
        "sop/drafts/sop_old.json",
        "governance/audits/audit_old.json",
        "vault/skills/old-skill/SKILL.md"
      ],
      would_write: ["state"],
      safety_boundary: ["RAW_BOUNDARY_SHOULD_NOT_RENDER"],
      next_step: "Already executed.",
      execution_result: {
        kind: "draft_sop",
        sop_ref: "sop/drafts/sop_new.md",
        sop_json_ref: "sop/drafts/sop_new.json",
        evidence_event_id: "evidence_new"
      }
    });
    await store.appendJsonl("memory/episodes/events.jsonl", {
      id: "evidence_new_request",
      session_id: "follow_up_confirmation_new",
      turn_id: "follow_up_action_draft_new",
      kind: "report",
      summary: "Requested mutation confirmation for follow-up action follow_up_action_draft_new; no mutation executed.",
      artifact_refs: [
        "autonomy/followups/follow_up_confirmation_new.json",
        "autonomy/followups/follow_up_confirmation_new.md",
        "autonomy/reviews/background_review_new.json",
        "sop/drafts/sop_old.json",
        "governance/audits/audit_old.json",
        "vault/skills/old-skill/SKILL.md"
      ],
      created_at: "2026-06-30T00:03:30.000Z"
    });
    await store.appendJsonl("memory/episodes/events.jsonl", {
      id: "evidence_new",
      session_id: "background_review_new",
      turn_id: "background_review_new",
      kind: "report",
      summary: "Drafted state-only SOP candidate sop_new from background review proposal review_proposal_new.",
      artifact_refs: [
        "autonomy/reviews/background_review_new.json",
        "sop/drafts/sop_new.json",
        "sop/drafts/sop_new.md",
        "sop/drafts/sop_old.json",
        "governance/audits/audit_old.json",
        "vault/skills/old-skill/SKILL.md"
      ],
      created_at: "2026-06-30T00:04:00.000Z"
    });

    const ledger = await getSopEvolutionLedger(store, { vaultRoot: "vault", limit: 10 });
    const oldEntry = ledger.entries.find((item) => item.sop_id === "sop_old");
    const newEntry = ledger.entries.find((item) => item.sop_id === "sop_new");
    const rendered = renderSopEvolutionLedgerMarkdown(ledger);

    assert.equal(newEntry?.latest_decision, "drafted");
    assert.deepEqual(newEntry?.audit_refs, []);
    assert.deepEqual(newEntry?.skill_refs, []);
    assert.deepEqual(newEntry?.followup_refs, ["autonomy/followups/follow_up_confirmation_new.json"]);
    assert.equal(newEntry?.next_command?.action_kind, "audit_sop");
    assert.equal(oldEntry?.audit_refs.includes("governance/audits/audit_old.json"), true);
    assert.equal(oldEntry?.followup_refs.includes("autonomy/followups/follow_up_confirmation_new.json"), false);
    assert.equal(oldEntry?.event_ids.includes("evidence_new_request"), false);
    assert.equal(oldEntry?.event_ids.includes("evidence_new"), false);
    assert.doesNotMatch(rendered, /RAW_OLD_SKILL_SHOULD_NOT_RENDER/);
    assert.doesNotMatch(rendered, /RAW_BOUNDARY_SHOULD_NOT_RENDER/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("SOP evolution ledger isolates audit result refs from cited evidence", async () => {
  const root = await mkdtemp(join(tmpdir(), "local-runtime-sop-evolution-audit-cited-"));
  const repoRoot = join(root, "repo");
  const stateRoot = join(root, "state");
  const store = new AgentStore(repoRoot, stateRoot);
  try {
    await store.ensureLayout();
    await store.writeJson("sop/drafts/sop_old.json", sopDraft({
      id: "sop_old",
      title: "Old cited SOP",
      status: "audited"
    }));
    await store.writeJson("governance/audits/audit_old.json", {
      id: "audit_old",
      target_type: "sop",
      target_ref: "sop_old",
      verdict: "promote",
      reason: "The old SOP audit is only cited by the new audit evidence.",
      checks: passingChecks(),
      created_at: "2026-06-30T00:01:00.000Z"
    });
    await store.writeRepoText("vault/skills/old-skill/SKILL.md", "RAW_OLD_SKILL_SHOULD_NOT_RENDER");
    await store.writeJson("autonomy/followups/follow_up_confirmation_old.json", {
      id: "follow_up_confirmation_old",
      status: "pending",
      created_at: "2026-06-30T00:03:00.000Z",
      review_ref: "autonomy/reviews/background_review_old.json",
      proposal_id: "review_proposal_old",
      action_kind: "revise_skill",
      confirmation_required: true,
      execution_allowed: false,
      action: {
        id: "follow_up_action_old",
        kind: "revise_skill",
        title: "Validate old reused skill",
        required_refs: [
          "sop/drafts/sop_old.json",
          "governance/audits/audit_old.json",
          "vault/skills/old-skill/SKILL.md"
        ],
        would_write: ["state"]
      },
      required_refs: [
        "sop/drafts/sop_old.json",
        "governance/audits/audit_old.json",
        "vault/skills/old-skill/SKILL.md"
      ],
      would_write: ["state"],
      safety_boundary: ["RAW_OLD_BOUNDARY_SHOULD_NOT_RENDER"],
      next_step: "Pending validation."
    });
    await store.writeJson("sop/drafts/sop_new.json", sopDraft({
      id: "sop_new",
      title: "New audited SOP with cited evidence",
      status: "draft",
      evidence_refs: [
        "sop/drafts/sop_old.json",
        "governance/audits/audit_old.json",
        "vault/skills/old-skill/SKILL.md"
      ]
    }));
    await store.writeJson("governance/audits/audit_new.json", {
      id: "audit_new",
      target_type: "sop",
      target_ref: "sop_new",
      verdict: "promote",
      reason: "The new SOP is ready for promotion.",
      checks: passingChecks(),
      created_at: "2026-06-30T00:05:00.000Z"
    });
    await store.writeJson("autonomy/followups/follow_up_confirmation_audit_new.json", {
      id: "follow_up_confirmation_audit_new",
      status: "executed",
      created_at: "2026-06-30T00:04:00.000Z",
      executed_at: "2026-06-30T00:06:00.000Z",
      review_ref: "governance/evolution",
      proposal_id: "sop_new",
      action_kind: "audit_sop",
      confirmation_required: true,
      execution_allowed: false,
      action: {
        id: "follow_up_action_audit_new",
        kind: "audit_sop",
        title: "Audit new SOP",
        required_refs: ["sop/drafts/sop_new.json"],
        would_write: ["state"]
      },
      required_refs: ["sop/drafts/sop_new.json"],
      would_write: ["state"],
      safety_boundary: ["RAW_BOUNDARY_SHOULD_NOT_RENDER"],
      next_step: "Already executed.",
      execution_result: {
        kind: "audit_sop",
        sop_ref: "sop/drafts/sop_new.json",
        audit_ref: "governance/audits/audit_new.json",
        evidence_event_id: "evidence_new_audit"
      }
    });
    await store.appendJsonl("memory/episodes/events.jsonl", {
      id: "evidence_old_audit",
      session_id: "sop_old",
      turn_id: "audit_old",
      kind: "audit_result",
      summary: "State-only SOP audit verdict for sop_old: promote.",
      artifact_refs: [
        "sop/drafts/sop_old.json",
        "governance/audits/audit_old.json"
      ],
      created_at: "2026-06-30T00:02:00.000Z"
    });
    await store.appendJsonl("memory/episodes/events.jsonl", {
      id: "evidence_new_audit",
      session_id: "sop_new",
      turn_id: "audit_new",
      kind: "audit_result",
      summary: "State-only SOP audit verdict for sop_new: promote.",
      artifact_refs: [
        "sop/drafts/sop_new.json",
        "governance/audits/audit_new.json",
        "autonomy/followups/follow_up_confirmation_old.json",
        "autonomy/followups/follow_up_confirmation_old.md",
        "sop/drafts/sop_old.json",
        "governance/audits/audit_old.json",
        "vault/skills/old-skill/SKILL.md"
      ],
      created_at: "2026-06-30T00:06:00.000Z"
    });
    await store.appendJsonl("memory/episodes/events.jsonl", {
      id: "evidence_new_audit_executed",
      session_id: "follow_up_confirmation_audit_new",
      turn_id: "follow_up_action_audit_new",
      kind: "report",
      summary: "Executed confirmed audit_sop follow-up action follow_up_action_audit_new; active vault unchanged.",
      artifact_refs: [
        "autonomy/followups/follow_up_confirmation_audit_new.json",
        "autonomy/followups/follow_up_confirmation_audit_new.md",
        "sop/drafts/sop_new.json",
        "governance/audits/audit_new.json",
        "memory/episodes/events.jsonl#evidence_new_audit"
      ],
      created_at: "2026-06-30T00:06:30.000Z"
    });

    const ledger = await getSopEvolutionLedger(store, { vaultRoot: "vault", limit: 10 });
    const oldEntry = ledger.entries.find((item) => item.sop_id === "sop_old");
    const newEntry = ledger.entries.find((item) => item.sop_id === "sop_new");
    const rendered = renderSopEvolutionLedgerMarkdown(ledger);

    assert.equal(newEntry?.latest_decision, "audited");
    assert.deepEqual(newEntry?.audit_refs, ["governance/audits/audit_new.json"]);
    assert.deepEqual(newEntry?.skill_refs, []);
    assert.equal(newEntry?.event_ids.includes("evidence_new_audit"), true);
    assert.equal(oldEntry?.audit_refs.includes("governance/audits/audit_old.json"), true);
    assert.equal(oldEntry?.audit_refs.includes("governance/audits/audit_new.json"), false);
    assert.equal(oldEntry?.followup_refs.includes("autonomy/followups/follow_up_confirmation_old.json"), true);
    assert.equal(oldEntry?.event_ids.includes("evidence_new_audit"), false);
    assert.equal(oldEntry?.event_ids.includes("evidence_new_audit_executed"), false);
    assert.doesNotMatch(rendered, /RAW_OLD_SKILL_SHOULD_NOT_RENDER/);
    assert.doesNotMatch(rendered, /RAW_BOUNDARY_SHOULD_NOT_RENDER/);
    assert.doesNotMatch(rendered, /RAW_OLD_BOUNDARY_SHOULD_NOT_RENDER/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

function sopDraft(overrides: Record<string, unknown>): Record<string, unknown> {
  return {
    id: "sop_test",
    title: "Test SOP",
    trigger: "Use when repeated local evidence indicates a reusable procedure should be audited.",
    procedure: ["Inspect evidence.", "Run the explicit gate.", "Record the result."],
    required_tools: ["review.background"],
    verification: "The ledger should summarize the decision without reading raw skill content.",
    failure_modes: ["If evidence is weak, revise the SOP before promotion."],
    evidence_refs: ["memory/episodes/events.jsonl"],
    revision: 1,
    status: "draft",
    ...overrides
  };
}

function passingChecks(): Record<string, string> {
  return {
    evidence: "pass",
    trigger_clarity: "pass",
    verification: "pass",
    failure_modes: "pass",
    rollback_or_retirement: "pass",
    seed_policy: "pass"
  };
}
