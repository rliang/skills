# excalidraw-obsidian

An agent skill for drawing diagrams as [Excalidraw](https://excalidraw.com) scenes written in code and saving them into an [Obsidian](https://obsidian.md) vault, where the [Excalidraw plugin](https://github.com/zsviczian/obsidian-excalidraw-plugin) opens them as editable drawings.

It is the Obsidian sibling of the [`excalidraw`](../excalidraw) skill and shares its scene API (boxes, arrows, zones, lanes, grids) and layout lint: agents usually can't see a rendered picture, so every scene is checked for text over text, text over box, box over box and labels that outgrew their box before anything is written.

- **Native drawings.** Output is `<name>.excalidraw.md` in the plugin's file format, so the drawing opens in the Excalidraw view, syncs with the vault (iCloud, Obsidian Sync, git) and can be embedded with `![[name.excalidraw]]`.
- **Bound arrows.** Arrows can be bound to shapes, so they follow when you move a box in Obsidian.
- **No Obsidian needed to write.** The script writes the file straight into the vault folder; `--open` asks a running Obsidian to open it.
- **Local only.** Nothing is uploaded.

Versus the plugin's own ExcalidrawAutomate skill: that one writes scripts that run inside Obsidian. This one writes the drawing file from outside, with a layout check in place of a preview.

## Requirements

Node 18 or later, no dependencies. Obsidian with the Excalidraw plugin enabled in the target vault (tested with plugin 2.29.2).

## Install

```bash
npx skills add rliang/skills --skill excalidraw-obsidian
```

or as a Claude Code plugin:

```bash
claude plugin marketplace add rliang/skills
claude plugin install excalidraw-obsidian@rliang-skills
```
