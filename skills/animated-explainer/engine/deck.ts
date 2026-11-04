// Deck layout: one full-viewport stage that walks through the page step by
// step. → / scroll / swipe plays the next step and pauses at its end; ← jumps
// back to the previous step's end. Sections without animations become text
// cards; each section's prose shows in a collapsible notes panel.
import {Project} from '@canvas-commons/core';
import {Anim, load} from './core';
import {exportGif} from './gif';
import {toggleTheme} from './theme';

type Slide =
  | {kind: 'card'; el: HTMLElement; section: string}
  | {kind: 'anim'; el: HTMLElement; section: string; anim: Anim};

export async function startDeck(entries: [string, Project][]) {
  const $ = <T extends Element>(s: string) => document.querySelector<T>(s)!;
  const stage = $<HTMLElement>('.deck-stage');
  const anims = new Map<string, Anim>();
  await Promise.all(entries.map(async ([id, p]) => anims.set(id, await load(id, p))));
  await Promise.all([...anims.values()].map(a => a.ready));
  await new Promise(r => setTimeout(r)); // steps are read right after ready

  const slides: Slide[] = [...stage.children].map(el => {
    const e = el as HTMLElement;
    const section = e.dataset.section ?? '';
    if (e.dataset.animation) {
      const anim = anims.get(e.dataset.animation)!;
      anim.canvas.className = 'deck-canvas';
      e.prepend(anim.canvas);
      anim.player.toggleLoop(false);
      if (anim.ends.length === 0) anim.ends = [anim.duration()];
      return {kind: 'anim', el: e, section, anim};
    }
    return {kind: 'card', el: e, section};
  });
  const count = (s: Slide) => (s.kind === 'anim' ? s.anim.ends.length : 1);
  const offsets = slides.map((_, i) => slides.slice(0, i).reduce((n, s) => n + count(s), 0));
  const total = offsets[offsets.length - 1] + count(slides[slides.length - 1]);

  // Progress bar: one segment per slide, sized by its steps.
  const progress = $<HTMLElement>('.deck-progress');
  progress.innerHTML = slides
    .map((s, i) => `<button type="button" data-i="${i}" style="flex:${count(s)}" title="${
      document.querySelector(`.deck-note[data-section="${s.section}"]`)?.getAttribute('data-title') ?? ''
    }"><i></i></button>`)
    .join('');
  const segs = [...progress.children] as HTMLElement[];

  // Section index: `i` or a click on the section name lists every section to jump to.
  const sections: {section: string; title: string; slide: number}[] = [];
  slides.forEach((s, i) => {
    if (sections.some(x => x.section === s.section)) return;
    const t = document.querySelector(`.deck-note[data-section="${s.section}"]`)?.getAttribute('data-title');
    sections.push({section: s.section, title: t || $('.deck-title').textContent || '', slide: i});
  });
  const index = document.createElement('nav');
  index.className = 'deck-index';
  index.hidden = true;
  sections.forEach((s, j) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.dataset.section = s.section;
    // Titles that carry their own number ("3. …") don't get a second one.
    b.innerHTML = `<span class="n">${j === 0 || /^\s*\d+[.)]/.test(s.title) ? '' : j}</span><span class="t"></span>`;
    b.querySelector('.t')!.textContent = s.title;
    b.onclick = () => {
      index.hidden = true;
      show(s.slide, 0, true);
    };
    index.append(b);
  });
  $('.deck-main').append(index);
  const toggleIndex = () => (index.hidden = !index.hidden);
  $<HTMLElement>('.deck-sec').onclick = toggleIndex;
  $<HTMLElement>('.deck-title').onclick = toggleIndex;

  let exporting = false; // a GIF export owns the canvas
  let si = 0; // current slide
  let k = 0; // step resting (or playing toward) within the slide

  function render() {
    slides.forEach((s, i) => {
      s.el.classList.toggle('active', i === si);
      segs[i].classList.toggle('done', i < si);
      segs[i].classList.toggle('current', i === si);
      segs[i].querySelector('i')!.setAttribute('style', `width:${i < si ? 100 : i > si ? 0 : ((k + 1) / count(s)) * 100}%`);
    });
    const cur = slides[si];
    document.body.classList.toggle('on-card', cur.kind === 'card');
    gifButton.hidden = cur.kind !== 'anim';
    document.querySelectorAll<HTMLElement>('.deck-note').forEach(n =>
      n.classList.toggle('active', n.dataset.section === cur.section),
    );
    const note = document.querySelector(`.deck-note[data-section="${cur.section}"]`);
    const title = $('.deck-title').textContent;
    $('.deck-sec').textContent = [note?.getAttribute('data-title'), cur.el.dataset.caption]
      .filter(t => t && t !== title)
      .join(' — ');
    // Highlight the source passages of this step; earlier steps' stay faint.
    index.querySelectorAll<HTMLElement>('button').forEach(b => b.classList.toggle('current', b.dataset.section === cur.section));
    const marks = note ? [...note.querySelectorAll<HTMLElement>('[data-src]')] : [];
    marks.forEach(m => m.classList.remove('on', 'seen'));
    if (cur.kind === 'anim' && note) {
      const ids = (j: number) => cur.anim.sources[j] ?? [];
      for (let j = 0; j <= k; j++)
        for (const id of ids(j))
          note.querySelectorAll(`[data-src="${CSS.escape(id)}"]`).forEach(m => m.classList.add(j === k ? 'on' : 'seen'));
      const first = note.querySelector('[data-src].on');
      if (first && !document.body.classList.contains('notes-hidden'))
        first.scrollIntoView({behavior: 'smooth', block: 'center'});
    }
    $('.deck-count').textContent = `${offsets[si] + k + 1} / ${total}`;
    // Throws in sandboxed srcdoc iframes (opaque origin, e.g. an agent app's HTML
    // preview); that must not stop the step from playing.
    try {
      history.replaceState(null, '', `#${offsets[si] + k + 1}`);
    } catch {}
  }

  // State (si, k, the counter, highlights) changes the moment a key is pressed;
  // the canvas work (seeks, playing a step) runs in order on a media queue.
  // A press while a step is still playing first completes that step, which also
  // releases the queue, so every press advances exactly one step without lag.
  let media: Promise<unknown> = Promise.resolve();
  const run = (op: () => Promise<unknown> | void) => void (media = media.then(op).catch(e => console.error(e)));
  function interrupt() {
    const s = slides[si];
    if (s.kind === 'anim' && s.anim.busy()) s.anim.seekTo(s.anim.ends[k]);
  }

  function show(i: number, step: number, play: boolean) {
    if (exporting) return;
    interrupt();
    si = i;
    k = step;
    render();
    const s = slides[i];
    run(async () => {
      for (const o of slides) if (o.kind === 'anim' && o !== s) o.anim.player.togglePlayback(false);
      if (s.kind !== 'anim') return;
      if (play) {
        await s.anim.seekTo(step === 0 ? 0 : s.anim.ends[step - 1]);
        await s.anim.playTo(s.anim.ends[step]);
      } else await s.anim.seekTo(s.anim.ends[step]);
    });
  }

  function next() {
    if (exporting) return;
    const s = slides[si];
    if (k < count(s) - 1) {
      interrupt();
      k++;
      render();
      if (s.kind === 'anim') {
        const target = s.anim.ends[k];
        run(() => s.anim.playTo(target));
      }
    } else if (si < slides.length - 1) show(si + 1, 0, true);
  }
  function prev() {
    if (exporting) return;
    const s = slides[si];
    if (k > 0) {
      interrupt();
      k--;
      render();
      if (s.kind === 'anim') {
        const target = s.anim.ends[k];
        run(() => s.anim.seekTo(target));
      }
    } else if (si > 0) show(si - 1, count(slides[si - 1]) - 1, false);
  }
  function goto(global: number) {
    if (exporting) return;
    const g = Math.max(1, Math.min(total, global)) - 1;
    const i = offsets.findLastIndex(o => o <= g);
    show(i, g - offsets[i], false);
  }

  // GIF export of the current animation (the button or `g`). Navigation waits
  // until it's done, then the canvas returns to the step the viewer was on.
  const gifButton = $<HTMLButtonElement>('.deck-gif');
  const slug = (s: string) =>
    s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  function downloadGif() {
    const s = slides[si];
    if (s.kind !== 'anim' || exporting) return;
    exporting = true;
    gifButton.disabled = true;
    run(async () => {
      try {
        const blob = await exportGif(s.anim, p => (gifButton.textContent = `${Math.round(p * 100)}%`));
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `${[slug($('.deck-title').textContent ?? ''), s.anim.id].filter(Boolean).join('-')}.gif`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 60_000);
      } finally {
        await s.anim.seekTo(s.anim.ends[k]);
        gifButton.textContent = 'GIF';
        gifButton.disabled = false;
        exporting = false;
      }
    });
  }
  gifButton.onclick = downloadGif;

  const goNext = next, goPrev = prev;
  const queue = (f: () => unknown) => () => void f();
  $<HTMLButtonElement>('.deck-next').onclick = goNext;
  $<HTMLButtonElement>('.deck-prev').onclick = goPrev;
  segs.forEach((b, i) => (b.onclick = queue(() => show(i, 0, true))));
  const toggleNotes = () => document.body.classList.toggle('notes-hidden');
  $<HTMLButtonElement>('.deck-notes-toggle').onclick = toggleNotes;
  const fullscreen = () =>
    document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen();
  $<HTMLButtonElement>('.deck-full').onclick = fullscreen;
  $<HTMLButtonElement>('.deck-theme').onclick = toggleTheme;
  // Stacked (phones, portrait tablets): the panel sits below the stage, open by
  // default. Side by side, it starts hidden when the window is too narrow for it.
  const stacked = matchMedia('(max-width: 800px), (orientation: portrait) and (max-width: 1100px)');
  if (!stacked.matches && innerWidth < 1100) document.body.classList.add('notes-hidden');
  if (!document.fullscreenEnabled) $<HTMLElement>('.deck-full').hidden = true; // e.g. iPhone Safari

  addEventListener('keydown', e => {
    if (e.metaKey || e.ctrlKey || e.altKey || (e.target as HTMLElement).closest('input, textarea')) return;
    const key = e.key;
    if (['ArrowRight', 'ArrowDown', 'PageDown', ' ', 'j'].includes(key)) goNext();
    else if (['ArrowLeft', 'ArrowUp', 'PageUp', 'k'].includes(key)) goPrev();
    else if (key === 'Home') queue(() => goto(1))();
    else if (key === 'End') queue(() => goto(total))();
    else if (key === 'n') toggleNotes();
    else if (key === 'f') fullscreen();
    else if (key === 't') toggleTheme();
    else if (key === 'i') toggleIndex();
    else if (key === 'g') downloadGif();
    else if (key === 'Escape' && !index.hidden) index.hidden = true;
    else return;
    e.preventDefault();
  });

  // One wheel or trackpad gesture = one step: trackpads fire dozens of events
  // per swipe (plus inertia), so lock until the wheel has been quiet a moment.
  let locked = false, acc = 0, quiet = 0;
  const canScroll = (el: Element | null, dy: number): boolean => {
    for (; el && el !== document.body; el = el.parentElement) {
      const s = el as HTMLElement;
      if (s.scrollHeight > s.clientHeight + 2 && getComputedStyle(s).overflowY !== 'visible')
        if (dy > 0 ? s.scrollTop + s.clientHeight < s.scrollHeight - 2 : s.scrollTop > 0) return true;
    }
    return false;
  };
  // The notes panel and the index scroll natively and never change slides, even
  // at their top or bottom edge.
  const inPanel = (el: EventTarget | null) => !!(el as Element | null)?.closest?.('.deck-notes, .deck-index');
  addEventListener('wheel', e => {
    if (inPanel(e.target)) return;
    if (canScroll(e.target as Element, e.deltaY)) return; // let long cards scroll first
    e.preventDefault();
    clearTimeout(quiet);
    quiet = window.setTimeout(() => ((locked = false), (acc = 0)), 200);
    if (locked) return;
    acc += Math.abs(e.deltaY) >= Math.abs(e.deltaX) ? e.deltaY : e.deltaX;
    if (Math.abs(acc) > 30) {
      locked = true;
      acc > 0 ? goNext() : goPrev();
    }
  }, {passive: false});

  let touchY = 0, touchX = 0;
  addEventListener('touchstart', e => ((touchY = e.touches[0].clientY), (touchX = e.touches[0].clientX)), {passive: true});
  addEventListener('touchend', e => {
    if (inPanel(e.target)) return;
    const dy = touchY - e.changedTouches[0].clientY, dx = touchX - e.changedTouches[0].clientX;
    const d = Math.abs(dy) > Math.abs(dx) ? dy : dx;
    if (Math.abs(d) > 50 && !canScroll(e.target as Element, dy)) d > 0 ? goNext() : goPrev();
  });

  const start = Number(location.hash.slice(1));
  if (start > 1) goto(start);
  else show(0, 0, true);
}
