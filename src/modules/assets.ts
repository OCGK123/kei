/**
 * Asset loading.
 *
 * Everything lives in /public and is addressed through Vite's BASE_URL so the
 * build is portable between a project page (user.github.io/<repo>/), a user
 * page, and the dev server. With `base: './'` BASE_URL is `./`, which the
 * browser resolves against the document URL.
 */

export const BASE = import.meta.env.BASE_URL;

export const ASSETS = {
  background: `${BASE}background.png`,
  char: `${BASE}char.png`,
  halo: `${BASE}halo.png`,
  bgm: `${BASE}bgm.mp3`,
} as const;

/** Decode an image fully so the first paint after the flash is never janky. */
function loadImage(src: string): Promise<void> {
  return new Promise((resolve) => {
    const img = new Image();
    // resolve (never reject) — a missing decoration must not brick the site
    const done = (): void => resolve();
    img.onload = () => {
      if (typeof img.decode === 'function') {
        img.decode().then(done, done);
      } else {
        done();
      }
    };
    img.onerror = done;
    img.src = src;
  });
}

export interface PreloadResult {
  ok: boolean;
}

/**
 * Preload the two heavy images while the boot screen is showing, reporting
 * coarse progress. The audio file is intentionally *not* awaited — it streams
 * once playback starts and would otherwise stall the entry by seconds.
 */
export async function preloadScene(onProgress: (fraction: number) => void): Promise<PreloadResult> {
  const jobs = [ASSETS.background, ASSETS.char, ASSETS.halo];
  let done = 0;

  onProgress(0);

  await Promise.all(
    jobs.map((src) =>
      loadImage(src).then(() => {
        done += 1;
        onProgress(done / jobs.length);
      }),
    ),
  );

  // Hand the resolved URLs to CSS. Quoting guards against any character in the
  // base path that would otherwise terminate the url() token early.
  const root = document.documentElement;
  root.style.setProperty('--bg-src', `url("${ASSETS.background}")`);
  root.style.setProperty('--char-src', `url("${ASSETS.char}")`);

  onProgress(1);
  return { ok: true };
}
