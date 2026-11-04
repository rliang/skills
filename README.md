# skills

Agent skills by [rliang](https://github.com/rliang), each in `skills/<name>/` following the [Agent Skills](https://agentskills.io) format, and also installable as Claude Code plugins from this repo's marketplace.

| Skill | What it does |
|---|---|
| [animated-explainer](skills/animated-explainer) | Explains a concept, a document or the previous reply as one offline HTML deck of hand-drawn, step-through animations written in code with Canvas Commons. |
| [excalidraw](skills/excalidraw) | Draws diagrams (architecture, flows, sequences, tables) as Excalidraw scenes written in code, lints the layout since there is no preview, and returns shareable `#json=` links or local `.excalidraw` files. |
| [stacking-prs](skills/stacking-prs) | Plans, builds, updates and merges stacked GitHub PRs with `gh stack`, ordered and sized for the reviewer, with new tests in their own PR. |
| [writing-pr-descriptions](skills/writing-pr-descriptions) | Writes PR descriptions for the reviewer: intent, one subsection per behaviour change, breaking changes, and nothing from the session that produced the diff. |

## Install

Any agent that supports Agent Skills:

```bash
npx skills add rliang/skills --skill <name>
```

Claude Code:

```bash
claude plugin marketplace add rliang/skills
claude plugin install <name>@rliang-skills
```

Each skill's README lists its own requirements.

## License

MIT, unless a skill's directory says otherwise.
