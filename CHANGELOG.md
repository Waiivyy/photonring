# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

No version has been released and the page is not deployed yet; everything below is on the `main`
branch.

### Added

- **Physics library** (`src/physics/`): TypeScript in double precision with no DOM, GPU or file
  system code, so the same code runs in Node, in the browser and in the tests. It covers the
  horizon, the photon sphere, the ISCO and the critical impact parameter; light rays integrated on
  the Binet equation with classical RK4, an exact capture criterion and the crossings of the disk
  plane; the deflection angle by two independent reference methods, checked against the weak-field
  series and the strong-field logarithmic law; the size of the shadow seen by a static observer;
  the redshift of a thin disk on circular orbits (Doppler and gravitational); blackbody colour; a
  deterministic procedural star field; and where circles in the disk plane appear through the bent
  light. Derivations and references are in [docs/PHYSICS.md](docs/PHYSICS.md).
- **Physics tests** (`npm test`, Vitest): the Node-side checks of
  [docs/VALIDATION.md](docs/VALIDATION.md), among them the photon sphere, the ISCO and the critical
  impact parameter $b_c$; the orbit roots; the deflection angle against the reference integrals,
  the weak-field series and the strong-field law; conserved quantities and convergence; disk
  crossings; redshift; the size of the shadow; the camera; and no NaN or Inf for rays at the hole,
  along the polar axis and from both distance limits. The deflection integrated by each of the
  three integrators is compared with the reference integrals for impact parameters from 1.01 to
  1000 $b_c$, in double precision and in the emulation of single precision.
- **Measured values by command** (`npm run measure`): the tests record the values they check
  against their tolerances. This covers the orbit, deflection, integrator, redshift and shadow
  tests, ray tracing (mirror pixel pairs, $\lvert L_z/E\rvert / b$ and continuity at a mass of
  $10^{-9}$), lensing, the overlay geometry, the star field, Gauss-Legendre quadrature and
  Carlson's elliptic integral, colour, the camera and the interface contrast; some checks, such as
  the disk-crossing radii, are not recorded yet, and the GPU tests record nothing.
  `npm run measure` runs the Vitest suites with `MEASURE=1` and prints the worst recorded value of
  each check with its test file, without the tolerance. [docs/VALIDATION.md](docs/VALIDATION.md)
  cites it for the measured values it prints.
- **Integrator study** (`npm run spike`): three integrators compared in double precision and in an
  emulation of single precision, which chose the integrator and step size the GPU uses
  ([docs/DESIGN.md](docs/DESIGN.md), section 3).
- **CPU reference renderer** (`npm run render:cpu`): renders in Node with its own PNG encoder on
  `node:zlib`, gives the same bytes for the same settings, and measures the shadow radius in its
  images against the analytic formula.
- **Golden images** of the CPU renderer, compared on decoded pixels with a documented tolerance.
  `npm run golden:update` reports what changed and overwrites a golden only for the names passed
  with `--accept`, or with `--accept-all`.
- **WebGPU renderer**: WGSL compute shaders trace the ray of every pixel in single precision and
  show the black hole's shadow and the lensed star field, whose light is blueshifted for the
  static observer. A termination view colours each pixel by how its ray ended. The image is
  computed in tiles within a time budget per frame, at the view's size in device pixels, reduced
  to fit the GPU's texture limit and a pixel budget.
- **GPU against CPU parity tests** (`npm run test:gpu`): the shipped shader code runs in headless
  Chrome on fixed sets of rays and images and is compared with the physics library and the CPU
  reference: how each ray ends, escape directions, deflection, disk crossings, colour and
  anti-aliasing ([docs/VALIDATION.md](docs/VALIDATION.md)). A robustness test
  (`tests/gpu/robustness.spec.ts`) checks that no GPU result is NaN or Inf or stops at the step
  limit, for rays aimed at the hole, along the polar axis (exactly and tilted by as little as
  $10^{-12}$) and from cameras at both distance limits (5 M and 200 M), with and without the disk.
- **Page tests** (`npm run test:e2e`, Playwright in Chrome): the controls, keyboard, touch
  (emulated), layout, motion, URL state, overlays, the Validation panel, About, saving an image and
  the page for browsers without WebGPU, on the dev server and on the build
  (`npm run test:e2e:build`).
- **Accretion disk**: a thin disk with blackbody colour, Doppler beaming and gravitational
  redshift, tone mapping, and every crossing of the disk plane, so that its higher-order images
  and the photon ring appear. Opacity is a renderer setting; the page shows an opaque disk.
- **Adaptive anti-aliasing**: a second pass supersamples only the pixels near the shadow edge and
  the photon ring and the pixels that differ visibly from a neighbour.
- **Progressive rendering**: while the view changes, every frame shows a complete image (a
  reduced-resolution preview when the full image does not fit the frame's time budget); once the
  view is still, the full-resolution image and then its anti-aliasing are computed tile by tile.
- **Benchmarks** (`npm run bench:gpu`): GPU time per rendering stage, from timestamp queries where
  the browser offers them ([docs/PERFORMANCE.md](docs/PERFORMANCE.md)). The page falls back to
  wall-clock timing without them.
- **Device loss and unsupported browsers**: a lost GPU device shows the reason and a Restart
  button; a browser without WebGPU gets the reason, the supported browsers and a gallery of images
  from the CPU renderer.
- **Overlays**: the shadow edge, and the lensed images of the circles at 2M, 3M and 6M in the disk
  plane (Horizon, Photon sphere and ISCO), computed with the physics library and drawn as vector
  lines over the image, with a legend.
- **Validation panel**: measures the shadow radius on an offscreen render of the current view and
  compares it with the analytic value and its tolerance. It also shows how many rays reached the
  step limit and the largest disagreement with the analytic edge.
- **Shareable views**: the camera, the disk, anti-aliasing, the view mode, the overlays and
  whether the Validation panel is open are kept in the part of the URL after `#`, in a versioned
  format. The parser never throws: it clamps or replaces hostile, huge and malformed values, never
  places the camera at or inside the horizon, and says once that a link was adjusted.
- **Controls**: drag to orbit, scroll or pinch to zoom, single-key shortcuts while the view has
  focus (`?` lists them), and a native button or checkbox for every action, in the toolbar or in the Controls panel, including orbit and zoom.
- **Save image**: downloads the settled, full-quality image as a PNG file made on the device, with
  the visible overlays and a legend, named after the view it shows.
- **About dialog**: the honesty note, what the image shows and its limits, what each line means,
  the units, the controls and the privacy statement.
- **Accessibility**: focus rings that read on any image; shortcuts that leave every key with Ctrl,
  Cmd or Alt to the browser; a limiter that keeps changes of the whole image's brightness (the disk
  and termination view toggles) at least 500 ms apart, within the three-flashes-per-second limit of
  WCAG 2.3.1; no automatic motion or animation; an accessible name for the canvas that describes
  the drawn view, and announcements in one polite live region. No screen reader has been tested by
  hand yet.
- **Privacy**: no analytics, telemetry, cookies or storage, and nothing loaded from other sites.
- **Production build** (`npm run build`): a type check, content-hashed file names and structural
  checks of `dist/` (relative paths, no inline code, an allowlist for absolute URLs) in every
  build. `npm run size` reports the download sizes.
- **Content-Security-Policy** in the built page: `default-src 'none'`, `'self'` only for scripts,
  styles and images, and Trusted Types required. The page tests also run against the build, where
  any policy violation fails them, and an offline test (`npm run test:dist`) checks that the built
  page requests nothing beyond its own files.
- **Continuous integration** on GitHub Actions for every push to `main`, every pull request and on
  demand: type check, lint, format check, the Vitest suites and the build on Ubuntu; the offline
  test and the smoke tests on the built page with Chrome's software WebGPU adapter (SwiftShader) on
  Ubuntu; the GPU parity tests and the full page suite on the build on a macOS runner's GPU.
  Third-party actions are pinned to commit SHAs.
- **Deploy workflow** for GitHub Pages (`.github/workflows/pages.yml`), started by hand only: it is
  set up to run the checks, build the page, run the offline test on that build and then publish
  that same build. It has not run yet.
- **README image** (`npm run render:hero`): the CPU reference renderer draws the page's opening
  view at 1600 x 900 with 3 x 3 samples per pixel into `docs/images/hero.png`, and writes nothing
  if a sample is not finite or the file is over its size budget. `npm run render:hero -- --candidates` renders four candidate views and a contact sheet into
  `artifacts/stage6/`, which git ignores.
- **Social preview image** `public/social-preview.png` (`npm run render:hero -- --social`): the
  same view at 1280 x 640 for link previews and the repository's social preview. The page never
  loads it, and the build checks allow it in `public/` by name.
- **EHT-style view** (key `B`): the toy disk's brightness at all frequencies, blurred to the
  20 μas resolution of the 2019 EHT images of M87* scaled to this hole (5.3 M), normalised from
  black to the brightest point and drawn in false colour with the afmhot formula, turned so that
  north is up as for M87* on the sky. A preset button, "Tilt 17°, as for M87*", sets the camera
  the EHT's models assume. Every place the view appears, saved images included, says "false
  colour" and "not a simulation of the EHT observation". Blur and colour run on the GPU after
  each frame (0.66 to 0.72 ms at 1920 x 1080) and in the CPU reference renderer, which agree
  within 1 level of 255 ([docs/PHYSICS.md](docs/PHYSICS.md), section 10d).
- **Photon subrings, measured**: a 64-bit solver for the image of a disk ring after any number of
  half-turns, checked against an independent quadrature and the ray tracer; GPU fans of rays that
  locate each band edge at 5, 30 and 200 M; and a photon subring view (key `N`) that shows the
  region just outside the shadow edge magnified and on a logarithmic scale, with the predicted
  band edges and the measured 32-bit limit. The spacing approaches $e^\pi$ as Gralla, Holz and
  Wald (2019) and Johnson et al. (2020) predicted: a reproduction, not a discovery
  ([docs/PHYSICS.md](docs/PHYSICS.md), section 6b).
- **Views as one choice**: colour, EHT-style, photon subrings and termination are a radio group
  in the Controls panel and the `view` key of a link; each view keeps its own cost estimate for
  the frame budget.
- **README gallery, diagrams and page screenshots**, with the tools that make them
  (`npm run render:readme`, `npm run shots:readme`, `npm run diagrams`), a step that copies only
  approved images into `docs/images/`, and a test of their sizes.
- **Text check for en-dashes**: `npm run lint` now also rejects U+2013.
- **Documentation**: [README.md](README.md) (what the page shows, how to run it, the controls,
  measured validation and performance numbers, browser support, limits, privacy, an FAQ and
  references), [docs/PHYSICS.md](docs/PHYSICS.md) (derivations and references),
  [docs/DESIGN.md](docs/DESIGN.md) (decisions and their reasons),
  [docs/VALIDATION.md](docs/VALIDATION.md) (every check, its tolerance and the measured result) and
  [docs/PERFORMANCE.md](docs/PERFORMANCE.md) (measured times, with the machine, browser and
  settings behind each benchmark).

### Fixed

- **Browser list on the page for browsers without WebGPU** (`src/ui/unsupported.ts`): the page
  showed the list from the October 2026 survey, which named Edge on ChromeOS (Edge has no ChromeOS
  version), gave no versions for Linux and did not limit NVIDIA GPUs to Wayland there, had no
  Android entry, missed visionOS and gave Firefox on Apple silicon Macs as 147 or later only. It
  now follows the table re-checked on 2026-11-02 in [docs/DESIGN.md](docs/DESIGN.md), section 4:
  Chrome or Edge 113 or later on Windows and macOS, Chrome 113 or later on ChromeOS; Chrome 144 or
  later on Linux with Intel Gen12 or newer GPUs, 147 or later with NVIDIA GPUs under Wayland;
  Chrome 121 or later on Android 12 or later with Qualcomm or ARM GPUs; Safari 26 or later on
  macOS Tahoe 26 and on iOS, iPadOS and visionOS 26, not on macOS Sequoia or Sonoma; Firefox 141
  or later on Windows, and on Macs with Apple silicon 145 or later on macOS Tahoe and 147 or later
  on older macOS.

[Unreleased]: https://github.com/Waiivyy/photonring/commits/main
