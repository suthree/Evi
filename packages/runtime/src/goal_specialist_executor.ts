import { z } from "zod";
import { CODEX_RUN_TOOL } from "../../core/src/codex_run_contract.js";
import type { EffectAction } from "./effect_policy.js";
import type { GoalCapabilitySelection } from "./goal_capability_portfolio.js";
import type { GoalRepositoryAuthority } from "./repository_authority.js";

const specialistTaskSchema = z.string().trim().min(1).max(40_000);
const specialistTaskShapeSchema = z.string().trim().min(1).max(2_000);

/**
 * The only Codex-specific payload that Goal cognition may author.  It names
 * work to be done, not Codex CLI authority.  GoalRuntime derives every
 * protocol field from its bound Goal state and retained canonical evidence.
 */
export const codexSpecialistIntentSchema = z.object({
  task: specialistTaskSchema,
  task_shape: specialistTaskShapeSchema
}).strict();

export type CodexSpecialistIntent = z.infer<typeof codexSpecialistIntentSchema>;

export interface CodexResumeHandle {
  thread_id: string;
  authority_digest: string;
}

export interface DeriveCodexSpecialistInvocationInput {
  intent: unknown;
  selection: GoalCapabilitySelection;
  authority: GoalRepositoryAuthority;
  resume_handle: CodexResumeHandle | null;
}

/**
 * Convert bounded specialist intent into the typed Codex tool protocol.
 * A prior verified handle means this Goal continues its specialist thread;
 * otherwise it starts a fresh thread inside the exact bound worktree.
 */
export function deriveCodexSpecialistInvocation(
  input: DeriveCodexSpecialistInvocationInput
): EffectAction {
  const intent = codexSpecialistIntentSchema.parse(input.intent);
  if (input.resume_handle) {
    return {
      tool: CODEX_RUN_TOOL,
      arguments: {
        mode: "resume",
        prompt: intent.task,
        thread_id: input.resume_handle.thread_id,
        authority_digest: input.resume_handle.authority_digest
      }
    };
  }
  return {
    tool: CODEX_RUN_TOOL,
    arguments: {
      mode: "new",
      prompt: intent.task,
      base_commit: input.authority.start_head_commit,
      branch: input.authority.branch,
      worktree: ".",
      cwd: ".",
      model: "auto",
      profile: "fast",
      reasoning_effort: "auto",
      service_tier: "fast",
      sandbox: "workspace-write",
      approval_policy: "never",
      selection_rationale: input.selection.rationale,
      task_shape: intent.task_shape,
      delegation_strategy: {
        mode: "single",
        max_subagents: 0,
        independent_workstreams: [],
        integration_owner: "main_codex_thread"
      },
      budgets: {
        timeout_ms: 300_000,
        max_context_chars: 40_000,
        max_tool_calls: 32,
        max_retries: 0
      }
    }
  };
}

export function parseCodexResumeHandle(value: unknown): CodexResumeHandle | null {
  const parsed = z.object({
    thread_id: z.string().trim().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i),
    authority_digest: z.string().trim().regex(/^[a-f0-9]{64}$/)
  }).strict().safeParse(value);
  return parsed.success ? parsed.data : null;
}
