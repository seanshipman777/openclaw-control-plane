import { buildReviewQueue, deriveReviewQueueItem, formatReviewQueueItem, formatReviewQueueSummary, resolveReviewQueueConfig } from "./review-queue.js";
import { getTask, resolveStoreRoot } from "./task-store.js";

const REVIEW_QUEUE_PARAMETERS = {
  type: "object",
  additionalProperties: false,
  properties: {
    action: {
      type: "string",
      enum: ["summary", "list", "get"]
    },
    filter: {
      type: "string",
      enum: ["all", "attention", "needs_review", "blocked", "stale", "active"]
    },
    taskId: {
      type: "string",
      description: "Task id for get."
    },
    includeDone: {
      type: "boolean",
      description: "Include done tasks in queue evaluation."
    },
    includeArchived: {
      type: "boolean",
      description: "Include archived tasks in queue evaluation."
    },
    limit: {
      type: "integer",
      minimum: 1,
      maximum: 200
    },
    staleAfterMs: {
      type: "integer",
      minimum: 1,
      maximum: 31536000000,
      description: "Override stale threshold for queue evaluation."
    }
  },
  required: ["action"]
};

export function createReviewQueueTool(api, ctx) {
  return {
    name: "review_queue",
    label: "Review Queue",
    description: "Surface what needs attention now across blocked work, stale tasks, review reminders, and unresolved risks using the structured control-plane state.",
    parameters: REVIEW_QUEUE_PARAMETERS,
    async execute(_id, params) {
      const storeRoot = resolveStoreRoot({
        pluginConfig: api.pluginConfig,
        workspaceDir: ctx.workspaceDir
      });
      const config = resolveReviewQueueConfig(api.pluginConfig);

      if (params.action === "get") {
        const task = await getTask(storeRoot, params.taskId);
        const item = deriveReviewQueueItem(task, {
          config,
          staleAfterMs: params.staleAfterMs
        });
        return {
          content: [{ type: "text", text: formatReviewQueueItem(item) }],
          details: item
        };
      }

      const queue = await buildReviewQueue(storeRoot, {
        pluginConfig: api.pluginConfig,
        filter: params.filter || (params.action === "summary" ? "attention" : "all"),
        includeDone: params.includeDone,
        includeArchived: params.includeArchived,
        limit: params.limit,
        staleAfterMs: params.staleAfterMs,
        sessionKey: ctx.sessionKey,
        sessionId: ctx.sessionId,
        agentId: ctx.agentId
      });

      return {
        content: [{ type: "text", text: formatReviewQueueSummary(queue) }],
        details: queue
      };
    }
  };
}
