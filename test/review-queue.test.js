import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { appendTaskReviewReminder } from "../src/control-plane-automation.js";
import { buildReviewQueue, deriveReviewQueueItem, formatReviewQueueSummary } from "../src/review-queue.js";
import { createTask, resolveStoreRoot, updateTask } from "../src/task-store.js";

async function withTempDir(t) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "ocp-review-"));
  t.after(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });
  return dir;
}

test("deriveReviewQueueItem scores blocked review work highest", async (t) => {
  const dir = await withTempDir(t);
  const pluginConfig = { storeDir: ".openclaw-control-plane" };
  const storeRoot = resolveStoreRoot({ pluginConfig, workspaceDir: dir });
  const task = await createTask(storeRoot, {
    title: "Needs review",
    objective: "Check failing flow",
    status: "blocked",
    blockers: ["waiting on fix"]
  }, { workspaceDir: dir, sessionKey: "session:a" });

  await appendTaskReviewReminder(pluginConfig, dir, task.id, "Automatic review reminder from validation bundle.", "validation_bundle", {
    validationOutcome: "fail",
    riskCount: 2,
    tier: 2
  });

  const updated = await updateTask(storeRoot, task.id, { nextAction: "Inspect logs" });
  const item = deriveReviewQueueItem(updated, {
    nowMs: Date.now() + 1000
  });

  assert.equal(item.signals.blocked, true);
  assert.equal(item.signals.needsReview, true);
  assert.equal(item.signals.validationOutcome, "fail");
  assert.equal(item.signals.riskCount, 2);
  assert.equal(item.score > 100, true);
});

test("buildReviewQueue filters stale and review items", async (t) => {
  const dir = await withTempDir(t);
  const pluginConfig = { storeDir: ".openclaw-control-plane", reviewQueue: { activeStaleAfterMs: 1000 } };
  const storeRoot = resolveStoreRoot({ pluginConfig, workspaceDir: dir });

  const staleTask = await createTask(storeRoot, {
    title: "Stale task",
    objective: "Needs movement",
    status: "active"
  }, { workspaceDir: dir, sessionKey: "session:a" });
  const freshTask = await createTask(storeRoot, {
    title: "Fresh review",
    objective: "Needs explicit review",
    status: "active",
    nextAction: "Wait for reviewer"
  }, { workspaceDir: dir, sessionKey: "session:a" });

  await fs.utimes(path.join(storeRoot, "tasks", `${staleTask.id}.json`), new Date(Date.now() - 10_000), new Date(Date.now() - 10_000));
  await appendTaskReviewReminder(pluginConfig, dir, freshTask.id, "Automatic review reminder from worker result.", "worker_result", {
    status: "partial",
    needsReview: true,
    riskCount: 0
  });

  const queue = await buildReviewQueue(storeRoot, {
    pluginConfig,
    filter: "attention",
    includeDone: false,
    sessionKey: "session:a",
    nowMs: Date.now() + 20_000,
    staleAfterMs: 1000
  });

  assert.equal(queue.items.length, 2);
  assert.equal(queue.stats.needsReview >= 1, true);
  assert.equal(queue.stats.stale >= 1, true);
  assert.match(formatReviewQueueSummary(queue), /Review queue/);
});

test("buildReviewQueue summary stats are not truncated by output limit", async (t) => {
  const dir = await withTempDir(t);
  const pluginConfig = { storeDir: ".openclaw-control-plane" };
  const storeRoot = resolveStoreRoot({ pluginConfig, workspaceDir: dir });

  for (let i = 0; i < 5; i++) {
    const task = await createTask(storeRoot, {
      title: `Review ${i}`,
      objective: `Need review ${i}`,
      status: "blocked",
      blockers: ["waiting"]
    }, { workspaceDir: dir, sessionKey: "session:a" });
    await appendTaskReviewReminder(pluginConfig, dir, task.id, "Automatic review reminder from worker result.", "worker_result", {
      status: "partial",
      needsReview: true,
      riskCount: 1
    });
  }

  const queue = await buildReviewQueue(storeRoot, {
    pluginConfig,
    filter: "attention",
    sessionKey: "session:a",
    limit: 2
  });

  assert.equal(queue.items.length, 2);
  assert.equal(queue.stats.total, 5);
  assert.equal(queue.stats.needsReview, 5);
});
