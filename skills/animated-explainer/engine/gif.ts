// GIF export of one animation. It renders frame by frame with the same seeks
// the deck's steps use, so the result is exact rather than a screen recording.
// Half size at ~15 fps, one palette for the whole animation (sampled from the
// steps' resting frames), and identical consecutive frames merged into one
// longer frame, so the step holds cost almost nothing.
import {GIFEncoder, applyPalette, quantize} from 'gifenc';
import type {Anim} from './core';

export async function exportGif(
  anim: Anim,
  onProgress: (fraction: number) => void,
  {width = 960, fps = 15} = {},
): Promise<Blob> {
  const src = anim.canvas;
  const height = Math.round((src.height * width) / src.width);
  const ctx = new OffscreenCanvas(width, height).getContext('2d', {willReadFrequently: true})!;
  const grab = async (frame: number) => {
    await anim.seekTo(frame);
    ctx.drawImage(src, 0, 0, width, height);
    return ctx.getImageData(0, 0, width, height).data;
  };

  const status = anim.player.status;
  const last = anim.duration();
  const stride = Math.max(1, Math.round(status.secondsToFrames(1) / fps));
  const frames: number[] = [];
  for (let f = 0; f < last; f += stride) frames.push(f);
  frames.push(last);
  const delayOf = (n: number) => status.framesToSeconds(n) * 1000;

  // Palette from the first frame and every step's resting frame (up to 16).
  const samples = [0, ...anim.ends.slice(0, 16)];
  const pixels = new Uint8ClampedArray(samples.length * width * height * 4);
  for (const [i, f] of samples.entries()) pixels.set(await grab(f), i * width * height * 4);
  const palette = quantize(pixels, 256);

  const gif = GIFEncoder();
  let pending: Uint8Array | null = null;
  let delay = 0;
  let first = true;
  const flush = (extra = 0) => {
    if (!pending) return;
    // The first frame carries the global palette; later frames reuse it.
    gif.writeFrame(pending, width, height, first ? {palette, delay: delay + extra} : {delay: delay + extra});
    first = false;
  };
  for (const [i, f] of frames.entries()) {
    const index = applyPalette(await grab(f), palette);
    const step = delayOf(i + 1 < frames.length ? frames[i + 1] - f : stride);
    if (pending && same(pending, index)) delay += step;
    else {
      flush();
      pending = index;
      delay = step;
    }
    onProgress((i + 1) / frames.length);
  }
  flush(1000); // hold the takeaway a moment before the loop restarts
  gif.finish();
  return new Blob([gif.bytes()], {type: 'image/gif'});
}

function same(a: Uint8Array, b: Uint8Array) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}
