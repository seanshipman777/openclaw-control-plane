import { definePluginEntry } from "openclaw/plugin-sdk/plugin-entry";
import { createTaskLedgerTool } from "./src/task-ledger-tool.js";

export default definePluginEntry({
  id: "control-plane",
  name: "Control Plane",
  description: "Task-ledger-first control-plane helpers for safer agent execution",
  register(api) {
    api.registerTool((ctx) => createTaskLedgerTool(api, ctx), { names: ["task_ledger"] });
  }
});
