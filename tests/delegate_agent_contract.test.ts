import assert from "node:assert/strict";
import test from "node:test";
import { formatDelegateAgentSubagentInstructions } from "../packages/core/src/action_contracts.js";
import {
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
  assert.match(instructions, /strict json object with keys summary and findings_text/);
  assert.match(instructions, /Do not claim tool\/write\/mutation/);
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
