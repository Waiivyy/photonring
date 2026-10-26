# Performance

Every number here was measured. Machine for all of them: Apple M5 (10-core GPU), 24 GB, macOS
27.0. Re-run with the commands given; results depend on the browser, the power state and what else
the GPU is doing.

## GPU renderer (Stage 2: no disk, no anti-aliasing)

`npm run bench:gpu`: Google Chrome 156.0.8078.47, headless, driven by Playwright; WebGPU adapter
"apple / metal-3" (not the fallback adapter). Settings: star field on, one sample per pixel,
$d\phi = 0.05$, step cap 1000, 256 x 256 tiles submitted back to back. Each cell renders the full
image nine times after a warm-up run.

| View                      | Resolution  | GPU ms (median) | GPU ms (min) | Wall ms (median) | Million rays per second |
| ------------------------- | ----------- | --------------- | ------------ | ---------------- | ----------------------- |
| 30 M, 12 degrees, fov 60  | 960 x 540   | 2.36            | 1.90         | 2.80             | 220                     |
| 30 M, 12 degrees, fov 60  | 1920 x 1080 | 6.23            | 5.77         | 6.80             | 333                     |
| 30 M, 12 degrees, fov 60  | 2560 x 1440 | 10.55           | 10.29        | 11.20            | 349                     |
| 30 M, 12 degrees, fov 60  | 3840 x 2160 | 22.87           | 22.41        | 23.40            | 363                     |
| 5 M, 20 degrees, fov 120  | 1920 x 1080 | 6.09            | 5.57         | 6.40             | 340                     |
| 5 M, 20 degrees, fov 120  | 3840 x 2160 | 22.02           | 21.56        | 22.70            | 377                     |
| 200 M, 12 degrees, fov 60 | 1920 x 1080 | 5.83            | 5.44         | 6.30             | 356                     |
| 200 M, 12 degrees, fov 60 | 3840 x 2160 | 22.35           | 21.50        | 22.90            | 371                     |

(The full table, including 960 x 540 and 2560 x 1440 for every view, is printed by the benchmark
and saved to `artifacts/stage2/benchmark.json`.)

Caveats:

- **GPU ms** is the time between the start of the first tile's compute pass and the end of the
  last one, from timestamp queries. It includes any idle gaps between the separate tile
  submissions, so it slightly overstates the pure compute time. Chrome quantises timestamps to
  100 microseconds by default.
- **Wall ms** runs from the first submission until `onSubmittedWorkDone` resolves, so it includes
  submission and scheduling overhead.
- **Headless.** The browser was not compositing to a display. A visible browser window may differ;
  the interactive page shows its own GPU time per batch in the corner.
- **Not the final frame cost.** Stage 3 adds the disk, anti-aliasing and reduced resolution while
  the camera moves, which will change these numbers. The Stage 0 target of 30 frames per second at
  1920 x 1080 with the disk is not yet measured.

## CPU reference renderer

`npm run render:cpu`: Node 25.6.1, one thread, f64, $d\phi = 0.0125$. A 320 x 180 image with 3 x 3
samples (518,400 rays) takes 1.0 s without gravity and 2.4 to 3.5 s with the black hole, with or
without the disk. The 640 x 360 gallery images (2.07 million rays each) take 9 to 14 s.
