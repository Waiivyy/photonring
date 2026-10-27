# Physics specification and derivations

Every formula the code relies on is derived here, checked against a primary source, and covered by
a test in `tests/unit/`. References at the end list only sources whose text was read (journal
scans, arXiv full text, publisher or DLMF pages). Where a source could not be confirmed, this
document says so.

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
\approx 5.196\,M$. $V''(3M) < 0$: the circular null orbit is a maximum of $V$ and is unstable.
Equivalently $P(1/3M) = P'(1/3M) = 0$ at $b = b_c$ (a double root). Tested numerically by a
golden-section search for the maximum of $V$.

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

For circular timelike orbits, $L^2 = Mr^2/(r-3M)$ (`circularOrbitAngularMomentumSq`), and

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

$$ u_{1,2} = k\sin^2\tfrac{\eta}{2} \mp \tfrac{\sqrt3}{2}k\sin\eta,\quad
u_3 = k(\tfrac12 + \cos\eta),$$
$$u_3-u_2 = \sqrt3\,k\sin\vartheta,\quad u_2-u_1 = \sqrt3\,k\sin\eta,\quad
u_3-u_1 = \sqrt3\,k\cos(\eta-\tfrac{\pi}{6}),\quad \tfrac{1}{3M}-u_2 = k(\sin^2\tfrac{\vartheta}{2} +
\tfrac{\sqrt3}{2}\sin\vartheta).$$

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

**Shadow.** Rays with $b < b_c$ traced backwards are captured, so the shadow edge is at

$$\sin\psi_{sh} = \frac{3\sqrt3\,M}{r_o}\sqrt{1-\frac{2M}{r_o}}, \qquad
\cos\psi_{sh} = \frac{(r_o-3M)\sqrt{r_o+6M}}{r_o^{3/2}},$$

measured from the direction to the black hole. The cosine follows from the factorisation
$r^3 - 27M^2r + 54M^3 = (r-3M)^2(r+6M)$; its sign selects $\psi_{sh} > \pi/2$ inside the photon
sphere, and `shadowAngularRadius` uses `atan2` of the pair, which stays accurate at $r_o = 3M$.
This matches Perlick and Tsupko (2022), eqs. (6) and (7), and Synge's escape-cone result (1966,
eq. 14; Synge treats emitters inside $3M$). It differs from the naive $\arcsin(b_c/r_o)$: at
$r_o = 30M$ it is $9.633°$ against $9.974°$, 3.5 % smaller. The brief's formula is confirmed.

**Local direction to Euclidean velocity.** A local unit direction $d$ has coordinate velocity
proportional to $(\sqrt{1-2M/r}\,d_{\hat r},\ d_{\hat\theta}/r,\ d_{\hat\phi}/(r\sin\theta))$, so
in the Euclidean picture of section 4

$$\mathbf{x}' \propto d - \left(1 - \sqrt{1-2M/r}\right)(d\cdot\hat{\mathbf r})\,\hat{\mathbf r},$$

that is, the radial component shrinks by $\sqrt{1-2M/r}$ and tangential components are unchanged
(`localDirectionToEuclidean`). Check: for $d = (\cos\psi, \sin\psi)$, $h = r\sin\psi$ and
$|\mathbf{x}'|^2 = (1-2M/r)\cos^2\psi + \sin^2\psi$, and the energy integral gives
$1/b^2 = (1-2M/r)/(r^2\sin^2\psi)$, the same $b$ as above. A test checks that the shadow-edge
direction maps to exactly $b_c$ by this route.

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

$$Q(u_2 - s^2) = Q_0 + \kappa s^2 - 2Ms^4,\qquad Q_0 = 6Mu_2\left(\tfrac{1}{3M}-u_2\right),\quad
\kappa = 6Mu_2 - 1,$$

and the integral becomes $\int 2\,ds/\sqrt{Q_0 + \kappa s^2 - 2Ms^4}$: the turning-point
singularity is gone. Near $b_c$, $Q_0 \to 0$ and the integrand develops a peak of width
$\sqrt{Q_0/\kappa}$ at $s = 0$ (the logarithmic divergence of $\alpha$). The substitution
$s = c\sinh\tau$ with $c = \sqrt{Q_0/\kappa}$ turns it into
$2c\cosh\tau/\sqrt{Q_0\cosh^2\tau - 2Mc^4\sinh^4\tau}$, which is smooth and of order 1. A composite
20-point Gauss-Legendre rule with panels of width 0.5 in $\tau$ then converges to machine
precision. $Q_0$ is computed from the cancellation-free $1/(3M) - u_2$ of section 5.

**Method 2: elliptic integrals** (`sweptAngleElliptic`). With $X_i, Y_i$ the square roots of the
three factors $(u-u_1), (u_2-u), (u_3-u)$ at $x = u_B$ and $y = u_A$,

$$\int_y^x \frac{du}{\sqrt{2M(u-u_1)(u_2-u)(u_3-u)}} = \frac{2}{\sqrt{2M}}\,
R_F(U_{12}^2, U_{13}^2, U_{14}^2),$$
$$U_{12} = \frac{X_1X_2Y_3 + Y_1Y_2X_3}{x-y},\quad U_{13} = \frac{X_1X_3Y_2 + Y_1Y_3X_2}{x-y},\quad
U_{14} = \frac{X_1Y_2Y_3 + Y_1X_2X_3}{x-y},$$

which is DLMF 19.29.4 with the fourth factor set to 1. $R_F$ uses Carlson's duplication algorithm
(Carlson 1995, with his check values as tests). Sanity check: as $b \to \infty$ the formula
reduces to $\frac{2}{\sqrt2}R_C(\tfrac12, 1) = \pi/2$ for $M = 1$, the straight-line value.

Darwin (1959) is the classic source for the exact deflection, but its full text could not be
read, so the elliptic form here is cited to DLMF and Carlson instead; Iyer and Petters (2007,
eq. 8) give an equivalent closed form in Legendre integrals.

**Agreement (measured, Apple M5, Node 25.6.1).** Relative difference at most $7.5 \times 10^{-16}$
for $1 + 10^{-10} \le b/b_c \le 1.1$; at large $b$ the relative difference grows only because
$2I - \pi$ cancels: about $2 \times 10^{-15}$ rad absolute, which is $2.9\times10^{-12}$ relative
at $1000\,b_c$. The test tolerance is $10^{-11}$ relative up to $1000\,b_c$.

**Weak field.** $\alpha = \sum A_n (M/b)^n$ with $A_1 = 4$, $A_2 = 15\pi/4$, $A_3 = 128/3$,
$A_4 = 3465\pi/64$, $A_5 = 3584/5$, $A_6 = 255255\pi/256$ (Keeton and Petters 2005, eqs. 24 and
25). The brief's $\alpha \approx 4M/b$ is the first term. Measured: after three terms the remainder
equals the fourth term to within 0.4 % at $b = 1000M$ (ratio 1.0042, falling as $1/b$ as expected
from $A_5/A_4$).

**Strong field.** Bozza (2002) eq. (50), with $\bar a = 1$ and
$\bar b = \ln[216(7-4\sqrt3)] - \pi \approx -0.4002$ (his eqs. 47 and 48; the paper uses units
$2M = 1$ and $u_m = 3\sqrt3/2$ there), written in the impact parameter:

$$\alpha(b) = -\ln\left(\frac{b}{b_c} - 1\right) + \ln[216(7-4\sqrt3)] - \pi +
O\big((b-b_c)\ln(b-b_c)\big).$$

The brief's "logarithmic divergence, coefficients from Bozza 2002" is confirmed. Measured: the
difference from the exact value is $\varepsilon(0.28\ln(1/\varepsilon) + 1.2)$ for
$\varepsilon = b/b_c - 1$ from $10^{-2}$ to $10^{-8}$.

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
  bolometric intensity scales as $g^4$. Confirmed.

## 10. Disk (toy model)

Shakura and Sunyaev (1973) eq. (2.6) gives the flux per face
$Q \propto R^{-3}[1 - (R_0/R)^{1/2}]$ with zero torque at the inner edge $R_0$. With
$Q = \sigma T^4$:

$$T(r) \propto r^{-3/4}\left(1 - \sqrt{r_{in}/r}\right)^{1/4},$$

as in the brief, with its maximum at $r = (49/36)\,r_{in} \approx 8.17M$ for $r_{in} = 6M$
(`diskTemperature`, normalised to 1 at the peak). This is the Newtonian profile, not the
relativistic Page and Thorne (1974) solution, and the disk has no thickness, no radiative transfer,
no self-illumination and no magnetic fields. It is a toy for demonstration and must not be
presented as a model of any real observation.

## 10a. Colour

- **Spectrum.** Planck's law $B_\lambda \propto \lambda^{-5}/(e^{c_2/\lambda T} - 1)$ with
  $c_2 = 1.438776877\times10^{-2}$ m K (exact since the 2019 SI; NIST CODATA).
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
- **Accuracy (measured).** Chromaticity against the Planckian locus computed from the CIE data:
  within 0.0002 at 6500 K and above, 0.0013 at 2856 K (illuminant A), 0.0046 at 1500 K, where the
  fit's red tail dominates.
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

## 11. Floating point

- **f32 emulation.** `Math.fround(a op b)` on f32 inputs gives the correctly rounded f32 result for
  $+, -, \times, \div$ and square root, because rounding first to binary64 is innocuous when the
  intermediate precision (53 bits) is at least $2 \times 24 + 2$ (Figueroa 1995).
- **WGSL is looser** (WGSL spec, section "Floating Point Accuracy"): $+, -, \times$ are correctly
  rounded; $x/y$ is 2.5 ULP; `sqrt` is inherited from `1.0 / inverseSqrt(x)` (2 ULP plus the
  division); `sin` and `cos` have absolute error up to $2^{-11}$ only on $[-\pi, \pi]$ and are
  undefined outside it; implementations may reassociate and fuse operations. The emulation is
  therefore optimistic for division, `sqrt` and transcendentals. Consequences for the renderer:
  the Binet inner loop uses only $+, -, \times$; the final direction is computed without the
  built-in `sin`/`cos` (rotation recurrence, see `docs/DESIGN.md`); and the GPU result is checked
  against the CPU reference on real hardware in Stage 2.

## References

All entries were confirmed from the source text or publisher metadata.

- CIE (2019). CIE 1931 colour-matching functions, 2 degree observer. Dataset,
  doi:10.25039/CIE.DS.xvudnb9b, licence CC BY-SA 4.0 (four sample values quoted in tests)
- Bardeen, J. M., Press, W. H. and Teukolsky, S. A. (1972). Rotating black holes: locally
  nonrotating frames, energy extraction, and scalar synchrotron radiation. ApJ 178, 347-369.
  doi:10.1086/151796
- Bozza, V. (2002). Gravitational lensing in the strong field limit. Phys. Rev. D 66, 103001.
  doi:10.1103/PhysRevD.66.103001, arXiv:gr-qc/0208075
- Cardoso, V., Miranda, A. S., Berti, E., Witek, H. and Zanchin, V. T. (2009). Geodesic
  stability, Lyapunov exponents and quasinormal modes. Phys. Rev. D 79, 064016. arXiv:0812.1806
- Carlson, B. C. (1995). Numerical computation of real or complex elliptic integrals. Numer.
  Algorithms 10, 13-26. doi:10.1007/BF02198293, arXiv:math/9409227
- Cunningham, C. T. (1975). The effects of redshifts and focusing on the spectrum of an accretion
  disk around a Kerr black hole. ApJ 202, 788-802. doi:10.1086/154033
- Darwin, C. G. (1959). The gravity field of a particle. Proc. R. Soc. Lond. A 249, 180-194.
  doi:10.1098/rspa.1959.0015 (citation and abstract confirmed; full text not read)
- DLMF: NIST Digital Library of Mathematical Functions, section 19.29 (reduction of general
  elliptic integrals), https://dlmf.nist.gov/19.29
- Figueroa, S. A. (1995). When is double rounding innocuous? ACM SIGNUM Newsletter 30(3), 21-26.
  doi:10.1145/221332.221334 (metadata confirmed via Crossref)
- Iyer, S. V. and Petters, A. O. (2007). Light's bending angle due to black holes: from the photon
  sphere to infinity. Gen. Rel. Grav. 39, 1563-1582. arXiv:gr-qc/0611086
- Jarzynski, M. and Olano, M. (2020). Hash functions for GPU rendering. Journal of Computer
  Graphics Techniques 9(3). https://jcgt.org/published/0009/03/02/ (pcg3d, section 6.1)
- Keeton, C. R. and Petters, A. O. (2005). Formalism for testing theories of gravity using lensing
  by compact objects: static, spherically symmetric case. Phys. Rev. D 72, 104006.
  arXiv:gr-qc/0511019
- Lindquist, R. W. (1966). Relativistic transport theory. Ann. Phys. 37, 487-518.
  doi:10.1016/0003-4916(66)90207-7
- Luminet, J.-P. (1979). Image of a spherical black hole with thin accretion disk. A&A 75,
  228-235. ADS 1979A&A....75..228L
- Page, D. N. and Thorne, K. S. (1974). Disk-accretion onto a black hole. I. Time-averaged
  structure of accretion disk. ApJ 191, 499-506. doi:10.1086/152990
- Perlick, V. and Tsupko, O. Yu. (2022). Calculating black hole shadows: review of analytical
  studies. Phys. Rep. 947, 1-39. doi:10.1016/j.physrep.2021.10.004, arXiv:2105.07101
- NIST CODATA: second radiation constant $c_2 = 1.438776877\times10^{-2}$ m K (exact),
  https://physics.nist.gov/cgi-bin/cuu/Value?c22ndrc
- Shakura, N. I. and Sunyaev, R. A. (1973). Black holes in binary systems. Observational
  appearance. A&A 24, 337-355.
- Synge, J. L. (1966). The escape of photons from gravitationally intense stars. MNRAS 131,
  463-466. doi:10.1093/mnras/131.3.463
- W3C CSS Color Module Level 4, sample code `conversions.js` (`XYZ_to_lin_sRGB`, `gam_sRGB`),
  https://drafts.csswg.org/css-color-4/ (matrix and transfer function after IEC 61966-2-1)
- Wyman, C., Sloan, P.-P. and Shirley, P. (2013). Simple analytic approximations to the CIE
  XYZ color matching functions. Journal of Computer Graphics Techniques 2(2), 1-11.
  https://jcgt.org/published/0002/02/01/ (multi-lobe fit, eq. 4 and table 1)
- WGSL: WebGPU Shading Language, W3C draft, section "Floating Point Accuracy",
  https://www.w3.org/TR/WGSL/
$$
