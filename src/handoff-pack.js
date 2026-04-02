import { getActivePlanMode } from "./plan-mode.js";
import { deriveReviewQueueItem, resolveReviewQueueConfig } from "./review-queue.js";
import { getTask, listTasks } from "./task-store.js";

function cleanText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function cleanOptional(value) {
  const text = cleanText(value);
  return text || undefined;
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

export function resolveHandoffPackConfig(pluginConfig = {}) {
  const handoffPack = pluginConfig && typeof pluginConfig === "object" && !Array.isArray(pluginConfig.handoffPack)
    ? pluginConfig.handoffPack || {}
    : {};

  return {
    defaultEvidenceLimit: normalizePositiveInteger(handoffPack.defaultEvidenceLimit, 3),
    defaultCheckpointLimit: normalizePositiveInteger(handoffPack.defaultCheckpointLimit, 3),
    defaultStepLimit: normalizePositiveInteger(handoffPack.defaultStepLimit, 5)
  };
}

function latestItems(items, limit) {
  return [...(Array.isArray(items) ? items : [])]
    .filter((entry) => entry && typeof entry === "object")
    .sort((left, right) => toEpoch(right.at || right.createdAt) - toEpoch(left.at || left.createdAt))
    .slice(0, limit);
}

function compactTaskSummary(task) {
  if (!task) {
    return undefined;
  }
  return {
    id: task.id,
    title: task.title,
    status: task.status,
    objective: task.objective,
    currentStep: task.currentStep || undefined,
    nextAction: task.nextAction || undefined,
    constraints: Array.isArray(task.constraints) ? task.constraints : [],
    doneCriteria: Array.isArray(task.doneCriteria) ? task.doneCriteria : [],
    blockers: Array.isArray(task.blockers) ? task.blockers : [],
    updatedAt: task.updatedAt,
    evidenceCount: Array.isArray(task.evidence) ? task.evidence.length : 0,
    checkpointCount: Array.isArray(task.checkpoints) ? task.checkpoints.length : 0
  };
}

function compactPlanSummary(plan, stepLimit) {
  if (!plan) {
    return undefined;
  }
  return {
    title: plan.task?.title,
    objective: plan.task?.objective,
    proofTier: plan.proofTier,
    recommendedRoute: plan.execution?.recommendedRoute,
    executionMode: plan.execution?.executionMode,
    planningOnly: Boolean(plan.planningMode?.planningOnly),
    expectedOutputs: Array.isArray(plan.execution?.expectedOutputs) ? plan.execution.expectedOutputs : [],
    acceptanceCriteria: Array.isArray(plan.acceptanceCriteria) ? plan.acceptanceCriteria : [],
    stopConditions: Array.isArray(plan.execution?.stopConditions) ? plan.execution.stopConditions : [],
    nextPlannerAction: plan.nextPlannerAction,
    steps: (Array.isArray(plan.steps) ? plan.steps : []).slice(0, stepLimit).map((step) => ({
      id: step.id,
      title: step.title,
      objective: step.objective,
      doneWhen: step.doneWhen,
      owner: step.owner
    }))
  };
}

function compactReviewSummary(item) {
  if (!item) {
    return undefined;
  }
  return {
    score: item.score,
    reasons: item.reasons,
    blocked: item.signals.blocked,
    needsReview: item.signals.needsReview,
    validationOutcome: item.signals.validationOutcome,
    riskCount: item.signals.riskCount,
    stale: item.signals.stale,
    missingNextAction: item.signals.missingNextAction,
    missingEvidence: item.signals.missingEvidence,
    reviewSource: item.signals.reviewSource,
    reviewSummary: item.signals.reviewSummary,
    blockers: item.signals.blockers
  };
}

async function resolveTaskForPack(storeRoot, ctx, params, plan) {
  if (cleanOptional(params.taskId)) {
    return getTask(storeRoot, params.taskId);
  }

  const planTaskId = cleanOptional(plan?.task?.taskId);
  if (planTaskId) {
    try {
      return await getTask(storeRoot, planTaskId);
    } catch {
      // fall through
    }
  }

  const sessionTasks = await listTasks(storeRoot, {
    includeArchived: false,
    statuses: ["active", "blocked", "done"],
    sessionKey: ctx.sessionKey,
    sessionId: ctx.sessionId,
    agentId: ctx.agentId
  });
  return sessionTasks[0];
}

export async function buildHandoffPack(storeRoot, ctx, params = {}, pluginConfig = {}) {
  const config = resolveHandoffPackConfig(pluginConfig);
  const reviewConfig = resolveReviewQueueConfig(pluginConfig);
  const evidenceLimit = normalizePositiveInteger(params.evidenceLimit, config.defaultEvidenceLimit);
  const checkpointLimit = normalizePositiveInteger(params.checkpointLimit, config.defaultCheckpointLimit);
  const stepLimit = normalizePositiveInteger(params.stepLimit, config.defaultStepLimit);

  const plan = await getActivePlanMode(storeRoot, ctx.sessionKey, ctx.sessionId);
  const task = await resolveTaskForPack(storeRoot, ctx, params, plan);
  const review = task ? deriveReviewQueueItem(task, { config: reviewConfig }) : undefined;
  const evidence = latestItems(task?.evidence, evidenceLimit).map((item) => item.text || item.value || item.note).filter(Boolean);
  const checkpoints = latestItems(task?.checkpoints, checkpointLimit).map((item) => ({
    at: item.at,
    summary: item.summary,
    kind: item.kind,
    reason: item.reason
  }));

  const pack = {
    schemaVersion: "handoff_pack.v1",
    mode: params.mode,
    task: compactTaskSummary(task),
    plan: compactPlanSummary(plan, stepLimit),
    review: compactReviewSummary(review),
    evidence,
    checkpoints,
    generatedAt: new Date().toISOString()
  };

  return enrichHandoffPack(pack);
}

function enrichHandoffPack(pack) {
  if (pack.mode === "resume") {
    pack.summary = buildResumeSummary(pack);
    pack.text = formatResumePack(pack);
    return pack;
  }
  if (pack.mode === "worker") {
    pack.summary = buildWorkerSummary(pack);
    pack.text = formatWorkerPack(pack);
    return pack;
  }
  if (pack.mode === "review") {
    pack.summary = buildReviewSummary(pack);
    pack.text = formatReviewPack(pack);
    return pack;
  }

  pack.summary = buildStatusSummary(pack);
  pack.text = formatStatusPack(pack);
  return pack;
}

function buildResumeSummary(pack) {
  const bits = ["Resume pack ready."];
  if (pack.task?.title) {
    bits.push(`Task: ${pack.task.title}.`);
  }
  if (pack.task?.nextAction) {
    bits.push(`Next action: ${pack.task.nextAction}.`);
  }
  if (pack.review?.reasons?.length) {
    bits.push(`Attention: ${pack.review.reasons.join(", ")}.`);
  }
  return bits.join(" ");
}

function buildWorkerSummary(pack) {
  const bits = ["Worker brief ready."];
  if (pack.task?.title) {
    bits.push(`Task: ${pack.task.title}.`);
  }
  if (pack.plan?.recommendedRoute) {
    bits.push(`Route: ${pack.plan.recommendedRoute}.`);
  }
  if (pack.plan?.expectedOutputs?.length) {
    bits.push(`Outputs: ${pack.plan.expectedOutputs.join(" | ")}.`);
  }
  return bits.join(" ");
}

function buildReviewSummary(pack) {
  const bits = ["Review pack ready."];
  if (pack.task?.title) {
    bits.push(`Task: ${pack.task.title}.`);
  }
  if (pack.review?.reasons?.length) {
    bits.push(`Signals: ${pack.review.reasons.join(" | ")}.`);
  }
  return bits.join(" ");
}

function buildStatusSummary(pack) {
  const bits = ["Status pack ready."];
  if (pack.task?.title) {
    bits.push(`${pack.task.title} [${pack.task.status}]`);
  }
  return bits.join(" ");
}

function formatCommonPackHeader(pack, title) {
  const lines = [title];
  if (pack.task) {
    lines.push(`- task: ${pack.task.title} [${pack.task.status}]`);
    lines.push(`- objective: ${pack.task.objective}`);
    if (pack.task.currentStep) {
      lines.push(`- current_step: ${pack.task.currentStep}`);
    }
    if (pack.task.nextAction) {
      lines.push(`- next_action: ${pack.task.nextAction}`);
    }
  } else {
    lines.push("- task: none resolved");
  }
  return lines;
}

function formatResumePack(pack) {
  const lines = formatCommonPackHeader(pack, "Resume pack");
  if (pack.plan) {
    lines.push(`- plan_route: ${pack.plan.recommendedRoute || "n/a"}`);
    lines.push(`- planning_only: ${pack.plan.planningOnly ? "yes" : "no"}`);
    if (pack.plan.nextPlannerAction) {
      lines.push(`- planner_next: ${pack.plan.nextPlannerAction}`);
    }
  }
  if (pack.review?.reasons?.length) {
    lines.push(`- attention: ${pack.review.reasons.join(" | ")}`);
  }
  if (pack.checkpoints.length) {
    lines.push(`- recent_checkpoints: ${pack.checkpoints.map((entry) => entry.summary).join(" | ")}`);
  }
  if (pack.evidence.length) {
    lines.push(`- recent_evidence: ${pack.evidence.join(" | ")}`);
  }
  return lines.join("\n");
}

function formatWorkerPack(pack) {
  const lines = formatCommonPackHeader(pack, "Worker brief pack");
  if (pack.task?.constraints?.length) {
    lines.push(`- constraints: ${pack.task.constraints.join(" | ")}`);
  }
  if (pack.plan) {
    lines.push(`- route: ${pack.plan.recommendedRoute || "worker"}`);
    lines.push(`- execution_mode: ${pack.plan.executionMode || "delegated_worker"}`);
    lines.push(`- proof_tier: ${pack.plan.proofTier}`);
    if (pack.plan.acceptanceCriteria.length) {
      lines.push(`- acceptance_criteria: ${pack.plan.acceptanceCriteria.join(" | ")}`);
    }
    if (pack.plan.expectedOutputs.length) {
      lines.push(`- expected_outputs: ${pack.plan.expectedOutputs.join(" | ")}`);
    }
    if (pack.plan.stopConditions.length) {
      lines.push(`- stop_conditions: ${pack.plan.stopConditions.join(" | ")}`);
    }
    if (pack.plan.steps.length) {
      lines.push(`- steps: ${pack.plan.steps.map((step) => `${step.id}:${step.title}`).join(" | ")}`);
    }
  }
  return lines.join("\n");
}

function formatReviewPack(pack) {
  const lines = formatCommonPackHeader(pack, "Review pack");
  if (pack.review) {
    lines.push(`- score: ${pack.review.score}`);
    lines.push(`- review_signals: ${pack.review.reasons.join(" | ") || "none"}`);
    if (pack.review.blockers?.length) {
      lines.push(`- blockers: ${pack.review.blockers.join(" | ")}`);
    }
    if (pack.review.validationOutcome) {
      lines.push(`- validation_outcome: ${pack.review.validationOutcome}`);
    }
    if (pack.review.riskCount > 0) {
      lines.push(`- unresolved_risks: ${pack.review.riskCount}`);
    }
  }
  if (pack.evidence.length) {
    lines.push(`- evidence_excerpt: ${pack.evidence.join(" | ")}`);
  }
  if (pack.checkpoints.length) {
    lines.push(`- checkpoint_excerpt: ${pack.checkpoints.map((entry) => entry.summary).join(" | ")}`);
  }
  return lines.join("\n");
}

function formatStatusPack(pack) {
  const lines = formatCommonPackHeader(pack, "Status pack");
  if (pack.review?.reasons?.length) {
    lines.push(`- attention: ${pack.review.reasons.join(" | ")}`);
  }
  if (pack.plan?.recommendedRoute) {
    lines.push(`- route: ${pack.plan.recommendedRoute}`);
  }
  if (pack.plan?.proofTier) {
    lines.push(`- proof_tier: ${pack.plan.proofTier}`);
  }
  return lines.join("\n");
}
