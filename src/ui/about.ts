// The About dialog: the honesty note first, what the image shows and its limits, what the lines
// mean, the controls (from the key map), a privacy statement and the documentation links. A
// native modal dialog built with textContent only; it states no numbers, which live in the docs
// and in the Validation panel.
import { el } from './dom.ts';
import { KEYMAP, keyName } from './keymap.ts';
import { LINKS } from './links.ts';
import { OVERLAY_IDS, OVERLAY_NOTE, OVERLAY_STYLES, TERMINATION_LEGEND } from './overlay-style.ts';

export const HONESTY_NOTE =
  'This is a toy model for learning and demonstration, not a scientific simulation of any real observation.';

export const PRIVACY_NOTE =
  'photonring runs entirely in your browser. It has no analytics, telemetry or cookies, stores ' +
  'nothing on your device and loads nothing from other sites. The view settings are kept in the ' +
  'part of the address after #, which browsers do not send to servers. Saved images are made on ' +
  'your device. The documentation links below open GitHub.';

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
    section(
      'Limits',
      el(
        'ul',
        {},
        el('li', {}, 'Non-rotating black hole only.'),
        el(
          'li',
          {},
          'An infinitely thin toy disk with a simple temperature profile, no radiative transfer ' +
            'and no thickness; it stops at the ISCO.',
        ),
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
