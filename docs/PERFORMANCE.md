# Performance

Every number here was measured. Machine for all of them: Apple M5 (10-core GPU), 24 GB, macOS
27.0, except the CI run times, which name their GitHub runners. Every browser number is from
Google Chrome; Safari, Firefox and Edge were not measured. The macOS CI runner has no
`timestamp-query`, so CI gives no GPU times on a hardware GPU; the only GPU times from CI are the
SwiftShader ones at the end of the CI section. The power source, Low Power Mode and background
load were not recorded. Re-run with the commands given (two measurements, marked where they
appear, have no script in the repository); results depend on the browser, the power state and
what else the GPU is doing.

## GPU renderer (Stage 3)

`npm run bench:gpu`: Google Chrome 156.0.8078.48, headless, driven by Playwright; WebGPU adapter
"apple / metal-3" (not the fallback adapter). Settings: star field on, default disk (opaque,
$6M$ to $20M$), $d\phi = 0.05$, step cap 1000, 256 x 256 tiles submitted back to back, tone
mapping on. Each cell is the median of nine runs after a warm-up run. All times are GPU
milliseconds from timestamp queries.

Measured on 2026-10-27 on the code of commit 8783558 (inferred: `artifacts/stage3/benchmark.json`
was written 16 s before that commit). The image path changed afterwards only in two refactors
(6def8d9, the termination colours from one constant; bde3726, tile submission) and was not
re-measured. The harness renders offscreen at the stated sizes.

Stages of one image (section 12 of `docs/DESIGN.md`): the **first pass** traces one sample per
pixel; **anti-aliasing** adds a 3 x 3 grid of samples where the image needs it; a **preview** is
a whole frame at reduced resolution, shown while the view changes when a full-resolution first
pass does not fit the page's 12 ms frame budget. **Full image** is the sum of the first-pass and
anti-aliasing medians. **Frame while moving** is derived, not measured: the page's rule
(`choosePreviewScale` with the 12 ms budget) applied to the measured first pass.

Default view (30 M, elevation 12 degrees, 60 degree field of view):

| Disk | Resolution  | First pass | Anti-aliasing | Refined pixels | Full image | Preview 1/2 | Preview 1/4 | Frame while moving |
| ---- | ----------- | ---------- | ------------- | -------------- | ---------- | ----------- | ----------- | ------------------ |
| on   | 960 x 540   | 1.51       | 2.75          | 9.6 %          | 4.26       | 0.39        | 0.13        | full resolution    |
| on   | 1920 x 1080 | 5.31       | 7.47          | 6.1 %          | 12.78      | 1.51        | 0.39        | full resolution    |
| on   | 2560 x 1440 | 9.18       | 10.62         | 5.0 %          | 19.79      | 2.42        | 0.66        | full resolution    |
| on   | 3840 x 2160 | 20.12      | 20.19         | 3.6 %          | 40.30      | 5.31        | 1.51        | preview 1/2        |
| off  | 960 x 540   | 1.77       | 3.15          | 13.0 %         | 4.92       | 0.46        | 0.13        | full resolution    |
| off  | 1920 x 1080 | 6.36       | 8.78          | 8.9 %          | 15.14      | 1.77        | 0.46        | full resolution    |
| off  | 2560 x 1440 | 11.01      | 13.43         | 7.4 %          | 24.44      | 2.88        | 0.79        | full resolution    |
| off  | 3840 x 2160 | 24.25      | 25.49         | 5.6 %          | 49.74      | 6.36        | 1.77        | preview 1/2        |

Other views, disk on:

| View                                | Resolution  | First pass | Anti-aliasing | Refined pixels | Full image | Frame while moving |
| ----------------------------------- | ----------- | ---------- | ------------- | -------------- | ---------- | ------------------ |
| Close: 5 M, 20 degrees, 120 degrees | 1920 x 1080 | 6.23       | 14.35         | 12.1 %         | 20.58      | full resolution    |
| Close: 5 M, 20 degrees, 120 degrees | 3840 x 2160 | 23.20      | 42.99         | 9.1 %          | 66.19      | preview 1/2        |
| Far: 200 M, 12 degrees, 60 degrees  | 1920 x 1080 | 6.62       | 7.80          | 7.7 %          | 14.42      | full resolution    |
| Far: 200 M, 12 degrees, 60 degrees  | 3840 x 2160 | 25.43      | 21.63         | 4.3 %          | 47.05      | preview 1/2        |

The full table (every view, disk on and off, four resolutions) is printed by the benchmark and
saved to `artifacts/stage3/benchmark.json`.

What the numbers mean:

- **Frame-rate target** (30 frames per second at 1920 x 1080 with the disk, 33 ms per frame).
  What was measured is GPU time, not frames: while the view changes, each frame is a
  full-resolution first pass, 5.31 ms of GPU time in this setting. Once the view has been still
  for the page's 120 ms settle time, the full-resolution first pass and the anti-aliasing (12.78
  ms of GPU time together) are spread over frames by the 12 ms budget. The frame rate in a
  visible browser window, and how many frames the refinement takes, were not measured.
- **The disk changes the first pass's cost by view.** An opaque disk ends many rays at their
  first crossing: at 1920 x 1080 the first pass is cheaper with the disk in the default view
  (5.31 against 6.36 ms) and in the close view (6.23 against 6.36 ms), but dearer in the far view
  (6.62 against 5.96 ms). The other three resolutions in `benchmark.json` show the same pattern.
- **Adaptive against uniform anti-aliasing.** Refining every pixel (uniform 3 x 3
  supersampling) takes 10.75, 40.37, 70.12 and 155.39 ms for the four resolutions of the default
  view with the disk, against 2.75, 7.47, 10.62 and 20.19 ms.
- **Workgroup compaction** of the refined samples (`docs/DESIGN.md`, section 12) brought the
  anti-aliasing pass at 1920 x 1080 from 13.63 to 7.47 ms in the default view and from 25.23 to
  14.35 ms in the close view, with identical images.

Caveats:

- **GPU ms** is the time between the start of a pass's first tile and the end of its last, from
  timestamp queries. It includes any idle gaps between the separate tile submissions, so it
  slightly overstates the pure compute time. Chrome quantises timestamps: all 112 values here are
  multiples of 0.065536 ms ($2^{16}$ ns), which limits the precision of the small ones.
- **Headless.** The browser was not compositing to a display. A visible browser window may
  differ; the interactive page shows the GPU time of each stage in its corner.
- **Refined share** depends on the view: stars and disk edges trigger refinement, so busy views
  cost more.

## Overlays and the Validation panel (Stage 4)

Apple M5, macOS 27.0, Chrome 156.0.8078.48 (headless), `npm run bench:gpu`, except the one-off
measurement that gives its own setup below. Measured on 2026-10-27 (shadow measurement, code of
commit 5decbee) and 2026-10-28 (ring overlays, code of commit 106e9e3), inferred from the times of
the result files. Neither was re-measured: the classification later also counts white pixels that
the termination render captured (2a2b0f3), and the ring computation has not changed since (f7714e6
only added a refresh of the overlays that runs no solver slice).

**Shadow measurement** (`tests/bench/validation.spec.ts`): two 1024 x 1024 passes per
measurement, median of 9 after a warm-up. Pass times are GPU time from timestamp queries;
readback (`mapAsync`) and classification (in the page) are wall-clock, from `performance.now()`,
whose values here come in steps of 0.1 ms; that limits the readback figures (0.6 to 0.7 ms).

| Distance | Colour pass ms | Termination pass ms | Readback ms | Classification ms |
| -------- | -------------- | ------------------- | ----------- | ----------------- |
| 5 M      | 3.93           | 2.10                | 0.70        | 5.10              |
| 30 M     | 3.60           | 2.03                | 0.70        | 5.80              |
| 200 M    | 4.26           | 3.01                | 0.60        | 5.80              |

- Classification first decoded each half float with arithmetic: 20.7, 25.7 and 26.2 ms at the
  three distances. Decoding through a table of all 65,536 values brought it to 5.1 to 5.8 ms
  (identical counts). Pass times vary between runs by up to about 1.4 ms (the first run measured
  4.46, 4.98 and 4.26 ms for the colour pass).
- A one-off measurement on 2026-10-28 on the code of commit 106e9e3 (inferred from the file
  times), made with a local Playwright script that is not in the repository, so it cannot be
  re-run from it, against the Vite dev server in headless Google Chrome 156 (patch version not
  recorded by that run): in the page (1280 x 720 window, 5 loads per distance), the panel's
  wall-clock time from request to result, `stats().validationMs`, has a median of 33.8 ms at 5 M,
  38.1 ms at 30 M and 27.8 ms at 200 M; it includes waiting for the GPU queue and is measured only
  while the panel is open.
- Memory while the panel is open: an 8 MB `rgba16float` render and a 16 MiB readback buffer,
  freed when it closes.

**Ring overlays** (`tests/bench/overlays.spec.ts`): 1920 x 1080, horizon, photon sphere and ISCO
rings on (four curves), median of 7 elevation changes, each to a new elevation so no curve comes
from the cache.

| View                  | Ring computation ms (main thread) | Settle time to rings drawn ms | Key press to rings drawn ms |
| --------------------- | --------------------------------- | ----------------------------- | --------------------------- |
| Default: 30 M, 12 deg | 36.3                              | 130                           | 265                         |
| Close: 5 M, 20 deg    | 51.9                              | 163                           | 298                         |
| Far: 200 M, 12 deg    | 40.4                              | 130                           | 266                         |

- All three are wall-clock. The first two come from `performance.now()` in the page; the key
  press column is timed in the test process with `Date.now()` and includes Playwright's polling
  for the drawn state.
- The computation runs in slices of 8 ms per frame after the 120 ms settle time. With 4 ms slices
  the same benchmark measured 50.0, 46.8 and 53.0 ms of computation and 247, 246 and 230 ms from
  the settle time to the rings, just under the 250 ms at which the design would have added a
  lookup table (`docs/DESIGN.md`, section 13). The computation time itself varies between runs by
  about 15 ms.
- The shadow edge is closed form and drawn in the same frame. Toggling an overlay renders no GPU
  frame.
- Separately, in Node 25.6.1 on the same machine (a script, not in the repository): one ring
  image solve takes 54 microseconds on average over 1200 solves (observer at 5, 6, 30 and 200 M,
  rings at 2, 3 and 6 M, sweeps up to $4\pi$), and one curve 8.4 ms on average over 336 curves
  (7 distances, 12 elevations, 4 curves each), with at most 513 vertices.

## EHT-style view: the post-process (Stage 7)

`npm run bench:gpu` (`tests/bench/eht.spec.ts`): Google Chrome 156.0.8078.80, headless, driven by
Playwright; adapter "apple / metal-3". Measured on 2026-11-05 on the code of commit 8e1a4f1
(`artifacts/stage7/benchmark.json`). Each present renders the image once (first pass, no
anti-aliasing), then times one present into an offscreen target: in the EHT-style view the six
compute passes (tent reduce along x and y, blur along x and y, peak, normalisation) and the
colour-mapped upsample; in the colour view the tone-mapping blit. GPU milliseconds from one pair
of timestamp queries around the whole present, median of 15 after 10 untimed presents. Chrome
rounds these timestamps to steps of 0.0655 ms, so differences below that are not resolved. A
first run without that warm-up measured the same 960 x 540 present at 2.43 ms first and
0.52 ms a few presents later, so the GPU's clock state matters.

| Present                                | Camera                         | Resolution  | Reduce $f$ | Reduced grid | GPU ms                 |
| -------------------------------------- | ------------------------------ | ----------- | ---------- | ------------ | ---------------------- |
| EHT-style                              | preset (200 M, -73 deg)        | 960 x 540   | 2          | 480 x 270    | 0.459                  |
| EHT-style                              | preset                         | 1920 x 1080 | 4          | 480 x 270    | 0.655                  |
| EHT-style                              | preset                         | 3840 x 2160 | 8          | 480 x 270    | 1.769                  |
| EHT-style                              | default camera (30 M, 12 deg)  | 960 x 540   | 2          | 480 x 270    | 0.393                  |
| EHT-style                              | default camera                 | 1920 x 1080 | 4          | 480 x 270    | 0.721                  |
| EHT-style                              | default camera                 | 3840 x 2160 | 8          | 480 x 270    | 1.769                  |
| EHT-style without the reduce ($f = 1$) | preset                         | 960 x 540   | 1          | 960 x 540    | 2.425                  |
| Colour view blit                       | default (30 M, 12 deg, fov 60) | 960 x 540   |            |              | 0.000 (below one step) |
| Colour view blit                       | default                        | 1920 x 1080 |            |              | 0.066                  |
| Colour view blit                       | default                        | 3840 x 2160 |            |              | 0.262                  |

The reduced grid is the same at every size, because the framing ties the beam to the shorter
image side: the cost grows only with the reduce, which reads $2f$ pixels per output along each
axis. An earlier version reduced in one two-dimensional pass ($(2f)^2$ reads per reduced texel)
and measured 1.57 ms at 1920 x 1080 and 9.6 ms at 3840 x 2160; doing it along x and then y
brought those to 0.66 to 0.72 ms and 1.77 ms. Without the reduce, the blur at 960 x 540 costs
five times as much. The page's frame budget of 12 ms counts only the tiles; the design's rule was
to subtract the post-process from it if it took more than 1 ms at 1920 x 1080, which it does not,
so the budget is unchanged. At 4K each present adds about 1.8 ms to its frame.

## Photon subring view: the strip (Stage 7)

`npm run bench:gpu` (`tests/bench/subrings.spec.ts`): Google Chrome 156.0.8078.80, headless;
adapter "apple / metal-3"; measured on 2026-11-05 on the code of commit d68c8e6
(`artifacts/stage7/benchmark-subrings.json`). Default disk, no anti-aliasing (the strip view has
none), black sky for the strip and the star field for the colour view, $d\phi = 0.05$, step cap 1000. GPU milliseconds from timestamp queries, median of nine runs after a warm-up run.

| View   | Camera                 | Resolution  | First pass ms | Preview 1/2 ms | Preview 1/4 ms |
| ------ | ---------------------- | ----------- | ------------- | -------------- | -------------- |
| Strip  | default (30 M, 12 deg) | 960 x 540   | 2.82          | 0.79           | 0.20           |
| Colour | default (30 M, 12 deg) | 960 x 540   | 1.57          | 0.39           | 0.13           |
| Strip  | default                | 1920 x 1080 | 8.19          | 2.23           | 0.66           |
| Colour | default                | 1920 x 1080 | 5.51          | 1.57           | 0.46           |
| Strip  | face-on (30 M, 90 deg) | 960 x 540   | 3.41          | 0.92           | 0.26           |
| Colour | face-on                | 960 x 540   | 1.25          | 0.33           | 0.13           |
| Strip  | face-on                | 1920 x 1080 | 13.24         | 3.41           | 0.92           |
| Colour | face-on                | 1920 x 1080 | 4.59          | 1.31           | 0.39           |

Every strip pixel traces a ray close to the photon sphere, so the strip costs 1.5 to 2.9 times
the colour view of the same camera. The page keeps a separate cost estimate per view, so its
first frames after switching are planned without the colour view's estimate.

## Download size (Stage 6)

`npm run build`, then `npm run size` (Node 25.6.1; gzip level 9 and brotli quality 11 from
`node:zlib`). Bytes of the build at commit c13ec2a, which added the social preview image; the JS,
CSS and `index.html` are those of b310128, which changed the browser list of the page for browsers
without WebGPU (the Stage 6 comment change in `src/physics/colour.ts` builds to the same files, byte
for byte, checked by building it).

| Files                  | Raw     | gzip    | brotli  |
| ---------------------- | ------- | ------- | ------- |
| JS (one file)          | 102,412 | 36,199  | 32,247  |
| CSS (one file)         | 5,917   | 1,926   | 1,648   |
| `index.html`           | 887     | 485     | 348     |
| `favicon.svg`          | 233     | 168     | 143     |
| Gallery PNGs (4 files) | 408,789 | 408,411 | 408,335 |
| `social-preview.png`   | 248,032 | 247,946 | 248,037 |
| Everything in `dist/`  | 766,270 | 695,135 | 690,758 |

With WebGPU the page loads `index.html`, the JS and the CSS (and possibly the favicon): 109,216
bytes, 38,610 with gzip. The gallery images load only on the page for browsers without WebGPU, and
the social preview is never loaded by the page (link previews fetch it). What GitHub Pages actually
sends compressed was not measured. There is no size budget.

## CI run times (Stage 5)

GitHub Actions on 2026-10-28, from the step start and end times GitHub reports (queue time not
included). Run A is the first green push (eb4f2dc), run B a manual run with the full page suite
on Ubuntu, run C the first push (2acad41), whose Ubuntu page job failed for the reason in
`docs/DESIGN.md`, section 5.

| Job and step                                   | Runner, browser                                                          | Run A                       | Run B                                                           | Run C      |
| ---------------------------------------------- | ------------------------------------------------------------------------ | --------------------------- | --------------------------------------------------------------- | ---------- |
| `checks`, whole job                            | ubuntu-24.04, Node 24                                                    | 33 s                        | 41 s                                                            | 52 s       |
| `page`, the probe                              | ubuntu-24.04, Chrome 155.0.8059.39 (A) or 156.0.8078.47 (B), SwiftShader | 4 s                         | 9 s                                                             |            |
| `page`, offline test (3 tests, with the build) | same                                                                     | 39 s                        | 37 s                                                            |            |
| `page`, page tests on the build                | same                                                                     | 2 min 52 s (14 smoke tests) | 31 min 37 s (109 tests, one failing twice at the 120 s timeout) |            |
| `gpu`, the probe                               | macos-15-arm64, Chrome 152.0.7977.83, Apple GPU                          | 16 s                        | 19 s                                                            |            |
| `gpu`, GPU parity (13 tests)                   | same                                                                     | 3 min 39 s                  | 4 min 9 s                                                       | 2 min 9 s  |
| `gpu`, page tests on the build (109 tests)     | same                                                                     | 4 min 31 s                  | 5 min 10 s                                                      | 3 min 12 s |
| `gpu`, whole job                               | same                                                                     | 8 min 50 s                  | 10 min 1 s                                                      | 5 min 40 s |

In run C the probe only listed the adapter (6 s on macOS); the compute and canvas checks came
later, so its cells are left empty. The same macOS steps varied by up to a factor of 1.9 between
runs, so these are single samples, not typical values. The Ubuntu runners vary as much: of eight
later runs started within seven minutes, six took 5.4 to 6.3 min for the 14 smoke tests and two
took 2.8 to 2.9 min.

On the Ubuntu runner with SwiftShader, in Chrome 156.0.8078.47, the default view at 1280 x 720,
zoomed out to 33 M, took 4349.4 and 4502.5 ms of GPU time for the first pass and 4818.0 and
5090.8 ms for anti-aliasing (timestamp queries, read from the page in the two attempts of one
test in run B). On the M5's GPU the full image of the default view at the larger 1920 x 1080
takes 12.78 ms (table above). In 4 of the first 17 runs on 2026-10-28 GitHub assigned no macOS
runner within 15 to 25 minutes and cancelled the job.

## CPU reference renderer

`npm run render:cpu`: Node 25.6.1, one thread, f64, $d\phi = 0.0125$. A 320 x 180 image with 3 x 3
samples (518,400 rays) takes 1.0 s without gravity and 2.4 to 3.5 s with the black hole, with or
without the disk. The 640 x 360 gallery images (2.07 million rays each) take 9 to 14 s.

### README image (CPU reference renderer)

`npm run render:hero` (`tools/render-hero.ts`, views in `tools/hero-views.ts`, commit afd9fd5),
measured on 2026-10-28: Node 25.6.1, one thread, f64, $d\phi = 0.0125$, at most 4000 steps per
ray, 3 x 3 samples per pixel, the page's scene (star sky, the default disk, exposure 1, tone
mapping) and its automatic field of view. `docs/images/hero.png` is the first row, the page's
opening view (`#v=1&r=30&az=0&el=12&disk=1&aa=1&view=colour&ov=none&val=0`). All eight rows come
from one run of `npm run render:hero -- --candidates`, which writes them to the gitignored
`artifacts/stage6/`. The owner kept the default view: `public/social-preview.png` is the fifth
row's view, rendered again on 2026-11-04 by `npm run render:hero -- --social` (41.6 s, the same
248,032 bytes).

| Candidate            | Distance, elevation, field of view | Size       | Time   | PNG bytes |
| -------------------- | ---------------------------------- | ---------- | ------ | --------- |
| `01-hero-default`    | 30 M, 12 degrees, 60 degrees       | 1600 x 900 | 75.0 s | 377,204   |
| `02-hero-edge-on`    | 30 M, 2 degrees, 60 degrees        | 1600 x 900 | 64.0 s | 446,638   |
| `03-hero-close-5M`   | 5 M, 20 degrees, 120 degrees       | 1600 x 900 | 67.7 s | 568,429   |
| `04-hero-wide-60M`   | 60 M, 8 degrees, 60 degrees        | 1600 x 900 | 60.1 s | 402,160   |
| `01-social-default`  | 30 M, 12 degrees, 60 degrees       | 1280 x 640 | 41.7 s | 248,032   |
| `02-social-edge-on`  | 30 M, 2 degrees, 60 degrees        | 1280 x 640 | 35.9 s | 284,740   |
| `03-social-close-5M` | 5 M, 20 degrees, 120 degrees       | 1280 x 640 | 39.7 s | 352,565   |
| `04-social-wide-60M` | 60 M, 8 degrees, 60 degrees        | 1280 x 640 | 33.8 s | 251,822   |

A 1600 x 900 image traces 12,960,000 samples and a 1280 x 640 one 7,372,800; in all eight, every
sample was finite and none reached the step limit. The eight images and a contact sheet took
6 min 58 s in all. A separate `npm run render:hero` wrote `docs/images/hero.png` in 75.8 s, with
the same bytes as `01-hero-default` (identical SHA-256).
