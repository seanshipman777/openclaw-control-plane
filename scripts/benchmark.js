import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { performance } from "node:perf_hooks";

import { packContext } from "../src/context-packer.js";
import { buildDriftMonitor } from "../src/drift-monitor.js";
import { buildHandoffPack } from "../src/handoff-pack.js";
import { appendMemoryCandidate, buildMemoryCandidate, distillMemory } from "../src/memory-distiller.js";
import { buildPlanContract, enterPlanMode } from "../src/plan-mode.js";
import { buildReviewQueue } from "../src/review-queue.js";
import { addEvidence, checkpointTask, createTask, resolveStoreRoot } from "../src/task-store.js";

const pluginConfig = {
  storeDir: ".openclaw-control-plane",
  reviewQueue: { activeStaleAfterMs: 86400000, blockedStaleAfterMs: 21600000 },
  driftMonitor: { activeStaleAfterMs: 172800000, blockedStaleAfterMs: 43200000, missingEvidenceAfterMs: 14400000 },
  handoffPack: { defaultEvidenceLimit: 3, defaultCheckpointLimit: 3, defaultStepLimit: 5 },
  memoryDistiller: { candidateRetentionDays: 30, minScore: 35, distillLimit: 8 }
};

async function main() {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "ocp-benchmark-"));
  const storeRoot = resolveStoreRoot({ pluginConfig, workspaceDir: tmp });

  const t0 = performance.now();
  for (let i = 0; i < 80; i++) {
    const status = i % 7 === 0 ? "blocked" : (i % 11 === 0 ? "done" : "active");
    const task = await createTask(storeRoot, {
      title: `Task ${i}`,
      objective: `Objective ${i}`,
      status,
      constraints: ["stay bounded", "record evidence"],
      currentStep: i % 3 === 0 ? "Implement core path" : "Review results",
      nextAction: status === "done" ? "Archive" : `Next action ${i}`,
      blockers: status === "blocked" ? [`blocker-${i % 4}`] : [],
      doneCriteria: ["tests pass", "proof captured"]
    }, { workspaceDir: tmp, sessionKey: "session:bench", sessionId: "sid-bench", agentId: "ceo" });

    if (i % 2 === 0) await addEvidence(storeRoot, task.id, `evidence ${i}`);
    if (i % 5 === 0) await checkpointTask(storeRoot, task.id, `checkpoint ${i}`, { kind: "status", reason: "manual" });
    if (status === "blocked") {
      await checkpointTask(storeRoot, task.id, "Automatic handoff before session compaction.", {
        kind: "auto_handoff", reason: "before_compaction", automation: { hook: "before_compaction" }
      });
      await checkpointTask(storeRoot, task.id, "Automatic handoff before session reset.", {
        kind: "auto_handoff", reason: "before_reset", automation: { hook: "before_reset" }
      });
    }
    if (i % 9 === 0) {
      await appendMemoryCandidate(storeRoot, buildMemoryCandidate({
        sourceType: "worker_result",
        summary: `Implemented chunk ${i}`,
        detail: `detail ${i}`,
        score: 40 + (i % 30),
        taskId: task.id,
        title: task.title,
        tags: [status]
      }, { sessionKey: "session:bench", sessionId: "sid-bench", agentId: "ceo" }));
    }
  }
  const buildMs = performance.now() - t0;

  const plan = buildPlanContract({
    taskId: "task-0001",
    title: "Task 0",
    objective: "Objective 0",
    constraints: ["stay bounded"],
    acceptanceCriteria: ["tests pass"],
    nextAction: "Execute next step",
    proofTier: 2
  });
  await enterPlanMode(storeRoot, { sessionKey: "session:bench", sessionId: "sid-bench", agentId: "ceo", workspaceDir: tmp }, plan);

  const timings = {};

  let start = performance.now();
  const review = await buildReviewQueue(storeRoot, { pluginConfig, sessionKey: "session:bench", sessionId: "sid-bench", agentId: "ceo", filter: "attention", includeDone: true, limit: 20 });
  timings.reviewQueueMs = performance.now() - start;

  start = performance.now();
  const handoff = await buildHandoffPack(storeRoot, { sessionKey: "session:bench", sessionId: "sid-bench", agentId: "ceo" }, { mode: "worker" }, pluginConfig);
  timings.handoffPackMs = performance.now() - start;

  start = performance.now();
  const drift = await buildDriftMonitor(storeRoot, { pluginConfig, sessionKey: "session:bench", sessionId: "sid-bench", agentId: "ceo", includeDone: true, filter: "drifting", limit: 20 });
  timings.driftMonitorMs = performance.now() - start;

  start = performance.now();
  const dream = await distillMemory(storeRoot, { pluginConfig, sessionKey: "session:bench", trigger: "manual", limit: 8, minScore: 35 });
  timings.memoryDistillMs = performance.now() - start;

  start = performance.now();
  const packed = packContext({
    maxChars: 5000,
    maxItems: 12,
    staleAfterMs: 86400000,
    items: Array.from({ length: 40 }, (_, i) => ({
      id: `item-${i}`,
      sourceType: i % 5 === 0 ? "user" : (i % 3 === 0 ? "memory" : "task"),
      updatedAt: new Date(Date.now() - i * 1000 * 60).toISOString(),
      text: `Context item ${i} `.repeat(20),
      priority: i % 4,
      title: `Item ${i}`
    }))
  });
  timings.contextPackerMs = performance.now() - start;

  console.log(JSON.stringify({
    dataset: { tasks: 80, generatedInMs: Number(buildMs.toFixed(2)) },
    timings: Object.fromEntries(Object.entries(timings).map(([k, v]) => [k, Number(v.toFixed(2))])),
    outputs: {
      reviewItems: review.items.length,
      reviewTotal: review.stats.total,
      handoffTextLength: handoff.text.length,
      driftItems: drift.items.length,
      driftHigh: drift.stats.high,
      dreamSelected: dream.selectedCount,
      dreamCandidates: dream.sourceCandidateCount,
      packedItems: packed.stats.selectedItems,
      packedChars: packed.stats.outputChars
    },
    notes: [
      "This benchmark is synthetic and intended for regression tracking, not for absolute performance claims.",
      "Use it to compare changes across commits and spot pathological slowdowns or output inflation."
    ]
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
