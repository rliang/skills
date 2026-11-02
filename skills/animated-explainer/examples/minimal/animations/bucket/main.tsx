import {Txt, makeScene2D} from '@canvas-commons/2d';
import {createSignal, waitFor} from '@canvas-commons/core';
import {C, CONTENT_Y, bar, caption, fmt, legend, setup, tokenBox} from 'animate-kit';

// One token = one request allowed. Requests take a token from the bucket into "spent".
export default makeScene2D(function* (view) {
  setup(view);
  const cap = caption(view);

  const bucket = tokenBox(view, {x: -520, y: CONTENT_Y + 40, width: 460, height: 260, title: 'bucket (10 max)', seed: 1});
  const spent = tokenBox(view, {x: 60, y: CONTENT_Y + 40, width: 460, height: 260, title: 'spent', seed: 2});
  const tokens = bucket.add(10, C.blue);
  legend(view, [[{fill: C.blue, token: true}, '= 1 request allowed']], {x: -230, y: CONTENT_Y + 230});

  // Both counters are bound to the same signals the tokens' story drives.
  const passed = createSignal(0), rejected = createSignal(0);
  bar(view, passed, {x: 620, y: CONTENT_Y + 170, scale: 28, fill: C.green, title: 'passed'});
  view.add(<Txt x={0} y={-420} fill={C.ink} fontSize={44}
                text={() => `passed ${fmt(passed())} · rejected ${fmt(rejected())}`} />);

  yield* cap('The bucket starts full: 10 tokens. A burst of 12 requests arrives.');
  yield* cap.beat('Each request takes a token: the first 10 pass.',
    bucket.moveTo(tokens, spent), passed(10, 1.2));
  yield* cap.beat('Requests 11 and 12 find the bucket empty: rejected.',
    rejected(2, 0.6), bucket.box().stroke(C.sRed, 0.4));
  yield* cap.beat('One second later, one token is back.',
    spent.moveTo([tokens[0]], bucket), bucket.box().stroke(C.ink, 0.4));
  yield* cap('Bursts up to the capacity pass; after that, the refill rate is the limit.', 1.5);
  yield* waitFor(0.5);
});
