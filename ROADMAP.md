# Roadmap

## Principle

Ship the smallest high-leverage slice first. Keep OpenClaw core untouched until the extension earns its way in.

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

- [ ] context source precedence
- [ ] file dedupe
- [ ] budget enforcement
- [ ] stale-context detection

## Phase 3 — worker contract

Goal: cleaner delegation and review.

- [ ] standard result schema
- [ ] evidence bundle schema
- [ ] risk + next-step fields

## Phase 4 — validation bundle

Goal: stop vague success claims.

- [ ] proof tier model
- [ ] structured before/after artifacts
- [ ] unresolved-risk section

## Phase 5 — automation hooks

Goal: checkpoint without nagging.

- [ ] automatic task checkpoint hooks
- [ ] session reset handoff hooks
- [ ] optional review reminders
