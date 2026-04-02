import { checkpointTask, listTasks, resolveStoreRoot, shouldSkipDuplicateCheckpoint } from "./task-store.js";

function cleanText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function cleanOptional(value) {
  const text = cleanText(value);
  return text || undefined;
}

function dedupeStrings(values) {
  return [...new Set((Array.isArray(values) ? values : []).map((entry) => cleanText(entry)).filter(Boolean))];
}

function formatDuration(ms) {
  if (!Number.isFinite(ms) || ms <= 0) {
    return undefined;
  }
  if (ms < 1000) {
    return `${Math.round(ms)}ms`;
  }
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) {
    return `${seconds}s`;
  }
  const minutes = Math.floor(seconds / 60);
  const rem = seconds % 60;
  return rem ? `${minutes}m ${rem}s` : `${minutes}m`;
}

export function resolveAutomationConfig(pluginConfig = {}) {
  const automation = pluginConfig && typeof pluginConfig === "object" && !Array.isArray(pluginConfig.automation)
    ? pluginConfig.automation || {}
    : {};
  const fileCheckpointingEnabled = typeof pluginConfig?.fileCheckpointingEnabled === "boolean"
    ? pluginConfig.fileCheckpointingEnabled
    : undefined;

  const reviewReminders = automation && typeof automation.reviewReminders === "object" && !Array.isArray(automation.reviewReminders)
    ? automation.reviewReminders
    : {};

  return {
    enabled: typeof automation.enabled === "boolean" ? automation.enabled : fileCheckpointingEnabled !== false,
    checkpointOnReset: typeof automation.checkpointOnReset === "boolean" ? automation.checkpointOnReset : fileCheckpointingEnabled !== false,
    checkpointOnCompaction: typeof automation.checkpointOnCompaction === "boolean" ? automation.checkpointOnCompaction : fileCheckpointingEnabled !== false,
    checkpointOnFailure: typeof automation.checkpointOnFailure === "boolean" ? automation.checkpointOnFailure : fileCheckpointingEnabled !== false,
    checkpointOnLongRun: typeof automation.checkpointOnLongRun === "boolean" ? automation.checkpointOnLongRun : fileCheckpointingEnabled !== false,
    longRunMs: Number.isFinite(automation.longRunMs) && automation.longRunMs > 0
      ? Math.floor(automation.longRunMs)
      : 120000,
    dedupeWindowMs: Number.isFinite(automation.dedupeWindowMs) && automation.dedupeWindowMs >= 0
      ? Math.floor(automation.dedupeWindowMs)
      : 300000,
    agentScopedFallback: automation.agentScopedFallback === true,
    reviewReminders: {
      enabled: reviewReminders.enabled !== false
    }
  };
}

export function buildResetCheckpointSummary(event = {}) {
  const reason = cleanOptional(event.reason) || "session reset/new";
  return `Automatic handoff before ${reason}. Preserve current step and next action before context clears.`;
}

export function buildCompactionCheckpointSummary(event = {}) {
  const parts = ["Automatic handoff before session compaction."];
  if (Number.isFinite(event.messageCount)) {
    parts.push(`Messages before compaction: ${event.messageCount}.`);
  }
  if (Number.isFinite(event.compactingCount)) {
    parts.push(`Messages entering compaction: ${event.compactingCount}.`);
  }
  if (Number.isFinite(event.tokenCount)) {
    parts.push(`Estimated tokens before compaction: ${event.tokenCount}.`);
  }
  return parts.join(" ");
}

export function shouldCheckpointAgentEnd(event = {}, config = resolveAutomationConfig()) {
  if (event.success === false || cleanOptional(event.error)) {
    return config.checkpointOnFailure;
  }
  return config.checkpointOnLongRun && Number.isFinite(event.durationMs) && event.durationMs >= config.longRunMs;
}

export function buildAgentEndCheckpointSummary(event = {}) {
  const parts = [];
  if (event.success === false || cleanOptional(event.error)) {
    parts.push("Automatic handoff after a failed or interrupted agent run.");
  } else {
    parts.push("Automatic handoff after a long agent run.");
  }
  const duration = formatDuration(event.durationMs);
  if (duration) {
    parts.push(`Run duration: ${duration}.`);
  }
  if (cleanOptional(event.error)) {
    parts.push(`Error: ${cleanOptional(event.error)}.`);
  }
  return parts.join(" ");
}

function buildReviewReminderSummary(parts) {
  return dedupeStrings(parts).join(" ");
}

export function buildWorkerReviewSummary(result = {}) {
  const nextSteps = Array.isArray(result.nextSteps)
    ? result.nextSteps.map((entry) => entry?.text || entry).filter(Boolean)
    : [];

  const parts = [
    `Automatic review reminder from worker result [${cleanOptional(result.status) || "unknown"}].`,
    cleanOptional(result.summary),
    result.handoff?.needsReview ? "Marked for review." : undefined,
    nextSteps.length ? `Next steps: ${nextSteps.join(" | ")}.` : undefined
  ];

  return buildReviewReminderSummary(parts);
}

export function buildValidationReviewSummary(bundle = {}) {
  const riskCount = Array.isArray(bundle.unresolvedRisks) ? bundle.unresolvedRisks.length : 0;
  const nextSteps = Array.isArray(bundle.nextSteps) ? bundle.nextSteps : [];

  const parts = [
    `Automatic review reminder from validation bundle [tier ${bundle.tier ?? "?"} | ${cleanOptional(bundle.outcome) || "unknown"}].`,
    cleanOptional(bundle.summary),
    riskCount ? `Unresolved risks: ${riskCount}.` : undefined,
    nextSteps.length ? `Next steps: ${nextSteps.join(" | ")}.` : undefined
  ];

  return buildReviewReminderSummary(parts);
}

export function workerResultNeedsReview(result = {}, config = resolveAutomationConfig()) {
  if (!config.reviewReminders.enabled) {
    return false;
  }
  return result.handoff?.needsReview === true || ["partial", "blocked", "failed", "aborted"].includes(cleanText(result.status).toLowerCase());
}

export function validationBundleNeedsReview(bundle = {}, config = resolveAutomationConfig()) {
  if (!config.reviewReminders.enabled) {
    return false;
  }
  const outcome = cleanText(bundle.outcome).toLowerCase();
  return ["partial", "fail", "blocked"].includes(outcome) || (Array.isArray(bundle.unresolvedRisks) && bundle.unresolvedRisks.length > 0);
}

async function findTasksForAutomation(storeRoot, ctx = {}, config = resolveAutomationConfig()) {
  const baseOptions = {
    includeArchived: false,
    statuses: ["active", "blocked"]
  };

  if (cleanOptional(ctx.sessionKey)) {
    const bySessionKey = await listTasks(storeRoot, { ...baseOptions, sessionKey: cleanOptional(ctx.sessionKey) });
    if (bySessionKey.length) {
      return bySessionKey;
    }
  }

  if (cleanOptional(ctx.sessionId)) {
    const bySessionId = await listTasks(storeRoot, { ...baseOptions, sessionId: cleanOptional(ctx.sessionId) });
    if (bySessionId.length) {
      return bySessionId;
    }
  }

  if (config.agentScopedFallback && cleanOptional(ctx.agentId)) {
    return listTasks(storeRoot, { ...baseOptions, agentId: cleanOptional(ctx.agentId) });
  }

  return [];
}

export async function appendAutomationCheckpointForContext(
  pluginConfig,
  ctx,
  summary,
  checkpointMeta = {},
  options = {}
) {
  const config = resolveAutomationConfig(pluginConfig);
  if (!config.enabled) {
    return [];
  }

  const storeRoot = resolveStoreRoot({ pluginConfig, workspaceDir: ctx?.workspaceDir });
  const tasks = await findTasksForAutomation(storeRoot, ctx, config);
  const changed = [];

  for (const task of tasks) {
    if (shouldSkipDuplicateCheckpoint(task, summary, options.dedupeWindowMs ?? config.dedupeWindowMs)) {
      continue;
    }
    changed.push(await checkpointTask(storeRoot, task.id, summary, checkpointMeta));
  }

  return changed;
}

export async function appendTaskReviewReminder(pluginConfig, workspaceDir, taskId, summary, kind) {
  const config = resolveAutomationConfig(pluginConfig);
  if (!config.enabled || !config.reviewReminders.enabled || !cleanOptional(taskId) || !cleanOptional(summary)) {
    return undefined;
  }

  const storeRoot = resolveStoreRoot({ pluginConfig, workspaceDir });
  const task = await listTasks(storeRoot, { includeArchived: true, limit: 500 })
    .then((tasks) => tasks.find((entry) => entry.id === taskId));

  if (!task) {
    return undefined;
  }

  if (shouldSkipDuplicateCheckpoint(task, summary, config.dedupeWindowMs)) {
    return task;
  }

  return checkpointTask(storeRoot, taskId, summary, {
    kind: "review_reminder",
    reason: kind,
    automation: { source: kind }
  });
}

export function registerControlPlaneHooks(api) {
  api.on("before_reset", async (event, ctx) => {
    const config = resolveAutomationConfig(api.pluginConfig);
    if (!config.enabled || !config.checkpointOnReset) {
      return;
    }
    await appendAutomationCheckpointForContext(
      api.pluginConfig,
      ctx,
      buildResetCheckpointSummary(event),
      {
        kind: "auto_handoff",
        reason: "before_reset",
        automation: { hook: "before_reset" }
      }
    );
  });

  api.on("before_compaction", async (event, ctx) => {
    const config = resolveAutomationConfig(api.pluginConfig);
    if (!config.enabled || !config.checkpointOnCompaction) {
      return;
    }
    await appendAutomationCheckpointForContext(
      api.pluginConfig,
      ctx,
      buildCompactionCheckpointSummary(event),
      {
        kind: "auto_handoff",
        reason: "before_compaction",
        automation: { hook: "before_compaction" }
      }
    );
  });

  api.on("agent_end", async (event, ctx) => {
    const config = resolveAutomationConfig(api.pluginConfig);
    if (!config.enabled || !shouldCheckpointAgentEnd(event, config)) {
      return;
    }
    await appendAutomationCheckpointForContext(
      api.pluginConfig,
      ctx,
      buildAgentEndCheckpointSummary(event),
      {
        kind: "auto_handoff",
        reason: "agent_end",
        automation: { hook: "agent_end" }
      }
    );
  });
}
