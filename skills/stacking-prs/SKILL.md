---
name: stacking-prs
description: Guidelines for planning, building, updating and merging stacked GitHub pull requests with the gh stack extension. Use whenever a change is too big for one reviewable PR, when the user asks to split a branch or PR into several, when a PR depends on another unmerged PR, when opening, rebasing, addressing review on, or merging a stack or chain of PRs, or when they mention gh stack, stacked PRs or "stack these". Also use when a branch you are about to open as a PR has grown past ~400 changed lines, even if the user didn't say "stack".
license: MIT
---

# Stacking PRs

A stack is a chain of PRs where each one is based on the one below it. The point is review: a reviewer approves one concern at a time, in an order where each PR makes sense given only the ones below it. Every guideline here serves that reader.

This skill is about how to shape a stack. For `gh stack` itself (commands, flags, exit codes, recovery), use GitHub's `gh-stack` skill (`gh skill install github/gh-stack`) or `gh stack <command> --help`. In the examples below, `<trunk>` is the repo's default branch.

## When to stack

- Stack only PRs that depend on each other. A PR that depends only on trunk is a standalone PR off trunk, even if it was written as part of the same effort; it can merge on its own schedule.
- A change that fits the size targets below in one PR stays one PR.

## Planning the split

Order the PRs so the reviewer meets the cheapest-to-review changes first:

1. Mechanical preparation: renames, moves, extractions, dependency bumps. Behaviour-neutral, so the reviewer can skim.
2. Schema, migrations, contracts, shared types.
3. Behaviour changes, one layer at a time, lower layers first (backend before frontend, library before caller).

Each PR is one concern a reviewer can approve without reading the PRs above it.

Soft size targets: about 400 changed lines per PR, excluding generated files and lockfiles, and about 5 PRs per stack, counting a tests PR as one. Past that, look for an independent piece that can be its own stack or a standalone PR off trunk.

Every PR builds, lints and passes the existing test suite against its parent. That keeps any bottom slice of the stack mergeable, and CI on each PR stays meaningful.

## Tests go in their own PR

When a PR changes more than about 200 lines of non-test code, its new tests go in a separate PR placed directly after it: `code A → tests A → code B → tests B`. Reviewing the implementation and the tests separately keeps each PR small, and the reviewer of the tests PR already has its code PR fresh in mind.

Count non-test lines from `git diff --numstat <parent>...<branch>`, leaving out test files (`*_test.go`, `*.test.ts`, `*.spec.*`, `tests/`, `__tests__/` and the like), inline test modules (Rust `#[cfg(test)]` blocks), snapshots, generated files and lockfiles. Use judgment near the line.

What stays in the code PR:

- **Edits to existing tests** that the change breaks or makes outdated, snapshot updates included. Only new tests move. The code PR has to pass CI on its own, and an edited assertion next to the code shows the reviewer the behaviour change.
- **A regression test for a bug fix**, whatever the size. It is the evidence that the fix works.
- **Tests for test infrastructure**: when the PR changes fixtures, helpers or harnesses, the tests that exercise them stay with it.
- **Everything, when the repo's reviewers want tests inline**: a CONTRIBUTING or agent-instructions file, or review comments on earlier stacks, saying so wins over this guideline.

A code PR and its tests PR merge together (see Merging), so trunk never carries the code without its tests.

## Show the plan and wait

Before creating any branch, show the split and wait for approval:

| # | Branch | Title | Contents | ~Lines | Base |
|---|---|---|---|---|---|
| 1 | `rename-account-id` | `refactor(api): rename accountId to accountKey` | mechanical rename across `api/` | 180 | trunk |
| 2 | `account-numeric-id` | `feat(api): filter by numeric account id` | handler, query, existing tests updated | 320 | #1 |
| 3 | `account-numeric-id-tests` | `test(api): cover filtering by numeric account id` | new handler and query tests | 260 | #2 |

Say which PRs keep their tests and why (small, regression test, ...). Then build the branches locally, run each one's checks, and wait again before pushing anything: pushing and opening PRs are visible to other people.

## Building the stack

`gh stack` is the `github/gh-stack` extension (`gh extension install github/gh-stack`), not part of `gh`. A stack on GitHub gets a number from the same sequence as PRs. Never run a `gh stack` command bare: several open a prompt or a full-screen TUI that hangs an agent's shell (`view` → `view --json`, `submit` → `submit --auto`, `init`/`add` → pass the branch names, `merge` → `merge <target> --yes`, no `modify` at all).

### As you go

```bash
gh stack init --base <trunk> rename-account-id   # first layer
# ...commit...
gh stack add account-numeric-id                  # next layer, based on the current top
# ...commit...
gh stack add account-numeric-id-tests
gh stack view --json
```

### Splitting a finished branch

1. Plan from the whole diff: `git diff --stat <trunk>...<original>` and the full diff.
2. Build each layer as a branch off the previous one. Take whole files with `git checkout <original> -- <paths>`; for a file that changes in several layers, write its intermediate state by editing, or apply an edited patch from `git diff <parent> <original> -- <file>`. Commit each layer.
3. Check nothing was lost or added: `git diff <original> <top-branch>` must be empty. A non-empty diff means a hunk is missing or an intermediate edit leaked through.
4. Run each branch's build and tests against its parent.
5. Adopt the branches as a stack, bottom to top: `gh stack init --base <trunk> <b1> <b2> <b3>`.

Keep the original branch until the stack has merged; it is the reference for step 3 after any later reshaping.

## Opening the PRs

`gh stack submit --auto` pushes every branch, opens a **draft** PR for each branch without one, and links them as a stack on GitHub. Leave them as drafts: the user marks them ready, or tells you to run `gh stack submit --auto --open`, which notifies reviewers.

With `--auto`, a branch with a single commit gets that commit's subject as the PR title and its body as the PR body; a branch with several commits gets a humanized branch name. So write each layer as one commit whose subject is the PR title, or fix the titles afterwards with `gh pr edit <n> --title`.

**Titles** follow the repo's convention (look at recent merged PRs). A tests PR is `test(<scope>): cover <what its code PR does>`, adapted to the repo's title style. No `[2/5]` prefixes: GitHub's stack view shows the order, and prefixes go stale when the stack is reshaped.

**Bodies** follow the repo's PR template or the user's usual format (the `writing-pr-descriptions` skill, if installed), with the stack links on the first line:

- code PR with a tests PR: `Follows #N. Tests in #M.` (leave out `Follows` on the bottom PR)
- tests PR: `Tests for #N.`
- other PRs: `Follows #N.`

The `Tests in #M` link is there so the reviewer of a code PR doesn't flag missing tests. Set bodies with `gh pr edit <n> --body-file <file>`.

`submit` exits 9 when the repository doesn't have stacked PRs enabled; use the fallback below.

## After review

Fix review comments on the branch that owns the change, as **new commits**, not amends: the reviewer's "changes since last review" view then shows only the fix. Squash merging tidies history later.

```bash
gh stack checkout <branch>     # or: gh stack down / up / bottom / top
git commit -m "Address review: ..."
gh stack rebase --upstack      # replay every branch above onto the fix
gh stack push
```

A fix that touches the code of a code+tests pair usually needs a matching test change in its tests PR; make it there, then rebase upstack again.

To reshape a stack (insert, drop or reorder a layer), rebuild the affected branches with git, rerun step 3 of "Splitting a finished branch" against the original branch, then `gh stack unstack --local`, `gh stack init --base <trunk> <branches...>` and `gh stack submit --auto`.

## Merging

Merge only when the user says so. Merge a code PR together with its tests PR by targeting the tests PR: `gh stack merge <tests-PR#> --yes`, adding `--squash`, `--merge` or `--rebase` per the repo's convention. It merges everything up to and including that PR in one all-or-nothing operation. Never target a code PR whose tests PR sits directly above it. PR and stack numbers share one sequence and `merge` accepts either, so confirm the target is the PR you mean with `gh stack view --json` before merging.

Afterwards, `gh stack sync --prune` rebases the remaining branches onto trunk and deletes the merged local branches.

## Fallback: plain git + `gh stack link`

`gh stack` is young. When local tracking misbehaves (unexpected errors, state you can't reconcile, exit 9), switch to this and tell the user you fell back and why:

```bash
git checkout -b b1 <trunk>   # ...commit...
git checkout -b b2 b1        # ...commit...
git push -u origin b1 b2
gh pr create --draft --base <trunk> --head b1 --title ... --body-file ...
gh pr create --draft --base b1      --head b2 --title ... --body-file ...
gh stack link b1 b2          # bottom to top
```

- `link` groups existing PRs into a stack on GitHub. It leaves base branches and draft state alone and pushes only branch arguments. Add to the top of an existing stack with `gh stack link <stack#> <pr-or-branch>...`.
- `link` keeps no local state, so `gh stack rebase` and `sync` don't know these branches. After changing a lower branch, rebase each branch above it by hand, bottom to top: `git rebase --onto <new-parent-tip> <old-parent-tip> <branch>`, then `git push --force-with-lease`.
- On exit 9 (stacked PRs not enabled on the repo), skip `link`: there is no stack on GitHub to create. The PRs still chain through their base branches and the `Follows #N.` lines. Merge them bottom to top with `gh pr merge`, and before merging each next one, check that its base now points at trunk (GitHub retargets it when the merged branch is deleted); otherwise run `gh pr edit <n> --base <trunk>`. After a squash merge, also replay the next branch onto trunk (`git rebase --onto <trunk> <old-parent-tip> <branch>`, then `git push --force-with-lease`), or its diff repeats the merged commits.
