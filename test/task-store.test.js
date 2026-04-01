import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  addEvidence,
  checkpointTask,
  createTask,
  getTask,
  listTasks,
  resolveStoreRoot,
  updateTask
} from "../src/task-store.js";

async function withTempDir(t) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "ocp-test-"));
  t.after(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });
  return dir;
}

test("resolveStoreRoot defaults under workspace", async (t) => {
  const dir = await withTempDir(t);
  const storeRoot = resolveStoreRoot({ workspaceDir: dir });
  assert.equal(storeRoot, path.join(dir, ".openclaw-control-plane"));
});

test("createTask persists normalized task state", async (t) => {
  const dir = await withTempDir(t);
  const storeRoot = resolveStoreRoot({ workspaceDir: dir });
  const task = await createTask(
    storeRoot,
    {
      title: "Ship phase 1",
      objective: "Implement the task ledger plugin",
      constraints: ["do not patch core", "keep it reversible"],
      currentStep: "write the store module",
      nextAction: "add tests",
      doneCriteria: ["plugin loads", "tests pass"]
    },
    { workspaceDir: dir, sessionKey: "session:test" }
  );

  assert.equal(task.title, "Ship phase 1");
  assert.equal(task.status, "active");
  assert.deepEqual(task.constraints, ["do not patch core", "keep it reversible"]);

  const reloaded = await getTask(storeRoot, task.id);
  assert.equal(reloaded.objective, "Implement the task ledger plugin");
  assert.equal(reloaded.context.sessionKey, "session:test");
});

test("updateTask, addEvidence, checkpointTask, and listTasks work together", async (t) => {
  const dir = await withTempDir(t);
  const storeRoot = resolveStoreRoot({ workspaceDir: dir });
  const first = await createTask(storeRoot, {
    title: "First",
    objective: "First objective"
  });
  const second = await createTask(storeRoot, {
    title: "Second",
    objective: "Second objective",
    status: "blocked"
  });

  await updateTask(storeRoot, first.id, {
    currentStep: "writing plugin",
    nextAction: "run tests",
    blockers: ["none"]
  });
  await addEvidence(storeRoot, first.id, "unit tests pass");
  const updated = await checkpointTask(storeRoot, first.id, "phase 1 implementation complete");

  assert.equal(updated.checkpoints.length, 1);
  assert.equal(updated.evidence.length, 1);
  assert.equal(updated.nextAction, "run tests");

  const blocked = await listTasks(storeRoot, { status: "blocked" });
  assert.equal(blocked.length, 1);
  assert.equal(blocked[0].id, second.id);

  const listed = await listTasks(storeRoot, { includeArchived: true, limit: 10 });
  assert.equal(listed.length, 2);
  assert.equal(listed[0].id, first.id);
});
