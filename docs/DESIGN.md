# Design decisions

Status: Stage 8 (first release: link previews and disclosures; then the Page-Thorne disk; section
17). Every number below was measured unless it is labelled as an estimate. Machine for all
measurements: Apple M5 (10-core GPU), 24 GB, macOS 27.0, Node 25.6.1, except the CI runs in
sections 5 and 14, which name their runner. In section 3, and where section
6 says "emulated", the f32 results come from an emulation (`Math.fround` after every operation);
sections 6 and 11 have the measurements on the GPU.

| Decision             | Choice                                                                                                                                                                   | Section |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------- |
| Language and tooling | TypeScript 6.0 (strict), Vite, Vitest, Playwright, ESLint, Prettier                                                                                                      | 2       |
| GPU API              | Raw WebGPU with WGSL compute shaders, no rendering framework                                                                                                             | 2       |
| Integrator           | Planar Binet equation $u'' = 3Mu^2 - u$, classical RK4, fixed step $d\phi = 0.05$ (f32)                                                                                  | 3       |
| Final direction      | Rotation recurrence instead of WGSL `sin`/`cos`                                                                                                                          | 3       |
| Fallback             | No WebGL2 renderer in the MVP; explanation page plus pre-rendered gallery                                                                                                | 4       |
| Star field           | Three cubic lattices in direction space hashed with pcg3d; profiles truncated at half a cell, so lookups are seamless                                                    | 10      |
| Colour               | Planck spectrum against an analytic CIE 1931 fit (no CIE table in the repository; four sample values quoted in tests, with attribution), CSS Color 4 sRGB matrix         | 10      |
| CPU reference        | f64, $d\phi = 0.0125$, own PNG codec on `node:zlib`, goldens at 160x90 with a documented tolerance                                                                       | 10      |
| CI                   | Ubuntu: checks, build and the built page in Google Chrome with SwiftShader WebGPU; macOS arm64: GPU parity and the full page suite on the runner's GPU                   | 5, 14   |
| Build                | Vite, every file but `index.html` and `favicon.svg` content-hashed, type check and structural checks of `dist/` in every build                                           | 14      |
| CSP                  | Meta tag in the built page only: `default-src 'none'`, `'self'` for scripts, styles and images, Trusted Types required                                                   | 14      |
| Hosting              | GitHub Pages through a workflow started by hand, actions pinned to commit SHAs                                                                                           | 14      |
| Measured values      | Recorded by the physics, camera, overlay and contrast unit tests (not every check) and printed by `npm run measure`                                                      | 15      |
| README image         | CPU reference render at 1600 x 900 (`npm run render:hero`); social preview `public/social-preview.png` at 1280 x 640, same view; Open Graph and X card tags (section 17) | 15, 17  |

## 1. Positioning: what already exists

A survey in October 2026 found that validated, real-time, in-browser black hole renderers already
exist, so this project cannot claim to be the first. It was re-checked on 2026-11-08: for each
project the creation and last push dates and the licence GitHub detects (GitHub API,
`repos/{owner}/{repo}`, and the licence file where the API says NOASSERTION or none), its workflow
files (`repos/{owner}/{repo}/actions/workflows`, and the files themselves where CI might run
browser tests), and its README. The claims are each project's own, from its README, paper or
documentation; none of their tests were run here. GitHub's repository search timed out, so new projects were found by web
search, and the list may be incomplete. "Last push" is GitHub's push date, which can be later than
the last commit on the default branch (LensForge's last commit on `main` is dated 2026-07-19).

| Project                                                                                                                             | Created to last push (UTC); licence                                                                                                           | Renders                                                                                                                    | Technology                                                                                             | What it validates (as its README, paper or documentation states)                                                                                                                                                                                                                   | GPU output checked in CI?                                                                          |
| ----------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| [Dashrath175/LensForge](https://github.com/Dashrath175/LensForge)                                                                   | 2026-07-19 to 2026-10-21; MIT (its licence file adds notes on bundled NASA and star catalogue data, so GitHub reports NOASSERTION)            | Kerr, Page-Thorne disk, redshift                                                                                           | WebGPU compute, TypeScript f64 oracle                                                                  | GPU against f64: escape direction within 0.99 arcmin (High tier), disk $\Delta g/g \le 1.03\times10^{-4}$; shadow within 0.50 px of Bardeen's contour                                                                                                                              | No: CI runs 70 CPU oracle tests; the GPU checks run by hand in the browser through console hooks   |
| [kyleyhw/black_hole](https://github.com/kyleyhw/black_hole)                                                                         | 2026-07-12 to 2026-10-07; no licence                                                                                                          | Kerr, disk, free-fall camera, merger mode                                                                                  | WebGL2 fragment shader (real time), WebGPU compute for a progressive still; Python f64 mirror          | A 12-check validation suite and 20 checks of the f64 mirror, $b_c$ to $5\times10^{-7}$; in the browser, the shadow at 18 M within 0.006 % of the finite-distance formula; Playwright tests in headless Chromium with SwiftShader, including a GLSL against WGSL pixel parity check | No: its only workflow builds and deploys; the Playwright suite runs locally                        |
| [YIHnb/schwarzschild-ray-tracer](https://github.com/YIHnb/schwarzschild-ray-tracer)                                                 | 2026-10-12, no push since; MIT                                                                                                                | Schwarzschild, disk                                                                                                        | WebGL2, RK4 on $u(\phi)$; Python reference                                                             | Deflection against quadrature (about $10^{-8}$) and finite-distance shadow, for the Python reference only                                                                                                                                                                          | No workflows                                                                                       |
| [ebruneton/black_hole_shader](https://github.com/ebruneton/black_hole_shader), [arXiv:2010.08735](https://arxiv.org/abs/2010.08735) | 2020-03-12 to 2020-11-11; BSD-3-Clause                                                                                                        | Schwarzschild, disk, Doppler                                                                                               | WebGL2 with precomputed tables                                                                         | C++ tests of the GLSL against numerical integration, "within $10^{-3}$ of reference values"                                                                                                                                                                                        | No workflows                                                                                       |
| [oseiskar/black-hole](https://github.com/oseiskar/black-hole)                                                                       | 2015-12-06 to 2019-06-15; MIT for its own files (`COPYRIGHT.md`), a bundled Milky Way image under CC BY-NC 2.0, so GitHub reports NOASSERTION | Schwarzschild, disk, Doppler                                                                                               | WebGL, $u(\phi)$ integration                                                                           | No published numbers; README notes low step counts bend rays too much                                                                                                                                                                                                              | No workflows                                                                                       |
| [rantonels/starless](https://github.com/rantonels/starless)                                                                         | 2015-03-05 to 2024-06-01; GPL-3.0                                                                                                             | Schwarzschild, disk                                                                                                        | Python CPU ray tracer                                                                                  | None quantitative                                                                                                                                                                                                                                                                  | No workflows                                                                                       |
| [tgergo1/blackhole](https://github.com/tgergo1/blackhole) (new)                                                                     | 2026-11-03, created and last pushed; no licence                                                                                               | Kerr, Novikov-Thorne disk                                                                                                  | WebGL2 shader; f64 reference                                                                           | GPU ray data (hit type, radius, redshift, escape direction) against the f64 reference pixel by pixel in five scenes: classification 100 % identical, median radius error about $10^{-5}$, redshift about $10^{-6}$                                                                 | Yes: `npm run test:gpu` in headless Chromium on an Ubuntu runner (WebGL2, not WebGPU)              |
| [quantdale/browser-blackhole](https://github.com/quantdale/browser-blackhole) (new)                                                 | 2026-08-21 to 2026-11-08; MIT                                                                                                                 | Schwarzschild and Kerr (black-hole presets), several other scenes                                                          | Three.js WebGPU with a WebGL2 fallback; binary64 CPU oracle; a precomputed trajectory table by default | Numerical parity and visual goldens in Playwright                                                                                                                                                                                                                                  | Partly: hosted CI runs a browser smoke test in WebGL2; the parity and golden suite is a local gate |
| [CuplexUser/KerrSimulation](https://github.com/CuplexUser/KerrSimulation) (new)                                                     | 2026-07-29 to 2026-09-22; MIT                                                                                                                 | Kerr, disk                                                                                                                 | WebGPU compute; f64 reference                                                                          | The shipped WGSL against f64 values computed in the browser on demand (`/?validate=1`)                                                                                                                                                                                             | No: its README says the WGSL cannot be checked headless                                            |
| [reversesingularity/black-hole-explorer-web-app](https://github.com/reversesingularity/black-hole-explorer-web-app) (new)           | 2026-07-12, last push the same day; MIT                                                                                                       | Schwarzschild, Novikov-Thorne profile                                                                                      | Three.js TSL compiled to WGSL; CPU mirror                                                              | 54 Vitest tests of the CPU code                                                                                                                                                                                                                                                    | No                                                                                                 |
| [master666-max/gargantua-kn-neo](https://github.com/master666-max/gargantua-kn-neo) (new)                                           | 2026-09-18 to 2026-09-21; MIT licence file (its Chinese README's licence sentence is vaguer)                                                  | Kerr-Newman, polarisation                                                                                                  | WebGL2; f64 CPU twin                                                                                   | 108 checks on the CPU twin; run-to-run comparisons of GPU renders; per-pixel comparisons of the GPU polarisation angle against the CPU twin (9 to 10 of 14 cases pass), run by hand                                                                                                | No workflows                                                                                       |
| [ShuoleiWang/blackhole](https://github.com/ShuoleiWang/blackhole) (new)                                                             | 2026-07-13 to 2026-10-05; MIT                                                                                                                 | A binary black hole scene (an approximate superposed Kerr-Schild metric); a Schwarzschild scene with a Novikov-Thorne disk | WebGPU, with a weak-field WebGL2 fallback; CPU oracle; reference maps made offline in Python           | Fixed-camera Schwarzschild and Kerr reference maps, generated offline and checked by separate verifier scripts, kept as calibration and regression oracles; Node tests                                                                                                             | No workflows: the repository has no `.github` folder (GitHub API, 2026-11-08)                      |
| [dgreenheck/webgpu-black-hole](https://github.com/dgreenheck/webgpu-black-hole) (new)                                               | 2026-01-06 to 2026-01-07; MIT                                                                                                                 | Schwarzschild, disk                                                                                                        | Three.js TSL on WebGPU, ray marching                                                                   | None published                                                                                                                                                                                                                                                                     | No                                                                                                 |

Research codes (GYOTO, ipole, RAPTOR, Odyssey, GRay, kgeo, AART) validate carefully but do not run
in a browser. Shadertoy shaders could not be inspected (the site blocks automated access); none is
known to validate anything. No code from any project above is used; kyleyhw/black_hole and
tgergo1/blackhole have no licence, so nothing may be copied from them.

Whether the October list of what could set this project apart still holds:

| Stated in October 2026                                                                                  | On 2026-11-08                                                                                                                                                                                                                       |
| ------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Validation against the actual WebGPU output, headless, in CI                                            | Holds for WebGPU: no surveyed project checks WebGPU output in CI. It no longer holds for GPU output in general: tgergo1/blackhole has checked its WebGL2 shader against a 64-bit reference, pixel by pixel, in CI since 2026-11-03. |
| Image-level comparison of the GPU render against the CPU reference renderer, with documented tolerances | Still uncommon: tgergo1 compares per-pixel ray data, not final images; quantdale keeps visual goldens, checked locally; gargantua-kn-neo compares its GPU polarisation angle with its CPU twin pixel by pixel, by hand.             |
| Two independent reference methods for the deflection that agree to about $10^{-15}$                     | Not found in the READMEs read. Not every project's documentation was read in full, so this is "not found", not "unique".                                                                                                            |
| A narrow, finished, documented Schwarzschild scope                                                      | No longer a difference: quantdale, reversesingularity, YIHnb and dgreenheck render Schwarzschild too. Dropped.                                                                                                                      |

What sets this project apart now:

1. The WebGPU output itself is compared with a 64-bit CPU reference, ray by ray and image by
   image, in CI: the GPU parity tests run in the macOS job on the runner's paravirtual Apple GPU
   (section 5). The built page also runs in CI in Chrome with SwiftShader (the offline test and the
   smoke tests, which do not compare with the CPU reference).
2. Final images are compared with a CPU reference renderer, not only ray data, with documented
   tolerances, plus measured error budgets per pixel (section 3 has the f32 one).
3. Two independent reference methods for the deflection (quadrature and elliptic integrals) agree
   to about $10^{-15}$ near $b_c$ ($1.05\times10^{-15}$ relative at the test's values up to
   $1.1\thinspace b_c$, `npm run measure`).
4. The measured errors are published with the machine and browser behind them, and the integrator
   was chosen by measurement, with the comparison published (section 3).

## 2. Stack

**TypeScript (strict) for everything.** One language for the physics library, the CPU reference
renderer, the tests and the UI. JavaScript numbers are IEEE binary64, so the f64 reference is as
precise as one in C or Rust. TypeScript is pinned to 6.0.x: TypeScript 7.0 (the native compiler)
is out, but typescript-eslint 8.72 declares `typescript >=4.8.4 <6.1.0`. Revisit when
typescript-eslint supports 7. A second config (`tsconfig.physics.json`) compiles `src/physics`
with no DOM and no Node types, so the library cannot accidentally depend on either.

**Vite, Vitest, Playwright, ESLint, Prettier.** Vite 8 gives a dev server and a production build
with hashed assets; Vitest 5 shares its configuration; Playwright drives the installed Google
Chrome for page tests and GPU parity tests (section 11). No objections to the proposal. Dev
dependency tree on 2026-11-02: 135 packages besides the root (`npm ls --all --parseable`), 117 MB
in `node_modules` (`du -sh`; the lockfile is unchanged since 2026-10-26); no runtime dependencies
(`package.json` has none). Node scripts in `tools/` run with Node's built-in TypeScript type
stripping (Node 22.18 or later), so no `tsx` dependency.

**Raw WebGPU rather than three.js.** The renderer needs one compute pipeline, a storage texture, a
blit pass, timestamp queries, device-loss handling and explicit limit checks: a few hundred lines
of host code. three.js (0.186.1, 20.4 MB unpacked) would hide exactly the parts this project
exists to show (WGSL, dispatch tiling, buffer layouts) behind its node-material system, which
generates the WGSL; that also makes shader-level GPU-versus-CPU parity tests harder.

**TypeScript rather than Rust compiled to WebAssembly.** A Rust route (wgpu) would share one
language between host and CPU reference and give fast f64 code, but it adds cargo, wasm-bindgen
and a Wasm bundle, still needs JavaScript for the UI, and is harder for web reviewers to read. The
shaders are WGSL either way. CPU speed is not a bottleneck: the whole precision spike (about
150,000 rays across 24 configurations, plus their reference integrals) runs in 10 s in Node.

**UI: plain DOM and CSS.** A handful of controls, overlays and a panel do not justify a framework.

**PNG output for goldens:** a minimal encoder on `node:zlib` (deflate plus CRC-32, about 60
lines), decided in Stage 1 (section 10): byte-exact, deterministic output with no dependency.

## 3. Integrator decision

Three candidates were implemented in `src/physics/integrators.ts`, each running in f64 and in an
f32 emulation, and compared by `npm run spike` (full tables in
`artifacts/spike/precision-spike.md` after running it):

- **A. Binet RK4**: $u'' = 3Mu^2 - u$ in the ray's own plane, fixed step in $\phi$. Escape found
  exactly at $u = 0$ by Hermite interpolation; exact capture criterion $u > 1/(3M)$, $u' > 0$.
- **B. Cartesian RK4**: $\mathbf{x}'' = -3Mh^2\mathbf{x}/r^5$, step length $\eta r$, escape when
  $r > \max(1000M, 10 r_o)$ moving outward.
- **C. Cartesian leapfrog** (kick-drift-kick, preserves $h$ exactly): same equation and step rule.

### Over all view directions (the quantity a pixel shows)

3000 directions per observer, f32 emulation. Error is the escape-direction error; 1 px is
$9.70\times10^{-4}$ rad (1080 rows, 60 degree vertical field of view). Rays with
$|b/b_c - 1| < 10^{-3}$ are excluded here and examined below. "Ops" counts rounded f32 operations
per ray including setup, a rough proxy for GPU arithmetic.

| Method             | Step               | Max error, $r_o$ = 5 / 30 / 200 M (px) | Mean / max steps at 30 M | Ops per ray at 30 M | Misclassified | Step-limit hits |
| ------------------ | ------------------ | -------------------------------------- | ------------------------ | ------------------- | ------------- | --------------- |
| Binet RK4          | $d\phi$ = 0.1      | 0.108 / 0.026 / 0.005                  | 17 / 78                  | 814                 | 0             | 0               |
| **Binet RK4**      | **$d\phi$ = 0.05** | **0.052 / 0.044 / 0.002**              | **33 / 155**             | **1426**            | **0**         | **0**           |
| Binet RK4          | $d\phi$ = 0.025    | 0.039 / 0.022 / 0.005                  | 65 / 309                 | 2651                | 0             | 0               |
| Cartesian RK4      | $\eta$ = 0.1       | 0.199 / 0.171 / 0.060                  | 48 / 136                 | 5379                | 0             | 0               |
| Cartesian RK4      | $\eta$ = 0.05      | 0.260 / 0.041 / 0.027                  | 94 / 269                 | 10507               | 0             | 0               |
| Cartesian leapfrog | $\eta$ = 0.005     | 3.20 / 0.785 / 0.076                   | 925 / 2675               | 44451               | 0             | 0               |
| Cartesian leapfrog | $\eta$ = 0.0025    | 1.24 / 0.232 / 0.222                   | 1849 / 5347              | 88774               | 0             | 0               |

In f32, Binet reaches its rounding floor (about 0.02 to 0.05 px) at $d\phi = 0.05$; smaller steps
cost more without helping. Cartesian RK4 needs 4 to 7 times the arithmetic for 3 to 4 times the
error, and its inner loop needs a square root and a division per force evaluation. Leapfrog is
second order and far behind.

### Robustness to GPU arithmetic

WGSL only guarantees correct rounding for $+, -, \times$ (see `docs/PHYSICS.md`, section 11).
Perturbing every f32 result by a random amount up to about 2 ULP (worst of five random seeds;
a single draw varied by up to a factor of 3):

| Method        | Step | Max error, rounded to nearest (px), 5 / 30 / 200 M | Max error, perturbed (px) | Misclassified |
| ------------- | ---- | -------------------------------------------------- | ------------------------- | ------------- |
| Binet RK4     | 0.05 | 0.052 / 0.044 / 0.002                              | 0.285 / 0.263 / 0.042     | 0             |
| Cartesian RK4 | 0.1  | 0.199 / 0.171 / 0.060                              | 1.384 / 0.465 / 0.086     | 0             |

**Measured on the GPU in Stage 2** (section 11): over 6196 escaped rays the largest escape
direction error is 0.058 px, so the real GPU sits at the round-to-nearest level. The perturbation
model above was pessimistic, as expected: it also perturbs $+, -, \times$, which WGSL rounds
correctly, and the Binet inner loop uses nothing else; its worst case (0.285 px) would have
slightly exceeded the 0.25 px target of section 6.

### Deflection against the reference integrals

Observer at $10^4 M$ (close to the from-infinity case), relative error of the escape angle
divided by $\alpha(b)$:

| Method             | Step   | Precision | Max over $b$ = 1.02 to 100 $b_c$ | At 1.001 $b_c$     | At 1000 $b_c$      |
| ------------------ | ------ | --------- | -------------------------------- | ------------------ | ------------------ |
| Binet RK4          | 0.0125 | f64       | $8.0\times10^{-8}$               | $7.8\times10^{-9}$ | $6.9\times10^{-7}$ |
| Binet RK4          | 0.05   | f64       | $2.1\times10^{-5}$               | $2.1\times10^{-6}$ | $1.8\times10^{-4}$ |
| Binet RK4          | 0.05   | f32       | $2.8\times10^{-6}$               | $5.4\times10^{-6}$ | $3.7\times10^{-4}$ |
| Cartesian RK4      | 0.025  | f64       | $6.6\times10^{-8}$               | $4.7\times10^{-7}$ | $1.2\times10^{-6}$ |
| Cartesian RK4      | 0.05   | f32       | $1.4\times10^{-5}$               | $2.8\times10^{-4}$ | $2.9\times10^{-4}$ |
| Cartesian leapfrog | 0.0025 | f64       | $9.9\times10^{-6}$               | $1.3\times10^{-4}$ | $5.0\times10^{-7}$ |

Read the relative numbers with care at large $b$, where $\alpha$ is tiny. At $d\phi = 0.05$ the
f64 Binet error there is the RK4 phase error, about $\pi\thinspace d\phi^4/120 \approx 1.6\times10^{-7}$ rad
regardless of $b$; in f32 the rounding of the final angle (about $2\times10^{-7}$ rad near $\pi$)
happened to partly cancel it at those sample points, which is why the f32 row looks better than
the f64 row there. Near $b_c$ f32 is the worse of the two, as expected (at $1.02\thinspace b_c$:
$1.4\times10^{-6}$ against $1.6\times10^{-7}$).

### Near $b_c$

Escape-direction error in pixels at $r_o = 30M$, f32, Binet $d\phi = 0.05$:

| $b/b_c - 1$ | $10^{-1}$ | $10^{-2}$ | $10^{-3}$ | $10^{-4}$ | $10^{-5}$ | $10^{-6}$ |
| ----------- | --------- | --------- | --------- | --------- | --------- | --------- |
| Error (px)  | 0.003     | 0.024     | 0.239     | 0.181     | 15.0      | 90.5      |

All methods show the same growth, roughly as $1/(b - b_c)$, because the exact escape angle itself
diverges like $-\ln(b - b_c)$ and the photon sphere amplifies rounding errors by $e^{\phi}$ (see
`docs/PHYSICS.md`, section 2). This is a property of the problem, not of the integrator. It matters
little in the image: the band $b/b_c - 1 < 10^{-4}$, where errors exceed about 1 px, is
$\delta\psi = \sqrt{1-2M/r_o} \delta b/(r_o\cos\psi_{sh})$ wide, which is 0.14 px at $5M$,
0.018 px at $30M$ and 0.003 px at $200M$, on the escaping side of the shadow edge only. Inside
that band the true image is itself a thin stack of higher-order images of the whole sky, and
supersampling averages it.

Numerical $b_c$ by bisection on capture versus escape at $r_o = 30M$: Binet f32 within
$2.4\times10^{-7}$ relative (about the f32 resolution of the inputs), f64 within
$6.7\times10^{-12}$ at $d\phi = 0.0125$.

### Failure modes found

- **Leapfrog** needs 20 to 50 times the steps of the RK4 methods for a worse result; $h$ is
  preserved exactly but the energy integral only approximately, and the phase error accumulates
  near the photon sphere.
- **Cartesian methods need an escape radius.** Stopping at $R$ leaves the remaining bending out of
  the escape direction; with $R = \max(1000M, 10r_o)$ this stays below the integrator error, but it
  is one more knob, and positions near $10^4 M$ hold only about $10^{-3}M$ of absolute precision in
  f32.
- **Fixed-step Binet near capture:** for nearly radial inward rays $|u'| \approx 1/b$ is large and
  one step can jump far past $u = 1/(3M)$. Classification is still correct because the capture
  criterion is exact; nothing else is computed for those rays.
- **Radial rays** ($\sin\psi = 0$) have no ray plane and $u' = \infty$; they are handled
  analytically as straight lines (below $|\sin\psi| = 10^{-7}$).
- **Built-in `sin`/`cos`:** WGSL allows $2^{-11}$ rad of absolute error, about 0.5 px and ten
  times the integrator error. The shader instead builds the direction
  $(\cos\phi_\infty, \sin\phi_\infty)$ by rotating a unit vector by the precomputed
  $(\cos d\phi, \sin d\phi)$ each step (f32 emulation: $2.2\times10^{-6}$ rad, 0.002 px, after 250
  steps), plus a short Taylor series for the final partial step (section 11).

### Decision

Planar Binet RK4 with $d\phi = 0.05$ for the GPU renderer (step cap 1000, which is 50 rad of
orbit, four times the longest ray observed and well beyond the about 20 rad of winding that f32
inputs can resolve) and $d\phi = 0.0125$ for the f64 CPU reference renderer. Cartesian RK4 stays
in the library as an independent cross-check in tests; leapfrog stays only as recorded evidence
for this decision.

Side benefits of the planar form: disk crossings happen at angles known before integration (exact
detection, no missed or double-counted crossings), the escape direction needs no escape radius,
and because the background map depends only on the view angle $\psi$ for a fixed observer, the
Stage 3 lookup-table experiment is a one-dimensional table.

**Performance estimate (not measured):** at $r_o = 30M$ the mean ray costs about 1400 f32
operations, about $3\times10^9$ per frame at 1920x1080 before supersampling. Neighbouring pixels
should take similar step counts except near the photon ring, but SIMD groups run as long as their
slowest ray (up to 155 to 251 steps against a mean of 33), so real cost depends on divergence and
memory traffic. Stage 2 measures it with timestamp queries. Measured in Stage 3: 5.31 ms of GPU
time for the 1920 x 1080 first pass with the disk (`docs/PERFORMANCE.md`; commit 8783558, with the
Newtonian disk of Stages 1 to 7, not re-run after the Page-Thorne disk of Stage 8).

## 4. Browser support and fallback

WebGPU status on 2026-11-02, re-checked for Stage 6 against MDN browser-compat-data (BCD), the
gpuweb implementation-status wiki, the Chrome, Mozilla, WebKit and Microsoft release notes and
blogs, WebKit's source and the Mozilla and WebKit bug trackers (sources below). This is the
vendors' status, not testing: the page has only run in Google Chrome (section 15).

| Browser                    | Status                                                                                                                                                                      |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Chrome, Windows and macOS  | On by default since 113                                                                                                                                                     |
| Chrome, ChromeOS           | On by default since 113 (devices with Vulkan)                                                                                                                               |
| Edge, Windows and macOS    | On by default since 113 (Edge has no ChromeOS version; Linux is not stated by Microsoft)                                                                                    |
| Chrome, Linux              | Since 144 for Intel Gen12+, since 147 for NVIDIA under Wayland (gpuweb wiki); other GPUs behind flags                                                                       |
| Chrome, Android            | Since 121 on Android 12+ with Qualcomm or ARM GPUs (Intel too, per the gpuweb wiki), since 139 on Android 16+ with Imagination; not yet with Samsung Xclipse and other GPUs |
| Safari                     | Safari 26 or later, on macOS Tahoe 26, iOS 26, iPadOS 26 and visionOS 26 or later; not on Sequoia or Sonoma                                                                 |
| Firefox, Windows           | Since 141                                                                                                                                                                   |
| Firefox, macOS             | Apple silicon only: since 145 on macOS Tahoe, since 147 on older macOS; not on Intel Macs                                                                                   |
| Firefox, Linux and Android | Not shipped (Nightly or flags only)                                                                                                                                         |

Against the Stage 0 survey (October 2026), the re-check corrected four things: Edge does not run
on ChromeOS (Microsoft: Edge does not support Chromebooks; BCD's Edge data mirrors Chrome's);
Firefox shipped on macOS Tahoe on Apple silicon in 145, two versions before older macOS; visionOS
was missing; and Android with Imagination GPUs was not listed. The Safari row stands: Safari 26
also installs on Sequoia and Sonoma, but a WebKit WebGPU engineer wrote in WebKit bug 299237 that
`navigator.gpu` requires macOS Tahoe, iOS 26, visionOS 26 or later, and WebKit's
`PlatformEnable.h` turns WebGPU on by default on macOS only from macOS 26. The NVIDIA clause is
not in BCD, which lists only Intel Gen12+ on Linux; its sources are the gpuweb wiki ("NVIDIA
(driver 535.183.01+) Wayland: 147") and Chrome's post for 147 and 148, which names modern NVIDIA
drivers on Wayland without saying which of the two versions. Also from these sources: Chrome
calls its Linux launch in 144 a careful rollout, so a given Chrome 144 or later on Intel Gen12+
may not have WebGPU yet; on Windows on ARM64 Chrome's WebGPU is behind a flag per the gpuweb wiki;
and WebKit turns WebGPU off in Lockdown Mode.

Sources, all fetched on 2026-11-02:

- MDN browser-compat-data,
  [`api/GPU.json`](https://github.com/mdn/browser-compat-data/blob/main/api/GPU.json) and
  `api/GPUSupportedFeatures.json`.
- gpuweb,
  [Implementation Status](https://github.com/gpuweb/gpuweb/wiki/Implementation-Status) (wiki
  revision of 2026-10-02).
- Chrome for Developers: ["Chrome ships WebGPU"](https://developer.chrome.com/blog/webgpu-release)
  (113) and "What's New in WebGPU" for
  [120](https://developer.chrome.com/blog/new-in-webgpu-120),
  [121](https://developer.chrome.com/blog/new-in-webgpu-121),
  [144](https://developer.chrome.com/blog/new-in-webgpu-144) and
  [147 and 148](https://developer.chrome.com/blog/new-in-webgpu-147-148).
- Microsoft Learn,
  ["Microsoft Edge Supported Operating Systems"](https://learn.microsoft.com/en-us/deployedge/microsoft-edge-supported-operating-systems).
- WebKit:
  ["WebKit Features in Safari 26.0"](https://webkit.org/blog/17333/webkit-features-in-safari-26-0/),
  [bug 299237](https://bugs.webkit.org/show_bug.cgi?id=299237), and
  [`Source/WTF/wtf/PlatformEnable.h`](https://github.com/WebKit/WebKit/blob/main/Source/WTF/wtf/PlatformEnable.h)
  with `UnifiedWebPreferences.yaml` and `Source/WebGPU/WebGPU/HardwareCapabilities.mm`.
- Mozilla: the Firefox
  [141](https://www.firefox.com/en-US/firefox/141.0/releasenotes/),
  [145](https://www.firefox.com/en-US/firefox/145.0/releasenotes/) and
  [147](https://www.firefox.com/en-US/firefox/147.0/releasenotes/) release notes (148 to 159 add
  no platform), Bugzilla 1992212 and 1993341 (fixed in 145 and 147), and the open bugs
  [2004105](https://bugzilla.mozilla.org/show_bug.cgi?id=2004105) (Intel Macs) and
  [2006676](https://bugzilla.mozilla.org/show_bug.cgi?id=2006676) (Linux); `dom/webgpu/Adapter.cpp`
  at the 141, 145, 147 and 159 release tags.

`timestamp-query` is optional in WebGPU, so frame timing must work without it (the page then uses
its wall-clock path). Chrome has offered it since 121, quantised by default, but not on every
adapter (the macOS CI runner's paravirtual GPU has none, section 5). BCD lists it in Safari 26
(WebKit offers it only when the Metal GPU can sample timestamps, never on Intel GPUs) and not in
Firefox, although Firefox's source has exposed it since 141 when wgpu reports it. This page was
first run in Safari at the owner's check of the live site on 2026-11-09 (section 17) and has not
been run in Firefox. (Chrome's announcement for 120 gives a resolution of 100
microseconds, which Stage 0 had from secondary sources; in Chrome 156 on the Apple M5 every
measured value is a multiple of 65.536 microseconds, that is $2^{16}$ ns, Stage 3.)

**Fallback: no WebGL2 renderer in the MVP** (stretch goal, as proposed). Desktop Chrome and Edge,
Safari 26, and Firefox on Windows and Apple silicon ship WebGPU (table above); no visitor
statistics were consulted. A WebGL2 port would be a second renderer, not a second shader: no
compute shaders, a fragment-shader architecture, GLSL instead of WGSL, and its own parity tests.
Unsupported browsers get a clear explanation, a short list of supported browsers, and a gallery of
pre-rendered images. The list (`src/ui/unsupported.ts`) follows the table above since b310128,
with the Android row shortened to Qualcomm and ARM GPUs; until then the page showed the Stage 0
list, which named Edge on ChromeOS.

## 5. CI and GPU testing

Built in Stage 5 (`.github/workflows/ci.yml`; decisions in section 14). Every job uses the
runner's preinstalled Google Chrome through Playwright's `channel: 'chrome'`, not Playwright's
own Chromium, so nothing is downloaded. The Stage 0 evidence below was for Chromium; what the
runners actually do was measured in the first CI runs on 2026-10-28 with
`npm run probe:webgpu`, which reports the adapter, checks a compute dispatch, and presents 60
frames to a canvas and compares a screenshot with the clear colour.

- **macOS: the GPU parity tests run on the runner's GPU.** On `macos-15` (arm64, image
  20260907.0337.1), Chrome 152.0.7977.83 headless exposes the paravirtual Apple GPU with no flags:
  vendor `apple`, architecture empty, no `timestamp-query` (so the page uses its wall-clock timing
  path there), `maxTextureDimension2D` 16384. Compute and presentation pass. The 13 parity tests and
  all 109 page tests against the build passed in all 13 of the first 17 runs on 2026-10-28 in which
  the job started, and the GPU shadow measurement (validation mode at six distances) came out byte
  for byte equal to the M5's in each of them. In the other 4 runs GitHub assigned no macOS runner
  within 15 to 25 minutes and cancelled the job ("not acquired by Runner of type hosted even after
  multiple attempts", with a notice that macOS arm64 runners have capacity constraints).
- **Ubuntu: the built page runs on SwiftShader, once Chrome has a Vulkan driver.** On
  `ubuntu-24.04`, Chrome (155.0.8059.39 on image 20261012.334.1 and 156.0.8078.47 on image
  20261025.353.1, both seen on 2026-10-28) offers SwiftShader with
  `--enable-unsafe-webgpu --use-webgpu-adapter=swiftshader`, and compute works, but presenting a
  WebGPU canvas fails: the device is lost with reason `destroyed` ("Device was destroyed.") within
  the first frames, and the screenshot is white. In the first run every page test that renders
  failed this way while the tests without WebGPU passed. The cause, read in the Chromium and Dawn
  sources and matched by a public CI log of another project on the same Chrome build: with no Vulkan
  driver, the GPU process cannot create the shared image a WebGPU canvas is composited from and
  drops the page's GPU channel, and that teardown destroys every device on it, which is the only
  path besides `device.destroy()` that a page can observe with this reason and message. Chrome ships
  a SwiftShader Vulkan driver next to its binary; with
  `VK_DRIVER_FILES=/opt/google/chrome/vk_swiftshader_icd.json`, `--enable-features=Vulkan,WebGPU`
  and `--use-angle=swiftshader` (`tests/helpers/browser-env.ts`, Linux only), all 60 frames
  presented with the right colour on both Chrome versions, and the offline test and the 14 smoke
  tests passed. The full page suite, run once by hand (31 min 37 s), passed 108 of 109. The other
  test asks for a save right after a zoom; on this runner the new image took 4.3 to 4.5 s of GPU
  time for the first pass and 4.8 to 5.1 s for anti-aliasing (two attempts), 9.2 to 9.6 s of GPU
  time alone, and was not complete within the 10 s the page waits before it gives up a save with
  "Could not save: the image did not finish within 10 seconds" (the wall-clock time was not
  measured; the message was reproduced on the M5 with SwiftShader at 3840 x 2160). The probe also
  runs its checks without any of the Linux settings, and with the two flags but without the driver:
  both lost the device within 3 frames (Chrome 156), so the driver is the part that is needed;
  whether the flags are needed next to it was not tested. Every run prints these lines, so a run
  shows when the settings stop being needed. GitHub's Ubuntu runners also vary in speed: of eight
  runs started within seven minutes, six took 5.4 to 6.3 min for the 14 smoke tests instead of 2.8
  to 2.9 min, and there the Validation panel in the offline test was not done within the 20 s the
  tests then waited for SwiftShader; the wait is now 60 s, and the page job passed in both runs
  since. On macOS, SwiftShader presents without any of this (Chrome 156 on the M5).
- **Stage 0 evidence, for the record** (third-party CI runs, Playwright's Chromium): on
  `ubuntu-latest` Chromium exposed SwiftShader with `--enable-unsafe-webgpu` and one project
  reported that it "dies partway through a run"; on macOS arm64 runners the new headless mode
  exposed an "Apple Paravirtual device" Metal adapter.

In 4 of the first 17 runs on 2026-10-28 GitHub assigned no macOS runner and cancelled the job
(above). Such a run is not green: re-run the cancelled job before relying on it, for example
before a deploy. The job stays automatic; if cancellations become frequent, or the job fails for
reasons that do not reproduce locally (no adapter, device loss, a runner image change), it can
become manual (`workflow_dispatch`), with `npm run test:gpu` on the local machine as the source
of truth. macOS arm64 runners are free for this public repository (section 9).

## 6. Targets: proposed, tested and measured

"Proposed" is the Stage 0 proposal as recorded. Its evidence was the precision spike of section 3
(for example 0 of 9000 rays misclassified per configuration and a longest ray of 251 steps). The
Stage 0 check-in (section 9) recorded no decision on these targets; it decided open question 2,
the camera distance (section 9, item 2). "Tolerance in the tests" is what the tests assert at
Stage 6, and "Measured" is the worst value they found: Node-side test values from
`npm run measure` at 8c374bd, the CPU shadow from `npm run render:cpu`, and GPU test values from
`npm run test:gpu` re-run at 0123428 and at afd9fd5 on the M5 (headless Chrome 156.0.8078.48 and
156.0.8078.74; the 13 tests that existed before Stage 6 gave the same values as their earlier
runs). The frame-rate row is not a test: it is the Stage 3 benchmark. Details are in
`docs/VALIDATION.md` and `docs/PERFORMANCE.md`.

| Quantity                                                                                             | Brief's guess                   | Proposed                                   | Tolerance in the tests                                                                                                                                                                                                                    | Measured                                                                                                                                                                                                                                                                                                                                                                     |
| ---------------------------------------------------------------------------------------------------- | ------------------------------- | ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Deflection, f64 library, $b$ = 1.02 to 100 $b_c$                                                     | $< 10^{-6}$ relative            | Keep $< 10^{-6}$                           | $10^{-6}$ relative for each integrator at its fine step ($d\phi = 0.005$ for Binet), $b$ = 1.01 to 1000 $b_c$ (`integrators.test.ts`)                                                                                                     | Binet RK4 $1.8\times10^{-8}$ (Cartesian RK4 $1.4\times10^{-10}$, leapfrog $7.3\times10^{-7}$); Binet at the CPU renderer's $d\phi = 0.0125$: $8.0\times10^{-8}$ over 1.02 to 100 $b_c$ (Stage 0 spike, section 3)                                                                                                                                                            |
| Deflection, f32 path, same range                                                                     | $< 10^{-3}$ relative            | $< 10^{-4}$ relative                       | f32 emulation at the renderer steps: $10^{-3}$ relative, $b$ = 1.01 to 1000 $b_c$ (`integrators.test.ts`); GPU: $10^{-4}$ relative, $b$ = 1.02 to 100 $b_c$ (`parity.spec.ts`)                                                            | Emulated Binet $3.7\times10^{-4}$ over 1.01 to 1000 $b_c$ (section 3's table has $3.7\times10^{-4}$ at 1000 $b_c$, where $\alpha$ is small, and $2.8\times10^{-6}$ over 1.02 to 100 $b_c$); Cartesian RK4 $2.9\times10^{-4}$, leapfrog $7.8\times10^{-4}$; GPU $2.8\times10^{-5}$                                                                                            |
| Escape direction, f32, all directions outside $\lvert b/b_c - 1\rvert < 10^{-3}$, $r_o$ = 5 to 200 M | (new)                           | $\le 0.25$ px at 1080 rows, 60 degree FOV  | GPU: 0.25 px ($2.4\times10^{-4}$ rad) against the f64 library, 6912 pixel-centre rays at 5, 30 and 200 M (`parity.spec.ts`)                                                                                                               | GPU 0.058 px ($5.6\times10^{-5}$ rad) over the 6196 that escape outside the band                                                                                                                                                                                                                                                                                             |
| Capture or escape classification outside that band                                                   | (new)                           | Zero errors; f32 $b_c$ within $10^{-6}$    | Zero errors (f64 outside $\lvert b/b_c - 1\rvert < 10^{-6}$, f32 emulation outside $10^{-3}$, at 5, 30 and 200 M; GPU over the 6912 rays); $b_c$ by bisection within $10^{-6}$ (f64) and $10^{-4}$ (f32 emulation), all three integrators | 0 errors; $b_c$: Binet $4.1\times10^{-12}$ (f64) and $2.4\times10^{-7}$ (emulated f32), worst in emulated f32 leapfrog $6.1\times10^{-6}$. The f32 bisection test has used $10^{-4}$ since it was written (2de4b1f), not the proposed $10^{-6}$                                                                                                                              |
| Step-limit hits                                                                                      | "investigate"                   | Zero, with a cap of 1000 steps             | Zero in the integrator, CPU render, GPU parity, robustness and validation tests                                                                                                                                                           | 0 everywhere, including 3296 GPU results at the hole, on the polar axis and at both distance limits (section 15)                                                                                                                                                                                                                                                             |
| Shadow radius                                                                                        | 1 px or 0.5 %, whichever larger | Keep until Stage 1 measures the CPU render | 1 px or 0.5 %, whichever is larger, on the CPU render and on the GPU validation render                                                                                                                                                    | CPU at most 0.11 px; GPU 0.006 to 0.027 px at 5 to 200 M                                                                                                                                                                                                                                                                                                                     |
| Frame rate                                                                                           | 30 fps at 1920x1080 with disk   | Keep as target; measure in Stage 2 and 3   | None: benchmarked (`npm run bench:gpu`), not asserted                                                                                                                                                                                     | GPU time 5.31 ms for the 1920 x 1080 first pass with the disk and 12.78 ms for the anti-aliased image (headless Chrome 156.0.8078.48, timestamp queries; `npm run bench:gpu` on 2026-10-27, on the code of commit 8783558 as inferred in `docs/PERFORMANCE.md`, with the Newtonian disk; not re-run with the Page-Thorne disk of Stage 8); presented frame rate not measured |
| Camera distance                                                                                      | 5 to 200 M, default 30 M        | See open question 2                        | Links clamp the distance to 5 to 200 M (`url-state.test.ts`); the shadow, parity and robustness tests run at both ends                                                                                                                    | The shadow, parity and robustness checks pass at both ends                                                                                                                                                                                                                                                                                                                   |

## 7. Formulas from the brief: verified or corrected

Derivations and references are in `docs/PHYSICS.md`.

| Brief                                                                                | Result                                                                                                                                                                                                                                                                                               |
| ------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Horizon 2M, photon sphere 3M, ISCO 6M, $b_c = 3\sqrt3 M$                             | Verified (derivation; Bardeen, Press and Teukolsky 1972; tests)                                                                                                                                                                                                                                      |
| $(du/d\phi)^2 = 1/b^2 - u^2(1-2Mu)$, $u'' + u = 3Mu^2$                               | Verified                                                                                                                                                                                                                                                                                             |
| $\mathbf{x}'' = -3Mh^2\mathbf{x}/r^5$, $h$ conserved                                 | Verified. $\lambda$ is affine (scaled by $h/L$). Clarification: $\lvert\mathbf{x}'\rvert^2 = h^2(1/b^2 + 2M/r^3)$ is not constant, and the initial velocity must shrink the radial component of the view direction by $\sqrt{1-2M/r_o}$; a unit vector along the pixel direction gives the wrong $b$ |
| $\alpha(b) = 2\int_0^{u_0} du/\sqrt{1/b^2 - u^2 + 2Mu^3} - \pi$                      | Verified (two independent methods agree to $1.05\times10^{-15}$ relative at the test's values up to $1.1\thinspace b_c$, `npm run measure`)                                                                                                                                                          |
| Weak field $\alpha \approx 4M/b$                                                     | Verified, with the next five coefficients (Keeton and Petters 2005)                                                                                                                                                                                                                                  |
| Strong field, Bozza 2002                                                             | Verified: $\bar a = 1$, $\bar b = \ln[216(7-4\sqrt3)] - \pi \approx -0.4002$                                                                                                                                                                                                                         |
| $\sin\psi_{sh} = (3\sqrt3 M/r_o)\sqrt{1-2M/r_o}$                                     | Verified (Perlick and Tsupko 2022, Synge 1966); the angle is $\pi - \arcsin$ inside $3M$                                                                                                                                                                                                             |
| $\Omega = \sqrt{M/r^3}$, $u^t = (1-3M/r)^{-1/2}$                                     | Verified                                                                                                                                                                                                                                                                                             |
| $g = 1/(u^t(1 - \Omega L/E))$, observer at infinity                                  | Verified (Luminet 1979, Cunningham 1975). **Correction for this renderer:** the camera is a static observer at $r_o$, so $g_{obs} = g/\sqrt{1-2M/r_o}$ (1.035 at 30M, 1.29 at 5M)                                                                                                                    |
| Face-on $g = \sqrt{1-3M/r}$; static emitter $\sqrt{1-2M/r}$; intensity $\propto g^4$ | Verified                                                                                                                                                                                                                                                                                             |
| $T \propto r^{-3/4}(1-\sqrt{r_{in}/r})^{1/4}$                                        | Verified as the Newtonian Shakura-Sunyaev profile (not Page-Thorne); peak at $(49/36)r_{in}$. Replaced in Stage 8 by the Page-Thorne flux, hottest at $9.55M$ in the gas's own frame (`docs/PHYSICS.md`, section 10; section 17)                                                                     |
| $T_{obs} = g\thinspace T_{emit}$                                                     | Verified ($I_\nu/\nu^3$ invariance)                                                                                                                                                                                                                                                                  |

Also found: the starless write-up prints $u'' + u = \tfrac32 u^3$ and a force along
$\hat r/r^5$, both typos (its code is correct); this project cites the code, not the page.

## 8. Credits

- The Cartesian form $\mathbf{x}'' = -\tfrac32 h^2\mathbf{x}/r^5$ (units $2M = 1$) as a
  singularity-free way to trace Schwarzschild rays is taken from rantonels' starless
  (`tracer.py`). No code was copied.
- Integrating the orbit equation $u(\phi)$ per ray is also what oseiskar/black-hole and
  YIHnb/schwarzschild-ray-tracer do; the exact capture criterion, Hermite escape interpolation and
  rotation-recurrence direction here are this project's own choices.
- The star field hashes lattice cells with pcg3d from Jarzynski and Olano (2020), "Hash
  Functions for GPU Rendering", implemented here from the paper's description.
- Blackbody colours use the CIE 1931 colour-matching fit of Wyman, Sloan and Shirley (2013) and
  the sRGB matrix and transfer function from the W3C CSS Color 4 sample code (constants only).
- Precomputed tables in a real-time black hole shader (Bruneton 2020, section 1) were not
  adopted: the Stage 3 lookup-table experiment was not run (section 12).
- The overlay colours are the Okabe-Ito palette: M. Okabe and K. Ito (2002, modified 2008),
  "Color Universal Design (CUD): how to make figures and presentations that are friendly to
  colorblind people", https://jfly.uni-koeln.de/color/, Fig. 16 (`src/ui/overlay-style.ts`).

## 9. Decisions at the Stage 0 check-in (2026-10-26)

1. **Positioning.** Schwarzschild only. The project differentiates on validating the WebGPU output
   itself (GPU against CPU parity in CI, image-level comparison with the CPU reference) rather
   than on features.
2. **Camera distance.** The minimum stays at $5M$. Near the hole the vertical field of view widens
   automatically so the shadow radius never exceeds 60 % of the half-height, capped at $120°$
   (`autoFieldOfView` in `src/physics/camera.ts`). At $30M$ the user's field of view is unchanged;
   at $5M$ the shadow (radius $53.6°$) fills 78 % of the half-height at the cap. With the default
   $60°$ the widening starts below about $14.8M$.
3. **Star field blueshift.** Applied. Starlight reaching the static observer is blueshifted by
   $g = 1/\sqrt{1-2M/r_o}$: every sky source is a blackbody whose temperature is multiplied by
   $g$, so colour and brightness change consistently with the disk.
4. **CI.** GPU parity tests run in a macOS job. GitHub lists `macos-latest`, `macos-14`,
   `macos-15` and `macos-26` (arm64, 3-core M1, 7 GB) as standard runners for public
   repositories, and Actions usage on standard runners is free for public repositories
   (GitHub docs, "GitHub-hosted runners" and "GitHub Actions billing", read 2026-10-26).

## 10. Stage 1 decisions

- **3D tracing** reduces every ray to the planar Binet integrator (`traceRay`). It agrees with an
  independent 3D Cartesian RK4 integration to $5\times10^{-10}$ rad on 60 random rays from 5 to
  200 M, and that Cartesian path stays in its initial plane to $4\times10^{-15}$.
- **Disk crossings** use the analytically known angles $\phi_0 + k\pi$ (`docs/PHYSICS.md`,
  section 7). Crossing radii match the exact radius at the same angle within $2.8\times10^{-8}$
  (relative) at $d\phi = 0.0125$ and $7.2\times10^{-6}$ at $d\phi = 0.05$.
- **Star field.** A cube map would need `atan` for an equal-area warp, and WGSL allows large
  errors in it; lattice cells in direction space need only `floor`, integer hashing and chord
  distances. Truncating each star's profile at half a cell makes the 27-cell lookup seamless
  even where the CPU and the GPU floor to different cells. No nebula band: optional in the brief
  and not implemented.
- **Colour.** The CIE 1931 tables are CC BY-SA 4.0, so instead of committing them the code uses
  the Wyman-Sloan-Shirley analytic fit; the tests quote four sample values of the dataset, with
  its DOI and licence (`tests/unit/colour.test.ts`). The fit is within 0.0093 of those sample
  values (tolerance 0.025). Its chromaticity differs from the CIE-derived Planckian locus by at
  most 0.00023 at 6500 K (0.00011 at 10000 K and 20000 K), 0.0012 at 3000 K and 0.0046 at
  1500 K, and from CIE illuminant A (2856 K) by 0.0013 (`npm run measure`; tolerance 0.002, and
  0.005 at 1500 K).
- **Disk defaults:** inner edge at the ISCO, outer edge at $20M$, 6500 K at the hottest radius
  in the gas's own frame, exposure 1, and opaque (opacity 1), which the user confirmed at the
  Stage 1 visual check-in after comparing it with a 0.6-opacity render. The 6500 K is a display
  choice; this record gives no physical reason for it, and since Stage 8 the README, About and
  `docs/PHYSICS.md` say so (section 17). The hottest radius was $(49/36)\thinspace r_{in} = 8.17M$ with
  the Newtonian profile of Stages 1 to 7; with the Page-Thorne flux of Stage 8 it is $9.55M$, and
  6500 K stays the temperature there (section 17).
- **CPU reference settings:** $d\phi = 0.0125$ (f64 deflection error $8\times10^{-8}$, section 3),
  step cap 4000. Rendering 320x180 with 3x3 samples (518,400 rays) takes 1.0 to 3.5 s per image
  on the Apple M5 in Node 25.6.1.
- **PNG** is written by a 60-line encoder on `node:zlib` (deflate and CRC-32) rather than a
  dependency. Goldens are compared on decoded pixels, not file bytes, so a different zlib build
  cannot break them.
- **Goldens** are 160x90 with 2x2 samples (8 to 13 KB each). `npm run golden:update` re-renders
  them, reports what changed and writes candidates to `artifacts/golden-candidates/`; it
  overwrites a golden only for names passed with `--accept`, or with `--accept-all`.

## 11. Stage 2 decisions

- **Browser tests use the installed Google Chrome** through Playwright (`channel: 'chrome'`,
  headless). On Apple Silicon its headless mode exposes the Metal GPU to WebGPU without flags
  (adapter "apple / metal-3", not the fallback adapter, with `timestamp-query`), so no browser
  binaries are downloaded. Note that WebGPU only exists in secure contexts: tests load pages from
  the Vite dev server on localhost.
- **One WGSL module for rendering and for the parity tests.** `renderTile` (the image) and the
  `traceRays` and `skySamples` entry points (the tests) call the same `traceGeodesic` and
  `skyRadiance`, so the tests check the shipped shader code rather than a copy. A generated header
  (`src/gpu/host/wgsl.ts`) supplies the uniform structs, built from the same field lists as the
  host-side byte layout, plus the star layers and colour-table parameters from TypeScript.
- **GPU integrator** as decided in Stage 0: $d\phi = 0.05$, step cap 1000. The radial threshold is
  $|\sin\psi| < 10^{-6}$ in f32 (the f64 library uses $10^{-7}$; in f32 an exactly radial
  direction leaves rounding noise near $10^{-7}$ in the tangential part).
- **Escape direction without WGSL sin/cos:** the shader rotates $(\cos, \sin)$ by the
  $(\cos d\phi, \sin d\phi)$ computed in f64 on the CPU at every step, and uses a Taylor series
  for the final partial step.
- **Blackbody colour** comes from a 2048-entry table, log-spaced from 300 K to $10^5$ K, built by
  the f64 library and uploaded as a 32 KB storage buffer. Error against the spectral integral:
  at most 0.19 % from 1000 to 2000 K and under 0.03 % above 2000 K (1024 entries left 0.79 %).
- **Output path:** the compute pass writes linear radiance to an `rgba16float` storage texture at
  the internal resolution; a render pass tone maps, applies the sRGB transfer function and writes
  to the canvas, whose backing store has the internal resolution, so nothing is resampled.
- **Limits:** the internal resolution is CSS size x device pixel ratio, reduced to fit
  `maxTextureDimension2D` and a 3840 x 2160 pixel budget, keeping the aspect ratio. Everything else
  fits the default limits by a wide margin (frame uniforms 160 bytes, colour table 32 KB, at most
  32 x 32 workgroups per tile), so the device is requested with default limits. Later stages
  added fields: the frame uniforms were 176 bytes at a526c7d (computed from the field list in
  Stage 8), and the rename of Stage 8 kept that size; Stage 8 adds a 4 KB disk table, a third read-only storage buffer in group 0 (five per
  compute stage in the parity pipelines, within the default limit of 8). `?maxdim=N` lowers
  the texture limit for testing; it can only reduce the size.
- **Tiling and time budget:** 256 x 256 tiles, centre first, each submitted separately with its own
  parameters. Each animation frame dispatches only as many tiles as its 12 ms budget allows, from
  the measured cost per pixel (timestamp queries when available, wall-clock otherwise). With the
  step cap, no single tile can run away.
- **Device loss** shows a message with the reason and a Restart button that creates a new adapter
  and device. `device.destroy()` from the debug hook exercises this path in the tests.
- **Unsupported browsers** get the reason, the supported browsers and versions (the section 4
  table, corrected on the page in b310128 after the Stage 6 re-check), and four 640 x 360 images
  from the CPU reference renderer (88 to 128 KB each, `npm run gallery`).
- **Measured** (`docs/VALIDATION.md` item 11, `docs/PERFORMANCE.md`): escape directions within
  0.058 px of the f64 reference over 6196 rays with no termination mismatches; deflection within
  $2.8\times10^{-5}$; a 1920 x 1080 frame without the disk in 6.2 ms of GPU time in headless
  Chrome 156.0.8078.47 (Stage 2; Stage 3 measured 6.36 ms for the same first pass,
  `docs/PERFORMANCE.md`).
- **Production build** already worked in Stage 2 (35 KB of JavaScript, 13 KB gzipped at the time,
  hashed assets, relative paths; current sizes in `docs/PERFORMANCE.md`); the CSP and deployment
  came in Stage 5.

## 12. Stage 3 decisions

- **Disk on the GPU.** Crossings are found from sign changes of the height above the disk plane
  at step boundaries, placed inside the step with a short `atan` series, and their radius comes
  from the step's Hermite cubic (`docs/PHYSICS.md`, section 7). This avoids WGSL's `atan2`, which
  the specification allows a large error, and needs no angle bookkeeping. The emission uses only
  square roots and divisions (section 10c there). Measured against the f64 library over 13,824
  camera rays in six views, including an observer exactly in the disk plane: crossing counts
  identical, radii up to $2r_{out}$ within $3.4\times10^{-5}$ relative, disk light within
  $3\times10^{-3}$. Farther crossings (up to $10^4M$) lose relative precision as $u = 1/r$
  approaches 0 near escape, at worst $3\times10^{-4}$; they never touch the disk, so the test
  logs them without asserting.
- **Early stop.** The image pass stops a ray at the first crossing that leaves no transmittance.
  With the default opaque disk, a 1920 x 1080 first pass takes 5.3 ms with the disk against
  6.4 ms without it.
- **A harness bug found by the disk tests:** the parity entry point took the observer's
  frequency factor $g_{obs}$ from the harness's fixed 30 M scene, while the rays started at 5 M
  (1.29 against 1.035, an 8 times brightness error at 2700 K). The harness now takes the observer
  distance from the rays, and one call must use one distance.
- **Anti-aliasing is adaptive.** A second pass supersamples a pixel 3 x 3 when its footprint
  can reach the critical band ($b_c$ to $1.02\thinspace b_c$: shadow edge, photon ring and higher-order
  images, which a one-sample image can miss) or when it differs visibly from a neighbour
  (0.05 in sRGB-encoded, tone-mapped luminance). The grid is the CPU renderer's, so refined
  pixels can be checked against the CPU 3 x 3 render; the tests also check that the band and every
  clear step are refined and flat areas are not. Results go to a second `rgba16float` image
  (alpha = samples) that the blit lays over the first pass, so the pass can run tile by tile.
  At 1920 x 1080 with the disk it refines 6 % of the pixels in the default view and 12 % at 5 M.
  In the default view the pass takes 7.5 ms, where uniform 3 x 3 supersampling takes 40.4 ms.
- **Workgroup compaction.** Refined pixels are sparse (stars, edges), so a pixel tracing its own
  8 extra samples kept almost every SIMD group busy for 8 rays. Each 8 x 8 workgroup now lists
  its refined pixels in workgroup memory and spreads their samples over its 64 threads:
  7.5 ms instead of 13.6 ms at 1920 x 1080, 14.4 ms instead of 25.2 ms at 5 M, with identical
  images. The pass still costs more per extra ray than the first pass, because refined rays are
  the long ones: they miss the opaque disk, graze the photon ring or end on stars.
- **Progressive refinement** (`src/gpu/host/progressive.ts`). On every change the page renders a
  complete frame that fits the 12 ms budget: at full resolution (one sample per pixel) when the
  measured cost allows it, otherwise a preview at 1/4 to 1/2 scale in steps of 1/8, upscaled
  bilinearly. After 120 ms without changes the full-resolution first pass runs tile by tile,
  then the anti-aliasing tiles. The canvas only receives complete images, so tiles from an
  older view never mix with newer ones; while the full pass is still running, the preview stays
  on screen. On the Apple M5 at 1920 x 1080 the full-resolution frame fits the budget, so
  previews only appear at larger sizes (half scale at 3840 x 2160).
- **Memory.** Two full-size `rgba16float` images and a half-size preview take 18 bytes per
  pixel, 149 MB at the 3840 x 2160 cap.
- **Controls:** D toggles the disk, A anti-aliasing and T the termination view (D was the
  termination view in Stage 2). Anti-aliasing is off in the termination view and in validation
  renders, which must show single samples.
- **Lookup-table experiment: not run.** The brief makes it optional and asks for it only if it
  could show a measured benefit. Direct integration leaves a wide margin in GPU time: the
  1920 x 1080 first pass with the disk takes 5.3 ms of GPU time against the 33 ms of a frame at 30
  frames per second, and the anti-aliased image needs 12.8 ms of GPU time (headless; the frame
  rate in a visible window was not measured). A table of
  $r(\psi; b)$ curves would add an interpolation error that needs its own validation, most of it
  near $b_c$, where the curves are steepest. It can still be run if wanted.
- **Measured** (`docs/VALIDATION.md` items 7 and 11, `docs/PERFORMANCE.md`): GPU images with the
  disk within 1 level of the CPU reference (6 levels in 3 of 43,200 channels at 5 M), anti-aliased
  images within 2 levels in all but at most 8 of 43,200 channels; GPU time for the anti-aliased
  1920 x 1080 frame with the disk 12.8 ms (5.3 ms first pass, 7.5 ms anti-aliasing).

## 13. Stage 4 decisions

- **What the horizon and photon sphere overlays show.** For a static observer outside $3M$, the
  view directions whose backward rays reach any sphere of radius $R \le 3M$ are exactly the cone
  inside the shadow edge (`docs/PHYSICS.md`, section 6a). A lensed outline of the horizon or of
  the photon sphere would therefore be the shadow-edge circle drawn again. The shadow-edge
  overlay says so in its legend, and the Horizon, Photon sphere and ISCO toggles draw where the
  circles $r = 2M$, $3M$ and $6M$ in the disk plane appear through the bent light: the direct
  image of each, plus the image of light that passed behind the hole for the ISCO (the inner
  edges of the disk's two images). Unlensed "flat-space" circles were rejected: Schwarzschild $r$
  is an areal radius, so such circles depend on a coordinate choice and nothing in the renderer
  could check them.
- **Overlays are vectors, not WGSL.** The brief's folder layout has `shaders/overlays`; the
  overlays are instead computed in the f64 library and drawn as an SVG layer over the canvas,
  whose viewBox is the canvas's CSS size. Line widths and dashes are then CSS px at every
  distance, resolution and pixel ratio, the lines stay sharp over previews, toggling them costs
  no GPU frame, and the same path data draws them into saved images. The shadow edge is closed
  form; ring curves come from `ringImageAngle`, one root solve per image direction, sampled
  adaptively (chord within 0.1 px at 2160 rows on screen, at most 2048 vertices, plus the
  directions where the curve folds back, which near edge-on views are narrower than the uniform
  sampling). The layer follows the camera of the image last presented, so lines never run ahead
  of the image. Ring curves are computed only after the presented view has been still for the
  renderer's settle time (120 ms), in slices of 8 ms per frame, and kept for the last 8 views;
  they do not depend on the azimuth, so orbiting around the axis keeps them.
- **The lookup table for ring curves was not needed.** The design set a trigger: build a table
  of image angle against sweep if the rings took more than 250 ms from the settle time to
  appear. With 4 ms slices they took 230 to 247 ms (median of 7, Apple M5, Chrome 156 headless,
  1920 x 1080, three ring overlays); with 8 ms slices 130 to 163 ms (`docs/PERFORMANCE.md`).
- **The Validation panel measures a separate render.** While the panel is open and the image is
  complete, two offscreen 1024 x 1024 renders of the presented camera run through the image
  pipeline: the brief's validation mode (disk off, uniform sky of exactly 1.0, no tone mapping,
  one ray per pixel centre) and the termination view of the same rays. They are never shown, so
  there is no white flash. A square render at the view's own field of view keeps the shadow off
  the border at every distance and in portrait windows, and gives results that do not depend on
  the device; the panel says that its pixel figures are pixels of that render. The black pixels
  give the radius $\sqrt{A/\pi}$; the termination render also counts step-limit pixels and every
  pixel whose class disagrees with the analytic edge, which catches errors that cancel in the
  area. Tolerance: 1 px of the render or 0.5 %, whichever is larger. A scheduler
  (`src/ui/validation-scheduler.ts`) measures once per presented camera, discards a result that
  arrives after the camera changed or the panel closed, and shows a stored result again when the
  view returns to it.
- **URL state** (`src/ui/url-state.ts`). Version 1, every key in a fixed order, for example
  `#v=1&r=30&az=0&el=12&disk=1&aa=1&view=colour&ov=none&val=0`. A hash is a complete view: missing
  keys take their defaults, so a link shows the same view in any tab. The app's camera is always
  rounded to the URL's precision (distance to 0.001 M, angles to 0.01 degrees), so the image, the
  HUD, the hash and the saved file name describe the same view and every reachable state
  round-trips exactly; drags, pinches and wheel bursts are applied to the state at the start of
  the gesture, so motion below that precision adds up. The parser never throws: at most 512
  characters (else the defaults), 32 pairs and 8 overlay names; keys must be lower-case ASCII
  letters, values at most 64 characters, numbers must match a plain decimal pattern and be finite;
  the first occurrence of a key wins; distances are clamped to 5 to 200 M, so no link can place
  the camera at or inside the horizon. Malformed values fall back to their default, and the page
  says once that the link was adjusted, without echoing it. The hash is written with
  `replaceState` and a fragment-only URL, 300 ms after the last change (no history entries, no
  dependence on the write succeeding); edits in the address bar apply the whole view at once.
  Not in the URL: the field of view (automatic), whether the Controls panel or About is open, and
  the diagnostic `?maxdim` and `?budget`. Stage 7 added the view values `eht` and `subrings` to
  `colour` and `termination`, still version 1: every older link stays valid, and a page from
  before Stage 7 shows a link with a new value in the colour view and says the link was adjusted.
- **Keyboard and touch.** Single-key shortcuts work only while the view has focus (WCAG 2.1.4);
  every action is also a native button or checkbox, including orbit and zoom (Camera buttons in
  the Controls panel, a single-pointer alternative to dragging and pinching). Keys with Ctrl, Cmd
  or Alt are always left to the browser, toggles ignore auto-repeat, and Escape closes the most
  recently opened panel first. One key map (`src/ui/keymap.ts`) drives the handler, the canvas's
  `aria-keyshortcuts`, the key hints and the About table. Panels are bottom sheets, one at a time,
  up to 760 CSS px wide; above that, two 22rem panels fit side by side below the toolbar and end
  above the readouts. Focus rings pair the accent with a dark ring so they read on any image; the
  view's ring is an element drawn above the canvas, because a canvas's own outline shadow is
  painted under its WebGPU content.
- **Photosensitivity.** The two toggles that change the brightness of the whole image (disk and
  view: since Stage 7 any of the four views, and the EHT preset, which changes camera, view and
  disk as one change) share one limiter, whether they come from keys, checkboxes or the URL: a
  change from rest applies at once, and later ones are coalesced so that consecutive changes are
  at least 500 ms apart, at most 3 in any one second and 2 flashes per second, below the 3 of
  WCAG 2.3.1. The controls and the URL show what was asked for; the image, the stats and the saved
  file show what is drawn.
- **No motion of its own.** There is no automatic camera motion and no CSS animation or
  transition anywhere, so `prefers-reduced-motion` needs no separate code path.
- **About** (`src/ui/about.ts`): a native modal dialog with the brief's honesty note first, what
  the image shows and its limits, what each line means, the units, the controls, a privacy
  statement (no analytics, cookies or storage, nothing loaded from other sites, the view kept in
  the part of the address after #) and links to these documents on GitHub. It states no measured
  values; since Stage 8 it names the display settings a visitor cannot see (section 17).
- **Saving the image.** The settled full-quality image at the internal resolution, with the
  visible overlays and a small legend (also in the termination view), encoded by the browser as
  PNG and offered as a download; nothing leaves the device. A save waits until the image is
  complete, no brightness change is pending and the visible rings are drawn (at most 10 s), and
  the file is named after the view it shows, for example `photonring-r30-az0-el12.png`.
- **Teardown.** Every listener, timer and animation frame of the page belongs to one lifecycle
  (`src/ui/lifecycle.ts`) that the Restart after device loss releases at once; the hash is
  written before the restart, and focus moves to the new view.
- **Screen readers.** The canvas is an image whose accessible name summarises the drawn view once
  it is complete; announcements go to one polite live region. NVDA and JAWS in browse mode may not
  pass arrow keys to the canvas; the Camera buttons are the documented path. No screen reader
  has been tested by hand: the VoiceOver and Safari touch checks requested at the Stage 4
  check-in were not reported. Touch is tested only in Chrome's mobile emulation
  (`tests/e2e/touch.spec.ts`, 390 x 844 CSS px).

## 14. Stage 5 decisions

- **Hashed assets.** Everything in `dist/` except `index.html` and `favicon.svg` carries a
  content hash. Vite names the JS and the CSS; the four gallery images moved from `public/` to
  `src/ui/gallery/` and are imported by `src/ui/unsupported.ts`, so the build hashes them too, and
  a misspelt name fails the build (the `new URL(...)` form only warns). The favicon stays in
  `public/` under its own name: Chrome fetches it by itself, and Chrome 156 asks for it again
  after every change of the hash (measured), and GitHub Pages sends `cache-control: max-age=600`
  for every file (measured on other github.io sites), so a hash would buy no caching. What hashing
  does buy here: names change exactly when content changes, and `dist/` follows one rule that the
  build checks. `PUBLIC_FILES` in `tools/dist-rules.ts` lists what may sit in `public/`: `favicon.svg`, and since c13ec2a `social-preview.png`, which link previews fetch by a fixed name (section 15).
- **No modulepreload polyfill** (`build.modulePreload: { polyfill: false }`). The build is one
  chunk with no modulepreload links, so the polyfill had nothing to do, and every browser with
  WebGPU supports modulepreload natively (browser-compat-data: Chrome 66, Firefox 115, Safari 17,
  each before its WebGPU release). It held the bundle's only `fetch(`.
- **The build type-checks and checks itself.** `npm run build` is
  `tsc -p tsconfig.web.json && vite build && node tools/check-dist.ts`, because Vite does not
  type-check. On the M5 the type check takes 0.7 s and the dist check 0.08 s. The dist rules
  (`tools/dist-rules.ts`, each with a fixture in `tests/unit/dist-rules.test.ts` that asserts the
  rule's own message) are structural:
  - layout: the root holds exactly `index.html`, the `PUBLIC_FILES` and `assets/`; no source
    maps; no hidden files, which `upload-pages-artifact` would leave out; `public/` holds exactly
    `PUBLIC_FILES`;
  - every file in `assets/` has a content hash and is named by `index.html` or by another built
    JS or CSS file. The hash pattern alone accepts `disk-inclined.png` ("inclined" has 8
    characters); the `public/` rule is what catches such a file;
  - `index.html`: every `src` and `href` relative, present in `dist/` and hashed unless it is a
    public file; no inline script, `<style>`, style or event handler attribute, `javascript:`
    URL, resource hint or `<base>`;
  - the CSP meta: exactly one, in head, preceded only by `<meta charset>`, its content equal to
    `CSP_POLICY` once HTML entities are decoded, none of the directives a meta cannot enforce;
    the charset element within the first 1024 bytes;
  - in every built text file, absolute URLs only from an exact allowlist (the SVG namespace and
    the two repository links in `src/ui/links.ts`, and in `index.html` only, the two link preview
    URLs of `tools/site.ts`), no `data:` URI in media-type form (a bare `data:` also matches
    minified properties such as `{data:r}`), and in CSS no `@import` and `url()` only to files in
    `dist/`;
  - since Stage 8, the link preview tags: `og:url`, `og:image` and `twitter:image` exactly once
    each in `index.html`, with exactly the absolute URLs of `tools/site.ts` (section 17).

  Token scans for network APIs (`fetch(`, `sendBeacon` and so on) were considered and dropped: a
  UI string could trip them and block every build, and the policy below blocks such calls at run
  time anyway.

- **The Content-Security-Policy** (`tools/csp.ts`, the single source):

  ```
  default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self'; worker-src 'none'; base-uri 'none'; form-action 'none'; require-trusted-types-for 'script'; trusted-types 'none'
  ```

  Measured in headless Chrome 156 against the build: without `script-src 'self'` nothing
  renders; without `style-src 'self'` the stylesheet is blocked; without `img-src 'self'` the
  gallery images and the favicon are blocked (img-src also governs Chrome's own favicon fetch).
  `worker-src` must be explicit because it falls back to `child-src`, then `script-src` (CSP
  Level 3, section 6.8.3), which would allow same-origin workers (measured); `base-uri` and
  `form-action` do not fall back to `default-src` at all. Everything else (connect, font,
  object, manifest, frame, media) falls back to `default-src 'none'`, so the page cannot fetch,
  beacon or open a socket. Left out: `blob:`, `data:` and every `'unsafe-*'` source, which
  nothing needs (no inline code, `assetsInlineLimit: 0`, WGSL arrives as strings and
  `createShaderModule` is not governed by CSP); `upgrade-insecure-requests`, since an HTTPS page
  with relative URLs has nothing to upgrade. Saving the image still works: `<a download>` with a
  `blob:` URL is not blocked.

- **Only in the built page.** The plugin runs at build time and puts the meta right after
  `<meta charset>`. In the dev server the policy would block Vite's WebSocket and the inline
  style of its error overlay, and a nonce needs a new value per response, which a static site
  cannot give. Consequence: tests on the dev server never see the policy. The page tests also run
  against the build (`npm run test:e2e:build`, and in CI), where every CSP or Trusted Types
  violation is a console error that fails the test.
- **What a policy in a meta tag cannot enforce**, and what that means here:

  | Limit                                                                                                                              | Consequence                                                                                                                                                                                                                                            |
  | ---------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
  | `frame-ancestors` is ignored (CSP Level 3, section 6.4.2; measured: a page on another origin framed the build and its scripts ran) | Any site can frame the page. There are no accounts, forms or sensitive actions; the worst case is a tricked click on Save image, which downloads a file locally. Accepted. Pages' own response headers for this site are unknown until it is deployed. |
  | `sandbox` is ignored (CSP Level 3, section 6.3.2)                                                                                  | Not needed.                                                                                                                                                                                                                                            |
  | `report-uri` is ignored; `report-to` has no endpoint without a response header; Report-Only cannot be sent in a meta               | Production reports nothing, which also keeps the page free of requests. Violations are found only by the tests on the build.                                                                                                                           |
  | The policy does not cover what comes before the meta, a meta outside head is ignored, and edits after parsing have no effect       | The dist rules require exactly one CSP meta in head, after nothing but `<meta charset>`. Measured in Chrome 156: a meta placed after the assets let them load despite `'none'`.                                                                        |
  | One static policy for every response                                                                                               | No inline script or style anywhere, enforced by the dist rules.                                                                                                                                                                                        |
  | `'self'` is the origin `https://waiivyy.github.io`, which every Pages project site of the account shares                           | Scripts from the account's other Pages sites would also be allowed; only the owner can publish there. A path-restricted source would tie the build to its deploy URL and break the local preview checks.                                               |

  The three ignored directives are left out rather than written for documentation: Chrome logs
  a console error for each, which would fail every test on the build.

- **Trusted Types: adopted** (`require-trusted-types-for 'script'; trusted-types 'none'`), with
  no code changes. Nothing in the page writes to a Trusted Types sink (`el()` and `svgEl()` set no
  event handler attributes; `img.src` and `a.href` are not sinks). In Chrome 156 against the
  build, string `innerHTML`, `script.textContent`, `new Worker(...)` and `eval` all threw, and
  creating a policy was refused. Browser support for the meta form is from MDN browser-compat-data
  (Chrome 83, Firefox 148, Safari 26) and wpt.fyi, not from runs of this page; Firefox 141 to 147
  ignore the directives. Any future `innerHTML` with a string will throw, and the tests catch
  only the paths they exercise.
- **The offline test (item 15)**, `tests/dist/offline.spec.ts`, run with `npm run test:dist`, serves
  a fresh build at `/photonring/`, like the Pages project site. Chrome runs with
  `--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE localhost`, so a regression still shows as a
  failed request and nothing leaves the machine. A `securitypolicyviolation` listener is the
  independent signal: a blocked `fetch` or `sendBeacon` raises no request event at all. The test
  compares sets of paths, never counts, because Chrome asks for the favicon again after each hash
  change; the favicon is allowed but never required, since whether headless Chrome fetches it
  varies. A control test makes forbidden requests on purpose: ones the policy blocks, which the
  violation listener must report, and two it allows, a same-origin file missing from `dist/` and a
  navigation to another origin, which the request recorder must report, the navigation as a failed
  lookup, which shows that the resolver rule is in effect.
- **Browser test switches.** `PHOTONRING_SERVER` picks the dev server (default, port 5179, with
  the GPU harness) or a fresh build served by `vite preview` (port 4173, page tests only, without
  the one test tagged `@dev-server`, which needs the dev server's fallback for a path starting
  with `//`). `PHOTONRING_ADAPTER` picks the machine's GPU (default) or SwiftShader
  (`--enable-unsafe-webgpu --use-webgpu-adapter=swiftshader`, on Linux with Chrome's Vulkan
  driver, below; with a 60 s expect timeout). The browser is always the installed Google Chrome
  (`channel: 'chrome'`), so nothing is downloaded. The offline test uses its own port, 4174.
  `@smoke` marks 14 page tests that cover loading, keyboard control, device loss, the unsupported
  page, the URL state with hostile input, About, the Validation panel and saving.
- **CI** (`.github/workflows/ci.yml`) runs on every push to `main`, on pull requests and by hand,
  in three jobs on pinned runner labels (`ubuntu-24.04`, `macos-15`; the `-latest` labels move):
  - `checks` (Ubuntu): typecheck, lint, format, the Vitest suites and `npm run build` with its
    dist rules. The golden tests pass there too, on x64 with Node 24;
  - `page` (Ubuntu, SwiftShader): the probe with `--require present`, the offline test and the
    `@smoke` page tests against the build; a manual run can choose the full page suite;
  - `gpu` (macOS arm64): the probe with `--require hardware,present`, the GPU parity tests on the
    dev server with `--fail-on-flaky-tests` (parity is deterministic, so a pass on retry still
    fails), and the full page suite against the build on the runner's GPU. The GPU shadow table is
    kept as an artifact for 7 days.

  Every third-party action is pinned to a full commit SHA with its release tag in a comment, the
  workflow token can only read the repository, checkouts do not keep the token on disk, and every
  job has a timeout (`tests/unit/workflows.test.ts` checks all of this). Node 24 (Maintenance
  LTS) with the npm cache. Every step after `npm ci` runs even when an earlier one fails, unless
  the install failed. Pull requests cancel their own superseded runs; every push to `main` gets a
  complete run. Page tests retry once in CI; the offline test never retries. Test results and
  traces are uploaded only when a job fails or is cancelled, as on a timeout.

- **SwiftShader on Linux needs Chrome's own Vulkan driver** (section 5): on Linux,
  `PHOTONRING_ADAPTER=swiftshader` also sets `VK_DRIVER_FILES` to the driver Chrome ships and turns
  on its Vulkan path and ANGLE on SwiftShader, and fails with a named error if the file is missing,
  since runner images update Chrome every week.
- **A lost device fails a test at once.** The page tests and the offline test stop waiting as soon
  as the page reports a lost device and fail with its message, instead of running into the 120 s
  timeout (the first CI run took 43 minutes that way; in run 40718856034, with the change, each
  failing test took 2.0 to 4.3 s). The restarted page installs a new debug hook and the disposed one
  removes its own, so the tests that restart after a deliberate loss wait for the new page.
- **The probe checks what a page needs.** `npm run probe:webgpu` requests the device as the app
  does, runs a compute dispatch (timed with a timestamp query where the adapter has one) and checks
  every value, then presents 60 frames to a canvas and compares a screenshot with the clear colour,
  recording any loss with its reason and frame. Both CI probe steps require this
  (`--require present`), so a runner that cannot show a WebGPU canvas fails in seconds with that
  reason; later steps still run. The probe steps also print Chrome's own log (`DEBUG=pw:browser`
  with `--enable-logging`).
- **Deploys are manual** (`.github/workflows/pages.yml`): `workflow_dispatch` is the only
  trigger, the workflow grants nothing by default, the build job can only read, and only the
  deploy job, which runs only for `main`, gets `pages: write` and `id-token: write`. The build job
  runs `npm run check` and the offline test, whose server builds the `dist/` that is uploaded, so
  what is published is exactly what was checked. It uses no npm cache. The GPU tests and the full
  page suite are not repeated there; the rule is to deploy only a commit whose CI run is green.
  The owner's one-time setup: Settings > Pages > Source: GitHub Actions; check that the
  `github-pages` environment allows only `main`.
- **Defaults taken without asking** (the owner can change them): Node 24 in CI and no
  `.node-version` file (local development runs Node 25.6.1); no Dependabot, so action pins are
  updated by hand in the format the workflow test enforces; no size budget; the check after a
  deploy is done by hand in a browser, so no automated run makes requests to github.io; the CSP
  source is `'self'`, not a path.
- **Not verified yet:**
  - the Pages workflow has never run: the owner starts it, after setting Settings > Pages >
    Source to GitHub Actions. So the Run workflow button, the `github-pages` environment's branch
    rule and the response headers Pages sends for this site are unconfirmed;
  - Safari and Firefox have not run against the policy and Trusted Types: a manual Safari check
    was requested at the Stage 5 check-in and no result has been reported, and Firefox is not
    installed on the development machine;
  - screen readers and real touch devices: the VoiceOver and Safari touch checks requested at the
    Stage 4 check-in were not reported;
  - what GitHub Pages serves compressed, and whether builds are byte-identical across machines.

## 15. Stage 6 decisions

- **Measured values come from the tests.** The Stage 6 design planned a separate tool,
  `npm run measure:physics`, to print the Node-side numbers at settings shared with the tests.
  Instead the unit tests pass values they check against tolerances through `measured()`
  (`tests/helpers/measured.ts`), which returns each unchanged and keeps the worst value per key,
  and `npm run measure` runs Vitest with `MEASURE=1` and prints, for each key, the worst value,
  whether that is the largest or the smallest, and the test file, but not the tolerance
  (`tools/measured-report.ts`). 0ff1b63 did this for the orbit, deflection, integrator, redshift
  and shadow tests (`analytic.test.ts`, `integrators.test.ts`), the camera test and the contrast
  test; 8c374bd added the ray-tracing, lensing, overlay-geometry, star-field, numerics
  (Gauss-Legendre and Carlson) and colour tests. Not every check is recorded: for example the
  disk-crossing radii and the plane deviation of the Cartesian path in `raytrace.test.ts` are
  not, and the GPU tests record nothing. Why: the printed numbers are the values the tests check,
  at the tests' own settings, so they cannot drift from the tests, and there is no second copy of
  the settings to keep in step. `docs/VALIDATION.md` is written by hand from that output, the GPU
  test logs (`npm run test:gpu`) and `npm run render:cpu`. Numbers in these documents that cite
  `npm run measure` come from its output at 8c374bd (Apple M5, macOS 27.0, Node 25.6.1), which
  repeats every value printed at 0ff1b63 unchanged.
- **The deflection rows span the brief's range.** The integrated deflection test (item 2) had
  rows at 1.02, 1.1, 2, 10 and 100 $b_c$; 7d7f9b1 added 1.01 and 1000 $b_c$, the ends of the
  range in brief item 2. No tolerance changed. Worst values over the range (`npm run measure`):
  in f64 at each integrator's fine step, Binet RK4 $1.8\times10^{-8}$, Cartesian RK4
  $1.4\times10^{-10}$ and leapfrog $7.3\times10^{-7}$ (tolerance $10^{-6}$); in the f32 emulation
  at the renderer steps, $3.7\times10^{-4}$, $2.9\times10^{-4}$ and $7.8\times10^{-4}$ (tolerance
  $10^{-3}$). The GPU deflection test still covers 1.02 to 100 $b_c$ (section 6).
- **A GPU test for robustness (brief item 10).** Item 10 was checked only in Node
  (`tests/unit/raytrace.test.ts`, and the f32 emulation in `tests/unit/integrators.test.ts`).
  `tests/gpu/robustness.spec.ts` (0123428) sends rays through the shipped WGSL: one aimed at the
  exact centre of the hole and one straight away from it; eight from 30 M on the polar axis,
  straight out, straight in, and tilted by $10^{-12}$, by the shader's radial threshold
  $10^{-6}$ and by $10^{-5}$; and 21 x 13 rays through the pixel corners of a 20 x 12 image, from
  edge to edge and through the exact centre, from cameras at 5 M and 200 M at elevations 20, 90
  and -90 degrees with the automatic field of view. Every set runs with and without the default
  disk. All 3296 results are finite and none reached the step limit; the ray at the hole is
  captured with no disk crossing, and on the polar axis the ray straight out escapes and the ray
  straight in is captured. The GPU suite now has 14 tests; the re-runs at 0123428 and afd9fd5 on
  the M5 (headless Chrome 156.0.8078.48 and 156.0.8078.74) passed all 14, and the 13 earlier tests
  logged the same values as before.
- **The README image is a CPU reference render.** `docs/images/hero.png` shows the page's opening
  view: 30 M, azimuth 0, elevation 12 degrees, a 60 degree field of view, the default disk, the
  star sky and tone mapping, at 1600 x 900 with 3 x 3 samples per pixel. `npm run render:hero`
  (`tools/render-hero.ts`, views in `tools/hero-views.ts`, afd9fd5) rendered it in 75.8 s (75.0 s
  for the identical image in the candidates run below) on one thread of the M5 in Node 25.6.1:
  377,204 bytes, with none of the 12,960,000 samples at the step limit or non-finite. Why the CPU
  renderer: its bytes are deterministic, it needs no GPU or browser, and it is the reference the
  page is tested against (at 160 x 90 the GPU images with
  the disk are within 1 level of it in five of six views, and at 5 M 3 of 43,200 channels differ
  by more than 2 levels, `docs/VALIDATION.md` item 11). The README caption says it is a CPU
  render. Each candidate view is an orbit the page can show, quantised like the page's own and
  rendered with the page's scene (`tests/unit/hero-views.test.ts`); this one opens on the page at
  `#v=1&r=30&az=0&el=12&disk=1&aa=1&view=colour&ov=none&val=0`. The script writes nothing and
  exits 1 if a sample is not finite or the file is over 600,000 bytes.
- **Four candidates; the owner kept the default view.** `npm run render:hero -- --candidates`
  renders four views at 1600 x 900 and at 1280 x 640 into the gitignored `artifacts/stage6/`,
  with a contact sheet, in 6 min 58 s for the whole command on the M5. At 1600 x 900: the default
  view above (377,204 bytes, 75.0 s), nearly edge-on at 30 M and elevation 2 degrees (446,638
  bytes, 64.0 s), close at 5 M and elevation 20 degrees with the automatic 120 degree field of
  view (568,429 bytes, 67.7 s), and wide at 60 M and elevation 8 degrees (402,160 bytes, 60.1 s).
  Every image has 0 step-limit and 0 non-finite samples. At the Stage 6 check-in (2026-11-04) the owner kept the default view for the README image and the social preview, so `HERO_VIEW` in `tools/hero-views.ts` stays `'default'`.
- **Social preview now, Open Graph tags after the deploy** (reversed in Stage 8: the tags came
  before the deploy, section 17). After the owner's pick,
  `npm run render:hero -- --social` wrote `public/social-preview.png` (c13ec2a): the default view
  at 1280 x 640, GitHub's recommended size for a repository's social preview, 248,032 bytes in
  41.6 s, byte for byte the candidate `01-social-default.png`. It is copied into `dist/` unhashed
  under that fixed name (it is in `PUBLIC_FILES`, with a fixture for its absence in
  `tests/unit/dist-rules.test.ts`), and the page never requests it: the offline test's request
  sets are unchanged. The owner can upload it under the repository's Settings > Social preview.
  The Open Graph tags that would point link previews at it wait: `og:image` needs an absolute URL,
  which for this site will not answer until the first deploy. For the same reason the README's
  line for the live page is a placeholder until the deploy, not a link.
- **CHANGELOG.** `CHANGELOG.md` follows Keep a Changelog 1.1.0 and Semantic Versioning 2.0.0,
  with one Unreleased section that has "Added" and one "Fixed" entry. There is no version heading:
  nothing is tagged, `package.json` says 0.0.0 and nothing is deployed, so a version would
  announce a release that has not happened, and "Changed" would describe differences from a
  release that does not exist. The one "Fixed" entry is the browser list on the page shown
  without WebGPU (b310128): that page had shown the Stage 0 list on `main` since eeef81c, which
  named Edge on ChromeOS. When the owner tags the first release, the section gets its version and
  date, and a new empty Unreleased section opens.
- **Open for the owner** (closed on 2026-11-08: the values stay, section 17): four values of the
  CIE 1931 dataset (CC BY-SA 4.0) are quoted as test expectations in this MIT-licensed repository,
  with the dataset's DOI and licence (`tests/unit/colour.test.ts`). They are treated as insubstantial, but brief section 11 leaves
  unclear licence questions to the owner, so this needs the owner's confirmation.
- **Not verified:** Safari, Firefox and Edge (the page has run only in Google Chrome: 156 on the
  M5, 152 on the macOS runner, 155 and 156 with SwiftShader on the Ubuntu runner); VoiceOver and
  other screen readers; real touch devices (only Chrome's mobile emulation); the deployed site,
  including the headers GitHub Pages sends for it; the frame rate presented in a visible window.

## 16. Stage 7 decisions

Stretch work after Stage 6, asked for by the owner on 2026-11-04 (their message asked how the ring
"actually looks" and whether photonring could prove something new). The answer given then, and
kept in the README: photonring models a toy disk around a non-rotating hole and uses no
observational data, so it can reproduce published predictions with its own code and show them,
not discover anything about real black holes. The owner chose three features, all designed by a
research-and-design pass with an independent critique (`artifacts/stage7/design/`, gitignored)
and built test-first on the branch `stage-7` with a pull request, which reaches `main` only after
the owner's visual check-in (the owner's choice; every commit is still pushed).

- **EHT-style view** (`view=eht`, key B; `docs/PHYSICS.md`, section 10d). The toy disk's
  brightness summed over all frequencies, $(g\hat T)^4$, blurred to the 20 μas resolution of the
  2019 M87* images scaled to this hole (5.263 M), normalised linearly to its brightest point and
  mapped to false colour. Owner's choices at check-in A: the afmhot formula (vivid orange; a
  lightness-linear map of our own was the alternative), the image turned 108 degrees so that north
  is up as for M87* (option R2: a camera roll used only in this view, so the GPU, the CPU twin and
  the overlays follow it with no extra code), smooth (no turbulence), and a preset button named
  "Tilt 17°, as for M87*", never "M87*" alone, because brief section 3 forbids presenting the
  output as a simulation of a real observation. The preset changes only the camera, the view and
  the disk. Every label says "false colour" and "not a simulation of the EHT observation", on the
  page, in the Controls panel, in About and in saved images, and the saved image carries the
  labels and the beam marker in its pixels.
- **Where the blur runs.** Inside the blit, the one path every present, save and test readback
  takes, as six compute passes and a colour-mapped upsample in one command encoder, so the peak
  always belongs to the frame it normalises and the interactive images are never written. It runs
  on a reduced grid: a tent reduce (a box would move a point's light to the centre of its block),
  done separably (the two-dimensional reduce took 9.6 ms per present at 3840 x 2160; separable,
  1.77 ms), a Gaussian of at least 6 low-resolution pixels per sigma (with 4, a render at 30 M
  differed from a direct full-resolution Gaussian by 2 levels; with 6, every comparison holds 1),
  and a bilinear upsample. The tent and the upsample each add $(f^2 + 1/2)/6$ px² of variance,
  averaged over sub-texel phase, and the kernel supplies the rest. Measured cost: 0.39 to 0.72 ms
  per present at 960 x 540 and 1920 x 1080, 1.77 ms at 3840 x 2160 (`docs/PERFORMANCE.md`); the
  design's rule to subtract it from the 12 ms tile budget above 1 ms at 1920 x 1080 does not
  trigger. (Stage 8: these times were taken from a compute pass to a render pass, which a
  diagnostic found unreliable on this Mac, so they and the decision that rests on them are in
  question until the benchmarks are run again; section 17.)
- **Purity rule.** `src/gpu/host/eht-post.ts` imports only the physics library and holds no GPU
  calls, so the CPU renderer, the tools and the tests share the exact plan the GPU uses (the same
  status as `antialias.ts`).
- **The EHT-style view never adds the sky**, on the CPU or the GPU, whatever the scene asks for: a
  page test found that the GPU added the star field, invisible under the disk but the whole image
  with the disk off.
- **Photon subrings, measured** (`view=subrings`, key N; `docs/PHYSICS.md`, section 6b). A 64-bit
  solver for the image of a disk ring after any number of half-turns, checked against an
  independent quadrature and the Binet integrator; GPU ray fans that locate each band edge at 5,
  30 and 200 M; and a page view of the strip just outside the shadow edge, unrolled and on a
  logarithmic scale, with the predicted band edges drawn over it. Framed as a verification of a
  published prediction (Gralla, Holz and Wald 2019; Johnson et al. 2020), not a discovery.
- **The strip's architecture.** The host computes, in f64, the image angle of each column and the
  view angle of each row and uploads them as one table; the tracer takes $\sin\psi$ from it instead
  of from the length of $d - \cos\psi\thinspace e_1$, so the strip's 32-bit limit is the integrator's (about
  $1.2\times10^{-7}$ to $2.5\times10^{-7}$ in $\varepsilon$, measured on the M5), not the setup's.
  Because of that the strip goes down to $10^{-7.5}$ instead of the planned $10^{-6.5}$, so the limit
  and order 5 near it are visible. The first pass's alpha, unused before, carries the image order
  plus one, which the GPU tests read. The strip view has no anti-aliasing and draws none of the
  ring overlays, whose state stays in the link.
- **A cost estimate per render mode** (`src/gpu/host/progressive.ts`): the strip's rays cost 1.5
  to 2.9 times the colour view's (measured), so a view switch must not plan its first frames with
  the previous view's cost; a batch still in flight across a switch is not charged to the new view.
- **The view became a mode** (`ViewMode`: colour, eht, subrings, termination, in that canonical
  order): one radio group in the Controls panel, one key per view that toggles back to colour, and
  tables keyed by the view, so the type checker lists every place a new view must be handled.
- **Status line.** Its GPU time is real timestamp-query time, larger than the benchmark because
  the GPU's clock depends on how busy it has been (`docs/PERFORMANCE.md`); the suspected queue
  waits were not the cause, so nothing in the timing changed.
- **Non-refereed note:** that the 2019 figures used ehtplot's `afmhot_10us`, not plain afmhot, is
  a maintainer's comment in eht-imaging issue #85 (https://github.com/achael/eht-imaging/issues/85),
  not a paper; photonring uses neither, only the afmhot formula.
- **Review.** An adversarial review of the branch (four reviewers, each finding checked by a
  skeptical verifier) confirmed 27 findings, 24 of them distinct, all fixed in e78e425 and 187bd91: among them the
  EHT-style view kept a 16:9 camera after the canvas turned to portrait, the strip overlay could
  show the previous camera's edges, the beam marker left the image below about 17 M, the strip
  drew outward direct images it cannot show, the solver returned offsets below its own floor,
  several tests could not fail, and some documented GPU values predated the tracer's split.
- **Visual check-in B (2026-11-05):** the owner approved the README images (gallery, five
  diagrams, six page screenshots, 2.2 MB) and the README as drafted, kept the 108 degree turn at
  every camera and the legends as they are, and asked for the pull request to be merged once CI is
  green.
- **README images.** The gallery is drawn by the CPU reference renderer (`npm run render:readme`);
  the two images that need labels in their pixels, the EHT-style view and the subring strip, are
  composed by the page's own Save image code in headless Chrome (`npm run shots:readme`), which
  also captures the page screenshots; the diagrams are drawn from the physics library
  (`npm run diagrams`). All write to `artifacts/` first; `tools/accept-readme.ts` and
  `npm run diagrams -- --accept` copy only what the owner approved into `docs/images/`, after
  checking each file against its manifest's sha256 and its byte cap, and
  `tests/unit/readme-images.test.ts` keeps the total within 3,000,000 bytes and every file used.
- **Not verified:** everything here ran only in Google Chrome on the M5 and on CI's macOS runner;
  the EHT-style view and the strip have not been seen in Safari, Firefox or on a real phone; the
  strip's 32-bit limit is an estimate from four edges per distance on one GPU; the page labels
  say "measured on an Apple M5".

## 17. Stage 8 decisions

Stage 8 began on 2026-11-08 with a research-and-design pass and an independent critique of each
design (`artifacts/stage8/design/`, gitignored). From its options the owner chose "ship and
fidelity first" on 2026-11-08.

- **The owner's answers of 2026-11-08.**
  - Ship first: pull request 8a (link preview tags, display choices disclosed, the survey refresh,
    the credit fix and the kept deploy artifact); then the owner deploys `main` and checks Safari;
    then pull request 8b with the README's live link, the CHANGELOG section 0.1.0, and the tag
    `v0.1.0` with a GitHub release. The Page-Thorne disk, the comparison with the EHT data and the
    cross-checks against published formulas and an outside code follow as 0.2.0.
  - Outside GPL code: kgeo and ehtim may run in a Python environment outside the repository; only
    the numbers they output are committed.
  - The public 2017 M87\* data (csv files) are to be committed under `data/`, with a notice
    written for this repository.
  - The four CIE 1931 values quoted in `tests/unit/colour.test.ts` stay, with their attribution.
    This closes the licence question left open at Stage 6 (section 15).
- **Link preview tags before the deploy** (this reverses the Stage 6 choice, section 15).
  `index.html` has Open Graph and X card tags that point at `public/social-preview.png`.
  `tools/site.ts` holds the site's URL, `https://waiivyy.github.io/photonring/`: the form GitHub
  documents for a project site, in lower case (host names are not case sensitive), with no custom
  domain. The tags may come before the deploy because nothing serves `index.html` until the first
  deploy, and the deploy that first serves them also makes both URLs answer; GitHub's own view of
  the repository does not use them. They stay right as long as there is no custom domain and the
  account and repository keep their names. The README's live link is different: GitHub shows the
  README at once, so the link waits for the deploy (pull request 8b).
  - The description, the same text in all three description tags, starts with "A toy model" and
    says that the page is not a simulation of any real observation, so a preview that cuts the
    text short still shows that part (where previews cut was not checked).
  - The image's alt text describes the social preview as it looks: the disk nearly white on the
    left, greyish brown on the right and dark along its inner edge (rewritten for the Page-Thorne
    render below; it said darker brown on the right before), its far side arched over the shadow,
    the thin bright arc, the smeared stars.
  - The X tags are written out in full: X's documentation answered HTTP 402, so its fallback to
    the Open Graph tags could not be confirmed. Its 420-character limit for the alt text comes only
    from a search snippet.
  - The URLs must be absolute: Vite rewrites a root-relative `og:image` to `./social-preview.png`,
    which a link preview cannot use. The dist rules allow the two URLs in `index.html` only (in JS,
    CSS or SVG they are still an absolute URL), and a sixth rule requires `og:url`, `og:image` and
    `twitter:image` exactly once each, with exactly these values. `tests/unit/site-meta.test.ts`
    checks the tags in the source, and the offline test checks `og:image` in the served page.
  - Not checked until after the deploy: the cards X and other services draw, whether they crop
    the 2:1 image, and whether Pages redirects `/photonring` to `/photonring/`.
- **The deploy artifact is kept 90 days.** `actions/upload-pages-artifact` at the pinned commit
  fc324d35 (v5.0.0) declares `retention-days`, with a default of 1 day (its `action.yml`, read at
  that commit); `pages.yml` sets 90, the most the repository's Actions settings allow. So the
  deployed files can still be compared with a local build of pull request 8b
  (`tests/unit/workflows.test.ts` checks the setting).
- **Release order.** Pull request 8a is merged once CI is green in all three jobs and the owner
  says go. The owner then sets Settings > Pages > Source to GitHub Actions, deploys `main`, adds a
  protection rule so that only `main` deploys to the `github-pages` environment, uploads the
  social preview and sets the repository's website field. The developer checks the live site once
  by hand, read only (headers, served files and their sizes, the URL the deploy reports), outside
  any test run, so no automated run makes requests to github.io (section 14). Then the owner's
  Safari check. Pull request 8b adds the live link with its test, the Safari result, the CHANGELOG
  section 0.1.0 with its date and the version 0.1.0; it changes no input of the build, and its
  build is compared with the deployed files by sha256. If they differ, the owner deploys 8b before
  the tag. The tag waits for the owner's approval. So the page goes live with the disclosures
  already in it, and no step states anything before it is true.
- **The Safari check.** By hand, on the live site, in Safari 27.0 on the development Mac (macOS
  27.0), and on a device with Safari 26 if the owner has one; only what is tested is claimed, with
  the exact version and device. The tag waits for a passing Safari check. A defect means a fix, a
  new deploy and a new check. The checklist is in the design (load, console, requests, response
  headers, the CSP and Trusted Types, every view and overlay, the Validation panel, saving,
  keyboard, trackpad, resizing, links, device loss, About, a private window, and the page with
  WebGPU turned off); results go to `docs/VALIDATION.md` and the README in pull request 8b.
- **Safari's GPU times (found at the Safari check, 2026-11-09).** Safari 27.0 showed negative GPU
  times on the status line: it copied the timestamp queries out before the passes that write them
  had finished and returned earlier values (`docs/PERFORMANCE.md`, "Timestamps in Safari"). The
  page now copies the query set only after `onSubmittedWorkDone()`, in a submission of its own,
  and accepts a span only if it is not negative and no longer than the batch's wall-clock time
  plus 2 ms (equal timestamps count as 0 ms, below Chrome's timestamp step); an image with any
  rejected batch is shown as frame time, with the wall-clock times of all
  its batches (`src/gpu/host/timestamps.ts`, `src/ui/image-timing.ts`). Kept: one span per batch
  from the first tile to the last, so the benchmarks' definition is unchanged. Timing each tile on
  its own and adding the spans would avoid comparing timestamps across submissions, which a WebGPU
  working group issue (gpuweb #4361) calls not always guaranteed, but the diagnostics found those
  comparisons consistent between compute passes in Safari and Chromium. The extra submission and
  readback after each timed batch were not measured for their effect on the frame rate. Not
  changed: which passes the EHT-style present's span covers (from a compute pass to a render
  pass), so those times stay in question until the benchmarks are run again; its timestamps are
  now copied out and checked like the tiles', and the benchmarks leave out a rejected repeat
  instead of mixing clocks (`tests/bench/median.ts`).
- **Display choices disclosed.** The README's Limits, the About dialog and `docs/PHYSICS.md`,
  section 10, now say that the disk's 6500 K peak temperature (in the gas's own frame) is a display
  choice that was not derived from a black hole mass or accretion rate; that the page's exposure is
  fixed (the README and `docs/PHYSICS.md` give its value, 1; the About dialog gives none) and a
  fixed tone curve turns the brightest parts white; how colours are made (the disk
  and the stars are blackbodies, converted to sRGB with no adjustment for the eye, colours outside
  sRGB clipped); that the stars are invented; and that the disk is opaque. A new Limits item says
  that the page is not a model of M87\* or Sgr A\*, whose EHT images are explained by models in
  which hot gas shines by synchrotron emission (EHT 2019, Papers I and V; EHT 2022, Sgr A\*
  Paper V, section 1), and that its black hole does not spin. Every number these texts quote is
  recorded first by `tests/unit/colour.test.ts`. The About text takes the temperature from
  `DEFAULT_DISK`, and the page takes its exposure, tone curve and disk from `PAGE_SCENE`
  (`src/ui/page-scene.ts`); `tests/unit/disclosures.test.ts` checks that the texts follow those
  values, that the temperature and the words "display choice" share a paragraph, and that the
  About text names the fixed exposure, the tone curve, the clipping, the invented stars and that
  its black hole does not spin; `tests/e2e/about.spec.ts` checks the open dialog. A sentence saying that the tone curve makes
  the two sides of the disk look less different than the factor of 71 was left out: it was not
  measured, and a first estimate in the critique did not support it. The page for browsers without
  WebGPU, the EHT-style view's legend and the Controls panel are unchanged.
- **The Page-Thorne disk (item 3 of the stage).** Designed with an independent critique
  (`artifacts/stage8/design/disk-fidelity.md` and `disk-fidelity-critique.md`, gitignored); the
  owner's decisions of 2026-11-08 are applied:
  - The disk's flux is the relativistic thin-disk flux of Page and Thorne (1974) for a
    non-rotating hole, with zero torque at the ISCO, in the 64-bit library, the CPU renderer, the
    GPU shader and the EHT-style view (`docs/PHYSICS.md`, section 10). The Newtonian profile is
    gone from the library and the renderers, with no page option; `tests/unit/disk-flux.test.ts`
    keeps a small inline Newtonian flux function as the large-radius oracle.
  - 6500 K stays the temperature at the hottest radius in the gas's own frame, now $9.55M$ (it was
    $8.17M$), and stays a display choice. Every text that names it says "in the gas's own frame".
  - The library uses a form of the flux without cancellation near the ISCO, checked against
    eq. (12) of the paper integrated numerically and against a second closed form (Mueller and
    Frauendiener 2012). In 64-bit floats the closed form in $B(x)$, its three terms summed directly, is off by $2.2\times10^{-5}$ at
    $r = 6M(1 + 10^{-6})$.
  - The inner edge stays a setting, from $6M$ out; the zero torque stays at $6M$, so a larger
    inner edge cuts the disk off. `assertDiskSettings` makes both renderers reject an inner edge
    inside the ISCO and $M \le 0$. The table, the GPU profile and the GPU light tests also run
    with a disk cut at 7 M, so a shader that took the zero torque from the inner edge fails (it
    did, when tried).
  - GPU: `temperatureHat` in `src/shaders/disk.wgsl` multiplies $s^{3/2}(1 - s)^{1/2}$,
    $s = \sqrt{6M/r}$, by the smooth factor $C(s)$ from a 1024-entry table built in f64
    (`src/gpu/host/disk-table.ts`, 4 KB, group 0 binding 3), with square roots, divisions and
    linear interpolation, and $1 - s$ written as $((r - 6M)/r)/(1 + s)$; no `log`, `atanh` or
    `pow`. The frame field `diskTemperatureScale` became `diskPeakTemperature` (the peak
    temperature itself, 1 in the EHT-style view). Measured on the M5 in Chrome 157.0.8103.38,
    $\hat T$ from the shader is within $5.3\times10^{-7}$ of the library at the f32 radius
    ($M = 1$); the test's tolerance, guessed at $10^{-5}$, was settled at $2\times10^{-6}$.
  - The EHT-style ring moved with the flux peak: 12.53 M (25.1 M across, 2.3 times M87*'s
    $11\thinspace\theta_g$), from 11.21 M; the bright side is at 194.9 degrees (196.7). The test's
    ring bracket moved to 12 to 13 M (`docs/VALIDATION.md`, Tolerance changes), and the legend now
    says the real ring is "less than half this size" in units of M (11/25.1 = 0.44; it said
    "about half", 0.49 before).
  - Accepted at the owner's visual check-in on 2026-11-09, each byte for byte the candidate the
    owner looked at: the goldens `diskFaceOn` and `diskInclined` (`flatSpace` and `noDisk` are
    byte-identical), the README images, the hero and social preview, and the gallery of the page
    for browsers without WebGPU. The before-and-after renders are in
    `artifacts/stage8/page-thorne/` (gitignored). The GPU
    benchmarks were not re-run: their disk times are of the Newtonian profile, at the commits
    `docs/PERFORMANCE.md` names.
- **The survey refreshed** (section 1): re-checked through the GitHub API and the READMEs on
  2026-11-08, with seven more projects, a column for whether each checks its GPU output in CI, and
  the October list of differences re-checked one by one.
- **Credit for the subring law.** `docs/PHYSICS.md`, section 6b, said that the leading-order law
  for the subring offsets at finite distances was derived for this project, and the README said
  that photonring derives it. It is the strong deflection law of Bozza and Scarpetta (2007, eqs. 65
  to 68), which Aldi and Bozza (2017) applied to an inclined disk and Bisnovatyi-Kogan and Tsupko
  (2022), Tsupko (2022) and Aratore, Tsupko and Perlick (2024) to the rings of a disk. Both places
  now credit them in that order and claim no derivation; section 6b shows that their eq. (68) and
  the form with the critical orbit's sweep are the same expression.
- **The cross-checks (item 5 of the stage).** Designed with an independent critique
  (`artifacts/stage8/design/cross-checks.md` and `cross-checks-critique.md`, gitignored), whose
  fixes are all applied except where a decision below overrides one; the owner started the step on
  2026-11-09. `tests/unit/published-rings.test.ts` checks photonring against the published
  strong deflection formulas and numerical results, `tests/unit/cross-check.test.ts` against
  kgeo; the rows, tolerances and measured values are in `docs/VALIDATION.md`, the derivation of
  the next-order term in `docs/PHYSICS.md`, section 6b. No bug in photonring was found, and
  `src/` did not change.
  - The owner's decisions. kgeo (commit bc5affe, GPL-3.0) and ehtim 1.3.2 (GPL-3.0) run in a
    pinned Python environment outside the repository. The driver scripts that import them stay
    outside too (`artifacts/stage8/cross-check/driver/`, gitignored); only their output numbers
    are committed, as the fixture `tests/data/kgeo-bc5affe.json` and as rows in
    `docs/VALIDATION.md`. The docs describe kgeo as called from a separate Python driver run
    outside photonring's build and tests, with no kgeo code in the repository. The credit for the
    subring law was fixed in pull request 8a and was not redone.
  - Decided for this step. At the check-in of 2026-11-09 the owner accepted A7's unit of the last
    digit, A8 as a consistency check, dropping A9, the committed Fig. 6 values and the factor 2
    of K1's rounding model (Tolerance changes in `docs/VALIDATION.md`). A7 pins its definitions
    ($\Omega_S$ exactly $\pi(15^2 - 6^2)$, the observer at infinity, no other factor) and allows
    one unit of the last quoted digit, because Bisnovatyi-Kogan and Tsupko state neither their
    rounding nor their accuracy and their printed $\Omega_S = 594$ alone moves the first ratio by
    $4.4\times10^{-4}$.
    A8 is a consistency check of photonring's own shadow formula, with its rounding floor derived
    and tested on 4001 distances. Tsupko's Fig. 6 is committed as digitized values with the raw
    pixel coordinates of every marker and tick and a tolerance in value units per panel, without
    the image. Tsupko's 2.0 % area case is added as a cheap outside check. A4 has an explicit
    branch guard. The fitted ratio bound in `tests/unit/subrings.test.ts` is unchanged. The
    next-order term is described as derived here; of the sources read, which are listed, only
    Iyer and Petters (2007) give it, for a source and an observer at infinity. kgeo runs at 100
    and 1000 M; its error was measured against its own ODE oracle at the compared samples before
    any tolerance used it, crossing counts are its $N_{max} + 1$, capture is at $2.001M$, and an
    order with no crossing matches only if neither code has one; a kgeo crossing between $2M$ and
    $2.001M$, which photonring's capture cannot reach, is compared in neither K1 nor K4.
  - A9, the CPU strip at 1000 M, is dropped. The page's distances run from 5 to 200 M
    (`ORBIT_LIMITS` in `src/ui/quantise.ts`), so it would test a view the page never shows. The
    physics at 1000 M is covered by A4 and by K1, which checks `traceRay`, the CPU renderer's
    per-pixel tracer, against kgeo down to $\varepsilon = 10^{-9}$; the strip at 30 M by
    `tests/unit/strip.test.ts`, and on the GPU at 5, 30 and 200 M by `tests/gpu/subrings.spec.ts`.
    The only thing A9 would add is the strip's pixel mapping at 1000 M, the same code that
    `tests/unit/strip.test.ts` runs at 30 M.
  - Found on the way, all in `docs/VALIDATION.md`: kgeo is inaccurate just inside the critical
    curve (scipy's `ellipj` close to $m = 1$) and stops counting crossings at $r_o$; at one
    crossing its oracle is the outlier; and the K1 tolerance needs two measured photonring terms,
    the rounding drift and the input carried by a unit direction vector, beyond the design's
    three (Tolerance changes). `ringImageAngle` solves a direct image whose root lies next to the
    ray that turns at $R$ in plain $\alpha$, with an absolute tolerance of $10^{-15}$ (section 6a
    of `docs/PHYSICS.md`), so for observers far beyond the page's range its relative precision in
    $\varepsilon$ falls: against a bisection on the swept angle,
    $1.3\times10^{-10}$ at $R = 20M$ seen from $10^7M$, $1.4\times10^{-9}$ at $15M$ from $10^8M$
    and $7.8\times10^{-7}$ at $6M$ from $10^{10}M$, while for the same rings it is at most
    $1.9\times10^{-15}$ at 200 M and $8.1\times10^{-14}$ at 1000 M. That is not a bug in the page's
    range and does not affect the kgeo comparison; it is why A7 puts its observer at infinity
    ($u_o = 0$) instead of at a large distance.
  - After review: A4 now includes a ring at 3.1 M, where the branch guard decides two cases that
    the $B$ filter alone would keep, and the test fails if the guard is removed. K1's rounding term
    takes photonring's drift of $b$ capped at a rounding model, with a test that the drift stays
    under it, because a wrong force law breaks the same conservation and would otherwise widen
    the tolerance with the error under test; a coefficient off by $10^{-12}$ now fails. K2's
    $10^{-12}$ rad for photonring's solver, validated before only at 30 M for orders 1 to 5, is
    checked on the K2 images themselves.
  - Test-first: each test was run first and failed for the right reason, its helper or fixture
    not existing yet; deliberate defects in scratch copies (22 for the published formulas, 12 for
    kgeo) each made a test fail.
