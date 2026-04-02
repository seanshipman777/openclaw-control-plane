import {
  buildDriftMonitor,
  formatDriftMonitorItem,
  formatDriftMonitorSummary,
  getDriftMonitorItem
} from "./drift-monitor.js";
import { resolveStoreRoot } from "./task-store.js";

const DRIFT_MONITOR_PARAMETERS = {
  type: "object",
  additionalProperties: false,
  properties: {
    action: {
      type: "string",
      enum: ["summary", "list", "get"]
    },
    filter: {
      type: "string",
      enum: ["all", "drifting", "high", "stale", "pressure", "evidence"]
    },
    taskId: {
      type: "string"
    },
    includeDone: {
      type: "boolean"
    },
    includeArchived: {
      type: "boolean"
    },
    limit: {
      type: "integer",
      minimum: 1,
      maximum: 200
    },
    staleAfterMs: {
      type: "integer",
      minimum: 1,
      maximum: 31536000000
    }
  },
  required: ["action"]
};

export function createDriftMonitorTool(api, ctx) {
  return {
    name: "drift_monitor",
    label: "Drift Monitor",
    description: "Detect stale tasks, repeated blockers, missing evidence, and reset/compaction pressure using deterministic control-plane signals.",
    parameters: DRIFT_MONITOR_PARAMETERS,
    async execute(_id, params) {
      const storeRoot = resolveStoreRoot({
        pluginConfig: api.pluginConfig,
        workspaceDir: ctx.workspaceDir
      });

      if (params.action === "get") {
        const item = await getDriftMonitorItem(storeRoot, params.taskId, {
          pluginConfig: api.pluginConfig,
          staleAfterMs: params.staleAfterMs
        });
        return {
          content: [{ type: "text", text: formatDriftMonitorItem(item) }],
          details: item
        };
      }

      const report = await buildDriftMonitor(storeRoot, {
        pluginConfig: api.pluginConfig,
        filter: params.filter || (params.action === "summary" ? "drifting" : "all"),
        includeDone: params.includeDone,
        includeArchived: params.includeArchived,
        limit: params.limit,
        staleAfterMs: params.staleAfterMs,
        sessionKey: ctx.sessionKey,
        sessionId: ctx.sessionId,
        agentId: ctx.agentId
      });

      return {
        content: [{ type: "text", text: formatDriftMonitorSummary(report) }],
        details: report
      };
    }
  };
}
