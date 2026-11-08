// The About dialog's notes (src/ui/about.ts): the honesty note, the privacy statement, and the
// limits and colours notes that name the display settings a visitor cannot see, with the disk's
// peak temperature taken from DEFAULT_DISK (docs/DESIGN.md, section 17). Pure, so that
// tests/unit/disclosures.test.ts can check the texts themselves.
import { DEFAULT_DISK } from '../physics/index.ts';

export const HONESTY_NOTE =
  'This is a toy model for learning and demonstration, not a scientific simulation of any real observation.';

export const PRIVACY_NOTE =
  'photonring runs entirely in your browser. It has no analytics, telemetry or cookies, stores ' +
  'nothing on your device and loads nothing from other sites. The view settings are kept in the ' +
  'part of the address after #, which browsers do not send to servers. Saved images are made on ' +
  'your device. The documentation links below open GitHub.';

/** Limits: the disk. */
export const DISK_LIMIT =
  'An infinitely thin, opaque toy disk with a simple temperature profile, no radiative ' +
  'transfer and no thickness; it stops at the ISCO.';

/** Limits: the two black holes the Event Horizon Telescope has imaged. */
export const NOT_M87_NOTE =
  "Not a model of M87* or Sgr A*. The Event Horizon Telescope's images of both are explained " +
  'by models in which hot gas shines by synchrotron emission; the disk here is a thin toy that ' +
  'glows as a blackbody, and its black hole does not spin.';

/** How the colours and brightness are made, and which of them are display choices. */
export const COLOURS_NOTE =
  'The disk and the stars are drawn as blackbodies at the temperature they appear to have after ' +
  'the shifts in frequency, in the colours of a standard sRGB screen, with no adjustment for how ' +
  "an eye adapts. The opaque toy disk's hottest ring has a temperature of " +
  `${DEFAULT_DISK.peakTemperature} K in the gas's own frame. This is a display choice: it was ` +
  'not derived from a black hole mass or accretion rate. A blackbody at ' +
  `${DEFAULT_DISK.peakTemperature} K is close to the white of an sRGB screen; the Doppler and ` +
  'gravitational shifts make the side of the disk that moves towards the camera whiter and the ' +
  'side that moves away brown. Brightness is set by a fixed exposure and compressed by a fixed ' +
  'tone curve, which turns the brightest parts white, and colours a screen cannot show are ' +
  'clipped. The stars are invented, and how bright they are next to the disk is also a display ' +
  'choice.';
