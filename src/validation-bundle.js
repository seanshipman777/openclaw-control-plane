function cleanText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function cleanOptional(value) {
  const text = cleanText(value);
  return text || undefined;
}

function ensureObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function cleanStringArray(value) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map((entry) => cleanText(entry)).filter(Boolean);
}

function nowIso() {
  return new Date().toISOString();
}

export const VALID_PROOF_TIERS = new Set([1, 2, 3]);
export const VALID_VALIDATION_OUTCOMES = new Set(["pass", "partial", "fail", "blocked"]);
export const VALID_ARTIFACT_KINDS = new Set(["screenshot", "path", "diff", "log", "url", "note", "report"]);
export const VALID_CHECK_STATUSES = new Set(["pass", "fail", "partial", "not_run"]);
export const VALID_RISK_LEVELS = new Set(["low", "medium", "high"]);

function normalizeTier(value) {
  const numeric = Number(value);
  if (!Number.isInteger(numeric) || !VALID_PROOF_TIERS.has(numeric)) {
    throw new Error(`invalid proof tier: ${value}`);
  }
  return numeric;
}

function normalizeOutcome(value, fallback = "pass") {
  const outcome = cleanText(value).toLowerCase();
  if (!outcome) {
    return fallback;
  }
  if (!VALID_VALIDATION_OUTCOMES.has(outcome)) {
    throw new Error(`invalid validation outcome: ${value}`);
  }
  return outcome;
}

function normalizeArtifactKind(value, fallback = "note") {
  const kind = cleanText(value).toLowerCase();
  if (!kind) {
    return fallback;
  }
  if (!VALID_ARTIFACT_KINDS.has(kind)) {
    throw new Error(`invalid artifact kind: ${value}`);
  }
  return kind;
}

function normalizeCheckStatus(value, fallback = "pass") {
  const status = cleanText(value).toLowerCase();
  if (!status) {
    return fallback;
  }
  if (!VALID_CHECK_STATUSES.has(status)) {
    throw new Error(`invalid check status: ${value}`);
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

function normalizeArtifact(entry) {
  if (typeof entry === "string") {
    const text = cleanText(entry);
    if (!text) {
      return undefined;
    }
    return {
      kind: "note",
      label: undefined,
      value: text,
      note: undefined
    };
  }

  const item = ensureObject(entry);
  const value = cleanOptional(item.value) || cleanOptional(item.path) || cleanOptional(item.url) || cleanOptional(item.text);
  if (!value) {
    return undefined;
  }

  return {
    kind: normalizeArtifactKind(item.kind),
    label: cleanOptional(item.label),
    value,
    note: cleanOptional(item.note)
  };
}

function normalizeCheck(entry) {
  if (typeof entry === "string") {
    const name = cleanText(entry);
    if (!name) {
      return undefined;
    }
    return {
      name,
      status: "pass",
      detail: undefined
    };
  }

  const item = ensureObject(entry);
  const name = cleanOptional(item.name) || cleanOptional(item.check);
  if (!name) {
    return undefined;
  }

  return {
    name,
    status: normalizeCheckStatus(item.status),
    detail: cleanOptional(item.detail),
    component: cleanOptional(item.component)
  };
}

function normalizeRisk(entry) {
  if (typeof entry === "string") {
    const text = cleanText(entry);
    if (!text) {
      return undefined;
    }
    return {
      level: "medium",
      text,
      mitigation: undefined
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
    mitigation: cleanOptional(item.mitigation),
    owner: cleanOptional(item.owner)
  };
}

function normalizeScores(value) {
  const scores = ensureObject(value);
  const out = {};

  for (const [key, raw] of Object.entries(scores)) {
    if (!cleanText(key)) {
      continue;
    }
    const numeric = Number(raw);
    if (!Number.isFinite(numeric)) {
      continue;
    }
    out[key] = numeric;
  }

  return out;
}

export function normalizeValidationBundle(input = {}, meta = {}) {
  const payload = ensureObject(input);
  const summary = cleanOptional(payload.summary);
  if (!summary) {
    throw new Error("summary required");
  }

  const tier = normalizeTier(payload.tier);
  const before = (Array.isArray(payload.before) ? payload.before : []).map(normalizeArtifact).filter(Boolean);
  const after = (Array.isArray(payload.after) ? payload.after : []).map(normalizeArtifact).filter(Boolean);
  const checks = (Array.isArray(payload.checks) ? payload.checks : []).map(normalizeCheck).filter(Boolean);
  const unresolvedRisks = (Array.isArray(payload.unresolvedRisks) ? payload.unresolvedRisks : []).map(normalizeRisk).filter(Boolean);

  return {
    schemaVersion: "validation_bundle.v1",
    createdAt: nowIso(),
    validator: {
      agentId: cleanOptional(payload.agentId) || meta.agentId || undefined,
      sessionKey: cleanOptional(payload.sessionKey) || meta.sessionKey || undefined,
      sessionId: cleanOptional(payload.sessionId) || meta.sessionId || undefined,
      channel: cleanOptional(payload.channel) || meta.messageChannel || undefined
    },
    target: {
      taskId: cleanOptional(payload.taskId),
      title: cleanOptional(payload.title),
      surface: cleanOptional(payload.surface),
      component: cleanOptional(payload.component)
    },
    tier,
    outcome: normalizeOutcome(payload.outcome),
    summary,
    methodology: cleanOptional(payload.methodology),
    before,
    after,
    checks,
    unresolvedRisks,
    nextSteps: cleanStringArray(payload.nextSteps),
    scores: normalizeScores(payload.scores),
    stats: {
      beforeArtifacts: before.length,
      afterArtifacts: after.length,
      checks: checks.length,
      unresolvedRisks: unresolvedRisks.length,
      nextSteps: cleanStringArray(payload.nextSteps).length
    }
  };
}

export function validateValidationBundle(input) {
  const errors = [];

  try {
    const normalized = normalizeValidationBundle(input);
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

export function renderValidationBundle(bundle) {
  const lines = [
    `Validation bundle [tier ${bundle.tier} | ${bundle.outcome}]`,
    `- summary: ${bundle.summary}`
  ];

  if (bundle.target.taskId) {
    lines.push(`- task_id: ${bundle.target.taskId}`);
  }
  if (bundle.target.title) {
    lines.push(`- title: ${bundle.target.title}`);
  }
  if (bundle.target.surface) {
    lines.push(`- surface: ${bundle.target.surface}`);
  }
  if (bundle.target.component) {
    lines.push(`- component: ${bundle.target.component}`);
  }
  if (bundle.methodology) {
    lines.push(`- methodology: ${bundle.methodology}`);
  }
  if (bundle.before.length) {
    lines.push(`- before_artifacts: ${bundle.before.length}`);
  }
  if (bundle.after.length) {
    lines.push(`- after_artifacts: ${bundle.after.length}`);
  }
  if (bundle.checks.length) {
    const counts = bundle.checks.reduce((acc, check) => {
      acc[check.status] = (acc[check.status] || 0) + 1;
      return acc;
    }, {});
    lines.push(`- checks: ${Object.entries(counts).map(([key, count]) => `${key}=${count}`).join(" | ")}`);
  }
  if (bundle.unresolvedRisks.length) {
    lines.push(`- unresolved_risks: ${bundle.unresolvedRisks.length}`);
  }
  if (bundle.nextSteps.length) {
    lines.push(`- next_steps: ${bundle.nextSteps.join(" | ")}`);
  }
  if (Object.keys(bundle.scores).length) {
    lines.push(`- scores: ${Object.entries(bundle.scores).map(([key, value]) => `${key}=${value}`).join(" | ")}`);
  }

  return lines.join("\n");
}
