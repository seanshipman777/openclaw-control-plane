# Roadmap

## Product direction

`openclaw-control-plane` is intended to be a practical control-plane plugin for OpenClaw:

- structured task state
- deterministic context shaping
- reviewable execution artifacts
- cleaner handoffs and session recovery
- operational supervision
- local-first memory distillation

The goal is not feature sprawl. The goal is durable leverage.

## Current capability areas

### Structured execution state
- [x] explicit task store
- [x] checkpoints
- [x] evidence capture
- [x] close/update/list flows

### Context shaping
- [x] source precedence
- [x] dedupe
- [x] stale-context detection
- [x] budget enforcement

### Structured execution artifacts
- [x] worker result contract
- [x] validation bundle contract
- [x] review reminder metadata

### Lifecycle automation
- [x] automatic checkpoints before reset
- [x] automatic checkpoints before compaction
- [x] automatic checkpoints after failed or long runs
- [x] optional review reminders

### Review and planning
- [x] review queue / attention inbox
- [x] bounded plan contracts
- [x] session-scoped plan mode

### Handoff and supervision
- [x] resume/worker/review/status handoff packs
- [x] drift detection for stale tasks, repeated blockers, missing evidence, and reset/compaction pressure

### Memory distillation
- [x] structured candidate capture
- [x] candidate scoring + durability classification
- [x] dream rollup generation
- [x] compaction-triggered auto-dream hook

## Validation still needed

The main risk now is not missing features.
The main risk is shipping abstractions that look good in code but feel bureaucratic in real use.

### Real-use validation checklist
- [ ] task state proves useful across multiple real tasks
- [ ] compaction/reset handoffs measurably reduce drift
- [ ] worker/result/validation schemas survive repeated review cycles unchanged
- [ ] review queue actually improves triage speed
- [ ] plan mode helps more than it constrains
- [ ] handoff packs get reused in live recovery/delegation
- [ ] drift monitor catches real rot without becoming noise
- [ ] memory distiller produces useful rollups instead of clutter

### Runtime validation checklist
- [ ] live install validation on recent stable OpenClaw
- [ ] compatibility check across more than one OpenClaw environment
- [ ] plugin load/reload behavior verified after upgrades
- [ ] hook behavior verified under reset and compaction pressure

## Near-term focus

### 1. Usability pass
Refine anything that feels too ceremony-heavy.

### 2. Benchmarking and evaluation
Measure:
- token savings from context shaping
- recovery quality after reset/compaction
- review speed with structured artifacts vs transcript-only review
- memory distillation quality and noise rate

### 3. Public hardening
Before broader adoption:
- tighten docs further if needed
- keep defaults safe for strangers
- verify no local-environment assumptions leak into product behavior

## Future exploration

These are interesting, but should come after the current capability set proves itself:

- richer review workflows
- stronger delegation lane support
- memory distillation writeback adapters
- candidate promotion approval flows
- eventual upstream proposals for the most durable abstractions

## Build and release doctrine

Repo-level development and publication rules live in:

- `BUILD_SYSTEM.md`
- `PUBLIC_REPO_SAFETY.md`
- `SOURCE_GROUNDING.md`

They are part of the product-development process, not optional notes.
