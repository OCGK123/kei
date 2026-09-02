import { clamp } from './dom.ts';

const STORAGE_KEY = 'mhg:bgm-muted';
const TARGET_VOLUME = 0.42;

/**
 * BGM controller.
 *
 * Playback is only ever *started* from the click-to-start gesture, which is
 * what browser autoplay policy requires. Everything after that is a volume
 * ramp, so pausing/resuming never needs another gesture.
 */
export class Bgm {
  private readonly audio: HTMLAudioElement;
  private fadeHandle = 0;
  private muted: boolean;
  private started = false;

  constructor(audio: HTMLAudioElement) {
    this.audio = audio;
    this.audio.volume = 0;
    this.audio.loop = true;
    this.muted = readMuted();
  }

  get isMuted(): boolean {
    return this.muted;
  }

  /** Whether the element ever managed to start playing. */
  get isPlaying(): boolean {
    return this.started && !this.audio.paused;
  }

  /** Call from inside the user gesture handler. */
  async start(): Promise<void> {
    if (this.muted) {
      this.started = true;
      return;
    }
    try {
      await this.audio.play();
      this.started = true;
      this.fadeTo(TARGET_VOLUME, 2600);
    } catch {
      // Autoplay refused (some mobile browsers still gate it). Leave the site
      // fully functional and let the BGM button retry on a later tap.
      this.started = false;
    }
  }

  async toggle(): Promise<boolean> {
    this.muted = !this.muted;
    writeMuted(this.muted);

    if (this.muted) {
      this.fadeTo(0, 420, () => this.audio.pause());
    } else {
      try {
        await this.audio.play();
        this.started = true;
        this.fadeTo(TARGET_VOLUME, 700);
      } catch {
        // Still blocked — revert so the button label stays truthful.
        this.muted = true;
        writeMuted(true);
      }
    }
    return this.muted;
  }

  /** Duck the music briefly, e.g. while the opening replays. */
  duck(to: number, ms: number): void {
    if (this.muted) return;
    this.fadeTo(clamp(to, 0, 1), ms);
  }

  restore(ms = 900): void {
    if (this.muted) return;
    this.fadeTo(TARGET_VOLUME, ms);
  }

  private fadeTo(target: number, ms: number, done?: () => void): void {
    window.clearInterval(this.fadeHandle);
    const from = this.audio.volume;
    const delta = target - from;
    if (ms <= 0 || Math.abs(delta) < 0.001) {
      this.audio.volume = clamp(target, 0, 1);
      done?.();
      return;
    }
    const startedAt = performance.now();
    this.fadeHandle = window.setInterval(() => {
      const t = clamp((performance.now() - startedAt) / ms, 0, 1);
      // ease-out so fades feel like a hand on a fader, not a linear ramp
      this.audio.volume = clamp(from + delta * (1 - (1 - t) * (1 - t)), 0, 1);
      if (t >= 1) {
        window.clearInterval(this.fadeHandle);
        this.fadeHandle = 0;
        done?.();
      }
    }, 1000 / 60);
  }
}

function readMuted(): boolean {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

function writeMuted(muted: boolean): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, muted ? '1' : '0');
  } catch {
    /* private mode / storage disabled — preference simply is not persisted */
  }
}
