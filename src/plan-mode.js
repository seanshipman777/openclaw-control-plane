import fs from "node:fs/promises";
import path from "node:path";

import { getTask, resolveStoreRoot } from "./task-store.js";

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

function slugify(value) {
  return cleanText(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

function nowIso() {
  return new Date().toISOString();
}

function ensureObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function normalizePositiveInteger(value, fallback) {
  if (!Number.isFinite(value)) {
    return fallback;
  }
  const next = Math.floor(value);
  return next > 0 ? next : fallback;
}

export function resolvePlanModeConfig(pluginConfig = {}) {
  const planMode = pluginConfig && typeof pluginConfig === "object" && !Array.isArray(pluginConfig.planMode)
    ? pluginConfig.planMode || {}
    : {};

  return {
    enabled: planMode.enabled !== false,
    maxSteps: normalizePositiveInteger(planMode.maxSteps, 8),
    planningOnlyDefault: planMode.planningOnlyDefault !== false,
    injectPromptContext: planMode.injectPromptContext !== false
  };
}

function plansDir(storeRoot) {
  return path.join(storeRoot, "plan-mode");
}

function planFilePath(storeRoot, sessionKey, sessionId) {
  const base = slugify(sessionKey || sessionId || "session");
  return path.join(plansDir(storeRoot), `${base}.json`);
}

async function ensurePlanStore(storeRoot) {
  await fs.mkdir(plansDir(storeRoot), { recursive: true });
}

async function writeJson(filePath, value) {
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, "utf8"));
}

function normalizeStep(entry, index) {
  if (typeof entry === "string") {
    const text = cleanText(entry);
    if (!text) {
      return undefined;
    }
    return {
      id: `step-${index + 1}`,
      title: text,
      objective: text,
      doneWhen: undefined,
      evidence: []
    };
  }

  const item = ensureObject(entry);
  const title = cleanOptional(item.title) || cleanOptional(item.objective) || cleanOptional(item.text);
  if (!title) {
    return undefined;
  }

  return {
    id: cleanOptional(item.id) || `step-${index + 1}`,
    title,
    objective: cleanOptional(item.objective) || title,
    doneWhen: cleanOptional(item.doneWhen),
    evidence: cleanStringArray(item.evidence),
    owner: cleanOptional(item.owner)
  };
}

function inferRecommendedRoute(input = {}) {
  const requested = cleanOptional(input.recommendedRoute);
  if (requested) {
    return requested;
  }

  const objective = cleanText(input.objective).toLowerCase();
  const nextAction = cleanText(input.nextAction).toLowerCase();
  const combined = `${objective} ${nextAction}`;

  if (["validate", "verify", "proof", "review"].some((token) => combined.includes(token))) {
    return "validator";
  }
  if (["plan", "scope", "decide"].some((token) => combined.includes(token))) {
    return "ceo";
  }
  return "worker";
}

function inferExecutionMode(input = {}) {
  const requested = cleanOptional(input.executionMode);
  if (requested) {
    return requested;
  }

  const route = inferRecommendedRoute(input);
  if (route === "validator") {
    return "validation_first";
  }
  if (route === "ceo") {
    return "direct_planning";
  }
  return "delegated_worker";
}

function inferExpectedOutputs(input = {}) {
  const explicit = cleanStringArray(input.expectedOutputs);
  if (explicit.length) {
    return explicit;
  }

  const proofTier = Number.isFinite(input.proofTier) ? Number(input.proofTier) : 2;
  const outputs = ["worker_result.v1"];
  if (proofTier >= 1) {
    outputs.push("validation_bundle.v1");
  }
  outputs.push("task_ledger checkpoint");
  return outputs;
}

function deriveDefaultSteps(input = {}, maxSteps = 8) {
  const provided = (Array.isArray(input.steps) ? input.steps : [])
    .map((entry, index) => normalizeStep(entry, index))
    .filter(Boolean);

  if (provided.length) {
    return provided.slice(0, maxSteps);
  }

  const steps = [];
  const objective = cleanOptional(input.objective) || "Complete the assigned objective";
  const nextAction = cleanOptional(input.nextAction);
  const proofTier = Number.isFinite(input.proofTier) ? Number(input.proofTier) : 2;

  steps.push({
    id: "step-1",
    title: "Confirm scope and constraints",
    objective: "Restate the task boundaries, assumptions, and non-negotiables before execution.",
    doneWhen: "Scope, constraints, and success target are explicit.",
    evidence: []
  });

  steps.push({
    id: "step-2",
    title: nextAction || "Execute the main work chunk",
    objective,
    doneWhen: "The main task change or investigation chunk is complete.",
    evidence: []
  });

  steps.push({
    id: "step-3",
    title: "Capture evidence",
    objective: "Record the artifacts, files, commands, or logs that prove what changed.",
    doneWhen: "Evidence is ready for worker_result output.",
    evidence: []
  });

  steps.push({
    id: "step-4",
    title: `Validate to proof tier ${proofTier}`,
    objective: "Run the required validation tier and capture before/after proof where applicable.",
    doneWhen: "Validation status and unresolved risks are explicit.",
    evidence: []
  });

  steps.push({
    id: "step-5",
    title: "Return structured handoff",
    objective: "Produce worker_result and validation_bundle outputs plus update the task ledger.",
    doneWhen: "Follow-up can proceed without transcript archaeology.",
    evidence: []
  });

  return steps.slice(0, maxSteps);
}

export function buildPlanContract(input = {}, options = {}) {
  const payload = ensureObject(input);
  const config = options.config || resolvePlanModeConfig();
  const objective = cleanOptional(payload.objective);
  if (!objective) {
    throw new Error("objective required");
  }

  const proofTier = Number.isFinite(payload.proofTier) ? Math.max(1, Math.min(3, Math.floor(payload.proofTier))) : 2;
  const planningOnly = typeof payload.planningOnly === "boolean"
    ? payload.planningOnly
    : config.planningOnlyDefault;

  const contract = {
    schemaVersion: "plan_contract.v1",
    createdAt: nowIso(),
    task: {
      taskId: cleanOptional(payload.taskId),
      title: cleanOptional(payload.title) || objective,
      objective,
      currentStep: cleanOptional(payload.currentStep),
      nextAction: cleanOptional(payload.nextAction)
    },
    planningMode: {
      active: true,
      planningOnly
    },
    constraints: cleanStringArray(payload.constraints),
    assumptions: cleanStringArray(payload.assumptions),
    acceptanceCriteria: cleanStringArray(payload.acceptanceCriteria || payload.doneCriteria),
    proofTier,
    execution: {
      recommendedRoute: inferRecommendedRoute(payload),
      executionMode: inferExecutionMode(payload),
      stopConditions: cleanStringArray(payload.stopConditions),
      expectedOutputs: inferExpectedOutputs({ ...payload, proofTier })
    },
    steps: deriveDefaultSteps({ ...payload, proofTier }, config.maxSteps),
    nextPlannerAction: cleanOptional(payload.nextPlannerAction) || cleanOptional(payload.nextAction) || "Choose the first execution step and assign the lane.",
    notes: cleanOptional(payload.notes)
  };

  return contract;
}

export function formatPlanContract(contract) {
  const lines = [
    `Plan contract [${contract.execution.recommendedRoute} | ${contract.execution.executionMode}]`,
    `- title: ${contract.task.title}`,
    `- objective: ${contract.task.objective}`,
    `- planning_only: ${contract.planningMode.planningOnly ? "yes" : "no"}`,
    `- proof_tier: ${contract.proofTier}`,
    `- expected_outputs: ${contract.execution.expectedOutputs.join(" | ")}`,
    `- next_planner_action: ${contract.nextPlannerAction}`
  ];

  if (contract.constraints.length) {
    lines.push(`- constraints: ${contract.constraints.join(" | ")}`);
  }
  if (contract.acceptanceCriteria.length) {
    lines.push(`- acceptance_criteria: ${contract.acceptanceCriteria.join(" | ")}`);
  }
  if (contract.execution.stopConditions.length) {
    lines.push(`- stop_conditions: ${contract.execution.stopConditions.join(" | ")}`);
  }
  if (contract.steps.length) {
    lines.push("- steps:");
    for (const step of contract.steps) {
      lines.push(`  - ${step.id}: ${step.title}`);
    }
  }

  return lines.join("\n");
}

export async function getActivePlanMode(storeRoot, sessionKey, sessionId) {
  const filePath = planFilePath(storeRoot, sessionKey, sessionId);
  try {
    return await readJson(filePath);
  } catch (error) {
    if (error && typeof error === "object" && error.code === "ENOENT") {
      return undefined;
    }
    throw error;
  }
}

export async function enterPlanMode(storeRoot, sessionContext, contract) {
  await ensurePlanStore(storeRoot);
  const filePath = planFilePath(storeRoot, sessionContext.sessionKey, sessionContext.sessionId);
  const payload = {
    ...contract,
    session: {
      sessionKey: sessionContext.sessionKey || null,
      sessionId: sessionContext.sessionId || null,
      agentId: sessionContext.agentId || null,
      workspaceDir: sessionContext.workspaceDir || null
    },
    updatedAt: nowIso()
  };
  await writeJson(filePath, payload);
  return payload;
}

export async function exitPlanMode(storeRoot, sessionKey, sessionId) {
  const filePath = planFilePath(storeRoot, sessionKey, sessionId);
  try {
    const existing = await readJson(filePath);
    await fs.rm(filePath, { force: true });
    return existing;
  } catch (error) {
    if (error && typeof error === "object" && error.code === "ENOENT") {
      return undefined;
    }
    throw error;
  }
}

export async function buildPlanInputFromTask(storeRoot, taskId, overrides = {}) {
  const task = await getTask(storeRoot, taskId);
  return {
    taskId: task.id,
    title: cleanOptional(overrides.title) || task.title,
    objective: cleanOptional(overrides.objective) || task.objective,
    constraints: Array.isArray(overrides.constraints) ? overrides.constraints : task.constraints,
    currentStep: cleanOptional(overrides.currentStep) || task.currentStep,
    nextAction: cleanOptional(overrides.nextAction) || task.nextAction,
    acceptanceCriteria: Array.isArray(overrides.acceptanceCriteria)
      ? overrides.acceptanceCriteria
      : task.doneCriteria,
    blockers: Array.isArray(overrides.blockers) ? overrides.blockers : task.blockers,
    notes: cleanOptional(overrides.notes)
  };
}

export function buildPlanModePrompt(contract) {
  const lines = [
    "Active plan mode is ON.",
    `Current plan objective: ${contract.task.objective}`,
    `Recommended route: ${contract.execution.recommendedRoute}.`,
    `Execution mode: ${contract.execution.executionMode}.`,
    `Proof tier target: ${contract.proofTier}.`
  ];

  if (contract.planningMode.planningOnly) {
    lines.push("Stay in planning mode. Do not execute changes, run tools, or commit to implementation unless the user explicitly exits plan mode or tells you to move from planning to execution.");
  } else {
    lines.push("Use the active plan as the operating contract. Keep outputs aligned to the plan and update the user when the route changes.");
  }

  if (contract.constraints.length) {
    lines.push(`Constraints: ${contract.constraints.join(" | ")}`);
  }
  if (contract.acceptanceCriteria.length) {
    lines.push(`Acceptance criteria: ${contract.acceptanceCriteria.join(" | ")}`);
  }
  if (contract.steps.length) {
    lines.push(`Current planned steps: ${contract.steps.map((step) => `${step.id}=${step.title}`).join(" ; ")}`);
  }

  return lines.join("\n");
}

export function registerPlanModeHooks(api) {
  api.on("before_prompt_build", async (_event, ctx) => {
    const config = resolvePlanModeConfig(api.pluginConfig);
    if (!config.enabled || !config.injectPromptContext) {
      return;
    }

    const storeRoot = resolveStoreRoot({ pluginConfig: api.pluginConfig, workspaceDir: ctx.workspaceDir });
    const contract = await getActivePlanMode(storeRoot, ctx.sessionKey, ctx.sessionId);
    if (!contract) {
      return;
    }

    return {
      prependContext: buildPlanModePrompt(contract)
    };
  });
}
