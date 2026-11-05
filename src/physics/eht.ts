// Published facts behind the EHT-style view (docs/PHYSICS.md, section 10d). Facts only: the view
// itself is built in the renderers and the page.

/**
 * Common angular resolution of the 2019 M87* images: "we blurred each image with a circular
 * Gaussian to a common, conservative angular resolution of 20 uas" (EHT Collaboration 2019,
 * Paper I, section 5; Paper V, Figure 1 caption: "convolved with a 20 uas FWHM Gaussian beam").
 * Full width at half maximum, in microarcseconds.
 */
export const EHT_BEAM_UAS = 20;

/**
 * Angular size of M87*'s mass scale, theta_g = GM / (c^2 D) = 3.8 +- 0.4 uas (EHT Collaboration
 * 2019, Paper I, Table 1).
 */
export const EHT_THETA_G_UAS = 3.8;

/**
 * Position angle (from north through east) of M87*'s approaching jet on the sky, about 288
 * degrees, west-northwest (EHT Collaboration 2019, Paper V, section 2, p. 3).
 */
export const M87_JET_PA_DEG = 288;

/**
 * Camera roll that turns photonring's image (disk axis up) so that north is up and east left as
 * on the sky for M87*: the disk axis then points to position angle 288 - 180 = 108 degrees, where
 * M87*'s spin axis, which points away from Earth, projects (Paper I, section 6).
 */
export const M87_SKY_ROLL_DEG = M87_JET_PA_DEG - 180;

/** The EHT resolution scaled to a black hole of mass M: FWHM in units of M (20 / 3.8). */
export function ehtBeamFwhmM(): number {
  return EHT_BEAM_UAS / EHT_THETA_G_UAS;
}

/** Standard deviation of the same Gaussian, FWHM / (2 sqrt(2 ln 2)), in units of M. */
export function ehtBeamSigmaM(): number {
  return ehtBeamFwhmM() / (2 * Math.sqrt(2 * Math.LN2));
}
