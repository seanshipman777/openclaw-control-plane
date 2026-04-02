# openclaw-control-plane

Task-ledger-first control-plane extensions for safe OpenClaw upgrades.

## Why this exists

The right first move is **not** to patch OpenClaw core directly.

The safer path is:

1. build the highest-leverage feature in an isolated repo
2. validate it in live use without destabilizing the Gateway
3. upstream only the pieces that prove durable and broadly useful

That keeps us fast without turning the main runtime into an experiment.

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

## Why this is the best first slice

- **High leverage**: it improves planning, delegation, recovery, and review.
- **Low risk**: it lives outside OpenClaw core.
- **Easy to integrate**: plugin install, enable, test, keep or remove.
- **Easy to upstream**: the feature boundary is clear.

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
- `test/task-store.test.js` — store-level tests
- `test/context-packer.test.js` — context packing tests
- `test/worker-result.test.js` — worker result contract tests
- `test/validation-bundle.test.js` — validation bundle tests
- `test/control-plane-automation.test.js` — lifecycle automation tests
- `test/review-queue.test.js` — review queue scoring and filtering tests
- `test/plan-mode.test.js` — plan contract and session plan-mode tests
- `test/handoff-pack.test.js` — resume/worker/review pack composition tests
- `openclaw.plugin.json` — plugin manifest

## Install later for live testing

```bash
npm install
openclaw plugins install /absolute/path/to/openclaw-control-plane
```

Then enable it in config if needed and verify the `task_ledger` tool appears.

## Task tool actions

- `create`
- `get`
- `list`
- `update`
- `checkpoint`
- `add_evidence`
- `close`

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

## Upstream strategy

Do **not** upstream immediately.

Upstream after all three are true:

1. the tool proves useful in real sessions
2. the schema feels stable
3. the value is general to other OpenClaw users

If that happens, there are two likely paths:

- keep it as a standalone plugin and publish it cleanly
- upstream the core abstractions later if OpenClaw should own them natively

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
