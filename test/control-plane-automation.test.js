import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  appendAutomationCheckpointForContext,
  appendTaskReviewReminder,
  buildAgentEndCheckpointSummary,
  buildCompactionCheckpointSummary,
  buildResetCheckpointSummary,
  shouldCheckpointAgentEnd,
  workerResultNeedsReview,
  validationBundleNeedsReview
} from "../src/control-plane-automation.js";
import { createTask, getTask, resolveStoreRoot } from "../src/task-store.js";

async function withTempDir(t) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "ocp-auto-"));
  t.after(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });
  return dir;
}

test("automation checkpoints only matching session tasks", async (t) => {
  const dir = await withTempDir(t);
  const pluginConfig = { storeDir: ".openclaw-control-plane" };
  const storeRoot = resolveStoreRoot({ pluginConfig, workspaceDir: dir });

  const matching = await createTask(storeRoot, { title: "Match", objective: "Keep state" }, { workspaceDir: dir, sessionKey: "session:a" });
  const other = await createTask(storeRoot, { title: "Other", objective: "Ignore state" }, { workspaceDir: dir, sessionKey: "session:b" });

  const changed = await appendAutomationCheckpointForContext(
    pluginConfig,
    { workspaceDir: dir, sessionKey: "session:a" },
    "Automatic handoff before reset.",
    { kind: "auto_handoff" }
  );

  assert.equal(changed.length, 1);
  assert.equal(changed[0].id, matching.id);

  const reloadedMatching = await getTask(storeRoot, matching.id);
  const reloadedOther = await getTask(storeRoot, other.id);
  assert.equal(reloadedMatching.checkpoints.length, 1);
  assert.equal(reloadedOther.checkpoints.length, 0);
});

test("review reminder checkpoints attach to the named task", async (t) => {
  const dir = await withTempDir(t);
  const pluginConfig = { storeDir: ".openclaw-control-plane" };
  const storeRoot = resolveStoreRoot({ pluginConfig, workspaceDir: dir });
  const task = await createTask(storeRoot, { title: "Review", objective: "Need review" }, { workspaceDir: dir, sessionKey: "session:a" });

  const updated = await appendTaskReviewReminder(
    pluginConfig,
    dir,
    task.id,
    "Automatic review reminder from worker result [partial].",
    "worker_result"
  );

  assert.equal(updated?.id, task.id);
  const reloaded = await getTask(storeRoot, task.id);
  assert.equal(reloaded.checkpoints.length, 1);
  assert.equal(reloaded.checkpoints[0].kind, "review_reminder");
});

test("automation helper decisions and summaries behave as expected", () => {
  assert.equal(shouldCheckpointAgentEnd({ success: false }, { checkpointOnFailure: true, checkpointOnLongRun: true, longRunMs: 1000 }), true);
  assert.equal(shouldCheckpointAgentEnd({ success: true, durationMs: 2000 }, { checkpointOnFailure: true, checkpointOnLongRun: true, longRunMs: 1000 }), true);
  assert.equal(workerResultNeedsReview({ status: "partial", handoff: { needsReview: false } }, { reviewReminders: { enabled: true } }), true);
  assert.equal(validationBundleNeedsReview({ outcome: "pass", unresolvedRisks: [{}] }, { reviewReminders: { enabled: true } }), true);
  assert.match(buildResetCheckpointSummary({ reason: "reset" }), /reset/);
  assert.match(buildCompactionCheckpointSummary({ messageCount: 20 }), /20/);
  assert.match(buildAgentEndCheckpointSummary({ success: false, error: "boom" }), /boom/);
});
