# Source Grounding Notes

This plugin is **inspired by and adapted from** the public `ultraworkers/claw-code` source.
It is not a literal one-to-one port.

## Grounding policy

- Port directly when the public implementation is clear.
- Adapt carefully when the public source exposes a concept/config surface but not the full runtime path.
- Say so plainly when something is an extrapolation rather than a direct port.
- Do not claim parity beyond what the public source actually shows.

## Capability map

### Task and workflow surfaces
Public anchors:
- `PARITY.md`
- task-related tool and command surfaces in the archived snapshots

Used to ground:
- `task_ledger`
- `worker_result`
- `validation_bundle`

Why it matters:
These surfaces justify explicit structured control-plane state instead of leaving work buried in transcripts.

### Context compaction and memory freshness
Public anchors:
- `rust/crates/runtime/src/compact.rs`
- `memdir/findRelevantMemories.ts`
- `memdir/memoryAge.ts`
- `memdir/memoryScan.ts`
- `services/SessionMemory/sessionMemory.ts`

Used to ground:
- `context_packer`
- freshness/age-based context filtering

Why it matters:
The public source clearly treats context compaction and memory freshness as first-class concerns.

### Hook pipeline and checkpointing
Public anchors:
- `rust/crates/runtime/src/hooks.rs`
- `rust/crates/tools/src/lib.rs`

Relevant surfaced settings:
- `autoCompactEnabled`
- `autoMemoryEnabled`
- `autoDreamEnabled`
- `fileCheckpointingEnabled`

Used to ground:
- lifecycle automation
- checkpoint hooks
- review-reminder automation

Why it matters:
These source surfaces justify implementing control-plane behavior through plugin hooks rather than ad hoc side channels.

### Review and task attention
Public anchors:
- `commands_snapshot.json` entries for `review` and `tasks`
- `tools_snapshot.json` entries including:
  - `TaskCreateTool`
  - `TaskGetTool`
  - `TaskListTool`
  - `TaskOutputTool`
  - `TaskStopTool`
  - `TaskUpdateTool`

Used to ground:
- `review_queue`

Why it matters:
This is the source basis for a task/review attention surface instead of a made-up dashboard.

### Planning and bounded delegation
Public anchors:
- `commands_snapshot.json` entries for `plan` and `ultraplan`
- `tools_snapshot.json` entries including:
  - `EnterPlanModeTool`
  - `ExitPlanModeV2Tool`
  - `planAgent`

Used to ground:
- `plan_mode`
- bounded execution contracts

Why it matters:
These surfaces justify treating planning as a first-class operating mode rather than an informal prompt convention.

### Agent memory, resume, and execution packets
Public anchors:
- `tools_snapshot.json` entries including:
  - `agentMemory`
  - `agentMemorySnapshot`
  - `resumeAgent`
  - `runAgent`
  - `forkSubagent`
  - `spawnMultiAgent`
  - `TaskOutputTool`
- `subsystems/assistant.json` references `assistant/sessionHistory.ts`

Used to ground:
- `handoff_pack`

Why it matters:
These surfaces justify compact execution/recovery packets instead of relying on transcript replay alone.

### Drift and operational rot signals
Public anchors:
- `rust/crates/runtime/src/compact.rs`
- `commands_snapshot.json` entries for `compact`, `review`, and `tasks`
- `memdir/memoryAge.ts`
- `memdir/memoryScan.ts`

Used to ground:
- `drift_monitor`

Why it matters:
These surfaces justify a rule-based supervision layer over age, blockage, and compaction/reset pressure.

### AutoDream and session-memory distillation
Public anchors:
- `rust/crates/tools/src/lib.rs` surfaced settings:
  - `autoMemoryEnabled`
  - `autoDreamEnabled`
- archived subsystem references:
  - `memdir/findRelevantMemories.ts`
  - `memdir/memoryAge.ts`
  - `memdir/memoryScan.ts`
  - `services/SessionMemory/sessionMemory.ts`
  - `services/SessionMemory/sessionMemoryUtils.ts`

Used to ground:
- `memory_distiller`

Why it matters:
These surfaces justify a local-first structured memory distillation layer instead of a second opaque memory system.

## Interpretation rule

If a feature in this plugin is:

- **directly implemented from a clear public surface** → say so
- **adapted from adjacent public signals** → say so
- **our own extension beyond the source** → say so

That distinction matters for both technical honesty and future upstream discussions.
