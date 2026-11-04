---
name: excalidraw
description: Draw diagrams as Excalidraw scenes from code and return shareable excalidraw.com `#json=` links (client-side encrypted, openable and editable by anyone with the link). Use whenever the user asks for an Excalidraw diagram or link, wants diagrams to paste into a Confluence page, design doc, PR or Slack thread, asks to "draw", "sketch", "diagram" or "visualize" an architecture, flow, sequence, state machine, timeline, table or before/after comparison, or asks for `#json=` links, even if they don't name Excalidraw but want an editable diagram they can share. Also use to re-open or modify a diagram from an existing excalidraw.com `#json=` link.
---

# Excalidraw

Write each diagram as a JS function against `scripts/lib.mjs` and pipe it to `scripts/build.mjs` in one Bash call. The script lints every scene for layout problems and uploads only when all are clean. A visual preview is often unavailable, so the lint pass stands in for looking at the picture. Treat its output seriously.

`SKILL_DIR` below is the directory containing this `SKILL.md`. Scripts need Node 18+ and have no dependencies.

## Workflow

1. **Plan before drawing.** For each diagram decide: what one idea it explains, where it goes in the target doc, and what it contains. If the user asked for suggestions first, give them the list and stop. Write labels in the target doc's language.
2. **Get the facts right.** Every number, name and rule in a diagram must come from the source (the doc, the code, vendor docs). A diagram states things more confidently than prose does, so a wrong value does more damage. When drawing exposes an inconsistency in the source (numbers that don't add up, a step that contradicts another), don't paper over it. Draw what is correct and tell the user what you found.
3. **Build and upload** with a heredoc. No scenes file and no import are needed: `Scene`, `C`, `FS` and `FONT` are in scope. One exported function per diagram, each returning a `Scene`. Name exports so numeric sort gives the intended order (`s1`, `s2`, `s2b`, `s10`).
   ```bash
   node SKILL_DIR/scripts/build.mjs <<'EOF'
   // Flow: boxes, arrows, a zone, a note.
   export function flow() {
     const s = new Scene();
     s.text(40, 0, "Write path: API + queue", { fs: 28 });
     s.zone(20, 60, 900, 200, "Database (same transaction)");
     s.box(50, 110, 240, 70, "INSERT order", { bg: C.blue });
     s.box(360, 110, 240, 70, "INSERT outbox row", { bg: C.orange });
     s.arrow([[290, 145], [360, 145]]);
     s.box(1000, 110, 240, 70, "Relay → queue", { bg: C.gray2 });
     s.arrow([[600, 145], [1000, 145]], { label: "poll outbox", dash: true });
     s.text(50, 290, "The row and the event commit atomically.", { fs: 16, color: C.muted });
     return s;
   }
   // Sequence: lanes() draws headers + lifelines, msg() a labeled horizontal arrow.
   export function sequence() {
     const s = new Scene();
     s.text(20, 0, "Order confirmation", { fs: 28 });
     const X = s.lanes([["api", "API", 150, C.purple], ["q", "Queue", 500], ["w", "Email worker", 850]], 60, 400, { w: 260 });
     s.msg(X, "api", "q", 170, "OrderConfirmed");
     s.msg(X, "q", "w", 240, "deliver");
     s.msg(X, "w", "api", 310, "no reply (async)", { dash: true, stroke: C.sGray });
     return s;
   }
   // Table: a [text, fill] cell highlights it.
   export function matrix() {
     const s = new Scene();
     s.text(40, 0, "State per option", { fs: 28 });
     s.grid(40, 60, ["Today", "Option A", "Option B"], [
       ["Language", ["Python", "Python", ["Rust", C.yellow]]],
       ["Storage", ["triggers", ["event log", C.yellow], "event log"]],
     ], { colW: 200, rowH: 70 });
     return s;
   }
   EOF
   ```
   Each clean upload prints `name  N elements  https://excalidraw.com/#json=<id>,<key>`. The script downloads and decrypts each link after uploading, so a printed link is known to open.
4. **Fix lint issues and re-run.** If any scene has issues, nothing is uploaded. Fix every `text over text`, `text over box` and `box over box`. `box grew` means a label didn't fit the size you asked for. That breaks alignment in stacks and grids, so shorten or split the text, or widen the slot. It is fine in proportional bars where you asked for an exact width and the label goes outside; pass `--force` then. Trailing names (`build.mjs s2 s3 <<'EOF'`) limit the run to those exports; `--check` lints without uploading, and `--check --out <dir>` also writes the `.excalidraw` files, so nothing leaves the machine (open them in excalidraw.com via Open, or the VS Code extension).
5. **Report** as a table: diagram, where it goes in the doc, link. Say that the rendering wasn't previewed if it wasn't. List any source inconsistencies found in step 2.

Changing a diagram means re-running its function. That produces a **new** link, because links are immutable and the old ones keep working, so always hand back the new one.

To work from a link the user edited in the browser: `node SKILL_DIR/scripts/build.mjs --fetch '<link>' --out edited.excalidraw`, modify the JSON, then `node SKILL_DIR/scripts/build.mjs --file edited.excalidraw`.

## Sharing and confidentiality

Uploading sends the scene to excalidraw's public JSON store (`json.excalidraw.com`, an endpoint excalidraw.com uses for its own share links but does not document as an API, so it may change). Use `--check --out <dir>` for a local-only result. The scene is encrypted client-side with AES-GCM, and the key exists only in the URL fragment, which the server never sees. Anyone holding the link can open it. A request for links is the user's authorization to upload that content. Don't upload material the user didn't ask to share, and ask first if the diagram would carry secrets, credentials or personal data.

## Scene API (`scripts/lib.mjs`)

Coordinates are absolute scene pixels, y grows downward. Sketch the grid (column x's, row y's) before writing calls.

| Call | Draws |
|---|---|
| `s.text(x, y, str, {fs, color, align, mono})` | free text; `align` is relative to `x` (`left`, `center`, `right`) |
| `s.box(x, y, w, h, label, {bg, stroke, sw, dash, fs, color, shape, round, mono})` | shape with a centered label; `shape`: `rectangle`, `diamond`, `ellipse`; empty label for plain shapes |
| `s.zone(x, y, w, h, title, {bg, stroke, dash})` | background grouping area, title top-left |
| `s.arrow([[x,y], ...], {label, below, at, line, dash, stroke, sw, start, end, lfs})` | polyline through absolute points; label goes above the longest segment |
| `s.lanes([[key, title, cx, fill], ...], top, bottom)` then `s.msg(X, from, to, y, label, opts)` | sequence diagram: lane headers with lifelines, and horizontal messages |
| `s.grid(x, y, cols, rows, {rowHead, colW, headH, rowH, fs})` | table; a cell `[text, fill]` highlights it |
| `FS`, `FONT` | default font size (20, Excalidraw's M) and font ids (`FONT.excalifont` 5, `FONT.mono` 3) |
| `C.*` | palette: pastel fills (`blue`, `green`, `orange`, `purple`, `red`, `yellow`, `teal`, `gray`), strokes (`sBlue`, `sGreen`, `sRed`, `sOrange`, `sPurple`, `sGray`), `muted` text |

## Layout rules

These came from building diagrams without being able to see them. Following them keeps the lint noise low.

- **Size text to its slot.** Width is estimated as `chars × fontSize × 0.6`, height as `lines × fontSize × 1.25`. Boxes need about 20 px of horizontal padding. At the default `fs` 20 a 300 px cell holds about 23 characters per line. Break lines by hand with `\n`, because nothing wraps automatically.
- **Font:** Excalifont at 20 (Excalidraw's hand-drawn font, size M) is the default for every text, label, lane and table cell, so a diagram matches what a user gets when they add text in the editor. Leave `fs` unset for body text. Use 28 (L) for the title and 16 (S) only for dense table cells and side annotations that would otherwise not fit. Pass `mono: true` for code, identifiers, SQL.
- **An arrow label needs a segment longer than itself.** For a short arrow, move the label with `at`, or rely on a legend. Several arrows meaning the same thing (e.g. "success" transitions) read better as colored arrows plus a legend than as labels on each.
- **Leave room between parallel structures.** When a row of boxes has arrows with labels between them, the gap must fit the label. Lint will flag label/box collisions.
- **Encode meaning with color consistently** within one diagram (e.g. red for today's cost, green for the proposal, amber for "changes in this step"), and add a legend box when color carries meaning.
- **Title every diagram.** Put the takeaway in a closing callout box (`C.yellow`), not in the title.
- Use `roughness` 0 (the default here). Don't use emoji, which Excalidraw's fonts don't render. Arrows such as `→` and math such as `≈ ≠ ×` are fine.
- Sequence diagrams: lanes about 200–350 px apart depending on label length, messages about 65 px apart vertically, cost or notes in a column right of the last lane.
- Tables comparing options side by side (current vs proposed, default vs override): one row per knob, columns for each option, then a "what we gain" and a "what we lose" column. This beats prose when the reader asks "what does changing this buy us".
