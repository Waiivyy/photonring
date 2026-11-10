# Physics specification and derivations

Every formula the code relies on is derived here, checked against a primary source, and covered by
a test in `tests/`. The references at the end were read in full or at the cited pages (journal
scans, arXiv full text, publisher, DLMF, NIST, CIE and W3C pages), except Darwin (1959), Figueroa
(1995) and Lindquist (1966), whose entries say so, and IEC 61966-2-1,
named only as the basis of the CSS Color 4 sample code. Papers read on arXiv are cited with the equation numbers of the arXiv
version their entry names; the journal versions were not compared.

## 1. Conventions

- Schwarzschild metric, geometric units G = c = 1:
  $ds^2 = -(1-2M/r)\thinspace dt^2 + (1-2M/r)^{-1}dr^2 + r^2 d\Omega^2$.
- Library functions take the mass `M` explicitly so the flat-space limit (M = 0) and scaling with
  M can be tested. The renderer uses M = 1, so lengths in the UI are in units of $GM/c^2$.
- $u = 1/r$. Primes on $u$ mean $d/d\phi$.

## 2. Null geodesics and the orbit equation

By spherical symmetry every geodesic lies in a plane through the origin; take it as the equatorial
plane. With affine parameter $\sigma$, the conserved energy and angular momentum are
$E = (1-2M/r)\thinspace dt/d\sigma$ and $L = r^2\thinspace d\phi/d\sigma$. The null condition gives

```math
\left(\frac{dr}{d\sigma}\right)^2 = E^2 - \left(1-\frac{2M}{r}\right)\frac{L^2}{r^2}.
```

With the impact parameter $b = L/E$ and $u = 1/r$:

```math
u'^2 = P(u) \equiv \frac{1}{b^2} - u^2 + 2Mu^3, \qquad u'' + u = 3Mu^2 .
```

(`orbitPolynomial` in `src/physics/orbits.ts`.) Both match the forms in the project brief.

**Photon sphere and $b_c$.** Turning points satisfy $V(r) = 1/b^2$ with the photon potential
$V(r) = (1-2M/r)/r^2$. $V'(r) = 0$ at $r = 3M$, $V(3M) = 1/(27M^2)$, so
$b_c = 3\sqrt{3} M \approx 5.196\thinspace M$. The photon orbit is Bardeen, Press and Teukolsky (1972), eq. (2.18) with
$a = 0$, and $b_c$ is Perlick and Tsupko (2022), eq. (8). $V''(3M) < 0$: the circular null orbit
is a maximum of $V$ and is unstable. Equivalently $P(1/3M) = P'(1/3M) = 0$ at $b = b_c$ (a double
root). Tested numerically by a golden-section search for the maximum of $V$.

**Instability rate.** Linearising $u'' = 3Mu^2 - u$ about $u = 1/(3M)$ gives
$\delta u'' = (6Mu - 1)\thinspace\delta u = \delta u$: perturbations grow as $e^{\phi}$, a factor
$e^\pi \approx 23$ per half orbit. Integration errors near $b_c$ are amplified by the same factor,
which is why near-critical rays are the hard case for any integrator. (This is the Lyapunov
exponent per radian of orbit; per unit coordinate time it is $1/(3\sqrt3 M)$, which follows from
eqs. (49) and (50) of Cardoso et al. 2009.)

**Exact capture criterion.** $u^2(1-2Mu)$ decreases for $u > 1/(3M)$, so along an inward path
($u' > 0$) inside the photon sphere $P(u)$ only grows and never vanishes: no turning point exists
and the photon reaches the horizon. The integrators therefore terminate a ray as captured as soon
as $u > 1/(3M)$ with $u' > 0$. This is exact, not a heuristic, and it costs nothing in the disk
render because the disk ends at the ISCO, outside $3M$.

## 3. Massive particles: circular orbits and the ISCO

For circular timelike orbits, $L^2 = Mr^2/(r-3M)$ (`circularOrbitAngularMomentumSq`; Bardeen,
Press and Teukolsky 1972, eq. 2.13 with $a = 0$), and

```math
\frac{d L^2}{dr} = \frac{M r (r-6M)}{(r-3M)^2},
```

so $L^2$ has its minimum at $r = 6M$ and orbits inside it are unstable: the ISCO is at $6M$
(Bardeen, Press and Teukolsky 1972, eq. 2.21). The angular velocity is
$\Omega = d\phi/dt = \sqrt{M/r^3}$ (their eq. 2.16 with $a = 0$). With
$u^\mu = u^t(1, 0, 0, \Omega)$, normalisation $u \cdot u = -1$ gives
$(u^t)^2[(1-2M/r) - r^2\Omega^2] = 1$, hence $u^t = (1 - 3M/r)^{-1/2}$.

## 4. Euclidean (Cartesian) form of the geodesic equation

Treat $(r, \phi)$ as polar coordinates of a Euclidean plane, $\mathbf{x} = r(\cos\phi, \sin\phi)$,
and choose a parameter $\lambda$ with $r^2\thinspace d\phi/d\lambda = h$ constant. For a central
acceleration $\mathbf{x}'' = F(r)\thinspace\hat{\mathbf{x}}$, Binet's formula gives
$F = -h^2u^2(u'' + u) = -3Mh^2u^4$, so

```math
\mathbf{x}'' = -\frac{3Mh^2\,\mathbf{x}}{r^5}, \qquad h = |\mathbf{x}\times\mathbf{x}'| .
```

The force is central, so $h$ is conserved and the motion stays in the plane of $\mathbf{x}$ and
$\mathbf{x}'$; the same equation therefore holds in 3D with no polar singularity. This verifies the
form in the brief.

**Affine parameter.** $r^2\thinspace d\phi/d\sigma = L$ and $r^2\thinspace d\phi/d\lambda = h$ give
$d\lambda/d\sigma = h/L$: $\lambda$ is an affine parameter, rescaled by a constant.

**Initial speed.** From section 2, $(dr/d\lambda)^2 = h^2[1/b^2 - (1-2M/r)/r^2]$ and
$r^2(d\phi/d\lambda)^2 = h^2/r^2$, so

```math
|\mathbf{x}'|^2 = h^2\left(\frac{1}{b^2} + \frac{2M}{r^3}\right),
```

which is the energy integral $\tfrac12|\mathbf{x}'|^2 - Mh^2/r^3 = h^2/(2b^2)$ of the potential
$-Mh^2/r^3$. The Euclidean speed is not constant, and the initial speed and direction together fix
$b$ through $1/b^2 = |\mathbf{x}'|^2/h^2 - 2M/r^3$. In particular, launching $\mathbf{x}'$ along
the pixel direction with unit speed does **not** reproduce what a local observer sees; see
section 6 for the correct mapping.

Note on the source of this trick: the write-up at rantonels.github.io/starless prints
`u''(φ) + u = (3/2) u^3` and a force proportional to $\hat r/r^5$, both of which are wrong as
written (the correct equations, in its units $2M = 1$, are $u'' + u = \tfrac32 u^2$ and
$\mathbf{F} = -\tfrac32 h^2\mathbf{x}/r^5$). Its `tracer.py` uses the correct form. No code from it
is used here.

## 5. Roots of the orbit polynomial

For $b > b_c$, $P(u) = 2M(u-u_1)(u-u_2)(u-u_3)$ with $u_1 < 0 < u_2 \le 1/(3M) \le u_3 < 1/(2M)$;
$u_2$ is the turning point of a ray from infinity. Substituting $u = 1/(6M) + w$ gives a depressed
cubic with three real roots $u_k = \frac{1}{6M} + \frac{1}{3M}\cos(\eta - 2\pi k/3)$, where
$\cos 3\eta = 1 - 54M^2/b^2$, that is $\eta = \tfrac23\arcsin(b_c/b) \in (0, \pi/3]$.

Written naively this loses all precision in both limits (roots merge at $b_c$; $u_2 \to 0$ for
large $b$). With $k = 1/(3M)$ and
$\vartheta = \pi/3 - \eta = \tfrac43\arcsin\sqrt{(b-b_c)/(2b)}$, the roots and their differences become

```math
u_{1,2} = k\sin^2\tfrac{\eta}{2} \mp \tfrac{\sqrt3}{2}k\sin\eta,\quad
u_3 = k(\tfrac12 + \cos\eta),
```

```math
u_3-u_2 = \sqrt3\,k\sin\vartheta,\quad u_2-u_1 = \sqrt3\,k\sin\eta,\quad
u_3-u_1 = \sqrt3\,k\cos(\eta-\tfrac{\pi}{6}),\quad \tfrac{1}{3M}-u_2 = k(\sin^2\tfrac{\vartheta}{2} +
\tfrac{\sqrt3}{2}\sin\vartheta).
```

`orbitRoots` computes whichever of $\eta$ or $\vartheta$ is small directly. Tests check the Vieta
relations ($\sum u_i = 1/(2M)$, $\prod u_i = -1/(2Mb^2)$, pairwise sum $= 0$) for
$b/b_c$ from $1 + 10^{-9}$ to $10^5$.

## 6. Static observer

The static observer at radius $r$ has the orthonormal frame
$e_{\hat t} = (1-2M/r)^{-1/2}\partial_t$, $e_{\hat r} = (1-2M/r)^{1/2}\partial_r$,
$e_{\hat\theta} = r^{-1}\partial_\theta$, $e_{\hat\phi} = (r\sin\theta)^{-1}\partial_\phi$.
A photon has local energy $E/\sqrt{1-2M/r}$ and local tangential momentum $L/r$, so its angle
$\psi$ from the radial direction satisfies

```math
\sin\psi = \frac{b}{r}\sqrt{1-\frac{2M}{r}} .
```

This is Synge (1966), eqs. (8) to (11), in his variables $\rho = r/2M$ and $\beta = 2M/b$: his
eq. (11), $\sin^2\psi = (\rho - 1)/(\rho^3\beta^2)$, expands to $(b^2/r^2)(1 - 2M/r)$.

**Shadow.** Rays with $b < b_c$ traced backwards are captured, so the shadow edge is at

```math
\sin\psi_{sh} = \frac{3\sqrt3\,M}{r_o}\sqrt{1-\frac{2M}{r_o}}, \qquad
\cos\psi_{sh} = \frac{(r_o-3M)\sqrt{r_o+6M}}{r_o^{3/2}},
```

measured from the direction to the black hole. The cosine follows from the factorisation
$r^3 - 27M^2r + 54M^3 = (r-3M)^2(r+6M)$; its sign selects $\psi_{sh} > \pi/2$ inside the photon
sphere, and `shadowAngularRadius` uses `atan2` of the pair, which stays accurate at $r_o = 3M$.
This matches Perlick and Tsupko (2022), eqs. (6) and (7), and Synge's escape-cone result (1966,
eq. 14; Synge treats emitters inside $3M$). It differs from the naive $\arcsin(b_c/r_o)$: at
$r_o = 30M$ it is $9.633°$ against $9.974°$, 3.4 % smaller (`npm run measure`). The brief's
formula is confirmed.

Far away, with $t = M/r_o$, the sine above and the arcsine series give
$\psi_{sh}r_o/b_c = 1 - t + 4t^2 - 14t^3 + \tfrac{304}{5}t^4 - 272t^5 + \tfrac{9024}{7}t^6 - \dots$,
with exact rational coefficients. Its first term is the $\theta_{sh} = b_c/D_d$ of papers that put
the observer at infinity, such as Bisnovatyi-Kogan and Tsupko (2022); the static observer sees
the shadow smaller by $M/r_o$ relative, to first order. A test checks `shadowAngularRadius`
against this series for $r_o$ from $10^2$ to $10^6M$: a consistency check of the formula, not an
outside check (`docs/VALIDATION.md`, Stage 8 cross-checks, A8).

**Local direction to Euclidean velocity.** A local unit direction $d$ has coordinate velocity
proportional to $(\sqrt{1-2M/r} d_{\hat r},\ d_{\hat\theta}/r,\ d_{\hat\phi}/(r\sin\theta))$, so
in the Euclidean picture of section 4

```math
\mathbf{x}' \propto d - \left(1 - \sqrt{1-2M/r}\right)(d\cdot\hat{\mathbf r})\,\hat{\mathbf r},
```

that is, the radial component shrinks by $\sqrt{1-2M/r}$ and tangential components are unchanged
(`localDirectionToEuclidean`). Check: for $d = (\cos\psi, \sin\psi)$, $h = r\sin\psi$ and
$|\mathbf{x}'|^2 = (1-2M/r)\cos^2\psi + \sin^2\psi$, and the energy integral gives
$1/b^2 = (1-2M/r)/(r^2\sin^2\psi)$, the same $b$ as above. A test checks that the shadow-edge
direction maps to exactly $b_c$ by this route.

## 6a. Lensed outlines and ring images (overlays)

**The shadow edge is the outline of the horizon and of the photon sphere.** Take a static
observer at $r_o > 3M$. With $P(u) = 1/b^2 - u^2(1-2Mu)$, the term $u^2(1-2Mu)$ has its maximum
on $(0, 1/(2M)]$ at $u = 1/(3M)$, where it equals $1/(27M^2) = 1/b_c^2$. So for $b < b_c$,
$P > 0$ everywhere and an inward ray runs through every radius $R \le 3M$; for $b > b_c$ the
turning point satisfies $u_2 < 1/(3M) \le 1/R$, so the ray never reaches $R$; $b = b_c$ only
approaches $3M$. Outward rays from $r_o > 3M$ never come back. Hence the view directions whose
backward rays reach a sphere $R \le 3M$ are exactly the open cone $\alpha < \psi_{sh}$ around
the direction to the hole, at every image order. A drawn "lensed horizon" or "lensed photon
sphere" would be the shadow-edge circle again, so the overlays draw the shadow edge once and say
so in its legend. A test traces rays half a pixel either side of the edge at five distances, with
capture at $3M$ and at $2.001M$ (`tests/unit/camera.test.ts`).

**What is drawn instead: images of circles in the disk plane.** For the horizon, photon sphere
and ISCO toggles the overlays draw where the circles $r = 2M$, $3M$ and $6M$ in the equatorial
plane appear through the bent light. The ISCO circle is the inner edge of the default disk. The
direct image of $r = 2M$ is the edge of the "inner shadow" for a disk that emits down to the
horizon (Chael, Johnson and Lupsasca 2021); photonring's disk stops at the ISCO, so no brightness
edge appears there in this render.

**Image order.** The image of order $n$ of a ring point is reached at the $(n+1)$-th crossing of
the disk plane along the backward ray, not counting the observer's own position: the same order
in which `traceRay` and the WGSL crossing log record crossings. For the image direction
$\theta$, measured from image right towards image up, the ray plane is spanned by $e_1$, the
direction from the hole to the observer (minus forward), and
$e_2 = \cos\theta\thinspace r + \sin\theta\thinspace u$, where $r$ and $u$ are the camera's right and up
vectors. The camera frame has a horizontal right vector and an up vector with $z$ component
$\cos\epsilon$ at elevation $\epsilon$, so the $z$ components are $\sin\epsilon$ for $e_1$
and $\sin\theta\cos\epsilon$ for $e_2$. The crossings are at $\phi_0 + n\pi$, where
`firstPlaneCrossingAngle` (shared with `traceRay`) gives $\phi_0$ from those two components.
The curves do not depend on the azimuth: a rotation about the disk axis turns the ring and the
camera together.

**The view angle of a ring point.** `ringImageAngle(r_o, R, sweep)` returns the angle $\alpha$
from the direction to the hole at which the observer sees the point of radius $R$ that the
backward ray reaches after sweeping the orbital angle `sweep`. With
$k = \sqrt{1-2M/r_o}/r_o$, $\sin\alpha = k\thinspace b$. Writing $\Phi(b; u_A, u_B)$ for the swept angle
over $[u_A, u_B]$ (section 8a below $b_c$, the Carlson form of section 8 above), the branches are:

- $R < r_o$, $R \le 3M$: only plunging rays reach $R$, and the inbound sweep
  $\Phi(b; u_o, u_R)$ grows from $0$ at $\alpha \to 0$ to infinity at $\alpha \to \psi_{sh}$,
  because $\partial_b P^{-1/2} = P^{-3/2}/b^3 > 0$ under the integral. Root in
  $x = \ln(\psi_{sh} - \alpha)$.
- $R < r_o$, $R > 3M$: let $b_t = R/\sqrt{1-2M/R}$ be the ray that turns exactly at $R$, and
  $\Phi_t = \Phi(b_t; u_o, u_R)$. For sweep $\le \Phi_t$ the root is on the inbound branch,
  $\alpha \in (0, \alpha_t]$ (plunging below $b_c$, scattering above; continuous at $b_c$ because
  the ray stays outside $3M$). Otherwise it is on the outbound branch,
  $\psi_{sh} < \alpha < \alpha_t$, with sweep $\Phi(b; u_o, u_2) + \Phi(b; u_R, u_2)$, from
  $\Phi_t$ to infinity; root in $x = \ln(\alpha - \psi_{sh})$.
- $R > r_o$ (the ISCO seen from $5M \le r_o < 6M$): outward rays ($\alpha \ge \pi/2$) sweep
  $\Phi(b; u_R, u_o)$; inward rays with $b > b_c$ turn and sweep
  $\Phi(b; u_o, u_2) + \Phi(b; u_R, u_2)$. The sweep falls from infinity at $\psi_{sh}$ to $0$ at
  $\pi$; root in $x = \ln(\alpha - \psi_{sh})$.
- $R = r_o$ (to $10^{-12}$ relative): outward rays never return, so
  $\psi_{sh} < \alpha \le \pi/2$ and the sweep is $2\thinspace\Phi(b; u_o, u_2)$.

Each branch is monotone, so every sweep has one root; the plunging branch is proved above, and
the other branches are checked numerically: a scan over 2000 view angles in six cases finds
exactly one sign change of $r(\text{sweep}) - R$.

**Numerics.** Brent's method (tolerance $10^{-15}$ in its variable, at most 100 iterations). A
branch's bracket is split once at its midpoint, and the half that holds the root is solved in a
variable measured from its own end, so angles very close to $0$, to $\pi$ or to the edge keep
full relative precision: $\ln\alpha$, $\ln(\pi - \alpha)$, $\ln|\alpha - \psi_{sh}|$, or
$\alpha$ itself at a regular end such as the fold. The far end of each bracket is a nearly
radial ray chosen from the sweep: for $b \le b_c/2$, $1/\sqrt{P} \le 1.155\thinspace b$, so
$b = \text{sweep}/(4\thinspace|u_R - u_o|)$ has a sweep below $0.29$ of the target, which makes the
solver valid down to the smallest sweeps. The near end is $10^{-13}\psi_{sh}$ from the edge; a
root closer than that is returned there. That happens only for observers within about $0.01M$
of the photon sphere, where $b(\alpha)$ is so flat near the edge that the root is a few ulps
from $b_c$. An impact parameter that rounds onto $b_c$ is moved one ulp to the side of its
branch, the second interval is clamped to zero length when rounding puts $u_2$ just below $1/R$
at the fold, and for $R$ so close above $3M$ that the outbound branch is narrower than
rounding, its images are the edge. `ringFoldSweep` gives the fold's sweep, so the overlay
curves can sample the outermost point of the ring image, which near edge-on views is narrower
than the uniform sampling.

**Checks** (`tests/unit/lensing.test.ts`). The radius reached at the target sweep agrees with
the Binet integrator (f64, $d\phi = 5\times10^{-4}$) within $10^{-9}$ relative for
$r_o \in \lbrace 5, 5.5, 6, 6.5, 10, 30, 200 \rbrace$, $R \in \lbrace 2, 3, 6 \rbrace$ and eight sweeps up to $2\pi$, and
with the exact elliptic-integral reference for $R = 6$. Sweeps from $10^{-14}$ to $10^{-11}$
match the radial-ray limit $b = \text{sweep}/|u_R - u_o|$ within $10^{-9}$. Observers from
$3.0001M$ to $3.5M$ with rings near $3M$ never make the solver throw. Images of $R \le 3M$ lie
inside the edge, and at a sweep of $4\pi$ every image is within $10^{-3}\psi_{sh}$ of it.

**Which orders are drawn.** Face-on at $30M$ (measured with `ringImageAngle`; the edge is at
$9.6327°$):

| Ring     | $n = 0$    | $n = 1$                                           |
| -------- | ---------- | ------------------------------------------------- |
| $r = 2M$ | $5.5291°$  | $9.3441°$                                         |
| $r = 3M$ | $7.5649°$  | $9.6244°$, $0.14$ px inside the edge at 1080 rows |
| $r = 6M$ | $13.4888°$ | $10.0728°$, the visible secondary disk edge       |

The overlays draw $n = 0$ for $2M$ and $3M$ (the $n = 1$ image of $3M$ would sit on the edge
line) and $n = 0$ and $n = 1$ for the ISCO.

## 6b. Photon subrings

Each image of the disk made by light that circled the hole once more (half a turn more) lies
closer to the shadow edge by a factor that tends to $e^{\pi} \approx 23.14$ in Schwarzschild
spacetime. This is a published prediction (Gralla, Holz and Wald 2019, eqs. 2 and 13 to 15;
Johnson et al. 2020, eqs. 7, 12 and 14, who attribute $\gamma = \pi$ to Luminet 1979; Gralla and
Lupsasca 2020, section IV.1, $\gamma \to \pi$ as the spin goes to zero). photonring reproduces it
with its own code: an independent check, not a new result. The leading-order law for where these
images lie, for a camera and a disk ring at finite distances, is published too (below).

**Image order, three spellings.** photonring's order $n$ is the image at the $(n+1)$-th crossing
of the disk plane (section 6a).

| photonring            | Gralla, Holz and Wald (2019) | Johnson et al. (2020)  |
| --------------------- | ---------------------------- | ---------------------- |
| $n = 0$, direct image | $m = 1$, direct              | $n = 0$                |
| $n = 1$               | $m = 2$, the lensing ring    | $n = 1$, first subring |
| $n \ge 2$             | $m \ge 3$, the photon ring   | $n \ge 2$              |

Johnson et al. (footnote 3) note that their indexing differs from Gralla, Holz and Wald's: in
their terms $n = 1$ is already a photon subring, while Gralla, Holz and Wald call it the lensing
ring and keep "photon ring" for $m \ge 3$. photonring says "subring $n$" with its own $n$.

**The outbound branch.** For $b > b_c$ the backward ray runs in from $u_o = 1/r_o$ to its turning
point $u_2$ and out again; it meets the disk plane at the sweeps $\phi_0 + n\pi$ (section 6a), so
the image of order $n$ of the ring $R$ is the root of

```math
\Phi(b) \equiv \int_{u_o}^{u_2}\frac{du}{\sqrt{P}} + \int_{u_R}^{u_2}\frac{du}{\sqrt{P}} = \phi_0 + n\pi .
```

$\Phi$ falls monotonically from infinity at $b_c$ to its value for the ray that turns at
$\max(u_o, u_R)$, so the root is unique. For the default disk's edges (6 and 20 M) and observers
at 5, 6.5, 30 and 200 M that smallest sweep is between 0.55 and 2.04 rad (computed with
`outboundSweep`), below $\pi$, so every image of order $n \ge 1$ lies on this branch.

**The critical orbit's sweep.** At $b = b_c$ the orbit polynomial factorises,
$P_c(u) = 2M\thinspace(u - \tfrac{1}{3M})^2\thinspace(u + \tfrac{1}{6M})$. The substitution
$u = -\tfrac{1}{6M} + \tfrac{1}{2M}\tanh^2 x$ gives $u + \tfrac{1}{6M} = \tanh^2 x/(2M)$ and
$u - \tfrac{1}{3M} = -(1 - \tanh^2 x)/(2M)$, so $\sqrt{P_c} = \tanh x\thinspace(1 - \tanh^2 x)/(2M)$,
while $du = \tanh x\thinspace(1 - \tanh^2 x)\thinspace dx/M$; hence $du/\sqrt{P_c} = 2\thinspace dx$. Integrating from
$u = 0$ ($\tanh x = 1/\sqrt3$) to $u$:

```math
\Delta\phi_c(u) = 2\left[\mathrm{artanh}\,\sqrt{2Mu + \tfrac13} - \mathrm{artanh}\,\tfrac{1}{\sqrt3}\right],\qquad 0 \le u < \tfrac{1}{3M}.
```

Values: $\Delta\phi_c(1/30) = 0.174038$, $\Delta\phi_c(1/20) = 0.262589$,
$\Delta\phi_c(1/6) = 0.975474$ (`criticalOrbitSweep`). It diverges at the photon sphere, where the
critical orbit circles forever.

**Leading order: a published law.** For a ray from infinity to infinity, Bozza's law (section 8)
gives $\Phi_{\infty\infty} = \pi + \alpha = -\ln\varepsilon + \ln C + O(\varepsilon\ln\varepsilon)$
with $\varepsilon = b/b_c - 1$ and $C = 216(7 - 4\sqrt3) = 15.5081$. Bozza and Scarpetta (2007)
extended the strong deflection limit to a source and an observer at any distance. For the
Schwarzschild metric their eqs. (65) to (68) give, in the notation here (they write $D_{OL}$ and
$D_{LS}$ for $r_o$ and $R$), the total sweep

```math
\Phi = -\ln\frac{\varepsilon}{\eta_o\,\eta_R} + 5\ln 6 - 2\ln\left(3 + \sqrt{3 + 18Mu_o}\right) - 2\ln\left(3 + \sqrt{3 + 18Mu_R}\right),\qquad \eta = 1 - 3Mu .
```

Per leg, with $s = \sqrt{1/3 + 2Mu}$: $\sqrt{3 + 18Mu} = 3s$ and $1 - 3Mu = \tfrac32(1 - s^2)$, so
$\eta\thinspace 6^{5/2}/(3 + 3s)^2 = 6^{3/2}(1 - s)/(1 + s)$. The formula for $\Delta\phi_c$ above
gives $e^{-\Delta\phi_c(u)} = (2 + \sqrt3)(1 - s)/(1 + s)$, and $\sqrt C\thinspace(2 + \sqrt3) = 6^{3/2}$
because $7 - 4\sqrt3 = (2 - \sqrt3)^2$. With the sweep $\Phi = \phi_0 + n\pi$ to the image of order
$n$, their law is therefore

```math
\varepsilon_n(R) \approx C\,e^{-\Delta\phi_c(u_o) - \Delta\phi_c(u_R)}\,e^{-\phi_0}\,e^{-n\pi}
```

(`subringOffsetLeadingOrder`, checked numerically below). The form with $\Delta\phi_c$ shows where
the constants come from: each leg carries half of Bozza's $\ln C$, minus the critical orbit's sweep
between infinity and the leg's finite end, where the leg's own sweep differs from it only by
$O(\varepsilon)$ because the integrand is smooth there. Later papers applied the same law to the
images of a disk. Aldi and Bozza (2017, section 3, eqs. 3.22 to 3.28) treated an inclined disk
seen from far away; the factor of the ring radius in their eq. (3.23), in units $2M = 1$, is
$C\thinspace e^{-\Delta\phi_c(u_R)}$. Bisnovatyi-Kogan and Tsupko (2022, eqs. 8 to 16) gave the
radii of the rings of a disk seen face-on from far away, citing Bozza and Scarpetta and two
later papers of Bozza's for the law.
Tsupko (2022, eq. 18) gave the shape of a ring's images for any inclination and, in his
Appendix A, derived the same curve from Aldi and Bozza's results. Aratore, Tsupko and Perlick
(2024, eq. 10, which they credit to Bozza and Scarpetta) wrote the law for any asymptotically
flat, static, spherically symmetric metric with a photon sphere, with the observer's distance
kept, before taking it to infinity. In those papers
the view enters through the sweep each image needs; here, through $\phi_0$ (section 6a).

This formula carries the main consequences: successive offsets of one edge, and so the widths of the
bands, shrink by $e^{\pi}$ per half-turn; on a $\log_{10}\varepsilon$ axis the bands repeat every
$\pi/\ln 10 = 1.364$ decades; and the view enters only through $\phi_0$, which is $\pi/2$ along the
horizontal image axis at every elevation. ($C\thinspace b_c = 1944M/(12 + 7\sqrt3) = 80.58M$ is Gralla, Holz
and Wald's $C_+$.) Its error is $-2.4$ %, $-0.28$ % and $-0.019$ % at $R = 6M$ for $n = 1$
to 3 face-on at $30M$, and within $0.304\thinspace\varepsilon\thinspace(\ln(1/\varepsilon) + 2)$ for $n = 1$ to 5
in the five view directions of the test, at both disk edges.

**The next term, derived here.** The sources read state no general error bound for this law.
Tsupko (2022, section III D) shows errors from his own ray integration for $n = 2$ (his Figs. 6
and 7, and a 2.0 % error in the area of the image of a face-on disk from 6 to 30 M), and Bozza
and Scarpetta (2007, Fig. 4b) find that the error of a ring's angular radius stays of order
$\varepsilon^2$. A test of the exact solver against the published law needs the size of that
error, so the next term of the expansion was derived here. It was not found in the sources read:
Bozza (2002), Bozza and Scarpetta (2007), Iyer and Petters (2007, who give it for a source and an
observer at infinity, below), Aldi and Bozza (2017, section 3 only), Bisnovatyi-Kogan and Tsupko
(2022), Tsupko (2022) and Aratore, Tsupko and Perlick (2024), in the parts the References list.
In units $M = 1$ put $y = \tfrac13 - u$ and $F(y) = y\sqrt{1 - 2y}$. Then $P_c = F^2$ and
$P = F^2 - \eta$ with $\eta = \tfrac{1}{27} - 1/b^2 = (2\varepsilon - 3\varepsilon^2 + \dots)/27$.
One leg, from $u_A$ to the turning point, sweeps, with $w = F(y)$ and $G = dy/dw$,

```math
L(y_A) = \int_{\sqrt\eta}^{w_A}\frac{G(w)\,dw}{\sqrt{w^2 - \eta}},\qquad G(w) = 1 + 2w + \tfrac{15}{2}w^2 + H(w),\quad H(w) = O(w^3),
```

because inverting $w = y - y^2 - \tfrac12 y^3 + \dots$ gives $y = w + w^2 + \tfrac52 w^3 + \dots$.
The first three terms integrate in closed form: $1$ gives
$\mathrm{arcosh}(w_A/\sqrt\eta) = \tfrac12\ln(1/\eta) + \ln(2w_A) - \eta/(4w_A^2) + \dots$; $2w$
gives $2\sqrt{w_A^2 - \eta}$, so no $\sqrt\eta$ term appears; and $\tfrac{15}{2}w^2$ gives the
only $\eta\ln\eta$ term, $\tfrac{15}{8}\thinspace\eta\ln(1/\eta)$. In $H$, odd powers of $w$
integrate to functions regular in $\eta$, and even powers start at $\eta^2\ln\eta$. So

```math
L = \tfrac12\ln\tfrac1\eta + K(y_A) + \tfrac{15}{8}\,\eta\ln\tfrac1\eta + d(y_A)\,\eta + O(\eta^2\ln\eta) + O(\eta^2/w_A^4),
```

```math
K(y_A) = 2\ln 2 - 2\,\mathrm{artanh}\sqrt{1 - 2y_A},\qquad
d(y_A) = -\tfrac{15}{8} + \tfrac{15}{4}\ln 2 + \tfrac12\left[\mathrm{Reg}(y_A) - \frac{1}{2y_A^2} - \frac{3}{y_A} + \tfrac{15}{2}\ln y_A - 4\right],
```

```math
\mathrm{Reg}(y_A) = \int_0^{y_A}\left[\frac{1}{y^3(1 - 2y)^{3/2}} - \frac{1}{y^3} - \frac{3}{y^2} - \frac{15}{2y}\right]dy .
```

Three checks: $K(y_A) - K(\tfrac13) = -\Delta\phi_c(u_A)$; $\ln\tfrac{27}{2} + 2K(\tfrac13) = \ln C$,
Bozza's constant; and $d(y_A) - d(y_B) = \tfrac12\int_{y_B}^{y_A}dy/F^3$, the $\eta$-derivative
of a regular integral, which a direct quadrature of $P_c^{-3/2}$ confirms. Summing the two legs
and expanding $\eta$ in $\varepsilon$ gives

```math
\Phi = -\ln\varepsilon + \ln\tfrac{27}{2} + K(y_o) + K(y_R) + \tfrac{5}{18}\,\varepsilon\ln\tfrac1\varepsilon + D\,\varepsilon + \rho,\qquad
D = \tfrac32 + \tfrac{5}{18}\ln\tfrac{27}{2} + \tfrac{2}{27}\left[d(y_o) + d(y_R)\right].
```

The first four terms are the published law, $-\ln\varepsilon + \ln C - \Delta\phi_c(u_o) - \Delta\phi_c(u_R)$,
so at the same sweep

```math
\ln\frac{\varepsilon}{\varepsilon_{pub}} = \tfrac{5}{18}\,\varepsilon\ln\tfrac1\varepsilon + D\,\varepsilon + \rho .
```

- **$c = 5/18$ for any end radii.** Each leg contributes
  $\tfrac{15}{8}\cdot\tfrac{2}{27}\thinspace\varepsilon\ln(1/\varepsilon) = \tfrac{5}{36}\thinspace\varepsilon\ln(1/\varepsilon)$,
  whatever its end. Stage 7 found this for finite radii from computed values and called it a
  fit; it is now derived.
- **At infinity it is a published series.** With $b' = 1 - b_c/b = \varepsilon - \varepsilon^2 + \dots$,
  Iyer and Petters (2007, eqs. 25 and 27) give $D(\infty, \infty) = 1 + \tfrac{5}{18}\ln\lambda_0 + \rho_1 = 1.20194535$,
  with $\lambda_0 = C$ and $\rho_1 = (-17 + 4\sqrt3)/18$. The closed form above gives the same
  to $2.2\times10^{-16}$.
- **Values**, written $D(r_o, R)$ and computed with `nextOrderD` in
  `tests/helpers/strong-deflection.ts`: $D(\infty, 6M) = -0.07797$, $D(\infty, 20M) = 0.93363$,
  $D(30M, 6M) = -0.25369$, $D(30M, 20M) = 0.75791$.
- **The remainder.** Per leg the next terms are powers of $\eta/w_A^2$, from the expansion of the
  arcosh, and $\eta^2\ln\eta$. With $z_A = 2\varepsilon/(27\thinspace F(y_A)^2)$ the tests bound
  $\lvert\rho\rvert$ by $B = \varepsilon^2\ln(1/\varepsilon) + z_o^2 + z_R^2 + 10^{-15}/\varepsilon$, where the
  last term is the f64 floor of $\varepsilon$ (Solver, below). The form of $B$ is derived; its
  coefficient 1 is a choice. Over the 6796 cases of the test (observers at 5, 30, 200 and
  1000 M and at infinity, rings from 3.1 to 30 M, $n = 1$ to 5, 21 phases, three solver routes)
  $\lvert\rho\rvert$ is at most 0.19 of $B$. The $z$ terms grow as the ring nears the photon
  sphere, where $F(y_R) \to 0$.
- **The branch.** The expansion is for rays that turn between the two ends: the outbound branch
  of section 6a. Near the photon sphere a low order can lie on the inbound branch even where $B$
  is small: at $R = 3.1M$, an observer at $30M$, $n = 1$ and $\phi_0 = 3\pi/16$,
  $B = 6.5\times10^{-4}$ but $\rho = -5.09$ (computed with `subringOffset`). Aratore, Tsupko and
  Perlick note this limit too: the law holds only from an order that grows without bound as $R$
  approaches $3M$. The test checks the branch explicitly: this case is on its grid, and the test
  fails if the guard is removed.
- **The law as published.** For a polar observer at infinity and $n = 2$ the published
  $\varepsilon$ is too small by 0.37 % at the ISCO and by 1.13 % at 20 M, which is
  $8.3\times10^{-6}$ and $5.25\times10^{-5}$ of the angular radius. Over all the test's cases its
  worst error in $\varepsilon$ is 5.3 % at $n = 1$, 4.3 % at $n = 2$, 0.35 % at $n = 3$,
  $1.5\times10^{-4}$ at $n = 4$ and $7.6\times10^{-6}$ at $n = 5$.

**How fast the ratio approaches $e^{\pi}$.** Write
$\Phi = -\ln\varepsilon + K + c\thinspace\varepsilon\ln(1/\varepsilon) + D\thinspace\varepsilon + \dots$. The step
$\Phi(\varepsilon_{n+1}) - \Phi(\varepsilon_n) = \pi$ then gives
$\delta_n \equiv (\varepsilon_n/\varepsilon_{n+1})/e^{\pi} - 1 \approx (1 - e^{-\pi})\thinspace c\thinspace\varepsilon_n\ln(1/\varepsilon_n) + A\thinspace\varepsilon_n$,
with $A = (1 - e^{-\pi})\thinspace D - c\thinspace\pi e^{-\pi}$. For rays from infinity $c = 5/18$
(Iyer and Petters 2007, eq. 25, section 8), and by the derivation above $c = 5/18$ for any
observer and ring. Stage 7 fitted $A$ to the computed ratios with that $c$ and found it constant
to three or four digits ($-0.28$ at $6M$, $+0.69$ at $20M$, $\lvert A\rvert \le 0.72$ including
$n = 1$); with $D(30M, 6M)$ and $D(30M, 20M)$ the formula gives $-0.2804$ and $+0.6874$. The test
bound $\lvert\delta_n\rvert \le \tfrac{5}{18}\varepsilon_n\ln(1/\varepsilon_n) + 1.5\thinspace\varepsilon_n$
covers both terms and stays as Stage 7 set it: its 1.5 is a margin above the fitted
$\lvert A\rvert$, and its first term is larger than the leading one by $1/(1 - e^{-\pi}) = 1.045$.

**Solver.** `outboundImageOffset(u_o, u_R, sweep)` solves $\Phi = \text{sweep}$ by Brent's method
(section 6a) in $\ln\varepsilon$, so $\varepsilon$ keeps full relative precision, with $\Phi$ from
the Carlson form of section 8 and the bracket started at the leading-order estimate; $u = 0$ means
infinity. `ringImageOffset(r_o, R, sweep)` uses it whenever the sweep is beyond the branch's
smallest value and otherwise converts the result of `ringImageAngle` with
$\varepsilon = \sin\alpha/(k\thinspace b_c) - 1$; `subringOffset` passes $\phi_0 + n\pi$. The offsets are
computed by the 64-bit library; they are predictions of the model, not measurements of an image.
The limit of f64: $b = b_c(1 + \varepsilon)$ moves in steps of one unit in the last place, about
$1.7\times10^{-16}\thinspace b_c$, so $\varepsilon$ is resolved only to about $2\times10^{-16}/\varepsilon$
relative, and roots below $\varepsilon = 10^{-14}$ are refused (order 12 face-on at $30M$ is near
$10^{-16}$). Ratios are therefore checked up to $n = 4$, which uses $\varepsilon_5$.

Computed by the 64-bit library, face-on at $30M$, default disk:

| $n$ | $\varepsilon_n(6M)$   | $\varepsilon_n(20M)$  | $\varepsilon_n/\varepsilon_{n+1}$ at $6M$ | at $20M$ |
| --- | --------------------- | --------------------- | ----------------------------------------- | -------- |
| 1   | $4.5223\times10^{-2}$ | $1.0324\times10^{-1}$ | 23.6451                                   | 26.2983  |
| 2   | $1.9126\times10^{-3}$ | $3.9256\times10^{-3}$ | 23.2018                                   | 23.3375  |
| 3   | $8.2433\times10^{-5}$ | $1.6821\times10^{-4}$ | 23.1449                                   | 23.1524  |
| 4   | $3.5616\times10^{-6}$ | $7.2653\times10^{-6}$ | 23.1409                                   | 23.1413  |
| 5   | $1.5391\times10^{-7}$ | $3.1395\times10^{-7}$ |                                           |          |

$e^{\pi} = 23.1407$. The $n = 1$ ring is the only one far from the limit; from $n = 2$ on, each
further subring brings the ratio at least 12.7 times closer to it (smallest factor over the five
view directions and both edges). With the page's opaque disk tilted 12 degrees, the near side of the
disk hides the subrings over most of the lower half of the image.

**The strip (the page's photon subring view).** A magnified, unrolled image of the region just
outside the shadow edge (`src/physics/strip.ts`). Column $x$ of a strip $W$ wide is the image
angle $\theta = 2\pi x/W$, from image right towards image up; row $y$ of a strip $H$ tall is
$\log_{10}\varepsilon = t - y\thinspace(t - u)/H$, from $t = \min(0.5, \log_{10}\varepsilon_{max})$ down to
$u = -7.5$, where $\varepsilon_{max} = 1/(k\thinspace b_c) - 1$ is the largest offset seen at all
($\sin\alpha = 1$; $-0.616$ at 5 M). The direction of a strip pixel is
$\cos\alpha\thinspace\text{forward} + \sin\alpha\thinspace(\cos\theta\thinspace\text{right} + \sin\theta\thinspace\text{up})$
with $\sin\alpha = k\thinspace b_c(1 + \varepsilon)$. On this scale the bands of the subrings have nearly
the same height (face-on at 30 M: 0.358 decades for $n = 1$, 0.312 for $n = 2$, 0.310 from
$n = 3$ on; the direct image's band is 0.819) and successive bands are $\pi/\ln 10 = 1.364$
decades apart. The GPU gets $(\cos\theta, \sin\theta)$ per
column and $(\cos\alpha, \sin\alpha)$ per row from tables computed in f64, and the tracer takes
$\sin\psi$ from them directly instead of from the length of $d - \cos\psi\thinspace e_1$, a difference of
nearly equal numbers: that difference limits the ordinary image to about $10^{-7}$ to $10^{-6}$ in
$\varepsilon$ (more at 200 M, `docs/VALIDATION.md`), while the strip's limit, measured on the Apple
M5 from its order 3 and 4 edges, is about $1.2\times10^{-7}$ at 5 M, $1.7\times10^{-7}$ at 30 M and
$2.5\times10^{-7}$ at 200 M (an estimate from four edges per distance). The page draws a dashed
"32-bit limit" line there, interpolated in $\log r$ and $\log\varepsilon$, and the band edges the
64-bit library predicts for the disk's inner and outer radius, orders 0 to 5, every 2 degrees of
$\theta$ (`subringOffset` for $n \ge 1$, `ringImageAngle` for the direct image).

**Checks** (`tests/unit/subrings.test.ts`; measured values in `docs/VALIDATION.md`). The solved
root satisfies the same sweep evaluated with the Gauss-Legendre quadrature of section 8, which
shares no code with the Carlson form; the backward ray traced by `traceRay` (f64,
$d\phi = 0.002$) crosses the disk plane at $R$ on crossing $n + 1$; the result agrees with
`ringImageAngle`, a consistency check only, since both use the Carlson integrals;
$\Delta\phi_c$ matches a quadrature of $1/\sqrt{P_c}$; with observer and source at infinity the
boundaries of Gralla, Holz and Wald round to their published 5.02, 5.19, 5.23 and 6.17 M (computed
5.0151, 5.1878, 5.2279 and 6.1676 M; the two below $b_c$ from the plunging sweep of section 8a);
and the escape sweep from $30M$ grows by one radian per factor $e$ in $1/\varepsilon$
(least-squares slope against $\ln\varepsilon$ over $10^{-6}$ to $10^{-3}$).

**Checked against the papers** (`tests/unit/published-rings.test.ts`, Stage 8; the papers'
formulas are transcribed in `tests/helpers/strong-deflection.ts`, which imports nothing from
`src/physics`; measured values in `docs/VALIDATION.md`). Bisnovatyi-Kogan and Tsupko's eq. (15),
Bozza and Scarpetta's eqs. (65) to (68), and Aratore et al.'s eq. (10) with the observer kept
(their $k_O$ from eq. 34 at $\eta_O$) equal `subringOffsetLeadingOrder` to rounding. Tsupko's
eq. (18) sweeps $(n + 1)\pi - \arccos(\sin\varphi/\sqrt{\sin^2\varphi + \cot^2\vartheta_O})$ for an
observer at $\vartheta_O$ from the disk axis and a screen angle $\varphi$ counterclockwise from
the horizontal axis; this equals $\phi_0 + n\pi$ with $\vartheta_O$ equal to 90 degrees minus the
camera's elevation and $\varphi$ the image angle of section 6a, and in both the top of the image
has the larger sweep. These are identities: they show that photonring and the papers use the
same law, and they cannot fail on their own. The tests that can fail are the exact solver against
the published law plus the next term, and three numerical results of the papers that photonring
reproduces: Tsupko's Fig. 6 ($b_{exact} - b_{analytic}$ for sweeps of $2\pi$, $5\pi/2$ and $3\pi$,
digitized), Bisnovatyi-Kogan and Tsupko's solid angles of the $n = 0$ and $n = 1$ images of a disk
from 6 to 15 M (their eqs. 50 and 51), and Tsupko's 2.0 % area error.

**A misprint in Tsupko (2022).** His eqs. (23), (24) and (27) in arXiv v2 print
$e^{-(n+1)\pi/2}$. His eq. (18) at $\vartheta_O = 0$, Bisnovatyi-Kogan and Tsupko's eq. (15) and
his own text (a sweep of $5\pi/2$ for $n = 2$) give $e^{-(n+1/2)\pi}$, which photonring follows.
The journal version was not checked.

**Range.** The papers state the law for $n \ge 2$. At $n = 1$ it is off by up to 5.3 % in
$\varepsilon$ (above), and the tests use it at $n = 1$ only where $B \le 0.01$. Order 0 is outside
the papers' stated range: the direct image of a disk ring outside the ISCO, seen face-on, lies on
the inbound branch, with no turning point, and the formula gives an angular radius 1.66 times the
exact one at 6 M and 0.862 times at 20 M (observer at infinity; computed with the 64-bit library,
not a test). Order 0 is checked by Bisnovatyi-Kogan and Tsupko's eq. (50) and by the outside code
below.

**Against an outside code** (`tests/unit/cross-check.test.ts`, Stage 8; `docs/VALIDATION.md`,
"Outside code: kgeo"). The radius at every disk-plane crossing of `traceRay`, the number of
crossings, the ring images of `subringOffset`, the redshift of the Keplerian disk and the
critical curve agree with kgeo (A. Chael), a Kerr ray tracer in Python run at spin 0, for
observers at 100 and 1000 M, within tolerances built from kgeo's error measured against its own
ODE oracle and from photonring's own error terms. The exception is the radii just inside the
critical curve ($b_c - b < 2\times10^{-9}b_c$): there kgeo's radii are off by up to 30 % (scipy's
`ellipj` near $m = 1$), and photonring is compared with kgeo's ODE oracle instead.

## 7. The Binet form used for integration

The planar orbit equation $u'' = 3Mu^2 - u$ with state $(u, w = u')$ is the integrator chosen in
Stage 0 (`integrateBinet` in `src/physics/integrators.ts`; the comparison is in
`docs/DESIGN.md`). The 3D tracer `traceRay` (`src/physics/raytrace.ts`) reduces every ray to it.
From the observer,

```math
u_0 = 1/r_o, \qquad w_0 = -u_0\sqrt{1-2Mu_0}\,\cot\psi,
```

from $P(u_0) = u_0^2(1-2Mu_0)\cot^2\psi$, with the sign chosen so that an outward ray
($\cos\psi > 0$) has decreasing $u$. The impact parameter is not needed for the integration.

- **Ray plane.** Basis $e_1 = \hat{\mathbf r}_o$, $e_2$ = normalised tangential part of $d$, with
  $\cos\psi = d\cdot e_1$ and $\sin\psi$ the length of the tangential part. $\phi$ is the
  polar angle inside this plane, so there are no coordinate poles. The only degenerate case is a
  radial ray ($|\sin\psi| < 10^{-7}$), which is a straight line and is handled exactly (escaped
  if outward, captured if inward, no disk crossing either way).
- **Escape** is detected when $u$ crosses 0, that is at $r = \infty$, by solving the cubic
  Hermite interpolant of the last step (Newton iteration, bracketed, stopped at convergence). The
  asymptotic direction is $\cos\phi_\infty e_1 + \sin\phi_\infty e_2$, because far away the
  direction of travel and the position direction coincide. No escape radius is needed, so no
  residual bending is left out.
- **Capture** uses the exact criterion of section 2 at a capture radius in $(2M, 3M]$ (default
  $3M$); the capture point is also refined on the Hermite interpolant.
- **Disk crossings.** On the ray plane, $z(\phi) = r(e_{1z}\cos\phi + e_{2z}\sin\phi)$
  vanishes at $\phi_0 + k\pi$ with $\phi_0 = \mathrm{atan2}(-e_{1z}, e_{2z})$ reduced to
  $(0, \pi]$; an observer exactly in the plane ($e_{1z} = 0$) gets $\phi_0 = \pi$, so the
  observer's own position never counts. Because $\phi$ only increases, each crossing angle is met
  once, in order: a crossing can be neither missed nor counted twice, at any step size. The
  radius at the crossing comes from the Hermite interpolant of the step that contains it. If the
  ray plane is the equatorial plane itself ($|(e_{1z}, e_{2z})| < 10^{-14}$) the ray sees a
  zero-thickness disk edge-on and gets no crossing.
- **Disk crossings on the GPU** (`src/shaders/geodesic.wgsl`). WGSL allows `atan2` a large
  error, so the shader never computes $\phi_0$. It evaluates
  $\zeta = z/r = e_{1z}\cos\phi + e_{2z}\sin\phi$ at every step boundary, with the
  $(\cos, \sin)$ pair from the rotation recurrence that also gives the escape direction, and
  records a crossing where $\zeta$ goes from nonzero to zero or to the opposite sign. Each
  boundary value is computed once and shared by the two steps it bounds, so no crossing is
  missed or counted twice, and $\zeta = 0$ at the observer is not a crossing, as on the CPU.
  Inside the step, $\zeta(\tau) = \zeta_0\cos\tau + \dot\zeta_0\sin\tau$ with
  $\dot\zeta_0 = e_{2z}\cos\phi - e_{1z}\sin\phi$ vanishes at
  $\tau = \arctan(-\zeta_0/\dot\zeta_0)$, $0 < \tau \le d\phi$, from a Taylor series to
  $x^7$ (truncation error below $10^{-11}$ for $|x| \le 0.06$). In the last step a crossing
  counts only if it comes before the escape or capture point.
- **Physical angular momentum.** The traced ray's plane normal is $n = e_1 \times e_2$. The
  physical photon travels the other way, so its conserved $L_z/E = -b\thinspace n_z$ with
  $b = r_o\sin\psi/\sqrt{1-2M/r_o}$; positive values co-rotate with the disk.
- **Flat space** ($M = 0$) is the straight line itself: the escape direction is $d$ exactly and
  the one possible crossing is the intersection of the line with $z = 0$.

## 7a. Camera

The camera is a static observer at $r_o$ on a sphere around the hole, at azimuth $\alpha$ and
elevation $\epsilon$ above the disk plane, looking at the hole (`cameraFrame` in
`src/physics/camera.ts`). Its basis is forward $= -\hat{\mathbf r}$,
up $= \partial\hat{\mathbf r}/\partial\epsilon = (-\sin\epsilon\cos\alpha, -\sin\epsilon\sin\alpha, \cos\epsilon)$,
which stays defined at the poles, and
right $=$ forward $\times$ up. Because the static frame's axes are aligned with the Euclidean
axes (section 6), these vectors are directly the local view directions.

A pinhole maps the image point $(x, y)$ of a $W \times H$ image (pixels from the top-left corner)
to the unit direction along forward $+ s_x$ right $+ s_y$ up with
$s_x = (2x/W - 1)(W/H)\tan(f/2)$ and $s_y = (1 - 2y/H)\tan(f/2)$, $f$ the vertical field of
view. Directions depend only on $x/W$ and $y/H$, so the device pixel ratio does not change them.
A cone of half-angle $\psi$ around the optical axis images to a circle of radius
$\tan\psi/\tan(f/2)$ half-heights; the shadow-size measurement relies on this.

`autoFieldOfView` widens $f$ so that the shadow radius is at most 60 % of the half-height,
$f = 2\arctan(\tan\psi_{sh}/0.6)$, never narrower than requested and at most $120°$. With the
default $60°$ it starts widening below about $14.8M$; at $5M$ it reaches the cap and the shadow
fills 78 % of the half-height.

## 8. Deflection angle: two independent reference methods

The swept angle while $u$ runs over $[u_A, u_B]$ is $\int du/\sqrt{P(u)}$, and the deflection of a
ray from infinity is $\alpha(b) = 2\int_0^{u_2} du/\sqrt{P(u)} - \pi$, as in the brief.

**Method 1: quadrature after two changes of variables** (`sweptAngleQuadrature`). With
$u = u_2 - s^2$, $P(u) = s^2 Q(u_2 - s^2)$ where, exactly (Q is quadratic in u),

```math
Q(u_2 - s^2) = Q_0 + \kappa s^2 - 2Ms^4,\qquad Q_0 = 6Mu_2\left(\tfrac{1}{3M}-u_2\right),\quad
\kappa = 6Mu_2 - 1,
```

and the integral becomes $\int 2\thinspace ds/\sqrt{Q_0 + \kappa s^2 - 2Ms^4}$: the turning-point
singularity is gone. Near $b_c$, $Q_0 \to 0$ and the integrand develops a peak of width
$\sqrt{Q_0/\kappa}$ at $s = 0$ (the logarithmic divergence of $\alpha$). The substitution
$s = c\sinh\tau$ with $c = \sqrt{Q_0/\kappa}$ turns it into
$2c\cosh\tau/\sqrt{Q_0\cosh^2\tau - 2Mc^4\sinh^4\tau}$, which is smooth and of order 1. A composite
20-point Gauss-Legendre rule with panels of width 0.5 in $\tau$ then converges to machine
precision. $Q_0$ is computed from the cancellation-free $1/(3M) - u_2$ of section 5.

**Method 2: elliptic integrals** (`sweptAngleElliptic`). With $X_i, Y_i$ the square roots of the
three factors $(u-u_1), (u_2-u), (u_3-u)$ at $x = u_B$ and $y = u_A$,

```math
\int_y^x \frac{du}{\sqrt{2M(u-u_1)(u_2-u)(u_3-u)}} = \frac{2}{\sqrt{2M}}\,
R_F(U_{12}^2, U_{13}^2, U_{14}^2),
```

```math
U_{12} = \frac{X_1X_2Y_3 + Y_1Y_2X_3}{x-y},\quad U_{13} = \frac{X_1X_3Y_2 + Y_1Y_3X_2}{x-y},\quad
U_{14} = \frac{X_1Y_2Y_3 + Y_1X_2X_3}{x-y},
```

which is DLMF 19.29.4 with the fourth factor set to 1 and the $U_{\alpha\beta}$ of 19.29.5 (DLMF
release 1.2.8). $R_F$ uses Carlson's duplication algorithm (Carlson 1995, with his check values as
tests). Sanity check: as $b \to \infty$ the formula reduces to
$\frac{2}{\sqrt2}R_C(\tfrac12, 1) = \pi/2$ for $M = 1$, the straight-line value.

Darwin (1959) is the classic source for the exact deflection, but its full text could not be
read, so the elliptic form here is cited to DLMF and Carlson instead; Luminet (1979, eq. 6) and
Iyer and Petters (2007, eq. 8) give equivalent closed forms in Legendre integrals.

**Agreement (measured, Apple M5, macOS 27, Node 25.6.1, `npm run measure`).** At the test's
values of $b/b_c$ from $1 + 10^{-8}$ to 1.1, with $M = 1$ and 2.5, the relative difference is at
most $1.05\times10^{-15}$. Beyond 1.1, up to $1000\thinspace b_c$, it is at most $2.9\times10^{-12}$. The
larger value is cancellation in $2I - \pi$, not a disagreement of the two integrals: the
deflection falls to about $4M/b = 7.7\times10^{-4}$ rad at $1000\thinspace b_c$, so a rounding-level
difference in $2I \approx \pi$ is a much larger fraction of it. The test tolerance is $10^{-11}$
relative up to $1000\thinspace b_c$.

**Weak field.** $\alpha = \sum A_n (M/b)^n$ with $A_1 = 4$, $A_2 = 15\pi/4$, $A_3 = 128/3$,
$A_4 = 3465\pi/64$, $A_5 = 3584/5$, $A_6 = 255255\pi/256$ (Keeton and Petters 2005, eqs. 24 and
25). The brief's $\alpha \approx 4M/b$ is the first term. Measured (`npm run measure`): the
remainder after three terms over the fourth term is 1.044, 1.022, 1.009 and 1.004 at
$b = 100$, 200, 500 and $1000M$. The excess falls as $1/b$, as expected from the next term,
$(A_5/A_4)(M/b) = 4.2\times10^{-3}$ at $1000M$ (test bounds 0.95 to 1.06).

**Strong field.** Bozza (2002) eq. (50), with $\bar a = 1$ and
$\bar b = \ln[216(7-4\sqrt3)] - \pi \approx -0.4002$ (his eqs. 47 to 49; the paper uses units
$2M = 1$ and $u_m = 3\sqrt3/2$ there), written in the impact parameter:

```math
\alpha(b) = -\ln\left(\frac{b}{b_c} - 1\right) + \ln[216(7-4\sqrt3)] - \pi +
O\big((b-b_c)\ln(b-b_c)\big).
```

The brief's "logarithmic divergence, coefficients from Bozza 2002" is confirmed. Bozza keeps only
the zeroth-order terms in the closest-approach distance $x_0$ and gives the remainder as
$O(x_0 - x_m)$, with $x_m$ the photon sphere radius (his eqs. 25 and 29); the error term above comes
from the series of Iyer and Petters (2007), eq. (25), in $b' = 1 - b_c/b$. With
$\varepsilon = b/b_c - 1$ and $\ln(1/b') = \ln(1/\varepsilon) + \varepsilon + O(\varepsilon^2)$, its
first correction gives the exact value minus the formula above as

```math
\varepsilon\left[\tfrac{5}{18}\ln\tfrac{1}{\varepsilon} + 1 + \tfrac{4\sqrt3 - 17}{18} +
\tfrac{5}{18}\ln[216(7-4\sqrt3)]\right] = \varepsilon\left(0.2778\ln\tfrac{1}{\varepsilon} +
1.2019\right),
```

up to $O(\varepsilon^2\ln\varepsilon)$. Measured (`npm run measure`, test at
$\varepsilon = 10^{-3}$ to $10^{-7}$): the difference is $5.7\times10^{-7}$ rad at
$\varepsilon = 10^{-7}$ (test bound $10^{-5}$ rad), the value this series gives, and its log-log
slope against $\varepsilon$ is 0.935 (test bounds 0.8 to 1.2), the slope of the series at the same
five points.

## 8a. Swept angle of plunging photons

For $b < b_c$ the reference quadrature of section 8 stops at $u = 1/(4M)$, but the ring images of
section 6a need the swept angle through the photon sphere and past the horizon. With
$v = u - 1/(3M)$ the orbit polynomial is exactly

```math
P = \varepsilon + v^2(1 + 2Mv), \qquad \varepsilon = \frac{1}{b^2} - \frac{1}{b_c^2} > 0,
```

because the linear terms cancel at $u = 1/(3M)$ and $1/b^2 - u^2(1-2Mu)$ there equals
$\varepsilon$. Since $1 + 2Mv \ge 1/3$ for every $u \ge 0$, the substitution
$v = \sqrt\varepsilon\sinh\tau$ gives

```math
\int \frac{du}{\sqrt{P}} = \int \frac{d\tau}{\sqrt{1 + 2M\sqrt\varepsilon\,
\sinh^3\tau/\cosh^2\tau}},
```

a smooth, bounded integrand for any interval, evaluated by composite Gauss-Legendre with panels
of width $0.5$ in $\tau$ (at least four): `sweptAnglePlunging`. Checks: agreement with an
independent adaptive Simpson quadrature in $\ln|v|$ to $10^{-10}$ relative for
$b/b_c$ from $0.3$ to $0.999999$ (measured at most $3.4\times10^{-15}$, `npm run measure`), with
the section 8 quadrature where both apply, and continuity with the Carlson form across $b_c$.

## 9. Redshift

An emitter with $u^\mu = u^t(1, 0, 0, \Omega)$ and a photon with $p_t = -E$, $p_\phi = L_z$ give,
for an observer at rest at infinity,

```math
g = \frac{\nu_{obs}}{\nu_{emit}} = \frac{1}{u^t\,(1 - \Omega L_z/E)}
```

(`redshiftFactor`), as in the brief. This matches Luminet (1979) eqs. (18) and (19) and
Cunningham (1975) eq. (2).

- Circular Keplerian emitter, face-on photon ($L_z = 0$): $g = \sqrt{1-3M/r}$. Confirmed.
- Static emitter: $g = \sqrt{1-2M/r}$. Confirmed.
- **Correction for this renderer:** the camera is a static observer at finite $r_o$, not at
  infinity. Its locally measured frequency is $E/\sqrt{1-2M/r_o}$, so the observed factor is
  $g_{obs} = g/\sqrt{1-2M/r_o}$ (`staticObserverFactor`): 1.035 at $30M$, 1.29 at $5M$. The same
  blueshift applies to starlight arriving from infinity.
- **Positivity.** A photon at radius $r$ has $|L_z/E| \le b \le r/\sqrt{1-2M/r}$, so
  $\Omega|L_z/E| \le \sqrt{M/(r-2M)} < 1$ for $r > 3M$ (it is $1/2$ at the ISCO). Hence $g$ is
  positive and finite for every allowed photon, with $g \le \sqrt2$ at the ISCO.
- **Sign.** Positive $L_z$ co-rotates with the disk (approaching side, blueshift). Rays are traced
  backwards, so the physical photon's $L_z$ is minus the traced one.
- **Intensity and colour.** $I_\nu/\nu^3$ is invariant along a ray (Lindquist 1966; Cunningham
  1975 eq. 6 uses it), so a blackbody at $T$ is observed as a blackbody at $gT$ and the
  bolometric intensity scales as $g^4$. Luminet (1979, p. 233) states the same inverse fourth
  power of $1 + z$ for the observed bolometric flux. Confirmed.

## 10. Disk (thin, Page-Thorne flux)

The disk is infinitely thin and opaque, of gas on circular Keplerian orbits from $r_{in}$ to
$r_{out}$ (the default disk: the ISCO, $6M$, to $20M$). Each face radiates as a blackbody in the
gas's own frame, $\sigma T^4 = F$, with $F$ the relativistic thin-disk flux of Page and Thorne
(1974) for a non-rotating hole (`pageThorneFlux` in `src/physics/disk.ts`). Up to Stage 7 the
renderers drew the Newtonian profile instead; the comparison is at the end of this section.

**The flux.** Page and Thorne (1974) define $F$ (eq. 10b) as the time-averaged energy flux that
leaves one face, per unit proper time and proper area, measured by an observer who orbits with
the gas. With the rest-mass accretion rate $\dot M$ and the specific energy $E$, angular momentum
$L$ and angular velocity $\Omega$ of circular geodesics,

```math
F(r) = \frac{\dot M}{4\pi}\,e^{-(\nu + \psi + \mu)} f(r),\qquad
f(r) = \frac{-\Omega_{,r}}{(E - \Omega L)^2}\int_{r_{ms}}^{r} (E - \Omega L)\,L_{,r}\,dr
```

(eqs. 11b and 12), with $e^{\nu + \psi + \mu} = r$ in the equatorial plane (eq. 15d) and $r_{ms}$
the ISCO. The lower limit is the zero-torque condition at the ISCO. For a non-rotating hole the
roots of $x^3 - 3x + 2a_* = 0$ (eq. 14) are $\sqrt3$, $0$ and $-\sqrt3$, and $x_0 = \sqrt6$ is
$x = \sqrt{r/M}$ at the ISCO (eqs. 15k to 15m). The term of eq. (15n) with the root 0 tends to 0 as
$a_* \to 0$, and the logarithms of the other two roots have coefficients $\pm\sqrt3/2$, so

```math
F(r) = \frac{3M\dot M}{8\pi r^3}\,\frac{1}{1 - 3M/r}\left[1 - \sqrt{\frac{6M}{r}}
  + \frac{1}{2}\sqrt{\frac{3M}{r}}\,\ln\frac{(\sqrt r + \sqrt{3M})(\sqrt2 - 1)}{(\sqrt r - \sqrt{3M})(\sqrt2 + 1)}\right]
```

for $r > 6M$, and $F = 0$ at and inside the ISCO. The bracket is $B(x)/x$ with

```math
B(x) = x - x_0 - \frac{\sqrt3}{2}\ln\frac{x - \sqrt3}{x_0 - \sqrt3} + \frac{\sqrt3}{2}\ln\frac{x + \sqrt3}{x_0 + \sqrt3},
\qquad F = \frac{3M\dot M\,B(x)}{8\pi r^2 (r - 3M)\,x}.
```

Mueller and Frauendiener (2012, eq. 11) give the same function in $R = r/r_s$, $r_s = 2M$; the
tests compare the library with it and with eq. (12) integrated numerically
(`tests/unit/disk-flux.test.ts`).

**A form without cancellation near the ISCO.** $B$ has a double zero at $x_0$, while each of its
three terms is of order $x - x_0$, so the sum cancels near the ISCO. With
$B'(x) = (x^2 - 6)/(x^2 - 3)$, the subtraction formula for artanh and $x x_0 - 6 = x_0 d$,

```math
B = \frac{x_0\,d^2}{x x_0 - 3} - \sqrt3\left(\mathrm{artanh} z - z\right),\qquad
d = x - x_0 = \frac{r/M - 6}{x + x_0},\qquad z = \frac{\sqrt3\,d}{x x_0 - 3},
```

with $0 \le z < 1/\sqrt2$; $\mathrm{artanh} z - z$ is summed as its series below $z = 0.125$.
The library forms $r/M - 6$ as $(r - 6M)/M$: $r - 6M$ is exact for $r$ within a factor of two
of $6M$ when $6M$ is exact, and the division adds one relative rounding. So the flux is as
accurate as $r - 6M$ allows: near the ISCO $F \propto (r - 6M)^2$, and a rounded $r$ or $6M$
moves it by about $2\epsilon\thinspace r/(r - 6M)$ for a relative rounding $\epsilon$. Measured once
while the tests were written (2026-11-08), the closed form in $B(x)$ above, its three terms summed
directly in 64-bit floats, is off by $2.2\times10^{-5}$ relative at $r = 6M(1 + 10^{-6})$, by $5.4\times10^{-3}$ at
$r = 6M + 10^{-6}M = 6M(1 + 1.7\times10^{-7})$ and has a relative error of 55 at
$6M(1 + 10^{-9})$; the stable form agrees with eq. (12) to $1.1\times10^{-15}$ at every radius the test checks, from $6M(1 + 10^{-9})$ to $1000\thinspace r_{isco}$ ($M = 1$ and 2
within $10^{-3}$ of the ISCO, $M = 1$ and 1.7 farther out; `npm run measure`).

**Properties** (computed by the library and checked by `tests/unit/disk-flux.test.ts`):

| Property                                                         | Value                                                                                                                       | How it is checked                                                                                                                                                                                                                                                                                                                                                    |
| ---------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Zero torque at the ISCO                                          | $F = 0$ at and inside $6M$; a double zero, $F = \dot M (r - 6M)^2/(20736\pi M^4) + O((r - 6M)^3)$                           | $F/(r - 6M)^2$ at $r - 6M = 10^{-7}M$ within $1.03\times10^{-7}$ of the coefficient                                                                                                                                                                                                                                                                                  |
| Radius of peak flux and peak temperature, in the gas's own frame | $r_{peak} = 9.5509M$ for every $M$; $x_p^2$ with $x_p$ the root of $x(x^2 - 6) = (7x^2 - 15)B(x)$                           | Within $5.6\times10^{-16}$ of a 70-digit value; a golden-section search of $F$ agrees to $5.8\times10^{-9}$                                                                                                                                                                                                                                                          |
| Peak flux                                                        | $F_{max} = 1.3678\times10^{-5}\thinspace\dot M/M^2$, $F_{max}/F_0 = 9.1672\times10^{-4}$ with $F_0 = 3M\dot M/(8\pi r_s^3)$ | Against a 70-digit value                                                                                                                                                                                                                                                                                                                                             |
| Published peak                                                   | Mueller and Frauendiener print $F_{max}/F_0 \approx 9.167\times10^{-4}$ at $R_{max} \approx 4.776$                          | Flux within $5\times10^{-8}$ (it agrees to $1.6\times10^{-8}$). The root gives $R = 4.775464$: $5.4\times10^{-4}$ from the printed value, more than its rounding to three decimals allows ($5\times10^{-4}$), so the test allows $10^{-3}$, one unit of the last printed digit (twice the rounding allowance); the root itself is checked against the 70-digit value |
| Shape                                                            | $F$ rises from the ISCO to $r_{peak}$ and falls beyond it                                                                   | Strictly monotonic on grids from $6M(1 + 10^{-9})$ to $10^6M$                                                                                                                                                                                                                                                                                                        |
| Newtonian limit                                                  | $F/F_N = 1 + \tfrac{\sqrt3}{2}\ln(3 - 2\sqrt2)\sqrt{M/r} + O(M/r)$, $F_N = \tfrac{3M\dot M}{8\pi r^3}(1 - \sqrt{6M/r})$     | At $10^8M$ and $10^{10}M$; the coefficient of $\sqrt{M/r}$ within $2.3\times10^{-5}$                                                                                                                                                                                                                                                                                 |
| Mass scaling                                                     | $F(rM, M)\thinspace M^2 = F(r, 1)$                                                                                          | To $1.1\times10^{-15}$                                                                                                                                                                                                                                                                                                                                               |

**Temperature.** photonring needs only the shape: $\hat F = F/F_{max}$, 1 at $r_{peak}$ and 0 at
and inside the ISCO, and $\hat T = \hat F^{1/4}$ (`diskFluxHat`, `diskTemperatureHat`). The
emitted temperature is $T(r) = T_{peak}\thinspace\hat T(r)$, with $T_{peak}$ the disk's
`peakTemperature`. The flux is already in the gas's own frame, so the redshift is applied once,
by $g$ (section 9); the observed flux $F/(1 + z)^4$ of Mueller and Frauendiener is the same
physics and is not applied as well. Near the ISCO $\hat T$ rises as $(r - 6M)^{1/2}$, so the inner
rim of the disk is dark.

**The inner edge.** `assertDiskSettings` makes both renderers reject a disk with $r_{in} < 6M$ or
$M \le 0$: a disk inside the ISCO would be an opaque ring with no emission that hides the light
behind it. The inner edge stays a setting, but the zero torque stays at the ISCO: a disk with
$r_{in} > 6M$ is the same disk cut off at $r_{in}$, bright at its edge, not a disk with zero torque
at $r_{in}$. The page always uses $r_{in} = 6M$.

**Limits.** No thickness, no radiative transfer, no self-illumination, no returning radiation
(light from the disk that falls back on it) and no magnetic fields; isotropic blackbody emission
in the gas's own frame. Zero torque at the ISCO is an assumption of the model; Page and Thorne
(1974, footnote 2) note that strong magnetic fields could change it. It is a toy for
demonstration and must not be presented as a model of any real observation.

**Compared with the Newtonian profile of Stages 1 to 7.** Shakura and Sunyaev (1973) eq. (2.6)
give the Newtonian flux per face $Q \propto R^{-3}[1 - (R_0/R)^{1/2}]$ with zero torque at the
inner edge $R_0$, so $T \propto r^{-3/4}(1 - \sqrt{r_{in}/r})^{1/4}$, hottest at
$r = (49/36)\thinspace r_{in} = 8.17M$. It is the large-radius limit of the Page-Thorne flux (the table
above); the tests keep it only as an inline oracle there. Page-Thorne puts the hottest radius in the gas's
own frame 17 % farther out, at $9.55M$, makes the inner rim cooler and the outer disk warmer.
Emitted temperature with 6500 K at the hottest radius, in the gas's own frame (computed by the
library):

| $r$ ($M$)       | 6.05 | 6.2  | 6.5  | 7    | 8    | 8.17 ($\tfrac{49}{36}r_{in}$) | 9.55 ($r_{peak}$) | 12   | 15   | 20   |
| --------------- | ---- | ---- | ---- | ---- | ---- | ----------------------------- | ----------------- | ---- | ---- | ---- |
| Newtonian (K)   | 3359 | 4642 | 5584 | 6194 | 6496 | 6500                          | 6344              | 5828 | 5218 | 4429 |
| Page-Thorne (K) | 1477 | 2846 | 4191 | 5315 | 6217 | 6288                          | 6500              | 6249 | 5743 | 4983 |

$\hat F$ at the outer edge, $20M$, is 0.2155 with the Newtonian profile and 0.3455 with
Page-Thorne. For a face-on observer far away, the observed temperature $g\thinspace T$ with
$g = \sqrt{1 - 3M/r}$ peaks at $10.79M$ (Newtonian: $9.29M$; computed, not measured on an image).

**Display choices.** The peak temperature of the opaque toy disk, 6500 K at its hottest radius,
$9.55M$, in the gas's own frame, is a display choice, made at the Stage 1 check-in
(`docs/DESIGN.md`, section 10); it was not derived from a black hole mass or accretion rate, and
that record gives no physical reason for it. With the colour-matching fit of section 10a, a
6500 K blackbody has chromaticity (0.3134, 0.3239), 0.0052 from the sRGB white point D65 (0.3127,
0.3290). The disk is not drawn at that temperature: each crossing is drawn as a blackbody at $gT$
(section 9), so the approaching side of the disk is drawn whiter and the receding side brown,
and the inner rim, where $T$ falls to zero at the ISCO, dark. The page's exposure is fixed at 1.
Computed by the library (the CPU reference renderer's encoding of a colour-view pixel, not a
measurement on a GPU), the tone curve of section 10a draws a 6500 K blackbody at (210, 207, 210)
of 255; one at 3000 K has 0.010 of its luminance and is drawn at (35, 23, 9), and one at 9000 K
has 3.16 times it and is drawn at (248, 250, 253) (`tests/unit/colour.test.ts`,
`npm run measure`).

**Not a model of M87\* or Sgr A\*.** The EHT explains its image of M87\* with models in which hot
plasma near the black hole shines by synchrotron emission (EHT 2019, Paper V, abstract), and it
expects the 1.3 mm emission to come from the synchrotron process (Paper V, section 2). It calls a
black hole surrounded by a geometrically thick, optically thin accretion flow the conventional
model of the central object in M87 (Paper V, section 1). For Sgr A\*, the EHT writes that its low luminosity suggests that matter falls in as "a radiatively
inefficient/advection dominated accretion flow" rather than as "a radiatively efficient thin
disk", and that its emission is driven by the synchrotron process (EHT 2022, Paper V, section 1).
The EHT's M87\* Paper I gives the wider reason: the brightest quasars are thought to accrete at
very high rates through a geometrically thin, optically thick disk (Shakura and Sunyaev 1973,
whose Newtonian disk the Page-Thorne flux extends to general relativity),
while most nearby active nuclei, the Galactic center and M87 among them, are fed by hot, tenuous
flows at much lower accretion rates (EHT 2019, Paper I, section 1).
photonring's disk is a thin, opaque toy that radiates as a blackbody, with the flux of Page and
Thorne (1974), and its black hole does not spin (section 10d, item 6).

## 10a. Colour

- **Spectrum.** Planck's law $B_\lambda \propto \lambda^{-5}/(e^{c_2/\lambda T} - 1)$ with
  $c_2 = hc/k$, exact since the 2019 SI because $h$, $c$ and $k$ are; its decimal expansion does
  not end, and the code uses the 10 significant digits $1.438776877\times10^{-2}$ m K (NIST
  CODATA), a relative difference of $3.5\times10^{-10}$.
- **Colour matching.** The CIE 1931 2-degree functions are approximated by the multi-lobe
  piecewise Gaussian fit of Wyman, Sloan and Shirley (2013), eq. (4) and table 1, integrated at
  1 nm steps from 360 to 830 nm (`blackbodyXYZ`). The fit avoids redistributing the CIE dataset,
  which is licensed CC BY-SA 4.0; four sample values from that dataset are quoted, with
  attribution, as test expectations.
- **To sRGB.** XYZ to linear sRGB uses the matrix of the W3C CSS Color 4 sample code (D65, after
  IEC 61966-2-1); luminance is the Y row of its inverse. Encoding uses the sRGB transfer function
  ($12.92c$ below 0.0031308, $1.055c^{1/2.4} - 0.055$ above).
- **Scale.** `blackbodyColour` is normalised so a 6500 K blackbody has luminance 1, which keeps
  the physical temperature dependence of brightness: steep in the Wien regime, linear in $T$ in
  the Rayleigh-Jeans regime (measured ratio 2.027 between $10^6$ and $5\times10^5$ K). This
  normalisation and the disk's 6500 K at its hottest radius, in the gas's own frame (section 10),
  are two separate display choices that happen to use the same temperature.
  Deep-red blackbodies lie outside the sRGB gamut and get a slightly negative blue channel; the
  renderer clamps negative emission to zero.
- **Accuracy (measured, `npm run measure`).** Chromaticity against the Planckian locus computed
  from the CIE data, the larger of the differences in $x$ and $y$: 0.00023 at 6500 K, 0.00011 at
  10000 K and 20000 K, 0.0012 at 3000 K, 0.0013 at 2856 K (illuminant A) and 0.0046 at 1500 K, where
  the fit's red tail dominates (test bounds 0.002, and 0.005 at 1500 K). At the four sample
  wavelengths the fit itself differs from the CIE data by at most 0.0093 in any of the three
  functions (test bound 0.025). The locus values in `tests/unit/colour.test.ts` were computed once
  from the CIE 1931 dataset at 1 nm steps, by a script that was not kept. The test's illuminant A
  chromaticity, (0.44757, 0.40745), agrees to about $10^{-5}$ with the one computed from the CIE
  standard illuminant A dataset (CIE 2018) and the 1931 functions (a one-off check for the Stage 6
  reference audit, script not kept).
- **Tone mapping.** $1 - e^{-kx}$ per channel, $k$ the exposure: linear near 0, saturating
  smoothly below 1. The page uses $k = 1$ (`PAGE_SCENE` in `src/ui/page-scene.ts`; section 10).
  Validation and debug renders skip it and clamp to $[0, 1]$ instead.

## 10b. Star field (procedural)

Stars live on three cubic lattices in direction space (`src/physics/starfield.ts`). Cell $c$ of
a layer with $K$ cells per unit length holds at most one star, with probability $p$, at the point
$(c + j)/K$ with a hashed jitter $j \in [0, 1)^3$, and only if that point lies within half a cell
of the unit sphere. The star's direction is that point normalised.

- **Hash.** pcg3d of Jarzynski and Olano (2020), section 6.1, on the integer cell coordinates:
  all arithmetic modulo $2^{32}$, so the catalogue is bit-identical in JavaScript and in WGSL.
  Hash outputs become floats in $[0, 1)$ from their top 24 bits, exact in f32.
- **Seamless lookup.** A star's profile is a Gaussian in chord distance with
  $\sigma = \rho/4$, truncated (and shifted to reach zero) at $\rho$ = half a cell. Any star
  that can contribute in direction $d$ therefore lies in one of the 27 cells around
  $\lfloor dK \rfloor$, so the radiance is continuous across cell boundaries, even where f32 and
  f64 floor to different cells. Using only cell indices and chord distances avoids transcendental
  functions, whose WGSL accuracy is loose (section 11).
- **Layers.** $K = 40, 120, 360$ with $p = 0.06, 0.06, 0.03$: few large bright stars, more medium
  ones, many small faint ones. Expected density is about $pK^2$ stars per steradian per layer.
- **Brightness and colour.** Each star is a blackbody at a hashed temperature from 2500 to
  32500 K, with peak luminance $L = L_{max}u^4$ for a hashed $u$ (many faint stars). For a static
  observer at $r_o$ every frequency is multiplied by $g = (1 - 2M/r_o)^{-1/2}$ (section 9), so
  the star is drawn as a blackbody at $gT$, scaled so that its luminance is $L$ when $g = 1$.

## 10c. Rendering a sample

For each sample direction, `renderImage` (`src/cpu-renderer/render.ts`) traces the ray and then
composites front to back along the traced path: each crossing with $r_{in} \le r \le r_{out}$
adds $\tau\thinspace a\thinspace B(g\thinspace T(r))$, $T = T_{peak}\thinspace\hat T$ (section 10), and multiplies the transmittance $\tau$ by $1 - a$, where $a$ is
the disk opacity, $B$ the normalised blackbody colour and
$g = g_\infty(r, L_z/E)/\sqrt{1 - 2M/r_o}$; finally an escaped ray adds $\tau$ times the sky
radiance in its escape direction. Supersampling averages an $n \times n$ grid of samples per
pixel. Validation renders use one sample at each pixel centre, no disk, a sky of radiance 1 and
no tone mapping, so captured pixels are exactly 0 and escaped pixels exactly 1.

**On the GPU** (`src/shaders/render.wgsl` and `disk.wgsl`) the same compositing runs at each
crossing. $T$ and $g$ use only square roots, divisions and one table, because WGSL's `pow`
inherits the loose error bounds of `exp2` and `log2`, and `log` would cancel near the ISCO. With
$s = \sqrt{6M/r}$, the Page-Thorne profile factors as $\hat T = s^{3/2}(1 - s)^{1/2}C(s)$, where
$C$ is smooth and bounded on $[0, 1]$: $C(0) = (576\pi F_{max})^{-1/4} = 2.5212$ and
$C(1) = \sqrt2\thinspace C(0) = 3.5655$ (for $M = 1$; $C$ itself does not depend on $M$). A table of
1024 values of $C$ at $s = i/1023$, built by the 64-bit library and stored in f32
(`src/gpu/host/disk-table.ts`, 4 KB, group 0 binding 3), is interpolated linearly in $s$; the
shader forms $s^{3/2}(1 - s)^{1/2}$ with square roots and writes $1 - s$ as
$((r - 6M)/r)/(1 + s)$, which does not cancel near the ISCO, because $r - 6M$ is exact there when
$6M$ is exact in f32, as for the page's $M = 1$; for a mass whose $6M$ is not exact in f32 the error
grows near the ISCO (emulated: $3.7\times10^{-4}$ at $6.0006M$ for $M = 1.7$). Then
$T = T_{peak}\thinspace\hat T$ and $g = g_{obs}\sqrt{1-3M/r} /\thinspace(1 - \Omega L_z/E)$ with
$\Omega = \sqrt{M/r}/r$. The zero torque is at $6M$ whatever the inner edge. Measured on the M5's
GPU, $\hat T$ from the shader is within $5.3\times10^{-7}$ of the 64-bit library at the f32 radius,
for 4096 radii from $6M(1 + 10^{-4})$ to $1000M$, and within $2.9\times10^{-7}$ at the first eight f32
radii above $6M$ (`tests/gpu/disk-profile.spec.ts`). Once the transmittance is zero (an opaque
disk) tracing stops, since nothing behind can be seen.

**Anti-aliasing** (`src/shaders/refine.wgsl`, `src/gpu/host/antialias.ts`). A second pass gives a
pixel the CPU renderer's $3 \times 3$ grid of samples (the centre one is the first pass's) when
either test holds:

- **Critical band.** Its footprint may contain an inward ray with $b_c \le b \le 1.02\thinspace b_c$, or
  the shadow edge. The footprint's angular radius is at most the pixel's half-diagonal in the
  image plane at unit distance, $\delta = \sqrt2\tan(f/2)/H$, because the inverse gnomonic
  projection shrinks lengths (its local scale factors are $\cos\theta$ and $\cos^2\theta$). The
  test is therefore a range of the cosine of the angle between the pixel centre's direction and
  the direction to the hole, $[\cos(\psi_{out} + \delta), \cos(\psi_{sh} - \delta)]$, with
  $\sin\psi_{out} = 1.02\thinspace b_c\sqrt{1-2M/r_o}/r_o$. In Bozza's strong-field limit ($\bar a = 1$),
  $b/b_c - 1 \approx e^{\bar b - \alpha}$, so images half a turn apart differ by a factor
  $e^{-\pi} \approx 1/23$ in $b/b_c - 1$: the photon ring and the higher-order images of the disk
  soon become thinner than a pixel, and a one-sample image can miss them entirely. The band
  holds every ray deflected by more than 3.56 rad, or 204 degrees (`deflectionAngleElliptic` at
  $1.02\thinspace b_c$; the strong-field formula gives 3.51).
- **Contrast.** Its one-sample value differs from one of its 8 neighbours by more than 0.05 in
  sRGB-encoded, tone-mapped luminance (about 13 of 255 levels): disk edges, star images and other
  sharp features.

A refined pixel is then the CPU's $3 \times 3$ supersampled value up to f32 and f16 rounding,
which the GPU tests check.

## 10d. EHT-style view

A display of the same toy disk at the resolution of the 2019 Event Horizon Telescope images of
M87*, scaled to this black hole, in false colour. It is not a simulation of the EHT observation;
the caveats at the end of this section say why, and the page says so wherever the view appears.

**The quantity.** Per sample, the brightness summed over all frequencies, composited front to
back over the disk crossings like the colour view (`compositeDiskBolometric`):

```math
I = \sum_k \tau_k\,a\,g_k^4\,\hat F(r_k),\qquad \tau_0 = 1,\quad \tau_{k+1} = \tau_k (1 - a),
```

with $g_k$ the frequency ratio of section 9 at crossing $k$ (including the static observer's
factor), $\hat F$ the Page-Thorne flux of section 10 over its peak value, and $a$ the disk
opacity. Because $I_\nu/\nu^3$ is invariant along a ray (section 9, Cunningham 1975, eq. 6), the
observed frequency-integrated intensity of a blackbody is $g^4$ times the emitted
$\sigma T^4/\pi = F/\pi$; in units of the peak emission that is $g^4\hat F = (g\hat T)^4$, so the
peak temperature and the exposure drop out.
Escaped and captured rays add nothing: the sky is black. It is not the brightness at one
frequency, which would weight a power-law spectrum $I_\nu \propto \nu^{-\alpha_\nu}$ by
$g^{3+\alpha_\nu}$ instead (from the same invariant). On the GPU this is two squarings of
$g\hat T$, no `pow` (section 11).

**The resolution.** The 2019 images were "blurred with a circular Gaussian to a common,
conservative angular resolution of 20 μas" (EHT Collaboration 2019, Paper I, section 5; Paper V,
Figure 1, convolves a model with a 20 μas FWHM Gaussian the same way); the diffraction limit of
about 25 μas (Paper I, section 3) is not an applied blur and is not used. The mass scale is
$\theta_g = GM/(c^2D) = 3.8 \pm 0.4$ μas (Paper I, Table 1). For a distant observer, angle and
impact parameter are proportional, so the blur in units of $M$ is

```math
F_b = \frac{20}{3.8}\,M = 5.263\,M,\qquad \sigma_b = \frac{F_b}{2\sqrt{2\ln 2}} = 2.2351\,M
```

(`ehtBeamFwhmM`, `ehtBeamSigmaM`), 4.76 to 5.88 M over the uncertainty of $\theta_g$. Paper I
(section 7) calibrates the ring diameter in units of $\theta_g$ against its library of GRMHD
images, so this scale carries that calibration.

**Pixels per M.** With $k = \sqrt{1 - 2M/r_o}/r_o$, $\sin\psi = k\thinspace b$ (section 6), and the
pinhole radius $\rho = (H/2)\tan\psi/\tan(f_y/2)$ (section 7a), the scale at the shadow edge is

```math
s = \frac{d\rho}{db}\bigg|_{b_c} = \frac{H\,k}{2\tan(f_y/2)\cos^3\psi_{sh}}\ \text{px per } M
```

(`edgePixelScale`), and the blur is $\sigma_{px} = \sigma_b\thinspace s$. Scaling by the shadow's own image
radius over $b_c$ instead would differ by exactly $\cos^2\psi_{sh}$ (0.99933 at 200 M, 0.972 at
30 M); the local scale is used because a beam is a local resolution and the ring lies just
outside the edge. Elsewhere the pinhole scale differs, so the beam is matched at the shadow edge
and is exact only for a distant observer; below 100 M the page says so.

**Framing and orientation.** The view chooses its own field of view: a circle of radius 28 M at
the edge scale fits the shorter image side, $\tan(f_y/2) = (28\thinspace k/\cos^3\psi_{sh})\max(1, H/W)$
(`ehtFieldOfView`), capped at 120 degrees (closer than about 17.2 M), so the blur keeps the same
number of pixels per M at every distance: 15.876 degrees at 200 M for a 16:9 image. The image is
turned anticlockwise by 108 degrees (`M87_SKY_ROLL_DEG`): M87*'s approaching jet lies at position
angle about 288 degrees (Paper V, section 2), its spin points away from Earth (Paper I,
section 6). photonring draws the disk's angular momentum axis ($+z$) up; the turn puts its
projection at $288 - 180 = 108$ degrees, where M87*'s spin axis projects, so north is up and east
left as on the sky. That end of the axis points away from the camera, as M87*'s does from Earth,
only for cameras below the disk, as at the preset; above the disk it points towards the camera
and the disk turns anticlockwise on screen, so there the turn matches only the direction of the
axis on the sky. The turn applies in this view at every camera. The roll
turns the camera basis in the image plane (`CameraParams.rollDeg`), so the GPU, the CPU twin and
the overlays all follow it. The preset "Tilt 17°, as for M87*" puts the camera at 200 M and
elevation $-73$ degrees, so the disk axis and the line of sight make the 163 degrees of the EHT's
models (Paper V, Figures 2 and 4); seen from below, the disk turns clockwise, as M87*'s flow does.

**The discrete blur** (`src/gpu/host/eht-post.ts`, the same plan on the GPU and in the CPU twin):

1. Reduce factor: the largest $f$ of 1, 2, 4, 8 and 16 with $\sigma_{px}/f \ge 6$, else 1.
2. Tent reduce, separably: reduced texel $l$, centred at $(l + 1/2)f$, takes
   $\max(0, 1 - |x|/f)/f$ of each pixel at offset $x$ along each axis; pixels outside the image
   count as 0. A tent keeps a point's centroid where it is; a box reduce would move it to the
   centre of its block, up to $(f - 1)/2$ px.
3. A Gaussian of $\sigma_{low}$ low-resolution pixels, weights at offsets $-R$ to $R$,
   $R = \lceil 4\sigma_{low}\rceil$, normalised to sum 1, zero outside the reduced grid.
4. The peak $m$ of the reduced grid and $x = v/\max(m, 10^{-4})$: linear, from black to the
   brightest point, as the EHT shows its model images (Paper V, Figure 2: "the colormap is linear"); the
   floor makes a nearly empty image fade instead of jumping to full brightness.
5. Bilinear upsample at the pixel centres, clamped to the edges, then the colour map.

The tent reduce and the bilinear upsample each add the variance of a discrete hat function at
half-integer offsets $a = 1/2, 3/2, \dots, f - 1/2$ from its nodes: $a(f - a)$, which averages to
$(f^2 + 1/2)/6$ px² over the sub-texel phase. So
$\sigma_{low} = \sqrt{\sigma_{px}^2 - (f^2 + 1/2)/3}\thinspace/\thinspace f$ for $f \ge 2$, and $\sigma_{px}$ for
$f = 1$. Six low-resolution pixels per $\sigma$ keep the peak that the normalisation reads on the
reduced grid within 0.7 % for a single point between texels (with four, a render at 30 M
differed from a direct full-resolution Gaussian by 2 levels of 255). At 1920 x 1080 the plan is
$f = 4$, a 480 x 270 grid and 89 taps per pass.

**The colour map.** The afmhot formula, in display (sRGB-encoded) values: red $2x$, green
$2x - 1/2$, blue $2x - 1$, each clipped to $[0, 1]$: black, red, orange, yellow, white (gnuplot's
`rgbformulae 34,35,36`, described in its documentation as "AFM hot (black-red-yellow-white)";
matplotlib's `afmhot`, `_cm.py`). It is written from the formula; no code or table was copied.
A table of 1025 entries holds the knots 0.25, 0.5 and 0.75 exactly, so linear interpolation in
it reproduces the formula. The EHT's own colour maps (the ehtplot library, GPL-3.0) were not
used or opened. Over the top quarter of the range the colours change little in lightness, so the
brightest regions merge.

**Measured on the CPU twin** at the preset (`tests/unit/eht-render.test.ts`, 432 x 432, one
sample per pixel): the ring, the peak of the azimuthal mean of the blurred image, lies at
$b = 12.53M$, so it is 25.1 M across, 2.3 times M87*'s ring of $11\thinspace\theta_g$
($11^{+0.5}_{-0.3}$, Paper I, Table 1) in units of M; the bright side, the brightness-weighted
direction around the ring, is at position angle 194.9 degrees, inside M87*'s published 150 to
200 degrees (Paper I, Table 1). At sizes from 192 to 640 px the ring lies at 12.52 to 12.57 M and
the bright side at 194.83 to 194.88 degrees. With the Newtonian profile of Stages 1 to 7 these were
$11.21M$ (22.4 M across, about twice M87*'s) and 196.7 degrees: the ring moved out with the
flux peak.

**What it is not** (also in the page's legend, the About text and the README):

1. Different light: the EHT explains M87*'s image with models in which hot plasma shines by
   synchrotron emission (Paper V, abstract and section 2), and it calls a geometrically thick,
   optically thin accretion flow the conventional model (Paper V, section 1); this disk is a thin,
   opaque blackbody toy with the Page-Thorne flux (section 10).
2. A different ring: in the EHT's models the ring is "related to the lensed photon ring" (Paper I,
   section 6); here the bright ring is the disk's direct image near its flux peak, 2.3 times the
   size in units of M (above). Nothing emits inside the ISCO, so the dark centre is wider than the
   shadow (compare section 6a, which cites Chael, Johnson and Lupsasca 2021).
3. A different asymmetry: here the Keplerian disk's Doppler beaming; in the EHT's best-fitting
   models it arises in the funnel wall (Paper V, Figure 5).
4. All frequencies, not 230 GHz.
5. A perfect image, blurred: no interferometric reconstruction, no artefacts, no scattering, no
   variability, no turbulence.
6. Schwarzschild only (the EHT found the models of non-spinning black holes in its library
   inconsistent with the observations of M87*, because they do not produce sufficiently powerful
   jets: Paper V, abstract), and a camera at 200 M, not at M87*'s distance.
7. False colour on a relative scale: the colours encode brightness only, linear from black to the
   image's brightest point; the map is not the EHT's own.

**Checks** (`tests/unit/eht.test.ts`, `tests/unit/eht-post.test.ts`,
`tests/unit/eht-render.test.ts`, `tests/gpu/eht.spec.ts`, `tests/e2e/eht.spec.ts`; values in
`docs/VALIDATION.md`). The bolometric compositing reproduces $g^4\hat F = (g\hat T)^4$ with the
library's redshift; the pixel scale equals a central difference of the image radius; the framing fits 28 M
into the shorter side; the roll turns the image and puts the disk axis at 108 degrees; the colour
table reproduces the formula; the discrete chain's variance and the point response match the
beam; the downsampled blur stays within 1 level of a direct full-resolution Gaussian on a toy
annulus, a 1 px ring, a single pixel and the CPU renders at 200 M and 30 M; the images at
$\pm 73$ degrees are mirror images; and on the GPU the brightness per crossing, the linear image,
the post-process passes, the final image and the preview agree with the CPU reference.

## 11. Floating point

- **f32 emulation.** `Math.fround(a op b)` on f32 inputs gives the f32 result rounded to nearest
  (ties to even) for $+, -, \times, \div$ and square root, because rounding first to binary64 is
  innocuous when the intermediate precision (53 bits) is at least $2 \times 24 + 2$ (Figueroa 1995,
  as restated and proved for binary32 inside binary64, underflow included, by Roux 2014).
- **No 64-bit floats in a running shader.** WGSL's concrete (run-time) floating-point types are f32
  and f16 (WGSL, section 6.2.4); its 64-bit AbstractFloat cannot be named in WGSL source and exists
  only for expressions evaluated when the shader is created (section 6.2.1). The renderer is
  therefore designed for f32.
- **WGSL is looser** (WGSL, section 15.7.4 "Floating Point Accuracy"): $+, -, \times$ are correctly
  rounded in WGSL's sense, which allows the representable value on either side of the exact result
  (section 15.7.4 specifies no rounding mode), so up to 1 ULP where `Math.fround` rounds to nearest;
  $x/y$ is 2.5 ULP for $|y|$ in $[2^{-126}, 2^{126}]$; `sqrt` is inherited from
  `1.0 / inverseSqrt(x)` (2 ULP plus the division); `sin` and `cos` have absolute error up to
  $2^{-11}$ on $[-\pi, \pi]$, and the spec leaves their accuracy undefined outside that range.
  Implementations may reassociate operations (section 15.7.5), which can change the rounding, and
  may flush subnormal inputs and outputs of these operations to zero (section 15.7.2); the emulation
  models neither. Fusion is allowed only where the result is at least as accurate (section 15.7.5).
  The emulation is therefore optimistic for the rounding direction of $+, -, \times$, for division,
  `sqrt` and transcendentals, and wherever reassociation or flushing to zero applies. Consequences
  for the renderer: the Binet inner loop uses only $+, -, \times$, and the Stage 0 study in
  `docs/DESIGN.md` (section 3, "Robustness to GPU arithmetic") perturbed every f32 result by up to
  about 2 ULP, more than the 1 ULP the spec allows for them; the final direction is computed without
  the built-in `sin`/`cos` (rotation recurrence, see `docs/DESIGN.md`); and the GPU result is
  checked against the CPU reference on hardware (`docs/VALIDATION.md`, items 7 and 11).

## References

Each entry was confirmed from its text, or, where the entry says so, from publisher metadata only.

- Aldi, G. F. and Bozza, V. (2017). Relativistic iron lines in accretion disks: the contribution
  of higher order images in the strong deflection limit. J. Cosmol. Astropart. Phys.
  2017(02), 033. doi:10.1088/1475-7516/2017/02/033, arXiv:1607.05365 (abstract; section 3, eqs.
  3.22 to 3.28, read in the ar5iv HTML rendering, which shows no version number; the journal
  reference is taken from the DOI)
- Aratore, F., Tsupko, O. Yu. and Perlick, V. (2024). Constraining spherically symmetric metrics by
  the gap between photon rings. Phys. Rev. D 109, 124057. doi:10.1103/PhysRevD.109.124057,
  arXiv:2402.14733 (abstract, eqs. 4 to 36 with the text around eqs. 10, 22 and 26, and eqs. 67
  to 71, numbered as in arXiv v2; the journal reference is taken from the DOI)
- Bardeen, J. M., Press, W. H. and Teukolsky, S. A. (1972). Rotating black holes: locally
  nonrotating frames, energy extraction, and scalar synchrotron radiation. ApJ 178, 347-369.
  doi:10.1086/151796 (eqs. 2.13, 2.16, 2.18 and 2.21)
- Bisnovatyi-Kogan, G. S. and Tsupko, O. Yu. (2022). Analytical study of higher-order ring images
  of the accretion disk around a black hole. Phys. Rev. D 105, 064040. doi:10.1103/PhysRevD.105.064040,
  arXiv:2201.01716 (abstract, eqs. 8 to 16 with the text that credits eq. 8, and eqs. 34 to 56
  with section VII, the example of a disk from 6 to 15 M whose solid angles eqs. 50 and 51 give
  from a numerical integration, numbered as in arXiv v1)
- Bozza, V. (2002). Gravitational lensing in the strong field limit. Phys. Rev. D 66, 103001.
  doi:10.1103/PhysRevD.66.103001, arXiv:gr-qc/0208075 (eqs. 25, 29 and 47 to 50, numbered as in
  arXiv v3)
- Bozza, V. and Scarpetta, G. (2007). Strong deflection limit of black hole gravitational lensing
  with arbitrary source distances. Phys. Rev. D 76, 083008. doi:10.1103/PhysRevD.76.083008,
  arXiv:0705.0246 (abstract, section II, eqs. 1 to 71, Fig. 4 and Appendix A, numbered as in
  arXiv v2)
- Cardoso, V., Miranda, A. S., Berti, E., Witek, H. and Zanchin, V. T. (2009). Geodesic
  stability, Lyapunov exponents, and quasinormal modes. Phys. Rev. D 79, 064016.
  doi:10.1103/PhysRevD.79.064016, arXiv:0812.1806 (eqs. 49 and 50, numbered as in arXiv v3)
- Carlson, B. C. (1995). Numerical computation of real or complex elliptic integrals. Numer.
  Algorithms 10, 13-26. doi:10.1007/BF02198293, arXiv:math/9409227 (duplication algorithm and
  the check values of section 3, numbered as in arXiv v1)
- Chael, A. kgeo: ray tracing of null geodesics in the Kerr metric (software, Python, GPL-3.0),
  https://github.com/achael/kgeo, commit bc5affe810650fdb2396a1defc645c089db9f9e4, version 0.0.1
  (its README, the four package files that define `r_equatorial`, `is_outside_crit`, `Iobs` and
  `Velocity`, and its ODE oracle `tests/geodesic_ode.py`, read at that commit; used for the
  cross-check of section 6b, called from a separate Python driver run outside photonring's build
  and tests; no kgeo code is in the repository; `docs/VALIDATION.md`, "Outside code: kgeo")
- Chael, A., Johnson, M. D. and Lupsasca, A. (2021). Observing the inner shadow of a black hole:
  a direct view of the event horizon. ApJ 918, 6. doi:10.3847/1538-4357/ac09ee, arXiv:2106.00683
  (arXiv v1, pp. 2 to 3)
- CIE (2018). CIE standard illuminant A - 1 nm. Dataset, International Commission on
  Illumination, doi:10.25039/CIE.DS.8jsxjrsn (used only to check the illuminant A chromaticity
  in the tests; no value from it is quoted)
- CIE (2019). Colour-matching functions of CIE 1931 standard colorimetric observer. Dataset,
  International Commission on Illumination, doi:10.25039/CIE.DS.xvudnb9b, licence CC BY-SA 4.0
  (four sample values quoted in tests)
- Cunningham, C. T. (1975). The effects of redshifts and focusing on the spectrum of an accretion
  disk around a Kerr black hole. ApJ 202, 788-802. doi:10.1086/154033 (eqs. 2 and 6)
- Darwin, C. G. (1959). The gravity field of a particle. Proc. R. Soc. Lond. A 249, 180-194.
  doi:10.1098/rspa.1959.0015 (citation and abstract confirmed; full text not read)
- DLMF: NIST Digital Library of Mathematical Functions, section 19.29 (reduction of general
  elliptic integrals), eqs. 19.29.4 and 19.29.5, release 1.2.8 of 2026-09-15,
  https://dlmf.nist.gov/19.29
- Figueroa, S. A. (1995). When is double rounding innocuous? ACM SIGNUM Newsletter 30(3), 21-26.
  doi:10.1145/221332.221334 (metadata only; its result as restated and proved by Roux 2014)
- Event Horizon Telescope Collaboration (2019). First M87 Event Horizon Telescope Results. I. The
  Shadow of the Supermassive Black Hole. ApJL 875, L1. doi:10.3847/2041-8213/ab0ec7,
  arXiv:1906.11238 (sections 1, 3, 5, 6 and 7, Table 1, Figure 3)
- Event Horizon Telescope Collaboration (2019). First M87 Event Horizon Telescope Results. V.
  Physical Origin of the Asymmetric Ring. ApJL 875, L5. doi:10.3847/2041-8213/ab0f43,
  arXiv:1906.11242 (abstract, sections 1 and 2; Figures 1, 2, 4 and 5)
- Event Horizon Telescope Collaboration (2022). First Sagittarius A* Event Horizon Telescope
  Results. V. Testing Astrophysical Models of the Galactic Center Black Hole. ApJL 930, L16.
  doi:10.3847/2041-8213/ac6672, arXiv:2311.09478 (section 1, read in the ar5iv HTML rendering;
  posted on arXiv in 2023)
- Gralla, S. E., Holz, D. E. and Wald, R. M. (2019). Black hole shadows, photon rings, and lensing
  rings. Phys. Rev. D 100, 024018. doi:10.1103/PhysRevD.100.024018, arXiv:1906.00873 (sections I
  to III, eqs. 2 and 13 to 15, read in the HTML rendering of arXiv v2)
- Gralla, S. E. and Lupsasca, A. (2020). Lensing by Kerr black holes. Phys. Rev. D 101, 044031.
  doi:10.1103/PhysRevD.101.044031, arXiv:1910.12873 (section IV.1, read in the HTML rendering of
  arXiv v2)
- Iyer, S. V. and Petters, A. O. (2007). Light's bending angle due to black holes: from the photon
  sphere to infinity. Gen. Rel. Grav. 39(10), 1563-1582. doi:10.1007/s10714-007-0481-8,
  arXiv:gr-qc/0611086 (eqs. 8, 25 and 27 with the definition $b' = 1 - b_c/b$ and the constants
  $\sigma_1$ and $\rho_1$ of eq. 27, numbered as in arXiv v2)
- Johnson, M. D. et al. (2020). Universal interferometric signatures of a black hole's photon
  ring. Sci. Adv. 6, eaaz1310. doi:10.1126/sciadv.aaz1310, arXiv:1907.04329 (eqs. 7, 12 and 14
  and footnote 3, read in the HTML rendering of arXiv v2)
- Jarzynski, M. and Olano, M. (2020). Hash functions for GPU rendering. Journal of Computer
  Graphics Techniques 9(3), 20-38. https://jcgt.org/published/0009/03/02/ (pcg3d, section 6.1)
- Keeton, C. R. and Petters, A. O. (2005). Formalism for testing theories of gravity using lensing
  by compact objects: static, spherically symmetric case. Phys. Rev. D 72, 104006.
  doi:10.1103/PhysRevD.72.104006, arXiv:gr-qc/0511019 (eqs. 24 and 25, numbered as in arXiv v1)
- Lindquist, R. W. (1966). Relativistic transport theory. Ann. Phys. 37, 487-518.
  doi:10.1016/0003-4916(66)90207-7 (metadata only; cited by Cunningham 1975 for Liouville's
  theorem, which his eq. 6 uses)
- Luminet, J.-P. (1979). Image of a spherical black hole with thin accretion disk. A&A 75,
  228-235. ADS 1979A&A....75..228L (eqs. 6, 18 and 19; p. 233)
- NIST CODATA: second radiation constant $c_2$, exact,
  https://physics.nist.gov/cgi-bin/cuu/Value?c22ndrc
- Mueller, T. and Frauendiener, J. (2012). Interactive visualization of a thin disc around a
  Schwarzschild black hole. Eur. J. Phys. 33, 955. doi:10.1088/0143-0807/33/4/955,
  arXiv:1206.4259 (eq. 11 and the peak values printed below it, numbered as in arXiv v1; the
  journal reference is taken from the arXiv record; their program was not opened)
- Page, D. N. and Thorne, K. S. (1974). Disk-accretion onto a black hole. I. Time-averaged
  structure of accretion disk. ApJ 191, 499-506. doi:10.1086/152990 (eqs. 10b, 11b, 12, 13, 14
  and 15a to 15n, section III.d and footnote 2, read in the NASA ADS scan; the flux of section 10)
- Perlick, V. and Tsupko, O. Yu. (2022). Calculating black hole shadows: review of analytical
  studies. Phys. Rep. 947, 1-39. doi:10.1016/j.physrep.2021.10.004, arXiv:2105.07101 (eqs. 6 to
  8, numbered as in arXiv v2)
- Roux, P. (2014). Innocuous double rounding of basic arithmetic operations. Journal of Formalized
  Reasoning 7(1), 131-142. doi:10.6092/issn.1972-5787/4359
- Shakura, N. I. and Sunyaev, R. A. (1973). Black holes in binary systems. Observational
  appearance. A&A 24, 337-355. ADS 1973A&A....24..337S, no DOI (eq. 2.6; p. 344; the Newtonian
  profile of Stages 1 to 7, kept as the large-radius limit in section 10)
- Software consulted for the afmhot formula only (no code copied): gnuplot 6.1 documentation,
  "rgbformulae", https://gnuplot.sourceforge.net/docs_6.1/loc15420.html; matplotlib
  `lib/matplotlib/_cm.py` (`_g34`, `_g35`, `_g36`, `_afmhot_data`), commit
  95a3d2929ba2a1c2c2f3afbf343d38e04066de7d
- Synge, J. L. (1966). The escape of photons from gravitationally intense stars. MNRAS 131,
  463-466. doi:10.1093/mnras/131.3.463 (eqs. 8 to 11 and 14)
- Tsupko, O. Yu. (2022). Shape of higher-order images of equatorial emission rings around a
  Schwarzschild black hole: analytical description with polar curves. Phys. Rev. D 106, 064033.
  doi:10.1103/PhysRevD.106.064033, arXiv:2208.02084 (abstract, introduction, eqs. 1 to 27,
  section III D with Figs. 6 and 7, and Appendix A, eqs. 28 to 54, numbered as in arXiv v2; Fig. 6
  digitized from the raster embedded in the arXiv v2 PDF, as `docs/VALIDATION.md` describes)
- W3C CSS Color Module Level 4, Candidate Recommendation Draft, 27 October 2026, section 19
  "Sample code for Color Conversions", https://www.w3.org/TR/2026/CRD-css-color-4-20261027/, and
  its sample code file https://drafts.csswg.org/css-color-4/conversions.js (`XYZ_to_lin_sRGB`,
  `gam_sRGB`; matrix and transfer function after IEC 61966-2-1, which was not read)
- WGSL: WebGPU Shading Language, W3C Candidate Recommendation Draft, 26 October 2026, sections
  6.2.1, 6.2.4, 15.7.2, 15.7.4 and 15.7.5, https://www.w3.org/TR/2026/CRD-WGSL-20261026/
- Wyman, C., Sloan, P.-P. and Shirley, P. (2013). Simple analytic approximations to the CIE
  XYZ color matching functions. Journal of Computer Graphics Techniques 2(2), 1-11.
  https://jcgt.org/published/0002/02/01/ (multi-lobe fit, eq. 4 and table 1)
