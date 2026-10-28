# Design decisions

Status: Stage 5 (build, deploy and CI). Every number below was measured unless it is labelled as an
estimate. Machine for all measurements: Apple M5 (10-core GPU), 24 GB, macOS 27.0, Node 25.6.1,
except the CI runs in sections 5 and 14, which name their runner. In sections 3 and 6 the f32
results come from an emulation (`Math.fround` after every operation); section 11 has the
measurements on the GPU.

| Decision             | Choice                                                                                                                                                 | Section |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ------- |
| Language and tooling | TypeScript 6.0 (strict), Vite, Vitest, Playwright, ESLint, Prettier                                                                                    | 2       |
| GPU API              | Raw WebGPU with WGSL compute shaders, no rendering framework                                                                                           | 2       |
| Integrator           | Planar Binet equation $u'' = 3Mu^2 - u$, classical RK4, fixed step $d\phi = 0.05$ (f32)                                                                | 3       |
| Final direction      | Rotation recurrence instead of WGSL `sin`/`cos`                                                                                                        | 3       |
| Fallback             | No WebGL2 renderer in the MVP; explanation page plus pre-rendered gallery                                                                              | 4       |
| Star field           | Three cubic lattices in direction space hashed with pcg3d; profiles truncated at half a cell, so lookups are seamless                                  | 10      |
| Colour               | Planck spectrum against an analytic CIE 1931 fit (no CC BY-SA data in the repository), CSS Color 4 sRGB matrix                                         | 10      |
| CPU reference        | f64, $d\phi = 0.0125$, own PNG codec on `node:zlib`, goldens at 160x90 with a documented tolerance                                                     | 10      |
| CI                   | Ubuntu: checks, build and the built page in Google Chrome with SwiftShader WebGPU; macOS arm64: GPU parity and the full page suite on the runner's GPU | 5, 14   |
| Build                | Vite, every file but `index.html` and `favicon.svg` content-hashed, type check and structural checks of `dist/` in every build                         | 14      |
| CSP                  | Meta tag in the built page only: `default-src 'none'`, `'self'` for scripts, styles and images, Trusted Types required                                 | 14      |
| Hosting              | GitHub Pages through a workflow started by hand, actions pinned to commit SHAs                                                                         | 14      |

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
Perturbing every f32 result by a random amount up to about 2 ULP (worst of five random seeds;
a single draw varied by up to a factor of 3):

| Method        | Step | Max error, correctly rounded (px), 5 / 30 / 200 M | Max error, perturbed (px) | Misclassified |
| ------------- | ---- | ------------------------------------------------- | ------------------------- | ------------- |
| Binet RK4     | 0.05 | 0.052 / 0.044 / 0.002                             | 0.285 / 0.263 / 0.042     | 0             |
| Cartesian RK4 | 0.1  | 0.199 / 0.171 / 0.060                             | 1.384 / 0.465 / 0.086     | 0             |

**Measured on the GPU in Stage 2** (section 11): over 6196 escaped rays the largest escape
direction error is 0.058 px, so the real GPU sits at the correctly rounded level, not at the
pessimistic one. This model is pessimistic: it also perturbs $+, -, \times$, which WGSL rounds correctly, and the
Binet inner loop uses nothing else, so on a GPU it should sit closer to the correctly rounded
column. Even so, its worst case (0.285 px) slightly exceeds the 0.25 px target proposed in
section 6. Stage 2 measures this on hardware.

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

`timestamp-query` is available in Chrome, quantised by default; Safari and Firefox support is
unconfirmed, so frame timing must work without it. (Stage 0 noted a 100 microsecond step from
secondary sources; in Chrome 156 on the Apple M5 every measured value is a multiple of
65.536 microseconds, that is $2^{16}$ ns, Stage 3.)

**Fallback: no WebGL2 renderer in the MVP** (stretch goal, as proposed). Desktop Chrome, Edge,
current Safari and Firefox on Windows and Apple Silicon cover most visitors. A WebGL2 port would be
a second renderer, not a second shader: no compute shaders, a fragment-shader architecture, GLSL
instead of WGSL, and its own parity tests. Unsupported browsers get a clear explanation, a short
list of supported browsers, and a gallery of pre-rendered images.

## 5. CI and GPU testing

Built in Stage 5 (`.github/workflows/ci.yml`; decisions in section 14). Every job uses the
runner's preinstalled Google Chrome through Playwright's `channel: 'chrome'`, not Playwright's
own Chromium, so nothing is downloaded. The Stage 0 evidence below was for Chromium; what the
runners actually do was measured in the first CI runs on 2026-10-28 with
`npm run probe:webgpu`, which reports the adapter, checks a compute dispatch, and presents 60
frames to a canvas and compares a screenshot with the clear colour.

- **macOS: the GPU parity tests run on the runner's GPU.** On `macos-15` (arm64, image
  20260907.0337.1), Chrome 152.0.7977.83 headless exposes the paravirtual Apple GPU with no
  flags: vendor `apple`, architecture empty, no `timestamp-query` (so the page uses its
  wall-clock timing path there), `maxTextureDimension2D` 16384. Compute and presentation pass.
  The 13 parity tests and all 109 page tests against the build passed in every run in which
  the job started (5 of 6 runs on 2026-10-28), and the GPU shadow measurement (validation mode
  at six distances) came out byte for byte equal to the M5's. In the other run GitHub assigned
  no macOS runner within 15 minutes and cancelled the job ("not acquired by Runner of type
  hosted even after multiple attempts", with a notice that macOS arm64 runners have capacity
  constraints).
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
  tests then waited for SwiftShader; the wait is now 60 s. On macOS, SwiftShader presents without
  any of this (Chrome 156 on the M5).
- **Stage 0 evidence, for the record** (third-party CI runs, Playwright's Chromium): on
  `ubuntu-latest` Chromium exposed SwiftShader with `--enable-unsafe-webgpu` and one project
  reported that it "dies partway through a run"; on macOS arm64 runners the new headless mode
  exposed an "Apple Paravirtual device" Metal adapter.

If the macOS job fails for reasons that do not reproduce locally (no adapter, device loss, a
runner image change), it becomes manual (`workflow_dispatch`) and `npm run test:gpu` on the
local machine stays the source of truth. macOS arm64 runners are free for this public
repository (section 9).

## 6. Proposed targets

| Quantity                                                                                             | Brief's guess                   | Proposed                                   | Evidence                                                                           |
| ---------------------------------------------------------------------------------------------------- | ------------------------------- | ------------------------------------------ | ---------------------------------------------------------------------------------- |
| Deflection, f64 library, $b$ = 1.02 to 100 $b_c$                                                     | $< 10^{-6}$ relative            | Keep $< 10^{-6}$                           | Reference methods agree to $10^{-11}$; Binet at $d\phi = 0.0125$: $8\times10^{-8}$ |
| Deflection, f32 path, same range                                                                     | $< 10^{-3}$ relative            | $< 10^{-4}$ relative                       | Emulated $2.8\times10^{-6}$; margin for GPU arithmetic; confirm in Stage 2         |
| Escape direction, f32, all directions outside $\lvert b/b_c - 1\rvert < 10^{-3}$, $r_o$ = 5 to 200 M | (new)                           | $\le 0.25$ px at 1080 rows, 60 degree FOV  | Emulated 0.052 px; 0.285 px with the pessimistic 2-ULP perturbation (section 3)    |
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
- The star field hashes lattice cells with pcg3d from Jarzynski and Olano (2020), "Hash
  Functions for GPU Rendering", implemented here from the paper's description.
- Blackbody colours use the CIE 1931 colour-matching fit of Wyman, Sloan and Shirley (2013) and
  the sRGB matrix and transfer function from the W3C CSS Color 4 sample code (constants only).
- If the Stage 3 lookup-table experiment is adopted, credit Bruneton (2020) for precomputed
  tables in a real-time black hole shader.

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
  even where the CPU and the GPU floor to different cells. No nebula band yet (optional in the
  brief); it can come with the Stage 3 look.
- **Colour.** The CIE 1931 tables are CC BY-SA 4.0, so instead of committing them the code uses
  the Wyman-Sloan-Shirley analytic fit. Its chromaticity error against the CIE-derived Planckian
  locus is at most 0.0002 from 6500 K up and 0.0046 at 1500 K.
- **Disk defaults:** inner edge at the ISCO, outer edge at $20M$, 6500 K at the hottest radius,
  exposure 1, and opaque (opacity 1), which the user confirmed at the Stage 1 visual check-in
  after comparing it with a 0.6-opacity render.
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
  fits the default limits by a wide margin (uniforms 128 bytes, colour table 32 KB, at most
  32 x 32 workgroups per tile), so the device is requested with default limits. `?maxdim=N` lowers
  the texture limit for testing; it can only reduce the size.
- **Tiling and time budget:** 256 x 256 tiles, centre first, each submitted separately with its own
  parameters. Each animation frame dispatches only as many tiles as its 12 ms budget allows, from
  the measured cost per pixel (timestamp queries when available, wall-clock otherwise). With the
  step cap, no single tile can run away.
- **Device loss** shows a message with the reason and a Restart button that creates a new adapter
  and device. `device.destroy()` from the debug hook exercises this path in the tests.
- **Unsupported browsers** get the reason, the supported browsers and versions (section 4), and
  four 640 x 360 images from the CPU reference renderer (88 to 128 KB each, `npm run gallery`).
- **Measured** (`docs/VALIDATION.md` item 11, `docs/PERFORMANCE.md`): escape directions within
  0.058 px of the f64 reference over 6196 rays with no termination mismatches; deflection within
  $2.8\times10^{-5}$; a 1920 x 1080 frame without the disk in 6.2 ms of GPU time in headless
  Chrome.
- **Production build** already works (35 KB of JavaScript, 13 KB gzipped, hashed assets, relative
  paths); the CSP and deployment come in Stage 5.

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
  can reach the critical band ($b_c$ to $1.02\,b_c$: shadow edge, photon ring and higher-order
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
  could show a measured benefit. Direct integration already meets the frame-rate target with a
  wide margin: the 1920 x 1080 first pass with the disk takes 5.3 ms of GPU time against 33 ms for
  30 frames per second, and the anti-aliased image is complete after 12.8 ms. A table of
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
  the diagnostic `?maxdim` and `?budget`.
- **Keyboard and touch.** Single-key shortcuts work only while the view has focus (WCAG 2.1.4);
  every action is also a native button or checkbox, including orbit and zoom (Camera buttons in
  the Controls panel, a single-pointer alternative to dragging and pinching). Keys with Ctrl, Cmd
  or Alt are always left to the browser, toggles ignore auto-repeat, and Escape closes the most
  recently opened panel first. One key map (`src/ui/keymap.ts`) drives the handler, the canvas's
  `aria-keyshortcuts`, the key hints and the About table. Panels are bottom sheets, one at a time,
  up to 760 CSS px wide; above that, two 22rem panels fit side by side below the toolbar and end above the readouts. Focus rings pair the accent with a dark ring so they read on any image; the view's ring is an element drawn above the canvas, because a canvas's own outline shadow is painted under its WebGPU content.
- **Photosensitivity.** The two toggles that change the brightness of the whole image (disk and
  termination view) share one limiter, whether they come from keys, checkboxes or the URL: a
  change from rest applies at once, and later ones are coalesced so that consecutive changes are
  at least 500 ms apart, at most 3 in any one second and 2 flashes per second, below the 3 of
  WCAG 2.3.1. The controls and the URL show what was asked for; the image, the stats and the saved
  file show what is drawn.
- **No motion of its own.** There is no automatic camera motion and no CSS animation or
  transition anywhere, so `prefers-reduced-motion` needs no separate code path.
- **About** (`src/ui/about.ts`): a native modal dialog with the brief's honesty note first, what
  the image shows and its limits, what each line means, the units, the controls, a privacy
  statement (no analytics, cookies or storage, nothing loaded from other sites, the view kept in
  the part of the address after #) and links to these documents on GitHub. It states no numbers.
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
  has been tested by hand yet.

## 14. Stage 5 decisions

- **Hashed assets.** Everything in `dist/` except `index.html` and `favicon.svg` carries a
  content hash. Vite names the JS and the CSS; the four gallery images moved from `public/` to
  `src/ui/gallery/` and are imported by `src/ui/unsupported.ts`, so the build hashes them too, and
  a misspelt name fails the build (the `new URL(...)` form only warns). The favicon stays in
  `public/` under its own name: Chrome fetches it by itself, and Chrome 156 asks for it again
  after every change of the hash (measured), and GitHub Pages sends `cache-control: max-age=600`
  for every file (measured on other github.io sites), so a hash would buy no caching. What hashing
  does buy here: names change exactly when content changes, and `dist/` follows one rule that the
  build checks. `PUBLIC_FILES` in `tools/dist-rules.ts` lists what may sit in `public/` (only
  `favicon.svg`); Stage 6 adds the social preview image to it on purpose.
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
    the two repository links in `src/ui/links.ts`), no `data:` URI in media-type form (a bare
    `data:` also matches minified properties such as `{data:r}`), and in CSS no `@import` and
    `url()` only to files in `dist/`.

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
  `@smoke` marks 14 page tests that cover loading, keyboard control, the unsupported page, the
  URL state with hostile input, About, the Validation panel and saving.
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
  - Safari and Firefox have not run against the policy and Trusted Types: Safari is checked by
    hand at the Stage 5 check-in, and Firefox is not installed on the development machine;
  - what GitHub Pages serves compressed, and whether builds are byte-identical across machines.
