# Visual toolbox

Ways to turn an abstract idea into something a viewer can watch happen. Every snippet here was built and rendered with this engine (kit + Canvas Commons 0.4.0) unless marked otherwise. For the full API see `canvas-commons.md` (§ numbers below refer to it).

## Contents

1. Metaphor catalogue: which picture for which kind of idea
2. Quantities you can count: `tokenBox`
3. Money and sizes: `bar` bound to a signal
4. Live formulas and labels
5. Identity that travels: cards (with a sparkline)
6. Connectors that follow nodes
7. Focus: dim, zoom, and the camera
8. Twins: the same input under two rules
9. Legend, timeline, ledger
10. Payloads and routing: `jsonCard`, `chip`
11. More from Canvas Commons worth reaching for

## 1. Metaphor catalogue

| The idea is about… | Show it as… |
|---|---|
| a quantity of units (shares, requests, rows) | tokens in a container, one token per N units, keyed with a drawn token: `legend(view, [[{fill: C.blue, token: true}, '= 10 requests']])` |
| an amount of money, a size, a base | a bar whose height is the value; negative grows below the baseline |
| a ratio or a rate (return = pnl / base) | a fraction built from two bars (numerator above, denominator below) plus the live percentage; the eye sees the denominator shrink and the rate jump |
| an average | a balance or seesaw: weights at their prices, the pivot at the weighted mean; or tokens lined up on a price axis |
| something with identity (a version, a request, a batch) | a card with a colour, a short label and a mark of what it carries (a sparkline for a curve or rate), moving as one object |
| an order of operations | a queue or conveyor; items enter a "machine" one by one |
| a rule or a check (`qty = 0 ?`) | a gate that items pass through, lighting green or red, with the condition written on it |
| two policies, two orders, before vs after | twins: the same scene run side by side with one difference |
| a total vs its parts | parts stacked into the total, then pulled apart again |
| where a value comes from | a connector line from the source to the label, drawn while the value tweens |
| a payload, schema or config (an error body, a request, a table row) | a `jsonCard` whose rows appear, get flagged and disappear as the rule applies; two cards side by side for before/after or option A/B |
| routing or classification (which branch, which category, how far an error travels) | `chip`s that fly through a gate or into one of several labelled bins; the gate states its condition |
| a boundary between systems (services, client/server, app versions) | lanes or boxes per system, with chips crossing or stopping at the boundary |

Pick the metaphor where a viewer could predict the next step before it happens. If you can't say in one sentence what moves and why, the metaphor is wrong.

## 2. Quantities you can count: `tokenBox`

```tsx
const queue = tokenBox(world, {x: -560, y: CONTENT_Y, title: 'queue', seed: 1});
const worker = tokenBox(world, {x: 0, y: CONTENT_Y, title: 'worker', seed: 2});
const batchA = queue.add(12, C.blue);   // 12 tokens (● = 10 jobs → 120)
const batchB = queue.add(5, C.teal);
yield* cap.beat('FIFO: batch A goes whole, then 30 jobs of B.',
  queue.moveTo([...batchA, ...batchB.slice(0, 3)], worker));   // staggered flight, both boxes reflow
```

Key the unit with a drawn token, not text: `legend(view, [[{fill: C.blue, token: true}, '= 10 jobs']], {x: -560, y: -480})`.

Tokens are real nodes: `transitionTo` reparents them and tweens their world position, and the source and destination layouts reflow. Size, gap, box width and height are options; tokens wrap in rows. Give each box a different `seed` so the rough outlines differ.

## 3. Money and sizes: `bar`

```tsx
const used = createSignal(4000);
bar(world, used, {x: 560, y: 200, scale: 0.08, fill: C.orange, title: 'memory (MB)'});
yield* cap.beat('Eviction frees the cold entries.', used(1500, 0.8));
```

The bar's height, its value label (in the page's locale via `fmt`) and anything else bound to `used` move together. Negative values grow downward, and the title moves above the baseline. Choose `scale` so the largest value is at most ~350 px. `bar` returns `{node, rect, label}` refs, so you can fade or move one bar (`yield* b.node().opacity(0.3, 0.4)`).

When two values on the same scale differ by 100× (1,700 errors against 161,500 requests), the small one becomes a 3 px sliver. Give it its own scale and say so on screen ("errors ×20"), or show the ratio as a text fraction next to the bars.

## 4. Live formulas and labels

```tsx
world.add(<Txt fill={C.ink} y={-420} fontSize={52}
  text={() => `${fmt(errors())} / ${fmt(requests())} = ${fmt(errors() / requests(), 'pct')}`} />);
```

Bind every number on screen to the signal that drives the shape, so the formula updates as the picture changes. To colour the parts of a formula differently, use one `Txt` per part in a `<Layout layout direction="row" gap={12}>` and colour each to match its shape (the denominator in the bar's colour).

## 5. Identity that travels: cards

```tsx
const curve = [0, 8, 5, 14, 12, 20, 26];   // e.g. its latency over time, scaled to fit
<Rect ref={card} width={300} height={120} radius={12} fill={C.yellow} stroke={C.ink}
      lineWidth={3} rough roughSeed={9} roughFillStyle={'solid'}>
  <Txt text={'v2 (deployed D1)'} fill={C.ink} fontSize={32} y={-28} />
  <Line points={curve.map((v, i) => [-120 + i * 40, 40 - v * 1.5])} stroke={C.sBlue} lineWidth={4} />
</Rect>
```

Move it with `card().position([x, y], 0.8)` or `card().transitionTo(otherContainer, 0.6)`. To show a consequence ("the curve restarts"), tween the sparkline's points or swap the card with `morphTo`.

## 6. Connectors that follow nodes

```tsx
world.add(<Line points={[() => card().bottom(), () => x.box().top()]} stroke={C.muted}
                lineWidth={3} lineDash={[10, 8]} endArrow arrowSize={14} />);
```

The function points re-evaluate every frame, so the line follows either end as it moves. Both nodes must share a parent (or convert positions with `absolutePosition()`). Leave `rough` off a connector you want to draw on with `end`.

## 7. Focus: dim, zoom, camera

- **Dim instead of removing:** `yield* thing.opacity(0.3, 0.4)` keeps context on screen while pointing at the focus. Restore with `opacity(1, 0.4)`.
- **Camera:** `view.add(<Camera ref={cam} />); const world = cam().scene();` then add everything to `world`. The camera renders only its `scene()`: nodes added with `cam().add(...)` are invisible. Then `yield* all(cam().centerOn(node, 0.8), cam().zoom(1.8, 0.8))`, and `yield* cam().reset(0.8)` to come back. Keep the caption outside the camera (add it to `view`) so it doesn't zoom.
- Zoom in to show a detail (one item's numbers), then out to show where it sits in the whole.

## 8. Twins

Write the scenario once as a function that takes a container and a rule, and call it for two side-by-side panels:

```tsx
function* runScenario(panel: Node, rule: 'inFirst' | 'outFirst') { /* build and animate inside panel */ }
yield* all(runScenario(left(), 'inFirst'), runScenario(right(), 'outFirst'));
```

Same layout, same input, one difference: the divergence is what the eye catches. Label each panel with its rule, and end with both outcomes visible and the difference highlighted.

## 9. Legend, timeline, ledger

```tsx
legend(view, [[C.gray, 'today: one row per day'], [C.orange, 'cached'], [C.purple, 'recomputed']], {x: -380, y: -480});

const t = timeline(view, {ticks: ['D1', 'D3', 'D5'], y: -360, width: 1100});
const a = tokenBox(view, {x: t.at('D1'), y: CONTENT_Y + 120, width: 300, height: 200, title: 'batch A'});
yield* cap.beat('D5: the job retries.', t.moveTo('D5'));
```

A ledger is a `Layout` column you `add` rows to as the process produces them: one `Rect` per record, filled with the colour of whatever produced it and a short label (`INSERT · batch A`). Use `yield* ledger().add(<Rect .../>, 0.4)` so each row slides in on its step. It reads best beside the cause: producers on the left, the records they generate on the right.

## 10. Payloads and routing: `jsonCard`, `chip`

```tsx
const body = jsonCard(view, {x: -420, y: CONTENT_Y, title: '409 today', rows: [['code', '409'], ['message', '"entity already exists"']]});
yield* cap.beat('The proposal adds a stable code.', body.add('errorCode', '"NAME_TAKEN"'));
yield* body.mark(2, C.green);

const c = chip(view, 'NAME_TAKEN', {x: -420, y: 300});
yield* cap.beat('The app branches on the code, not the message.', c().position(bin().position.view(), 0.6));
```

Rows are monospace at 30 px. Create bins and gates before the chips that fly into them (drawing order), or call `c().moveToTop()`.

## 11. More from Canvas Commons

Not exercised by the kit, but documented in `canvas-commons.md`:
- **Layout animations:** `insert`/`add`/`remove` with a duration, `editLayout`, `transitionTo`, `morphTo` (§4).
- **Splines and paths:** move an object along a curve with `getPointAtPercentage` (§6, "Data packet").
- **`Txt.split`:** break a sentence or formula into pieces and animate each (§5).
- **Latex:** `{{a}} + {{b}}` parts that morph into a new equation (§5). It requires `fill`.
- **Springs:** `spring(PlopSpring, from, to, ...)` for physical-feeling arrivals (§2).
- **`sequence(delay, ...)`:** staggers many small motions so the eye can follow a crowd (§2).
