// House style for animated-explainer decks: palette, scene setup, captions/steps, tokens, bars, number table.
import {Circle, Layout, Line, Node, Rect, Txt, View2D} from '@canvas-commons/2d';
import {SignalValue, SimpleSignal, ThreadGenerator, all, createRef, createRefArray, sequence, usePlayback, useScene, useTime, waitFor} from '@canvas-commons/core';

/** Excalidraw-like palette: pastel fills, dark ink, one accent per meaning. */
export const C = {
  ink: '#1e1e1e', muted: '#868e96', paper: '#fdfcf9', white: '#ffffff',
  blue: '#a5d8ff', green: '#b2f2bb', red: '#ffc9c9', yellow: '#ffec99',
  orange: '#ffd8a8', purple: '#d0bfff', teal: '#96f2d7', gray: '#e9ecef',
  sBlue: '#1971c2', sGreen: '#2f9e44', sRed: '#e03131', sOrange: '#e8590c', sPurple: '#6741d9',
};

export const FONT = 'Patrick Hand';
/** Canvas is 1920×1080; the deck often shows it ~930 px wide, so 1 canvas px ≈ 0.48 screen px. */
export const W = 1920, H = 1080;
/** Caption strip occupies the bottom; keep content above this y. */
export const CONTENT_BOTTOM = H / 2 - 150;
/** Vertical center of the area above the caption strip (y = -75). Center compositions here. */
export const CONTENT_Y = (-H / 2 + CONTENT_BOTTOM) / 2;

/** Paper background, hand-drawn font, ink text. Call first in every scene. */
export function setup(view: View2D, fontSize = 40) {
  view.fill(C.paper).fontFamily(FONT).fontSize(fontSize);
}

/**
 * Marks the start of a step (beat). The deck plays one step per key press,
 * pausing on each step's last frame. Captions mark steps on their own;
 * call this directly only for a step without a caption.
 */
export function step() {
  const scene = useScene() as unknown as {__animateMarks?: Set<number>};
  (scene.__animateMarks ??= new Set()).add(usePlayback().frame);
}

/**
 * Ties the next step (the one whose caption comes next) to passages of the
 * source shown in the deck's side panel: ids of `<mark data-src="id">` in
 * page.md. The deck highlights them while that step is on screen and scrolls
 * them into view. Call it just before the step's `cap(...)`/`cap.beat(...)`.
 */
export function source(...ids: string[]) {
  const scene = useScene() as unknown as {__animateSources?: {frame: number; ids: string[]}[]};
  (scene.__animateSources ??= []).push({frame: usePlayback().frame, ids});
}

/**
 * Caption strip at the bottom of the canvas. Each call starts a step.
 * - `yield* cap('text')` swaps the caption, then holds ~0.17 s per word (min 0.7 s).
 * - `yield* cap.beat('text', ...tweens)` swaps the caption and runs the tweens
 *   at the same time, so the caption never runs ahead of the motion; it then
 *   holds for whatever reading time is left (at least 0.4 s on the end state).
 */
export function caption(view: View2D, opts: {fontSize?: number; hold?: boolean} = {}) {
  const txt = createRef<Txt>();
  view.add(
    <Rect y={H / 2 - 75} width={W} height={150} fill={'#f4f1ea'}>
      <Txt ref={txt} width={W - 160} textAlign={'center'} fill={C.ink}
           fontSize={opts.fontSize ?? 44} text={''} />
    </Rect>,
  );
  // ~0.17 s per word, at least 0.7 s: brisk by default, since the viewer can
  // pause or step back. Pass an explicit hold for a step that needs more.
  const readTime = (text: string) => Math.max(0.7, text.split(/\s+/).length * 0.17);
  function* show(text: string) {
    if (txt().text()) yield* txt().opacity(0, 0.15);
    txt().text(text);
    yield* txt().opacity(1, 0.15);
  }
  function* cap(text: string, readSeconds?: number) {
    step();
    yield* show(text);
    if (opts.hold !== false) yield* waitFor(readSeconds ?? readTime(text));
  }
  cap.beat = function* (text: string, ...tweens: ThreadGenerator[]) {
    step();
    const start = useTime();
    yield* all(show(text), ...tweens);
    yield* waitFor(Math.max(0.4, readTime(text) - (useTime() - start)));
  };
  return cap;
}

export type TableOpts = {
  cols: string[];
  rows: string[][];
  colW?: number | number[];
  rowH?: number;
  fontSize?: number;
  x?: number;
  y?: number;
  headFill?: string;
};

/**
 * A numbers table built with Layout. Returns `cell(r, c)` (the Txt) and
 * `box(r, c)` (its Rect) with row 0 = first data row; header is `head(c)`.
 * Tween a value with `yield* t.cell(1, 2).text('9.71%', 0.5)` and flag it
 * with `yield* t.flash(1, 2, C.yellow)`.
 */
export function table(parent: Node, o: TableOpts) {
  const widths = o.cols.map((_, i) => (Array.isArray(o.colW) ? o.colW[i] : (o.colW ?? 220)));
  const rowH = o.rowH ?? 72, fs = o.fontSize ?? 36;
  const heads = createRefArray<Txt>();
  const boxes = createRefArray<Rect>();
  const cells = createRefArray<Txt>();
  const root = createRef<Layout>();
  const cell = (text: string, w: number, head: boolean) => (
    <Rect ref={head ? undefined : boxes} width={w} height={rowH} fill={head ? C.gray : C.white}
          stroke={C.ink} lineWidth={2} alignItems={'center'} justifyContent={'center'}>
      <Txt ref={head ? heads : cells} text={text} fill={C.ink} fontSize={fs} />
    </Rect>
  );
  parent.add(
    <Layout ref={root} layout direction={'column'} x={o.x ?? 0} y={o.y ?? 0}>
      <Layout direction={'row'}>{o.cols.map((c, i) => cell(c, widths[i], true))}</Layout>
      {o.rows.map(r => <Layout direction={'row'}>{r.map((v, i) => cell(v, widths[i], false))}</Layout>)}
    </Layout>,
  );
  const n = o.cols.length;
  return {
    root,
    head: (c: number) => heads[c],
    cell: (r: number, c: number) => cells[r * n + c],
    box: (r: number, c: number) => boxes[r * n + c],
    /** Flash a cell and return to white; use box(r, c).fill(color, 0.3) to keep a colour. */
    *flash(r: number, c: number, color: SignalValue<string> = C.yellow) {
      yield* boxes[r * n + c].fill(color as string, 0.2).wait(0.3).to(C.white, 0.3);
    },
    *row(r: number, color: string) {
      yield* all(...o.cols.map((_, c) => boxes[r * n + c].fill(color, 0.3)));
    },
  };
}

/**
 * Number in the deck's language (the build's --lang): fmt(161500) → "161,500",
 * or "161.500" in pt-BR; fmt(0.0971, 'pct') → "9,71%", fmt(914.706, 2) → "914,71".
 */
export function fmt(n: number, style: 'int' | 'pct' | number = 'int', locale?: string) {
  locale ??= (typeof document !== 'undefined' && document.documentElement.lang) || 'en';
  if (style === 'pct')
    return new Intl.NumberFormat(locale, {style: 'percent', minimumFractionDigits: 2, maximumFractionDigits: 2}).format(n);
  const dp = style === 'int' ? 0 : style;
  return new Intl.NumberFormat(locale, {minimumFractionDigits: dp, maximumFractionDigits: dp}).format(n);
}

export type TokenBoxOpts = {
  x?: number; y?: number; width?: number; height?: number;
  title?: string; fill?: string; stroke?: string; seed?: number;
  /** token diameter and gap; tokens wrap in rows inside the box */
  size?: number; gap?: number;
};

/**
 * A container that holds countable tokens (coins, units, requests) laid out in
 * wrapping rows. Tokens are real nodes: move them between boxes with
 * `yield* tok.transitionTo(other.slot, 0.6)` and both boxes reflow. Use one token
 * per N units and say so with a legend ("● = 10 requests").
 */
export function tokenBox(parent: Node, o: TokenBoxOpts = {}) {
  const box = createRef<Rect>();
  const slot = createRef<Layout>();
  const size = o.size ?? 44, gap = o.gap ?? 10;
  parent.add(
    <Rect ref={box} x={o.x ?? 0} y={o.y ?? 0} width={o.width ?? 420} height={o.height ?? 300}
          radius={16} fill={o.fill ?? C.white} stroke={o.stroke ?? C.ink} lineWidth={3}
          rough roughSeed={o.seed ?? 7} roughFillStyle={'solid'}>
      {o.title ? <Txt text={o.title} fill={C.ink} fontSize={36} y={-(o.height ?? 300) / 2 - 30} /> : null}
      <Layout ref={slot} layout direction={'row'} wrap={'wrap'} gap={gap} padding={20}
              width={o.width ?? 420} height={o.height ?? 300} alignContent={'start'} />
    </Rect>,
  );
  const add = (count: number, color: string, label?: string) => {
    const made: Circle[] = [];
    for (let i = 0; i < count; i++) {
      const c = new Circle({size, fill: color, stroke: C.ink, lineWidth: 2});
      if (label) c.add(new Txt({text: label, fill: C.ink, fontSize: size * 0.5}));
      slot().add(c);
      made.push(c);
    }
    return made;
  };
  /** Move tokens into another box, staggered so the eye can follow them. */
  function* moveTo(tokens: Node[], other: {slot: () => Layout}, duration = 0.6, stagger = 0.06) {
    yield* sequence(stagger, ...tokens.map(t => t.transitionTo(other.slot(), duration)));
  }
  return {box, slot: () => slot(), add, moveTo};
}

export type BarOpts = {
  x?: number; y?: number; width?: number;
  /** canvas px per unit of value; negative values grow downward from the baseline */
  scale: number; fill?: string; label?: (v: number) => string; title?: string;
};

/**
 * A bar whose height follows a signal (money, counts). The baseline sits at y;
 * the value label rides on the bar's end. `yield* v(17500, 0.8)` and the bar,
 * its label and anything else bound to `v` move together.
 */
export function bar(parent: Node, value: SimpleSignal<number>, o: BarOpts) {
  const w = o.width ?? 120;
  const h = () => value() * o.scale;
  const node = createRef<Node>(), rect = createRef<Rect>(), label = createRef<Txt>();
  parent.add(
    <Node ref={node} x={o.x ?? 0} y={o.y ?? 0}>
      <Rect ref={rect} width={w} height={() => Math.max(1, Math.abs(h()))} y={() => -h() / 2}
            fill={o.fill ?? C.blue} stroke={C.ink} lineWidth={2} />
      <Txt ref={label} fill={C.ink} fontSize={34} y={() => (h() >= 0 ? -h() - 26 : -h() + 26)}
           text={() => (o.label ?? (v => fmt(v)))(value())} />
      <Rect width={w + 40} height={3} fill={C.ink} />
      {o.title ? <Txt text={o.title} fill={C.ink} fontSize={32} y={() => (h() >= 0 ? 30 : -30)} /> : null}
    </Node>,
  );
  /** node: the whole bar (fade/move it); rect: the bar itself; label: its value text. */
  return {node, rect, label};
}

/**
 * Colour legend drawn as swatches: a small box in exactly the fill each
 * meaning uses, then its label. Prefer labelling shapes directly when there's
 * room; use this when colour alone carries the meaning (versions, states).
 */
export function legend(
  parent: Node,
  /**
   * [fill, label]; or [props, label] to show a style ({fill: C.blue, rough: true,
   * roughFillStyle: 'hachure'}); add `token: true` to draw a token (circle), e.g.
   * [{fill: C.blue, token: true}, '= 10 requests'] for a tokenBox's unit.
   */
  items: [string | Record<string, unknown>, string][],
  o: {x?: number; y?: number; fontSize?: number} = {},
) {
  const fs = o.fontSize ?? 32;
  const node = createRef<Layout>();
  parent.add(
    <Layout ref={node} layout direction={'row'} gap={36} alignItems={'center'} x={o.x ?? 0} y={o.y ?? -480}>
      {items.map(([swatch, label], i) => (
        <Layout direction={'row'} gap={12} alignItems={'center'}>
          {typeof swatch !== 'string' && swatch.token
            ? <Circle size={fs * 0.9} stroke={C.ink} lineWidth={2} {...{...swatch, token: undefined}} />
            : <Rect width={fs * 1.1} height={fs * 0.8} radius={4} stroke={C.ink} lineWidth={2} roughSeed={500 + i}
                    {...(typeof swatch === 'string' ? {fill: swatch} : swatch)} />}
          <Txt text={label} fill={C.ink} fontSize={fs} />
        </Layout>
      ))}
    </Layout>,
  );
  return node;
}

/**
 * A time axis with labelled ticks and a marker. `t.at(label)` is the x of a
 * tick (place things under their date); `yield* t.moveTo('D5', 0.5)` slides
 * the marker. Use it whenever events happen on dates or in an order.
 */
export function timeline(parent: Node, o: {ticks: string[]; x?: number; y?: number; width?: number}) {
  const w = o.width ?? 900, x0 = (o.x ?? 0) - w / 2, y = o.y ?? -440;
  const at = (label: string) => x0 + ((o.ticks.indexOf(label) + 0.5) / o.ticks.length) * w;
  const marker = createRef<Circle>();
  parent.add(
    <Node>
      <Line points={[[x0, y], [x0 + w + 30, y]]} stroke={C.ink} lineWidth={3} endArrow arrowSize={16} />
      {o.ticks.map(t => (
        <Node>
          <Line points={[[at(t), y - 12], [at(t), y + 12]]} stroke={C.ink} lineWidth={3} />
          <Txt text={t} fill={C.ink} fontSize={32} x={at(t)} y={y + 38} />
        </Node>
      ))}
      <Circle ref={marker} size={26} fill={C.sOrange} x={x0} y={y} />
    </Node>,
  );
  return {
    at,
    marker,
    *moveTo(label: string, duration = 0.5) {
      yield* marker().x(at(label), duration);
    },
  };
}

export const MONO = 'ui-monospace, SFMono-Regular, Menlo, monospace';

/**
 * A JSON body (or any key/value record) drawn as rows, for docs about payloads,
 * schemas and configs. Rows can be added, flagged and removed as steps go by:
 *   const body = jsonCard(view, {x: -400, title: '409 today', rows: [['message', '"entity already exists"']]});
 *   yield* body.add('errorCode', '"NAME_TAKEN"', 0.4);
 *   yield* body.mark(1, C.green);       // flag a row
 *   yield* body.remove(0, 0.3);
 * Values are monospace at 30 px and never wrap: the card grows to its longest
 * row (at least `width`). Shorten long values rather than shrinking the font.
 */
export function jsonCard(parent: Node, o: {
  x?: number; y?: number; width?: number; title?: string; rows?: [string, string][];
  fontSize?: number; fill?: string; seed?: number;
}) {
  const fs = o.fontSize ?? 30, w = o.width ?? 640;
  const box = createRef<Rect>(), list = createRef<Layout>();
  const row = (k: string, v: string) => (
    <Rect radius={6} fill={'#ffffff00'} padding={[4, 10]} layout direction={'row'} gap={14}>
      <Txt text={`"${k}":`} fill={C.sBlue} fontFamily={MONO} fontSize={fs} textWrap={false} />
      <Txt text={v} fill={C.ink} fontFamily={MONO} fontSize={fs} textWrap={false} />
    </Rect>
  );
  parent.add(
    <Rect ref={box} x={o.x ?? 0} y={o.y ?? 0} minWidth={w} radius={14} fill={o.fill ?? C.white}
          stroke={C.ink} lineWidth={3} rough roughSeed={o.seed ?? 21} roughFillStyle={'solid'}
          layout direction={'column'} padding={[16, 20]} gap={4}>
      {o.title ? <Txt text={o.title} fill={C.muted} fontSize={30} marginBottom={6} /> : null}
      <Txt text={'{'} fill={C.ink} fontFamily={MONO} fontSize={fs} />
      <Layout ref={list} direction={'column'} gap={2}>{(o.rows ?? []).map(([k, v]) => row(k, v))}</Layout>
      <Txt text={'}'} fill={C.ink} fontFamily={MONO} fontSize={fs} />
    </Rect>,
  );
  const rowAt = (i: number) => list().children()[i] as Rect;
  return {
    box,
    row: rowAt,
    /** The value Txt of row i (tween it with `.text(...)`). */
    value: (i: number) => rowAt(i).children()[1] as Txt,
    *add(k: string, v: string, duration = 0.4) {
      yield* list().add(row(k, v) as unknown as Node, duration);
    },
    *mark(i: number, color: string = C.yellow, duration = 0.3) {
      yield* rowAt(i).fill(color, duration);
    },
    *remove(i: number, duration = 0.3) {
      yield* rowAt(i).remove(duration);
    },
  };
}

/**
 * A pill-shaped label (an error code, a field name, a request) that can travel:
 * `yield* c().position(target().position.view(), 0.6)` flies it onto any node,
 * even one inside a layout (`position.view()` is in scene coordinates, which is
 * what a chip added to the view uses; `absolutePosition()` is measured from the
 * canvas's top-left corner instead). Or `yield* c().transitionTo(layoutParent, 0.6)`.
 * Add containers it flies into before creating the chip, or call `c().moveToTop()`.
 */
export function chip(parent: Node, text: string, o: {x?: number; y?: number; fill?: string; mono?: boolean; fontSize?: number} = {}) {
  const ref = createRef<Rect>();
  parent.add(
    <Rect ref={ref} x={o.x ?? 0} y={o.y ?? 0} radius={999} padding={[8, 18]} layout
          fill={o.fill ?? C.yellow} stroke={C.ink} lineWidth={2}>
      <Txt text={text} fill={C.ink} fontSize={o.fontSize ?? 30} fontFamily={o.mono === false ? FONT : MONO} />
    </Rect>,
  );
  return ref;
}
