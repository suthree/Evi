import { delegateAgentAuthoringContract } from "./action_contracts.js";
import {
  DELEGATE_AGENT_CONTEXT_MAX_CHARS,
  DELEGATE_AGENT_TASK_MAX_CHARS,
  DELEGATED_AGENT_FINDINGS_MAX_CHARS,
  DELEGATED_AGENT_SUMMARY_MAX_CHARS,
  delegatedAgentOutputSchema,
  delegateAgentPayloadSchema
} from "./schemas.js";

export interface DelegateAgentActionInput {
  payload: unknown;
  rationale: string;
}

export type ParseDelegationRequestResult = {
  ok: true;
  task: string;
  context: string;
} | {
  ok: false;
  task: string;
  task_chars: number;
  context_chars: number;
  error: string;
};

export interface DelegatedOutputSource {
  task: string;
  context: string;
}

export type ParseDelegatedOutputResult = {
  ok: true;
  summary: string;
  findings_text: string;
} | {
  ok: false;
  error: string;
  safe_raw_output_preview?: string;
};

export function parseDelegationRequest(action: DelegateAgentActionInput): ParseDelegationRequestResult {
  const payload = action.payload;
  const fallbackTask = action.rationale.trim();
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return {
      ok: false,
      task: fallbackTask,
      task_chars: fallbackTask.length,
      context_chars: 0,
      error: "delegate_agent.payload must be an object with non-empty task and context strings."
    };
  }
  const record = payload as Record<string, unknown>;
  const task = typeof record.task === "string" ? record.task.trim() : "";
  const context = typeof record.context === "string" ? record.context.trim() : "";
  const parsed = delegateAgentPayloadSchema.safeParse(record);
  if (parsed.success) {
    const taskBoundaryError = validateDelegationTaskBoundary(parsed.data.task);
    if (taskBoundaryError) {
      return {
        ok: false,
        task: parsed.data.task,
        task_chars: parsed.data.task.length,
        context_chars: parsed.data.context.length,
        error: taskBoundaryError
      };
    }
    const boundaryError = validateDelegationContextBoundary(parsed.data.context);
    if (!boundaryError) return { ok: true, ...parsed.data };
    return {
      ok: false,
      task: parsed.data.task,
      task_chars: parsed.data.task.length,
      context_chars: parsed.data.context.length,
      error: boundaryError
    };
  }
  if (!task) {
    return {
      ok: false,
      task: fallbackTask,
      task_chars: fallbackTask.length,
      context_chars: context.length,
      error: "delegate_agent.payload.task must be a non-empty string."
    };
  }
  if (task.length > DELEGATE_AGENT_TASK_MAX_CHARS) {
    return {
      ok: false,
      task: fallbackTask,
      task_chars: task.length,
      context_chars: context.length,
      error: `delegate_agent.payload.task must be at most ${DELEGATE_AGENT_TASK_MAX_CHARS} chars.`
    };
  }
  if (!context) {
    return {
      ok: false,
      task,
      task_chars: task.length,
      context_chars: 0,
      error: "delegate_agent.payload.context must be a non-empty string."
    };
  }
  if (context.length > DELEGATE_AGENT_CONTEXT_MAX_CHARS) {
    return {
      ok: false,
      task,
      task_chars: task.length,
      context_chars: context.length,
      error: `delegate_agent.payload.context must be at most ${DELEGATE_AGENT_CONTEXT_MAX_CHARS} chars.`
    };
  }
  const unsupportedKeys = Object.keys(record).filter((key) => key !== "task" && key !== "context");
  if (unsupportedKeys.length > 0) {
    return {
      ok: false,
      task,
      task_chars: task.length,
      context_chars: context.length,
      error: "delegate_agent.payload may only include task and context."
    };
  }
  return {
    ok: false,
    task,
    task_chars: task.length,
    context_chars: context.length,
    error: "delegate_agent.payload failed schema validation."
  };
}

export function parseDelegatedOutput(
  outputText: string,
  source: DelegatedOutputSource
): ParseDelegatedOutputResult {
  const trimmed = outputText.trim();
  if (!trimmed) {
    return { ok: false, error: "Delegated model returned empty output." };
  }
  const fullOutputBoundaryFailure = delegatedOutputBoundaryFailure(trimmed, source);
  if (fullOutputBoundaryFailure) return fullOutputBoundaryFailure;
  let parsed: unknown;
  try {
    parsed = JSON.parse(extractJsonObject(trimmed));
  } catch (error) {
    return { ok: false, error: `Delegated model output was not valid JSON: ${errorMessage(error)}` };
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { ok: false, error: "Delegated model output was not a JSON object." };
  }
  const record = parsed as Record<string, unknown>;
  const contract = delegatedAgentOutputSchema.safeParse(record);
  if (!contract.success) {
    const summary = typeof record.summary === "string" ? record.summary.trim() : "";
    const findingsText = typeof record.findings_text === "string" ? record.findings_text.trim() : "";
    if (!summary) {
      return { ok: false, error: "Delegated model output missing non-empty summary." };
    }
    if (!findingsText) {
      return { ok: false, error: "Delegated model output missing non-empty findings_text." };
    }
    if (summary.length > DELEGATED_AGENT_SUMMARY_MAX_CHARS) {
      return { ok: false, error: `Delegated model output.summary must be at most ${DELEGATED_AGENT_SUMMARY_MAX_CHARS} chars.` };
    }
    if (findingsText.length > DELEGATED_AGENT_FINDINGS_MAX_CHARS) {
      return { ok: false, error: `Delegated model output.findings_text must be at most ${DELEGATED_AGENT_FINDINGS_MAX_CHARS} chars.` };
    }
    return { ok: false, error: "Delegated model output failed schema validation." };
  }
  const { summary, findings_text: findingsText } = contract.data;
  if (delegatedOutputClaimsAuthority(summary, findingsText)) {
    return {
      ok: false,
      error: "Delegated model output must not claim tool/write/mutation, command/test execution, completion, expert, multi-agent, or model fan-out authority.",
      safe_raw_output_preview: "Delegated model output claimed tool/write/mutation, command/test execution, completion, expert, multi-agent, or model fan-out authority; raw output preview suppressed."
    };
  }
  if (delegatedOutputClaimsForbiddenSource(summary, findingsText)) {
    return {
      ok: false,
      error: "Delegated model output must not claim hidden memory, raw delegated artifacts, unstated repo state, context expansion, or invented evidence refs.",
      safe_raw_output_preview: "Delegated model output claimed hidden memory, raw delegated artifacts, unstated repo state, context expansion, or invented evidence refs; raw output preview suppressed."
    };
  }
  const rawEcho = delegatedOutputRawEcho(summary, findingsText, source);
  if (rawEcho) {
    return {
      ok: false,
      error: `Delegated model output echoed raw delegated ${rawEcho.source_field}; return summarized analysis without raw task/context.`,
      safe_raw_output_preview: `Delegated model output echoed raw delegated ${rawEcho.source_field}; raw output preview suppressed.`
    };
  }
  return {
    ok: true,
    summary,
    findings_text: findingsText
  };
}

function validateDelegationTaskBoundary(task: string): string | null {
  const text = normalizeBoundaryText(task);
  const hasBoundedAnalysisIntent = hasAnyPhrase(text, DELEGATE_TASK_ANALYSIS_TERMS);
  const hasConcreteQuestion = hasConcreteDelegationQuestion(task, text);
  const asksToolOrMutation =
    hasNearbyBoundary(text, DELEGATE_TASK_REQUEST_TERMS, TOOL_AUTHORITY_TERMS)
    || hasNearbyBoundary(text, DELEGATE_TASK_REQUEST_TERMS, TASK_WRITE_MUTATION_TERMS);
  const asksDirectMutation = hasDirectTaskMutationIntent(text);
  const asksCompletion =
    hasNearbyBoundary(text, DELEGATE_TASK_REQUEST_TERMS, COMPLETION_AUTHORITY_TERMS)
    || hasNearbyBoundary(text, DELEGATE_TASK_REQUEST_TERMS, COMPLETION_TERMS);
  const asksCommandOrTestExecution = hasNearbyBoundary(text, DELEGATE_TASK_REQUEST_TERMS, TASK_COMMAND_EXECUTION_TERMS);
  const asksExpertScheduling =
    hasNearbyBoundary(text, DELEGATE_TASK_REQUEST_TERMS, EXPERT_SCHEDULING_TERMS)
    || hasNearbyBoundary(text, EXPERT_SCHEDULING_TERMS, SCHEDULING_TERMS);
  if (!hasBoundedAnalysisIntent || !hasConcreteQuestion || asksToolOrMutation || asksDirectMutation || asksCommandOrTestExecution || asksCompletion || asksExpertScheduling) {
    return delegateAgentAuthoringContract.task.validation_error;
  }
  return null;
}

function validateDelegationContextBoundary(context: string): string | null {
  const text = normalizeBoundaryText(context);
  const rawText = context.toLowerCase();
  const deniesToolAuthority = hasNearbyBoundary(text, AUTHORITY_DENIAL_TERMS, TOOL_AUTHORITY_TERMS);
  const deniesWriteOrMutationAuthority = hasNearbyBoundary(text, AUTHORITY_DENIAL_TERMS, WRITE_MUTATION_TERMS);
  const keepsCompletionWithMainHarness =
    hasNearbyBoundary(text, COMPLETION_TERMS, MAIN_HARNESS_TERMS)
    || hasNearbyBoundary(text, AUTHORITY_DENIAL_TERMS, COMPLETION_AUTHORITY_TERMS);
  if (!deniesToolAuthority || !deniesWriteOrMutationAuthority || !keepsCompletionWithMainHarness) {
    return delegateAgentAuthoringContract.context.errors.authority;
  }
  if (!namesDelegatedOutputShape(rawText, text)) {
    return delegateAgentAuthoringContract.context.errors.output_shape;
  }
  if (!namesDelegatedSourceBoundary(text)) {
    return delegateAgentAuthoringContract.context.errors.source_boundary;
  }
  if (grantsDelegatedAuthority(text)) {
    return delegateAgentAuthoringContract.context.errors.authority_grant;
  }
  if (reliesOnForbiddenDelegationSource(text)) {
    return delegateAgentAuthoringContract.context.errors.forbidden_source;
  }
  return null;
}

function namesDelegatedOutputShape(rawText: string, normalizedText: string): boolean {
  return hasAnyPhrase(normalizedText, ["summary"]) && rawText.includes("findings_text");
}

function namesDelegatedSourceBoundary(text: string): boolean {
  return hasAnyPhrase(text, DELEGATE_CONTEXT_SOURCE_LIMIT_TERMS)
    && hasAnyPhrase(text, DELEGATE_CONTEXT_EXPLICIT_CONTEXT_TERMS)
    && hasAnyPhrase(text, DELEGATE_CONTEXT_NAMED_EVIDENCE_TERMS);
}

const AUTHORITY_DENIAL_TERMS = [
  "no",
  "not",
  "without",
  "cannot",
  "can't",
  "can not",
  "must not",
  "unavailable",
  "read only",
  "没有",
  "无",
  "不能",
  "不可",
  "不得",
  "不会",
  "不具备",
  "只读"
];

const DELEGATE_TASK_REQUEST_TERMS = [
  "run",
  "execute",
  "call",
  "invoke",
  "use",
  "write",
  "mutate",
  "modify",
  "decide",
  "prove",
  "mark",
  "declare",
  "schedule",
  "orchestrate",
  "spawn",
  "fan out",
  "delegate",
  "publish",
  "调用",
  "执行",
  "使用",
  "写入",
  "修改",
  "决定",
  "证明",
  "标记",
  "调度",
  "编排",
  "生成",
  "发布"
];

const DELEGATE_TASK_ANALYSIS_TERMS = [
  "analysis",
  "analyze",
  "critique",
  "review",
  "inspect",
  "inspection",
  "summarize",
  "summary",
  "compare",
  "comparison",
  "assess",
  "assessment",
  "evaluate",
  "evaluation",
  "identify",
  "locate",
  "find",
  "explain",
  "reason",
  "diagnose",
  "audit",
  "分析",
  "审查",
  "评审",
  "批评",
  "检查",
  "总结",
  "对比",
  "比较",
  "评估",
  "识别",
  "定位",
  "查找",
  "解释",
  "诊断",
  "审计"
];

const DELEGATE_CONTEXT_SOURCE_LIMIT_TERMS = [
  "use only",
  "only use",
  "may use only",
  "must use only",
  "limited to",
  "restricted to",
  "bounded to",
  "只能使用",
  "仅使用",
  "只使用"
];

const DELEGATE_CONTEXT_EXPLICIT_CONTEXT_TERMS = [
  "explicit payload context",
  "this explicit payload context",
  "provided payload context",
  "provided context",
  "explicit context",
  "this context",
  "显式 payload context",
  "显式上下文",
  "提供的上下文"
];

const DELEGATE_CONTEXT_NAMED_EVIDENCE_TERMS = [
  "named evidence ref",
  "named evidence refs",
  "named evidence reference",
  "named evidence references",
  "evidence ref",
  "evidence refs",
  "evidence reference",
  "evidence references",
  "证据引用"
];

const DIRECT_TASK_MUTATION_PATTERNS = [
  /^(?:please\s+)?(?:fix|repair|update|edit|patch|commit|change|modify|revise)\b/,
  /^(?:please\s+)?apply\s+(?:a\s+)?patch\b/,
  /\b(?:and|then|also|or)\s+(?:fix|repair|update|edit|patch|commit|change|modify|revise)\b/,
  /\b(?:and|then|also|or)\s+apply\s+(?:a\s+)?patch\b/,
  /(?:并|然后|和|以及|并且|同时|，|、)(?:修复|更新|编辑|修改|修补|打补丁|改代码|改文件)/u
];

const DIRECT_TASK_MUTATION_PHRASES = [
  "并修复",
  "然后修复",
  "并更新",
  "然后更新",
  "并编辑",
  "然后编辑",
  "并修改",
  "然后修改",
  "并修补",
  "然后修补",
  "并打补丁",
  "然后打补丁",
  "并改代码",
  "然后改代码",
  "并改文件",
  "然后改文件",
  "并提交",
  "然后提交"
];

const DIRECT_TASK_MUTATION_PREFIXES = [
  "修复",
  "更新",
  "编辑",
  "提交",
  "修改",
  "修补",
  "打补丁",
  "改代码",
  "改文件"
];

const TOOL_AUTHORITY_TERMS = [
  "tool",
  "tools",
  "use tool",
  "tool access",
  "tool call",
  "工具",
  "调用工具",
  "工具权限"
];

const WRITE_MUTATION_TERMS = [
  "write",
  "writes",
  "write repo",
  "file write repo",
  "state write",
  "mutation",
  "mutate",
  "mutates",
  "side effect",
  "side effects",
  "external write",
  "写入",
  "状态写入",
  "仓库写入",
  "外部写入",
  "修改",
  "突变",
  "副作用"
];

const TASK_WRITE_MUTATION_TERMS = [
  "write repo",
  "write repository",
  "repo write",
  "file write repo",
  "file write",
  "write file",
  "write files",
  "state write",
  "write state",
  "memory write",
  "write memory",
  "mutation",
  "mutate",
  "mutates",
  "side effect",
  "side effects",
  "external write",
  "写入状态",
  "状态写入",
  "写入仓库",
  "仓库写入",
  "写入文件",
  "文件写入",
  "外部写入",
  "修改状态",
  "突变",
  "副作用"
];

const TASK_COMMAND_EXECUTION_TERMS = [
  "command",
  "commands",
  "shell",
  "terminal",
  "run test",
  "run tests",
  "execute test",
  "execute tests",
  "call test",
  "invoke test",
  "test command",
  "test suite",
  "unit test",
  "unit tests",
  "integration test",
  "integration tests",
  "run lint",
  "execute lint",
  "lint command",
  "lint script",
  "run build",
  "execute build",
  "build command",
  "build script",
  "pnpm",
  "npm",
  "yarn",
  "pytest",
  "tsc",
  "命令",
  "终端",
  "测试",
  "单测",
  "集成测试",
  "构建"
];

const COMPLETION_TERMS = [
  "completion",
  "done claim",
  "final success",
  "success verified",
  "prove completion",
  "完成",
  "完成判断",
  "最终成功",
  "成功判断",
  "验收"
];

const COMPLETION_AUTHORITY_TERMS = [
  "completion authority",
  "decide completion",
  "prove completion",
  "final success",
  "完成权",
  "完成判断",
  "证明完成"
];

const MAIN_HARNESS_TERMS = [
  "main harness",
  "main thread",
  "main model",
  "operator",
  "verified outcome",
  "主 harness",
  "主流程",
  "主线程",
  "主模型",
  "操作员",
  "用户",
  "验证 outcome"
];

const EXPERT_SCHEDULING_TERMS = [
  "expert",
  "expert persona",
  "specialist",
  "multi agent",
  "multi-agent",
  "fan out",
  "scheduler",
  "orchestration",
  "autonomous agent",
  "专家",
  "专家角色",
  "多 agent",
  "多智能体",
  "调度器",
  "自主 agent"
];

const SCHEDULING_TERMS = [
  "schedule",
  "scheduling",
  "orchestrate",
  "orchestration",
  "spawn",
  "fan out",
  "fan-out",
  "delegate",
  "调度",
  "编排",
  "生成",
  "分发"
];

function normalizeBoundaryText(value: string): string {
  return value.toLowerCase().replace(/[._/;:(),-]+/g, " ").replace(/\s+/g, " ").trim();
}

function hasDirectTaskMutationIntent(text: string): boolean {
  const taskCommand = text.replace(/^(?:please\s+|请\s*)+/, "");
  if (DIRECT_TASK_MUTATION_PATTERNS.some((pattern) => pattern.test(taskCommand))) return true;
  if (DIRECT_TASK_MUTATION_PHRASES.some((phrase) => taskCommand.includes(phrase))) return true;
  return DIRECT_TASK_MUTATION_PREFIXES.some((term) => taskCommand.startsWith(term));
}

function grantsDelegatedAuthority(text: string): boolean {
  return hasAnyPhrase(text, DELEGATE_CONTEXT_AUTHORITY_GRANT_PHRASES)
    || hasNearbyBoundary(text, AUTHORITY_COMMAND_GRANT_PREFIXES, TASK_COMMAND_EXECUTION_TERMS, 80)
    || hasNearbyBoundary(text, AUTHORITY_TOOL_GRANT_PREFIXES, DELEGATED_TOOL_SURFACE_TERMS, 80);
}

function reliesOnForbiddenDelegationSource(text: string): boolean {
  return DELEGATE_CONTEXT_FORBIDDEN_SOURCE_PHRASES.some((phrase) => hasUndeniedPhrase(text, phrase));
}

function hasUndeniedPhrase(text: string, phrase: string, denialWindow = 48): boolean {
  let index = text.indexOf(phrase);
  while (index !== -1) {
    const start = Math.max(0, index - denialWindow);
    const end = Math.min(text.length, index + phrase.length + denialWindow);
    const nearby = text.slice(start, end);
    if (!hasAnyPhrase(nearby, SOURCE_DENIAL_TERMS)) return true;
    index = text.indexOf(phrase, index + phrase.length);
  }
  return false;
}

function hasAnyPhrase(text: string, phrases: readonly string[]): boolean {
  return phrases.some((phrase) => text.includes(phrase));
}

function hasConcreteDelegationQuestion(rawText: string, normalizedText: string): boolean {
  return /[?？]/.test(rawText)
    || /\b(whether|which|what|why|how|where|when|who|does|do|is|are|can|should|could|would|if)\b/.test(normalizedText)
    || ["是否", "能否", "可否", "哪", "什么", "为什么", "如何", "怎么", "哪里", "何时", "谁", "吗"].some((term) => rawText.includes(term));
}

function hasNearbyBoundary(text: string, firstTerms: readonly string[], secondTerms: readonly string[], window = 160): boolean {
  for (const first of firstTerms) {
    for (const second of secondTerms) {
      if (termsAreNearby(text, first, second, window) || termsAreNearby(text, second, first, window)) return true;
    }
  }
  return false;
}

const DELEGATE_CONTEXT_AUTHORITY_GRANT_PHRASES = [
  "can use tool",
  "can use tools",
  "may use tool",
  "may use tools",
  "allowed to use tool",
  "allowed to use tools",
  "tool access allowed",
  "grant tool access",
  "grants tool access",
  "can write",
  "may write",
  "allowed to write",
  "write access allowed",
  "grant write access",
  "grants write access",
  "can run command",
  "may run command",
  "allowed to run command",
  "can execute command",
  "may execute command",
  "allowed to execute command",
  "can run test",
  "may run test",
  "allowed to run test",
  "can run tests",
  "may run tests",
  "allowed to run tests",
  "can execute test",
  "may execute test",
  "allowed to execute test",
  "can execute tests",
  "may execute tests",
  "allowed to execute tests",
  "can run pnpm test",
  "may run pnpm test",
  "can run npm test",
  "may run npm test",
  "can run pytest",
  "may run pytest",
  "can run build",
  "may run build",
  "can run pnpm build",
  "may run pnpm build",
  "can run npm build",
  "may run npm build",
  "can mutate",
  "may mutate",
  "allowed to mutate",
  "mutation authority allowed",
  "can decide completion",
  "may decide completion",
  "allowed to decide completion",
  "completion authority allowed",
  "delegated completion authority",
  "can schedule expert",
  "may schedule expert",
  "allowed to schedule expert",
  "can schedule specialist",
  "may schedule specialist",
  "can orchestrate multi agent",
  "may orchestrate multi agent",
  "can orchestrate multi-agent",
  "may orchestrate multi-agent",
  "can fan out",
  "may fan out",
  "allowed to fan out",
  "can use model fan out",
  "may use model fan out",
  "allowed to use model fan out",
  "model fan out allowed",
  "can spawn autonomous agent",
  "may spawn autonomous agent",
  "allowed to spawn autonomous agent",
  "可以调用工具",
  "允许调用工具",
  "授予工具权限",
  "可以写入",
  "允许写入",
  "授予写入权限",
  "可以运行命令",
  "允许运行命令",
  "可以执行命令",
  "允许执行命令",
  "可以运行测试",
  "允许运行测试",
  "可以执行测试",
  "允许执行测试",
  "可以运行构建",
  "允许运行构建",
  "可以修改",
  "允许修改",
  "可以决定完成",
  "允许决定完成",
  "授予完成权",
  "可以调度专家",
  "允许调度专家",
  "可以编排多 agent",
  "允许编排多 agent",
  "可以编排多智能体",
  "允许编排多智能体"
];

const AUTHORITY_COMMAND_GRANT_PREFIXES = [
  "can run",
  "may run",
  "allowed to run",
  "permission to run",
  "authority to run",
  "can execute",
  "may execute",
  "allowed to execute",
  "permission to execute",
  "authority to execute",
  "can call",
  "may call",
  "allowed to call",
  "can invoke",
  "may invoke",
  "allowed to invoke",
  "可以运行",
  "允许运行",
  "可以执行",
  "允许执行",
  "可以调用",
  "允许调用"
];

const AUTHORITY_TOOL_GRANT_PREFIXES = [
  "can use",
  "may use",
  "allowed to use",
  "permission to use",
  "authority to use",
  "can call",
  "may call",
  "allowed to call",
  "can invoke",
  "may invoke",
  "allowed to invoke",
  "可以使用",
  "允许使用",
  "可以调用",
  "允许调用"
];

const DELEGATED_TOOL_SURFACE_TERMS = [
  "tool",
  "tools",
  "repo search",
  "http fetch",
  "command run",
  "code execute node",
  "file read",
  "file write",
  "file write repo",
  "file write state",
  "state write",
  "工具",
  "仓库搜索",
  "命令执行",
  "文件读取",
  "文件写入",
  "状态写入"
];

const SOURCE_DENIAL_TERMS = [
  "no",
  "not",
  "do not",
  "don't",
  "without",
  "cannot",
  "can't",
  "can not",
  "does not",
  "must not",
  "never",
  "exclude",
  "excludes",
  "excluded",
  "excluding",
  "suppressed",
  "unavailable",
  "not available",
  "不可用",
  "不使用",
  "不要",
  "禁止",
  "排除"
];

const DELEGATE_CONTEXT_FORBIDDEN_SOURCE_PHRASES = [
  "hidden memory",
  "private memory",
  "implicit memory",
  "memory persistence",
  "persistent memory",
  "unstated repo state",
  "unstated state",
  "raw delegated artifact",
  "raw delegated artifacts",
  "raw delegated artifact body",
  "raw delegated artifact bodies",
  "raw artifact body",
  "raw artifact bodies",
  "delegated artifact body",
  "delegated artifact bodies",
  "raw delegated output",
  "raw output preview",
  "raw task context",
  "full transcript",
  "expand context",
  "context expansion",
  "invent evidence",
  "invent ref",
  "invent refs",
  "invent verification ref",
  "invent verification refs",
  "隐藏记忆",
  "隐式记忆",
  "未声明状态",
  "原始委托产物",
  "原始委托 artifact",
  "扩展上下文",
  "编造证据",
  "编造 ref",
  "编造 verification refs"
];

function termsAreNearby(text: string, first: string, second: string, window: number): boolean {
  let index = text.indexOf(first);
  while (index !== -1) {
    const nextIndex = text.indexOf(second, index);
    if (nextIndex !== -1 && nextIndex - index <= window) return true;
    index = text.indexOf(first, index + first.length);
  }
  return false;
}

function delegatedOutputBoundaryFailure(
  text: string,
  source: DelegatedOutputSource
): {
  ok: false;
  error: string;
  safe_raw_output_preview: string;
} | null {
  if (delegatedTextClaimsAuthority(text)) {
    return {
      ok: false,
      error: "Delegated model output must not claim tool/write/mutation, command/test execution, completion, expert, multi-agent, or model fan-out authority.",
      safe_raw_output_preview: "Delegated model output claimed tool/write/mutation, command/test execution, completion, expert, multi-agent, or model fan-out authority; raw output preview suppressed."
    };
  }
  if (delegatedTextClaimsForbiddenSource(text)) {
    return {
      ok: false,
      error: "Delegated model output must not claim hidden memory, raw delegated artifacts, unstated repo state, context expansion, or invented evidence refs.",
      safe_raw_output_preview: "Delegated model output claimed hidden memory, raw delegated artifacts, unstated repo state, context expansion, or invented evidence refs; raw output preview suppressed."
    };
  }
  const rawEcho = delegatedOutputRawEcho(text, "", source);
  if (rawEcho) {
    return {
      ok: false,
      error: `Delegated model output echoed raw delegated ${rawEcho.source_field}; return summarized analysis without raw task/context.`,
      safe_raw_output_preview: `Delegated model output echoed raw delegated ${rawEcho.source_field}; raw output preview suppressed.`
    };
  }
  return null;
}

function delegatedOutputClaimsAuthority(summary: string, findingsText: string): boolean {
  return delegatedTextClaimsAuthority(`${summary}\n${findingsText}`);
}

function delegatedOutputClaimsForbiddenSource(summary: string, findingsText: string): boolean {
  return delegatedTextClaimsForbiddenSource(`${summary}\n${findingsText}`);
}

function delegatedTextClaimsAuthority(value: string): boolean {
  const text = normalizeBoundaryText(value);
  return hasAnyPhrase(text, DELEGATED_OUTPUT_AUTHORITY_CLAIM_PHRASES)
    || hasNearbyBoundary(
      text,
      DELEGATED_OUTPUT_COMMAND_EXECUTION_CLAIM_PREFIXES,
      DELEGATED_OUTPUT_COMMAND_EXECUTION_TERMS,
      80
    );
}

function delegatedTextClaimsForbiddenSource(value: string): boolean {
  const text = normalizeBoundaryText(value);
  return reliesOnForbiddenDelegationSource(text);
}

const DELEGATED_OUTPUT_AUTHORITY_CLAIM_PHRASES = [
  "i used tool",
  "i used tools",
  "i used repo search",
  "i used http fetch",
  "i used command run",
  "i used code execute node",
  "i called tool",
  "i called repo search",
  "i called http fetch",
  "i called command run",
  "i called file write repo",
  "i executed command run",
  "i executed test",
  "i executed tests",
  "i executed pnpm test",
  "i executed npm test",
  "i executed pytest",
  "i ran command run",
  "i ran test",
  "i ran tests",
  "i ran pnpm test",
  "i ran npm test",
  "i ran pytest",
  "i ran build",
  "i ran builds",
  "i ran pnpm build",
  "i ran npm build",
  "i wrote state",
  "i wrote repo",
  "i wrote file",
  "i wrote files",
  "i mutated state",
  "i decided completion",
  "i proved completion",
  "i verified completion",
  "i verified final success",
  "delegated subagent used tool",
  "delegated subagent called tool",
  "delegated subagent wrote state",
  "delegated subagent verified completion",
  "delegated subagent scheduled expert",
  "delegated subagent scheduled experts",
  "delegated subagent orchestrated expert",
  "delegated subagent orchestrated experts",
  "delegated subagent orchestrated multi agent",
  "delegated subagent orchestrated multi agents",
  "delegated subagent ran model fan out",
  "delegated subagent used model fan out",
  "subagent used tool",
  "subagent called tool",
  "subagent wrote state",
  "subagent verified completion",
  "subagent scheduled expert",
  "subagent scheduled experts",
  "subagent orchestrated expert",
  "subagent orchestrated experts",
  "subagent orchestrated multi agent",
  "subagent orchestrated multi agents",
  "subagent ran model fan out",
  "subagent used model fan out",
  "i scheduled expert",
  "i scheduled experts",
  "i scheduled expert reviewer",
  "i scheduled expert reviewers",
  "i orchestrated expert",
  "i orchestrated experts",
  "i orchestrated multi agent",
  "i orchestrated multi agents",
  "i ran model fan out",
  "i used model fan out",
  "i spawned subagent",
  "i spawned subagents",
  "i spawned expert",
  "i spawned experts",
  "completion is proven",
  "final success is proven",
  "我调用了工具",
  "调用了工具",
  "我运行了测试",
  "运行了测试",
  "我完成了验证",
  "完成了验证",
  "最终成功已经证明",
  "最终成功已证明",
  "我写入了状态",
  "写入了状态",
  "我调度了专家",
  "调度了专家",
  "编排了多 agent",
  "编排了多智能体",
  "运行了模型 fan out",
  "使用了模型 fan out"
];

const DELEGATED_OUTPUT_COMMAND_EXECUTION_CLAIM_PREFIXES = [
  "i ran",
  "i have run",
  "i executed",
  "i have executed",
  "i called",
  "i invoked",
  "i used",
  "delegated subagent ran",
  "delegated subagent executed",
  "delegated subagent called",
  "delegated subagent invoked",
  "delegated subagent used",
  "subagent ran",
  "subagent executed",
  "subagent called",
  "subagent invoked",
  "subagent used",
  "我运行了",
  "运行了",
  "我执行了",
  "执行了",
  "我调用了",
  "调用了"
];

const DELEGATED_OUTPUT_COMMAND_EXECUTION_TERMS = [
  ...TASK_COMMAND_EXECUTION_TERMS,
  "test",
  "tests",
  "check",
  "checks",
  "suite",
  "suites",
  "测试",
  "检查"
];

function delegatedOutputRawEcho(
  summary: string,
  findingsText: string,
  source: DelegatedOutputSource
): { source_field: "task" | "context" } | null {
  const output = normalizeRawEchoText(`${summary}\n${findingsText}`);
  if (sourceEchoes(output, source.task)) return { source_field: "task" };
  if (sourceEchoes(output, source.context)) return { source_field: "context" };
  return null;
}

function sourceEchoes(normalizedOutput: string, sourceText: string): boolean {
  const source = normalizeRawEchoText(sourceText);
  if (source.length < 40) return false;
  if (normalizedOutput.includes(source)) return true;
  return source
    .split(/[.;\n]/)
    .map((chunk) => chunk.trim())
    .filter((chunk) => chunk.length >= 40)
    .some((chunk) => normalizedOutput.includes(chunk));
}

function normalizeRawEchoText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function extractJsonObject(text: string): string {
  if (text.startsWith("{") && text.endsWith("}")) return text;
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    throw new Error(`Model output did not contain a JSON object: ${text.slice(0, 300)}`);
  }
  return text.slice(start, end + 1);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
