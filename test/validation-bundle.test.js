import test from "node:test";
import assert from "node:assert/strict";

import {
  normalizeValidationBundle,
  renderValidationBundle,
  validateValidationBundle
} from "../src/validation-bundle.js";

test("normalizeValidationBundle builds a structured proof bundle", () => {
  const bundle = normalizeValidationBundle(
    {
      taskId: "task-456",
      title: "Validate dashboard fix",
      surface: "dashboard",
      component: "session status card",
      tier: 2,
      outcome: "partial",
      summary: "One meaningful safe action passed; export flow still blocked.",
      methodology: "logged in, exercised safe state change, verified before/after",
      before: [{ kind: "screenshot", label: "before", value: "before.png" }],
      after: [{ kind: "screenshot", label: "after", value: "after.png" }],
      checks: [
        { name: "render", status: "pass" },
        { name: "safe action", status: "pass" },
        { name: "export", status: "fail", detail: "button throws 500" }
      ],
      unresolvedRisks: [
        { level: "medium", text: "export path still broken", mitigation: "inspect backend logs" }
      ],
      nextSteps: ["inspect export handler"],
      scores: { render: 5, workflow: 3 }
    },
    { agentId: "ceo", sessionKey: "session:test" }
  );

  assert.equal(bundle.schemaVersion, "validation_bundle.v1");
  assert.equal(bundle.tier, 2);
  assert.equal(bundle.before.length, 1);
  assert.equal(bundle.after.length, 1);
  assert.equal(bundle.checks.length, 3);
  assert.equal(bundle.unresolvedRisks.length, 1);
  assert.equal(bundle.validator.agentId, "ceo");
});

test("validateValidationBundle rejects invalid payloads", () => {
  const validation = validateValidationBundle({ summary: "missing tier" });
  assert.equal(validation.valid, false);
  assert.equal(validation.errors.length > 0, true);
});

test("renderValidationBundle summarizes bundle state compactly", () => {
  const rendered = renderValidationBundle(
    normalizeValidationBundle({
      tier: 1,
      outcome: "pass",
      summary: "Render proof complete.",
      checks: ["page loaded"],
      nextSteps: ["move to tier 2"]
    })
  );

  assert.match(rendered, /Validation bundle \[tier 1 \| pass\]/);
  assert.match(rendered, /checks: pass=1/);
  assert.match(rendered, /next_steps: move to tier 2/);
});
