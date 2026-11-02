# Canvas Commons API reference

Canvas Commons is an MIT-licensed TypeScript animation library, a fork of Motion Canvas (npm `@canvas-commons/*` 0.4.0, Node 20.19 or newer). This file covers the parts of its API that scenes use. It was read from the library's source at commit `6ac015d`; paths in parentheses are relative to that repo. The engine in `SKILL_DIR/engine` already handles scaffolding, bundling, playback and rendering, so don't run `npm create`, `vite` or the editor yourself. The kit and the snippets in `visual-toolbox.md` were built and rendered; the recipes in §6 were not.

## Contents

1. Core mental model
2. Tweening, easing and flow
3. Signals and derived values
4. Positioning, layout, hierarchy
5. Components cheat sheet
6. Explainer recipes
7. Scenes, transitions, camera
8. Gotchas beyond SKILL.md

---

## 1. Core mental model

- **A scene is a generator.** `makeScene2D(function* (view) {...})`.
  - Add nodes with `view.add(...)`, then `yield*` animations.
  - `yield` on its own means "this frame is done" (`docs/getting-started/flow.mdx`).
- **JSX creates real node instances immediately.** There is no virtual DOM and no React. `const c = <Circle/>` is a live `Circle` (`docs/getting-started/hierarchy.mdx`, `references.mdx`).
- **Every node property is a signal**, and calls are overloaded:
  - `node.fill()` gets the value.
  - `node.fill('#f00')` sets it.
  - `node.fill('#f00', 1)` returns a tween generator that you must `yield*`.
  - `node.fill('#f00', 1, easeOutQuad)` sets the easing.
  - A 4th argument sets the interpolation function (`docs/getting-started/tweening.mdx`).
- **Refs:**
  - `const r = createRef<Rect>(); <Rect ref={r}/>`, then use `r()`. `r` is a function, so remember the parentheses.
  - `createRefArray<Txt>()`: pass the same ref repeatedly. It indexes like an array and supports `.map`.
  - `createRefMap<Txt>()`: `labels.a`, `labels.mapRefs(fn)`.
  - `makeRef(obj, key)` and `makeRefs<typeof Comp>()` (`docs/getting-started/references.mdx`, `core/src/utils/createRefArray.ts`).
- **Coordinates:** origin at scene center, x to the right, **y down**, units are px of the project size (`docs/getting-started/positioning.mdx`).
- **Background:** set `view.fill('#111')`. It can also be animated with `yield* view.fill('...', 2)`. Alternatively, set `shared.background` in `project.meta` (`docs/getting-started/rendering/index.mdx`).

Minimal scene (`examples/src/scenes/quickstart.tsx`):

```tsx
import {Circle, makeScene2D} from '@canvas-commons/2d';
import {all, createRef} from '@canvas-commons/core';

export default makeScene2D(function* (view) {
  const myCircle = createRef<Circle>();
  view.add(<Circle ref={myCircle} x={-300} width={140} height={140} fill="#e13238" />);
  yield* all(
    myCircle().position.x(300, 1).to(-300, 1),
    myCircle().fill('#e6a700', 1).to('#e13238', 1),
  );
});
```

## 2. Tweening, easing and flow

All of the following come from `@canvas-commons/core`. Sources: `core/src/flow/*.ts` and `tweening/*`.

| call | semantics |
|---|---|
| `yield* a; yield* b;` | sequential |
| `all(...tasks)` | run concurrently, wait for all |
| `any(...tasks)` | run concurrently, wait for the first |
| `chain(...tasksOrCallbacks)` | sequential, as a single task (useful inside `all`) |
| `delay(sec, taskOrCallback)` | wait, then run |
| `sequence(delaySec, ...tasks)` | stagger the starts; does not wait for the previous task to finish |
| `loop(n, i => task)` | repeat n times. `loop(factory)` is infinite and **must not run on the main thread**: use `const t = yield loop(...)` and later `cancel(t)` (see `examples/src/scenes/presentation.tsx`) |
| `waitFor(sec)` | wait |
| `waitUntil('event')` | wait for an editor time event; with no editor it waits 0 s, so use `waitFor` |
| `tween(sec, v => {...})` | manual tween, `v` goes from 0 to 1. Use `map(a, b, ease(v))` or `easeInOutCubic(v, a, b)` |
| `spring(PlopSpring, from, to, tolerance?, v => ...)` | physics tween. Presets: `PlopSpring`, `SmoothSpring` |

- Chaining on a single property: `.to(value, sec)`, `.wait(sec)`, `.back(sec)`. Example: `code().code('x', 0.6).wait(0.6).back(0.6)` (`docs/components/code/index.mdx`).
- The default easing is `easeInOutCubic`. Other easings include `linear`, `easeOutBack`, `easeInExpo`, and others (easings.net names).
- Complex types interpolate with `Color.lerp`, `Vector2.arcLerp`, and `Color.createLerp('lab')`.
- `node.save()` / `yield* node.restore(1)` push and pop state.
- `DEFAULT` resets a signal: `signal(DEFAULT)` or `yield* signal(DEFAULT, 1)`.
- Looping over nodes: `yield* all(...rects.map(r => r.position.y(100, 1)))` (`docs/getting-started/flow.mdx`).

## 3. Signals and derived values

Source: `docs/getting-started/signals.mdx`, `examples/src/scenes/node-signal.tsx`.

```ts
const radius = createSignal(1);
const area = createSignal(() => Math.PI * radius() * radius()); // derived, lazy, cached
yield* radius(4, 2).to(3, 2);     // tween the source; dependents update automatically
```

- Any node prop accepts a function, which makes it reactive: `width={() => radius() * 200}`, `text={() => \`A = ${area().toFixed(2)}\`}`.
- Typed signals: `Vector2.createSignal(...)` and `Code.createSignal(...)`.
- Effects (`createEffect` / `createDeferredEffect`) are covered in `docs/getting-started/effects.mdx`.

## 4. Positioning, layout, hierarchy

- **Transforms** are relative to the parent: `position`/`x`/`y`, `scale`, `rotation` (degrees).
- **World space:** `absolutePosition()`, `absoluteScale()`, `absoluteRotation()`.
- **Fork-only space helpers (0.4.0):** `node.x.abs(v, 1)`, `node.position.view(...)`, `position.relativeTo(other)(...)`. See `template/src/scenes/example-transforms.tsx` and `2d/CHANGELOG.md`.
- **Cardinal getters/setters** exist on every `Layout` subclass (Rect, Circle, Txt, Img, ...): `middle`, `top`, `bottom`, `left`, `right`, `topLeft`, `topRight`, `bottomLeft`, `bottomRight`.
  - Reading one returns the point in **parent space**.
  - Setting one moves the node, e.g. `right={rect().left}` (`docs/getting-started/layouts.mdx`).
- `anchor` (renamed from MC's `offset`): `[-1, -1]` is top-left and `[1, 1]` is bottom-right.
  - `anchorX={-1}` left-aligns a node at `x`.
  - `translate` is a visual offset that doesn't affect layout.
- **Flexbox is opt-in.** Put `layout` on the root. Descendants that extend `Layout` are then placed by Yoga, and nested `<Layout>`/`<Rect>` join the flex tree without needing `layout`.
  - `layout={false}` opts a child out.
  - A plain `Node` is transparent to layout, which makes it useful as a group for opacity or filters.
  - Props: `direction`, `gap`, `padding`, `margin`, `alignItems`, `justifyContent`, `wrap`, `grow`, `shrink`, `basis`, `width`/`height` (numbers or `'50%'`), `minWidth`, `maxWidth`, `ratio`.
  - Sources: `docs/getting-started/layouts.mdx`, `examples/src/scenes/layout.tsx`.
- **Animated layout (fork-only)**, available on `Layout` parents (the view is a Layout too). Source: `examples/src/scenes/layout-animations.tsx`.

  ```tsx
  yield* row().insert(<Rect width={100} height={100} fill="red"/>, 1, 0.6); // index, duration
  yield* row().add(<Rect .../>, 0.6);
  yield* someChild.remove(0.6);
  yield* row().editLayout(0.6, n => { n.direction('column'); n.alignItems('end'); });
  yield* node.transitionTo(otherParent, 0.6);   // reparent with tweened world transform
  yield* button.morphTo(modal, 0.4);            // cross-fade into another node
  row().freezeLayout(); /* animate children by hand */ yield* row().thawLayout(0.3);
  ```

- **Hierarchy helpers:** `add`, `insert`, `remove`, `reparent`, `moveUp`, `moveDown`, `moveToTop`, `moveToBottom`, `moveTo`, `moveAbove`, `moveBelow`, `removeChildren`.
- **Queries:** `view.findAll(is(Txt))`, `findFirst`, `findLast`, `findAncestor` (`docs/getting-started/hierarchy.mdx`).

## 5. Components cheat sheet

All components are exported from `@canvas-commons/2d`.

- **Rect.** `width`, `height`, `size`, `fill`, `stroke`, `lineWidth`, `radius` (number or `[tl, tr, br, bl]`), `smoothCorners`, `clip`, `start`/`end` (stroke drawing).
- **Circle.** `size`, `startAngle`, `endAngle`, `closed`, `start`/`end`.
- **Line.** Source: `2d/src/lib/components/Line.ts`, `Curve.ts`.
  - `points` is an array of `[x, y]`, `Vector2`, or **functions returning points**.
  - Other props: `radius` (rounded corners), `closed`, `stroke`, **`lineWidth` (default 0, so it is invisible unless set)**, `lineDash`, `lineCap`.
  - Arrows: `startArrow` / `endArrow` (booleans), `arrowSize` (default 24), `startOffset` / `endOffset` (px gap at each end).
  - **Draw-on animation:** set `end={0}`, then `yield* line().end(1, 0.8)`. `start` can be animated the same way.
- **Spline / CubicBezier / QuadBezier / Path / Polygon.**
  - Spline uses `points` plus `smoothness`.
  - Path uses `data="M..."` (SVG path).
  - All support `start`, `end` and arrows.
  - `curve.getPointAtPercentage(p)` returns `{position, tangent}`, which is useful for moving an object along a curve.
  - Sources: `docs/components/spline.mdx`, `path.mdx`, `bezier.mdx`.
- **Txt.** Source: `2d/src/lib/components/Txt.ts`, `docs/advanced/custom-font.mdx`.
  - Content: `text="..."` or children.
  - Props: `fill` (always set it), `fontFamily`, `fontSize`, `fontWeight`, `lineHeight`, `letterSpacing`, `textAlign` (`'left'|'center'|'right'|'justify'`), `verticalAlign`.
  - Font props are inherited from the parent, so you can set them on `view`, e.g. `view.fontFamily(...).fontSize(...)`.
  - `width` plus wrapping: **`textWrap` defaults to true in 0.4.0**.
  - Fork-only: `autoSize` (shrink to fit a fixed box), `exclusions`, `hyphenate`, `wrapMode('knuth-plass')`, `textPath`.
  - Text tween: `yield* txt().text('NEW', 0.6)` (typewriter/morph).
  - `Txt.split('grapheme'|'word'|'sentence')` returns positioned `Txt[]`. Mount them under a `Node` with the source's position, rotation and scale, then hide the source (TSDoc in `Txt.ts:3268`):

    ```tsx
    const pieces = label().split('word');
    view.add(<Node position={label().position()} rotation={label().rotation()} scale={label().scale()}>{pieces}</Node>);
    label().opacity(0);
    yield* sequence(0.1, ...pieces.map(p => p.opacity(0.2, 0.3)));
    ```

- **Code.** Source: `docs/components/code/index.mdx`.
  - Props: `code`, `fontSize`, `fontFamily`, `selection`, `highlighter`.
  - Highlighting **requires a Lezer grammar**: `npm i @lezer/javascript`, then in `project.ts`:

    ```ts
    import {Code, LezerHighlighter} from '@canvas-commons/2d';
    import {parser} from '@lezer/javascript';
    Code.defaultHighlighter = new LezerHighlighter(parser); // parser.configure({dialect: 'jsx ts'}) for TS
    ```

  - Animation: tween `code` (patience diff), `code.append(s, d)` / `code.prepend`, `code.insert([line, col], s, d)`, `code.replace(range, s, d)`, `code.remove(range, d)`, and `` code.edit(d)`...${insert('x')}${replace('a','b')}${remove('y')}...` ``.
  - Ranges are zero-based: `[[l0, c0], [l1, c1]]`, `lines(a, b?)`, `word(line, col, len?)`, `findFirstRange(str|regex)`, `findAllRanges`, `findLastRange`.
  - Reactive code uses the `` CODE`...${signal}...` `` tag with `Code.createSignal`.
  - Bounding boxes: `getSelectionBBox(range)` returns `BBox[]`, one per line, in local space.
- **Latex.** Source: `docs/components/latex.mdx`.
  - Usage: `<Latex tex="{{a}} + {{b}}" fill="white" fontSize={48}/>`. **`fill` is required, or nothing shows.**
  - Split the formula into parts with `{{}}` or an array, then morph with `yield* tex().tex('{{a}} + {{b}} = {{c}}', 1)`.
  - `tex().map(newTex, indexMap, d)` maps source parts to target parts explicitly.
- **Grid.** `width`, `height`, `spacing`, `stroke`, `lineWidth`, `lineCap` (`examples/src/scenes/positioning.tsx`).
- **Img / Video.** `src` takes an imported asset (`import png from '../img/x.png'`) or a public URL (`'/x.svg'` from `public/`) (`docs/getting-started/media.mdx`).
- **Rough (sketchy) rendering.** Any `Shape` whose class implements path data supports it: Rect, Circle, Polygon, and every Curve (Line, Spline, Bezier, Path). `Txt` overrides `draw()` and never calls `drawShape`, so `rough` has no effect on text; the text still renders normally. Source: `2d/src/lib/components/Shape.ts:249`, `utils/rough.ts`, `examples/src/scenes/home-rough.tsx`.
  - `rough` (bool) turns it on.
  - `roughness` (1), `bowing` (1), `roughFillStyle` (`'hachure'`* `'solid' 'zigzag' 'cross-hatch' 'dots' 'dashed' 'zigzag-line'`), `roughFillWeight`, `roughHachureAngle` (-41), `roughHachureGap`, `roughSeed` (defaults from `useRandom()`, so it is deterministic per scene seed), `roughDisableMultiStroke`, `roughDisableMultiStrokeFill`.
  - Numeric props are animatable: `yield* rect().roughness(5, 1)`.
  - Gradients and patterns fall back to rough.js defaults.

  ```tsx
  <Rect size={200} radius={16} fill={'#fab387'} stroke={'#cdd6f4'} lineWidth={4}
        rough roughness={2} roughFillStyle={'cross-hatch'} roughHachureGap={8} />
  ```

- **Camera.** Covered in §7.
- **withDefaults.** `withDefaults(Code, {highlighter})` builds a preset component (`docs/components/code/index.mdx`).

## 6. Explainer recipes

These are adapted from the examples cited with each one. They have not been executed.

**Arrow drawn between two boxes.** Adapted from `examples/src/scenes/home-git.tsx` (draw-on via `end`), `node-signal.tsx` (function points), and the layout cardinals.

```tsx
import {Line, Rect, Txt, makeScene2D} from '@canvas-commons/2d';
import {all, createRef} from '@canvas-commons/core';

export default makeScene2D(function* (view) {
  view.fill('#111');
  const a = createRef<Rect>(); const b = createRef<Rect>(); const arrow = createRef<Line>();
  view.add(
    <>
      <Rect ref={a} x={-400} width={260} height={120} radius={12} fill={'#1e3a5f'}>
        <Txt text={'transactions-api'} fill={'white'} fontSize={28} />
      </Rect>
      <Rect ref={b} x={400} width={260} height={120} radius={12} fill={'#3b1e5f'} opacity={0}>
        <Txt text={'kpi-worker'} fill={'white'} fontSize={28} />
      </Rect>
      {/* points track the boxes: both are siblings of the Line, so parent-space points line up */}
      <Line ref={arrow} points={[() => a().right(), () => b().left()]}
            stroke={'white'} lineWidth={6} endArrow arrowSize={18}
            startOffset={8} endOffset={8} end={0} />
    </>,
  );
  yield* b().opacity(1, 0.4);
  yield* arrow().end(1, 0.8);               // draw the arrow
  yield* b().position.y(150, 0.8);          // arrow follows (reactive points)
});
```

**Table built with Layout whose cell value tweens.** The flex structure follows `examples/src/scenes/layout.tsx` and the refs follow `createRefArray`.

```tsx
const cells = createRefArray<Txt>();
const rows = [['portfolio', 'positions', 'days'], ['A', '120', '3,100'], ['B', '8', '400']];
view.add(
  <Layout layout direction={'column'} gap={6}>
    {rows.map((row, r) => (
      <Layout direction={'row'} gap={6}>
        {row.map(v => (
          <Rect width={260} height={80} radius={6} fill={r === 0 ? '#333' : '#1b1b1b'}
                alignItems={'center'} justifyContent={'center'}>
            <Txt ref={cells} text={v} fill={'white'} fontSize={34} />
          </Rect>
        ))}
      </Layout>
    ))}
  </Layout>,
);
// cells are row-major: index = r * cols + c
yield* cells[5].text('3,450', 0.6);                       // text morph
yield* cells[5].fill('#ffc66d', 0.3).to('white', 0.6);    // flash
```

To get a smoothly counting cell, give that cell `text={() => ...}` bound to a signal, as in the next recipe.

**Number counter.** Uses the same pattern as `node-signal.tsx`.

```tsx
const total = createSignal(0);
view.add(<Txt fill={'white'} fontSize={96} text={() => total().toFixed(0)} />);
yield* total(1234, 2, linear);   // import {linear} from '@canvas-commons/core'
```

Formatting with `toLocaleString()` works the same way.

**Highlighting a code line.** Adapted from `docs/components/code/index.mdx` ("Code Selection"). `Code.defaultHighlighter` must be set in `project.ts`.

```tsx
import {Code, lines, makeScene2D} from '@canvas-commons/2d';
import {DEFAULT, createRef, waitFor} from '@canvas-commons/core';

export default makeScene2D(function* (view) {
  const code = createRef<Code>();
  view.add(<Code ref={code} fontSize={28} anchorX={-1} x={-400} code={`\
function recalc(p) {
  claim(p);
  compute(p);
  save(p);
}`} />);
  yield* code().selection(lines(1), 0.6);       // zero-based: "claim(p);"
  yield* waitFor(0.5);
  yield* code().selection(lines(2, 3), 0.6);
  yield* code().selection(DEFAULT, 0.6);        // clear
});
```

**Data packet moving along an arrow.** Adapted from "Animating objects along a spline" in `docs/components/spline.mdx`.

```tsx
const progress = createSignal(0);
view.add(<Circle size={24} fill={'#ffc66d'}
  position={() => arrow().getPointAtPercentage(progress()).position} />);
yield* progress(1, 1.2);
```

Positions are in the curve's local space, so this matches only when the curve sits at the origin of the same parent.

**Before/after comparison.** Put two `Rect` panels in a `<Layout layout direction="row" gap={40}>`, or use two `Camera.Stage` views of a single scene (§7). The diff itself can be shown with `Code` tweening or `Txt.text` tweening.

## 7. Scenes, transitions, camera

- **Multiple scenes:** `makeProject({scenes: [first, second]})`, with each imported via `?scene`. The scene name is the file basename.
- **Transitions** (`docs/getting-started/transitions.mdx`, `examples/src/scenes/transitions-second.tsx`): call `view.add(...)` first, then `yield* slideTransition(Direction.Left)`.
  - Built-in: `slideTransition`, `zoomInTransition`, `zoomOutTransition`, `fadeTransition`, `waitTransition`.
  - `finishScene()` starts the next scene's transition early.
  - Write custom transitions with `useTransition(ctx => ..., prevCtx => ...)`.
- **Camera** (`docs/getting-started/camera.mdx`): wrap content in `<Camera ref={cam}>...</Camera>`.
  - Methods: `cam().centerOn(node | [x, y], d)`, `cam().zoom(2, d)` (**never set `scale` on the camera**), `cam().rotation(...)`, `cam().reset(d)`, `cam().followCurve(curve, d, linear)`.
  - Split screen: `<Camera.Stage cameraRef={c1} scene={scene} size={[w, h]} .../>`. The `scene` must be a single `<Node>`, not a fragment.

## 8. Gotchas beyond SKILL.md

`SKILL.md` lists the gotchas every scene runs into (`yield*`, refs, invisible defaults, `waitFor`, layout, camera, rough shapes). These are the rest.

1. **Motion Canvas drift.** Most training data is Motion Canvas (`docs/migration/from-motion-canvas.mdx`, `migration/0.4.0.mdx`):
   - `node.relativeTo(other)` now returns coordinates in `other`'s space.
   - `TxtLeaf` cannot be styled directly.
   - `textWrap` defaults to `true`, so a `<Txt>` with a width wraps.
   - `Layout.element`, `Layout.styles` and `View2D.shadowRoot` were removed.
2. **`yield task`** (no `*`) starts the task in the background without waiting for it.
3. **Reading a ref before its node is added** returns `undefined`.
4. **`Latex` needs `fill`**, like `Txt`.
5. **Code highlighting** requires `@lezer/<lang>` (install it in `SKILL_DIR/engine`) plus `Code.defaultHighlighter` or a per-node `highlighter`. Without them, code renders in one colour.
6. **Infinite `loop(fn)` on the main thread** logs an error and returns. Use `const t = yield loop(...)`, then `cancel(t)`. A `while (true)` without a `yield` freezes the page.
7. **Don't call `beginSlide`.** The engine's player pauses at it and waits for an editor that isn't there. Steps come from the kit's `cap(...)`/`step()`.
8. **TypeScript.** `strictNullChecks` is off and `experimentalDecorators` is on (needed by custom components with `@signal()`/`@initial()`). JSX is not React: no hooks, no `key`-based diffing.
