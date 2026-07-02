import type { AuditReport, SkillPackage, SOPDraft } from "./schemas.js";

export function formatSopMarkdown(sop: SOPDraft): string {
  return `# ${sop.title}

- ID: ${sop.id}
- Status: ${sop.status}
- Revision: ${sop.revision}

## Trigger

${sop.trigger}

## Procedure

${numbered(sop.procedure)}

## Required Tools

${bullets(sop.required_tools)}

## Verification

${sop.verification}

## Failure Modes

${bullets(sop.failure_modes)}

## Evidence

${bullets(sop.evidence_refs)}
`;
}

export function formatSkillMarkdown(skill: SkillPackage, sop: SOPDraft, audit: AuditReport): string {
  return `---
name: ${frontmatterScalar(skill.name)}
description: ${frontmatterScalar(skill.description)}
---

# ${sop.title}

## Procedure

${numbered(sop.procedure)}

## Verification

${skill.verification}

## Tool Requirements

${bullets(skill.tool_requirements)}

## Failure Modes

${bullets(sop.failure_modes)}

## Provenance

- Source SOP: ${skill.source_sop_ref}
- Autonomous audit: ${audit.id}
- Skill package ID: ${skill.id}

## Maintenance

Record use count, last used time, and patch count after each meaningful reuse. Revise, archive, or retire the skill when telemetry shows repeated failure, stale assumptions, or unclear triggers.
`;
}

function frontmatterScalar(value: string): string {
  return JSON.stringify(value.replace(/\s+/g, " ").trim());
}

function numbered(items: string[]): string {
  return items.map((item, index) => `${index + 1}. ${item}`).join("\n") || "1. No procedure recorded.";
}

function bullets(items: string[]): string {
  return items.map((item) => `- ${item}`).join("\n") || "- None";
}
