---
summary: 'Set up a new project for Ralph: import infrastructure, specs, workstreams.'
read_when:
  - Setting up a new project for Ralph
  - Re-onboarding after major changes
---

# Project Onboarding

You are setting up a project for autonomous agent development using the Ralph methodology.

**Your job:** understand → spec → workstreams → configure.

## Protocol

- No code during onboarding. Structure only. Workers implement.
- Don't over-interview. Get enough to identify areas, move on.
- Specs are technical (code, schemas, tables). Not user stories.
- Every checklist task needs proof. No exceptions.
- Check existing code before speccing. Don't hallucinate what exists.
- If tech stack not specified, pick one early and state the assumption.

**Doc writing style:**
- **YAML front-matter required** on all docs (see Phase 3)
- Telegraphic for known patterns/commands. Prose for novel concepts.
- Lists over 2-column tables (token-optimized). Tables for 3+ columns.
- Code over descriptions. Inline negatives: "No X. Do Y instead."

---

## Phase 0: Import Ralph Infrastructure

Check if files exist. If missing, fetch from GitHub.

| File | Purpose |
|------|---------|
| `prompt.md` | Entry point for workers |
| `.ralph/ralph.sh` | Main loop script |
| `.ralph/stream-parser.sh` | Token tracking |
| `.ralph/rescue.md` | Rescue agent (auto-recovery) |
| `AGENTS.md` | Operational rules (customize) |
| `docs/conventions.md` | Signs and patterns |
| `docs/README.md` | Spec index |
| `docs/index.md` | Quick navigation |
| `docs/triage.md` | Troubleshooting |

**Source:** `https://raw.githubusercontent.com/gjkeller/ralph-expert/main/src/`

**If fetch fails (private repo):** Ask user for local ralph-expert clone path; copy from there.

**Import commands:**

```bash
# Create directories
mkdir -p .ralph docs instructions

# Fetch loop infrastructure
curl -fsSL "https://raw.githubusercontent.com/gjkeller/ralph-expert/main/src/.ralph/ralph.sh" -o .ralph/ralph.sh
curl -fsSL "https://raw.githubusercontent.com/gjkeller/ralph-expert/main/src/.ralph/stream-parser.sh" -o .ralph/stream-parser.sh
curl -fsSL "https://raw.githubusercontent.com/gjkeller/ralph-expert/main/src/.ralph/rescue.md" -o .ralph/rescue.md
chmod +x .ralph/ralph.sh .ralph/stream-parser.sh

# Fetch templates
curl -fsSL "https://raw.githubusercontent.com/gjkeller/ralph-expert/main/src/prompt.md" -o prompt.md
curl -fsSL "https://raw.githubusercontent.com/gjkeller/ralph-expert/main/src/AGENTS.md" -o AGENTS.md

# Fetch docs templates
curl -fsSL "https://raw.githubusercontent.com/gjkeller/ralph-expert/main/src/docs/conventions.md" -o docs/conventions.md
curl -fsSL "https://raw.githubusercontent.com/gjkeller/ralph-expert/main/src/docs/README.md" -o docs/README.md
curl -fsSL "https://raw.githubusercontent.com/gjkeller/ralph-expert/main/src/docs/index.md" -o docs/index.md
curl -fsSL "https://raw.githubusercontent.com/gjkeller/ralph-expert/main/src/docs/triage.md" -o docs/triage.md
```

Run these commands if files are missing, then continue.

---

## Phase 1: Understand the Project

Interview to understand what we're building. Infer when possible, ask when ambiguous.

**Essential (ask):**
1. What are we building? (one sentence)
2. Tech stack? (if not specified, pick one early and state assumption)
3. Greenfield or existing code?

**Explore as needed:**
4. Who uses it?
5. Key systems/areas?
6. Non-negotiables/constraints?
7. Out of scope?

**Infer and propose (don't interrogate):**
- Risk profile (untrusted inputs, sensitive data)
- Backpressure gates (tests, lint, typecheck)
- Evidence requirements (what counts as "done")
- Forbidden patterns

Stop when you can identify major areas. Don't over-interview.

---

## Phase 2: Audit Existing Code

If code exists, read it first. Specs restate the codebase for quick agent familiarization.

**Steps:**
1. Identify key directories and entry points
2. Read core files → understand architecture
3. Note patterns already in use
4. Identify tests and structure
5. Find config and environment setup

**Output:** Notes for spec generation. Don't write specs yet.

---

## Phase 3: Generate Specs

Create technical specs in `docs/`. One per major area.

### What Specs Are

- Technical blueprints (code snippets, schemas, architecture)
- Optimized for agent semantic search
- Living documents that evolve
- Restated descriptions of existing code

**Specs are NOT user stories or tutorials.**

### Doc Writing Style

- **YAML front-matter required** — Every doc needs `summary` and `read_when`
- **Novel/complex concepts** — Prose; explain why, not just what
- **Known patterns, commands, rules** — Telegraphic; noun phrases, drop filler
- **Guardrails** — Inline negatives: "No X. Do Y instead."

**General principles:**
- Lists over 2-column tables (token-optimized). Tables for 3+ columns.
- Code snippets over prose descriptions
- "Pattern: follow X" over explaining how
- Explicit DO NOT with alternatives over vague warnings

### Front-Matter Format

Every markdown doc MUST have YAML front-matter:

```yaml
---
summary: 'One-line description of what this file covers.'
read_when:
  - Condition 1 when agent should read this
  - Condition 2 when agent should read this
---
```

This enables agents to:
- **Skim headers first** — decide whether to read the full file
- **Skip irrelevant docs** — save tokens by not reading unneeded content

### Spec Structure

```markdown
---
summary: 'Brief description of this area.'
read_when:
  - When agent should read this doc
---

# [Area Name]

## Overview
What this system does (1 paragraph).

## Architecture
Component diagram, module structure, data flow.

## Core Types
Key types/interfaces with actual code snippets.

## Key Files
| File | Purpose |
|------|---------|
| `src/example.ts` | Does X |

## API Endpoints (if applicable)
| Method | Path | Description |
|--------|------|-------------|

## Patterns to Follow
Links to existing code the agent should mimic.

## Forbidden (Do NOT)
- No [bad pattern]. Use [alternative] instead.
- No [another bad pattern]. [Why and what to do].
```

### Update docs/README.md

Add each spec to the index:

```markdown
| Spec | Code Location | Status | Purpose |
|------|---------------|--------|---------|
| [auth.md](./auth.md) | `src/auth/` | Active | Authentication |
```

---

## Phase 4: Define Workstreams

Break project into **workstreams** — independent lanes of execution.

**Each workstream must be:**
- Separable (can work independently)
- Substantial (multiple tasks)
- Concrete (clear ownership boundaries)

**Guidelines:**
- Start with 1-3 workstreams (1 if small project)
- Define what it owns AND what it does NOT own

### Workstream File Structure

Create `instructions/<stream>.md` for each workstream:

```markdown
---
summary: '[Brief description of this workstream]'
status: not-started
read_when:
  - Assigned to this workstream in prompt.md
---

# Workstream: [Name]

**STOP. Read AGENTS.md BEFORE doing anything.**

## Ownership

| This workstream owns | Does NOT own |
|---------------------|--------------|
| X, Y, Z | A, B, C |

## The Job

[1-2 sentences describing the goal]

## Specs

- [docs/relevant-spec.md](../docs/relevant-spec.md)

## Notes

[Discoveries, blockers, context for next iteration]

---

## Checklist

### Phase 1: [Phase Name]
> [Brief description of this phase's goal]

- [ ] [Task description]
  - Proof: [What evidence is needed]
  - [ ] [Sub-task if needed]
  - [ ] [Another sub-task]

### Phase 2: [Phase Name]
> [Brief description of this phase's goal]

- [ ] [Task description]
  - Proof: [What evidence is needed]
```

### Front-Matter Status Field

Workstreams include a `status` field in front-matter:

| Status | Meaning |
|--------|---------|
| `not-started` | No tasks completed yet |
| `in-progress` | Some tasks done, more remain |
| `complete` | All tasks checked off |

**When the last task is checked off**, the agent MUST update `status: complete`. This tells future agents they can skip reading this workstream entirely, saving tokens.

### Checklist Guidelines

- **Phases**: Split work into phases (Foundation → Core → Polish)
- **Proof required**: Every task needs a verification method
- **Sub-tasks**: Use nested `- [ ]` for complex tasks
- **Sequential**: Complete Phase 1 before Phase 2
- **Parent completion**: Mark parent `[x]` only when ALL sub-tasks are `[x]`
- **Status update**: Update front-matter `status` when workstream is complete

---

## Phase 5: Configure AGENTS.md

Customize `AGENTS.md` with project-specific info.

**Fill in:**
1. **Commands** — build, test, lint, format, typecheck
2. **Quick Reference** — entry points, tests, config
3. **Patterns** — "Pattern: follow X" for good examples
4. **Forbidden** — project-specific DO NOTs
5. **Environment** — setup instructions
6. **Dependencies** — key libraries

**Keep brief (~100 lines).** Detailed specs go in `docs/`.

---

## Phase 6: Update prompt.md

Edit `prompt.md` to point to the first workstream:

```markdown
# Ralph Build Session

You are working on the **[workstream-name]** workstream.
```

---

## Phase 7: Validate

| Check | Verify |
|-------|--------|
| Infrastructure | `.ralph/`, `prompt.md`, `AGENTS.md` exist |
| Docs templates | `docs/conventions.md`, `README.md`, `index.md`, `triage.md` exist |
| Specs | At least one in `docs/` |
| Spec index | `docs/README.md` lists all specs |
| Workstream(s) | `instructions/<stream>.md` with checklists |
| AGENTS.md | Commands filled in, patterns added |
| prompt.md | Points to correct workstream |

---

## Output

Summarize when complete:
- Workstreams created + ownership
- Specs created + purpose
- AGENTS.md customizations
- Suggested first workstream
- Open questions needing human input

---

## Running Ralph

```bash
.ralph/ralph.sh 1           # Single iteration (test setup first)
.ralph/ralph.sh             # Full loop until complete
tail -n 200 -F .ralph/activity.log # Monitor progress
```

---

## Reminders

- No over-interviewing. Get enough to identify areas, move on.
- Specs are technical. Code, schemas, tables. Not user stories.
- Specs restate code. Help agents get familiar fast.
- Every task needs proof. No exceptions.
- Signs grow organically. Start with defaults, add as failures occur.
- Check the code. Never assume based on specs alone.
- No code during onboarding. Workers implement.
