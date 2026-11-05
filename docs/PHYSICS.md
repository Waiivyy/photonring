# Physics specification and derivations

Every formula the code relies on is derived here, checked against a primary source, and covered by
a test in `tests/`. The references at the end were read in full or at the cited pages (journal
scans, arXiv full text, publisher, DLMF, NIST, CIE and W3C pages), except Darwin (1959), Figueroa
(1995), Lindquist (1966) and Bozza and Scarpetta (2007), whose entries say so, and IEC 61966-2-1,
named only as the basis of the CSS Color 4 sample code. Papers read on arXiv are cited with the equation numbers of the arXiv
version their entry names; the journal versions were not compared.

## 1. Conventions

- Schwarzschild metric, geometric units G = c = 1:
  $ds^2 = -(1-2M/r)\,dt^2 + (1-2M/r)^{-1}dr^2 + r^2 d\Omega^2$.
- Library functions take the mass `M` explicitly so the flat-space limit (M = 0) and scaling with
  M can be tested. The renderer uses M = 1, so lengths in the UI are in units of $GM/c^2$.
- $u = 1/r$. Primes on $u$ mean $d/d\phi$.

## 2. Null geodesics and the orbit equation

By spherical symmetry every geodesic lies in a plane through the origin; take it as the equatorial
plane. With affine parameter $\sigma$, the conserved energy and angular momentum are
$E = (1-2M/r)\,dt/d\sigma$ and $L = r^2\,d\phi/d\sigma$. The null condition gives

$$\left(\frac{dr}{d\sigma}\right)^2 = E^2 - \left(1-\frac{2M}{r}\right)\frac{L^2}{r^2}.$$

With the impact parameter $b = L/E$ and $u = 1/r$:

$$u'^2 = P(u) \equiv \frac{1}{b^2} - u^2 + 2Mu^3, \qquad u'' + u = 3Mu^2 .$$

(`orbitPolynomial` in `src/physics/orbits.ts`.) Both match the forms in the project brief.

**Photon sphere and $b_c$.** Turning points satisfy $V(r) = 1/b^2$ with the photon potential
$V(r) = (1-2M/r)/r^2$. $V'(r) = 0$ at $r = 3M$, $V(3M) = 1/(27M^2)$, so $b_c = 3\sqrt{3}\,M
\approx 5.196\,M$. The photon orbit is Bardeen, Press and Teukolsky (1972), eq. (2.18) with
$a = 0$, and $b_c$ is Perlick and Tsupko (2022), eq. (8). $V''(3M) < 0$: the circular null orbit
is a maximum of $V$ and is unstable. Equivalently $P(1/3M) = P'(1/3M) = 0$ at $b = b_c$ (a double
root). Tested numerically by a golden-section search for the maximum of $V$.

**Instability rate.** Linearising $u'' = 3Mu^2 - u$ about $u = 1/(3M)$ gives
$\delta u'' = (6Mu - 1)\,\delta u = \delta u$: perturbations grow as $e^{\phi}$, a factor
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

$$\frac{d L^2}{dr} = \frac{M r (r-6M)}{(r-3M)^2},$$

so $L^2$ has its minimum at $r = 6M$ and orbits inside it are unstable: the ISCO is at $6M$
(Bardeen, Press and Teukolsky 1972, eq. 2.21). The angular velocity is
$\Omega = d\phi/dt = \sqrt{M/r^3}$ (their eq. 2.16 with $a = 0$). With
$u^\mu = u^t(1, 0, 0, \Omega)$, normalisation $u \cdot u = -1$ gives
$(u^t)^2[(1-2M/r) - r^2\Omega^2] = 1$, hence $u^t = (1 - 3M/r)^{-1/2}$.

## 4. Euclidean (Cartesian) form of the geodesic equation

Treat $(r, \phi)$ as polar coordinates of a Euclidean plane, $\mathbf{x} = r(\cos\phi, \sin\phi)$,
and choose a parameter $\lambda$ with $r^2\,d\phi/d\lambda = h$ constant. For a central
acceleration $\mathbf{x}'' = F(r)\,\hat{\mathbf{x}}$, Binet's formula gives
$F = -h^2u^2(u'' + u) = -3Mh^2u^4$, so

$$\mathbf{x}'' = -\frac{3Mh^2\,\mathbf{x}}{r^5}, \qquad h = |\mathbf{x}\times\mathbf{x}'| .$$

The force is central, so $h$ is conserved and the motion stays in the plane of $\mathbf{x}$ and
$\mathbf{x}'$; the same equation therefore holds in 3D with no polar singularity. This verifies the
form in the brief.

**Affine parameter.** $r^2\,d\phi/d\sigma = L$ and $r^2\,d\phi/d\lambda = h$ give
$d\lambda/d\sigma = h/L$: $\lambda$ is an affine parameter, rescaled by a constant.

**Initial speed.** From section 2, $(dr/d\lambda)^2 = h^2[1/b^2 - (1-2M/r)/r^2]$ and
$r^2(d\phi/d\lambda)^2 = h^2/r^2$, so

$$|\mathbf{x}'|^2 = h^2\left(\frac{1}{b^2} + \frac{2M}{r^3}\right),$$

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
large $b$). With $k = 1/(3M)$ and $\vartheta = \pi/3 - \eta =
\tfrac43\arcsin\sqrt{(b-b_c)/(2b)}$, the roots and their differences become

$$
u_{1,2} = k\sin^2\tfrac{\eta}{2} \mp \tfrac{\sqrt3}{2}k\sin\eta,\quad
u_3 = k(\tfrac12 + \cos\eta),
$$

$$
u_3-u_2 = \sqrt3\,k\sin\vartheta,\quad u_2-u_1 = \sqrt3\,k\sin\eta,\quad
u_3-u_1 = \sqrt3\,k\cos(\eta-\tfrac{\pi}{6}),\quad \tfrac{1}{3M}-u_2 = k(\sin^2\tfrac{\vartheta}{2} +
\tfrac{\sqrt3}{2}\sin\vartheta).
$$

`orbitRoots` computes whichever of $\eta$ or $\vartheta$ is small directly. Tests check the Vieta
relations ($\sum u_i = 1/(2M)$, $\prod u_i = -1/(2Mb^2)$, pairwise sum $= 0$) for
$b/b_c$ from $1 + 10^{-9}$ to $10^5$.

## 6. Static observer

The static observer at radius $r$ has the orthonormal frame
$e_{\hat t} = (1-2M/r)^{-1/2}\partial_t$, $e_{\hat r} = (1-2M/r)^{1/2}\partial_r$,
$e_{\hat\theta} = r^{-1}\partial_\theta$, $e_{\hat\phi} = (r\sin\theta)^{-1}\partial_\phi$.
A photon has local energy $E/\sqrt{1-2M/r}$ and local tangential momentum $L/r$, so its angle
$\psi$ from the radial direction satisfies

$$\sin\psi = \frac{b}{r}\sqrt{1-\frac{2M}{r}} .$$

This is Synge (1966), eqs. (8) to (11), in his variables $\rho = r/2M$ and $\beta = 2M/b$: his
eq. (11), $\sin^2\psi = (\rho - 1)/(\rho^3\beta^2)$, expands to $(b^2/r^2)(1 - 2M/r)$.

**Shadow.** Rays with $b < b_c$ traced backwards are captured, so the shadow edge is at

$$
\sin\psi_{sh} = \frac{3\sqrt3\,M}{r_o}\sqrt{1-\frac{2M}{r_o}}, \qquad
\cos\psi_{sh} = \frac{(r_o-3M)\sqrt{r_o+6M}}{r_o^{3/2}},
$$

measured from the direction to the black hole. The cosine follows from the factorisation
$r^3 - 27M^2r + 54M^3 = (r-3M)^2(r+6M)$; its sign selects $\psi_{sh} > \pi/2$ inside the photon
sphere, and `shadowAngularRadius` uses `atan2` of the pair, which stays accurate at $r_o = 3M$.
This matches Perlick and Tsupko (2022), eqs. (6) and (7), and Synge's escape-cone result (1966,
eq. 14; Synge treats emitters inside $3M$). It differs from the naive $\arcsin(b_c/r_o)$: at
$r_o = 30M$ it is $9.633°$ against $9.974°$, 3.4 % smaller (`npm run measure`). The brief's
formula is confirmed.

**Local direction to Euclidean velocity.** A local unit direction $d$ has coordinate velocity
proportional to $(\sqrt{1-2M/r}\,d_{\hat r},\ d_{\hat\theta}/r,\ d_{\hat\phi}/(r\sin\theta))$, so
in the Euclidean picture of section 4

$$\mathbf{x}' \propto d - \left(1 - \sqrt{1-2M/r}\right)(d\cdot\hat{\mathbf r})\,\hat{\mathbf r},$$

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

**Image order.** The order-$n$ image of a ring point is reached at the $(n+1)$-th crossing of
the disk plane along the backward ray, not counting the observer's own position: the same order
in which `traceRay` and the WGSL crossing log record crossings. For the image direction
$\theta$, measured from image right towards image up, the ray plane is spanned by $e_1$, the
direction from the hole to the observer (minus forward), and
$e_2 = \cos\theta\, r + \sin\theta\, u$, where $r$ and $u$ are the camera's right and up
vectors. The camera frame has a horizontal right vector and an up vector with $z$ component
$\cos\epsilon$ at elevation $\epsilon$, so the $z$ components are $\sin\epsilon$ for $e_1$
and $\sin\theta\cos\epsilon$ for $e_2$. The crossings are at $\phi_0 + n\pi$, where
`firstPlaneCrossingAngle` (shared with `traceRay`) gives $\phi_0$ from those two components.
The curves do not depend on the azimuth: a rotation about the disk axis turns the ring and the
camera together.

**The view angle of a ring point.** `ringImageAngle(r_o, R, sweep)` returns the angle $\alpha$
from the direction to the hole at which the observer sees the point of radius $R$ that the
backward ray reaches after sweeping the orbital angle `sweep`. With
$k = \sqrt{1-2M/r_o}/r_o$, $\sin\alpha = k\,b$. Writing $\Phi(b; u_A, u_B)$ for the swept angle
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
  $\psi_{sh} < \alpha \le \pi/2$ and the sweep is $2\,\Phi(b; u_o, u_2)$.

Each branch is monotone, so every sweep has one root; the plunging branch is proved above, and
the other branches are checked numerically: a scan over 2000 view angles in six cases finds
exactly one sign change of $r(\text{sweep}) - R$.

**Numerics.** Brent's method (tolerance $10^{-15}$ in its variable, at most 100 iterations). A
branch's bracket is split once at its midpoint, and the half that holds the root is solved in a
variable measured from its own end, so angles very close to $0$, to $\pi$ or to the edge keep
full relative precision: $\ln\alpha$, $\ln(\pi - \alpha)$, $\ln|\alpha - \psi_{sh}|$, or
$\alpha$ itself at a regular end such as the fold. The far end of each bracket is a nearly
radial ray chosen from the sweep: for $b \le b_c/2$, $1/\sqrt{P} \le 1.155\,b$, so
$b = \text{sweep}/(4\,|u_R - u_o|)$ has a sweep below $0.29$ of the target, which makes the
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
$r_o \in \{5, 5.5, 6, 6.5, 10, 30, 200\}$, $R \in \{2, 3, 6\}$ and eight sweeps up to $2\pi$, and
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
with its own code: an independent check, not a new result. Strong-deflection formulas for
sources at finite distance are not new either (Bozza and Scarpetta 2007, abstract read).

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
the order-$n$ image of the ring $R$ is the root of

$$\Phi(b) \equiv \int_{u_o}^{u_2}\frac{du}{\sqrt{P}} + \int_{u_R}^{u_2}\frac{du}{\sqrt{P}} = \phi_0 + n\pi .$$

$\Phi$ falls monotonically from infinity at $b_c$ to its value for the ray that turns at
$\max(u_o, u_R)$, so the root is unique. For the default disk's edges (6 and 20 M) and observers
at 5, 6.5, 30 and 200 M that smallest sweep is between 0.55 and 2.04 rad (computed with
`outboundSweep`), below $\pi$, so every image of order $n \ge 1$ lies on this branch.

**The critical orbit's sweep.** At $b = b_c$ the orbit polynomial factorises,
$P_c(u) = 2M\,(u - \tfrac{1}{3M})^2\,(u + \tfrac{1}{6M})$. The substitution
$u = -\tfrac{1}{6M} + \tfrac{1}{2M}\tanh^2 x$ gives $u + \tfrac{1}{6M} = \tanh^2 x/(2M)$ and
$u - \tfrac{1}{3M} = -(1 - \tanh^2 x)/(2M)$, so $\sqrt{P_c} = \tanh x\,(1 - \tanh^2 x)/(2M)$,
while $du = \tanh x\,(1 - \tanh^2 x)\,dx/M$; hence $du/\sqrt{P_c} = 2\,dx$. Integrating from
$u = 0$ ($\tanh x = 1/\sqrt3$) to $u$:

$$\Delta\phi_c(u) = 2\left[\operatorname{artanh}\sqrt{2Mu + \tfrac13} - \operatorname{artanh}\tfrac{1}{\sqrt3}\right],\qquad 0 \le u < \tfrac{1}{3M}.$$

Values: $\Delta\phi_c(1/30) = 0.174038$, $\Delta\phi_c(1/20) = 0.262589$,
$\Delta\phi_c(1/6) = 0.975474$ (`criticalOrbitSweep`). It diverges at the photon sphere, where the
critical orbit circles forever.

**Leading order.** For a ray from infinity to infinity, Bozza's law (section 8) gives
$\Phi_{\infty\infty} = \pi + \alpha = -\ln\varepsilon + \ln C + O(\varepsilon\ln\varepsilon)$ with
$\varepsilon = b/b_c - 1$ and $C = 216(7 - 4\sqrt3) = 15.5081$. Each leg carries half of it, and
the part of a leg between infinity and a finite radius tends to the critical orbit's sweep with an
$O(\varepsilon)$ error, because the integrand is smooth there. Subtracting those parts,

$$\varepsilon_n(R) \approx C\,e^{-\Delta\phi_c(u_o) - \Delta\phi_c(u_R)}\,e^{-\phi_0}\,e^{-n\pi}$$

(`subringOffsetLeadingOrder`; derived for this project and checked numerically below). This
formula carries the main consequences: successive offsets of one edge, and so the widths of the
bands, shrink by $e^{\pi}$ per half-turn; on a $\log_{10}\varepsilon$ axis the bands repeat every
$\pi/\ln 10 = 1.364$ decades; and the view enters only through $\phi_0$, which is $\pi/2$ along the
horizontal image axis at every elevation. ($C\,b_c = 1944M/(12 + 7\sqrt3) = 80.58M$ is Gralla, Holz
and Wald's $C_+$.) Its error is $-2.4\,\%$, $-0.28\,\%$ and $-0.019\,\%$ at $R = 6M$ for $n = 1$
to 3 face-on at $30M$, and within $0.304\,\varepsilon\,(\ln(1/\varepsilon) + 2)$ for $n = 1$ to 5
in the five view directions of the test, at both disk edges.

**How fast the ratio approaches $e^{\pi}$.** Write
$\Phi = -\ln\varepsilon + K + c\,\varepsilon\ln(1/\varepsilon) + d\,\varepsilon + \dots$. The step
$\Phi(\varepsilon_{n+1}) - \Phi(\varepsilon_n) = \pi$ then gives
$\delta_n \equiv (\varepsilon_n/\varepsilon_{n+1})/e^{\pi} - 1 \approx (1 - e^{-\pi})\,c\,\varepsilon_n\ln(1/\varepsilon_n) + A\,\varepsilon_n$.
For rays from infinity $c = 5/18$ (Iyer and Petters 2007, eq. 25, section 8). With that $c$ the
fitted $A$ is constant to three or four digits ($-0.28$ at $6M$, $+0.69$ at $20M$, $\lvert A\rvert \le 0.72$
including $n = 1$). That $c = 5/18$ also holds for finite radii is a fit to these numbers, not a
derivation. The test bound $\lvert\delta_n\rvert \le \tfrac{5}{18}\varepsilon_n\ln(1/\varepsilon_n) + 1.5\,\varepsilon_n$
covers both terms; its first term is larger than the leading one by $1/(1 - e^{-\pi}) = 1.045$.

**Solver.** `outboundImageOffset(u_o, u_R, sweep)` solves $\Phi = $ sweep by Brent's method
(section 6a) in $\ln\varepsilon$, so $\varepsilon$ keeps full relative precision, with $\Phi$ from
the Carlson form of section 8 and the bracket started at the leading-order estimate; $u = 0$ means
infinity. `ringImageOffset(r_o, R, sweep)` uses it whenever the sweep is beyond the branch's
smallest value and otherwise converts the result of `ringImageAngle` with
$\varepsilon = \sin\alpha/(k\,b_c) - 1$; `subringOffset` passes $\phi_0 + n\pi$. The offsets are
computed by the 64-bit library; they are predictions of the model, not measurements of an image.
The limit of f64: $b = b_c(1 + \varepsilon)$ moves in steps of one unit in the last place, about
$1.7\times10^{-16}\,b_c$, so $\varepsilon$ is resolved only to about $2\times10^{-16}/\varepsilon$
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
$\log_{10}\varepsilon = t - y\,(t - u)/H$, from $t = \min(0.5, \log_{10}\varepsilon_{max})$ down to
$u = -7.5$, where $\varepsilon_{max} = 1/(k\,b_c) - 1$ is the largest offset seen at all
($\sin\alpha = 1$; $-0.616$ at 5 M). The direction of a strip pixel is
$\cos\alpha\,\text{forward} + \sin\alpha\,(\cos\theta\,\text{right} + \sin\theta\,\text{up})$
with $\sin\alpha = k\,b_c(1 + \varepsilon)$. On this scale every band has the same height and
successive bands are $\pi/\ln 10 = 1.364$ decades apart. The GPU gets $(\cos\theta, \sin\theta)$ per
column and $(\cos\alpha, \sin\alpha)$ per row from tables computed in f64, and the tracer takes
$\sin\psi$ from them directly instead of from the length of $d - \cos\psi\,e_1$, a difference of
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

## 7. The Binet form used for integration

The planar orbit equation $u'' = 3Mu^2 - u$ with state $(u, w = u')$ is the integrator chosen in
Stage 0 (`integrateBinet` in `src/physics/integrators.ts`; the comparison is in
`docs/DESIGN.md`). The 3D tracer `traceRay` (`src/physics/raytrace.ts`) reduces every ray to it.
From the observer,

$$u_0 = 1/r_o, \qquad w_0 = -u_0\sqrt{1-2Mu_0}\,\cot\psi,$$

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
  vanishes at $\phi_0 + k\pi$ with $\phi_0 = \operatorname{atan2}(-e_{1z}, e_{2z})$ reduced to
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
  physical photon travels the other way, so its conserved $L_z/E = -b\,n_z$ with
  $b = r_o\sin\psi/\sqrt{1-2M/r_o}$; positive values co-rotate with the disk.
- **Flat space** ($M = 0$) is the straight line itself: the escape direction is $d$ exactly and
  the one possible crossing is the intersection of the line with $z = 0$.

## 7a. Camera

The camera is a static observer at $r_o$ on a sphere around the hole, at azimuth $\alpha$ and
elevation $\epsilon$ above the disk plane, looking at the hole (`cameraFrame` in
`src/physics/camera.ts`). Its basis is forward $= -\hat{\mathbf r}$,
up $= \partial\hat{\mathbf r}/\partial\epsilon = (-\sin\epsilon\cos\alpha,
-\sin\epsilon\sin\alpha, \cos\epsilon)$, which stays defined at the poles, and
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

$$
Q(u_2 - s^2) = Q_0 + \kappa s^2 - 2Ms^4,\qquad Q_0 = 6Mu_2\left(\tfrac{1}{3M}-u_2\right),\quad
\kappa = 6Mu_2 - 1,
$$

and the integral becomes $\int 2\,ds/\sqrt{Q_0 + \kappa s^2 - 2Ms^4}$: the turning-point
singularity is gone. Near $b_c$, $Q_0 \to 0$ and the integrand develops a peak of width
$\sqrt{Q_0/\kappa}$ at $s = 0$ (the logarithmic divergence of $\alpha$). The substitution
$s = c\sinh\tau$ with $c = \sqrt{Q_0/\kappa}$ turns it into
$2c\cosh\tau/\sqrt{Q_0\cosh^2\tau - 2Mc^4\sinh^4\tau}$, which is smooth and of order 1. A composite
20-point Gauss-Legendre rule with panels of width 0.5 in $\tau$ then converges to machine
precision. $Q_0$ is computed from the cancellation-free $1/(3M) - u_2$ of section 5.

**Method 2: elliptic integrals** (`sweptAngleElliptic`). With $X_i, Y_i$ the square roots of the
three factors $(u-u_1), (u_2-u), (u_3-u)$ at $x = u_B$ and $y = u_A$,

$$
\int_y^x \frac{du}{\sqrt{2M(u-u_1)(u_2-u)(u_3-u)}} = \frac{2}{\sqrt{2M}}\,
R_F(U_{12}^2, U_{13}^2, U_{14}^2),
$$

$$
U_{12} = \frac{X_1X_2Y_3 + Y_1Y_2X_3}{x-y},\quad U_{13} = \frac{X_1X_3Y_2 + Y_1Y_3X_2}{x-y},\quad
U_{14} = \frac{X_1Y_2Y_3 + Y_1X_2X_3}{x-y},
$$

which is DLMF 19.29.4 with the fourth factor set to 1 and the $U_{\alpha\beta}$ of 19.29.5 (DLMF
release 1.2.8). $R_F$ uses Carlson's duplication algorithm (Carlson 1995, with his check values as
tests). Sanity check: as $b \to \infty$ the formula reduces to
$\frac{2}{\sqrt2}R_C(\tfrac12, 1) = \pi/2$ for $M = 1$, the straight-line value.

Darwin (1959) is the classic source for the exact deflection, but its full text could not be
read, so the elliptic form here is cited to DLMF and Carlson instead; Luminet (1979, eq. 6) and
Iyer and Petters (2007, eq. 8) give equivalent closed forms in Legendre integrals.

**Agreement (measured, Apple M5, macOS 27, Node 25.6.1, `npm run measure`).** At the test's
values of $b/b_c$ from $1 + 10^{-8}$ to 1.1, with $M = 1$ and 2.5, the relative difference is at
most $1.05\times10^{-15}$. Beyond 1.1, up to $1000\,b_c$, it is at most $2.9\times10^{-12}$. The
larger value is cancellation in $2I - \pi$, not a disagreement of the two integrals: the
deflection falls to about $4M/b = 7.7\times10^{-4}$ rad at $1000\,b_c$, so a rounding-level
difference in $2I \approx \pi$ is a much larger fraction of it. The test tolerance is $10^{-11}$
relative up to $1000\,b_c$.

**Weak field.** $\alpha = \sum A_n (M/b)^n$ with $A_1 = 4$, $A_2 = 15\pi/4$, $A_3 = 128/3$,
$A_4 = 3465\pi/64$, $A_5 = 3584/5$, $A_6 = 255255\pi/256$ (Keeton and Petters 2005, eqs. 24 and
25). The brief's $\alpha \approx 4M/b$ is the first term. Measured (`npm run measure`): the
remainder after three terms over the fourth term is 1.044, 1.022, 1.009 and 1.004 at
$b = 100$, 200, 500 and $1000M$. The excess falls as $1/b$, as expected from the next term,
$(A_5/A_4)(M/b) = 4.2\times10^{-3}$ at $1000M$ (test bounds 0.95 to 1.06).

**Strong field.** Bozza (2002) eq. (50), with $\bar a = 1$ and
$\bar b = \ln[216(7-4\sqrt3)] - \pi \approx -0.4002$ (his eqs. 47 to 49; the paper uses units
$2M = 1$ and $u_m = 3\sqrt3/2$ there), written in the impact parameter:

$$
\alpha(b) = -\ln\left(\frac{b}{b_c} - 1\right) + \ln[216(7-4\sqrt3)] - \pi +
O\big((b-b_c)\ln(b-b_c)\big).
$$

The brief's "logarithmic divergence, coefficients from Bozza 2002" is confirmed. Bozza keeps only
the zeroth-order terms in the closest-approach distance $x_0$ and gives the remainder as
$O(x_0 - x_m)$, with $x_m$ the photon sphere radius (his eqs. 25 and 29); the error term above comes
from the series of Iyer and Petters (2007), eq. (25), in $b' = 1 - b_c/b$. With
$\varepsilon = b/b_c - 1$ and $\ln(1/b') = \ln(1/\varepsilon) + \varepsilon + O(\varepsilon^2)$, its
first correction gives the exact value minus the formula above as

$$
\varepsilon\left[\tfrac{5}{18}\ln\tfrac{1}{\varepsilon} + 1 + \tfrac{4\sqrt3 - 17}{18} +
\tfrac{5}{18}\ln[216(7-4\sqrt3)]\right] = \varepsilon\left(0.2778\ln\tfrac{1}{\varepsilon} +
1.2019\right),
$$

up to $O(\varepsilon^2\ln\varepsilon)$. Measured (`npm run measure`, test at
$\varepsilon = 10^{-3}$ to $10^{-7}$): the difference is $5.7\times10^{-7}$ rad at
$\varepsilon = 10^{-7}$ (test bound $10^{-5}$ rad), the value this series gives, and its log-log
slope against $\varepsilon$ is 0.935 (test bounds 0.8 to 1.2), the slope of the series at the same
five points.

## 8a. Swept angle of plunging photons

For $b < b_c$ the reference quadrature of section 8 stops at $u = 1/(4M)$, but the ring images of
section 6a need the swept angle through the photon sphere and past the horizon. With
$v = u - 1/(3M)$ the orbit polynomial is exactly

$$P = \varepsilon + v^2(1 + 2Mv), \qquad \varepsilon = \frac{1}{b^2} - \frac{1}{b_c^2} > 0,$$

because the linear terms cancel at $u = 1/(3M)$ and $1/b^2 - u^2(1-2Mu)$ there equals
$\varepsilon$. Since $1 + 2Mv \ge 1/3$ for every $u \ge 0$, the substitution
$v = \sqrt\varepsilon\sinh\tau$ gives

$$
\int \frac{du}{\sqrt{P}} = \int \frac{d\tau}{\sqrt{1 + 2M\sqrt\varepsilon\,
\sinh^3\tau/\cosh^2\tau}},
$$

a smooth, bounded integrand for any interval, evaluated by composite Gauss-Legendre with panels
of width $0.5$ in $\tau$ (at least four): `sweptAnglePlunging`. Checks: agreement with an
independent adaptive Simpson quadrature in $\ln|v|$ to $10^{-10}$ relative for
$b/b_c$ from $0.3$ to $0.999999$ (measured at most $3.4\times10^{-15}$, `npm run measure`), with
the section 8 quadrature where both apply, and continuity with the Carlson form across $b_c$.

## 9. Redshift

An emitter with $u^\mu = u^t(1, 0, 0, \Omega)$ and a photon with $p_t = -E$, $p_\phi = L_z$ give,
for an observer at rest at infinity,

$$g = \frac{\nu_{obs}}{\nu_{emit}} = \frac{1}{u^t\,(1 - \Omega L_z/E)}$$

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

## 10. Disk (toy model)

Shakura and Sunyaev (1973) eq. (2.6) gives the flux per face
$Q \propto R^{-3}[1 - (R_0/R)^{1/2}]$ with zero torque at the inner edge $R_0$. With
$Q = \sigma T^4$:

$$T(r) \propto r^{-3/4}\left(1 - \sqrt{r_{in}/r}\right)^{1/4},$$

as in the brief, with its maximum at $r = (49/36)\,r_{in} \approx 8.17M$ for $r_{in} = 6M$
(`diskTemperature`, normalised to 1 at the peak); Shakura and Sunyaev (1973, p. 344) give the
maximum of the flux at $R = 1.36\,R_0$. This is the Newtonian profile, not the relativistic Page
and Thorne (1974) solution, and the disk has no thickness, no radiative transfer, no
self-illumination and no magnetic fields. It is a toy for demonstration and must not be presented
as a model of any real observation.

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
  the Rayleigh-Jeans regime (measured ratio 2.027 between $10^6$ and $5\times10^5$ K).
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
  smoothly below 1. Validation and debug renders skip it and clamp to $[0, 1]$ instead.

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
adds $\tau\,a\,B(g\,T(r))$ and multiplies the transmittance $\tau$ by $1 - a$, where $a$ is
the disk opacity, $B$ the normalised blackbody colour and
$g = g_\infty(r, L_z/E)/\sqrt{1 - 2M/r_o}$; finally an escaped ray adds $\tau$ times the sky
radiance in its escape direction. Supersampling averages an $n \times n$ grid of samples per
pixel. Validation renders use one sample at each pixel centre, no disk, a sky of radiance 1 and
no tone mapping, so captured pixels are exactly 0 and escaped pixels exactly 1.

**On the GPU** (`src/shaders/render.wgsl` and `disk.wgsl`) the same compositing runs at each
crossing. $T$ and $g$ use only square roots and divisions, because WGSL's `pow` inherits the
loose error bounds of `exp2` and `log2`: $T = k\,s^{3/2}(1-s)^{1/4}$ with $s = \sqrt{r_{in}/r}$,
and $g = g_{obs}\sqrt{1-3M/r}\,/\,(1 - \Omega L_z/E)$ with $\Omega = \sqrt{M/r}/r$. Once the
transmittance is zero (an opaque disk) tracing stops, since nothing behind can be seen.

**Anti-aliasing** (`src/shaders/refine.wgsl`, `src/gpu/host/antialias.ts`). A second pass gives a
pixel the CPU renderer's $3 \times 3$ grid of samples (the centre one is the first pass's) when
either test holds:

- **Critical band.** Its footprint may contain an inward ray with $b_c \le b \le 1.02\,b_c$, or
  the shadow edge. The footprint's angular radius is at most the pixel's half-diagonal in the
  image plane at unit distance, $\delta = \sqrt2\tan(f/2)/H$, because the inverse gnomonic
  projection shrinks lengths (its local scale factors are $\cos\theta$ and $\cos^2\theta$). The
  test is therefore a range of the cosine of the angle between the pixel centre's direction and
  the direction to the hole, $[\cos(\psi_{out} + \delta), \cos(\psi_{sh} - \delta)]$, with
  $\sin\psi_{out} = 1.02\,b_c\sqrt{1-2M/r_o}/r_o$. In Bozza's strong-field limit ($\bar a = 1$),
  $b/b_c - 1 \approx e^{\bar b - \alpha}$, so images half a turn apart differ by a factor
  $e^{-\pi} \approx 1/23$ in $b/b_c - 1$: the photon ring and the higher-order images of the disk
  soon become thinner than a pixel, and a one-sample image can miss them entirely. The band
  holds every ray deflected by more than 3.56 rad, or 204 degrees (`deflectionAngleElliptic` at
  $1.02\,b_c$; the strong-field formula gives 3.51).
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

$$I = \sum_k \tau_k\,a\,\left(g\,\hat T(r_k)\right)^4,\qquad \tau_0 = 1,\quad \tau_{k+1} = \tau_k (1 - a),$$

with $g$ the frequency ratio of section 9 (including the static observer's factor), $\hat T$ the
temperature profile of section 10 normalised to 1 at its peak, and $a$ the disk opacity. Because
$I_\nu/\nu^3$ is invariant along a ray (section 9, Cunningham 1975, eq. 6), the observed
frequency-integrated intensity of a blackbody is $g^4$ times the emitted $\sigma T^4/\pi$; in units
of the peak emission that is $(g\hat T)^4$, so the peak temperature and the exposure drop out.
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

$$F_b = \frac{20}{3.8}\,M = 5.263\,M,\qquad \sigma_b = \frac{F_b}{2\sqrt{2\ln 2}} = 2.2351\,M$$

(`ehtBeamFwhmM`, `ehtBeamSigmaM`), 4.76 to 5.88 M over the uncertainty of $\theta_g$. Paper I
(section 7) calibrates the ring diameter in units of $\theta_g$ against its library of GRMHD
images, so this scale carries that calibration.

**Pixels per M.** With $k = \sqrt{1 - 2M/r_o}/r_o$, $\sin\psi = k\,b$ (section 6), and the
pinhole radius $\rho = (H/2)\tan\psi/\tan(f_y/2)$ (section 7a), the scale at the shadow edge is

$$s = \frac{d\rho}{db}\bigg|_{b_c} = \frac{H\,k}{2\tan(f_y/2)\cos^3\psi_{sh}}\ \text{px per } M$$

(`edgePixelScale`), and the blur is $\sigma_{px} = \sigma_b\,s$. Scaling by the shadow's own image
radius over $b_c$ instead would differ by exactly $\cos^2\psi_{sh}$ (0.99933 at 200 M, 0.972 at
30 M); the local scale is used because a beam is a local resolution and the ring lies just
outside the edge. Elsewhere the pinhole scale differs, so the beam is matched at the shadow edge
and is exact only for a distant observer; below 100 M the page says so.

**Framing and orientation.** The view chooses its own field of view: a circle of radius 28 M at
the edge scale fits the shorter image side, $\tan(f_y/2) = (28\,k/\cos^3\psi_{sh})\max(1, H/W)$
(`ehtFieldOfView`), capped at 120 degrees (closer than about 17.2 M), so the blur keeps the same
number of pixels per M at every distance: 15.876 degrees at 200 M for a 16:9 image. The image is
turned anticlockwise by 108 degrees (`M87_SKY_ROLL_DEG`): M87*'s approaching jet lies at position
angle about 288 degrees (Paper V, section 2), its spin points away from Earth (Paper I,
section 6), so the far end of the disk axis, which photonring draws up, projects to
$288 - 180 = 108$ degrees; after the turn north is up and east left, as on the sky. The roll
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
   brightest point, as the EHT shows its images (Paper V, Figure 2: "the colormap is linear"); the
   floor makes a nearly empty image fade instead of jumping to full brightness.
5. Bilinear upsample at the pixel centres, clamped to the edges, then the colour map.

The tent reduce and the bilinear upsample each add the variance of a discrete hat function at
half-integer offsets $a = 1/2, 3/2, \dots, f - 1/2$ from its nodes: $a(f - a)$, which averages to
$(f^2 + 1/2)/6$ px² over the sub-texel phase. So
$\sigma_{low} = \sqrt{\sigma_{px}^2 - (f^2 + 1/2)/3}\,/\,f$ for $f \ge 2$, and $\sigma_{px}$ for
$f = 1$. Six low-resolution pixels per $\sigma$ keep the peak that the normalisation reads on the
reduced grid within 0.7 % for a single point between texels (with four, a render at 30 M
differed from a direct full-resolution Gaussian by 2 levels of 255). At 1920 x 1080 the plan is
$f = 4$, a 480 x 270 grid and 87 taps per pass.

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
$b = 11.21M$, so it is 22.4 M across, about twice M87*'s ring of $11\,\theta_g$
($11^{+0.5}_{-0.3}$, Paper I, Table 1) in units of M; the bright side, the brightness-weighted
direction around the ring, is at position angle 196.7 degrees, inside M87*'s published 150 to
200 degrees (Paper I, Table 1).

**What it is not** (also in the page's legend, the About text and the README):

1. Different light: M87*'s 1.3 mm light is synchrotron emission from a hot, geometrically thick,
   optically thin flow (Paper I, section 1; Paper V, section 1); this disk is a thin, opaque,
   Newtonian blackbody toy (section 10).
2. A different ring: in the EHT's models the ring is "related to the lensed photon ring" (Paper I,
   section 6); here the bright ring is the disk's direct image near its flux peak, about twice the
   size in units of M (above). Nothing emits inside the ISCO, so the dark centre is wider than the
   shadow (compare Chael, Johnson and Lupsasca 2021, section 6a).
3. A different asymmetry: here the Keplerian disk's Doppler beaming; in the EHT's best-fitting
   models it arises in the funnel wall (Paper V, Figure 5).
4. All frequencies, not 230 GHz.
5. A perfect image, blurred: no interferometric reconstruction, no artefacts, no scattering, no
   variability, no turbulence.
6. Schwarzschild only, and a camera at 200 M, not at M87*'s distance.
7. False colour on a relative scale: the colours encode brightness only, linear from black to the
   image's brightest point; the map is not the EHT's own.

**Checks** (`tests/unit/eht.test.ts`, `tests/unit/eht-post.test.ts`,
`tests/unit/eht-render.test.ts`, `tests/gpu/eht.spec.ts`, `tests/e2e/eht.spec.ts`; values in
`docs/VALIDATION.md`). The bolometric compositing reproduces $(g\hat T)^4$ with the library's
redshift; the pixel scale equals a central difference of the image radius; the framing fits 28 M
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

- Bardeen, J. M., Press, W. H. and Teukolsky, S. A. (1972). Rotating black holes: locally
  nonrotating frames, energy extraction, and scalar synchrotron radiation. ApJ 178, 347-369.
  doi:10.1086/151796 (eqs. 2.13, 2.16, 2.18 and 2.21)
- Bozza, V. (2002). Gravitational lensing in the strong field limit. Phys. Rev. D 66, 103001.
  doi:10.1103/PhysRevD.66.103001, arXiv:gr-qc/0208075 (eqs. 25, 29 and 47 to 50, numbered as in
  arXiv v3)
- Bozza, V. and Scarpetta, G. (2007). Strong deflection limit of black hole gravitational lensing
  with arbitrary source distances. Phys. Rev. D 76, 083008. doi:10.1103/PhysRevD.76.083008,
  arXiv:0705.0246 (abstract only)
- Cardoso, V., Miranda, A. S., Berti, E., Witek, H. and Zanchin, V. T. (2009). Geodesic
  stability, Lyapunov exponents, and quasinormal modes. Phys. Rev. D 79, 064016.
  doi:10.1103/PhysRevD.79.064016, arXiv:0812.1806 (eqs. 49 and 50, numbered as in arXiv v3)
- Carlson, B. C. (1995). Numerical computation of real or complex elliptic integrals. Numer.
  Algorithms 10, 13-26. doi:10.1007/BF02198293, arXiv:math/9409227 (duplication algorithm and
  the check values of section 3, numbered as in arXiv v1)
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
  arXiv:1906.11242 (sections 1 and 2; Figures 1, 2, 4 and 5)
- Gralla, S. E., Holz, D. E. and Wald, R. M. (2019). Black hole shadows, photon rings, and lensing
  rings. Phys. Rev. D 100, 024018. doi:10.1103/PhysRevD.100.024018, arXiv:1906.00873 (sections I
  to III, eqs. 2 and 13 to 15, read in the HTML rendering of arXiv v2)
- Gralla, S. E. and Lupsasca, A. (2020). Lensing by Kerr black holes. Phys. Rev. D 101, 044031.
  doi:10.1103/PhysRevD.101.044031, arXiv:1910.12873 (section IV.1, read in the HTML rendering of
  arXiv v2)
- Iyer, S. V. and Petters, A. O. (2007). Light's bending angle due to black holes: from the photon
  sphere to infinity. Gen. Rel. Grav. 39(10), 1563-1582. doi:10.1007/s10714-007-0481-8,
  arXiv:gr-qc/0611086 (eqs. 8 and 25, numbered as in arXiv v2)
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
- Page, D. N. and Thorne, K. S. (1974). Disk-accretion onto a black hole. I. Time-averaged
  structure of accretion disk. ApJ 191, 499-506. doi:10.1086/152990 (title page and abstract
  read; cited only for the existence of the relativistic solution)
- Perlick, V. and Tsupko, O. Yu. (2022). Calculating black hole shadows: review of analytical
  studies. Phys. Rep. 947, 1-39. doi:10.1016/j.physrep.2021.10.004, arXiv:2105.07101 (eqs. 6 to
  8, numbered as in arXiv v2)
- Roux, P. (2014). Innocuous double rounding of basic arithmetic operations. Journal of Formalized
  Reasoning 7(1), 131-142. doi:10.6092/issn.1972-5787/4359
- Shakura, N. I. and Sunyaev, R. A. (1973). Black holes in binary systems. Observational
  appearance. A&A 24, 337-355. ADS 1973A&A....24..337S, no DOI (eq. 2.6; p. 344)
- Software consulted for the afmhot formula only (no code copied): gnuplot 6.1 documentation,
  "rgbformulae", https://gnuplot.sourceforge.net/docs_6.1/loc15420.html; matplotlib
  `lib/matplotlib/_cm.py` (`_g34`, `_g35`, `_g36`, `_afmhot_data`), commit
  95a3d2929ba2a1c2c2f3afbf343d38e04066de7d
- Synge, J. L. (1966). The escape of photons from gravitationally intense stars. MNRAS 131,
  463-466. doi:10.1093/mnras/131.3.463 (eqs. 8 to 11 and 14)
- W3C CSS Color Module Level 4, Candidate Recommendation Draft, 27 October 2026, section 19
  "Sample code for Color Conversions", https://www.w3.org/TR/2026/CRD-css-color-4-20261027/, and
  its sample code file https://drafts.csswg.org/css-color-4/conversions.js (`XYZ_to_lin_sRGB`,
  `gam_sRGB`; matrix and transfer function after IEC 61966-2-1, which was not read)
- WGSL: WebGPU Shading Language, W3C Candidate Recommendation Draft, 26 October 2026, sections
  6.2.1, 6.2.4, 15.7.2, 15.7.4 and 15.7.5, https://www.w3.org/TR/2026/CRD-WGSL-20261026/
- Wyman, C., Sloan, P.-P. and Shirley, P. (2013). Simple analytic approximations to the CIE
  XYZ color matching functions. Journal of Computer Graphics Techniques 2(2), 1-11.
  https://jcgt.org/published/0002/02/01/ (multi-lobe fit, eq. 4 and table 1)
