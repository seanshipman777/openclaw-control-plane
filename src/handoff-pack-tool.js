import { buildHandoffPack } from "./handoff-pack.js";
import { resolveStoreRoot } from "./task-store.js";

const HANDOFF_PACK_PARAMETERS = {
  type: "object",
  additionalProperties: false,
  properties: {
    mode: {
      type: "string",
      enum: ["resume", "worker", "review", "status"]
    },
    taskId: {
      type: "string",
      description: "Optional explicit task id. If omitted, the pack resolves the best session task and active plan mode." 
    },
    evidenceLimit: {
      type: "integer",
      minimum: 1,
      maximum: 20
    },
    checkpointLimit: {
      type: "integer",
      minimum: 1,
      maximum: 20
    },
    stepLimit: {
      type: "integer",
      minimum: 1,
      maximum: 20
    }
  },
  required: ["mode"]
};

export function createHandoffPackTool(api, ctx) {
  return {
    name: "handoff_pack",
    label: "Handoff Pack",
    description: "Compose compact resume, worker-brief, review, and human-status packets from task state, plan mode, review signals, evidence, and checkpoints.",
    parameters: HANDOFF_PACK_PARAMETERS,
    async execute(_id, params) {
      const storeRoot = resolveStoreRoot({
        pluginConfig: api.pluginConfig,
        workspaceDir: ctx.workspaceDir
      });
      const pack = await buildHandoffPack(storeRoot, ctx, params, api.pluginConfig);
      return {
        content: [{ type: "text", text: pack.text }],
        details: pack
      };
    }
  };
}
