import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

export const VALID_STATUSES = new Set(["active", "blocked", "done", "archived"]);

function nowIso() {
  return new Date().toISOString();
}

function cleanText(value) {
  return typeof value === "string" ? value.trim() : "";
}

export function cleanStringArray(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) => cleanText(entry))
    .filter(Boolean);
}

export function normalizeStatus(value, fallback = undefined) {
  const next = cleanText(value).toLowerCase();
  if (!next) {
    return fallback;
  }
  if (!VALID_STATUSES.has(next)) {
    throw new Error(`invalid status: ${value}`);
  }
  return next;
}

export function slugify(value) {
  return cleanText(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

function buildId(seed) {
  const base = slugify(seed) || "task";
  return `${base}-${randomUUID().slice(0, 8)}`;
}

function cleanOptional(value) {
  const text = cleanText(value);
  return text || undefined;
}

function toEpoch(value) {
  const parsed = Date.parse(String(value || ""));
  return Number.isNaN(parsed) ? 0 : parsed;
}

function ensureObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

export function resolveStoreRoot({ pluginConfig = {}, workspaceDir, fallbackDir = process.cwd() } = {}) {
  const baseDir = workspaceDir || fallbackDir;
  const configured = cleanText(pluginConfig.storeDir);

  if (!configured) {
    return path.resolve(baseDir, ".openclaw-control-plane");
  }

  return path.isAbsolute(configured)
    ? configured
    : path.resolve(baseDir, configured);
}

function tasksDir(storeRoot) {
  return path.join(storeRoot, "tasks");
}

function taskPath(storeRoot, taskId) {
  return path.join(tasksDir(storeRoot), `${taskId}.json`);
}

async function ensureStore(storeRoot) {
  await fs.mkdir(tasksDir(storeRoot), { recursive: true });
}

async function writeJson(filePath, value) {
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, "utf8"));
}

async function nextTaskId(storeRoot, requestedId, seed) {
  const requested = cleanText(requestedId);
  if (requested) {
    return requested;
  }

  let candidate = buildId(seed);
  while (true) {
    try {
      await fs.access(taskPath(storeRoot, candidate));
      candidate = buildId(seed);
    } catch {
      return candidate;
    }
  }
}

export async function createTask(storeRoot, input, meta = {}) {
  await ensureStore(storeRoot);

  const payload = ensureObject(input);
  const title = cleanOptional(payload.title) || cleanOptional(payload.objective) || "Untitled task";
  const objective = cleanOptional(payload.objective) || title;
  const id = await nextTaskId(storeRoot, payload.taskId, title);
  const timestamp = nowIso();

  const task = {
    id,
    title,
    objective,
    status: normalizeStatus(payload.status, "active"),
    createdAt: timestamp,
    updatedAt: timestamp,
    constraints: cleanStringArray(payload.constraints),
    currentStep: cleanOptional(payload.currentStep),
    nextAction: cleanOptional(payload.nextAction),
    doneCriteria: cleanStringArray(payload.doneCriteria),
    blockers: cleanStringArray(payload.blockers),
    evidence: [],
    checkpoints: [],
    context: {
      workspaceDir: meta.workspaceDir || null,
      sessionKey: meta.sessionKey || null,
      sessionId: meta.sessionId || null,
      agentId: meta.agentId || null,
      messageChannel: meta.messageChannel || null
    }
  };

  await writeJson(taskPath(storeRoot, task.id), task);
  return task;
}

export async function getTask(storeRoot, taskId) {
  const id = cleanText(taskId);
  if (!id) {
    throw new Error("taskId required");
  }

  try {
    return await readJson(taskPath(storeRoot, id));
  } catch (error) {
    if (error && typeof error === "object" && error.code === "ENOENT") {
      throw new Error(`task not found: ${id}`);
    }
    throw error;
  }
}

export async function updateTask(storeRoot, taskId, patch) {
  const task = await getTask(storeRoot, taskId);
  const payload = ensureObject(patch);

  if ("title" in payload) {
    task.title = cleanOptional(payload.title) || task.title;
  }
  if ("objective" in payload) {
    task.objective = cleanOptional(payload.objective) || task.objective;
  }
  if ("status" in payload) {
    task.status = normalizeStatus(payload.status, task.status);
  }
  if ("constraints" in payload) {
    task.constraints = cleanStringArray(payload.constraints);
  }
  if ("currentStep" in payload) {
    task.currentStep = cleanOptional(payload.currentStep);
  }
  if ("nextAction" in payload) {
    task.nextAction = cleanOptional(payload.nextAction);
  }
  if ("doneCriteria" in payload) {
    task.doneCriteria = cleanStringArray(payload.doneCriteria);
  }
  if ("blockers" in payload) {
    task.blockers = cleanStringArray(payload.blockers);
  }

  task.updatedAt = nowIso();
  await writeJson(taskPath(storeRoot, task.id), task);
  return task;
}

export async function addEvidence(storeRoot, taskId, text) {
  const task = await getTask(storeRoot, taskId);
  const evidenceText = cleanText(text);
  if (!evidenceText) {
    throw new Error("evidence text required");
  }

  task.evidence.push({
    at: nowIso(),
    text: evidenceText
  });
  task.updatedAt = nowIso();
  await writeJson(taskPath(storeRoot, task.id), task);
  return task;
}

export async function checkpointTask(storeRoot, taskId, summary, meta = {}) {
  const task = await getTask(storeRoot, taskId);
  const checkpointSummary = cleanText(summary);
  if (!checkpointSummary) {
    throw new Error("summary required");
  }

  const checkpoint = {
    at: nowIso(),
    summary: checkpointSummary,
    status: task.status,
    currentStep: task.currentStep || null,
    nextAction: task.nextAction || null
  };

  if (meta && typeof meta === "object" && !Array.isArray(meta)) {
    if (cleanOptional(meta.kind)) {
      checkpoint.kind = cleanOptional(meta.kind);
    }
    if (cleanOptional(meta.reason)) {
      checkpoint.reason = cleanOptional(meta.reason);
    }
    if (meta.automation && typeof meta.automation === "object" && !Array.isArray(meta.automation)) {
      checkpoint.automation = { ...meta.automation };
    }
  }

  task.checkpoints.push(checkpoint);
  task.updatedAt = nowIso();
  await writeJson(taskPath(storeRoot, task.id), task);
  return task;
}

export async function listTasks(storeRoot, options = {}) {
  await ensureStore(storeRoot);

  const statusFilter = normalizeStatus(options.status);
  const statusFilters = Array.isArray(options.statuses)
    ? options.statuses.map((status) => normalizeStatus(status)).filter(Boolean)
    : [];
  const includeArchived = Boolean(options.includeArchived);
  const limit = Number.isFinite(options.limit) && options.limit > 0
    ? Math.floor(options.limit)
    : undefined;
  const sessionKey = cleanOptional(options.sessionKey);
  const sessionId = cleanOptional(options.sessionId);
  const agentId = cleanOptional(options.agentId);

  const files = await fs.readdir(tasksDir(storeRoot));
  const tasks = [];

  for (const file of files) {
    if (!file.endsWith(".json")) {
      continue;
    }
    tasks.push(await readJson(path.join(tasksDir(storeRoot), file)));
  }

  return tasks
    .filter((task) => includeArchived || task.status !== "archived")
    .filter((task) => !statusFilter || task.status === statusFilter)
    .filter((task) => statusFilters.length === 0 || statusFilters.includes(task.status))
    .filter((task) => !sessionKey || task.context?.sessionKey === sessionKey)
    .filter((task) => !sessionId || task.context?.sessionId === sessionId)
    .filter((task) => !agentId || task.context?.agentId === agentId)
    .sort((left, right) => String(right.updatedAt).localeCompare(String(left.updatedAt)))
    .slice(0, limit ?? tasks.length);
}

export function shouldSkipDuplicateCheckpoint(task, summary, windowMs = 0) {
  if (!Array.isArray(task?.checkpoints) || task.checkpoints.length === 0) {
    return false;
  }

  const latest = [...task.checkpoints]
    .filter((entry) => entry && typeof entry === "object")
    .sort((left, right) => toEpoch(right.at) - toEpoch(left.at))[0];

  if (!latest) {
    return false;
  }

  if (cleanOptional(latest.summary) !== cleanOptional(summary)) {
    return false;
  }

  if (!Number.isFinite(windowMs) || windowMs <= 0) {
    return true;
  }

  return Date.now() - toEpoch(latest.at) <= windowMs;
}
