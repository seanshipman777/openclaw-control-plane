# Source Grounding Notes

This plugin wave is **inspired by and adapted from** the public `ultraworkers/claw-code` source.
It is not a literal one-to-one port.

## Verified public anchors used for phases 1–5

### Task / workflow surface
- `PARITY.md` documents missing TS `Task*` and review/workflow surfaces in the Rust port.
- This is the main grounding for `task_ledger`, `worker_result`, and `validation_bundle` as missing-but-useful control-plane structure.

### Context compaction + memory freshness
- `rust/crates/runtime/src/compact.rs` shows the runtime already treats context compaction as a first-class concern.
- Archived subsystem references expose:
  - `memdir/findRelevantMemories.ts`
  - `memdir/memoryAge.ts`
  - `memdir/memoryScan.ts`
  - `services/SessionMemory/sessionMemory.ts`
- This grounds `context_packer` as a deterministic, local-first context shaping utility rather than an invented memory stack.

### Hook pipeline + checkpointing
- `rust/crates/runtime/src/hooks.rs` shows a real hook runner and event pipeline.
- `rust/crates/tools/src/lib.rs` exposes config settings:
  - `autoCompactEnabled`
  - `autoMemoryEnabled`
  - `autoDreamEnabled`
  - `fileCheckpointingEnabled`
- This grounds lifecycle automation and checkpoint behavior as source-aligned concepts.

## Design stance

- Directly port when the public implementation is clear.
- Adapt carefully when the public source exposes the concept/config surface but not the full runtime path.
- Avoid claiming parity where the claw-code source only shows an intent or stub.

## Verified public anchors used for phase 6

### Review + tasks surfaces
- `src/reference_data/commands_snapshot.json` includes `review` and `tasks` commands.
- `src/reference_data/tools_snapshot.json` includes:
  - `TaskCreateTool`
  - `TaskGetTool`
  - `TaskListTool`
  - `TaskOutputTool`
  - `TaskStopTool`
- `TaskUpdateTool`
- This grounds `review_queue` as a task/review attention layer rather than a made-up dashboard.

## Verified public anchors used for phase 7

### Plan mode + planning surfaces
- `src/reference_data/commands_snapshot.json` includes `plan` and `ultraplan` commands.
- `src/reference_data/tools_snapshot.json` includes:
  - `EnterPlanModeTool`
  - `ExitPlanModeV2Tool`
- `planAgent`
- This grounds `plan_mode` as a planning and bounded-delegation layer rather than an invented workflow abstraction.

## Verified public anchors used for phase 8

### Agent memory + resume + task output surfaces
- `src/reference_data/tools_snapshot.json` includes:
  - `agentMemory`
  - `agentMemorySnapshot`
  - `resumeAgent`
  - `runAgent`
  - `forkSubagent`
  - `spawnMultiAgent`
  - `TaskOutputTool`
- `src/reference_data/subsystems/assistant.json` references `assistant/sessionHistory.ts`.
- This grounds `handoff_pack` as a compact execution/recovery packet layer rather than a made-up summary feature.
