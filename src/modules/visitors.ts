/**
 * Global visit counter.
 *
 * Backed by Abacus (https://github.com/JasonLovesDoggo/abacus) — keyless, no
 * signup, HTTPS, plain JSON, and it answers with `Access-Control-Allow-Origin: *`
 * so a static GitHub Pages origin can read it directly. It also exposes a
 * read-only `/get` next to the incrementing `/hit`, which matters here: only
 * `/hit` may fire, and only once per page load.
 *
 * Deliberately no geolocation. The visitor-detail panel was dropped, and with
 * nothing to show there is no reason to ship anyone's IP to a third party.
 */

/** One constant, so swapping providers — or self-hosting — is a one-liner. */
const COUNTER_HOST = 'https://abacus.jasoncameron.dev';
const COUNTER_NS = 'mwohaneungeoyeyo';

/**
 * Separate keys per build, so running the dev server never moves the number
 * the public site shows.
 */
const COUNTER_KEY = import.meta.env.PROD ? 'visits' : 'dev';

const FETCH_TIMEOUT_MS = 3000;
const LAST_TOTAL_KEY = 'mhg:last-total';

export interface CounterResult {
  total: number | null;
  /** True when the number came from the network rather than from cache. */
  online: boolean;
}

let hitFired = false;

/**
 * Increment and read the global counter.
 *
 * The first call in a page load uses `/hit`; anything after it uses `/get`, so
 * a replay or a re-render can never inflate the number.
 */
export async function loadCounter(): Promise<CounterResult> {
  const verb = hitFired ? 'get' : 'hit';
  hitFired = true;

  const value = await fetchCount(`${COUNTER_HOST}/${verb}/${COUNTER_NS}/${COUNTER_KEY}`);

  if (value !== null) {
    safeWrite(LAST_TOTAL_KEY, String(value));
    return { total: value, online: true };
  }

  // Show the last number we saw rather than a dash if the service is down.
  const cached = Number(safeRead(LAST_TOTAL_KEY));
  return { total: Number.isFinite(cached) && cached > 0 ? cached : null, online: false };
}

async function fetchCount(url: string): Promise<number | null> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      cache: 'no-store',
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { value?: unknown };
    return typeof body.value === 'number' && Number.isFinite(body.value) ? body.value : null;
  } catch {
    // network failure, CORS rejection, abort, or malformed JSON — all "no data"
    return null;
  } finally {
    window.clearTimeout(timer);
  }
}

function safeRead(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeWrite(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    /* private mode / storage disabled */
  }
}
