# writing-pr-descriptions

An agent skill for PR descriptions written for the reviewer, who knows the codebase and wants to know what changed, why, and what they have to do about it. Its sources are the diff and the reasons the author gave. Nothing from the session that produced the diff goes in.

- **Structure.** The repo's PR template when it has one; otherwise `## Intent`, `## Proposed Changes` with one `###` subsection per behaviour change, and `## Breaking Changes` ("None" when nothing breaks).
- **Diagrams over prose** for structure, flows, decisions and before/after, inside the `###` subsection they explain, drawn with any connected Excalidraw MCP server if available, else Mermaid or text. Image diagrams are exported to PNG and uploaded with `gh pr create --attach` (or `gh pr edit --attach`), which rewrites the body's `![alt](./file.png)` reference to the hosted asset. A shared legend marks new, changed, existing, before and inert-today parts.
- **Judgment first.** A sentence stays when the reviewer could disagree with it or needs it to check the diff; restating the code, its construction or the codebase's conventions goes. A `### Decisions to review` subsection asks the reviewer one to three explicit questions, and `### Where to look` sizes a large diff by its split of substantive, test and mechanical lines.
- **Ports and rewrites:** parity in one line with what checks it, then one table of deliberate differences (old, new, why it's safe) instead of paragraphs of "as before".
- **Stacks:** shared context is explained once, in the PR that introduces it; later PRs refer back by number, describe only their delta and stay under 250 words when they repeat an established pattern.
- **Left out:** verification and CI output, the debugging journey, follow-ups and "out of scope" lists, line-by-line restatements of the diff, "This PR..." openers and closing summaries.
- **Style.** Plain sentences from one senior engineer to another, one idea per paragraph, identifiers in backticks, 500 words at most. When the author hasn't said why, the agent writes `TODO: why?` instead of inventing a reason.
- **No AI attribution.** The skill tells the agent to leave out "Generated with..." footers and session links, overriding any default attribution line its harness adds. Remove that line from `SKILL.md` if you want to keep them.

## Install

As an [Agent Skill](https://agentskills.io):

```bash
npx skills add rliang/skills --skill writing-pr-descriptions
```

As a Claude Code plugin:

```bash
claude plugin marketplace add rliang/skills
claude plugin install writing-pr-descriptions@rliang-skills
```

## Use

The agent picks it up when it opens a PR or writes a PR body, and when you ask it to rewrite one:

```
Open a PR for this branch.
Rewrite the description of #123, it just restates the diff.
```

Pairs with [stacking-prs](../stacking-prs), which puts the stack links (`Follows #N. Tests in #M.`) on the first line.

## License

MIT.
