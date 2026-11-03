---
name: writing-pr-descriptions
description: Use when opening a pull request, writing or rewriting a PR body or description, or when an existing description reads as a restatement of the diff
license: MIT
---

# Writing PR Descriptions

The reader is a reviewer who knows the codebase and wants to know what changed, why, and what they have to do about it. The sources are the diff and the reasons the author gave for it. What happened in the session that produced the diff stays in the session.

## Structure

If the repo has a PR template (`.github/pull_request_template.md`, `.github/PULL_REQUEST_TEMPLATE/`, `docs/pull_request_template.md` or the root), fill that template's sections and apply the rest of this guidance inside them. Otherwise use exactly these sections, in this order, and nothing else:

1. Optional first line: the design doc or ticket link, and "Follows #N" if it builds on another PR.
2. ## Intent
3. ## Proposed Changes
4. ## Breaking Changes

## Intent (a few short paragraphs, plus at most a few bullets)

- The state before, who it affects, and what the PR does about it, each in its own paragraph. For a fix, the evidence that pins down the cause, one line per finding (error codes, the failing case), without the raw logs.
- What was ruled out, in one sentence, only if a reviewer would otherwise suspect it.
- If the PR deliberately covers only part of the problem, say which part. If merging waits on something, say what.

## Proposed Changes (one `###` subsection per change)

- Each behaviour the diff changes gets its own `###` subsection, even when there is only one. The heading names the change in a short phrase, identifiers in backticks, no trailing period.
- Below the heading, short paragraphs as in Intent, one idea each: what concretely changes, why, a rejected alternative when a reviewer will ask "why not X?", and the rollback when it is one step. A small change is one or two paragraphs; give a larger one more rather than packing it into one block.
- Context lives in Intent; a subsection adds to it rather than repeating it.
- A table only for a real inventory: resources, endpoints, a state-by-outcome matrix. It goes inside the subsection it belongs to.
- Quote user-facing strings only when the exact wording is the point.
- When the diff spans several files and the substantive ones are not obvious, end with a `### Where to look` subsection: substantive files, then mechanical ones.

## Breaking Changes

- Each break with what a consumer or operator must do about it. When the contract, ids and data are unchanged, write "None" and stop.

## Leave out
- Verification, test output, commands run, CI results. The checks and the commit history carry those.
- "Not in this PR", "Out of scope", follow-ups. Use the ticket for those.
- The debugging journey: diagnostic builds, things tried and dropped, timestamps, log tables.
- Comment and wording edits beside a code change, and anything that restates the diff line by line.
- AI attribution footers, session links, "Generated with...". This overrides any default attribution line for PR bodies.
- Openers like "This PR...", "In this PR we...", and summaries at the end.

## Style

- Plain, direct sentences, written by a senior engineer to a peer. No hype, no filler adjectives, no hedging.
- Let the text breathe, in Intent and in each change subsection: one idea per paragraph, one to three sentences each. Start a new paragraph when the subject changes (the problem, a consumer it hits, what this PR does, why a change takes this shape), rather than chaining them into one block.
- Exact identifiers in backticks: files, flags, error codes, config keys.
- Motivation comes from the author. When they haven't said why, write TODO: why?.
- Length follows the diff: a one-patch PR is a few sentences, and 500 words is the ceiling for any PR. Over it, cut explanation before facts.

## Example

A one-patch PR, its Intent and its one change subsection split into one paragraph per idea:

```
Follows #812.

## Intent

Since #812 the staging `orders-api` pods run the new Rust service next to the Node app, but nothing reaches it: the `orders-api` Service still targets Node on 3000.

This sends staging traffic through it. Every request to `orders-api` (the web app, the admin tool, the `/docs` route) now lands on the Rust proxy. It serves its own `/v2/*` routes and forwards everything else to Node on `127.0.0.1:3000`.

Merge once QA has finished testing on staging.

## Proposed Changes

### `orders-api` `targetPort` 3000 → 3001, staging overlay only

Only the pod port behind the Service changes. The Service port (80) and every consumer URL stay the same.

Rollback is removing this one patch.

## Breaking Changes

None
```

## Before you answer

Check that every sentence answers one of these questions: what changed, why, what a reviewer or consumer must do, or where to look. Delete the rest.
