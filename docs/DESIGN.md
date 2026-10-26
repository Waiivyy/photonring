# Design decisions

Status: Stage 0 (feasibility). Every number below was measured unless it is labelled as an
estimate. Machine for all measurements: Apple M5 (10-core GPU), 24 GB, macOS 27.0, Node 25.6.1.
The f32 results come from an emulation (`Math.fround` after every operation), not from a GPU; GPU
measurements start in Stage 2.

| Decision             | Choice                                                                                                         | Section |
| -------------------- | -------------------------------------------------------------------------------------------------------------- | ------- |
| Language and tooling | TypeScript 6.0 (strict), Vite, Vitest, Playwright, ESLint, Prettier                                            | 2       |
| GPU API              | Raw WebGPU with WGSL compute shaders, no rendering framework                                                   | 2       |
| Integrator           | Planar Binet equation $u'' = 3Mu^2 - u$, classical RK4, fixed step $d\phi = 0.05$ (f32)                        | 3       |
| Final direction      | Rotation recurrence instead of WGSL `sin`/`cos`                                                                | 3       |
| Fallback             | No WebGL2 renderer in the MVP; explanation page plus pre-rendered gallery                                      | 4       |
| CI                   | Physics, CPU renderer and page tests on Ubuntu; GPU parity job on a macOS runner, to be proven in Stage 2 or 5 | 5       |

## 1. Positioning: what already exists

A survey in October 2026 found that validated, real-time, in-browser black hole renderers already
exist, so this project cannot claim to be the first. The claims below are each project's own
README or paper; none of their tests were run here.

| Project                                                                                                                                           | Renders                             | Technology                                                 | What it validates (as published)                                                                                                         |
| ------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------- | ---------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| [Dashrath175/LensForge](https://github.com/Dashrath175/LensForge) (2026, MIT)                                                                     | Kerr, Novikov-Thorne disk, redshift | WebGPU compute, Dormand-Prince 4(5), TypeScript f64 oracle | GPU against f64: escape direction within 0.99 arcmin, disk $\Delta g/g \le 1.03\times10^{-4}$; shadow within 0.5 px of Bardeen's contour |
| [kyleyhw/black_hole](https://github.com/kyleyhw/black_hole) (2026, no licence)                                                                    | Kerr, disk                          | WebGL2 fragment shader, RK4; Python f64 mirror             | Shadow measured on the browser image at $r_o = 18M$ within 0.006 % of the finite-distance formula; $b_c$ to $5\times10^{-7}$             |
| [YIHnb/schwarzschild-ray-tracer](https://github.com/YIHnb/schwarzschild-ray-tracer) (2026, MIT)                                                   | Schwarzschild, disk                 | WebGL2, RK4 on $u(\phi)$; Python reference                 | Deflection against quadrature (about $10^{-8}$) and finite-distance shadow, for the Python reference only                                |
| [ebruneton/black_hole_shader](https://github.com/ebruneton/black_hole_shader) (2020, BSD-3), [arXiv:2010.08735](https://arxiv.org/abs/2010.08735) | Schwarzschild, disk, Doppler        | WebGL2 with precomputed tables                             | C++ tests of the GLSL against numerical integration, "within $10^{-3}$ of reference values"                                              |
| [oseiskar/black-hole](https://github.com/oseiskar/black-hole) (2017, MIT)                                                                         | Schwarzschild, disk, Doppler        | WebGL, $u(\phi)$ integration                               | No published numbers; README notes low step counts bend rays too much                                                                    |
| [rantonels/starless](https://github.com/rantonels/starless) (2017, GPL-3.0)                                                                       | Schwarzschild, disk                 | Python CPU ray tracer                                      | None quantitative                                                                                                                        |

Research codes (GYOTO, ipole, RAPTOR, Odyssey, GRay, kgeo, AART) validate carefully but do not run
in a browser. Shadertoy shaders could not be inspected (the site blocks automated access); none is
known to validate anything.

What could still set this project apart, for the check-in decision:

- Validation that runs against the actual WebGPU output, headless, in CI, rather than against a
  separate reference implementation or by hand.
- Image-level comparison of the GPU render against the CPU reference renderer, with documented
  tolerances, plus measured error budgets per pixel (section 3 already has the f32 one).
- Two independent reference methods for the deflection (quadrature and elliptic integrals) that
  agree to $10^{-15}$, and an integrator chosen by measurement with the comparison published.
- A narrow, finished, documented Schwarzschild scope rather than a broad Kerr feature list.

## 2. Stack

**TypeScript (strict) for everything.** One language for the physics library, the CPU reference
renderer, the tests and the UI. JavaScript numbers are IEEE binary64, so the f64 reference is as
precise as one in C or Rust. TypeScript is pinned to 6.0.x: TypeScript 7.0 (the native compiler)
is out, but typescript-eslint 8.72 declares `typescript >=4.8.4 <6.1.0`. Revisit when
typescript-eslint supports 7. A second config (`tsconfig.physics.json`) compiles `src/physics`
with no DOM and no Node types, so the library cannot accidentally depend on either.

**Vite, Vitest, Playwright, ESLint, Prettier.** Vite 8 gives a dev server and a production build
with hashed assets; Vitest 5 shares its configuration; Playwright drives Chromium for page tests
and GPU parity tests. No objections to the proposal. Current dev dependency tree: 98 packages,
92 MB in `node_modules`, zero runtime dependencies planned. Node scripts in `tools/` run with
Node's built-in TypeScript type stripping (Node 22.18 or later), so no `tsx` dependency.

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

**PNG output for goldens: decide in Stage 1.** A minimal encoder on `node:zlib` (deflate plus
CRC-32, about 60 lines) gives byte-exact deterministic output with no dependency.

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
Perturbing every f32 result by a random amount up to about 2 ULP:

| Method        | Step | Max error, correctly rounded (px), 5 / 30 / 200 M | Max error, perturbed (px) | Misclassified |
| ------------- | ---- | ------------------------------------------------- | ------------------------- | ------------- |
| Binet RK4     | 0.05 | 0.052 / 0.044 / 0.002                             | 0.127 / 0.043 / 0.024     | 0             |
| Cartesian RK4 | 0.1  | 0.199 / 0.171 / 0.060                             | 0.632 / 0.865 / 0.083     | 0             |

The Binet inner loop uses only $+, -, \times$, so on a GPU it should sit closer to the correctly
rounded column. Stage 2 measures this on hardware.

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
f64 Binet error there is the RK4 phase error, about $\pi\,d\phi^4/120 \approx 1.6\times10^{-7}$ rad
regardless of $b$; in f32 the rounding of the final angle (about $2\times10^{-7}$ rad near $\pi$)
happened to partly cancel it at those sample points, which is why the f32 row looks better than
the f64 row there. Near $b_c$ f32 is the worse of the two, as expected (at $1.02\,b_c$:
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
$\delta\psi = \sqrt{1-2M/r_o}\,\delta b/(r_o\cos\psi_{sh})$ wide, which is 0.14 px at $5M$,
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
  times the integrator error. The direction $(\cos\phi_\infty, \sin\phi_\infty)$ will instead be
  built by rotating a unit vector by the precomputed $(\cos d\phi, \sin d\phi)$ each step (f32
  emulation: $2.2\times10^{-6}$ rad, 0.002 px, after 250 steps), plus a short Taylor series for
  the final partial step.

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
memory traffic. Stage 2 measures it with timestamp queries.

## 4. Browser support and fallback

WebGPU status in October 2026 (from the gpuweb implementation-status wiki, MDN browser-compat-data,
and the vendors' release notes):

| Browser                                   | Status                                                                                |
| ----------------------------------------- | ------------------------------------------------------------------------------------- |
| Chrome and Edge, Windows, macOS, ChromeOS | On by default since 113                                                               |
| Chrome, Linux                             | Since 144 for Intel Gen12+, since 147 for NVIDIA on Wayland; other GPUs behind a flag |
| Chrome, Android                           | Since 121 on Android 12+ with Qualcomm or ARM GPUs; others partial                    |
| Safari, macOS and iOS/iPadOS              | On by default in Safari 26, but only on macOS Tahoe 26, iOS 26 and later              |
| Firefox, Windows                          | Since 141                                                                             |
| Firefox, macOS                            | Since 147 on Apple Silicon; not on Intel Macs                                         |
| Firefox, Linux and Android                | Not shipped (Nightly or flags only)                                                   |

`timestamp-query` is available in Chrome (quantised to 100 microseconds by default); Safari and
Firefox support is unconfirmed, so frame timing must work without it.

**Fallback: no WebGL2 renderer in the MVP** (stretch goal, as proposed). Desktop Chrome, Edge,
current Safari and Firefox on Windows and Apple Silicon cover most visitors. A WebGL2 port would be
a second renderer, not a second shader: no compute shaders, a fragment-shader architecture, GLSL
instead of WGSL, and its own parity tests. Unsupported browsers get a clear explanation, a short
list of supported browsers, and a gallery of pre-rendered images.

## 5. CI and GPU testing

Evidence gathered (third-party CI runs and project configurations, not yet reproduced here):

- On `ubuntu-latest` (no GPU), Playwright's Chromium exposes a SwiftShader WebGPU adapter with
  `--enable-unsafe-webgpu`, and compute shaders run; one project reports that SwiftShader WebGPU
  "dies partway through a run". luma.gl and three.js run WebGPU tests on Ubuntu runners with
  SwiftShader or Mesa lavapipe.
- On GitHub's macOS arm64 runners, Playwright's new headless mode (`channel: 'chromium'`) exposes
  an "Apple Paravirtual device" Metal adapter that computes correctly; the default headless shell
  gets only SwiftShader.

**Plan:** CI runs typecheck, lint, format, unit, property and golden tests and the page smoke test
on Ubuntu. GPU-versus-CPU parity tests run in a separate macOS job with Playwright's new headless
Chromium, and locally through a documented command (`npm run test:gpu`, Stage 2). If the macOS job
proves flaky, it becomes manual (`workflow_dispatch`) and the local command remains the source of
truth. Whether GitHub-hosted macOS runners are free for public repositories should be checked in
the billing documentation before relying on them.

## 6. Proposed targets

| Quantity                                                                                             | Brief's guess                   | Proposed                                   | Evidence                                                                           |
| ---------------------------------------------------------------------------------------------------- | ------------------------------- | ------------------------------------------ | ---------------------------------------------------------------------------------- |
| Deflection, f64 library, $b$ = 1.02 to 100 $b_c$                                                     | $< 10^{-6}$ relative            | Keep $< 10^{-6}$                           | Reference methods agree to $10^{-11}$; Binet at $d\phi = 0.0125$: $8\times10^{-8}$ |
| Deflection, f32 path, same range                                                                     | $< 10^{-3}$ relative            | $< 10^{-4}$ relative                       | Emulated $2.8\times10^{-6}$; margin for GPU arithmetic; confirm in Stage 2         |
| Escape direction, f32, all directions outside $\lvert b/b_c - 1\rvert < 10^{-3}$, $r_o$ = 5 to 200 M | (new)                           | $\le 0.25$ px at 1080 rows, 60 degree FOV  | Emulated 0.052 px; 0.127 px with 2-ULP perturbation                                |
| Capture or escape classification outside that band                                                   | (new)                           | Zero errors; f32 $b_c$ within $10^{-6}$    | 0 of 9000 per configuration; $2.4\times10^{-7}$                                    |
| Step-limit hits                                                                                      | "investigate"                   | Zero, with a cap of 1000 steps             | 0 observed; longest ray 251 steps                                                  |
| Shadow radius                                                                                        | 1 px or 0.5 %, whichever larger | Keep until Stage 1 measures the CPU render |                                                                                    |
| Frame rate                                                                                           | 30 fps at 1920x1080 with disk   | Keep as target; measure in Stage 2 and 3   | Estimate only (section 3)                                                          |
| Camera distance                                                                                      | 5 to 200 M, default 30 M        | See open question 2                        | Errors are within target at both ends                                              |

## 7. Formulas from the brief: verified or corrected

Derivations and references are in `docs/PHYSICS.md`.

| Brief                                                                                | Result                                                                                                                                                                                                                                                                                               |
| ------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Horizon 2M, photon sphere 3M, ISCO 6M, $b_c = 3\sqrt3 M$                             | Verified (derivation; Bardeen, Press and Teukolsky 1972; tests)                                                                                                                                                                                                                                      |
| $(du/d\phi)^2 = 1/b^2 - u^2(1-2Mu)$, $u'' + u = 3Mu^2$                               | Verified                                                                                                                                                                                                                                                                                             |
| $\mathbf{x}'' = -3Mh^2\mathbf{x}/r^5$, $h$ conserved                                 | Verified. $\lambda$ is affine (scaled by $h/L$). Clarification: $\lvert\mathbf{x}'\rvert^2 = h^2(1/b^2 + 2M/r^3)$ is not constant, and the initial velocity must shrink the radial component of the view direction by $\sqrt{1-2M/r_o}$; a unit vector along the pixel direction gives the wrong $b$ |
| $\alpha(b) = 2\int_0^{u_0} du/\sqrt{1/b^2 - u^2 + 2Mu^3} - \pi$                      | Verified (two independent methods agree to $10^{-15}$)                                                                                                                                                                                                                                               |
| Weak field $\alpha \approx 4M/b$                                                     | Verified, with the next five coefficients (Keeton and Petters 2005)                                                                                                                                                                                                                                  |
| Strong field, Bozza 2002                                                             | Verified: $\bar a = 1$, $\bar b = \ln[216(7-4\sqrt3)] - \pi \approx -0.4002$                                                                                                                                                                                                                         |
| $\sin\psi_{sh} = (3\sqrt3 M/r_o)\sqrt{1-2M/r_o}$                                     | Verified (Perlick and Tsupko 2022, Synge 1966); the angle is $\pi - \arcsin$ inside $3M$                                                                                                                                                                                                             |
| $\Omega = \sqrt{M/r^3}$, $u^t = (1-3M/r)^{-1/2}$                                     | Verified                                                                                                                                                                                                                                                                                             |
| $g = 1/(u^t(1 - \Omega L/E))$, observer at infinity                                  | Verified (Luminet 1979, Cunningham 1975). **Correction for this renderer:** the camera is a static observer at $r_o$, so $g_{obs} = g/\sqrt{1-2M/r_o}$ (1.035 at 30M, 1.29 at 5M)                                                                                                                    |
| Face-on $g = \sqrt{1-3M/r}$; static emitter $\sqrt{1-2M/r}$; intensity $\propto g^4$ | Verified                                                                                                                                                                                                                                                                                             |
| $T \propto r^{-3/4}(1-\sqrt{r_{in}/r})^{1/4}$                                        | Verified as the Newtonian Shakura-Sunyaev profile (not Page-Thorne); peak at $(49/36)r_{in}$                                                                                                                                                                                                         |
| $T_{obs} = g\,T_{emit}$                                                              | Verified ($I_\nu/\nu^3$ invariance)                                                                                                                                                                                                                                                                  |

Also found: the starless write-up prints $u'' + u = \tfrac32 u^3$ and a force along
$\hat r/r^5$, both typos (its code is correct); this project cites the code, not the page.

## 8. Credits

- The Cartesian form $\mathbf{x}'' = -\tfrac32 h^2\mathbf{x}/r^5$ (units $2M = 1$) as a
  singularity-free way to trace Schwarzschild rays is taken from rantonels' starless
  (`tracer.py`). No code was copied.
- Integrating the orbit equation $u(\phi)$ per ray is also what oseiskar/black-hole and
  YIHnb/schwarzschild-ray-tracer do; the exact capture criterion, Hermite escape interpolation and
  rotation-recurrence direction here are this project's own choices.
- If the Stage 3 lookup-table experiment is adopted, credit Bruneton (2020) for precomputed
  tables in a real-time black hole shader.

## 9. Open questions for the go/no-go check-in

1. **Positioning.** Given LensForge, kyleyhw and YIHnb, proceed as a Schwarzschild-only project
   that differentiates on validating the GPU output itself in CI, or change scope?
2. **Minimum camera distance.** With a 60 degree vertical field of view the shadow fills the whole
   height below about $9.2M$ (shadow radius $30°$); at $5M$ its radius is $53.6°$. Options: keep
   5M and widen the field of view automatically near the hole, or raise the minimum to about 8M.
3. **Observer blueshift of the star field.** Apply $1/\sqrt{1-2M/r_o}$ to starlight colour and
   brightness (physically right, 3.5 % at 30M), or leave the star field untouched and say so?
4. **macOS CI job** for GPU parity tests: acceptable, assuming it is free for this public repo?
