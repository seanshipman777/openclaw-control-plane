import test from "node:test";
import assert from "node:assert/strict";

import { packContext } from "../src/context-packer.js";

test("packContext keeps higher-precedence context and drops duplicates", () => {
  const result = packContext({
    maxChars: 4000,
    items: [
      {
        id: "memory-1",
        sourceType: "memory",
        title: "Memory copy",
        text: "Use the stable deployment lane.",
        priority: 1
      },
      {
        id: "user-1",
        sourceType: "user",
        title: "Fresh instruction",
        text: "Use the stable deployment lane.",
        priority: 1
      }
    ]
  });

  assert.equal(result.selected.length, 1);
  assert.equal(result.selected[0].id, "user-1");
  assert.equal(result.dropped.length, 1);
  assert.equal(result.dropped[0].id, "memory-1");
  assert.equal(result.dropped[0].reason, "duplicate");
});

test("packContext drops stale context by default", () => {
  const result = packContext({
    items: [
      {
        id: "file-old",
        sourceType: "file",
        source: "notes.md",
        text: "Old copy",
        version: "abc",
        currentVersion: "def"
      },
      {
        id: "task-live",
        sourceType: "task",
        text: "Current task objective"
      }
    ]
  });

  assert.equal(result.selected.length, 1);
  assert.equal(result.selected[0].id, "task-live");
  assert.equal(result.dropped[0].id, "file-old");
  assert.equal(result.dropped[0].reason, "version_mismatch");
});

test("packContext can drop context by age threshold", () => {
  const old = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  const fresh = new Date(Date.now() - 30 * 1000).toISOString();

  const result = packContext({
    staleAfterMs: 60 * 1000,
    items: [
      {
        id: "memory-old",
        sourceType: "memory",
        updatedAt: old,
        text: "Old memory snapshot"
      },
      {
        id: "memory-fresh",
        sourceType: "memory",
        updatedAt: fresh,
        text: "Fresh memory snapshot"
      }
    ]
  });

  assert.equal(result.selected.length, 1);
  assert.equal(result.selected[0].id, "memory-fresh");
  assert.equal(result.dropped[0].id, "memory-old");
  assert.equal(result.dropped[0].reason, "age_limit");
});

test("packContext enforces char budgets and truncates the first block when needed", () => {
  const result = packContext({
    maxChars: 500,
    maxItemChars: 450,
    items: [
      {
        id: "user-1",
        sourceType: "user",
        title: "Primary",
        text: "A".repeat(600)
      },
      {
        id: "memory-1",
        sourceType: "memory",
        text: "B".repeat(120)
      }
    ]
  });

  assert.equal(result.selected.length, 1);
  assert.equal(result.selected[0].id, "user-1");
  assert.equal(result.selected[0].truncated, true);
  assert.equal(result.dropped.some((item) => item.id === "memory-1"), true);
  assert.equal(result.stats.outputChars <= 500, true);
});
