# animated-explainer

An agent skill that explains a concept, a document (design doc, spec, RFC, PR) or the agent's previous reply as **one offline HTML deck of hand-drawn animations**. The animations are written in code with [Canvas Commons](https://github.com/canvas-commons/canvas-commons) (a TypeScript fork of Motion Canvas) and stay live code in the file, not video. One arrow key, scroll gesture or swipe plays one step. The side panel holds the prose or, for a document, the quoted source with each step's passage highlighted. The file opens from disk or as an email attachment, with no server or network.

<img width="960" height="560" alt="page-bucket" src="https://github.com/user-attachments/assets/6e35d47f-42cc-4635-9ca2-6ccb41619f95" />
<img width="960" height="560" alt="page-backoff" src="https://github.com/user-attachments/assets/96a38f4a-38cf-4949-83cb-67d28e47dcb0" />

The skill's main lesson is in `SKILL.md` under "Make it intuitive": turn every quantity into something you can count, never change a number without a visible cause, and contrast two rules on the same input.

## Install

As an [Agent Skill](https://agentskills.io):

```bash
npx skills add rliang/skills --skill animated-explainer
```

As a Claude Code plugin:

```bash
claude plugin marketplace add rliang/skills
claude plugin install animated-explainer@rliang-skills
```

Or copy this directory into your agent's skills directory (e.g. `~/.claude/skills/animated-explainer`).

**Requirements:** Node.js 20.19 or newer, and npm. The first build (or `build.mjs setup`, which the skill starts in the background) runs `npm ci` in `engine/` (about 150 MB) and needs a Chromium-based browser for its checks. It uses Playwright's Chromium when installed, then an installed Google Chrome or Microsoft Edge, and otherwise downloads Playwright's headless shell once (about 200 MB, shared with any other Playwright install). Set `ANIMATE_BROWSER` to a channel (`chrome`, `msedge`) or an executable path to choose one. Later builds take a few seconds.

## Use

```
/animated-explainer how does a token bucket rate limiter work?
/animated-explainer ./docs/design/retries.md
/animated-explainer https://www.rfc-editor.org/rfc/rfc6585
/animated-explainer                      # explains the previous reply
```

The skill only runs when you invoke it (`disable-model-invocation`), because a full deck for a long document can take a few hundred thousand tokens. The agent writes a work dir, builds it, reviews a contact sheet of every animation step, fixes what reads badly, and replies with a link to the `.html` file. A deck embeds its sources, so `build.mjs extract` restores the work dir for edits later.

To put one animation in a wiki page, a ticket or a chat, press the deck's GIF button (or `g`) on that animation. It downloads a looping GIF at half size and about 15 fps; drag the file into the editor. (Browsers can't copy a GIF to the clipboard, so it's a download.)

## How it works

- `engine/build.mjs` type-checks the scenes, runs Vite with the Canvas Commons plugin, swaps its per-project entries for one page entry, and inlines the single JS bundle and CSS (font included) into the HTML. A deck is about 2.7 MB, mostly the 2D library. It then opens the file in headless Chromium from `file://`, fails on any page error, checks that the deck still plays when previewed in a sandboxed `srcdoc` iframe (as some agent apps do for attached HTML: opaque origin, strict CSP), and writes contact sheets (one frame per step), side-panel and text-card renders for the agent to review. Sheets and renders whose inputs didn't change are kept and marked unchanged, so the agent doesn't review them twice. `--only <id>` builds one animation into a preview, so subagents can write a deck's animations in parallel in one work dir.
- `engine/core.ts` loads each animation with Canvas Commons' `Player` and `Stage` and exposes its steps, `playTo` and `seekTo`. It replaces `<canvas-commons-player>`, which loads its project by URL (blocked from `file://`) and has no step control. Step marks are frames the kit records on each scene during the player's first pass. This was verified with one scene per project; with several scenes per project, check the step counter.
- `engine/deck.ts` drives the deck: navigation, wheel debouncing so one trackpad gesture is one step, touch, keys, the URL hash and source highlights. `engine/gif.ts` exports one animation as a GIF with [gifenc](https://github.com/mattdesl/gifenc), frame by frame through the same seeks the steps use, with one palette and repeated frames merged. `engine/theme.ts` handles light and dark (canvases get an Excalidraw-style invert filter).
- `engine/kit` is the house kit scenes import as `animate-kit`: palette, captions that mark steps, tokens, bars, legends, timelines, JSON cards, chips, tables, locale-aware numbers.
- `references/` holds what the agent reads while writing scenes: a visual toolbox of verified recipes, a trimmed Canvas Commons API reference, and the rules for explaining a source document.

To add a dependency (e.g. `@lezer/javascript` for `Code` highlighting), `npm install` it in `engine/`. To upgrade Canvas Commons, bump the versions in `engine/package.json`, then rebuild `examples/minimal` and check its contact sheet.

## License

MIT. Canvas Commons is MIT; the Patrick Hand font (via `@fontsource/patrick-hand`) is under the SIL Open Font License.
