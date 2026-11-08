// Excalidraw scene builder + Obsidian Excalidraw-plugin file writer.
// Scene API and lint are copied from the sibling `excalidraw` skill so this skill installs on its own.
// Differences: arrow() can bind to shapes (o.from / o.to), and toObsidianMd() replaces the share-link upload.

let seed = 1000;
const CW = 0.6; // avg glyph width / fontSize, Excalifont and Cascadia (mixed-case labels measure ~0.55, caps ~0.69)
const LH = 1.25;
export const FONT = { excalifont: 5, mono: 3 }; // excalidraw FONT_FAMILY ids
export const FS = 20; // excalidraw "M" font size

export const C = {
  // fills
  blue: "#a5d8ff", green: "#b2f2bb", orange: "#ffd8a8", purple: "#d0bfff", red: "#ffc9c9",
  yellow: "#fff3bf", teal: "#c3fae8", gray: "#e9ecef", gray2: "#dee2e6", white: "#ffffff",
  // strokes / text
  sBlue: "#1971c2", sGreen: "#2f9e44", sRed: "#e03131", sOrange: "#e8590c", sPurple: "#6741d9",
  sGray: "#868e96", muted: "#495057", border: "#adb5bd",
};

export function measure(s, fs) {
  const lines = s.split("\n");
  return [Math.max(...lines.map((l) => l.length)) * fs * CW, lines.length * fs * LH];
}

export class Scene {
  constructor() { this.els = []; this.n = 0; this.req = new Map(); }
  id(p) { return `${p}${++this.n}`; }

  base(type, x, y, w, h, o = {}) {
    const e = {
      id: o.id ?? this.id(type[0]), type, x, y, width: w, height: h, angle: 0,
      strokeColor: o.stroke ?? "#1e1e1e", backgroundColor: o.bg ?? "transparent",
      fillStyle: "solid", strokeWidth: o.sw ?? 1, strokeStyle: o.dash ? "dashed" : "solid",
      roughness: o.rough ?? 0, opacity: o.opacity ?? 100, groupIds: [], frameId: null,
      roundness: type === "rectangle" && o.round !== false ? { type: 3 } : null,
      seed: seed++, version: 1, versionNonce: seed++, isDeleted: false,
      boundElements: null, updated: 1, link: null, locked: false,
    };
    this.els.push(e);
    return e;
  }

  // Free text. align: left | center | right, relative to x.
  text(x, y, s, o = {}) {
    const fs = o.fs ?? FS;
    const [w, h] = measure(s, fs);
    const align = o.align ?? "left";
    const x0 = align === "center" ? x - w / 2 : align === "right" ? x - w : x;
    const e = this.base("text", x0, y, w, h, { ...o, stroke: o.color ?? "#1e1e1e", bg: "transparent" });
    Object.assign(e, {
      text: s, originalText: s, fontSize: fs, fontFamily: o.mono ? FONT.mono : FONT.excalifont, textAlign: align,
      verticalAlign: "top", containerId: null, autoResize: true, lineHeight: LH,
    });
    return e;
  }

  // Shape with centered bound label. Grows to fit the label; lint() reports growth.
  // o.shape: rectangle (default) | diamond | ellipse; o.round=false for square corners; o.mono for code.
  box(x, y, w, h, s, o = {}) {
    const fs = o.fs ?? FS;
    const [tw, th] = measure(s || " ", fs);
    const W = s ? Math.max(w, tw + 20) : w, H = s ? Math.max(h, th + 16) : h;
    const r = this.base(o.shape ?? "rectangle", x, y, W, H, { sw: 1.5, ...o });
    this.req.set(r.id, [w, h]);
    if (!s) return r;
    const t = this.base("text", x + (W - tw) / 2, y + (H - th) / 2, tw, th, { stroke: o.color ?? "#1e1e1e" });
    Object.assign(t, {
      text: s, originalText: s, fontSize: fs, fontFamily: o.mono ? FONT.mono : FONT.excalifont, textAlign: "center",
      verticalAlign: "middle", containerId: r.id, autoResize: true, lineHeight: LH,
    });
    r.boundElements = [{ type: "text", id: t.id }];
    return r;
  }

  // Background grouping area with a title in its top-left corner.
  zone(x, y, w, h, title, o = {}) {
    this.base("rectangle", x, y, w, h, { bg: o.bg ?? "#f8f9fa", stroke: o.stroke ?? C.sGray, dash: o.dash ?? true, ...o });
    if (title) this.text(x + 14, y + 10, title, { fs: o.fs ?? FS, color: o.color ?? C.muted });
  }

  // Polyline arrow through absolute points. o.line=true for no arrowhead, o.dash, o.start/o.end heads.
  // o.from / o.to: shapes (from box()) to bind the ends to; the points must still touch them.
  // o.label is placed above the longest segment (o.below to place under, o.at=[cx,y] to pin).
  arrow(pts, o = {}) {
    const [x0, y0] = pts[0];
    const rel = pts.map(([x, y]) => [x - x0, y - y0]);
    const xs = rel.map((p) => p[0]), ys = rel.map((p) => p[1]);
    const e = this.base(o.line ? "line" : "arrow", x0, y0, Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys), { sw: o.sw ?? 1.5, ...o });
    Object.assign(e, {
      points: rel, lastCommittedPoint: null, startBinding: null, endBinding: null,
      startArrowhead: o.start ?? null, endArrowhead: o.line ? null : (o.end === undefined ? "arrow" : o.end),
      elbowed: false, roundness: null,
    });
    // Bind to shapes so the arrow stays attached when a box is moved in Obsidian.
    for (const [role, shape] of [["start", o.from], ["end", o.to]]) {
      if (!shape) continue;
      e[role === "start" ? "startBinding" : "endBinding"] = { elementId: shape.id, focus: 0, gap: 1 };
      (shape.boundElements ??= []).push({ type: "arrow", id: e.id });
    }
    if (o.label) {
      const fs = o.lfs ?? FS;
      let cx, cy;
      if (o.at) [cx, cy] = o.at;
      else {
        let best = -1, bi = 0;
        for (let i = 0; i < pts.length - 1; i++) {
          const d = Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]);
          if (d > best) { best = d; bi = i; }
        }
        cx = (pts[bi][0] + pts[bi + 1][0]) / 2;
        cy = (pts[bi][1] + pts[bi + 1][1]) / 2;
        cy = o.below ? cy + 6 : cy - measure(o.label, fs)[1] - 4;
      }
      this.text(cx, cy, o.label, { fs, align: "center", color: o.lcolor ?? o.stroke ?? "#1e1e1e" });
    }
    return e;
  }

  // Sequence-diagram lifelines. defs: [[key, title, centerX, fill?], ...]. Returns {key: x}.
  lanes(defs, top, bottom, o = {}) {
    const X = {};
    const w = o.w ?? 200;
    for (const [k, name, x, bg] of defs) {
      this.box(x - w / 2, top, w, 56, name, { bg: bg ?? C.gray2, fs: o.fs ?? FS });
      this.arrow([[x, top + 56], [x, bottom]], { line: true, dash: true, stroke: C.sGray, sw: 1 });
      X[k] = x;
    }
    return X;
  }
  msg(X, from, to, y, label, o = {}) {
    return this.arrow([[X[from], y], [X[to], y]], { label, ...o });
  }

  // Table. cols: header strings; rows: [[rowHeader, [cell | [text, fill], ...]], ...].
  grid(x0, y0, cols, rows, o = {}) {
    const rh = o.rowHead ?? 220, cw = o.colW ?? 220, hh = o.headH ?? 64, rH = o.rowH ?? 90, fs = o.fs ?? FS;
    this.box(x0, y0, rh, hh, "", { bg: C.white, stroke: "#ced4da", round: false });
    cols.forEach((c, i) => {
      const [t, bg] = Array.isArray(c) ? c : [c, C.gray2];
      this.box(x0 + rh + i * cw, y0, cw, hh, t, { bg, fs, round: false });
    });
    rows.forEach(([h, cells], r) => {
      const y = y0 + hh + r * rH;
      this.box(x0, y, rh, rH, h, { bg: C.gray, fs, round: false });
      cells.forEach((c, i) => {
        const [t, bg] = Array.isArray(c) ? c : [c, C.white];
        this.box(x0 + rh + i * cw, y, cw, rH, t, { bg, fs, stroke: C.border, round: false });
      });
    });
  }

  // Layout problems a browser preview would show: overlapping labels, labels over boxes, boxes over boxes,
  // boxes that grew past the requested size (breaks alignment in grids/stacks).
  lint() {
    const ov = (a, b) => a.x < b.x + b.width - 0.5 && b.x < a.x + a.width - 0.5 && a.y < b.y + b.height - 0.5 && b.y < a.y + a.height - 0.5;
    const byId = new Map(this.els.map((e) => [e.id, e]));
    const lbl = (e) => (e.type === "text" ? e.text : e.boundElements ? byId.get(e.boundElements[0].id).text : e.id).split("\n")[0].slice(0, 40);
    const texts = this.els.filter((e) => e.type === "text");
    const free = texts.filter((t) => !t.containerId);
    const boxes = this.els.filter((e) => ["rectangle", "diamond", "ellipse"].includes(e.type) && e.boundElements);
    const out = [];
    for (let i = 0; i < texts.length; i++) for (let j = i + 1; j < texts.length; j++)
      if (ov(texts[i], texts[j])) out.push(`text over text: "${lbl(texts[i])}" / "${lbl(texts[j])}"`);
    for (const t of free) for (const b of boxes) if (ov(t, b)) out.push(`text over box: "${lbl(t)}" / "${lbl(b)}"`);
    for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++)
      if (ov(boxes[i], boxes[j])) out.push(`box over box: "${lbl(boxes[i])}" / "${lbl(boxes[j])}"`);
    for (const b of boxes) {
      const [w, h] = this.req.get(b.id) ?? [b.width, b.height];
      if (b.width > w + 0.5 || b.height > h + 0.5)
        out.push(`box grew: "${lbl(b)}" ${w}x${h} -> ${Math.ceil(b.width)}x${Math.ceil(b.height)}`);
    }
    return out;
  }

  json() {
    return JSON.stringify({
      type: "excalidraw", version: 2, source: "https://excalidraw.com",
      elements: this.els, appState: { viewBackgroundColor: "#ffffff", gridSize: null, currentItemFontFamily: FONT.excalifont, currentItemFontSize: FS }, files: {},
    });
  }
}

// Obsidian Excalidraw plugin file: frontmatter, "## Text Elements" (must mirror the scene's text), then the scene JSON
// uncompressed in a %% comment. The plugin recompresses it on its next save.
export function toObsidianMd(scene) {
  const texts = scene.els.filter((e) => e.type === "text" && !e.isDeleted);
  const te = texts.map((t) => `${t.originalText ?? t.text} ^${t.id}\n\n`).join("");
  return `---

excalidraw-plugin: parsed
tags: [excalidraw]

---
==\u26a0  Switch to EXCALIDRAW VIEW in the MORE OPTIONS menu of this document. \u26a0==


# Excalidraw Data

## Text Elements
${te}%%
## Drawing
\`\`\`json
${scene.json()}
\`\`\`
%%
`;
}
