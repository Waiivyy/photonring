# photonring

A real-time, in-browser renderer of a non-rotating (Schwarzschild) black hole with a thin accretion disk, in which every physical claim is checked against analytic or independently computed values.

**Status: Stage 1 of 6.** The f64 physics library and a CPU reference renderer exist and are validated; the WebGPU renderer comes next. Nothing runs in the browser yet.

## Run

```bash
npm install
npm test
npm run render:cpu
```

- `npm run render:cpu` writes reference renders to `artifacts/stage1/` and prints the measured shadow radius against the analytic value.
- `npm run spike` compares the integrator candidates in f64 and in an f32 emulation.
- `npm run golden:update` re-renders the golden images and reports differences; it overwrites goldens only with `--accept <names>` or `--accept-all`.

## Documentation

- [docs/PHYSICS.md](docs/PHYSICS.md): derivations and references.
- [docs/DESIGN.md](docs/DESIGN.md): stack, integrator choice, browser support, targets, decisions per stage.
- [docs/VALIDATION.md](docs/VALIDATION.md): every check, its tolerance and the measured result.

The disk is a toy model for learning and demonstration, not a scientific simulation of any real observation.

## Licence

MIT. See [LICENSE](LICENSE).
