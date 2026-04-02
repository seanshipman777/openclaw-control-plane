import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { checkpointTask, createTask, resolveStoreRoot, updateTask } from "../src/task-store.js";
import { buildDriftMonitor, deriveDriftMonitorItem, formatDriftMonitorSummary, resolveDriftMonitorConfig } from "../src/drift-monitor.js";

async function withTempDir(t) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "ocp-drift-"));
  t.after(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });
  return dir;
}

test("deriveDriftMonitorItem detects repeated blockers and pressure signals", async (t) => {
  const dir = await withTempDir(t);
  const pluginConfig = { storeDir: ".openclaw-control-plane" };
  const storeRoot = resolveStoreRoot({ pluginConfig, workspaceDir: dir });
  const task = await createTask(storeRoot, {
    title: "Rotting task",
    objective: "Still blocked",
    status: "blocked",
    blockers: ["waiting on fix"]
  }, { workspaceDir: dir, sessionKey: "session:a" });

  await checkpointTask(storeRoot, task.id, "Still blocked after review", {
    reason: "manual",
    kind: "status"
  });
  await checkpointTask(storeRoot, task.id, "Automatic handoff before session compaction.", {
    reason: "before_compaction",
    kind: "auto_handoff",
    automation: { hook: "before_compaction" }
  });
  await checkpointTask(storeRoot, task.id, "Automatic handoff before session compaction.", {
    reason: "before_compaction",
    kind: "auto_handoff",
    automation: { hook: "before_compaction" }
  });
  await checkpointTask(storeRoot, task.id, "Automatic handoff before session reset.", {
    reason: "before_reset",
    kind: "auto_handoff",
    automation: { hook: "before_reset" }
  });
  await checkpointTask(storeRoot, task.id, "Automatic handoff before session reset.", {
    reason: "before_reset",
    kind: "auto_handoff",
    automation: { hook: "before_reset" }
  });

  const updated = await updateTask(storeRoot, task.id, { blockers: ["waiting on fix"] });
  const item = deriveDriftMonitorItem(updated, {
    config: resolveDriftMonitorConfig({}),
    nowMs: Date.now() + 1000
  });

  assert.equal(item.signals.repeatedBlockers, true);
  assert.equal(item.signals.compactionPressure, true);
  assert.equal(item.signals.resetPressure, true);
  assert.equal(item.severity, "high");
});

test("buildDriftMonitor summarizes stale and missing evidence work", async (t) => {
  const dir = await withTempDir(t);
  const pluginConfig = {
    storeDir: ".openclaw-control-plane",
    driftMonitor: {
      activeStaleAfterMs: 1000,
      missingEvidenceAfterMs: 1000
    }
  };
  const storeRoot = resolveStoreRoot({ pluginConfig, workspaceDir: dir });

  const staleTask = await createTask(storeRoot, {
    title: "Stale active task",
    objective: "Needs movement",
    status: "active"
  }, { workspaceDir: dir, sessionKey: "session:a" });

  const freshTask = await createTask(storeRoot, {
    title: "Fresh active task",
    objective: "Still okay",
    status: "active",
    nextAction: "Keep going"
  }, { workspaceDir: dir, sessionKey: "session:a" });

  await fs.utimes(path.join(storeRoot, "tasks", `${staleTask.id}.json`), new Date(Date.now() - 10_000), new Date(Date.now() - 10_000));
  await fs.utimes(path.join(storeRoot, "tasks", `${freshTask.id}.json`), new Date(), new Date());

  const report = await buildDriftMonitor(storeRoot, {
    pluginConfig,
    filter: "drifting",
    sessionKey: "session:a",
    nowMs: Date.now() + 20_000,
    staleAfterMs: 1000
  });

  assert.equal(report.items.length >= 1, true);
  assert.equal(report.stats.stale >= 1, true);
  assert.equal(report.stats.missingEvidence >= 1, true);
  assert.match(formatDriftMonitorSummary(report), /Drift monitor/);
});

test("buildDriftMonitor summary stats are not truncated by output limit", async (t) => {
  const dir = await withTempDir(t);
  const pluginConfig = {
    storeDir: ".openclaw-control-plane",
    driftMonitor: {
      activeStaleAfterMs: 1000,
      missingEvidenceAfterMs: 1000
    }
  };
  const storeRoot = resolveStoreRoot({ pluginConfig, workspaceDir: dir });

  for (let i = 0; i < 4; i++) {
    await createTask(storeRoot, {
      title: `Stale ${i}`,
      objective: `Needs movement ${i}`,
      status: "active"
    }, { workspaceDir: dir, sessionKey: "session:a" });
  }

  const tasksPath = path.join(storeRoot, "tasks");
  for (const file of await fs.readdir(tasksPath)) {
    const old = new Date(Date.now() - 10_000);
    await fs.utimes(path.join(tasksPath, file), old, old);
  }

  const report = await buildDriftMonitor(storeRoot, {
    pluginConfig,
    filter: "drifting",
    sessionKey: "session:a",
    nowMs: Date.now() + 20_000,
    staleAfterMs: 1000,
    limit: 2
  });

  assert.equal(report.items.length, 2);
  assert.equal(report.stats.total, 4);
  assert.equal(report.stats.stale, 4);
});
