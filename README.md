# photonring

A real-time, in-browser renderer of a non-rotating (Schwarzschild) black hole with a thin accretion disk, in which every physical claim is checked against analytic or independently computed values.

**Status: early development (feasibility stage).** Nothing here renders yet. The physics reference library and its validation tests come first; the WebGPU renderer comes later.

## Plan

- `src/physics/`: pure TypeScript, 64-bit floats, no DOM or GPU. The reference for everything.
- CPU reference renderer (Node) for golden images and measured values.
- WebGPU compute renderer (WGSL, 32-bit floats) with a small UI.

## Run (once the scaffold lands)

```bash
npm install
npm test
```

## Licence

MIT. See [LICENSE](LICENSE).
