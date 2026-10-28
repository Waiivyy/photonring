# photonring

A real-time, in-browser renderer of a non-rotating (Schwarzschild) black hole with a thin accretion disk, in which every physical claim is checked against analytic or independently computed values.

**Status: Stage 4 of 6.** The WebGPU renderer shows the black hole, its thin accretion disk (blackbody colour with Doppler and gravitational shifts, higher-order images and the photon ring) and the lensed star field, with adaptive anti-aliasing and progressive refinement, all checked against the f64 physics library and the CPU reference renderer. The page adds overlays (shadow edge, and the lensed images of the circles at 2M, 3M and 6M in the disk plane), a Validation panel that measures the shadow live against its analytic size, shareable views in the URL, keyboard and touch controls, an About dialog and saving the image as PNG.

## Run

```bash
npm install
npm run dev
```

Then open http://localhost:5179 in a browser with WebGPU (Chrome or Edge 113+, Safari 26 on macOS Tahoe or iOS 26, Firefox 141+ on Windows or 147+ on Apple Silicon). Drag to orbit and scroll or pinch to zoom, or use the Controls panel. With the view focused (click it or Tab to it), the arrow keys orbit, +/- zoom, D toggles the disk, A anti-aliasing, T the termination view, E, H, P and I the overlays, V the Validation panel, S saves the image and ? lists every key.

| Command                 | What it does                                                                                                    |
| ----------------------- | --------------------------------------------------------------------------------------------------------------- |
| `npm test`              | Physics, CPU renderer, golden and host-logic tests (Vitest)                                                     |
| `npm run test:gpu`      | GPU against CPU parity in headless Chrome: rays, disk, images, anti-aliasing (needs Google Chrome installed)    |
| `npm run test:e2e`      | Page behaviour in headless Chrome: controls, URL state, overlays, Validation panel, saving, layout, device loss |
| `npm run bench:gpu`     | GPU time per stage by view, disk and resolution; shadow measurement and ring overlay costs                      |
| `npm run gallery:gpu`   | Check-in views: GPU renders in `artifacts/stage3/`, the page in `artifacts/stage4/`                             |
| `npm run render:cpu`    | CPU reference renders in `artifacts/stage1/` and the shadow-size table                                          |
| `npm run spike`         | The Stage 0 integrator comparison                                                                               |
| `npm run golden:update` | Re-renders golden images; writes only with `--accept <names>` or `--accept-all`                                 |

## Documentation

- [docs/PHYSICS.md](docs/PHYSICS.md): derivations and references.
- [docs/DESIGN.md](docs/DESIGN.md): stack, integrator choice, browser support, targets, decisions per stage.
- [docs/VALIDATION.md](docs/VALIDATION.md): every check, its tolerance and the measured result.
- [docs/PERFORMANCE.md](docs/PERFORMANCE.md): measured frame times, with machine and browser.

This is a toy model for learning and demonstration, not a scientific simulation of any real observation.

## Licence

MIT. See [LICENSE](LICENSE).
