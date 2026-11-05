---
name: animated-explainer
description: Explain a concept, a document (design doc, spec, RFC, PR) or the previous reply as one offline HTML deck of hand-drawn animations written in code with Canvas Commons (a TypeScript fork of Motion Canvas), with prose or the quoted source in a side panel. One arrow key, scroll gesture or swipe plays one animation step. The file opens from disk or as an attachment, with no server or network. Use when the user runs /animated-explainer on a topic, a file, a URL, pasted text, or nothing (the previous reply).
license: MIT
---

# Animated explainer

An explainer is prose with animations where motion carries the idea: a number that changes and why, units flowing between places, an order of operations, a before and after. The output is one self-contained HTML file. The animations stay live code in that file (no video): the engine bundles every animation, its runtime and font into the page, so it works offline from `file://`.

**The deck.** A full-screen stage: → / ↓ / space / one scroll gesture / a swipe plays the next step and pauses at its end (pressing during a step completes it and moves on, so one press is always one step), and ← jumps back a step. Each `##` section becomes its animations in order, or a text card when it has none; the intro before the first `##` is the title card; each section's prose sits in a side panel (below the stage on phones and portrait screens; scrolling it never changes slides; `n` toggles it, `f` goes full screen, `i` or a click on the section name opens an index of sections to jump to, the URL hash `#12` opens step 12). The GIF button or `g` downloads the current animation as a looping GIF (for Confluence, Jira, Slack or email, where the deck can't be embedded). The deck follows the system's light or dark theme; `t` or the ◐ button switches it, and the choice is remembered.

`SKILL_DIR` is this skill's base directory. The engine (Canvas Commons, Vite, Playwright, the house kit) lives in `SKILL_DIR/engine`; the first build installs its dependencies and Playwright's Chromium (about 150 MB plus a browser download, once). Don't scaffold a project or run `npm create`.

## What the request asks for

- **A question or topic:** work out the answer as you normally would (read code, run commands, look things up), then explain it.
- **A file path, a URL or pasted text:** read it fully, fetching a URL with whatever tool can read it (a connector, a CLI, a web fetch), and explain its concepts.
- **Nothing:** explain your previous reply in this conversation.

Write labels, captions and prose in the source's language, and pass `--lang` to the build (`--lang pt-BR` formats `161500` as `161.500`).

## Workflow

1. **Get the facts right.** Every number, name and rule shown must come from the source or from something you ran. Animations state things more confidently than prose, so a wrong value does more damage. When drawing exposes an inconsistency in the source (numbers that don't add up), draw what is correct and tell the user what you found. Recompute any arithmetic you animate.

2. **Decide what each screen covers.**
   - **Explaining a source document** (a design doc, spec, RFC, PR, article): read `references/source-documents.md` now and follow it. The deck covers the document section by section in its order, each side panel quotes the source word for word with the current step's passage highlighted, and the build checks that every heading is covered.
   - **Explaining a topic or your previous reply:** pick the ideas that most need motion (a change over time, a flow, two orderings that diverge, a formula that breaks on one input) and leave definitions and lists to the panel prose.
   - In both cases one animation explains one idea; past about 12 steps, split it into consecutive animations in the same section.

3. **Design the picture before the steps.** Read "Make it intuitive" below and `references/visual-toolbox.md`. For each animation, write two or three candidate visual metaphors in one sentence each, then pick the one where a viewer could predict the next step before it happens. Say in your reply which you picked and why.

4. **Storyboard in steps:** for each step, one visible change and one caption sentence that says what changed and why. A viewer with no voiceover reads the caption, so it carries the explanation; the canvas shows it. Each caption starts a step, and the deck pauses on each step's last frame, so that frame must read on its own: caption plus finished motion. Keep steps brisk (tweens 0.4–0.8 s; the kit's default holds are short) since viewers step at their own pace. Open with a still step that shows the starting state (`yield* cap('...')` before any motion): if the first step is a `cap.beat`, its resting frame already shows the result and the viewer never sees where things began. End on a held step that states the takeaway (the number or rule to remember).

5. **Write the work dir** in `${TMPDIR:-/tmp}/animated-explainer/<slug>/`:

   ```
   page.md                          # the deck: title, prose, figures
   animations/<id>.ts               # one makeProject file per animation
   animations/<id>/<scene>.tsx      # its scene(s)
   ```

   Start from `SKILL_DIR/examples/minimal/` (copy it), which builds as is.
   - **page.md** is markdown. The first `# ` heading is the title. Organize it in `##` sections, one idea each, because the deck is built from them. Put each animation in its section as `<figure class="anim" data-animation="<id>"><figcaption>One line.</figcaption></figure>` on its own line; the figcaption becomes the deck's subtitle for that animation.
     - The panel holds your own prose: the full reasoning, caveats, links, about 300 words, leading with the point. (When explaining a source document it quotes the source instead; see the reference.)
     - The intro (before the first `##`) is the title card: the title, the source link if any, and one or two sentences on what the deck covers. Nothing else: terms, definitions and context that an animation will introduce don't belong here, since stating them up front defeats the animation that shows them.
     - A section with no figure becomes a full-screen text card. Use one only for a section that is itself a list (open questions, dependencies, next steps), never for a concept: every idea worth a section gets an animation. A wall of text where the other sections have pictures reads as the weakest screen.
     - Keep the canvas captions short and the prose complete; the reader gets both.
   - **animations/<id>.ts:** `import main from './<id>/main?scene'; export default makeProject({scenes: [main]});`. The `?scene` suffix is required. Scene file basenames must be unique across the deck.
   - **Scenes** use the house kit (below), `references/visual-toolbox.md` for verified visual recipes, and the API in `references/canvas-commons.md`. Read both references before writing your first scene (in `canvas-commons.md`, at least §1–§6 and §8).
   - **Shared helpers** (a formatter, a reusable sub-scene) go in `animations/lib/*.ts(x)`; a `.ts` directly under `animations/` is taken for a project file.

6. **Build:**

   ```bash
   node SKILL_DIR/engine/build.mjs build <workdir> --out ${TMPDIR:-/tmp}/animated-explainer/<slug>.html [--lang pt-BR] [--replace]
   ```

   It type-checks the scenes, runs the source checks when the work dir has a `source.md`, bundles everything into one HTML, opens it in headless Chromium from `file://`, fails on any page error, and writes one contact sheet per animation to `<workdir>/.frames/<id>.png`: one frame per step at its resting frame (exactly what the deck pauses on), or 8 evenly spaced frames when there are no steps. It also renders each side panel (`panel-<section>.png`) and each text card (`card-<section>.png`). A build that prints the contact sheets is known to load and play.

7. **Look at every contact sheet, panel and card.** This is your only view of the result, so treat it as review, not a formality. Check: text overlapping text or shapes, anything cut off at the edges, labels too small to read, captions out of sync with the motion, an empty or cramped composition, the final frame showing the right numbers, and panel prose that is complete and not cut off. To look closer at one moment, render full-size stills: `node SKILL_DIR/engine/build.mjs frames ${TMPDIR:-/tmp}/animated-explainer/<slug>.html <id> 3.5 7` (it prints where it wrote them). Fix and rebuild with `--replace` until the sheets are clean.

8. **Reply** with a markdown link to the deck (`[<slug>.html](file://<absolute path>)`, the file in the temp dir; don't copy it into the user's project), one line per animation saying what it shows, anything from step 1 you found inconsistent, and what you skipped or couldn't verify.

## Make it intuitive

The failure mode is the animated spreadsheet: a table with jargon column headers whose cells fill in one by one. The numbers are right and the viewer still can't follow. What works is physical: cards that travel between places, tokens that drain from one container into another. Aim for that every time:

1. **Make every quantity something you can see and count.** Units become tokens ("● = 10 requests"), money or size becomes a bar's height, a rate becomes a fraction of two bars with the live percentage, identity (a version, a request, a batch) becomes a card that travels, an order becomes a queue, a rule becomes a gate items pass through. `references/visual-toolbox.md` has a metaphor catalogue and verified recipes.
2. **Nothing changes without a visible cause.** A number moves because tokens left, a bar drained or a card moved, in the same step. Bind labels and formulas to the signals that drive the shapes, so they update together as the viewer watches.
3. **Show the whole system at once, and keep it.** Put source, destination, the running formula and the result on screen together, and build up rather than replacing. A 1920×1080 canvas comfortably holds 20–60 elements: two containers with a dozen tokens each, three bars, a formula and a verdict is normal, not clutter. Being too sparse is the more common mistake. Dim what isn't in focus (opacity 0.3) instead of removing it, and use the camera to zoom into a detail and back out.
4. **Show the consequence, not only the mechanism.** If the point is "the cache loses its warm entries", draw the hit rate and show it drop. If the point is "the average is inflated", put the inflated number next to the honest one and the event that should explain it.
5. **Contrast with twins.** When the explanation compares two rules, orders or options, write the scenario once as a function and run it in two side-by-side panels on the same input. The divergence is what the eye catches.
6. **Plain roles on screen, jargon in the prose.** Label shapes by what they are to the viewer ("waiting", "in flight", "what's left"), and keep identifiers such as `retry_after_ms` for the prose. A table can close a section as a summary, but it shouldn't be the explanation.
7. **Lay time out as space.** When things happen on dates or in an order (deploys on D1 and D3, an incident on D5, phases t0–t3), draw a `timeline` and put each thing under its date as it happens, with the marker moving step by step.
8. **Accumulate the outputs.** When a process produces records (operations, rows, events), build the list on screen as each one is produced, colour-coded like what produced it, so the final frame shows the full result next to its causes.
9. **Wrong, then right.** When the point is that a naive reading fails (averaging averages, dividing by the wrong base), show the wrong one first with ✗ and keep it on screen while the right one arrives with ✓. The contrast is the explanation.
10. **Every key is drawn, never written.** When colour, a style or a unit carries meaning, draw it with the kit's `legend`: a swatch in the exact fill and style, then its label, or a token for a `tokenBox` unit (`[{fill: C.blue, token: true}, '= 1 request']`). Or label the shapes directly. A text key ("blue: version A") makes the viewer translate.
11. **Run it through every case.** When a rule sorts inputs into cases (status codes into branches, errors into categories, failures into outcomes), send an item through each case in turn rather than showing one example and listing the rest. Seeing every branch taken is what makes the rule feel complete.
12. **Follow it to the consumer.** When something travels between systems (an error, a request, an event), carry it all the way to where its consumer sees it: the app's screen, the client's response, the other team's API. Stopping at the middle of the path leaves the reader to imagine the end.
13. **Be inventive.** Canvas Commons can move, morph, reflow, zoom, follow paths and bind anything to live values (`references/visual-toolbox.md` §11). Ask what would make this idea physical, and don't settle for boxes with numbers in them when a better picture exists.

## House kit (`animate-kit`)

```tsx
import {C, CONTENT_Y, H, MONO, W, bar, caption, chip, fmt, jsonCard, legend, setup, source, step, table, timeline, tokenBox} from 'animate-kit';

export default makeScene2D(function* (view) {
  setup(view);                       // paper background, Patrick Hand font, size 40
  const cap = caption(view);         // caption strip along the bottom 150 px
  // A step whose motion matches its caption: caption and tweens run together,
  // then it holds for the rest of the reading time (≥ 0.4 s on the end state).
  yield* cap.beat('The queue empties, so the worker sleeps.', depth(0, 1.2), worker().fill(C.gray, 1.2));
  yield* cap('A caption alone, held ~0.17 s per word (min 0.7 s).');
  yield* cap('Short pause.', 0.6);   // explicit hold in seconds
  const t = table(view, {cols: ['job', 'attempts'], rows: [['A', '1']], y: CONTENT_Y, colW: [160, 200]});
  yield* t.cell(0, 1).text('2', 0.5);  // tween a cell (row 0 = first data row)
  yield* t.flash(0, 1, C.yellow);      // flash a cell; t.box(r, c).fill(color, 0.3) to keep a colour
  step();                              // a step boundary without a caption (rarely needed)
  source('rule-retry');                // document mode: highlight a quoted passage for the next step
});
```

The kit also has `jsonCard` (a payload, schema or config drawn as key/value rows that can be added, flagged and removed), `chip` (a pill label, such as an error code or field name, that travels between places), `tokenBox` (countable tokens in a container that move and reflow), `bar` (a bar bound to a signal), `legend` (colour swatches with labels), `timeline` (a dated axis with a moving marker; `t.at('D3')` gives the x to place things under a date) and `fmt` (numbers in the deck's language: `fmt(161500)` → `161,500`, or `161.500` with `--lang pt-BR`). Their usage is in `references/visual-toolbox.md`.

- **Steps:** every `cap(...)`/`cap.beat(...)` call starts a step, and the deck's step counter comes from them. Prefer `cap.beat` whenever a caption describes motion: with `cap(...)` followed by tweens, the caption sits on screen describing something that hasn't happened yet. Put each step's motion inside its own `cap.beat`, so the step's resting frame shows that motion finished.
- **Dark mode is automatic:** the deck inverts every canvas with an Excalidraw-style filter (`--canvas-filter` in `engine/style.css`), so scenes keep the light paper palette below. Don't pick colours for dark mode or read the theme in a scene; contact sheets always show the light version.
- **Palette `C`:** pastel fills `blue green red yellow orange purple teal gray` with `ink`, `muted`, `paper`, `white`, and strokes `sBlue sGreen sRed sOrange sPurple`. Keep one meaning per colour within a deck (e.g. red for wrong, green for success, yellow for what changes) and say what each means in the prose or a caption.
- **Canvas:** 1920×1080, origin at the centre, y grows down. The caption strip covers y > 390, so center compositions on `CONTENT_Y` (−75) and keep content between y −520 and 380.
- **Readability:** the deck often shows the canvas about 930 px wide, so canvas text renders at about half size. Use 40 px or more for any label the viewer must read (this font reads small), 44 for captions, and 32 only for secondary annotations. Code, JSON and identifiers use the monospace `MONO` at 30 px minimum: when a value doesn't fit, shorten it (`"…already exists"`, `ERR_…_TAKEN`) or give the card more width; don't go below 30. Dense scenes stay readable through grouping and alignment, not by shrinking text.
- **Hand-drawn style:** add `rough` to shapes (Rect, Circle, Polygon, Line) and give each a fixed `roughSeed` so it doesn't shimmer. Text is never rough; it uses the hand-drawn font.

## Gotchas

- **Every tween needs `yield*`.** `node().x(100, 1)` without it does nothing. Refs are functions: `rect().fill(...)`.
- **Invisible by default:** Line needs `stroke` and `lineWidth`; shapes have no fill; Txt needs `fill` (the kit's `setup` doesn't set it, so pass `fill={C.ink}`).
- **Use `waitFor`, never `waitUntil`:** time events come from the editor, which nobody opens here, so `waitUntil` waits 0 s.
- **Reactive text:** bind a label to a signal with `text={() => \`qty = ${q().toFixed(0)}\`}` and tween the signal (`yield* q(0, 1.2)`), so a counter and its label stay in sync.
- **Layout is opt-in:** only nodes under a `layout` root flow; everything else is positioned by `x`/`y`. A Txt in a flex row needs `minWidth={0}` to shrink.
- **Motion Canvas habits:** imports are `@canvas-commons/core` and `@canvas-commons/2d` (no subpaths), and `offset` is now `anchor`.
- **Camera:** it renders only its `scene()`. Add nodes as JSX children of `<Camera>` or with `cam().scene().add(...)`; `cam().add(...)` makes them invisible. Animate `zoom()`, never `scale`. Keep the caption outside the camera.
- **JSX fragments returned from `.map()` may render nothing;** wrap each item in a `<Node>`, or in a `<Layout>` when the items sit in a flex row or column (a `<Node>` there takes them out of the layout).
- **A node's position in scene coordinates** (what anything added to the view uses) is `node.position.view()`, even for a child deep in a layout: use it to fly a chip onto a row of a `jsonCard` or a bin. `absolutePosition()` is measured from the canvas's top-left corner, so a chip sent there flies off screen.
- **Drawing order is insertion order:** a node added later draws on top. Add containers before the things that move into them, or call `node.moveToTop()` on the mover.
- **Colour held in a plain signal doesn't blend:** tween a node's `fill`/`stroke` directly (`rect().fill(C.red, 0.4)`), or create the signal with `Color.lerp` as its interpolation.
- **Rough shapes:** a rough Line ignores `end`/`start` (the full line shows from the first frame and only the arrowhead travels), so leave `rough` off a Line that draws on. Dashed outlines don't render on rough shapes, so leave `rough` off a shape that needs `lineDash`. Rough fills are see-through hachure, so use `roughFillStyle={'solid'}` where shapes overlap or colour carries meaning. A rough Rect with zero width still draws a stray line; hide it with opacity instead.
- **Mid-motion glitches don't show on contact sheets,** which capture each step's end. When a step tweens several bound values at once (a formula over a growing denominator), render a still mid-step with `frames`.
- The build leaves `.meta` files next to the scenes; that's expected.

## Follow-ups

The deck embeds its sources. To change a deck you built earlier (or one the user sends back):

```bash
node SKILL_DIR/engine/build.mjs extract ${TMPDIR:-/tmp}/animated-explainer/<slug>.html <workdir>
# edit page.md or the scenes, then
node SKILL_DIR/engine/build.mjs build <workdir> --out ${TMPDIR:-/tmp}/animated-explainer/<slug>.html --replace
```

Then review the new contact sheets as in step 7 and remind the user to reload.
