# excalidraw

An agent skill for drawing diagrams as [Excalidraw](https://excalidraw.com) scenes written in code: architecture, flows, sequence diagrams, state machines, timelines and comparison tables.

The agent writes each diagram as a small JS function against a scene API (boxes, arrows, zones, lanes, grids) and runs it through `scripts/build.mjs`. Agents usually can't see a rendered picture, so the script lints every scene for text over text, text over box, box over box and labels that outgrew their box, and only then produces output.

- **Shareable links.** Each diagram becomes an `https://excalidraw.com/#json=...` link that anyone can open and edit. The script downloads and decrypts the link after uploading to confirm it opens.
- **Local files.** `--check --out <dir>` lints and writes `.excalidraw` files without any network call.
- **Round trip.** `--fetch <link>` downloads a diagram you edited in the browser so the agent can modify it.
- **House style.** Excalifont at the editor's default size, colour used consistently with a legend, a title on every diagram and the takeaway in a closing callout.

Versus the Excalidraw MCP server, which draws interactively: this skill is for diagrams you want to keep, version or share as links, with a layout check in place of a preview.

## Network and privacy

Uploading posts the scene to `json.excalidraw.com`, the store behind excalidraw.com's own share links. The scene is encrypted client-side (AES-GCM) and the key lives only in the URL fragment, so the server never sees it, but anyone with the link can open it. That endpoint is not a documented API and may change. The skill tells the agent not to upload anything you didn't ask to share and to ask first if a diagram would carry secrets or personal data.

## Requirements

Node 18 or later. No dependencies.

## Install

As an [Agent Skill](https://agentskills.io):

```bash
npx skills add rliang/skills --skill excalidraw
```

As a Claude Code plugin:

```bash
claude plugin marketplace add rliang/skills
claude plugin install excalidraw@rliang-skills
```
