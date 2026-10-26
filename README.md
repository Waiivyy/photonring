# photonring

A real-time, in-browser renderer of a non-rotating (Schwarzschild) black hole with a thin accretion disk, in which every physical claim is checked against analytic or independently computed values.

**Status: feasibility stage.** Nothing renders yet. What exists is the f64 physics reference library, its validation tests, and a measured comparison of integrators for the future WebGPU renderer.

## Run

```bash
npm install
npm test
npm run spike
```

`npm run spike` compares the integrator candidates in f64 and in an f32 emulation and writes `artifacts/spike/precision-spike.md`.

## Documentation

- [docs/PHYSICS.md](docs/PHYSICS.md): derivations and references.
- [docs/DESIGN.md](docs/DESIGN.md): stack, integrator choice, browser support, targets.
- [docs/VALIDATION.md](docs/VALIDATION.md): every check, its tolerance and the measured result.

## Licence

MIT. See [LICENSE](LICENSE).
