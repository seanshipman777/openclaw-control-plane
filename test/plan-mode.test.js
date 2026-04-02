import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  buildPlanContract,
  buildPlanInputFromTask,
  buildPlanModePrompt,
  enterPlanMode,
  exitPlanMode,
  getActivePlanMode,
  resolvePlanModeConfig
} from "../src/plan-mode.js";
import { createTask, resolveStoreRoot } from "../src/task-store.js";

async function withTempDir(t) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "ocp-plan-"));
  t.after(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });
  return dir;
}

test("buildPlanContract creates a bounded execution contract", () => {
  const contract = buildPlanContract({
    title: "Ship review queue",
    objective: "Implement review_queue for task triage.",
    constraints: ["stay source-grounded"],
    acceptanceCriteria: ["tool loads", "tests pass"],
    nextAction: "Implement the new tool",
    proofTier: 2
  });

  assert.equal(contract.schemaVersion, "plan_contract.v1");
  assert.equal(contract.proofTier, 2);
  assert.equal(contract.steps.length > 0, true);
  assert.equal(contract.execution.expectedOutputs.includes("worker_result.v1"), true);
  assert.match(buildPlanModePrompt(contract), /Active plan mode is ON/);
});

test("enterPlanMode and exitPlanMode persist session planning state", async (t) => {
  const dir = await withTempDir(t);
  const storeRoot = resolveStoreRoot({ pluginConfig: { storeDir: ".openclaw-control-plane" }, workspaceDir: dir });
  const contract = buildPlanContract({ objective: "Plan the next task." });

  await enterPlanMode(storeRoot, {
    sessionKey: "session:a",
    sessionId: "sid-a",
    agentId: "ceo",
    workspaceDir: dir
  }, contract);

  const active = await getActivePlanMode(storeRoot, "session:a", "sid-a");
  assert.equal(active.task.objective, "Plan the next task.");

  const exited = await exitPlanMode(storeRoot, "session:a", "sid-a");
  assert.equal(exited.task.objective, "Plan the next task.");
  const missing = await getActivePlanMode(storeRoot, "session:a", "sid-a");
  assert.equal(missing, undefined);
});

test("buildPlanInputFromTask reuses task-ledger state", async (t) => {
  const dir = await withTempDir(t);
  const storeRoot = resolveStoreRoot({ pluginConfig: { storeDir: ".openclaw-control-plane" }, workspaceDir: dir });
  const task = await createTask(storeRoot, {
    title: "Delegation target",
    objective: "Plan worker brief",
    constraints: ["stay bounded"],
    currentStep: "Assess next step",
    nextAction: "Write the planner"
  }, { workspaceDir: dir, sessionKey: "session:a" });

  const input = await buildPlanInputFromTask(storeRoot, task.id, {});
  assert.equal(input.title, "Delegation target");
  assert.equal(input.nextAction, "Write the planner");
  assert.deepEqual(input.constraints, ["stay bounded"]);
});

test("resolvePlanModeConfig applies safe defaults", () => {
  const config = resolvePlanModeConfig({});
  assert.equal(config.enabled, true);
  assert.equal(config.maxSteps, 8);
  assert.equal(config.planningOnlyDefault, true);
});
