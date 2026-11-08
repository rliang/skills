---
name: excalidraw-obsidian
description: Draw diagrams as Excalidraw scenes from code and save them into an Obsidian vault as drawings for the Excalidraw plugin (`.excalidraw.md`), editable in Obsidian and synced with the vault. Use whenever the user wants a diagram, sketch or drawing in Obsidian, asks to "draw", "diagram" or "visualize" an architecture, flow, sequence, state machine, timeline, table or before/after comparison into their notes or vault, or mentions Obsidian together with Excalidraw. Not for excalidraw.com share links (use the `excalidraw` skill).
---

# Excalidraw in Obsidian

Write each diagram as a JS function against `scripts/lib.mjs` and pipe it to `scripts/build.mjs` in one Bash call. The script lints the layout, then writes `<name>.excalidraw.md` into the vault. A visual preview is often unavailable, so the lint stands in for looking at the picture. Treat its output seriously.

`SKILL_DIR` is the directory containing this `SKILL.md`. Node 18+, no dependencies. The user needs the [Excalidraw plugin](https://github.com/zsviczian/obsidian-excalidraw-plugin) enabled in the vault; files are tested against plugin 2.29.2.

## Workflow

1. **Find the vault.** Use `$OBSIDIAN_VAULT` if set, else ask the user for the vault root (the folder that contains `.obsidian`). Registered vaults are listed in `~/Library/Application Support/obsidian/obsidian.json` on macOS; offer those as choices instead of guessing. Ask which subfolder to use if the vault has a convention for drawings; default to the vault root.
2. **Plan before drawing.** Decide what one idea each diagram explains and what it contains. Every number, name and rule must come from the source (doc, code, vendor docs); when drawing exposes an inconsistency in the source, draw what is correct and tell the user.
3. **Build and write** with a heredoc. `Scene`, `C`, `FS`, `FONT` are in scope; one exported function per diagram, each returning a `Scene`. The export name becomes the file name (`s1` -> `s1.excalidraw.md`), so use descriptive names (`order_flow`).
   ```bash
   node SKILL_DIR/scripts/build.mjs --vault "$VAULT" --dir Diagrams --open <<'EOF'
   export function order_flow() {
     const s = new Scene();
     s.text(40, 0, "Write path", { fs: 28 });
     const a = s.box(40, 70, 240, 70, "INSERT order", { bg: C.blue });
     const b = s.box(400, 70, 240, 70, "INSERT outbox row", { bg: C.orange });
     s.arrow([[280, 105], [400, 105]], { from: a, to: b, label: "same tx" });
     return s;
   }
   EOF
   ```
   Output per diagram: `name  N elements  <path>  <obsidian:// uri>`. `--open` asks Obsidian to open the file (the vault must be registered in Obsidian). `--check` lints only.
4. **Fix lint issues and re-run.** If any scene has issues nothing is written. Fix every `text over text`, `text over box` and `box over box`. `box grew` means a label didn't fit the size you asked for: shorten or split the text, or widen the slot (`--force` is fine for proportional bars where the label is meant to sit outside).
5. **Report** the file paths and say the rendering wasn't previewed if it wasn't.

Re-running a function overwrites its file. If the user edited the drawing in Obsidian, don't overwrite it: pick a new name, or read the file and modify it.

## Obsidian specifics

- **Bound arrows.** Pass `from` and/or `to` (shapes returned by `s.box`) to `s.arrow` so the arrow stays attached when the user moves a box. The points must still start and end at the shapes' edges.
- **File format.** `lib.mjs` writes the plugin's markdown format: frontmatter `excalidraw-plugin: parsed`, a `## Text Elements` list mirroring the scene's text, and the scene JSON uncompressed inside a `%%` comment. The plugin recompresses on its next save. Never hand-edit a drawing the plugin has compressed; regenerate it instead.
- **Embedding.** To show a drawing inside a note, link `![[name.excalidraw]]` (with an optional `|width`). Writing into an existing note is the user's call; ask first.
- **Vault sync.** A vault in iCloud, Obsidian Sync or git syncs the new file like any other note. Don't write outside the vault.
- **Obsidian MCP.** If an Obsidian MCP server (the Local REST API plugin's built-in one) is available, it can open or list files, but this skill writes the file directly and doesn't need it.

## Scene API (`scripts/lib.mjs`)

Coordinates are absolute scene pixels, y grows downward. Sketch the grid (column x's, row y's) before writing calls.

| Call | Draws |
|---|---|
| `s.text(x, y, str, {fs, color, align, mono})` | free text; `align` is relative to `x` |
| `s.box(x, y, w, h, label, {bg, stroke, sw, dash, fs, color, shape, round, mono})` | shape with a centered label; returns the shape; `shape`: `rectangle`, `diamond`, `ellipse` |
| `s.zone(x, y, w, h, title, {bg, stroke, dash})` | background grouping area, title top-left |
| `s.arrow([[x,y], ...], {from, to, label, below, at, line, dash, stroke, sw, start, end, lfs})` | polyline through absolute points, optionally bound to shapes; label goes above the longest segment |
| `s.lanes([[key, title, cx, fill], ...], top, bottom)` then `s.msg(X, from, to, y, label, opts)` | sequence diagram |
| `s.grid(x, y, cols, rows, {rowHead, colW, headH, rowH, fs})` | table; a cell `[text, fill]` highlights it |
| `C.*` | fills (`blue`, `green`, `orange`, `purple`, `red`, `yellow`, `teal`, `gray`), strokes (`sBlue`, `sGreen`, `sRed`, `sOrange`, `sPurple`, `sGray`), `muted` text |

## Layout rules

- **Size text to its slot.** Width is estimated as `chars x fontSize x 0.6`, height as `lines x fontSize x 1.25`. Boxes need about 20 px of horizontal padding; at `fs` 20 a 300 px cell holds about 23 characters per line. Break lines with `\n`; nothing wraps automatically.
- **Font:** Excalifont at 20 for body text, 28 for the title, 16 only for dense cells. `mono: true` for code and identifiers.
- **An arrow label needs a segment longer than itself.** For a short arrow use `at`, or a legend.
- **Leave room between parallel structures** so arrow labels fit in the gaps between boxes.
- **Encode meaning with color consistently** within a diagram and add a legend when color carries meaning.
- **Title every diagram**; put the takeaway in a closing callout box (`C.yellow`).
- Use `roughness` 0 (the default). No emoji. Arrows such as `→` and math such as `≈ ≠ ×` are fine.
- Sequence diagrams: lanes 200-350 px apart, messages about 65 px apart vertically.
- Option comparisons: one row per knob, one column per option, then "what we gain" and "what we lose".
