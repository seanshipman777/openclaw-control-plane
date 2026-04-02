import {
  buildPlanContract,
  buildPlanInputFromTask,
  enterPlanMode,
  exitPlanMode,
  formatPlanContract,
  getActivePlanMode,
  resolvePlanModeConfig
} from "./plan-mode.js";
import { resolveStoreRoot } from "./task-store.js";

const PLAN_STEP_SCHEMA = {
  oneOf: [
    { type: "string" },
    {
      type: "object",
      additionalProperties: false,
      properties: {
        id: { type: "string" },
        title: { type: "string" },
        objective: { type: "string" },
        doneWhen: { type: "string" },
        evidence: { type: "array", items: { type: "string" } },
        owner: { type: "string" }
      }
    }
  ]
};

const PLAN_MODE_PARAMETERS = {
  type: "object",
  additionalProperties: false,
  properties: {
    action: {
      type: "string",
      enum: ["build", "enter", "status", "exit"]
    },
    taskId: { type: "string" },
    title: { type: "string" },
    objective: { type: "string" },
    constraints: { type: "array", items: { type: "string" } },
    assumptions: { type: "array", items: { type: "string" } },
    acceptanceCriteria: { type: "array", items: { type: "string" } },
    currentStep: { type: "string" },
    nextAction: { type: "string" },
    proofTier: { type: "integer", enum: [1, 2, 3] },
    expectedOutputs: { type: "array", items: { type: "string" } },
    stopConditions: { type: "array", items: { type: "string" } },
    steps: { type: "array", items: PLAN_STEP_SCHEMA },
    planningOnly: { type: "boolean" },
    recommendedRoute: { type: "string" },
    executionMode: { type: "string" },
    nextPlannerAction: { type: "string" },
    notes: { type: "string" }
  },
  required: ["action"]
};

function requireSession(ctx) {
  if (!ctx.sessionKey && !ctx.sessionId) {
    throw new Error("plan_mode requires session context for this action");
  }
}

export function createPlanModeTool(api, ctx) {
  return {
    name: "plan_mode",
    label: "Plan Mode",
    description: "Build bounded execution contracts and optionally activate plan mode for the current session so future turns stay aligned with the plan until explicitly exited.",
    parameters: PLAN_MODE_PARAMETERS,
    async execute(_id, params) {
      const storeRoot = resolveStoreRoot({ pluginConfig: api.pluginConfig, workspaceDir: ctx.workspaceDir });
      const config = resolvePlanModeConfig(api.pluginConfig);

      if (params.action === "status") {
        requireSession(ctx);
        const contract = await getActivePlanMode(storeRoot, ctx.sessionKey, ctx.sessionId);
        return {
          content: [{ type: "text", text: contract ? formatPlanContract(contract) : "Plan mode is not active for this session." }],
          details: contract || { active: false }
        };
      }

      if (params.action === "exit") {
        requireSession(ctx);
        const contract = await exitPlanMode(storeRoot, ctx.sessionKey, ctx.sessionId);
        return {
          content: [{ type: "text", text: contract ? `Exited plan mode.\n${formatPlanContract(contract)}` : "Plan mode was not active." }],
          details: contract || { active: false }
        };
      }

      const baseInput = params.taskId
        ? await buildPlanInputFromTask(storeRoot, params.taskId, params)
        : params;
      const contract = buildPlanContract(baseInput, { config });

      if (params.action === "build") {
        return {
          content: [{ type: "text", text: formatPlanContract(contract) }],
          details: contract
        };
      }

      requireSession(ctx);
      const active = await enterPlanMode(storeRoot, {
        sessionKey: ctx.sessionKey,
        sessionId: ctx.sessionId,
        agentId: ctx.agentId,
        workspaceDir: ctx.workspaceDir
      }, contract);

      return {
        content: [{ type: "text", text: `Entered plan mode.\n${formatPlanContract(active)}` }],
        details: active
      };
    }
  };
}
