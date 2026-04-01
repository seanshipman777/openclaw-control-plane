import {
  addEvidence,
  checkpointTask,
  createTask,
  getTask,
  listTasks,
  resolveStoreRoot,
  updateTask
} from "./task-store.js";

const TASK_LEDGER_PARAMETERS = {
  type: "object",
  additionalProperties: false,
  properties: {
    action: {
      type: "string",
      enum: ["create", "get", "list", "update", "checkpoint", "add_evidence", "close"]
    },
    taskId: {
      type: "string",
      description: "Task id for get, update, checkpoint, add_evidence, and close."
    },
    title: {
      type: "string",
      description: "Short task label."
    },
    objective: {
      type: "string",
      description: "What success looks like."
    },
    constraints: {
      type: "array",
      items: { type: "string" },
      description: "Non-negotiable constraints."
    },
    currentStep: {
      type: "string",
      description: "What is being done right now."
    },
    nextAction: {
      type: "string",
      description: "Immediate next concrete action."
    },
    doneCriteria: {
      type: "array",
      items: { type: "string" },
      description: "Checklist for completion."
    },
    blockers: {
      type: "array",
      items: { type: "string" },
      description: "Current blockers."
    },
    status: {
      type: "string",
      enum: ["active", "blocked", "done", "archived"],
      description: "Task status."
    },
    summary: {
      type: "string",
      description: "Checkpoint summary."
    },
    evidence: {
      type: "string",
      description: "Evidence to append to the task."
    },
    includeArchived: {
      type: "boolean",
      description: "Include archived tasks in list output."
    },
    limit: {
      type: "integer",
      minimum: 1,
      maximum: 200,
      description: "List limit."
    }
  },
  required: ["action"]
};

function formatTask(task) {
  const lines = [
    `Task ${task.id}`,
    `- title: ${task.title}`,
    `- status: ${task.status}`,
    `- objective: ${task.objective}`
  ];

  if (task.currentStep) {
    lines.push(`- current_step: ${task.currentStep}`);
  }
  if (task.nextAction) {
    lines.push(`- next_action: ${task.nextAction}`);
  }
  if (task.constraints?.length) {
    lines.push(`- constraints: ${task.constraints.join(" | ")}`);
  }
  if (task.doneCriteria?.length) {
    lines.push(`- done_criteria: ${task.doneCriteria.join(" | ")}`);
  }
  if (task.blockers?.length) {
    lines.push(`- blockers: ${task.blockers.join(" | ")}`);
  }
  if (task.evidence?.length) {
    lines.push(`- evidence_count: ${task.evidence.length}`);
  }
  if (task.checkpoints?.length) {
    lines.push(`- checkpoint_count: ${task.checkpoints.length}`);
  }

  return lines.join("\n");
}

function formatTaskList(tasks) {
  if (!tasks.length) {
    return "No matching tasks.";
  }

  return [
    `Tasks (${tasks.length})`,
    ...tasks.map((task) => {
      const next = task.nextAction ? ` — next: ${task.nextAction}` : "";
      return `- ${task.id} [${task.status}] ${task.title}${next}`;
    })
  ].join("\n");
}

function extractUpdatePatch(params) {
  return {
    title: params.title,
    objective: params.objective,
    constraints: params.constraints,
    currentStep: params.currentStep,
    nextAction: params.nextAction,
    doneCriteria: params.doneCriteria,
    blockers: params.blockers,
    status: params.status
  };
}

export function createTaskLedgerTool(api, ctx) {
  return {
    name: "task_ledger",
    label: "Task Ledger",
    description: "Create, inspect, and update structured task state so longer-running work survives context shifts without turning into transcript sludge.",
    parameters: TASK_LEDGER_PARAMETERS,
    async execute(_id, params) {
      const storeRoot = resolveStoreRoot({
        pluginConfig: api.pluginConfig,
        workspaceDir: ctx.workspaceDir
      });

      const action = params.action;
      const defaultListLimit = Number.isFinite(api.pluginConfig?.defaultListLimit)
        ? Math.max(1, Math.min(200, Math.floor(api.pluginConfig.defaultListLimit)))
        : 20;

      if (action === "create") {
        const task = await createTask(storeRoot, params, {
          workspaceDir: ctx.workspaceDir,
          sessionKey: ctx.sessionKey,
          sessionId: ctx.sessionId,
          agentId: ctx.agentId,
          messageChannel: ctx.messageChannel
        });
        return {
          content: [{ type: "text", text: `Created task.\n${formatTask(task)}` }],
          details: { action, storeRoot, task }
        };
      }

      if (action === "get") {
        const task = await getTask(storeRoot, params.taskId);
        return {
          content: [{ type: "text", text: formatTask(task) }],
          details: { action, storeRoot, task }
        };
      }

      if (action === "list") {
        const tasks = await listTasks(storeRoot, {
          status: params.status,
          includeArchived: params.includeArchived,
          limit: params.limit ?? defaultListLimit
        });
        return {
          content: [{ type: "text", text: formatTaskList(tasks) }],
          details: { action, storeRoot, count: tasks.length, tasks }
        };
      }

      if (action === "update") {
        const task = await updateTask(storeRoot, params.taskId, extractUpdatePatch(params));
        return {
          content: [{ type: "text", text: `Updated task.\n${formatTask(task)}` }],
          details: { action, storeRoot, task }
        };
      }

      if (action === "checkpoint") {
        const task = await checkpointTask(storeRoot, params.taskId, params.summary);
        return {
          content: [{ type: "text", text: `Checkpoint saved.\n${formatTask(task)}` }],
          details: { action, storeRoot, task }
        };
      }

      if (action === "add_evidence") {
        const task = await addEvidence(storeRoot, params.taskId, params.evidence);
        return {
          content: [{ type: "text", text: `Evidence appended.\n${formatTask(task)}` }],
          details: { action, storeRoot, task }
        };
      }

      if (action === "close") {
        const task = await updateTask(storeRoot, params.taskId, {
          status: "done",
          blockers: []
        });
        return {
          content: [{ type: "text", text: `Closed task.\n${formatTask(task)}` }],
          details: { action, storeRoot, task }
        };
      }

      throw new Error(`unsupported action: ${action}`);
    }
  };
}
