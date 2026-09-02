import './styles/tokens.css';
import './styles/base.css';
import './styles/boot.css';
import './styles/opening.css';
import './styles/scene.css';
import './styles/hud.css';

import { must, maybe, seededRandom, sleep } from './modules/dom.ts';
import { preloadScene } from './modules/assets.ts';
import { Bgm } from './modules/audio.ts';
import { Opening, whiteFlash } from './modules/opening.ts';
import { Parallax } from './modules/parallax.ts';
import { buildDust, rollTo, startClock } from './modules/hud.ts';
import { loadCounter } from './modules/visitors.ts';

/* ------------------------------------------------------------------ */
/* Handles                                                             */
/* ------------------------------------------------------------------ */

const boot = must('#boot');
const bootPct = must('[data-boot-pct]');
const bootLoading = must('[data-boot-loading]');

const scene = must('#scene');
const flash = must('#flash');

const opening = new Opening({
  root: must('#opening'),
  readout: must('[data-op-readout]'),
  speed: must('[data-op-speed]'),
  skip: must('[data-op-skip]'),
});

const bgm = new Bgm(must<HTMLAudioElement>('#bgm'));

const parallax = new Parallax({
  bg: maybe('[data-layer-bg]'),
  glow: maybe('[data-layer-glow]'),
  char: maybe('[data-layer-char]'),
});

const clockNode = must('[data-hud-clock]');
const totalNode = must('[data-count-total]');

const audioBtn = must<HTMLButtonElement>('[data-audio-toggle]');
const audioText = must('[data-audio-text]');
const replayBtn = must<HTMLButtonElement>('[data-replay]');

/* ------------------------------------------------------------------ */
/* Boot                                                                */
/* ------------------------------------------------------------------ */

let ready = false;
let entered = false;

void preloadScene((fraction) => {
  bootPct.textContent = String(Math.round(fraction * 100));
}).then(() => {
  ready = true;
  boot.classList.add('is-ready');
  bootLoading.classList.add('is-done');
});

function onBootActivate(): void {
  if (!ready || entered) return;
  entered = true;
  // Must happen synchronously inside the gesture for autoplay policy.
  void bgm.start();
  void enter();
}

boot.addEventListener('click', onBootActivate);
boot.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault();
    onBootActivate();
  }
});

/* ------------------------------------------------------------------ */
/* Entry: opening -> white -> scene                                    */
/* ------------------------------------------------------------------ */

async function enter(): Promise<void> {
  // Start the counter now: the opening covers nearly four seconds, so the
  // number has landed long before the scene is visible.
  const counting = loadCounter();

  boot.classList.add('is-leaving');
  await sleep(420);
  boot.hidden = true;

  await opening.play();

  await whiteFlash(flash, async () => {
    // Screen is fully white here: swap the layers with nothing to see.
    opening.teardown();
    scene.setAttribute('aria-hidden', 'false');
    scene.classList.add('is-live');
    parallax.start();
    await Promise.resolve();
  });

  startClock(clockNode);

  const dust = maybe('[data-layer-dust]');
  if (dust) buildDust(dust, seededRandom(0xd057));

  const counters = await counting;
  if (counters.total !== null) rollTo(totalNode, counters.total, 1600);
  else totalNode.textContent = '—';
}

/* ------------------------------------------------------------------ */
/* Controls                                                            */
/* ------------------------------------------------------------------ */

function paintAudioButton(): void {
  const on = !bgm.isMuted;
  audioBtn.setAttribute('aria-pressed', on ? 'true' : 'false');
  audioText.textContent = on ? 'BGM ON' : 'BGM OFF';
}

paintAudioButton();

audioBtn.addEventListener('click', () => {
  void bgm.toggle().then(paintAudioButton);
});

let replaying = false;
replayBtn.addEventListener('click', () => {
  if (replaying) return;
  replaying = true;
  void replayOpening().finally(() => {
    replaying = false;
  });
});

async function replayOpening(): Promise<void> {
  bgm.duck(0.14, 500);
  scene.classList.remove('is-live');
  scene.setAttribute('aria-hidden', 'true');
  parallax.stop();

  await opening.play();

  await whiteFlash(flash, async () => {
    opening.teardown();
    scene.setAttribute('aria-hidden', 'false');
    // Re-adding the class after a reflow restarts the slow reveal.
    void scene.offsetWidth;
    scene.classList.add('is-live');
    parallax.start();
    await Promise.resolve();
  });

  bgm.restore(1200);
}
