import assert from "node:assert/strict";
import test from "node:test";
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
