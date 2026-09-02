import { clamp, el, prefersReducedMotion } from './dom.ts';

/**
 * Count a number up into place. Blue Archive's result screens tally numbers
 * rather than snapping them, and it doubles as a "this is live" signal.
 */
export function rollTo(node: HTMLElement, value: number, ms = 1400): void {
  if (prefersReducedMotion()) {
    node.textContent = value.toLocaleString();
    return;
  }

  const from = Number(node.dataset['value'] ?? 0) || 0;
  node.dataset['value'] = String(value);
  node.classList.add('is-rolling');

  const startedAt = performance.now();
  const step = (now: number): void => {
    const t = clamp((now - startedAt) / ms, 0, 1);
    // easeOutExpo — a fast tally that settles precisely
    const eased = t === 1 ? 1 : 1 - Math.pow(2, -10 * t);
    node.textContent = Math.round(from + (value - from) * eased).toLocaleString();
    if (t < 1) {
      window.requestAnimationFrame(step);
    } else {
      node.textContent = value.toLocaleString();
      node.classList.remove('is-rolling');
    }
  };
  window.requestAnimationFrame(step);
}

export function startClock(node: HTMLElement): () => void {
  const paint = (): void => {
    const now = new Date();
    const hh = String(now.getHours()).padStart(2, '0');
    const mm = String(now.getMinutes()).padStart(2, '0');
    const ss = String(now.getSeconds()).padStart(2, '0');
    node.textContent = `${hh}:${mm}:${ss}`;
  };
  paint();
  const id = window.setInterval(paint, 1000);
  return () => window.clearInterval(id);
}

/** Warm motes drifting through the sunset light. */
export function buildDust(host: HTMLElement, rand: () => number, count = 26): void {
  const frag = document.createDocumentFragment();
  for (let i = 0; i < count; i += 1) {
    const mote = el('i');
    const size = 1.4 + rand() * 3.2;
    mote.style.width = `${size.toFixed(1)}px`;
    mote.style.height = `${size.toFixed(1)}px`;
    mote.style.left = `${(rand() * 100).toFixed(2)}%`;
    mote.style.top = `${(58 + rand() * 46).toFixed(2)}%`;
    mote.style.opacity = (0.25 + rand() * 0.6).toFixed(2);
    mote.style.animationDuration = `${(11 + rand() * 15).toFixed(1)}s`;
    mote.style.animationDelay = `${(-rand() * 22).toFixed(1)}s`;
    frag.append(mote);
  }
  host.append(frag);
}
