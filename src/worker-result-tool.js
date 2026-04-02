import { normalizeWorkerResult, renderWorkerResult, validateWorkerResult } from "./worker-result.js";
import {
  appendTaskReviewReminder,
  buildWorkerReviewSummary,
  workerResultNeedsReview
} from "./control-plane-automation.js";

const EVIDENCE_ITEM_SCHEMA = {
  oneOf: [
    { type: "string" },
    {
      type: "object",
      additionalProperties: false,
      properties: {
        kind: {
          type: "string",
          enum: ["artifact", "path", "diff", "command", "log", "url", "note"]
        },
        label: { type: "string" },
        value: { type: "string" },
        path: { type: "string" },
        text: { type: "string" },
        url: { type: "string" },
        note: { type: "string" }
      }
    }
  ]
};

const RISK_ITEM_SCHEMA = {
  oneOf: [
    { type: "string" },
    {
      type: "object",
      additionalProperties: false,
      properties: {
        level: { type: "string", enum: ["low", "medium", "high"] },
        text: { type: "string" },
        risk: { type: "string" },
        owner: { type: "string" },
        mitigation: { type: "string" }
      }
    }
  ]
};

const NEXT_STEP_ITEM_SCHEMA = {
  oneOf: [
    { type: "string" },
    {
      type: "object",
      additionalProperties: false,
      properties: {
        owner: { type: "string" },
        text: { type: "string" },
        action: { type: "string" },
        status: { type: "string" }
      }
    }
  ]
};

const WORKER_RESULT_PARAMETERS = {
  type: "object",
  additionalProperties: false,
  properties: {
    action: {
      type: "string",
      enum: ["build", "validate"]
    },
    taskId: { type: "string" },
    title: { type: "string" },
    objective: { type: "string" },
    status: {
      type: "string",
      enum: ["done", "partial", "blocked", "failed", "aborted"]
    },
    summary: { type: "string" },
    details: { type: "string" },
    blockers: {
      type: "array",
      items: { type: "string" }
    },
    evidence: {
      type: "array",
      items: EVIDENCE_ITEM_SCHEMA
    },
    risks: {
      type: "array",
      items: RISK_ITEM_SCHEMA
    },
    nextSteps: {
      type: "array",
      items: NEXT_STEP_ITEM_SCHEMA
    },
    needsReview: { type: "boolean" },
    recommendedOwner: { type: "string" },
    result: {
      type: "object",
      description: "Existing worker result object to validate."
    }
  },
  required: ["action"]
};

function renderValidation(validation) {
  if (validation.valid) {
    return `Worker result valid.\n${renderWorkerResult(validation.normalized)}`;
  }

  return [
    "Worker result invalid.",
    ...validation.errors.map((error) => `- ${error}`)
  ].join("\n");
}

export function createWorkerResultTool(_api, ctx) {
  return {
    name: "worker_result",
    label: "Worker Result",
    description: "Normalize and validate worker handoff results so CEO review, follow-up, and audit do not depend on transcript archaeology.",
    parameters: WORKER_RESULT_PARAMETERS,
    async execute(_id, params) {
      if (params.action === "validate") {
        const validation = validateWorkerResult(params.result);
        return {
          content: [{ type: "text", text: renderValidation(validation) }],
          details: validation
        };
      }

      const result = normalizeWorkerResult(params, {
        agentId: ctx.agentId,
        sessionKey: ctx.sessionKey,
        sessionId: ctx.sessionId,
        messageChannel: ctx.messageChannel
      });

      const reminderTask = workerResultNeedsReview(result, _api.pluginConfig)
        ? await appendTaskReviewReminder(
            _api.pluginConfig,
            ctx.workspaceDir,
            result.task.taskId,
            buildWorkerReviewSummary(result),
            "worker_result"
          )
        : undefined;

      return {
        content: [{ type: "text", text: renderWorkerResult(result) }],
        details: {
          ...result,
          automation: {
            reviewReminderTaskId: reminderTask?.id
          }
        }
      };
    }
  };
}
