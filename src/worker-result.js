function cleanText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function cleanOptional(value) {
  const text = cleanText(value);
  return text || undefined;
}

function cleanStringArray(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map((entry) => cleanText(entry)).filter(Boolean);
}

function ensureObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function nowIso() {
  return new Date().toISOString();
}

export const VALID_WORKER_STATUSES = new Set([
  "done",
  "partial",
  "blocked",
  "failed",
  "aborted"
]);

export const VALID_EVIDENCE_KINDS = new Set([
  "artifact",
  "path",
  "diff",
  "command",
  "log",
  "url",
  "note"
]);

export const VALID_RISK_LEVELS = new Set(["low", "medium", "high"]);

function normalizeStatus(value, fallback = "done") {
  const status = cleanText(value).toLowerCase();
  if (!status) {
    return fallback;
  }
  if (!VALID_WORKER_STATUSES.has(status)) {
    throw new Error(`invalid worker result status: ${value}`);
  }
  return status;
}

function normalizeRiskLevel(value, fallback = "medium") {
  const level = cleanText(value).toLowerCase();
  if (!level) {
    return fallback;
  }
  if (!VALID_RISK_LEVELS.has(level)) {
    throw new Error(`invalid risk level: ${value}`);
  }
  return level;
}

function normalizeEvidenceKind(value, fallback = "note") {
  const kind = cleanText(value).toLowerCase();
  if (!kind) {
    return fallback;
  }
  if (!VALID_EVIDENCE_KINDS.has(kind)) {
    throw new Error(`invalid evidence kind: ${value}`);
  }
  return kind;
}

function normalizeEvidenceItem(entry) {
  if (typeof entry === "string") {
    const text = cleanText(entry);
    if (!text) {
      return undefined;
    }
    return {
      kind: "note",
      label: undefined,
      value: text
    };
  }

  const item = ensureObject(entry);
  const value = cleanOptional(item.value) || cleanOptional(item.path) || cleanOptional(item.text) || cleanOptional(item.url);
  if (!value) {
    return undefined;
  }

  return {
    kind: normalizeEvidenceKind(item.kind),
    label: cleanOptional(item.label),
    value,
    note: cleanOptional(item.note)
  };
}

function normalizeRiskItem(entry) {
  if (typeof entry === "string") {
    const text = cleanText(entry);
    if (!text) {
      return undefined;
    }
    return {
      level: "medium",
      text
    };
  }

  const item = ensureObject(entry);
  const text = cleanOptional(item.text) || cleanOptional(item.risk);
  if (!text) {
    return undefined;
  }

  return {
    level: normalizeRiskLevel(item.level),
    text,
    owner: cleanOptional(item.owner),
    mitigation: cleanOptional(item.mitigation)
  };
}

function normalizeNextStepItem(entry) {
  if (typeof entry === "string") {
    const text = cleanText(entry);
    if (!text) {
      return undefined;
    }
    return {
      owner: undefined,
      text
    };
  }

  const item = ensureObject(entry);
  const text = cleanOptional(item.text) || cleanOptional(item.action);
  if (!text) {
    return undefined;
  }

  return {
    owner: cleanOptional(item.owner),
    text,
    status: cleanOptional(item.status)
  };
}

export function normalizeWorkerResult(input = {}, meta = {}) {
  const payload = ensureObject(input);
  const summary = cleanOptional(payload.summary);
  if (!summary) {
    throw new Error("summary required");
  }

  const status = normalizeStatus(payload.status, "done");
  const blockers = cleanStringArray(payload.blockers);
  const evidence = (Array.isArray(payload.evidence) ? payload.evidence : [])
    .map((entry) => normalizeEvidenceItem(entry))
    .filter(Boolean);
  const risks = (Array.isArray(payload.risks) ? payload.risks : [])
    .map((entry) => normalizeRiskItem(entry))
    .filter(Boolean);
  const nextSteps = (Array.isArray(payload.nextSteps) ? payload.nextSteps : [])
    .map((entry) => normalizeNextStepItem(entry))
    .filter(Boolean);

  return {
    schemaVersion: "worker_result.v1",
    createdAt: nowIso(),
    worker: {
      agentId: cleanOptional(payload.agentId) || meta.agentId || undefined,
      sessionKey: cleanOptional(payload.sessionKey) || meta.sessionKey || undefined,
      sessionId: cleanOptional(payload.sessionId) || meta.sessionId || undefined,
      channel: cleanOptional(payload.channel) || meta.messageChannel || undefined
    },
    task: {
      taskId: cleanOptional(payload.taskId),
      title: cleanOptional(payload.title),
      objective: cleanOptional(payload.objective)
    },
    status,
    summary,
    details: cleanOptional(payload.details),
    blockers,
    evidence,
    risks,
    nextSteps,
    handoff: {
      needsReview: Boolean(payload.needsReview),
      recommendedOwner: cleanOptional(payload.recommendedOwner)
    },
    stats: {
      blockers: blockers.length,
      evidence: evidence.length,
      risks: risks.length,
      nextSteps: nextSteps.length
    }
  };
}

export function validateWorkerResult(input) {
  const errors = [];

  try {
    const normalized = normalizeWorkerResult(input);
    return {
      valid: true,
      errors,
      normalized
    };
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error));
    return {
      valid: false,
      errors,
      normalized: undefined
    };
  }
}

export function renderWorkerResult(result) {
  const lines = [
    `Worker result [${result.status}]`,
    `- summary: ${result.summary}`
  ];

  if (result.task.taskId) {
    lines.push(`- task_id: ${result.task.taskId}`);
  }
  if (result.task.title) {
    lines.push(`- title: ${result.task.title}`);
  }
  if (result.task.objective) {
    lines.push(`- objective: ${result.task.objective}`);
  }
  if (result.details) {
    lines.push(`- details: ${result.details}`);
  }
  if (result.blockers.length) {
    lines.push(`- blockers: ${result.blockers.join(" | ")}`);
  }
  if (result.evidence.length) {
    lines.push(`- evidence_count: ${result.evidence.length}`);
  }
  if (result.risks.length) {
    lines.push(`- risk_count: ${result.risks.length}`);
  }
  if (result.nextSteps.length) {
    lines.push(`- next_steps: ${result.nextSteps.map((step) => step.owner ? `${step.owner}: ${step.text}` : step.text).join(" | ")}`);
  }
  if (result.handoff.needsReview) {
    lines.push(`- review: needed${result.handoff.recommendedOwner ? ` (${result.handoff.recommendedOwner})` : ""}`);
  }

  return lines.join("\n");
}
