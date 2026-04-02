import { packContext } from "./context-packer.js";

const CONTEXT_ITEM_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    id: { type: "string" },
    title: { type: "string" },
    source: { type: "string" },
    sourceType: {
      type: "string",
      enum: ["system", "user", "task", "file", "memory", "worker", "tool", "session", "other"]
    },
    text: { type: "string" },
    priority: { type: "number" },
    pinned: { type: "boolean" },
    updatedAt: { type: "string" },
    maxAgeMs: { type: "integer", minimum: 1 },
    stale: { type: "boolean" },
    version: { type: "string" },
    currentVersion: { type: "string" },
    hash: { type: "string" },
    currentHash: { type: "string" }
  },
  required: ["text"]
};

const CONTEXT_PACKER_PARAMETERS = {
  type: "object",
  additionalProperties: false,
  properties: {
    items: {
      type: "array",
      items: CONTEXT_ITEM_SCHEMA,
      minItems: 1,
      maxItems: 100,
      description: "Context candidates to sort, dedupe, and pack."
    },
    maxChars: {
      type: "integer",
      minimum: 500,
      maximum: 50000,
      description: "Maximum total output size in characters."
    },
    maxItems: {
      type: "integer",
      minimum: 1,
      maximum: 100,
      description: "Maximum number of selected blocks."
    },
    maxItemChars: {
      type: "integer",
      minimum: 100,
      maximum: 50000,
      description: "Maximum size per selected block before truncation."
    },
    includeStale: {
      type: "boolean",
      description: "Keep stale items instead of dropping them."
    },
    staleAfterMs: {
      type: "integer",
      minimum: 1,
      maximum: 31536000000,
      description: "Drop items older than this age when updatedAt is available. Source-grounded by claw-code's memoryAge/memoryScan architecture."
    },
    sourceOrder: {
      type: "array",
      items: {
        type: "string",
        enum: ["system", "user", "task", "file", "memory", "worker", "tool", "session", "other"]
      },
      description: "Optional precedence override. Earlier entries win."
    }
  },
  required: ["items"]
};

function renderSummary(result) {
  const lines = [
    "Context pack ready.",
    `- selected: ${result.stats.selectedItems}/${result.stats.inputItems}`,
    `- dropped: ${result.stats.droppedItems}`,
    `- chars: ${result.stats.outputChars}/${result.config.maxChars}`
  ];

  if (result.stats.truncatedItems) {
    lines.push(`- truncated_items: ${result.stats.truncatedItems}`);
  }

  if (result.dropped.length) {
    const reasons = result.dropped.reduce((acc, item) => {
      acc[item.reason] = (acc[item.reason] || 0) + 1;
      return acc;
    }, {});
    lines.push(`- drop_reasons: ${Object.entries(reasons).map(([key, count]) => `${key}=${count}`).join(" | ")}`);
  }

  if (result.text) {
    lines.push("", result.text);
  }

  return lines.join("\n");
}

export function createContextPackerTool(_api, _ctx) {
  return {
    name: "context_packer",
    label: "Context Packer",
    description: "Deterministically pack candidate context blocks by precedence, dedupe, freshness, and budget so prompts stay smaller and cleaner.",
    parameters: CONTEXT_PACKER_PARAMETERS,
    async execute(_id, params) {
      const result = packContext(params);
      return {
        content: [{ type: "text", text: renderSummary(result) }],
        details: result
      };
    }
  };
}
