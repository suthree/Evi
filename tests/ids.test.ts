import assert from "node:assert/strict";
import test from "node:test";
import { slugifySkillName } from "../packages/core/src/ids.js";

test("skill-name slugging keeps meaningful ASCII titles stable", () => {
  assert.equal(slugifySkillName("Verify user vault SOP flow"), "verify-user-vault-sop-flow");
});

test("skill-name slugging gives non-ASCII titles deterministic collision-resistant names", () => {
  const first = slugifySkillName("依据本地自主决策规则判定变更确认需求");
  const second = slugifySkillName("受控模型连通性回显验证候选流程");

  assert.match(first, /^skill-[a-f0-9]{12}$/);
  assert.match(second, /^skill-[a-f0-9]{12}$/);
  assert.notEqual(first, second);
  assert.equal(first, slugifySkillName("依据本地自主决策规则判定变更确认需求"));
});
