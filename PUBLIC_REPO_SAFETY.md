# Public Repo Safety

This repository is intended to become safe for public distribution.

Treat every commit as if another OpenClaw user may read it, install it, and
assume the defaults are safe.

## Never commit

- secrets, tokens, cookies, auth traces, OAuth artifacts
- private URLs, internal-only endpoints, local tunnels, personal domains
- personal chat content or raw memory files
- local machine fingerprints unless intentionally generalized
- private session ids, sender ids, or environment-specific routing data
- examples that rely on hidden local assumptions

## Design rules

- defaults must be safe for strangers, not only for the current machine
- side-effecting behavior should be explicit and opt-in where possible
- local-first and deterministic beats clever hidden automation
- documentation must distinguish:
  - verified source grounding
  - adaptation choices
  - future ideas

## Before any public push

Run a hygiene pass for:

### 1. Secret scan
- API keys
- bearer tokens
- cookies
- `.env` leakage

### 2. Local-environment scan
- usernames
- private hostnames
- home-directory assumptions
- workspace-specific absolute paths that are not intentionally documented

### 3. Personal-context scan
- references that only make sense for James
- DM-specific workflow assumptions
- internal meeting/channel ids
- memory snippets that are not meant for publication

### 4. Product-safety scan
- can another user understand what this feature does?
- are the defaults safe?
- does it fail closed where it should?
- does the repo avoid overstating parity with claw-code?

## Documentation rule

Write docs for:

- an advanced OpenClaw user
- a plugin author
- a reviewer evaluating whether the feature should be upstreamed

Do **not** write docs as if the reader already knows the local environment.

## Source-fidelity rule

If a feature is:

- **directly supported** by public claw-code source → say so
- **adapted from source-adjacent signals** → say so
- **our own extrapolation** → say so

Do not blur the line.

## Release posture

Do not publish upstream or publicly until:

1. real-session usefulness is proven
2. schema is stable
3. docs are public-safe
4. local/private assumptions are removed or generalized
