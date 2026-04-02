# openclaw-control-plane

Control-plane extensions for OpenClaw.

`openclaw-control-plane` adds structured task state, review/triage surfaces, planning contracts, handoff packets, drift supervision, and local-first memory distillation without patching OpenClaw core.

## Why this exists

OpenClaw is powerful, but long-running work can still decay into:

- transcript archaeology
- implicit task state
- vague validation claims
- weak handoffs after reset/compaction
- memory that grows noisier instead of better

This plugin adds a **control plane** around that work so execution becomes more structured, reviewable, and recoverable.

## What it provides

### Structured execution state
- `task_ledger` — explicit task state with objective, constraints, current step, next action, blockers, done criteria, evidence, and checkpoints
- `plan_mode` — bounded execution contracts and session-scoped plan guidance

### Context and handoff quality
- `context_packer` — deterministic context shaping by precedence, freshness, and budget
- `handoff_pack` — compact resume, worker, review, and status packets

### Review and proof surfaces
- `worker_result` — structured worker output contract
- `validation_bundle` — proof-tier validation artifact contract
- `review_queue` — task/review attention surface for blocked, stale, and follow-up work

### Supervision and memory distillation
- `drift_monitor` — rule-based detection of stale work, repeated blockers, missing evidence, and reset/compaction pressure
- `memory_distiller` — local-first AutoDream-style candidate capture and dream rollups

### Lifecycle automation
The plugin also registers hooks that help retain structure across session boundaries:

- `before_reset`
- `before_compaction`
- `after_compaction`
- `agent_end`
- `after_tool_call`
- `before_prompt_build`

## Design goals

- **OpenClaw-native**: use plugin/tool/hook surfaces instead of core patches
- **Deterministic first**: prefer explicit schemas and rules over opaque magic
- **Local-first**: avoid hidden cloud coupling where possible
- **Reviewable**: keep artifacts inspectable and easy to audit
- **Portable**: do not assume the same machine, filesystem, or memory stack as the original development environment
- **Upstreamable**: keep boundaries clear so durable abstractions can be proposed upstream later

## Compatibility

- Plugin format: `openclaw`
- Package type: ESM
- Declared dependency floor: `openclaw ^2026.3.24`

Recommended:

- use a recent stable OpenClaw release
- verify plugin load with `openclaw plugins inspect openclaw-control-plane`
- restart Gateway after install/update if your environment does not hot-reload plugin hooks and tools

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

### 4. Verify installation

```bash
openclaw plugins inspect openclaw-control-plane
```

If needed, restart Gateway after installation or update.

## Configuration

The plugin works with defaults, but most users should add an explicit config block.

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
      },
      "autoMemoryEnabled": true,
      "autoDreamEnabled": false,
      "memoryDistiller": {
        "candidateRetentionDays": 30,
        "minScore": 35,
        "distillLimit": 8,
        "autoDreamOnCompaction": true
      }
    }
  }
}
```

## Quick start

A useful first flow looks like this:

1. Create a task with `task_ledger`
2. Update/checkpoint it during real work
3. Use `review_queue` to see what needs attention
4. Use `plan_mode` to turn that into a bounded contract
5. Use `handoff_pack` to produce a resume/worker/review packet
6. Use `drift_monitor` to catch rot early
7. Use `memory_distiller` to capture and distill durable memory candidates

## Tool reference

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

### `memory_distiller`
Actions:
- `capture`
- `list_candidates`
- `distill`
- `list_dreams`
- `get_dream`

## How the plugin is structured

### State layer
- `task_ledger`
- task store
- checkpoints
- evidence

### Control and review layer
- `review_queue`
- `plan_mode`
- `handoff_pack`
- `drift_monitor`

### Artifact layer
- `worker_result`
- `validation_bundle`

### Context and memory layer
- `context_packer`
- `memory_distiller`

### Automation layer
- reset/compaction/agent-end hooks
- optional review reminders
- optional auto-memory capture and auto-dream distillation

## Portability notes

This plugin is designed for different OpenClaw setups, not only the original development environment.

That means:

- `storeDir` can be relative or absolute
- defaults are intentionally conservative
- automatic memory distillation is opt-in at the dream stage by default
- nothing here assumes a specific host OS or filesystem layout
- nothing here requires the same memory stack used in the original environment

If your environment differs, the main things you may want to tune are:

- stale thresholds
- review reminder behavior
- plan-mode prompt injection
- state storage location
- auto-memory / auto-dream behavior

## Repository map

- `index.js` — plugin entrypoint
- `src/` — tool and hook implementations
- `test/` — node test suite
- `openclaw.plugin.json` — plugin manifest and config schema
- `SOURCE_GROUNDING.md` — public claw-code source map used for this plugin
- `ROADMAP.md` — capability roadmap and validation focus
- `BUILD_SYSTEM.md` — development operating model for continued work
- `PUBLIC_REPO_SAFETY.md` — public distribution and hygiene rules

## Source grounding

This project is **inspired by and adapted from** the public `ultraworkers/claw-code` source.
It is not a literal one-to-one port.

See `SOURCE_GROUNDING.md` for the exact public command/tool/subsystem surfaces that informed each capability area.

## Safety and public distribution

Before publishing broadly or proposing upstream changes, review:

- `PUBLIC_REPO_SAFETY.md`
- `SOURCE_GROUNDING.md`
- `ROADMAP.md`

Those documents are part of the product, not side notes.

## Roadmap and upstreaming

The current focus is no longer “add more surfaces at any cost.”
The important next step is proving real-session usefulness, tightening any bureaucratic rough edges, and identifying which abstractions are truly worth upstreaming.

See `ROADMAP.md` for the current validation and product direction.

## Development

```bash
npm test
npm run benchmark
```

After changes, reinstall/sync the plugin into OpenClaw and verify load with:

```bash
openclaw plugins inspect openclaw-control-plane
```

`npm run benchmark` runs a synthetic regression benchmark over the main capability areas. It is intended for change tracking and tuning, not for absolute performance claims.
