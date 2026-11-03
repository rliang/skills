# stacking-prs

An agent skill for splitting work into stacked GitHub pull requests with [`gh stack`](https://github.com/github/gh-stack), shaped around the reviewer: each PR is one concern that makes sense given only the PRs below it.

GitHub's own `gh-stack` skill teaches the agent the commands. This one decides what goes in each PR and in what order, and how the stack moves through review:

- **When to stack.** Only PRs that depend on each other; anything that depends only on trunk becomes a standalone PR.
- **Order.** Mechanical preparation first, then schema and contracts, then behaviour, lower layers first.
- **Size.** About 400 changed lines per PR and 5 PRs per stack, excluding generated files and lockfiles.
- **Tests in their own PR.** When a PR changes more than about 200 lines of non-test code, its new tests go in a PR directly above it, and the two merge together. Edits to existing tests, regression tests for fixes and tests of test infrastructure stay with the code. This is deliberate, and a repo whose instructions or reviewers want tests inline wins.
- **Approval before acting.** The agent shows the split as a table and waits, then builds and checks the branches locally and waits again before pushing. PRs open as drafts.
- **Splitting a finished branch**, with a check that the top of the stack is identical to the original.
- **Titles and bodies** that link the stack (`Follows #N. Tests in #M.`) without `[2/5]` prefixes.
- **Review fixes** as new commits on the branch that owns the change, rebased upstack.
- **A fallback** to plain git and `gh stack link`, or plain chained PRs, when `gh stack` misbehaves or the repo doesn't have stacked PRs.

## Install

As an [Agent Skill](https://agentskills.io):

```bash
npx skills add rliang/skills --skill stacking-prs
```

As a Claude Code plugin:

```bash
claude plugin marketplace add rliang/skills
claude plugin install stacking-prs@rliang-skills
```

**Requirements:** Git, an authenticated [GitHub CLI](https://cli.github.com/), and the `gh stack` extension (`gh extension install github/gh-stack`). Recommended alongside it: GitHub's skill for the commands (`gh skill install github/gh-stack`) and [writing-pr-descriptions](../writing-pr-descriptions) for the PR bodies.

## Use

The agent picks it up when you ask to split a branch, stack PRs or mention `gh stack`, and when a branch it is about to open as a PR has grown past about 400 changed lines.

```
Split my branch `search-filters` into a stack of PRs against main.
Address the review comments on the second PR of the stack.
Merge the bottom two PRs of the stack.
```

## License

MIT.
