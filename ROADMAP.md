# Roadmap

## Principle

Ship the smallest high-leverage slice first. Keep OpenClaw core untouched until the extension earns its way in.

## Build doctrine

The repo-level operating setup for continued development lives in:

- `BUILD_SYSTEM.md`
- `PUBLIC_REPO_SAFETY.md`

These documents are part of the build system, not optional notes.

## Phase 1 — task ledger

Goal: structured short-horizon state.

- [x] standalone repo
- [x] plugin manifest + entrypoint
- [x] file-backed task store
- [x] `task_ledger` tool
- [x] store-level tests
- [ ] live OpenClaw install test
- [ ] real-session usability pass

## Phase 2 — context packer

Goal: load less, know more.

- [x] context source precedence
- [x] file dedupe
- [x] budget enforcement
- [x] stale-context detection
- [ ] live OpenClaw install test
- [ ] real-session usability pass

## Phase 3 — worker contract

Goal: cleaner delegation and review.

- [x] standard result schema
- [x] evidence bundle schema
- [x] risk + next-step fields
- [ ] live OpenClaw install test
- [ ] real-session usability pass

## Phase 4 — validation bundle

Goal: stop vague success claims.

- [x] proof tier model
- [x] structured before/after artifacts
- [x] unresolved-risk section
- [ ] live OpenClaw install test
- [ ] real-session usability pass

## Phase 5 — automation hooks

Goal: checkpoint without nagging.

- [x] automatic task checkpoint hooks
- [x] session reset handoff hooks
- [x] optional review reminders
- [ ] live OpenClaw install test
- [ ] real-session usability pass

## Wave 1 exit criteria

The original five phases are the **control-plane spine**.

Before any upstream attempt, prove all of this in real use:

- [ ] task-ledger usage across multiple real tasks
- [ ] compaction/reset handoffs actually reduce drift
- [ ] worker/result/validation schemas survive several review cycles unchanged
- [ ] automation hooks help more than they annoy

## Phase 6 — review queue

Goal: make follow-up visible.

- [x] pending-review query surface
- [x] unresolved-risk rollup
- [x] blocked/stale task views
- [x] “what needs attention now?” summary
- [ ] live OpenClaw install test
- [ ] real-session usability pass

## Phase 7 — plan mode + delegation planner

Goal: turn triage into bounded execution contracts.

- [x] task → plan contract generator
- [x] acceptance criteria wiring
- [x] proof-tier expectation wiring
- [x] expected output schema wiring
- [x] session-scoped plan mode enter/exit
- [ ] live OpenClaw install test
- [ ] real-session usability pass

## Phase 8 — handoff composer

Goal: generate compact, reusable handoff packets.

- [x] session-resume pack
- [x] subagent brief pack
- [x] human-readable status pack
- [x] lane-specific context shaping
- [ ] live OpenClaw install test
- [ ] real-session usability pass

## Phase 9 — drift monitor

Goal: detect operational rot early.

- [x] stale-task detection
- [x] repeated-blocker detection
- [x] missing-evidence detection
- [x] reset/compaction pressure signals
- [ ] live OpenClaw install test
- [ ] real-session usability pass

## Phase 10 — AutoDream / memory distiller

Goal: distill durable memory from structured artifacts without building a second opaque memory system.

- [x] structured memory candidate capture
- [x] candidate scoring + durability classification
- [x] dream rollup generation
- [x] compaction-triggered auto-dream hook
- [ ] live OpenClaw install test
- [ ] real-session usability pass

## Recommended next move

If building continues immediately after Phase 10, do a **wave-2/wave-3 usability pass** before adding more feature surfaces.

Reason: the control plane now has enough structure that the biggest remaining risk is not missing features — it is proving the current abstractions in real use and tightening anything that feels bureaucratic or leaky.
