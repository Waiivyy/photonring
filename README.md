# photonring

A real-time, in-browser renderer of a non-rotating (Schwarzschild) black hole with a thin accretion disk, in which every physical claim is checked against analytic or independently computed values.

**Status: Stage 5 of 6.** The WebGPU renderer shows the black hole, its thin accretion disk (blackbody colour with Doppler and gravitational shifts, higher-order images and the photon ring) and the lensed star field, with adaptive anti-aliasing and progressive refinement, all checked against the f64 physics library and the CPU reference renderer. The page adds overlays (shadow edge, and the lensed images of the circles at 2M, 3M and 6M in the disk plane), a Validation panel that measures the shadow live against its analytic size, shareable views in the URL, keyboard and touch controls, an About dialog and saving the image as PNG. The production build has content-hashed files and a strict Content-Security-Policy, makes no requests beyond its own files, and is tested by GitHub Actions on every push to `main` and every pull request; deploys to GitHub Pages are started by hand.

## Run

```bash
npm install
npm run dev
```

Then open http://localhost:5179 in a browser with WebGPU (Chrome or Edge 113+, Safari 26 on macOS Tahoe or iOS 26, Firefox 141+ on Windows or 147+ on Apple Silicon). Drag to orbit and scroll or pinch to zoom, or use the Controls panel. With the view focused (click it or Tab to it), the arrow keys orbit, +/- zoom, D toggles the disk, A anti-aliasing, T the termination view, E, H, P and I the overlays, V the Validation panel, S saves the image and ? lists every key.

| Command                  | What it does                                                                                                    |
| ------------------------ | --------------------------------------------------------------------------------------------------------------- |
| `npm test`               | Physics, CPU renderer, golden and host-logic tests (Vitest)                                                     |
| `npm run test:gpu`       | GPU against CPU parity in headless Chrome: rays, disk, images, anti-aliasing (needs Google Chrome installed)    |
| `npm run test:e2e`       | Page behaviour in headless Chrome: controls, URL state, overlays, Validation panel, saving, layout, device loss |
| `npm run bench:gpu`      | GPU time per stage by view, disk and resolution; shadow measurement and ring overlay costs                      |
| `npm run gallery:gpu`    | Check-in views: GPU renders in `artifacts/stage3/`, the page in `artifacts/stage4/`                             |
| `npm run render:cpu`     | CPU reference renders in `artifacts/stage1/` and the shadow-size table                                          |
| `npm run spike`          | The Stage 0 integrator comparison                                                                               |
| `npm run golden:update`  | Re-renders golden images; writes only with `--accept <names>` or `--accept-all`                                 |
| `npm run gallery`        | CPU renders of the unsupported page's gallery into `src/ui/gallery/`                                            |
| `npm run build`          | Type check, production build in `dist/` and the structural checks of `dist/`                                    |
| `npm run preview`        | Serves the last build at http://localhost:4173                                                                  |
| `npm run size`           | Download sizes of the last build: raw, gzip and brotli                                                          |
| `npm run test:dist`      | Builds, then checks that the page requests nothing beyond its own files (served at `/photonring/`)              |
| `npm run test:e2e:build` | The page tests against a fresh build, where the Content-Security-Policy applies                                 |
| `npm run probe:webgpu`   | Prints the Chrome version and the WebGPU adapter the browser tests get                                          |

## Build and deploy

The Content-Security-Policy exists only in the built page (`tools/csp.ts`); the dev server has none, so check changes against the build with `npm run test:e2e:build` and `npm run test:dist`. Browser tests use the installed Google Chrome; `PHOTONRING_ADAPTER=swiftshader` runs them on Chrome's software WebGPU adapter; on Linux it also points Chrome at the SwiftShader Vulkan driver Chrome ships, without which a WebGPU canvas cannot be shown there (`tests/helpers/browser-env.ts`).

CI (`.github/workflows/ci.yml`) runs on every push to `main` and every pull request: the checks and the build on Ubuntu, the offline test and the smoke tests on the built page with SwiftShader on Ubuntu, and the GPU parity and page tests on a macOS runner's GPU.

Deploys are manual and only for a commit whose CI run is green: Actions > Deploy to GitHub Pages > Run workflow on `main` (or `gh workflow run pages.yml --ref main`). The workflow checks, builds and tests the page again, then publishes `dist/`. It needs Settings > Pages > Source set to GitHub Actions once.

## Documentation

- [docs/PHYSICS.md](docs/PHYSICS.md): derivations and references.
- [docs/DESIGN.md](docs/DESIGN.md): stack, integrator choice, browser support, targets, decisions per stage.
- [docs/VALIDATION.md](docs/VALIDATION.md): every check, its tolerance and the measured result.
- [docs/PERFORMANCE.md](docs/PERFORMANCE.md): measured frame times, with machine and browser.

This is a toy model for learning and demonstration, not a scientific simulation of any real observation.

## Licence

MIT. See [LICENSE](LICENSE).
