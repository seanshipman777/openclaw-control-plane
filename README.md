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

## Why this is the best first slice

- **High leverage**: it improves planning, delegation, recovery, and review.
- **Low risk**: it lives outside OpenClaw core.
- **Easy to integrate**: plugin install, enable, test, keep or remove.
- **Easy to upstream**: the feature boundary is clear.

## Current repo contents

- `index.js` — plugin entrypoint
- `src/task-store.js` — file-backed task ledger store
- `src/task-ledger-tool.js` — OpenClaw tool surface
- `test/task-store.test.js` — store-level tests
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

1. task ledger plugin
2. context pack builder
3. worker result contract
4. validation bundle format
5. hook-driven checkpoint automation
