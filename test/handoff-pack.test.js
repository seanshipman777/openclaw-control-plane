import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { appendTaskReviewReminder } from "../src/control-plane-automation.js";
import { buildHandoffPack, resolveHandoffPackConfig } from "../src/handoff-pack.js";
import { buildPlanContract, enterPlanMode } from "../src/plan-mode.js";
import { addEvidence, checkpointTask, createTask, resolveStoreRoot, updateTask } from "../src/task-store.js";

async function withTempDir(t) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "ocp-handoff-"));
  t.after(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });
  return dir;
}

test("buildHandoffPack creates a worker brief from task + plan mode", async (t) => {
  const dir = await withTempDir(t);
  const pluginConfig = { storeDir: ".openclaw-control-plane" };
  const storeRoot = resolveStoreRoot({ pluginConfig, workspaceDir: dir });
  const task = await createTask(storeRoot, {
    title: "Ship handoff pack",
    objective: "Implement handoff composer",
    constraints: ["stay source-grounded"],
    currentStep: "Writing the packer",
    nextAction: "Return a worker brief",
    doneCriteria: ["tool loads", "tests pass"]
  }, { workspaceDir: dir, sessionKey: "session:a", sessionId: "sid-a", agentId: "ceo" });

  const contract = buildPlanContract({
    taskId: task.id,
    title: task.title,
    objective: task.objective,
    constraints: task.constraints,
    acceptanceCriteria: task.doneCriteria,
    nextAction: task.nextAction,
    proofTier: 2
  });

  await enterPlanMode(storeRoot, {
    sessionKey: "session:a",
    sessionId: "sid-a",
    agentId: "ceo",
    workspaceDir: dir
  }, contract);

  const pack = await buildHandoffPack(storeRoot, {
    sessionKey: "session:a",
    sessionId: "sid-a",
    agentId: "ceo"
  }, { mode: "worker" }, pluginConfig);

  assert.equal(pack.mode, "worker");
  assert.equal(pack.task.id, task.id);
  assert.equal(pack.plan.proofTier, 2);
  assert.match(pack.text, /Worker brief pack/);
  assert.match(pack.text, /expected_outputs/);
});

test("buildHandoffPack creates a review pack with reminders, evidence, and checkpoints", async (t) => {
  const dir = await withTempDir(t);
  const pluginConfig = { storeDir: ".openclaw-control-plane" };
  const storeRoot = resolveStoreRoot({ pluginConfig, workspaceDir: dir });
  const task = await createTask(storeRoot, {
    title: "Review target",
    objective: "Need a reviewer pack",
    status: "blocked",
    blockers: ["waiting on fix"]
  }, { workspaceDir: dir, sessionKey: "session:b", sessionId: "sid-b", agentId: "ceo" });

  await addEvidence(storeRoot, task.id, "test log attached");
  await checkpointTask(storeRoot, task.id, "Blocked after failing validation");
  await appendTaskReviewReminder(pluginConfig, dir, task.id, "Automatic review reminder from validation bundle.", "validation_bundle", {
    validationOutcome: "fail",
    riskCount: 2,
    tier: 2
  });
  await updateTask(storeRoot, task.id, { nextAction: "Inspect validation failures" });

  const pack = await buildHandoffPack(storeRoot, {
    sessionKey: "session:b",
    sessionId: "sid-b",
    agentId: "ceo"
  }, { mode: "review" }, pluginConfig);

  assert.equal(pack.mode, "review");
  assert.equal(pack.review.needsReview, true);
  assert.equal(pack.review.validationOutcome, "fail");
  assert.equal(pack.evidence.length, 1);
  assert.equal(pack.checkpoints.length >= 1, true);
  assert.match(pack.text, /Review pack/);
  assert.match(pack.text, /validation_outcome: fail/);
});

test("resolveHandoffPackConfig applies safe defaults", () => {
  const config = resolveHandoffPackConfig({});
  assert.equal(config.defaultEvidenceLimit, 3);
  assert.equal(config.defaultCheckpointLimit, 3);
  assert.equal(config.defaultStepLimit, 5);
});
