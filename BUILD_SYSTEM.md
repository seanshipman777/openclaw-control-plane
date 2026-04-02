# Build System

This file defines the **ideal operating setup** for continuing development of
`openclaw-control-plane`.

The goal is not to maximize agent count. The goal is to maximize:

- source fidelity
- implementation speed
- review quality
- public-repo safety
- bounded, recoverable execution

## Core principle

Prefer the **smallest disciplined team** that improves throughput without making
the build harder to supervise.

This project should not default to a swarm.

## Recommended build team

### 1) CEO / Control Plane Owner
Owns:
- phase selection
- source-grounding judgment
- final design calls
- merge/release decisions

Responsibilities:
- choose the next phase
- decide what is directly grounded vs adapted
- keep roadmap honest
- require public-safe defaults
- review final output before shipping

### 2) Source Grounder
Owns:
- public claw-code source archaeology
- parity checks
- source surface mapping

Responsibilities:
- identify the relevant commands/tools/subsystems in the public source
- separate **verified implementation** from **adjacent design hints**
- update `SOURCE_GROUNDING.md`
- flag when a proposed feature is drifting beyond the source material

### 3) Builder
Owns:
- implementation in `src/`
- tests
- plugin load verification

Responsibilities:
- build the smallest useful slice of the phase
- keep schemas deterministic
- keep defaults safe
- run tests
- verify plugin load after deployment

### 4) Reviewer / Safety Pass
Owns:
- public-repo hygiene
- end-user-safe defaults
- documentation clarity

Responsibilities:
- check docs/examples for leaked local assumptions
- scan for secrets, internal URLs, local usernames, session ids, machine-specific paths
- verify the feature is understandable to other OpenClaw users
- ensure no claim of parity exceeds the public source grounding

## Lane model

Use the following execution hierarchy.

### Lane A — direct CEO lane
Use when:
- work is serial
- source and implementation are tightly coupled
- user interruption is likely
- the task is still being shaped

This is the default.

### Lane B — persistent ACP session
Use when:
- a role will be reused across phases
- a long-lived implementation or review lane is helpful
- continuity matters more than one-shot speed

Best candidates:
- builder lane
- reviewer lane
- source-grounder lane

### Lane C — bounded subagent run
Use only when:
- the chunk is temporary
- clearly bounded
- easy to judge from artifacts
- interruption cost is low

Good use cases:
- source grep pass
- documentation scrub
- isolated test/refactor chunk

Avoid for:
- ambiguous multi-step product design
- sensitive external actions
- work where direct collaboration with CEO is the main value

## Recommended setup for this repo

### Minimal effective setup
- **CEO** stays direct
- **Builder** may become a persistent ACP lane if feature throughput increases
- **Source Grounder** can be a bounded subagent or persistent ACP lane depending on phase complexity
- **Reviewer** can be bounded for one-shot repo safety checks or persistent if releases become frequent

### Preferred future layout
- `ceo` → direct control plane
- `control-plane-builder` → persistent ACP session
- `control-plane-source-grounder` → persistent ACP session or bounded source pass lane
- `control-plane-reviewer` → persistent ACP session or bounded safety-review lane

## Phase workflow

Every phase should run through this sequence:

### 1. Source-grounding pass
- identify relevant claw-code public surfaces
- record them in `SOURCE_GROUNDING.md`
- declare what is direct vs adapted

### 2. Phase spec
- define the smallest useful feature slice
- state non-goals
- define schemas and behavior
- define safe defaults

### 3. Build
- implement in plugin source
- add tests
- keep outputs deterministic and inspectable

### 4. Local verification
- run test suite
- sync plugin into installed path
- restart gateway if needed
- inspect plugin load and registered tools/hooks

### 5. Review pass
- public-repo safety scan
- docs clarity scan
- source-fidelity scan

### 6. Commit
- use one phase-focused commit
- update README / ROADMAP / SOURCE_GROUNDING if needed

## Build-time decision policy

For each new feature ask:

1. **Is it grounded in claw-code public source?**
2. **Is it aligned with the control-plane mission?**
3. **Does it avoid duplicating an existing system?**
4. **Is the default safe for a public plugin user?**
5. **Can it be tested and reviewed from artifacts?**

If any answer is no, narrow the feature.

## What this build system should optimize for

- bounded phases over giant rewrites
- deterministic schemas over fuzzy magic
- local-first behavior over hidden cloud coupling
- reviewable outputs over transcript archaeology
- portability to other OpenClaw users over machine-specific cleverness

## Current recommendation

For ongoing development, keep:

- CEO in the direct lane by default
- add a **persistent builder lane** when the implementation stream gets more parallel
- use a **source-grounder lane** for archaeology-heavy phases like AutoDream
- require a **review/safety pass** before any public push
