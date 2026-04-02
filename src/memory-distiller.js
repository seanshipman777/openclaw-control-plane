import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

import { resolveStoreRoot } from "./task-store.js";

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

function normalizeFingerprint(value) {
  return cleanText(value)
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function memoryDir(storeRoot) {
  return path.join(storeRoot, "memory-distiller");
}

function candidatesDir(storeRoot) {
  return path.join(memoryDir(storeRoot), "candidates");
}

function dreamsDir(storeRoot) {
  return path.join(memoryDir(storeRoot), "dreams");
}

async function ensureMemoryStore(storeRoot) {
  await fs.mkdir(candidatesDir(storeRoot), { recursive: true });
  await fs.mkdir(dreamsDir(storeRoot), { recursive: true });
}

async function writeJson(filePath, value) {
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, "utf8"));
}

function candidateFilePath(storeRoot, candidateId) {
  return path.join(candidatesDir(storeRoot), `${candidateId}.json`);
}

function dreamFilePath(storeRoot, dreamId) {
  return path.join(dreamsDir(storeRoot), `${dreamId}.json`);
}

function nextId(prefix) {
  return `${prefix}-${randomUUID().slice(0, 8)}`;
}

export function resolveMemoryDistillerConfig(pluginConfig = {}) {
  const memoryDistiller = pluginConfig && typeof pluginConfig === "object" && !Array.isArray(pluginConfig.memoryDistiller)
    ? pluginConfig.memoryDistiller || {}
    : {};

  const autoMemoryEnabled = typeof pluginConfig?.autoMemoryEnabled === "boolean"
    ? pluginConfig.autoMemoryEnabled
    : undefined;
  const autoDreamEnabled = typeof pluginConfig?.autoDreamEnabled === "boolean"
    ? pluginConfig.autoDreamEnabled
    : undefined;

  return {
    autoMemoryEnabled: typeof memoryDistiller.autoMemoryEnabled === "boolean"
      ? memoryDistiller.autoMemoryEnabled
      : autoMemoryEnabled !== false,
    autoDreamEnabled: typeof memoryDistiller.autoDreamEnabled === "boolean"
      ? memoryDistiller.autoDreamEnabled
      : autoDreamEnabled === true,
    candidateRetentionDays: normalizePositiveInteger(memoryDistiller.candidateRetentionDays, 30),
    minScore: normalizePositiveInteger(memoryDistiller.minScore, 35),
    distillLimit: normalizePositiveInteger(memoryDistiller.distillLimit, 8),
    autoDreamOnCompaction: memoryDistiller.autoDreamOnCompaction !== false,
    autoDreamOnSessionEnd: memoryDistiller.autoDreamOnSessionEnd === true
  };
}

function classifyCandidate(sourceType, payload = {}) {
  const summary = cleanText(payload.summary).toLowerCase();
  if (summary.startsWith("rule:") || summary.startsWith("learned:") || summary.startsWith("correction:")) {
    return "rule";
  }
  if (sourceType === "validation_bundle") {
    const outcome = cleanText(payload.outcome).toLowerCase();
    if (["fail", "blocked", "partial"].includes(outcome) || (Number.isFinite(payload.riskCount) && payload.riskCount > 0)) {
      return "risk";
    }
    return "project_state";
  }
  if (sourceType === "worker_result") {
    const status = cleanText(payload.status).toLowerCase();
    if (["blocked", "failed", "aborted", "partial"].includes(status) || (Number.isFinite(payload.riskCount) && payload.riskCount > 0)) {
      return "open_question";
    }
    return "project_state";
  }
  if (sourceType === "task_checkpoint") {
    return "project_state";
  }
  return "project_state";
}

function deriveDurability(score) {
  if (score >= 75) {
    return "high";
  }
  if (score >= 45) {
    return "medium";
  }
  return "low";
}

export function buildMemoryCandidate(input = {}, meta = {}) {
  const payload = ensureObject(input);
  const sourceType = cleanOptional(payload.sourceType) || "manual";
  const summary = cleanOptional(payload.summary);
  if (!summary) {
    throw new Error("summary required");
  }

  const score = normalizePositiveInteger(payload.score, 30);
  const detail = cleanOptional(payload.detail);
  const tags = cleanStringArray(payload.tags);
  const category = cleanOptional(payload.category) || classifyCandidate(sourceType, payload);
  const fingerprint = normalizeFingerprint(`${sourceType}|${summary}|${detail || ""}`);

  return {
    id: cleanOptional(payload.id) || nextId("candidate"),
    createdAt: nowIso(),
    sourceType,
    trigger: cleanOptional(payload.trigger) || undefined,
    sessionKey: cleanOptional(payload.sessionKey) || meta.sessionKey || undefined,
    sessionId: cleanOptional(payload.sessionId) || meta.sessionId || undefined,
    agentId: cleanOptional(payload.agentId) || meta.agentId || undefined,
    taskId: cleanOptional(payload.taskId),
    title: cleanOptional(payload.title),
    summary,
    detail,
    score,
    category,
    durability: cleanOptional(payload.durability) || deriveDurability(score),
    tags,
    fingerprint,
    metadata: ensureObject(payload.metadata)
  };
}

export function buildMemoryCandidatesFromToolResult(toolName, params = {}, details = {}, ctx = {}) {
  const payload = ensureObject(details);
  if (toolName === "worker_result") {
    const riskCount = Array.isArray(payload.risks) ? payload.risks.length : 0;
    const status = cleanOptional(payload.status) || "done";
    let score = 40;
    if (["partial", "blocked"].includes(status)) {
      score += 20;
    }
    if (["failed", "aborted"].includes(status)) {
      score += 30;
    }
    if (payload.handoff?.needsReview) {
      score += 15;
    }
    score += Math.min(30, riskCount * 10);

    return [buildMemoryCandidate({
      sourceType: "worker_result",
      summary: payload.summary,
      detail: payload.details,
      score,
      category: classifyCandidate("worker_result", {
        summary: payload.summary,
        status,
        riskCount
      }),
      taskId: payload.task?.taskId,
      title: payload.task?.title,
      tags: [status, ...(payload.handoff?.needsReview ? ["needs_review"] : []), ...(riskCount > 0 ? ["risk"] : [])],
      metadata: {
        status,
        riskCount,
        nextSteps: Array.isArray(payload.nextSteps) ? payload.nextSteps.length : 0,
        validationOutcome: payload.validation?.outcome,
        validationBundleId: payload.validation?.bundleId
      }
    }, ctx)];
  }

  if (toolName === "validation_bundle") {
    const riskCount = Array.isArray(payload.unresolvedRisks) ? payload.unresolvedRisks.length : 0;
    const outcome = cleanOptional(payload.outcome) || "pass";
    let score = 35 + Math.min(15, Number(payload.tier || 1) * 5);
    if (outcome === "partial") {
      score += 15;
    }
    if (["fail", "blocked"].includes(outcome)) {
      score += 30;
    }
    score += Math.min(30, riskCount * 10);

    return [buildMemoryCandidate({
      sourceType: "validation_bundle",
      summary: payload.summary,
      detail: payload.methodology,
      score,
      category: classifyCandidate("validation_bundle", {
        summary: payload.summary,
        outcome,
        riskCount
      }),
      taskId: payload.target?.taskId,
      title: payload.target?.title,
      tags: [outcome, `tier-${payload.tier || 1}`, ...(riskCount > 0 ? ["risk"] : [])],
      metadata: {
        outcome,
        riskCount,
        tier: payload.tier,
        component: payload.target?.component,
        surface: payload.target?.surface
      }
    }, ctx)];
  }

  if (toolName === "task_ledger") {
    const action = cleanOptional(params.action);
    if (action === "checkpoint") {
      const latestCheckpoint = Array.isArray(payload.checkpoints) ? payload.checkpoints[payload.checkpoints.length - 1] : undefined;
      if (!latestCheckpoint || latestCheckpoint.kind === "auto_handoff") {
        return [];
      }
      return [buildMemoryCandidate({
        sourceType: "task_checkpoint",
        summary: latestCheckpoint.summary,
        detail: cleanOptional(latestCheckpoint.reason) || cleanOptional(payload.nextAction),
        score: latestCheckpoint.kind === "review_reminder" ? 45 : 30,
        taskId: payload.id,
        title: payload.title,
        tags: [action, payload.status, ...(latestCheckpoint.kind ? [latestCheckpoint.kind] : [])],
        metadata: {
          taskStatus: payload.status,
          checkpointKind: latestCheckpoint.kind,
          checkpointReason: latestCheckpoint.reason
        }
      }, ctx)];
    }

    if (action === "close") {
      return [buildMemoryCandidate({
        sourceType: "task_close",
        summary: `Closed task: ${payload.title}`,
        detail: payload.objective,
        score: 35,
        taskId: payload.id,
        title: payload.title,
        tags: ["closed", payload.status],
        metadata: {
          taskStatus: payload.status
        }
      }, ctx)];
    }
  }

  return [];
}

export async function appendMemoryCandidate(storeRoot, candidate) {
  await ensureMemoryStore(storeRoot);
  await writeJson(candidateFilePath(storeRoot, candidate.id), candidate);
  return candidate;
}

export async function listMemoryCandidates(storeRoot, options = {}) {
  await ensureMemoryStore(storeRoot);
  const files = await fs.readdir(candidatesDir(storeRoot));
  const candidates = [];
  for (const file of files) {
    if (!file.endsWith(".json")) {
      continue;
    }
    candidates.push(await readJson(path.join(candidatesDir(storeRoot), file)));
  }

  const cutoffMs = options.recentDays
    ? Date.now() - normalizePositiveInteger(options.recentDays, 30) * 24 * 60 * 60 * 1000
    : undefined;

  return candidates
    .filter((candidate) => !options.sessionKey || candidate.sessionKey === options.sessionKey)
    .filter((candidate) => !options.taskId || candidate.taskId === options.taskId)
    .filter((candidate) => !options.sourceType || candidate.sourceType === options.sourceType)
    .filter((candidate) => !cutoffMs || toEpoch(candidate.createdAt) >= cutoffMs)
    .sort((left, right) => right.score - left.score || toEpoch(right.createdAt) - toEpoch(left.createdAt));
}

export async function getDream(storeRoot, dreamId) {
  return readJson(dreamFilePath(storeRoot, dreamId));
}

export async function listDreams(storeRoot, options = {}) {
  await ensureMemoryStore(storeRoot);
  const files = await fs.readdir(dreamsDir(storeRoot));
  const dreams = [];
  for (const file of files) {
    if (!file.endsWith(".json")) {
      continue;
    }
    dreams.push(await readJson(path.join(dreamsDir(storeRoot), file)));
  }

  return dreams
    .filter((dream) => !options.sessionKey || dream.sessionKey === options.sessionKey)
    .sort((left, right) => toEpoch(right.createdAt) - toEpoch(left.createdAt))
    .slice(0, options.limit || dreams.length);
}

function dedupeCandidates(candidates) {
  const byFingerprint = new Map();
  for (const candidate of candidates) {
    const existing = byFingerprint.get(candidate.fingerprint);
    if (!existing || candidate.score > existing.score || toEpoch(candidate.createdAt) > toEpoch(existing.createdAt)) {
      byFingerprint.set(candidate.fingerprint, candidate);
    }
  }
  return [...byFingerprint.values()];
}

function summarizeDreamItems(items) {
  return items.map((item) => `${item.category}: ${item.summary}`).join(" | ");
}

function compactDreamItem(candidate) {
  return {
    candidateId: candidate.id,
    sourceType: candidate.sourceType,
    category: candidate.category,
    durability: candidate.durability,
    score: candidate.score,
    title: candidate.title,
    summary: candidate.summary,
    detail: candidate.detail,
    taskId: candidate.taskId,
    tags: candidate.tags,
    metadata: candidate.metadata
  };
}

export async function distillMemory(storeRoot, options = {}) {
  await ensureMemoryStore(storeRoot);
  const config = options.config || resolveMemoryDistillerConfig(options.pluginConfig);
  const candidates = await listMemoryCandidates(storeRoot, {
    sessionKey: options.sessionKey,
    taskId: options.taskId,
    recentDays: options.recentDays || config.candidateRetentionDays
  });

  const selected = dedupeCandidates(candidates)
    .filter((candidate) => candidate.score >= (options.minScore || config.minScore))
    .sort((left, right) => right.score - left.score || toEpoch(right.createdAt) - toEpoch(left.createdAt))
    .slice(0, options.limit || config.distillLimit);

  const dream = {
    id: nextId("dream"),
    createdAt: nowIso(),
    trigger: cleanOptional(options.trigger) || "manual",
    sessionKey: cleanOptional(options.sessionKey),
    taskId: cleanOptional(options.taskId),
    config: {
      minScore: options.minScore || config.minScore,
      limit: options.limit || config.distillLimit,
      recentDays: options.recentDays || config.candidateRetentionDays
    },
    sourceCandidateCount: candidates.length,
    selectedCount: selected.length,
    categories: [...new Set(selected.map((candidate) => candidate.category))],
    items: selected.map(compactDreamItem)
  };

  dream.summary = selected.length
    ? `Dream distilled ${selected.length}/${candidates.length} candidates. ${summarizeDreamItems(dream.items)}.`
    : `Dream distilled 0/${candidates.length} candidates above score ${dream.config.minScore}.`;

  dream.text = formatDream(dream);
  await writeJson(dreamFilePath(storeRoot, dream.id), dream);
  return dream;
}

export function formatCandidate(candidate) {
  const lines = [
    `Memory candidate ${candidate.id}`,
    `- source: ${candidate.sourceType}`,
    `- category: ${candidate.category}`,
    `- durability: ${candidate.durability}`,
    `- score: ${candidate.score}`,
    `- summary: ${candidate.summary}`
  ];
  if (candidate.title) {
    lines.push(`- title: ${candidate.title}`);
  }
  if (candidate.detail) {
    lines.push(`- detail: ${candidate.detail}`);
  }
  if (candidate.tags.length) {
    lines.push(`- tags: ${candidate.tags.join(" | ")}`);
  }
  return lines.join("\n");
}

export function formatCandidateList(candidates) {
  const lines = [`Memory candidates [${candidates.length}]`];
  if (!candidates.length) {
    lines.push("", "No candidates found.");
    return lines.join("\n");
  }
  lines.push("", ...candidates.map((candidate) => `- ${candidate.id} [${candidate.category}] [score=${candidate.score}] ${candidate.summary}`));
  return lines.join("\n");
}

export function formatDream(dream) {
  const lines = [
    `Dream ${dream.id}`,
    `- trigger: ${dream.trigger}`,
    `- selected: ${dream.selectedCount}/${dream.sourceCandidateCount}`,
    `- categories: ${dream.categories.join(" | ") || "none"}`,
    `- summary: ${dream.summary}`
  ];
  if (dream.items.length) {
    lines.push("- items:");
    for (const item of dream.items) {
      lines.push(`  - [${item.category}] [score=${item.score}] ${item.summary}`);
    }
  }
  return lines.join("\n");
}

function extractToolDetails(result) {
  const payload = ensureObject(result);
  if (payload.details && typeof payload.details === "object") {
    return payload.details;
  }
  return payload;
}

export function registerMemoryDistillerHooks(api) {
  api.on("after_tool_call", async (event, ctx) => {
    const config = resolveMemoryDistillerConfig(api.pluginConfig);
    if (!config.autoMemoryEnabled || event.error) {
      return;
    }
    if (!["task_ledger", "worker_result", "validation_bundle"].includes(event.toolName)) {
      return;
    }

    const details = extractToolDetails(event.result);
    const storeRoot = api.resolvePath(cleanText(api.pluginConfig?.storeDir) || ".openclaw-control-plane");
    const candidates = buildMemoryCandidatesFromToolResult(event.toolName, event.params, details, {
      sessionKey: ctx.sessionKey,
      sessionId: ctx.sessionId,
      agentId: ctx.agentId
    });
    for (const candidate of candidates) {
      await appendMemoryCandidate(storeRoot, candidate);
    }
  });

  api.on("after_compaction", async (_event, ctx) => {
    const config = resolveMemoryDistillerConfig(api.pluginConfig);
    if (!config.autoDreamEnabled || !config.autoDreamOnCompaction) {
      return;
    }
    const storeRoot = resolveStoreRoot({ pluginConfig: api.pluginConfig, workspaceDir: ctx.workspaceDir });
    await distillMemory(storeRoot, {
      pluginConfig: api.pluginConfig,
      config,
      sessionKey: ctx.sessionKey,
      trigger: "after_compaction"
    });
  });
}
