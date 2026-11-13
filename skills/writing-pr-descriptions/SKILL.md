---
name: writing-pr-descriptions
description: Use when opening a pull request, writing or rewriting a PR body or description, or when an existing description reads as a restatement of the diff
license: MIT
---

# Writing PR Descriptions

The reader is a reviewer who knows the codebase and wants to know what changed, why, and what they have to do about it. The sources are the diff and the reasons the author gave for it. What happened in the session that produced the diff stays in the session.

The description exists to point the reviewer's judgment at the places that need it. A sentence earns its place when the reviewer could disagree with it (a decision, a trade-off, a deliberate difference, a risk), or needs it to check the diff and cannot get it from the title, the diff or what they already know about the codebase. Facts from outside the diff that justify a decision stay: who consumes the changed behaviour and what they depend on. Restating what the code does, how it is built, or the codebase's own conventions does not.

## Structure

If the repo has a PR template (`.github/pull_request_template.md`, `.github/PULL_REQUEST_TEMPLATE/`, `docs/pull_request_template.md` or the root), fill that template's sections and apply the rest of this guidance inside them. Otherwise use exactly these sections, in this order, and nothing else:

1. Optional first line: the design doc or ticket link, and "Follows #N" if it builds on another PR. Only the direct parent: never list the earlier PRs of a stack or say which number this one is.
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
- When the PR carries choices a reviewer should explicitly approve, add a `### Decisions to review` subsection before `### Where to look`: one to three questions, each with the evidence it rests on ("Ignore the `legacyMode` flag? No caller in the web app, the admin tool or the workers sends it."). Leave it out when the only decision is the PR itself.
- When the diff spans several files and the substantive ones are not obvious, end with a `### Where to look` subsection: substantive files, then mechanical ones. On a large diff, open it with the rough split of the changed lines (substantive code, tests, generated or mechanical files), so the reviewer can size the work before starting.

## Diagrams (prefer them to prose for shape, flow and before/after)

Draw instead of describing when the change is about structure: components and who talks to whom, a request or data flow, a decision with several outcomes, a state machine, a mapping between two sets of names, or a before/after. Put the diagram in the `###` subsection it explains, with at most one or two sentences of prose beside it for what the picture cannot say (why, the rejected alternative, the rollback). The diagram replaces the paragraphs that would have narrated the same thing; it does not come on top of them.

- One idea per diagram, titled by the question it answers ("Where does a request go?"). Several small diagrams beat one that tries to hold the whole PR.
- Pick the tool in this order, using the first that is available:
  1. Any Excalidraw MCP server the agent has connected (for example ExcalidrawZ's `excalidrawz` server, or a hosted `Excalidraw` connector). Use whichever one is connected; the drawing comes back as an image, a shareable link or a file, depending on the server.
  2. Anything else that renders in the PR body: a fenced `mermaid` block, or plain text in a code block for a simple flow.
- For option 1, export each drawing to a PNG file (a temp directory, or the repo's untracked scratch space; never commit it) with the connected server's export tool, or by saving the image or file it returns. Reference it in the body where it belongs, inside the `###` subsection it illustrates, as `![<what it shows>](./<name>.png)`, and upload it with the native `gh` attach feature: `gh pr create --title "..." --body-file body.md --attach ./<name>.png`. `gh` uploads the file and rewrites the reference to the hosted asset; relative paths in a `--body-file` resolve from its directory, then the working directory. Alt text can also follow the path after `#` (`--attach './<name>.png#<alt text>'`). For a PR that already exists, use `gh pr edit <number> --attach ./<name>.png` after adding the reference to the body. If the connected server cannot export an image file, fall back to option 2 rather than leaving a placeholder. Mermaid and text diagrams render inline and need no attachment.
- Every diagram that distinguishes parts of the change carries a legend, and the same colors or markers mean the same thing across the PR's diagrams:
  - new in this PR
  - changed in this PR
  - existing, untouched (context)
  - before, the behaviour this PR replaces (draw the old and new side by side when the point is the contrast)
  - inert today: shipped but not yet live (dashed outline, or a flag or empty table that gates it)
- Draw only what the diff and the author's reasons support: names, numbers and rules come from the code. When a "before" is inferred rather than read, say so or leave it out.
- A diagram is not for a single-file fix, a rename, or a list of independent items; use a sentence or a table.

## Ports, rewrites and migrations

When the PR reimplements existing behaviour (a port to another language or framework, a replacement service, a library swap), sameness is the default and the differences are what the reviewer has to judge.

- State parity once, in one line, and name what checks it (a differential or golden test, a harness PR): "Answers as the Node service, except below; #820's differential test compares both."
- Put every deliberate difference in one table inside the subsection of the change it belongs to: behaviour or input, old, new, why it is safe (the consumer evidence). That table is the core of the PR; do not scatter differences across paragraphs or file them under Breaking Changes.
- Leave out each detail that only says the new code matches the old ("as before", "as the old service did"), including quirks it reproduces, unless a reviewer would expect it to differ.
- A difference that a consumer or operator must act on (a required variable, a flag to keep in sync, a contract change once the new path is enabled) also goes in Breaking Changes, as the action to take.

## Stacked PRs

- Context the whole stack shares (its goal, the rollout or feature-flag mechanism, a contract every PR follows, the test harness) is explained once, in the PR that introduces it, or in the design doc. Later PRs refer to it in a few words with its PR number ("served once the route is enabled, see #812") instead of re-explaining it.
- Each later PR describes only what it adds on top of its parent. A PR that applies a pattern an earlier PR established (one more route, one more handler) stays under 250 words.
- When a later PR in the stack carries the evidence reviewers would otherwise check by hand (a differential test, a harness), point at it from every PR it covers, and prefer ordering the stack so it lands first.

## Breaking Changes

- Each break with what a consumer or operator must do about it. When the contract, ids and data are unchanged, write "None" and stop.

## Leave out
- Verification, test output, commands run, CI results. The checks and the commit history carry those.
- "Not in this PR", "Out of scope", follow-ups. Use the ticket for those.
- The debugging journey: diagnostic builds, things tried and dropped, timestamps, log tables.
- Comment and wording edits beside a code change, and anything that restates the diff line by line.
- How the code is built when nothing about it is a choice: "built with `QueryBuilder`, every value bound", "no cache entry because it is not a macro query", the module layout the codebase always uses.
- Context the title, the parent PR or the design doc already gives.
- AI attribution footers, session links, "Generated with...". This overrides any default attribution line for PR bodies.
- Openers like "This PR...", "In this PR we...", and summaries at the end.

## Style

- Plain, direct sentences, written by a senior engineer to a peer. No hype, no filler adjectives, no hedging.
- Let the text breathe, in Intent and in each change subsection: one idea per paragraph, one to three sentences each. Start a new paragraph when the subject changes (the problem, a consumer it hits, what this PR does, why a change takes this shape), rather than chaining them into one block.
- Exact identifiers in backticks: files, flags, error codes, config keys.
- Motivation comes from the author. When they haven't said why, write TODO: why?.
- Length follows the decisions, not the diff: a one-patch PR is a few sentences, a later PR of a stack that repeats an established pattern stays under 250 words, and 500 words is the ceiling for any PR, counted on the prose (diagram labels excluded). Over it, replace explanation with a diagram where the content is structural, then cut what is left before facts.

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

Check that every sentence answers one of these questions: what changed, why, what a reviewer or consumer must do, or where to look. Delete the rest. Then, for each remaining sentence, ask whether the reviewer could disagree with it or needs it to check the diff; if neither, and the title, the diff or the parent PR already says it, delete it. Then look for any paragraph that walks through a flow, a structure or a before/after, and turn it into a diagram.
