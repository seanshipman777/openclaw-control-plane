import { listTasks } from "./task-store.js";

function cleanText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function cleanOptional(value) {
  const text = cleanText(value);
  return text || undefined;
}

function toEpoch(value) {
  const parsed = Date.parse(String(value || ""));
  return Number.isNaN(parsed) ? 0 : parsed;
}

function normalizePositiveInteger(value, fallback) {
  if (!Number.isFinite(value)) {
    return fallback;
  }
  const next = Math.floor(value);
  return next > 0 ? next : fallback;
}

export function resolveReviewQueueConfig(pluginConfig = {}) {
  const reviewQueue = pluginConfig && typeof pluginConfig === "object" && !Array.isArray(pluginConfig.reviewQueue)
    ? pluginConfig.reviewQueue || {}
    : {};

  return {
    activeStaleAfterMs: normalizePositiveInteger(reviewQueue.activeStaleAfterMs, 24 * 60 * 60 * 1000),
    blockedStaleAfterMs: normalizePositiveInteger(reviewQueue.blockedStaleAfterMs, 6 * 60 * 60 * 1000),
    doneStaleAfterMs: normalizePositiveInteger(reviewQueue.doneStaleAfterMs, 7 * 24 * 60 * 60 * 1000),
    defaultListLimit: normalizePositiveInteger(reviewQueue.defaultListLimit, 20)
  };
}

function latestCheckpoint(task, predicate = () => true) {
  const checkpoints = Array.isArray(task?.checkpoints) ? task.checkpoints : [];
  return checkpoints
    .filter((entry) => entry && typeof entry === "object" && predicate(entry))
    .sort((left, right) => toEpoch(right.at) - toEpoch(left.at))[0];
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

export function deriveReviewQueueItem(task, options = {}) {
  const config = options.config || resolveReviewQueueConfig();
  const nowMs = Number.isFinite(options.nowMs) ? options.nowMs : Date.now();
  const reviewReminder = latestCheckpoint(task, (entry) => entry.kind === "review_reminder");
  const lastCheckpoint = latestCheckpoint(task);
  const staleAfterMs = normalizePositiveInteger(options.staleAfterMs, deriveStaleAfterMs(task, config));
  const updatedAtMs = toEpoch(task.updatedAt || task.createdAt);
  const ageMs = nowMs - updatedAtMs;
  const isStale = staleAfterMs > 0 && ageMs > staleAfterMs;

  const reviewMeta = reviewReminder?.automation && typeof reviewReminder.automation === "object"
    ? reviewReminder.automation
    : {};

  const checkpointReasons = [];
  const blockers = Array.isArray(task.blockers) ? task.blockers.filter(Boolean) : [];
  const needsReview = Boolean(reviewReminder);
  const missingNextAction = ["active", "blocked"].includes(task.status) && !cleanOptional(task.nextAction);
  const missingEvidence = task.status !== "done" && (!Array.isArray(task.evidence) || task.evidence.length === 0);
  const reviewSource = cleanOptional(reviewMeta.source);
  const riskCount = Number.isFinite(reviewMeta.riskCount) ? Number(reviewMeta.riskCount) : 0;
  const validationOutcome = cleanOptional(reviewMeta.validationOutcome);

  if (task.status === "blocked") {
    checkpointReasons.push("blocked");
  }
  if (blockers.length) {
    checkpointReasons.push("has_blockers");
  }
  if (needsReview) {
    checkpointReasons.push("needs_review");
  }
  if (validationOutcome && ["partial", "fail", "blocked"].includes(validationOutcome)) {
    checkpointReasons.push(`validation_${validationOutcome}`);
  }
  if (riskCount > 0) {
    checkpointReasons.push("unresolved_risks");
  }
  if (isStale) {
    checkpointReasons.push("stale");
  }
  if (missingNextAction) {
    checkpointReasons.push("missing_next_action");
  }
  if (missingEvidence) {
    checkpointReasons.push("missing_evidence");
  }

  let score = 0;
  if (task.status === "blocked") {
    score += 60;
  }
  if (blockers.length) {
    score += 15;
  }
  if (needsReview) {
    score += 50;
  }
  if (validationOutcome === "fail" || validationOutcome === "blocked") {
    score += 30;
  } else if (validationOutcome === "partial") {
    score += 20;
  }
  if (riskCount > 0) {
    score += Math.min(30, riskCount * 10);
  }
  if (isStale) {
    score += 20;
  }
  if (missingNextAction) {
    score += 10;
  }
  if (missingEvidence) {
    score += 5;
  }

  return {
    task,
    score,
    staleAfterMs,
    ageMs,
    signals: {
      blocked: task.status === "blocked",
      blockers,
      needsReview,
      reviewSource,
      riskCount,
      validationOutcome,
      stale: isStale,
      missingNextAction,
      missingEvidence,
      lastCheckpointAt: cleanOptional(lastCheckpoint?.at),
      reviewReminderAt: cleanOptional(reviewReminder?.at),
      reviewSummary: cleanOptional(reviewReminder?.summary)
    },
    reasons: checkpointReasons
  };
}

function matchesFilter(item, filter) {
  switch (filter) {
    case "all":
      return true;
    case "attention":
      return item.score > 0;
    case "needs_review":
      return item.signals.needsReview;
    case "blocked":
      return item.signals.blocked;
    case "stale":
      return item.signals.stale;
    case "active":
      return item.task.status === "active";
    default:
      return true;
  }
}

export async function buildReviewQueue(storeRoot, options = {}) {
  const config = options.config || resolveReviewQueueConfig(options.pluginConfig);
  const tasks = await listTasks(storeRoot, {
    includeArchived: Boolean(options.includeArchived),
    includeDone: Boolean(options.includeDone),
    sessionKey: options.sessionKey,
    sessionId: options.sessionId,
    agentId: options.agentId
  });

  const items = tasks
    .filter((task) => options.includeDone || task.status !== "done")
    .map((task) => deriveReviewQueueItem(task, {
      config,
      staleAfterMs: options.staleAfterMs,
      nowMs: options.nowMs
    }))
    .filter((item) => matchesFilter(item, options.filter || "attention"))
    .sort((left, right) => right.score - left.score || toEpoch(right.task.updatedAt) - toEpoch(left.task.updatedAt));

  const limited = items.slice(0, options.limit ?? config.defaultListLimit);
  const summary = {
    total: items.length,
    blocked: items.filter((item) => item.signals.blocked).length,
    needsReview: items.filter((item) => item.signals.needsReview).length,
    stale: items.filter((item) => item.signals.stale).length,
    unresolvedRiskTasks: items.filter((item) => item.signals.riskCount > 0).length,
    missingNextAction: items.filter((item) => item.signals.missingNextAction).length
  };

  return {
    items: limited,
    stats: summary,
    filter: options.filter || "attention",
    config
  };
}

export function formatReviewQueueSummary(queue) {
  const lines = [
    `Review queue [${queue.filter}]`,
    `- total: ${queue.stats.total}`,
    `- blocked: ${queue.stats.blocked}`,
    `- needs_review: ${queue.stats.needsReview}`,
    `- stale: ${queue.stats.stale}`,
    `- unresolved_risk_tasks: ${queue.stats.unresolvedRiskTasks}`,
    `- missing_next_action: ${queue.stats.missingNextAction}`
  ];

  if (queue.items.length) {
    lines.push("", ...queue.items.map((item) => {
      const reasonText = item.reasons.length ? ` | ${item.reasons.join(", ")}` : "";
      return `- ${item.task.id} [score=${item.score}] [${item.task.status}] ${item.task.title}${reasonText}`;
    }));
  } else {
    lines.push("", "No matching review items.");
  }

  return lines.join("\n");
}

export function formatReviewQueueItem(item) {
  const lines = [
    `Review item ${item.task.id}`,
    `- title: ${item.task.title}`,
    `- status: ${item.task.status}`,
    `- score: ${item.score}`,
    `- reasons: ${item.reasons.join(" | ") || "none"}`,
    `- stale: ${item.signals.stale ? "yes" : "no"}`,
    `- needs_review: ${item.signals.needsReview ? "yes" : "no"}`
  ];

  if (item.signals.blockers.length) {
    lines.push(`- blockers: ${item.signals.blockers.join(" | ")}`);
  }
  if (item.signals.reviewSource) {
    lines.push(`- review_source: ${item.signals.reviewSource}`);
  }
  if (item.signals.validationOutcome) {
    lines.push(`- validation_outcome: ${item.signals.validationOutcome}`);
  }
  if (item.signals.riskCount > 0) {
    lines.push(`- unresolved_risks: ${item.signals.riskCount}`);
  }
  if (item.signals.reviewSummary) {
    lines.push(`- review_summary: ${item.signals.reviewSummary}`);
  }
  if (item.task.nextAction) {
    lines.push(`- next_action: ${item.task.nextAction}`);
  }
  if (item.task.currentStep) {
    lines.push(`- current_step: ${item.task.currentStep}`);
  }

  return lines.join("\n");
}
