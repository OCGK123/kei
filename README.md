# 뭐하는거에요!!!!!!!!

A single-page site with a Blue Archive style opening sequence: black screen →
click to start → mission-start transition → white flash → the scene develops
behind it. The background and the character both track the pointer, the
background barely at all and the character smoothly.

Built with **TypeScript + Vite**, no runtime dependencies. Deployed to GitHub
Pages by GitHub Actions.

---

## Running it

```bash
npm install
npm run dev
```

| script | what it does |
| --- | --- |
| `npm run dev` | dev server on http://localhost:5173 |
| `npm run build` | typecheck (`tsc --noEmit`) then bundle to `dist/` |
| `npm run preview` | serve the built `dist/` |
| `npm run typecheck` | types only |

---

## How it is put together

```
index.html            three stacked full-viewport layers: boot / opening / scene
src/main.ts           the state machine that walks between them
src/modules/
  assets.ts           preloads the heavy images, hands their URLs to CSS
  audio.ts            BGM with volume ramps; only ever started from a gesture
  opening.ts          the mission-start sequence clock + generated pieces
  parallax.ts         pointer tracking for the background / glow / character
  visitors.ts         the global visit counter
  hud.ts              count-up tally, clock, dust motes
  dom.ts              small helpers (seeded RNG, lerp, clamp)
src/styles/
  tokens.css          palette, easing curves, the signature -18deg skew
  boot.css opening.css scene.css hud.css
tools/extract-halo.cjs  regenerates public/halo.png from public/char.png
```

### The opening sequence

Every beat is a CSS `animation-delay` hanging off one `.is-playing` class on
`#opening`, so the whole thing shares a single clock and cannot drift. The beat
table lives in a comment at the top of `src/styles/opening.css`:

```
0     scanline sweeps down
180   diagonal band 1 (navy)  from the left
300   diagonal band 2 (navy)  from the right
420   diagonal band 3 (blue)  from the left
540   diagonal band 4 (cyan hairline)
700   dot grid drifts in
820   halo slams in, then floats
1400  technical readout types in
2200  corner brackets snap
2500  MISSION START band rockets across
2950  subtitle
3350  speed lines burst
3800  white flash
```

`src/modules/opening.ts` owns only what CSS cannot express — the typed readout
and the generated speed-line fan — plus the promise that resolves when the
sequence ends. `SKIP` resolves it early.

The white flash blows out in 260 ms, holds at full white for 700 ms, then
dissolves over ~2.9 s. The scene is swapped in while the screen is fully white,
so the cut is never visible; it simply develops behind the fading white.

### The halo

`public/halo.png` is Kei's actual halo, lifted out of `public/char.png` rather
than redrawn. `tools/extract-halo.cjs` decodes the PNG and keys on saturation
*relative to the red channel* — the hair sits at 0.08–0.11 and the neon at
0.34–0.54, which absolute saturation cannot separate. A bright-core pass plus a
5 px dilation then recovers the halo's own dark inner faces without dragging in
the hair ribbon behind it.

```bash
node tools/extract-halo.cjs public/char.png public/halo.png
```

### Parallax

`src/modules/parallax.ts` runs one rAF loop over three layers with very
different feels:

| layer | travel | smoothing |
| --- | --- | --- |
| background | 7 × 4 px | heaviest (0.028) — a barely-there drift |
| halo glow | 26 × 15 px | 0.06 |
| character | 34 × 19 px + 0.95° sway | lightest (0.085) — tracks the pointer |

The per-frame lerp factor is derived from real elapsed time
(`1 - (1 - k)^(dt·60)`), so a 144 Hz display damps identically to a 60 Hz one.
Touch devices fall back to `deviceorientation`; `prefers-reduced-motion` cuts
every amplitude to a quarter.

### The visit counter

Backed by [Abacus](https://github.com/JasonLovesDoggo/abacus) — keyless, no
signup, HTTPS, plain JSON, and `Access-Control-Allow-Origin: *`. `/hit` fires
exactly once per page load; anything else reads through `/get`, so a replay
cannot inflate the number. Dev and production use different keys. If the
service is unreachable the last known total is shown from `localStorage`
instead of an error.

The counter is the only network call the site makes. There is no analytics and
no geolocation.

---

## Deploying

`.github/workflows/deploy.yml` builds and publishes to Pages on every push to
`main`. `vite.config.ts` uses `base: './'`, so the build works unchanged on a
project page, a user page, or a local `preview` — there is no router, so a
relative base has nothing to break.

**One manual step, once:** repository **Settings → Pages → Build and deployment
→ Source → GitHub Actions**. Leaving it on "Deploy from a branch" makes the
deploy job fail.

### Cutting a release

```bash
git tag v1.0.0
git push origin v1.0.0
```

`.github/workflows/release.yml` builds, zips `dist/` and attaches it to a
GitHub Release with auto-generated notes.

---

## Assets

`background.png`, `char.png` and `bgm.mp3` are supplied by the site owner.
GitHub Pages sites are publicly reachable even from a private repository, so
these files are public once deployed.
