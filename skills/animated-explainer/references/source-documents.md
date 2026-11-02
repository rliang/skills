# Explaining a source document

Read this when the input is a document (a design doc, spec, RFC, PR description, article). The deck then covers the document section by section in its order, each side panel quotes the source word for word, and each step highlights the passage it acts out. The build checks coverage and the step-to-passage ties.

## Save the source

Save the document as `source.md` in the work dir, as markdown with its own headings. Its presence turns on the build's coverage check.

## Cover it section by section, in its order

- **Every chapter gets an animated screen.** Each top-level section of the document (its chapters, or its numbered sections) gets at least one `##` deck section with an animation, in the document's order. Don't drop a chapter because it seems less visual: find its picture (a comparison, a flow, a before/after); a short animation of 3–6 steps is fine for a thin chapter.
- **Every subsection is quoted somewhere.** Each second-level section appears in some side panel: on its own screen when it has something that changes, flows or decides, otherwise folded into the panel of the nearest screen, with its passages tied to the steps that touch them. Redundancy is fine: a passage can be quoted in two panels.
- **Expect a long deck.** A large design doc becomes about 12–20 screens. Keep minor screens to 3–6 steps and give the core ones the depth. The document's main decision (option A vs B, the trade-off it settles) gets the twin treatment: the options side by side on the same input, then a stamp on the chosen one.

## The panel shows the source, not your summary

Start each section's panel with a `<p class="src-ref">` naming the source headings it quotes (with a link when there is one), then copy the relevant passage as a blockquote, word for word:

```markdown
## Rejecting a burst

<p class="src-ref"><a href="https://www.rfc-editor.org/rfc/rfc6585#section-4">RFC 6585 §4 429 Too Many Requests</a></p>

> The 429 status code indicates that <mark data-src="too-many">the user has sent too many requests in a given amount of time</mark> ("rate limiting"). The response representations SHOULD include details explaining the condition, and <mark data-src="retry-after">MAY include a Retry-After header indicating how long to wait before making a new request.</mark>

<figure class="anim" data-animation="burst"><figcaption>A burst past the limit gets 429.</figcaption></figure>
```

- Cut what doesn't belong with `[...]`, but don't paraphrase or correct inside the quote; put a short note after it for anything you found wrong or ambiguous.
- Copy tables and code blocks from the source as they are, inside the quote.
- When a panel quotes several headings, name them all: `Design doc · Current state › Implementation details · Error examples`.

## Tie steps to the passage

- Wrap the sentence or clause each step illustrates in `<mark data-src="<id>">…</mark>` (an id can mark several spans), and call `source('<id>')` right before that step's `cap(...)`/`cap.beat(...)`:

  ```tsx
  source('too-many');
  yield* cap.beat('Request 11 finds the bucket empty: 429.', ...);
  ```

- A `<mark>` can't go inside a code block or table. To tie a step to one, put `<div data-src="<id>">` on its own line before it and `</div>` after it, with blank lines around both (inside a blockquote, prefix those lines with `> ` too).
- **Highlights walk the panel top to bottom,** so the reader's eye moves down the quote as the animation advances: quote the excerpts in the order the steps use them (excerpts separated by `[...]` may be reordered; the words inside each stay verbatim).
- The deck highlights the current step's passages, keeps earlier steps' faint, and scrolls the panel to them, so the reader always sees which rule the motion is acting out. Give every step that applies a rule a passage; a step that only sets the scene can have none.

## What the build checks

- **Ties:** it fails on a `source()` id with no matching `<mark data-src>` or `<div data-src>`, and warns about marked passages no step points to.
- **Order of highlights:** it warns when a step's highlight jumps back up the panel.
- **Coverage:** it matches every source heading down to the second level (`--cover-depth 2`, the default) against the src-refs, and fails on a heading that none names. Skip a heading only when it has nothing to explain (a reading guide, an empty placeholder), with `<!-- skip: <heading> — <reason> -->` in page.md.
- **Order of sections:** it warns when deck sections go out of the source's order.

## Reviewing the panels

The build renders each panel to `<workdir>/.frames/panel-<section>.png` with every tied passage shown faint. Check that the quote is the source's own words, that every step's passage is marked, and that nothing is cut off.
