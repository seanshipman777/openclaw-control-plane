import {
  appendTaskReviewReminder,
  buildValidationReviewSummary,
  validationBundleNeedsReview
} from "./control-plane-automation.js";
import {
  normalizeValidationBundle,
  renderValidationBundle,
  validateValidationBundle
} from "./validation-bundle.js";

const ARTIFACT_ITEM_SCHEMA = {
  oneOf: [
    { type: "string" },
    {
      type: "object",
      additionalProperties: false,
      properties: {
        kind: {
          type: "string",
          enum: ["screenshot", "path", "diff", "log", "url", "note", "report"]
        },
        label: { type: "string" },
        value: { type: "string" },
        path: { type: "string" },
        url: { type: "string" },
        text: { type: "string" },
        note: { type: "string" }
      }
    }
  ]
};

const CHECK_ITEM_SCHEMA = {
  oneOf: [
    { type: "string" },
    {
      type: "object",
      additionalProperties: false,
      properties: {
        name: { type: "string" },
        check: { type: "string" },
        status: { type: "string", enum: ["pass", "fail", "partial", "not_run"] },
        detail: { type: "string" },
        component: { type: "string" }
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
        mitigation: { type: "string" },
        owner: { type: "string" }
      }
    }
  ]
};

const VALIDATION_BUNDLE_PARAMETERS = {
  type: "object",
  additionalProperties: false,
  properties: {
    action: { type: "string", enum: ["build", "validate"] },
    taskId: { type: "string" },
    title: { type: "string" },
    surface: { type: "string" },
    component: { type: "string" },
    tier: { type: "integer", enum: [1, 2, 3] },
    outcome: { type: "string", enum: ["pass", "partial", "fail", "blocked"] },
    summary: { type: "string" },
    methodology: { type: "string" },
    before: { type: "array", items: ARTIFACT_ITEM_SCHEMA },
    after: { type: "array", items: ARTIFACT_ITEM_SCHEMA },
    checks: { type: "array", items: CHECK_ITEM_SCHEMA },
    unresolvedRisks: { type: "array", items: RISK_ITEM_SCHEMA },
    nextSteps: { type: "array", items: { type: "string" } },
    scores: { type: "object", additionalProperties: { type: "number" } },
    bundle: { type: "object", description: "Existing validation bundle to validate." }
  },
  required: ["action"]
};

function renderValidation(validation) {
  if (validation.valid) {
    return `Validation bundle valid.\n${renderValidationBundle(validation.normalized)}`;
  }

  return [
    "Validation bundle invalid.",
    ...validation.errors.map((error) => `- ${error}`)
  ].join("\n");
}

export function createValidationBundleTool(_api, ctx) {
  return {
    name: "validation_bundle",
    label: "Validation Bundle",
    description: "Normalize and validate proof-tiered validation bundles with before/after artifacts, checks, and unresolved risks.",
    parameters: VALIDATION_BUNDLE_PARAMETERS,
    async execute(_id, params) {
      if (params.action === "validate") {
        const validation = validateValidationBundle(params.bundle);
        return {
          content: [{ type: "text", text: renderValidation(validation) }],
          details: validation
        };
      }

      const bundle = normalizeValidationBundle(params, {
        agentId: ctx.agentId,
        sessionKey: ctx.sessionKey,
        sessionId: ctx.sessionId,
        messageChannel: ctx.messageChannel
      });

      const reminderTask = validationBundleNeedsReview(bundle, _api.pluginConfig)
        ? await appendTaskReviewReminder(
            _api.pluginConfig,
            ctx.workspaceDir,
            bundle.target.taskId,
            buildValidationReviewSummary(bundle),
            "validation_bundle",
            {
              validationOutcome: bundle.outcome,
              riskCount: Array.isArray(bundle.unresolvedRisks) ? bundle.unresolvedRisks.length : 0,
              tier: bundle.tier
            }
          )
        : undefined;

      return {
        content: [{ type: "text", text: renderValidationBundle(bundle) }],
        details: {
          ...bundle,
          automation: {
            reviewReminderTaskId: reminderTask?.id
          }
        }
      };
    }
  };
}
