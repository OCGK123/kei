import { clamp, lerp, prefersReducedMotion } from './dom.ts';

/**
 * Mouse-driven parallax.
 *
 * Two very different feels are wanted here:
 *
 *  - the background must move as little as possible. It gets a tiny
 *    amplitude *and* the heaviest smoothing, so it reads as a barely-there
 *    drift rather than a slide.
 *  - the character must track the pointer smoothly and legibly. Larger
 *    amplitude, lighter smoothing, plus a small rotation about a pivot near
 *    her feet so she sways instead of sliding flatly.
 *
 * Smoothing is frame-rate independent: the per-frame lerp factor is derived
 * from the real elapsed time, so a 144 Hz display does not race ahead of a
 * 60 Hz one.
 */

interface LayerSpec {
  /** Horizontal travel at full deflection, in px at a 1440px-wide viewport. */
  ampX: number;
  /** Vertical travel at full deflection, in px at a 900px-tall viewport. */
  ampY: number;
  /** Rotation at full deflection, in degrees. */
  ampRot: number;
  /** Extra scale at full deflection. */
  ampScale: number;
  /** Base scale the layer always carries. */
  baseScale: number;
  /** Approach rate per 60Hz frame, 0..1. Lower is heavier / laggier. */
  ease: number;
}

const SPECS = {
  // "매우 작게, 최대한 작게" — the smallest movement that still reads as depth.
  bg: { ampX: 7, ampY: 4, ampRot: 0, ampScale: 0, baseScale: 1.035, ease: 0.028 },
  glow: { ampX: 26, ampY: 15, ampRot: 0, ampScale: 0, baseScale: 1, ease: 0.06 },
  char: { ampX: 34, ampY: 19, ampRot: 0.95, ampScale: 0.008, baseScale: 1, ease: 0.085 },
} satisfies Record<string, LayerSpec>;

type LayerName = keyof typeof SPECS;

interface Layer {
  node: HTMLElement;
  spec: LayerSpec;
  x: number;
  y: number;
}

export class Parallax {
  private readonly layers: Layer[] = [];
  private targetX = 0;
  private targetY = 0;
  private rafId = 0;
  private running = false;
  private lastTime = 0;
  private gain = 1;
  private readonly reduced: boolean;
  private readonly onPointer: (event: PointerEvent) => void;
  private readonly onLeave: () => void;
  private readonly onOrient: (event: DeviceOrientationEvent) => void;
  private readonly onVisibility: () => void;

  constructor(nodes: Record<LayerName, HTMLElement | null>) {
    this.reduced = prefersReducedMotion();
    // Reduced-motion visitors still get a hint of depth, just a quiet one.
    this.gain = this.reduced ? 0.25 : 1;

    for (const key of Object.keys(SPECS) as LayerName[]) {
      const node = nodes[key];
      if (node) this.layers.push({ node, spec: SPECS[key], x: 0, y: 0 });
    }

    this.onPointer = (event) => {
      const w = window.innerWidth || 1;
      const h = window.innerHeight || 1;
      this.targetX = clamp((event.clientX / w) * 2 - 1, -1, 1);
      this.targetY = clamp((event.clientY / h) * 2 - 1, -1, 1);
    };

    // Recentre when the pointer leaves the window so the scene rests level.
    this.onLeave = () => {
      this.targetX = 0;
      this.targetY = 0;
    };

    // Touch devices have no cursor; tilt stands in for it.
    this.onOrient = (event) => {
      if (event.gamma === null || event.beta === null) return;
      this.targetX = clamp(event.gamma / 34, -1, 1);
      this.targetY = clamp((event.beta - 45) / 34, -1, 1);
    };

    this.onVisibility = () => {
      if (document.hidden) this.pause();
      else this.resume();
    };
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    window.addEventListener('pointermove', this.onPointer, { passive: true });
    window.addEventListener('pointerdown', this.onPointer, { passive: true });
    document.addEventListener('pointerleave', this.onLeave);
    window.addEventListener('blur', this.onLeave);
    window.addEventListener('deviceorientation', this.onOrient, { passive: true });
    document.addEventListener('visibilitychange', this.onVisibility);
    this.resume();
  }

  stop(): void {
    if (!this.running) return;
    this.running = false;
    this.pause();
    window.removeEventListener('pointermove', this.onPointer);
    window.removeEventListener('pointerdown', this.onPointer);
    document.removeEventListener('pointerleave', this.onLeave);
    window.removeEventListener('blur', this.onLeave);
    window.removeEventListener('deviceorientation', this.onOrient);
    document.removeEventListener('visibilitychange', this.onVisibility);
  }

  private pause(): void {
    if (this.rafId) {
      window.cancelAnimationFrame(this.rafId);
      this.rafId = 0;
    }
  }

  private resume(): void {
    if (!this.running || this.rafId) return;
    this.lastTime = performance.now();
    this.rafId = window.requestAnimationFrame(this.tick);
  }

  private readonly tick = (now: number): void => {
    const dt = Math.min((now - this.lastTime) / 1000, 0.1);
    this.lastTime = now;
    this.rafId = window.requestAnimationFrame(this.tick);

    // Viewport-relative so the effect keeps its proportions on any screen.
    const sx = clamp(window.innerWidth / 1440, 0.55, 1.35);
    const sy = clamp(window.innerHeight / 900, 0.55, 1.35);

    for (const layer of this.layers) {
      // 1 - (1 - k)^(dt*60): the same visual damping at any refresh rate.
      const k = 1 - Math.pow(1 - layer.spec.ease, dt * 60);
      layer.x = lerp(layer.x, this.targetX, k);
      layer.y = lerp(layer.y, this.targetY, k);

      const { spec } = layer;
      const tx = -layer.x * spec.ampX * sx * this.gain;
      const ty = -layer.y * spec.ampY * sy * this.gain;
      const rot = layer.x * spec.ampRot * this.gain;
      const scale = spec.baseScale + Math.abs(layer.x) * spec.ampScale * this.gain;

      let transform = `translate3d(${tx.toFixed(2)}px, ${ty.toFixed(2)}px, 0)`;
      if (spec.ampRot) transform += ` rotate(${rot.toFixed(3)}deg)`;
      if (spec.baseScale !== 1 || spec.ampScale) transform += ` scale(${scale.toFixed(4)})`;

      layer.node.style.transform = transform;
    }
  };
}
