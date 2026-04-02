import { registerControlPlaneHooks } from "./src/control-plane-automation.js";
import { definePluginEntry } from "openclaw/plugin-sdk/plugin-entry";
import { createContextPackerTool } from "./src/context-packer-tool.js";
import { registerPlanModeHooks } from "./src/plan-mode.js";
import { createPlanModeTool } from "./src/plan-mode-tool.js";
import { createReviewQueueTool } from "./src/review-queue-tool.js";
import { createTaskLedgerTool } from "./src/task-ledger-tool.js";
import { createValidationBundleTool } from "./src/validation-bundle-tool.js";
import { createWorkerResultTool } from "./src/worker-result-tool.js";

export default definePluginEntry({
  id: "openclaw-control-plane",
  name: "Control Plane",
  description: "Task-ledger-first control-plane helpers for safer agent execution",
  register(api) {
    registerControlPlaneHooks(api);
    registerPlanModeHooks(api);
    api.registerTool((ctx) => createTaskLedgerTool(api, ctx), { names: ["task_ledger"] });
    api.registerTool((ctx) => createContextPackerTool(api, ctx), { names: ["context_packer"] });
    api.registerTool((ctx) => createWorkerResultTool(api, ctx), { names: ["worker_result"] });
    api.registerTool((ctx) => createValidationBundleTool(api, ctx), { names: ["validation_bundle"] });
    api.registerTool((ctx) => createReviewQueueTool(api, ctx), { names: ["review_queue"] });
    api.registerTool((ctx) => createPlanModeTool(api, ctx), { names: ["plan_mode"] });
  }
});
