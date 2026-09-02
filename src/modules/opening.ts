import { el, prefersReducedMotion, seededRandom, sleep } from './dom.ts';

/**
 * The Blue Archive style mission-start sequence.
 *
 * The visual beats live in opening.css as animation-delays hanging off a
 * single `.is-playing` class, so they all share one clock. This module owns
 * the parts CSS cannot express on its own — the typed readout, the generated
 * speed-line fan — and the promise that resolves when the sequence is over.
 */

/** Total run time of the CSS beat table before the white flash. */
export const OPENING_DURATION = 3800;

/** Flash blow-out + hold + slow dissolve. */
export const FLASH_BLOW = 260;

const READOUT_START = 1400;
const READOUT_STEP = 155;

const READOUT_LINES: Array<[string, string]> = [
  ['SYSTEM', 'BOOT SEQUENCE COMPLETE'],
  ['LINK', 'SCHALE NETWORK ESTABLISHED'],
  ['ASSET', 'BACKGROUND / CHARACTER LOADED'],
  ['AUDIO', 'BGM STREAM ATTACHED'],
  ['CLIENT', 'RENDER PIPELINE READY'],
  ['STATUS', 'ALL GREEN — 준비 완료'],
];

const SPEED_LINE_COUNT = 44;

export interface OpeningHandles {
  root: HTMLElement;
  readout: HTMLElement;
  speed: HTMLElement;
  skip: HTMLElement;
}

export class Opening {
  private readonly h: OpeningHandles;
  private timers: number[] = [];
  private resolveRun: (() => void) | null = null;
  private finished = false;

  constructor(handles: OpeningHandles) {
    this.h = handles;
    this.buildSpeedLines();
    this.h.skip.addEventListener('click', () => this.skip());
  }

  /**
   * Play the whole sequence. Resolves when the last beat lands (or as soon as
   * the visitor hits SKIP), *before* the white flash — the caller owns that.
   */
  play(): Promise<void> {
    this.finished = false;
    this.clearTimers();
    this.h.readout.textContent = '';

    const root = this.h.root;
    root.hidden = false;
    root.setAttribute('aria-hidden', 'false');

    // Force a reflow so re-adding .is-playing on a replay actually restarts
    // every CSS animation instead of being coalesced into a no-op.
    root.classList.remove('is-playing');
    void root.offsetWidth;
    root.classList.add('is-playing');

    const reduced = prefersReducedMotion();
    const duration = reduced ? 1400 : OPENING_DURATION;

    this.scheduleReadout(reduced);

    return new Promise<void>((resolve) => {
      this.resolveRun = resolve;
      this.timers.push(window.setTimeout(() => this.finish(), duration));
    });
  }

  /** Tear the sequence down once the flash has covered it. */
  teardown(): void {
    const root = this.h.root;
    root.classList.remove('is-playing');
    root.setAttribute('aria-hidden', 'true');
    root.hidden = true;
    this.clearTimers();
  }

  skip(): void {
    if (this.finished) return;
    this.finish();
  }

  private finish(): void {
    if (this.finished) return;
    this.finished = true;
    this.clearTimers();
    const resolve = this.resolveRun;
    this.resolveRun = null;
    resolve?.();
  }

  private scheduleReadout(reduced: boolean): void {
    const start = reduced ? 200 : READOUT_START;
    const step = reduced ? 60 : READOUT_STEP;

    READOUT_LINES.forEach(([key, value], i) => {
      this.timers.push(
        window.setTimeout(
          () => {
            const li = el('li');
            const label = el('b', undefined, key);
            li.append(label, document.createTextNode(` › ${value}`));
            this.h.readout.append(li);
            // next frame so the entry animation has a starting state to leave
            window.requestAnimationFrame(() => li.classList.add('is-in'));
          },
          start + i * step,
        ),
      );
    });
  }

  /**
   * Fan of radial speed lines. Angles and lengths are seeded so the burst is
   * identical on every visit — a stable composition, not noise.
   */
  private buildSpeedLines(): void {
    const rand = seededRandom(0x5ca1ab1e);
    const frag = document.createDocumentFragment();

    for (let i = 0; i < SPEED_LINE_COUNT; i += 1) {
      const line = el('span');
      // even spread plus a little jitter, so it never looks like a clock face
      const angle = (i / SPEED_LINE_COUNT) * 360 + (rand() - 0.5) * 7;
      const inset = 16 + rand() * 26; // start away from the centre
      line.style.transform = `rotate(${angle.toFixed(2)}deg) translateX(${inset.toFixed(1)}vmin)`;
      line.style.width = `${(24 + rand() * 34).toFixed(1)}vmax`;
      line.style.height = `${(1 + rand() * 2.4).toFixed(1)}px`;
      line.style.animationDelay = `${(rand() * 420).toFixed(0)}ms`;
      line.style.animationDuration = `${(430 + rand() * 320).toFixed(0)}ms`;
      line.style.opacity = (0.35 + rand() * 0.65).toFixed(2);
      frag.append(line);
    }

    this.h.speed.append(frag);
  }

  private clearTimers(): void {
    for (const id of this.timers) window.clearTimeout(id);
    this.timers = [];
  }
}

/** Convenience wrapper used by the flash overlay. */
export async function whiteFlash(
  flash: HTMLElement,
  onCovered: () => void | Promise<void>,
): Promise<void> {
  flash.classList.remove('is-clearing');
  flash.classList.add('is-blowing');
  await sleep(FLASH_BLOW);

  // Screen is fully white here — safe to swap what is underneath.
  await onCovered();

  flash.classList.remove('is-blowing');
  void flash.offsetWidth;
  flash.classList.add('is-clearing');
}
