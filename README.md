# photonring

A real-time, in-browser renderer of a non-rotating (Schwarzschild) black hole with a thin accretion disk, in which every physical claim is checked against analytic or independently computed values.

**Status: Stage 3 of 6.** The WebGPU renderer shows the black hole, its thin accretion disk (blackbody colour with Doppler and gravitational shifts, higher-order images and the photon ring) and the lensed star field, with adaptive anti-aliasing and progressive refinement, all checked against the f64 physics library and the CPU reference renderer.

## Run

```bash
npm install
npm run dev
```

Then open http://localhost:5179 in a browser with WebGPU (Chrome or Edge 113+, Safari 26 on macOS Tahoe or iOS 26, Firefox 141+ on Windows or 147+ on Apple Silicon). Drag or use the arrow keys to orbit, scroll or press +/- to zoom, press D to toggle the disk, A for anti-aliasing and T for the termination view.

| Command                 | What it does                                                                                                    |
| ----------------------- | --------------------------------------------------------------------------------------------------------------- |
| `npm test`              | Physics, CPU renderer, golden and host-logic tests (Vitest)                                                     |
| `npm run test:gpu`      | GPU against CPU parity in headless Chrome: rays, disk, images, anti-aliasing (needs Google Chrome installed)    |
| `npm run test:e2e`      | Page behaviour in headless Chrome: controls, previews and refinement, device loss, limits, unsupported browsers |
| `npm run bench:gpu`     | GPU time per stage (first pass, anti-aliasing, previews) by view, disk and resolution                           |
| `npm run gallery:gpu`   | GPU renders of the check-in views in `artifacts/stage3/`                                                        |
| `npm run render:cpu`    | CPU reference renders in `artifacts/stage1/` and the shadow-size table                                          |
| `npm run spike`         | The Stage 0 integrator comparison                                                                               |
| `npm run golden:update` | Re-renders golden images; writes only with `--accept <names>` or `--accept-all`                                 |

## Documentation

- [docs/PHYSICS.md](docs/PHYSICS.md): derivations and references.
- [docs/DESIGN.md](docs/DESIGN.md): stack, integrator choice, browser support, targets, decisions per stage.
- [docs/VALIDATION.md](docs/VALIDATION.md): every check, its tolerance and the measured result.
- [docs/PERFORMANCE.md](docs/PERFORMANCE.md): measured frame times, with machine and browser.

The disk is a toy model for learning and demonstration, not a scientific simulation of any real observation.

## Licence

MIT. See [LICENSE](LICENSE).
