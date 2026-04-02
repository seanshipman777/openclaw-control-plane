import { deriveReviewQueueItem, resolveReviewQueueConfig } from "./review-queue.js";
import { getTask, listTasks } from "./task-store.js";

function cleanText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizePositiveInteger(value, fallback) {
  if (!Number.isFinite(value)) {
    return fallback;
  }
  const next = Math.floor(value);
  return next > 0 ? next : fallback;
}

function toEpoch(value) {
  const parsed = Date.parse(String(value || ""));
  return Number.isNaN(parsed) ? 0 : parsed;
}

function latestAt(items) {
  return [...(Array.isArray(items) ? items : [])]
    .filter((entry) => entry && typeof entry === "object")
    .sort((left, right) => toEpoch(right.at || right.updatedAt || right.createdAt) - toEpoch(left.at || left.updatedAt || left.createdAt))[0];
}

export function resolveDriftMonitorConfig(pluginConfig = {}) {
  const driftMonitor = pluginConfig && typeof pluginConfig === "object" && !Array.isArray(pluginConfig.driftMonitor)
    ? pluginConfig.driftMonitor || {}
    : {};

  return {
    activeStaleAfterMs: normalizePositiveInteger(driftMonitor.activeStaleAfterMs, 2 * 24 * 60 * 60 * 1000),
    blockedStaleAfterMs: normalizePositiveInteger(driftMonitor.blockedStaleAfterMs, 12 * 60 * 60 * 1000),
    doneStaleAfterMs: normalizePositiveInteger(driftMonitor.doneStaleAfterMs, 7 * 24 * 60 * 60 * 1000),
    missingEvidenceAfterMs: normalizePositiveInteger(driftMonitor.missingEvidenceAfterMs, 4 * 60 * 60 * 1000),
    pressureWindowMs: normalizePositiveInteger(driftMonitor.pressureWindowMs, 7 * 24 * 60 * 60 * 1000),
    repeatedBlockedCheckpointThreshold: normalizePositiveInteger(driftMonitor.repeatedBlockedCheckpointThreshold, 2),
    compactionPressureCheckpointThreshold: normalizePositiveInteger(driftMonitor.compactionPressureCheckpointThreshold, 2),
    resetPressureCheckpointThreshold: normalizePositiveInteger(driftMonitor.resetPressureCheckpointThreshold, 2),
    defaultListLimit: normalizePositiveInteger(driftMonitor.defaultListLimit, 20)
  };
}

function deriveStaleAfterMs(task, config) {
  if (task.status === "blocked") {
    return config.blockedStaleAfterMs;
  }
  if (task.status === "done") {
    return config.doneStaleAfterMs;
  }
  return config.activeStaleAfterMs;
}

function countRecentCheckpoints(task, predicate, lookbackMs, nowMs) {
  return (Array.isArray(task?.checkpoints) ? task.checkpoints : [])
    .filter((entry) => entry && typeof entry === "object")
    .filter((entry) => nowMs - toEpoch(entry.at) <= lookbackMs)
    .filter(predicate)
    .length;
}

export function deriveDriftMonitorItem(task, options = {}) {
  const config = options.config || resolveDriftMonitorConfig();
  const nowMs = Number.isFinite(options.nowMs) ? options.nowMs : Date.now();
  const reviewConfig = options.reviewConfig || resolveReviewQueueConfig(options.pluginConfig);
  const review = deriveReviewQueueItem(task, {
    config: reviewConfig,
    staleAfterMs: options.staleAfterMs,
    nowMs
  });

  const staleAfterMs = normalizePositiveInteger(options.staleAfterMs, deriveStaleAfterMs(task, config));
  const updatedAtMs = toEpoch(task.updatedAt || task.createdAt);
  const ageMs = nowMs - updatedAtMs;
  const latestEvidence = latestAt(task.evidence);
  const latestCheckpoint = latestAt(task.checkpoints);
  const evidenceAgeMs = latestEvidence ? nowMs - toEpoch(latestEvidence.at) : undefined;
  const missingEvidence = task.status !== "archived"
    && (!Array.isArray(task.evidence) || task.evidence.length === 0)
    && ageMs >= config.missingEvidenceAfterMs;

  const repeatedBlockedCount = countRecentCheckpoints(
    task,
    (entry) => entry.status === "blocked",
    config.pressureWindowMs,
    nowMs
  );
  const recentCompactions = countRecentCheckpoints(
    task,
    (entry) => entry.reason === "before_compaction" || entry.automation?.hook === "before_compaction",
    config.pressureWindowMs,
    nowMs
  );
  const recentResets = countRecentCheckpoints(
    task,
    (entry) => entry.reason === "before_reset" || entry.automation?.hook === "before_reset",
    config.pressureWindowMs,
    nowMs
  );

  const repeatedBlockers = task.status === "blocked" && repeatedBlockedCount >= config.repeatedBlockedCheckpointThreshold;
  const compactionPressure = recentCompactions >= config.compactionPressureCheckpointThreshold;
  const resetPressure = recentResets >= config.resetPressureCheckpointThreshold;
  const stale = ageMs > staleAfterMs;

  const findings = [];
  if (stale) {
    findings.push("stale_task");
  }
  if (repeatedBlockers) {
    findings.push("repeated_blockers");
  }
  if (missingEvidence) {
    findings.push("missing_evidence");
  }
  if (compactionPressure) {
    findings.push("compaction_pressure");
  }
  if (resetPressure) {
    findings.push("reset_pressure");
  }
  if (review.signals.missingNextAction) {
    findings.push("missing_next_action");
  }

  let score = review.score;
  if (repeatedBlockers) {
    score += 35;
  }
  if (compactionPressure) {
    score += 25;
  }
  if (resetPressure) {
    score += 20;
  }
  if (missingEvidence) {
    score += 15;
  }

  let severity = "low";
  if (score >= 90 || repeatedBlockers || compactionPressure || resetPressure) {
    severity = "high";
  } else if (score >= 45 || stale || missingEvidence) {
    severity = "medium";
  }

  return {
    task,
    review,
    score,
    severity,
    findings,
    metrics: {
      ageMs,
      staleAfterMs,
      evidenceAgeMs,
      repeatedBlockedCount,
      recentCompactions,
      recentResets,
      lastCheckpointAt: latestCheckpoint?.at,
      lastEvidenceAt: latestEvidence?.at
    },
    signals: {
      stale,
      repeatedBlockers,
      missingEvidence,
      compactionPressure,
      resetPressure,
      missingNextAction: review.signals.missingNextAction,
      blockers: review.signals.blockers,
      needsReview: review.signals.needsReview,
      validationOutcome: review.signals.validationOutcome,
      riskCount: review.signals.riskCount
    }
  };
}

function matchesFilter(item, filter) {
  switch (filter) {
    case "all":
      return true;
    case "drifting":
      return item.findings.length > 0;
    case "high":
      return item.severity === "high";
    case "stale":
      return item.signals.stale;
    case "pressure":
      return item.signals.compactionPressure || item.signals.resetPressure;
    case "evidence":
      return item.signals.missingEvidence;
    default:
      return item.findings.length > 0;
  }
}

export async function buildDriftMonitor(storeRoot, options = {}) {
  const config = options.config || resolveDriftMonitorConfig(options.pluginConfig);
  const reviewConfig = resolveReviewQueueConfig(options.pluginConfig);
  const tasks = await listTasks(storeRoot, {
    includeArchived: Boolean(options.includeArchived),
    limit: options.limit,
    sessionKey: options.sessionKey,
    sessionId: options.sessionId,
    agentId: options.agentId
  });

  const items = tasks
    .filter((task) => options.includeDone || task.status !== "done")
    .map((task) => deriveDriftMonitorItem(task, {
      config,
      reviewConfig,
      pluginConfig: options.pluginConfig,
      nowMs: options.nowMs,
      staleAfterMs: options.staleAfterMs
    }))
    .filter((item) => matchesFilter(item, options.filter || "drifting"))
    .sort((left, right) => right.score - left.score || toEpoch(right.task.updatedAt) - toEpoch(left.task.updatedAt));

  const limited = items.slice(0, options.limit ?? config.defaultListLimit);
  return {
    items: limited,
    filter: options.filter || "drifting",
    config,
    stats: {
      total: items.length,
      high: items.filter((item) => item.severity === "high").length,
      medium: items.filter((item) => item.severity === "medium").length,
      stale: items.filter((item) => item.signals.stale).length,
      repeatedBlockers: items.filter((item) => item.signals.repeatedBlockers).length,
      missingEvidence: items.filter((item) => item.signals.missingEvidence).length,
      compactionPressure: items.filter((item) => item.signals.compactionPressure).length,
      resetPressure: items.filter((item) => item.signals.resetPressure).length
    }
  };
}

export function formatDriftMonitorSummary(report) {
  const lines = [
    `Drift monitor [${report.filter}]`,
    `- total: ${report.stats.total}`,
    `- high: ${report.stats.high}`,
    `- medium: ${report.stats.medium}`,
    `- stale: ${report.stats.stale}`,
    `- repeated_blockers: ${report.stats.repeatedBlockers}`,
    `- missing_evidence: ${report.stats.missingEvidence}`,
    `- compaction_pressure: ${report.stats.compactionPressure}`,
    `- reset_pressure: ${report.stats.resetPressure}`
  ];

  if (report.items.length) {
    lines.push("", ...report.items.map((item) => {
      const findingText = item.findings.length ? item.findings.join(", ") : "no findings";
      return `- ${item.task.id} [${item.severity}] [score=${item.score}] ${item.task.title} | ${findingText}`;
    }));
  } else {
    lines.push("", "No drift findings.");
  }

  return lines.join("\n");
}

export function formatDriftMonitorItem(item) {
  const lines = [
    `Drift item ${item.task.id}`,
    `- title: ${item.task.title}`,
    `- status: ${item.task.status}`,
    `- severity: ${item.severity}`,
    `- score: ${item.score}`,
    `- findings: ${item.findings.join(" | ") || "none"}`,
    `- stale: ${item.signals.stale ? "yes" : "no"}`,
    `- repeated_blockers: ${item.signals.repeatedBlockers ? "yes" : "no"}`,
    `- missing_evidence: ${item.signals.missingEvidence ? "yes" : "no"}`,
    `- compaction_pressure: ${item.signals.compactionPressure ? "yes" : "no"}`,
    `- reset_pressure: ${item.signals.resetPressure ? "yes" : "no"}`
  ];

  if (item.signals.blockers.length) {
    lines.push(`- blockers: ${item.signals.blockers.join(" | ")}`);
  }
  if (item.signals.validationOutcome) {
    lines.push(`- validation_outcome: ${item.signals.validationOutcome}`);
  }
  if (item.signals.riskCount > 0) {
    lines.push(`- unresolved_risks: ${item.signals.riskCount}`);
  }
  if (item.metrics.lastCheckpointAt) {
    lines.push(`- last_checkpoint: ${item.metrics.lastCheckpointAt}`);
  }
  if (item.metrics.lastEvidenceAt) {
    lines.push(`- last_evidence: ${item.metrics.lastEvidenceAt}`);
  }

  return lines.join("\n");
}

export async function getDriftMonitorItem(storeRoot, taskId, options = {}) {
  const task = await getTask(storeRoot, taskId);
  return deriveDriftMonitorItem(task, options);
}
