# skills

Agent skills by [rliang](https://github.com/rliang), each in `skills/<name>/` following the [Agent Skills](https://agentskills.io) format, and also installable as Claude Code plugins from this repo's marketplace.

| Skill | What it does |
|---|---|
| [animated-explainer](skills/animated-explainer) | Explains a concept, a document or the previous reply as one offline HTML deck of hand-drawn, step-through animations written in code with Canvas Commons. |

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
