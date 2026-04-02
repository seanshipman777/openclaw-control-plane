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
