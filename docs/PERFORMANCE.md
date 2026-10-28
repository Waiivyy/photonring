# Performance

Every number here was measured. Machine for all of them: Apple M5 (10-core GPU), 24 GB, macOS
27.0. Re-run with the commands given; results depend on the browser, the power state and what else
the GPU is doing.

## GPU renderer (Stage 3)

`npm run bench:gpu`: Google Chrome 156.0.8078.48, headless, driven by Playwright; WebGPU adapter
"apple / metal-3" (not the fallback adapter). Settings: star field on, default disk (opaque,
$6M$ to $20M$), $d\phi = 0.05$, step cap 1000, 256 x 256 tiles submitted back to back, tone
mapping on. Each cell is the median of nine runs after a warm-up run. All times are GPU
milliseconds from timestamp queries.

Stages of one image (section 12 of `docs/DESIGN.md`): the **first pass** traces one sample per
pixel; **anti-aliasing** adds a 3 x 3 grid of samples where the image needs it; a **preview** is
a whole frame at reduced resolution, shown while the view changes when a full-resolution first
pass does not fit the page's 12 ms frame budget.

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

| View                                | Resolution  | First pass | Anti-aliasing | Refined pixels | Full image |
| ----------------------------------- | ----------- | ---------- | ------------- | -------------- | ---------- |
| Close: 5 M, 20 degrees, 120 degrees | 1920 x 1080 | 6.23       | 14.35         | 12.1 %         | 20.58      |
| Close: 5 M, 20 degrees, 120 degrees | 3840 x 2160 | 23.20      | 42.99         | 9.1 %          | 66.19      |
| Far: 200 M, 12 degrees, 60 degrees  | 1920 x 1080 | 6.62       | 7.80          | 7.7 %          | 14.42      |
| Far: 200 M, 12 degrees, 60 degrees  | 3840 x 2160 | 25.43      | 21.63         | 4.3 %          | 47.05      |

The full table (every view, disk on and off, four resolutions) is printed by the benchmark and
saved to `artifacts/stage3/benchmark.json`.

What the numbers mean:

- **Frame-rate target** (30 frames per second at 1920 x 1080 with the disk): met with a wide
  margin in this setting. While the view changes, each frame is a full-resolution first pass,
  5.3 ms of GPU time; the page is then limited by the display's refresh rate, not by the GPU.
  The anti-aliased image is complete 12.8 ms of GPU time after the view stops, spread over two
  or three frames by the budget.
- **The disk makes the first pass cheaper**: an opaque disk ends many rays at their first
  crossing.
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

Apple M5, macOS 27.0, Chrome 156 (headless), `npm run bench:gpu`.

**Shadow measurement** (`tests/bench/validation.spec.ts`): two 1024 x 1024 passes per
measurement, median of 9 after a warm-up. Pass times are GPU time from timestamp queries;
readback (`mapAsync`) and classification (in the page) are wall-clock.

| Distance | Colour pass ms | Termination pass ms | Readback ms | Classification ms |
| -------- | -------------- | ------------------- | ----------- | ----------------- |
| 5 M      | 3.93           | 2.10                | 0.70        | 5.10              |
| 30 M     | 3.60           | 2.03                | 0.70        | 5.80              |
| 200 M    | 4.26           | 3.01                | 0.60        | 5.80              |

- Classification first decoded each half float with arithmetic: 20.7, 25.7 and 26.2 ms at the
  three distances. Decoding through a table of all 65,536 values brought it to 5.1 to 5.8 ms
  (identical counts). Pass times vary between runs by up to about 1 ms (the first run measured
  4.46, 4.98 and 4.26 ms for the colour pass).
- In the page (1280 x 720 window, 5 loads per distance), the panel's wall-clock time from request
  to result, `stats().validationMs`, has a median of 33.8 ms at 5 M, 38.1 ms at 30 M and 27.8 ms
  at 200 M; it includes waiting for the GPU queue and is measured only while the panel is open.
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

## CPU reference renderer

`npm run render:cpu`: Node 25.6.1, one thread, f64, $d\phi = 0.0125$. A 320 x 180 image with 3 x 3
samples (518,400 rays) takes 1.0 s without gravity and 2.4 to 3.5 s with the black hole, with or
without the disk. The 640 x 360 gallery images (2.07 million rays each) take 9 to 14 s.
