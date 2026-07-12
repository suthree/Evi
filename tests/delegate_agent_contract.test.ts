import assert from "node:assert/strict";
import test from "node:test";
import {
  delegateAgentActionContract,
  delegateAgentAuthoringContract,
  formatDelegateAgentPayloadInstruction,
  formatDelegateAgentSubagentInstructions,
  getDelegateAgentPayloadExample
} from "../packages/core/src/action_contracts.js";
import {
  delegationInputMetadata,
  parseDelegatedOutput,
  parseDelegationRequest
} from "../packages/core/src/delegate_agent_contract.js";

const VALID_DELEGATE_CONTEXT = [
  "No tool, write, or mutation authority is available.",
  "Completion remains with the main harness.",
  "Delegated analysis may use only this explicit payload context and named evidence refs.",
  "Return JSON with summary and findings_text."
].join(" ");

const DELEGATED_OUTPUT_SOURCE = {
  task: "Critique whether delegated output claims command authority.",
  context: VALID_DELEGATE_CONTEXT
};

test("delegate_agent subagent instructions constrain source boundary", () => {
  const instructions = formatDelegateAgentSubagentInstructions().join("\n");

  assert.match(instructions, /Use only the Task and Context text provided/);
  assert.match(instructions, /named evidence refs already present there/);
  assert.match(instructions, /Return exactly one strict JSON object/);
  assert.match(instructions, /no Markdown, code fence, wrapper prose, or extra keys/);
  assert.match(instructions, /The only allowed keys are summary and findings_text/);
  assert.match(instructions, /Do not claim tool\/write\/mutation/);
});

test("delegate_agent payload example carries the shared authoring contract", () => {
  const example = getDelegateAgentPayloadExample();

  assert.match(example.task, /one analysis question/);
  assert.match(example.task, /no fix\/run\/complete\/schedule/);
  assert.match(example.context, /payload\/named refs only/);
  assert.match(example.context, /no tools\/writes\/mutation/);
  assert.match(example.context, /main harness completes/);
  assert.match(example.context, /output=summary\/findings_text/);
  assert.match(example.task, /<=1000$/);
  assert.match(example.context, /<=12000$/);
});

test("delegate_agent payload instruction states the shared failed recovery contract", () => {
  const instruction = formatDelegateAgentPayloadInstruction();

  assert.equal(instruction.includes(delegateAgentAuthoringContract.recovery.failure_hint), true);
  assert.match(instruction, /later successful write\/run evidence plus a bound non-delegated verification ref/);
  assert.match(instruction, /otherwise report blocked/);
});

test("delegate_agent context rejects concrete command grants before dispatch", () => {
  const result = parseDelegationRequest({
    rationale: "Use bounded delegated analysis.",
    payload: {
      task: "Critique whether the answer needs more evidence.",
      context: `${VALID_DELEGATE_CONTEXT} The delegated subagent may run tsc before returning findings.`
    }
  });

  assert.equal(result.ok, false);
  assert.match(result.error, /must not grant tool\/write\/mutation, command\/test execution/);
});

test("delegate_agent context rejects named tool grants before dispatch", () => {
  const result = parseDelegationRequest({
    rationale: "Use bounded delegated analysis.",
    payload: {
      task: "Critique whether the answer needs more evidence.",
      context: `${VALID_DELEGATE_CONTEXT} The delegated subagent may use repo.search before returning findings.`
    }
  });

  assert.equal(result.ok, false);
  assert.match(result.error, /must not grant tool\/write\/mutation, command\/test execution/);
});

test("delegate_agent context rejects read, search, fetch, and browse grants before dispatch", () => {
  const contexts = [
    `${VALID_DELEGATE_CONTEXT} The delegated subagent may read files under docs before returning findings.`,
    `${VALID_DELEGATE_CONTEXT} The delegated subagent may search the repo before returning findings.`,
    `${VALID_DELEGATE_CONTEXT} The delegated subagent may fetch URLs before returning findings.`,
    `${VALID_DELEGATE_CONTEXT} The delegated subagent can inspect raw files before returning findings.`,
    `${VALID_DELEGATE_CONTEXT} The delegated subagent is allowed to browse the web before returning findings.`
  ];

  for (const context of contexts) {
    const result = parseDelegationRequest({
      rationale: "Use bounded delegated analysis.",
      payload: {
        task: "Critique whether the answer needs more evidence.",
        context
      }
    });

    assert.equal(result.ok, false, context);
    assert.match(result.error, /must not grant tool\/write\/mutation, command\/test execution/);
  }
});

test("delegate_agent rejects direct destructive work but keeps deletion review read-only", () => {
  const verbs = ["delete", "remove", "erase", "unlink", "drop", "destroy"];
  const directTasks = verbs.map((verb) => parseDelegationRequest({
    rationale: "Use bounded delegated analysis.",
    payload: {
      task: `Review stale state records and ${verb} obsolete entries. What was changed?`,
      context: VALID_DELEGATE_CONTEXT
    }
  }));
  const destructiveGrants = verbs.map((verb) => parseDelegationRequest({
    rationale: "Use bounded delegated analysis.",
    payload: {
      task: "Critique whether the answer needs more evidence.",
      context: `${VALID_DELEGATE_CONTEXT} The delegated subagent may ${verb} state files before returning findings.`
    }
  }));
  const reviewOnly = parseDelegationRequest({
    rationale: "Use bounded delegated analysis.",
    payload: {
      task: "Review whether stale state records should be deleted?",
      context: VALID_DELEGATE_CONTEXT
    }
  });

  assert.equal(directTasks.every((result) => !result.ok), true);
  assert.equal(destructiveGrants.every((result) => !result.ok), true);
  assert.equal(reviewOnly.ok, true);
  for (const result of directTasks) {
    if (!result.ok) assert.match(result.error, /must explicitly request bounded analysis/);
  }
  for (const result of destructiveGrants) {
    if (!result.ok) assert.match(result.error, /must not grant tool\/write\/mutation/);
  }
});

test("delegate_agent rejects sentence-separated direct mutation work before dispatch", () => {
  const directTasks = [
    "Analyze the missing guard. Fix it before returning findings?",
    "Critique the state transition; please patch the defect.",
    "Review stale state records. Remove obsolete entries.",
    "分析缺失的防护。修复它后返回结论。"
  ];
  const readOnlyReview = parseDelegationRequest({
    rationale: "Use bounded delegated analysis.",
    payload: {
      task: "Analyze whether the missing guard should be fixed?",
      context: VALID_DELEGATE_CONTEXT
    }
  });

  for (const task of directTasks) {
    const result = parseDelegationRequest({
      rationale: "Use bounded delegated analysis.",
      payload: { task, context: VALID_DELEGATE_CONTEXT }
    });
    assert.equal(result.ok, false, task);
    if (!result.ok) assert.match(result.error, /must explicitly request bounded analysis/);
  }
  assert.equal(readOnlyReview.ok, true);
});

test("delegate_agent rejects repository mutation task and context bypasses but keeps review read-only", () => {
  const directTasks = [
    "Analyze release status. Push the branch to remote. What changed?",
    "Review the change. Merge it into main. What succeeded?",
    "Critique the rollout. Deploy it now. What happened?",
    "Review release readiness. Then git push origin main. What changed?",
    "Review integration. Run git merge --ff-only feature. What changed?",
    "Review history. Then git rebase main. What changed?",
    "Review the release. Then git cherry-pick abc123. What changed?",
    "Review the checkpoint. Then git reset --hard HEAD~1. What changed?",
    "Review the release. Then git tag v1.0. What changed?",
    "Analyze the repository. Please create a pull request. What changed?",
    "评估发布状态。推送分支到远端后汇报什么变化？",
    "评审发布状态。执行 git push origin main 后汇报什么变化？",
    "评审发布状态。创建拉取请求后汇报什么变化？"
  ];
  const readOnlyReview = parseDelegationRequest({
    rationale: "Use bounded delegated analysis.",
    payload: {
      task: "Analyze whether git merge --ff-only or a pull request would be appropriate before release?",
      context: VALID_DELEGATE_CONTEXT
    }
  });
  const authorityGrants = [
    "The delegated subagent may push the branch to remote.",
    "The delegated subagent may merge the change into main.",
    "The delegated subagent may deploy the release.",
    "The delegated subagent may run git rebase before returning findings.",
    "The delegated subagent may run git cherry-pick before returning findings.",
    "The delegated subagent may create a pull request before returning findings.",
    "允许 delegated subagent 发布到生产环境。",
    "允许 delegated subagent 创建拉取请求。"
  ];

  for (const task of directTasks) {
    const result = parseDelegationRequest({
      rationale: "Use bounded delegated analysis.",
      payload: { task, context: VALID_DELEGATE_CONTEXT }
    });
    assert.equal(result.ok, false, task);
  }
  for (const grant of authorityGrants) {
    const result = parseDelegationRequest({
      rationale: "Use bounded delegated analysis.",
      payload: {
        task: "Critique whether the answer needs more evidence.",
        context: `${VALID_DELEGATE_CONTEXT} ${grant}`
      }
    });
    assert.equal(result.ok, false, grant);
    if (!result.ok) assert.match(result.error, /must not grant tool\/write\/mutation/);
  }
  assert.equal(readOnlyReview.ok, true);
});

test("delegate_agent context still accepts explicit payload and evidence-only boundaries", () => {
  const result = parseDelegationRequest({
    rationale: "Use bounded delegated analysis.",
    payload: {
      task: "Critique whether the answer needs more evidence.",
      context: VALID_DELEGATE_CONTEXT
    }
  });

  assert.equal(result.ok, true);
});

test("delegation input metadata hashes normalized overlong task instead of fallback rationale", () => {
  const left = parseDelegationRequest({
    rationale: "Use bounded delegated analysis.",
    payload: { task: "a".repeat(1001), context: VALID_DELEGATE_CONTEXT }
  });
  const right = parseDelegationRequest({
    rationale: "Use bounded delegated analysis.",
    payload: { task: "b".repeat(1001), context: VALID_DELEGATE_CONTEXT }
  });

  assert.equal(left.ok, false);
  assert.equal(right.ok, false);
  const leftMetadata = delegationInputMetadata(left);
  const rightMetadata = delegationInputMetadata(right);
  assert.equal(leftMetadata.task_chars, 1001);
  assert.equal(rightMetadata.task_chars, 1001);
  assert.notEqual(leftMetadata.input_digest, rightMetadata.input_digest);
  assert.doesNotMatch(JSON.stringify(leftMetadata), /a{20}/);
});

test("delegated output accepts only a strict full JSON object", () => {
  const strict = parseDelegatedOutput(JSON.stringify({
    summary: "Valid bounded summary.",
    findings_text: "Valid bounded findings."
  }), DELEGATED_OUTPUT_SOURCE);

  assert.equal(strict.ok, true);

  const validJson = JSON.stringify({
    summary: "Wrapped bounded summary.",
    findings_text: "Wrapped bounded findings."
  });
  const wrappedOutputs = [
    `Here is the delegated JSON:\n${validJson}`,
    `\`\`\`json\n${validJson}\n\`\`\``
  ];

  for (const output of wrappedOutputs) {
    const result = parseDelegatedOutput(output, DELEGATED_OUTPUT_SOURCE);
    assert.equal(result.ok, false, output);
    if (!result.ok) {
      assert.match(result.error, /not valid JSON/);
    }
  }
});

test("delegated output rejects natural-language command and test execution claims", () => {
  const outputs = [
    JSON.stringify({
      summary: "I ran the test suite and all checks passed.",
      findings_text: "No issue."
    }),
    JSON.stringify({
      summary: "I executed the unit tests and all checks passed.",
      findings_text: "No issue."
    }),
    JSON.stringify({
      summary: "我执行了测试，检查通过。",
      findings_text: "无问题。"
    }),
    `I ran the test suite.\n${JSON.stringify({
      summary: "Delegated output wrapper should be scanned.",
      findings_text: "No issue."
    })}`
  ];

  for (const output of outputs) {
    const result = parseDelegatedOutput(output, DELEGATED_OUTPUT_SOURCE);
    assert.equal(result.ok, false, output);
    if (!result.ok) {
      assert.match(result.error, /must not claim .* command\/test execution/);
      assert.match(result.safe_raw_output_preview ?? "", /raw output preview suppressed/);
    }
  }
});

test("delegated output rejects destructive and repository execution claims in every supported voice", () => {
  const claims = [
    "I deleted stale state records.",
    "I removed stale state records.",
    "I erased stale state records.",
    "I unlinked stale state records.",
    "I dropped stale state records.",
    "I destroyed stale state records.",
    "The delegated agent removed stale state records.",
    "Stale state records were deleted.",
    "Removed stale state records.",
    "陈旧状态记录已被删除。",
    "I pushed the branch to remote.",
    "I merged the change into main.",
    "I rebased the feature branch.",
    "I cherry-picked the release commit.",
    "I reset the branch.",
    "I tagged the release.",
    "I created a pull request.",
    "A pull request was opened.",
    "Pushed the branch to remote.",
    "我已推送分支到远端。",
    "我已创建拉取请求。",
    "拉取请求已创建。"
  ];

  for (const claim of claims) {
    const result = parseDelegatedOutput(JSON.stringify({
      summary: claim,
      findings_text: "No issue."
    }), DELEGATED_OUTPUT_SOURCE);
    assert.equal(result.ok, false, claim);
    if (!result.ok) {
      assert.match(result.error, /must not claim tool\/write\/mutation/);
      assert.match(result.safe_raw_output_preview ?? "", /raw output preview suppressed/);
    }
  }

  for (const recommendation of ["Stale state records should be removed.", "A pull request should be created.", "陈旧状态记录应被移除。", "应创建拉取请求。"]) {
    const result = parseDelegatedOutput(JSON.stringify({
      summary: recommendation,
      findings_text: "Bounded recommendation only."
    }), DELEGATED_OUTPUT_SOURCE);
    assert.equal(result.ok, true, recommendation);
  }
});

test("delegated output rejects unsupported fields with suppressed preview", () => {
  const result = parseDelegatedOutput(JSON.stringify({
    summary: "Valid bounded summary.",
    findings_text: "Valid bounded findings.",
    notes: "This unsupported field should not be echoed."
  }), DELEGATED_OUTPUT_SOURCE);

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.match(result.error, /may only include summary and findings_text/);
    assert.match(result.safe_raw_output_preview ?? "", /raw output preview suppressed/);
    assert.doesNotMatch(result.safe_raw_output_preview ?? "", /unsupported field should not be echoed/);
  }
});

test("delegated output rejects read, search, fetch, and browse tool claims", () => {
  const outputs = [
    JSON.stringify({
      summary: "I read files under docs and found no issue.",
      findings_text: "No issue."
    }),
    JSON.stringify({
      summary: "I searched the repo and found no issue.",
      findings_text: "No issue."
    }),
    JSON.stringify({
      summary: "I fetched the URL and found no issue.",
      findings_text: "No issue."
    }),
    JSON.stringify({
      summary: "I browsed the website and found no issue.",
      findings_text: "No issue."
    }),
    JSON.stringify({
      summary: "我读取了文件，没有发现问题。",
      findings_text: "无问题。"
    }),
    JSON.stringify({
      summary: "我搜索了仓库，没有发现问题。",
      findings_text: "无问题。"
    })
  ];

  for (const output of outputs) {
    const result = parseDelegatedOutput(output, DELEGATED_OUTPUT_SOURCE);
    assert.equal(result.ok, false, output);
    if (!result.ok) {
      assert.match(result.error, /must not claim .* command\/test execution/);
      assert.match(result.safe_raw_output_preview ?? "", /raw output preview suppressed/);
    }
  }
});

test("delegated output rejects exact raw task echo even when the task is short", () => {
  const result = parseDelegatedOutput(JSON.stringify({
    summary: "Short task echoed.",
    findings_text: "Critique this?"
  }), {
    task: "Critique this?",
    context: VALID_DELEGATE_CONTEXT
  });

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.match(result.error, /echoed raw delegated task/);
    assert.match(result.safe_raw_output_preview ?? "", /raw output preview suppressed/);
  }
});
