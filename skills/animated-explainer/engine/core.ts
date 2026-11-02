// Player core for the deck: loads a built Canvas Commons project
// onto its own canvas, reads its steps, and exposes play-to/seek-to.
import {Player, Project, Stage} from '@canvas-commons/core';
import '@fontsource/patrick-hand/400.css';

export type Anim = {
  id: string;
  player: Player;
  canvas: HTMLCanvasElement;
  ready: Promise<void>;
  duration(): number;
  /** Frame each step starts at; empty when the scenes mark no steps. */
  starts: number[];
  /** Each step's resting frame (one before the next step starts). */
  ends: number[];
  /** Per step, the ids of source passages it illustrates (kit `source()`). */
  sources: string[][];
  /** Play from the current frame to `frame`, then pause there. */
  playTo(frame: number): Promise<void>;
  /** Jump to `frame`, paused. */
  seekTo(frame: number): Promise<void>;
  /** True while a playTo is in flight. */
  busy(): boolean;
};

type Handle = {
  player: Player;
  ready: Promise<void>;
  seek(frame: number): Promise<void>;
  duration(): number;
  steps(): {starts: number[]; ends: number[]; sources: string[][]};
};

declare global {
  interface Window {
    __animate: Record<string, Handle>;
  }
}
window.__animate ??= {};

export const nextPaint = () =>
  new Promise<void>(r => requestAnimationFrame(() => requestAnimationFrame(() => r())));

export async function load(id: string, project: Project): Promise<Anim> {
  // Canvas text falls back silently when a font isn't loaded yet.
  await document.fonts.load('32px "Patrick Hand"');
  const settings = project.meta.getFullRenderingSettings();
  const stage = new Stage();
  const player = new Player(project);
  stage.configure(settings);
  await player.configure(settings);
  player.onRender.subscribe(() =>
    stage.render(player.playback.currentScene, player.playback.previousScene),
  );

  let stop: {frame: number; done: () => void} | null = null;
  let lastFrame = 0;
  player.onFrameChanged.subscribe(f => {
    // A playTo pauses on its target; a wrap past the end also counts as arrival.
    if (stop && (f >= stop.frame || f < lastFrame)) {
      const {frame, done} = stop;
      stop = null;
      player.togglePlayback(false);
      if (f !== frame) player.requestSeek(frame);
      done();
    }
    lastFrame = f;
  });

  const ready = new Promise<void>(r => {
    const off = player.onDurationChanged.subscribe(d => {
      if (d > 0) {
        r();
        queueMicrotask(() => off());
      }
    });
  });

  const anim: Anim = {
    id,
    player,
    canvas: stage.finalBuffer,
    ready,
    duration: () => player.onDurationChanged.current,
    starts: [],
    ends: [],
    sources: [],
    busy: () => stop !== null,
    playTo(frame) {
      stop?.done();
      return new Promise<void>(done => {
        if (player.onFrameChanged.current >= frame) {
          stop = null;
          anim.seekTo(frame).then(done);
          return;
        }
        stop = {frame, done};
        player.togglePlayback(true);
      });
    },
    async seekTo(frame) {
      if (stop) {
        const s = stop;
        stop = null;
        s.done();
      }
      player.togglePlayback(false);
      player.requestSeek(frame);
      for (let i = 0; i < 300 && player.onFrameChanged.current !== frame; i++) await nextPaint();
      await nextPaint();
    },
  };

  // Steps: the kit's caption()/step() record the frame each step starts at on
  // the scene during the player's first pass.
  ready.then(() => {
    const scenes = player.playback.onScenesRecalculated.current as unknown as {
      __animateMarks?: Set<number>;
    }[];
    const d = anim.duration();
    const starts = [...new Set(scenes.flatMap(s => [...(s.__animateMarks ?? [])]))]
      .filter(f => f < d)
      .sort((a, b) => a - b);
    if (starts.length > 1) {
      anim.starts = starts;
      anim.ends = starts.map((_, i) => (i + 1 < starts.length ? starts[i + 1] - 1 : d));
    }
    // A source() call belongs to the first step starting at or after it.
    const tags = scenes.flatMap(s =>
      (s as unknown as {__animateSources?: {frame: number; ids: string[]}[]}).__animateSources ?? [],
    );
    anim.sources = Array.from({length: Math.max(1, anim.starts.length)}, () => []);
    for (const {frame, ids} of tags) {
      const i = anim.starts.findIndex(s => s >= frame);
      anim.sources[i < 0 ? anim.sources.length - 1 : i].push(...ids);
    }
  });

  window.__animate[id] = {
    player,
    ready,
    duration: anim.duration,
    steps: () => ({starts: anim.starts, ends: anim.ends, sources: anim.sources}),
    seek: anim.seekTo,
  };
  return anim;
}
