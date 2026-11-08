// The About dialog: the honesty note first, what the image shows, its colours and limits, what
// the lines mean, the controls (from the key map), a privacy statement and the documentation
// links. A native modal dialog built with textContent only. It states no measured values, which
// live in the docs and the Validation panel; it names the display settings a visitor cannot see,
// taken from the settings themselves (docs/DESIGN.md, section 17). The notes are in
// src/ui/about-text.ts.
import {
  COLOURS_NOTE,
  DISK_LIMIT,
  HONESTY_NOTE,
  NOT_M87_NOTE,
  PRIVACY_NOTE,
} from './about-text.ts';
import { el } from './dom.ts';
import { KEYMAP, keyName } from './keymap.ts';
import { LINKS } from './links.ts';
import { OVERLAY_IDS, OVERLAY_NOTE, OVERLAY_STYLES, TERMINATION_LEGEND } from './overlay-style.ts';

export interface About {
  readonly dialog: HTMLDialogElement;
  /** Opens the dialog; focus returns to `opener` when it closes. */
  open(opener: HTMLElement): void;
  /** Closes the dialog; with restoreFocus false, focus is left where the caller puts it. */
  close(restoreFocus?: boolean): void;
  readonly isOpen: boolean;
}

const section = (title: string, ...content: Node[]) =>
  el('section', {}, el('h3', {}, title), ...content);

export function createAbout(): About {
  const heading = el('h2', { id: 'about-heading', tabindex: -1 }, 'About photonring');
  const closeButton = el('button', { type: 'button', class: 'close' }, 'Close');

  const rows = KEYMAP.map((b) =>
    el('tr', {}, el('td', {}, b.keys.map((k) => keyName(k)).join(' or ')), el('td', {}, b.label)),
  );
  const keys = el(
    'table',
    { class: 'keys' },
    el(
      'thead',
      {},
      el('tr', {}, el('th', { scope: 'col' }, 'Key'), el('th', { scope: 'col' }, 'Action')),
    ),
    el('tbody', {}, ...rows),
  );
  const link = (href: string, text: string) =>
    el('li', {}, el('a', { href, rel: 'noopener noreferrer' }, `${text} (GitHub)`));

  const dialog = el(
    'dialog',
    { id: 'about', 'aria-labelledby': 'about-heading' },
    heading,
    el('p', { class: 'honesty' }, HONESTY_NOTE),
    section(
      'What you see',
      el(
        'p',
        {},
        'A non-rotating (Schwarzschild) black hole in front of a procedural star field, with an ' +
          'optional thin accretion disk. Each ray of light is traced backwards from the camera on ' +
          'the GPU, and the results are checked against a 64-bit reference library and analytic ' +
          'formulas.',
      ),
    ),
    section('Colours and brightness', el('p', {}, COLOURS_NOTE)),
    section(
      'Limits',
      el(
        'ul',
        {},
        el('li', {}, 'Non-rotating black hole only.'),
        el('li', {}, DISK_LIMIT),
        el('li', {}, NOT_M87_NOTE),
        el(
          'li',
          {},
          '32-bit GPU arithmetic, least accurate in a narrow band at the edge of the shadow.',
        ),
        el('li', {}, 'A fixed limit on the number of steps per ray.'),
        el('li', {}, 'A static camera.'),
      ),
    ),
    section(
      'What the lines mean',
      el('ul', {}, ...OVERLAY_IDS.map((id) => el('li', {}, OVERLAY_STYLES[id].legend))),
      el('p', {}, `Termination view: ${TERMINATION_LEGEND}`),
      el(
        'p',
        {},
        'Photon subring view: the region just outside the shadow edge, unrolled once round the ' +
          'image and magnified, with the distance from the edge on a logarithmic scale, so each ' +
          'image of the disk made by light that circled the hole once more appears as a band of ' +
          'the same height. The lines are the band edges the 64-bit library predicts; the ' +
          'spacing between successive bands approaches a constant factor, as published ' +
          'calculations predict for a non-rotating black hole. It is magnified and logarithmic, ' +
          'not what a camera sees.',
      ),
      el(
        'p',
        {},
        "EHT-style view: the toy disk's brightness at all frequencies, blurred to the resolution " +
          "of the Event Horizon Telescope's first images of M87*, scaled to this black hole, and " +
          'drawn in false colour from black to the brightest point, after the widely used afmhot ' +
          'colour map. The image is turned so that north is up, as for M87* on the sky. It is ' +
          'not a simulation of the EHT observation: the real images are reconstructed from radio ' +
          'measurements of hot, tenuous gas in a thick flow, and their ring is related to the ' +
          'photon ring, while this disk is an opaque toy that emits outside the ISCO.',
      ),
      el('p', {}, OVERLAY_NOTE),
    ),
    section(
      'Units',
      el(
        'p',
        {},
        "Distances are in units of M, the black hole's mass in geometric units (G = c = 1).",
      ),
    ),
    section(
      'Controls',
      el(
        'p',
        {},
        'Shortcuts work while the view has focus: click it or move to it with Tab. Every action ' +
          'is also in the Controls panel. On a touch screen, drag to orbit and pinch to zoom.',
      ),
      keys,
    ),
    section('Privacy', el('p', {}, PRIVACY_NOTE)),
    section(
      'Documentation',
      el(
        'ul',
        {},
        link(LINKS.physics, 'Physics and derivations'),
        link(LINKS.validation, 'Validation results'),
        link(LINKS.performance, 'Performance'),
        link(LINKS.design, 'Design decisions'),
        link(LINKS.source, 'Source code and MIT licence'),
      ),
    ),
    section(
      'Credits',
      el(
        'p',
        {},
        'Line colours from the Okabe-Ito palette. The inner shadow: Chael, Johnson and Lupsasca ' +
          '(2021).',
      ),
    ),
    closeButton,
  );

  let opener: HTMLElement | null = null;
  closeButton.addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', () => {
    opener?.focus();
    opener = null;
  });

  return {
    dialog,
    open(from) {
      if (dialog.open) return;
      opener = from;
      dialog.showModal();
      heading.focus();
    },
    close(restoreFocus = true) {
      if (!restoreFocus) opener = null;
      if (dialog.open) dialog.close();
    },
    get isOpen() {
      return dialog.open;
    },
  };
}
