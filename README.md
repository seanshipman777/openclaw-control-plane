# openclaw-control-plane

Task-ledger-first control-plane extensions for safe OpenClaw upgrades.

## Status

Current implemented phases:

- Phase 1 — task ledger
- Phase 2 — context packer
- Phase 3 — worker result contract
- Phase 4 — validation bundle
- Phase 5 — automation hooks
- Phase 6 — review queue
- Phase 7 — plan mode + delegation planner
- Phase 8 — handoff composer
- Phase 9 — drift monitor

This repo is usable now as a standalone OpenClaw plugin, but it is still an actively evolving control-plane wave rather than a frozen stable release.

## Compatibility

- OpenClaw plugin format: `openclaw`
- Package type: ESM
- Declared dependency floor: `openclaw ^2026.3.24`

Recommended:

- run on a recent stable OpenClaw release with plugin hooks enabled
- verify plugin load with `openclaw plugins inspect openclaw-control-plane`
- restart Gateway after install/update so hooks and tools reload cleanly

## What this plugin adds

Tools:

- `task_ledger`
- `context_packer`
- `worker_result`
- `validation_bundle`
- `review_queue`
- `plan_mode`
- `handoff_pack`
- `drift_monitor`

Hooks:

- `before_reset`
- `before_compaction`
- `agent_end`
- `before_prompt_build`

## Why another plugin instead of patching core?

Because the right first move is **not** to patch OpenClaw core directly.

The safer path is:

1. build the highest-leverage feature in an isolated repo
2. validate it in live use without destabilizing the Gateway
3. upstream only the pieces that prove durable and broadly useful

That keeps us fast without turning the main runtime into an experiment.

## Installation

### 1. Clone the repository

```bash
git clone https://github.com/seanshipman777/openclaw-control-plane.git
cd openclaw-control-plane
```

### 2. Install dependencies

```bash
npm install
```

### 3. Install into OpenClaw

```bash
openclaw plugins install /absolute/path/to/openclaw-control-plane
```

Inspect the plugin:

```bash
openclaw plugins inspect openclaw-control-plane
```

If your environment does not hot-reload plugin hooks/tools, restart Gateway after install/update.

## Minimal configuration

This plugin works with defaults, but most users will want an explicit config block.

Example:

```json
{
  "plugins": {
    "openclaw-control-plane": {
      "storeDir": ".openclaw-control-plane",
      "automation": {
        "enabled": true,
        "checkpointOnReset": true,
        "checkpointOnCompaction": true,
        "checkpointOnFailure": true,
        "checkpointOnLongRun": true,
        "longRunMs": 120000,
        "reviewReminders": {
          "enabled": true
        }
      },
      "reviewQueue": {
        "activeStaleAfterMs": 86400000,
        "blockedStaleAfterMs": 21600000
      },
      "planMode": {
        "enabled": true,
        "planningOnlyDefault": true,
        "injectPromptContext": true
      },
      "handoffPack": {
        "defaultEvidenceLimit": 3,
        "defaultCheckpointLimit": 3,
        "defaultStepLimit": 5
      },
      "driftMonitor": {
        "activeStaleAfterMs": 172800000,
        "blockedStaleAfterMs": 43200000,
        "missingEvidenceAfterMs": 14400000
      }
    }
  }
}
```

## Environment notes

This plugin is designed to be portable across different OpenClaw setups.

That means:

- `storeDir` can be relative to the active workspace or absolute
- defaults are meant to be safe, not aggressively opinionated
- automation is structured to help both single-agent and multi-lane setups
- nothing here assumes the same host OS, filesystem layout, or memory stack as the original development environment

If your setup differs from ours, the main things you may want to tune are:

- stale thresholds
- review reminder behavior
- plan-mode prompt injection
- state storage location

## Quick start

After install, a useful first sequence is:

```text
1. create a task with task_ledger
2. update/checkpoint it during real work
3. use review_queue to see what needs attention
4. use plan_mode to turn that into a bounded contract
5. use handoff_pack to produce a worker/resume/review packet
6. use drift_monitor to detect rot before it spreads
```

## Phase 1: task ledger plugin

The first feature is a native OpenClaw plugin that adds a `task_ledger` tool.

It gives the agent an explicit short-horizon control plane:

- objective
- constraints
- current step
- next action
- blockers
- done criteria
- evidence
- checkpoints

This is the fastest way to improve resumability and reduce transcript sludge.

## Phase 2: context packer

The next feature is a native OpenClaw tool that deterministically packs context.

It focuses on four things:

- source precedence
- dedupe
- stale-context filtering
- strict budget enforcement

Grounding from claw-code source:

- `rust/crates/runtime/src/compact.rs` shows the runtime cares about disciplined context compaction and preserving useful recent state
- archived subsystem hints (`memdir/memoryAge.ts`, `memdir/memoryScan.ts`) suggest memory freshness/age scoring is part of the intended architecture

This is intentionally **not** a cloud-memory feature and **not** a vendor-specific summarizer.
It is a control-plane utility that makes the existing memory stack cheaper and cleaner to use.

## Phase 3: worker result contract

The third feature makes worker outputs structured by default.

It captures:

- normalized status
- summary + details
- files touched
- blockers
- evidence bundle entries
- validation summary linkage
- risks
- next steps
- review/handoff flags

The point is simple: CEO should not have to reconstruct truth from a long worker transcript when a bounded run finishes.

## Phase 4: validation bundle

The fourth feature turns validation into a first-class artifact.

It captures:

- proof tier (`1|2|3`)
- outcome (`pass|partial|fail|blocked`)
- before artifacts
- after artifacts
- explicit checks
- unresolved risks
- optional component scores

This is how we stop vague success claims and make reviewer handoffs fast.

## Phase 5: automation hooks

The fifth feature makes the control plane react to lifecycle boundaries automatically.

It adds:

- auto-checkpoints before reset/new
- auto-checkpoints before compaction
- auto-checkpoints after failed or long agent runs
- optional review reminders attached to tasks when worker results or validation bundles imply follow-up

Grounding from claw-code source:

- `rust/crates/runtime/src/hooks.rs` confirms a hook-pipeline architecture is a core pattern
- `rust/crates/tools/src/lib.rs` exposes source-surface settings including `fileCheckpointingEnabled`, `autoCompactEnabled`, `autoMemoryEnabled`, and `autoDreamEnabled`

This is intentionally conservative: capture handoff state at the moments where context is most likely to get lost.

## Phase 6: review queue

The sixth feature makes review and follow-up queryable instead of implicit.

It provides:

- attention ranking across tasks
- blocked/stale views
- review-reminder visibility
- unresolved-risk surfacing
- task-level inspection for operator triage

Grounding from claw-code source:

- `commands/tasks/*` and `TaskListTool` / `TaskGetTool` / `TaskOutputTool` / `TaskStopTool`
- `commands/review*`

This is the layer that answers: **what needs attention right now?**

## Phase 7: plan mode + delegation planner

The seventh feature turns triage into a bounded execution contract.

It provides:

- plan contracts with objective, constraints, acceptance criteria, proof tier, route, and stop conditions
- default step scaffolds for bounded execution
- session-scoped plan mode activation
- prompt guidance while plan mode is active until explicitly exited

Grounding from claw-code source:

- `commands/plan/*`
- `EnterPlanModeTool`
- `ExitPlanModeV2Tool`
- `planAgent`

This is the layer that answers: **what is the clean bounded plan to execute next?**

## Phase 8: handoff composer

The eighth feature turns structured state into compact packets for execution and recovery.

It provides:

- resume packs for continuing after reset/compaction
- worker brief packs for bounded delegation
- review packs for reviewer/validator lanes
- status packs for concise human updates

Grounding from claw-code source:

- `agentMemory`
- `agentMemorySnapshot`
- `resumeAgent`
- `runAgent`
- `forkSubagent`
- `spawnMultiAgent`
- `TaskOutputTool`
- `assistant/sessionHistory.ts`

This is the layer that answers: **what exact packet should I hand off to continue or delegate this work cleanly?**

## Phase 9: drift monitor

The ninth feature detects operational rot before it becomes transcript archaeology.

It provides:

- stale-task detection
- repeated-blocker detection
- missing-evidence detection
- reset/compaction pressure detection

Grounding from claw-code source:

- `rust/crates/runtime/src/compact.rs`
- `commands/compact/*`
- `commands/tasks/*`
- `commands/review*`
- `memdir/memoryAge.ts`
- `memdir/memoryScan.ts`

This is the layer that answers: **where is work quietly rotting and likely to drift further?**

## Why this is the best first slice

- **High leverage**: it improves planning, delegation, recovery, and review.
- **Low risk**: it lives outside OpenClaw core.
- **Easy to integrate**: plugin install, enable, test, keep or remove.
- **Easy to upstream**: the feature boundary is clear.

## Build system

This repo also ships with a build-system doctrine:

- `BUILD_SYSTEM.md` — recommended team/lane setup for continuing development
- `PUBLIC_REPO_SAFETY.md` — public-distribution safety rules and hygiene checks

These exist so future feature work stays:

- source-grounded
- public-safe
- bounded and testable
- consistent across phases

## Current repo contents

- `index.js` — plugin entrypoint
- `src/task-store.js` — file-backed task ledger store
- `src/task-ledger-tool.js` — OpenClaw tool surface
- `src/context-packer.js` — deterministic context packing engine
- `src/context-packer-tool.js` — OpenClaw tool surface for packed prompt blocks
- `src/worker-result.js` — worker handoff contract normalizer/validator
- `src/worker-result-tool.js` — OpenClaw tool surface for structured worker outputs
- `src/validation-bundle.js` — proof-tier validation bundle normalizer/validator
- `src/validation-bundle-tool.js` — OpenClaw tool surface for reviewer-readable validation artifacts
- `src/control-plane-automation.js` — lifecycle automation hooks and review reminder helpers
- `src/review-queue.js` — source-grounded attention/risk/staleness scoring over task state
- `src/review-queue-tool.js` — review queue query surface for summary/list/get
- `src/plan-mode.js` — plan contracts, session-scoped plan mode, and prompt guidance hooks
- `src/plan-mode-tool.js` — build/enter/status/exit plan mode surface
- `src/handoff-pack.js` — compact resume/worker/review/status packet composer
- `src/handoff-pack-tool.js` — handoff pack build surface
- `src/drift-monitor.js` — deterministic drift detection over task and checkpoint state
- `src/drift-monitor-tool.js` — summary/list/get drift monitor surface
- `test/task-store.test.js` — store-level tests
- `test/context-packer.test.js` — context packing tests
- `test/worker-result.test.js` — worker result contract tests
- `test/validation-bundle.test.js` — validation bundle tests
- `test/control-plane-automation.test.js` — lifecycle automation tests
- `test/review-queue.test.js` — review queue scoring and filtering tests
- `test/plan-mode.test.js` — plan contract and session plan-mode tests
- `test/handoff-pack.test.js` — resume/worker/review pack composition tests
- `test/drift-monitor.test.js` — drift signal and pressure detection tests
- `openclaw.plugin.json` — plugin manifest

## Task tool actions

- `create`
- `get`
- `list`
- `update`
- `checkpoint`
- `add_evidence`
- `close`

## Tool cheat sheet

### `task_ledger`
Actions:

- `create`
- `get`
- `list`
- `update`
- `checkpoint`
- `add_evidence`
- `close`

### `context_packer`
Purpose:

- rank context by precedence
- dedupe overlaps
- drop stale context
- enforce prompt budgets

### `worker_result`
Purpose:

- normalize worker outcomes into a versioned schema
- capture blockers, evidence, validation linkage, risks, and next steps

### `validation_bundle`
Purpose:

- normalize proof-tier validation artifacts and unresolved risks

### `review_queue`
Actions:

- `summary`
- `list`
- `get`

### `plan_mode`
Actions:

- `build`
- `enter`
- `status`
- `exit`

### `handoff_pack`
Modes:

- `resume`
- `worker`
- `review`
- `status`

### `drift_monitor`
Actions:

- `summary`
- `list`
- `get`

## Context packer behavior

- keeps higher-precedence context over lower-precedence duplicates
- drops stale items by default when version/hash drift is supplied
- enforces overall and per-item character budgets
- returns both packed text and structured drop reasons/details

## Worker result behavior

- normalizes worker outcomes into a versioned schema
- validates required fields like summary/status
- structures evidence instead of burying it in prose
- carries blockers, risks, and next steps explicitly
- marks review/handoff needs without a second tool

## Validation bundle behavior

- normalizes validation proof into a versioned schema
- makes proof tier explicit instead of implied
- separates before/after artifacts cleanly
- captures check outcomes and unresolved risks in reviewable form
- optionally carries component scores for reviewer grading

## Automation hook behavior

- checkpoints active/blocked tasks before reset or compaction
- checkpoints tasks after failed runs or long runs
- dedupes repeated automatic checkpoints in a short window
- can attach review reminders to task history when structured outputs indicate follow-up

## Review queue behavior

- ranks attention using blocked/review/risk/staleness signals
- exposes summary/list/get query modes
- stays deterministic and rule-based rather than heuristic mush
- defaults to session-scoped triage so one lane does not spam another

## Plan mode behavior

- builds structured bounded execution contracts from task or direct inputs
- stores active plan mode per session
- injects plan guidance into future prompt builds while active
- defaults to planning-only mode unless explicitly relaxed

## Handoff pack behavior

- composes resume, worker, review, and status packs from task + plan + review state
- keeps packets compact and mode-specific instead of dumping raw task files
- resolves the current session task automatically when possible
- is designed for reuse by future delegation/resume flows

## Drift monitor behavior

- detects stale work using explicit age thresholds
- flags repeated blockage through checkpoint history
- flags missing evidence once work is old enough to expect proof
- flags reset/compaction pressure from automatic handoff history

## Upstream strategy

Do **not** upstream immediately.

Upstream after all three are true:

1. the tool proves useful in real sessions
2. the schema feels stable
3. the value is general to other OpenClaw users

If that happens, there are two likely paths:

- keep it as a standalone plugin and publish it cleanly
- upstream the core abstractions later if OpenClaw should own them natively

## Public safety and source fidelity

Before publishing or upstreaming, review:

- `PUBLIC_REPO_SAFETY.md`
- `SOURCE_GROUNDING.md`
- `BUILD_SYSTEM.md`

Those documents are part of the product, not side notes.

## Near-term roadmap

### Wave 1 — control-plane spine

1. task ledger plugin
2. context pack builder
3. worker result contract
4. validation bundle format
5. hook-driven checkpoint automation

### Wave 2 — control-plane leverage

6. review queue / attention inbox
7. handoff composer
8. delegation planner
9. drift monitor

The first five phases create the control-plane substrate.
The next phases exploit that substrate so the agent can actually query, route, and supervise work more intelligently.
