import {
  appendMemoryCandidate,
  buildMemoryCandidate,
  distillMemory,
  formatCandidate,
  formatCandidateList,
  formatDream,
  getDream,
  listDreams,
  listMemoryCandidates,
  resolveMemoryDistillerConfig
} from "./memory-distiller.js";
import { resolveStoreRoot } from "./task-store.js";

const MEMORY_DISTILLER_PARAMETERS = {
  type: "object",
  additionalProperties: false,
  properties: {
    action: {
      type: "string",
      enum: ["capture", "list_candidates", "distill", "list_dreams", "get_dream"]
    },
    summary: { type: "string" },
    detail: { type: "string" },
    score: { type: "integer", minimum: 1, maximum: 200 },
    category: {
      type: "string",
      enum: ["project_state", "risk", "rule", "decision", "open_question"]
    },
    sourceType: { type: "string" },
    taskId: { type: "string" },
    title: { type: "string" },
    tags: { type: "array", items: { type: "string" } },
    recentDays: { type: "integer", minimum: 1, maximum: 365 },
    minScore: { type: "integer", minimum: 1, maximum: 200 },
    limit: { type: "integer", minimum: 1, maximum: 100 },
    dreamId: { type: "string" }
  },
  required: ["action"]
};

export function createMemoryDistillerTool(api, ctx) {
  return {
    name: "memory_distiller",
    label: "Memory Distiller",
    description: "Capture structured memory candidates and distill them into reviewable AutoDream rollups grounded in control-plane artifacts rather than transcript sludge.",
    parameters: MEMORY_DISTILLER_PARAMETERS,
    async execute(_id, params) {
      const storeRoot = resolveStoreRoot({
        pluginConfig: api.pluginConfig,
        workspaceDir: ctx.workspaceDir
      });
      const config = resolveMemoryDistillerConfig(api.pluginConfig);

      if (params.action === "capture") {
        const candidate = buildMemoryCandidate({
          sourceType: params.sourceType || "manual",
          summary: params.summary,
          detail: params.detail,
          score: params.score,
          category: params.category,
          taskId: params.taskId,
          title: params.title,
          tags: params.tags
        }, {
          sessionKey: ctx.sessionKey,
          sessionId: ctx.sessionId,
          agentId: ctx.agentId
        });
        await appendMemoryCandidate(storeRoot, candidate);
        return {
          content: [{ type: "text", text: formatCandidate(candidate) }],
          details: candidate
        };
      }

      if (params.action === "list_candidates") {
        const candidates = await listMemoryCandidates(storeRoot, {
          sessionKey: ctx.sessionKey,
          taskId: params.taskId,
          sourceType: params.sourceType,
          recentDays: params.recentDays
        });
        return {
          content: [{ type: "text", text: formatCandidateList(candidates.slice(0, params.limit || 20)) }],
          details: candidates.slice(0, params.limit || 20)
        };
      }

      if (params.action === "list_dreams") {
        const dreams = await listDreams(storeRoot, {
          sessionKey: ctx.sessionKey,
          limit: params.limit || 20
        });
        return {
          content: [{ type: "text", text: dreams.length ? dreams.map((dream) => `- ${dream.id} [${dream.trigger}] ${dream.summary}`).join("\n") : "No dreams found." }],
          details: dreams
        };
      }

      if (params.action === "get_dream") {
        const dream = await getDream(storeRoot, params.dreamId);
        return {
          content: [{ type: "text", text: formatDream(dream) }],
          details: dream
        };
      }

      const dream = await distillMemory(storeRoot, {
        pluginConfig: api.pluginConfig,
        config,
        sessionKey: ctx.sessionKey,
        taskId: params.taskId,
        recentDays: params.recentDays,
        minScore: params.minScore,
        limit: params.limit,
        trigger: "manual"
      });
      return {
        content: [{ type: "text", text: formatDream(dream) }],
        details: dream
      };
    }
  };
}
