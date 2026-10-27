# photonring

A real-time, in-browser renderer of a non-rotating (Schwarzschild) black hole with a thin accretion disk, in which every physical claim is checked against analytic or independently computed values.

**Status: Stage 2 of 6.** The WebGPU renderer runs in the browser (black hole and star field, no disk yet), checked against the f64 physics library and the CPU reference renderer.

## Run

```bash
npm install
npm run dev
```

Then open http://localhost:5179 in a browser with WebGPU (Chrome or Edge 113+, Safari 26 on macOS Tahoe or iOS 26, Firefox 141+ on Windows or 147+ on Apple Silicon). Drag or use the arrow keys to orbit, scroll or press +/- to zoom, press D to toggle the disk and T for the termination view.

| Command                 | What it does                                                                           |
| ----------------------- | -------------------------------------------------------------------------------------- |
| `npm test`              | Physics, CPU renderer, golden and host-logic tests (Vitest)                            |
| `npm run test:gpu`      | GPU against CPU parity in headless Chrome (needs Google Chrome installed)              |
| `npm run test:e2e`      | Page behaviour in headless Chrome: controls, device loss, limits, unsupported browsers |
| `npm run bench:gpu`     | GPU frame times at four resolutions                                                    |
| `npm run render:cpu`    | CPU reference renders in `artifacts/stage1/` and the shadow-size table                 |
| `npm run spike`         | The Stage 0 integrator comparison                                                      |
| `npm run golden:update` | Re-renders golden images; writes only with `--accept <names>` or `--accept-all`        |

## Documentation

- [docs/PHYSICS.md](docs/PHYSICS.md): derivations and references.
- [docs/DESIGN.md](docs/DESIGN.md): stack, integrator choice, browser support, targets, decisions per stage.
- [docs/VALIDATION.md](docs/VALIDATION.md): every check, its tolerance and the measured result.
- [docs/PERFORMANCE.md](docs/PERFORMANCE.md): measured frame times, with machine and browser.

The disk is a toy model for learning and demonstration, not a scientific simulation of any real observation.

## Licence

MIT. See [LICENSE](LICENSE).
