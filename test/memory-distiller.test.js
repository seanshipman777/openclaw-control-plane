import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  appendMemoryCandidate,
  buildMemoryCandidate,
  buildMemoryCandidatesFromToolResult,
  distillMemory,
  formatDream,
  listDreams,
  listMemoryCandidates,
  resolveMemoryDistillerConfig
} from "../src/memory-distiller.js";
import { resolveStoreRoot } from "../src/task-store.js";

async function withTempDir(t) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "ocp-dream-"));
  t.after(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });
  return dir;
}

test("buildMemoryCandidatesFromToolResult extracts worker and validation candidates", () => {
  const worker = buildMemoryCandidatesFromToolResult("worker_result", {}, {
    summary: "Implemented the feature.",
    status: "partial",
    task: { taskId: "task-1", title: "Feature" },
    risks: [{}, {}],
    handoff: { needsReview: true }
  }, { sessionKey: "session:a" });

  const validation = buildMemoryCandidatesFromToolResult("validation_bundle", {}, {
    summary: "Validation found blocking issues.",
    outcome: "fail",
    tier: 2,
    unresolvedRisks: [{}],
    target: { taskId: "task-1", title: "Feature" }
  }, { sessionKey: "session:a" });

  assert.equal(worker.length, 1);
  assert.equal(worker[0].sourceType, "worker_result");
  assert.equal(worker[0].category, "open_question");
  assert.equal(validation.length, 1);
  assert.equal(validation[0].sourceType, "validation_bundle");
  assert.equal(validation[0].category, "risk");
});

test("distillMemory dedupes and creates a dream rollup", async (t) => {
  const dir = await withTempDir(t);
  const pluginConfig = { storeDir: ".openclaw-control-plane" };
  const storeRoot = resolveStoreRoot({ pluginConfig, workspaceDir: dir });

  await appendMemoryCandidate(storeRoot, buildMemoryCandidate({
    sourceType: "worker_result",
    summary: "Implemented the feature.",
    detail: "Tests passed.",
    score: 60,
    taskId: "task-1",
    title: "Feature"
  }, { sessionKey: "session:a" }));
  await appendMemoryCandidate(storeRoot, buildMemoryCandidate({
    sourceType: "worker_result",
    summary: "Implemented the feature.",
    detail: "Tests passed.",
    score: 55,
    taskId: "task-1",
    title: "Feature"
  }, { sessionKey: "session:a" }));
  await appendMemoryCandidate(storeRoot, buildMemoryCandidate({
    sourceType: "validation_bundle",
    summary: "Validation found blocking issues.",
    score: 80,
    category: "risk",
    taskId: "task-1",
    title: "Feature"
  }, { sessionKey: "session:a" }));

  const dream = await distillMemory(storeRoot, {
    pluginConfig,
    sessionKey: "session:a",
    minScore: 40,
    limit: 5,
    trigger: "manual"
  });

  assert.equal(dream.selectedCount, 2);
  assert.equal(dream.items.length, 2);
  assert.match(formatDream(dream), /Dream/);
  const dreams = await listDreams(storeRoot, { sessionKey: "session:a" });
  assert.equal(dreams.length, 1);
});

test("listMemoryCandidates returns scored candidates and config honors aliases", async (t) => {
  const dir = await withTempDir(t);
  const pluginConfig = { storeDir: ".openclaw-control-plane", autoMemoryEnabled: true, autoDreamEnabled: true };
  const storeRoot = resolveStoreRoot({ pluginConfig, workspaceDir: dir });

  await appendMemoryCandidate(storeRoot, buildMemoryCandidate({
    sourceType: "manual",
    summary: "RULE: keep outputs deterministic.",
    score: 90,
    category: "rule"
  }, { sessionKey: "session:b" }));

  const listed = await listMemoryCandidates(storeRoot, { sessionKey: "session:b" });
  assert.equal(listed.length, 1);
  assert.equal(listed[0].category, "rule");

  const config = resolveMemoryDistillerConfig(pluginConfig);
  assert.equal(config.autoMemoryEnabled, true);
  assert.equal(config.autoDreamEnabled, true);
});
