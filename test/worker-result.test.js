import test from "node:test";
import assert from "node:assert/strict";

import { normalizeWorkerResult, renderWorkerResult, validateWorkerResult } from "../src/worker-result.js";

test("normalizeWorkerResult builds a structured handoff contract", () => {
  const result = normalizeWorkerResult(
    {
      taskId: "task-123",
      title: "Ship context packer",
      objective: "Reduce prompt sludge",
      status: "partial",
      summary: "Implemented core packer; deployment still pending.",
      details: "Tests pass locally.",
      blockers: ["restart needed"],
      evidence: [
        "unit tests passing",
        { kind: "path", label: "repo", value: "/tmp/plugin" }
      ],
      risks: [
        "restart may interrupt live turn",
        { level: "low", text: "naming may still evolve", mitigation: "keep schema versioned" }
      ],
      nextSteps: [
        "deploy plugin",
        { owner: "CEO", text: "verify tool registration" }
      ],
      needsReview: true,
      recommendedOwner: "James"
    },
    { agentId: "ceo", sessionKey: "session:test" }
  );

  assert.equal(result.schemaVersion, "worker_result.v1");
  assert.equal(result.status, "partial");
  assert.equal(result.worker.agentId, "ceo");
  assert.equal(result.evidence.length, 2);
  assert.equal(result.risks.length, 2);
  assert.equal(result.nextSteps.length, 2);
  assert.equal(result.handoff.needsReview, true);
});

test("validateWorkerResult rejects invalid payloads", () => {
  const validation = validateWorkerResult({ status: "done" });
  assert.equal(validation.valid, false);
  assert.equal(validation.errors.length > 0, true);
});

test("renderWorkerResult summarizes the contract compactly", () => {
  const rendered = renderWorkerResult(
    normalizeWorkerResult({
      taskId: "task-123",
      summary: "Completed the worker contract.",
      status: "done",
      nextSteps: ["build validation bundle"]
    })
  );

  assert.match(rendered, /Worker result \[done\]/);
  assert.match(rendered, /task_id: task-123/);
  assert.match(rendered, /next_steps: build validation bundle/);
});
