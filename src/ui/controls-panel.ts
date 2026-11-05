// The Controls panel: camera buttons (a single-pointer, path-free alternative to dragging and
// pinching, and a screen-reader path that does not depend on arrow keys reaching the canvas),
// scene checkboxes, the view as a radio group, and overlay checkboxes, which double as the legend.
import { el } from './dom.ts';
import { KEYMAP, keyName, type Action } from './keymap.ts';
import {
  OVERLAY_IDS,
  OVERLAY_NOTE,
  OVERLAY_STYLES,
  TERMINATION_LEGEND,
  type OverlayId,
} from './overlay-style.ts';
import { TERMINATION_LABELS, colourSwatch, lineSwatch, type TerminationKind } from './swatch.ts';
import { VIEW_MODES, VIEW_NAMES, type ViewMode } from './view-state.ts';

export type SceneToggle = 'disk' | 'antialias';

export interface ControlsState {
  readonly disk: boolean;
  readonly antialias: boolean;
  readonly view: ViewMode;
  readonly overlays: readonly OverlayId[];
}

/** The key that shows each view (colour has none: a view's key returns to it). */
const VIEW_KEYS: Readonly<Record<ViewMode, string | null>> = { colour: null, termination: 't' };

export interface ControlsPanel {
  readonly element: HTMLElement;
  readonly closeButton: HTMLButtonElement;
  sync(state: ControlsState): void;
}

const CAMERA: readonly { text: string; label: string; action: Action['type']; key: string }[] = [
  { text: 'Left', label: 'Orbit left', action: 'orbit', key: 'ArrowLeft' },
  { text: 'Up', label: 'Orbit up', action: 'orbit', key: 'ArrowUp' },
  { text: 'Right', label: 'Orbit right', action: 'orbit', key: 'ArrowRight' },
  { text: 'Zoom in', label: 'Zoom in', action: 'zoom', key: '+' },
  { text: 'Down', label: 'Orbit down', action: 'orbit', key: 'ArrowDown' },
  { text: 'Zoom out', label: 'Zoom out', action: 'zoom', key: '-' },
  { text: 'Reset view', label: 'Reset view', action: 'reset', key: 'r' },
];

/** The action a key triggers, from the key map (one code path for keys and buttons). */
function actionFor(key: string): Action {
  const b = KEYMAP.find((k) => k.keys.includes(key));
  if (!b) throw new Error(`no binding for ${key}`);
  return b.action;
}

const kbd = (key: string) => el('kbd', { 'aria-hidden': 'true' }, keyName(key));

export function createControlsPanel(h: {
  action(a: Action): void;
  scene(toggle: SceneToggle, on: boolean): void;
  view(mode: ViewMode): void;
  overlay(id: OverlayId, on: boolean): void;
  close(): void;
}): ControlsPanel {
  const closeButton = el(
    'button',
    { type: 'button', class: 'close', 'aria-label': 'Close controls panel' },
    'Close',
  );
  closeButton.addEventListener('click', () => h.close());

  const camera = el('div', { class: 'camera' });
  for (const c of CAMERA) {
    const b = el('button', { type: 'button', 'aria-label': c.label }, c.text);
    const action = actionFor(c.key);
    b.addEventListener('click', () => h.action(action));
    camera.append(b);
  }

  const boxes = new Map<string, HTMLInputElement>();
  const checkbox = (
    id: string,
    label: string,
    key: string,
    describedBy: string | null,
    extra: Node[] = [],
  ) => {
    const input = el('input', {
      type: 'checkbox',
      id: `cb-${id}`,
      'aria-describedby': describedBy,
    });
    boxes.set(id, input);
    return el(
      'label',
      { class: 'check', for: `cb-${id}` },
      input,
      ...extra,
      el('span', {}, label),
      ' ',
      kbd(key),
    );
  };

  const scene = el(
    'fieldset',
    {},
    el('legend', {}, 'Scene'),
    checkbox('disk', 'Accretion disk', 'd', null),
    checkbox('antialias', 'Anti-aliasing', 'a', null),
  );
  for (const toggle of ['disk', 'antialias'] as const) {
    boxes
      .get(toggle)!
      .addEventListener('change', (e) => h.scene(toggle, (e.target as HTMLInputElement).checked));
  }

  // The view: native radio buttons, so arrow keys move the selection inside the group (each
  // change goes through the brightness limiter like any other view change).
  const radios = new Map<ViewMode, HTMLInputElement>();
  const termItems = (Object.keys(TERMINATION_LABELS) as TerminationKind[]).map((k) =>
    el('li', {}, colourSwatch(k), ` ${TERMINATION_LABELS[k]}`),
  );
  const viewDetails: Readonly<Record<ViewMode, Node[]>> = {
    colour: [],
    termination: [
      el('ul', { class: 'term-legend', 'aria-hidden': 'true' }, ...termItems),
      el('p', { class: 'desc', id: 'desc-view-termination' }, TERMINATION_LEGEND),
    ],
  };
  const views = el('fieldset', {}, el('legend', {}, 'View'));
  for (const mode of VIEW_MODES) {
    const details = viewDetails[mode];
    const input = el('input', {
      type: 'radio',
      name: 'view',
      id: `rb-view-${mode}`,
      value: mode,
      'aria-describedby': details.length > 0 ? `desc-view-${mode}` : null,
    });
    input.addEventListener('change', () => {
      if (input.checked) h.view(mode);
    });
    radios.set(mode, input);
    const key = VIEW_KEYS[mode];
    views.append(
      el(
        'label',
        { class: 'check', for: `rb-view-${mode}` },
        input,
        el('span', {}, VIEW_NAMES[mode]),
        ...(key === null ? [] : [' ', kbd(key)]),
      ),
      ...details,
    );
  }

  const overlays = el('fieldset', {}, el('legend', {}, 'Overlays'));
  for (const id of OVERLAY_IDS) {
    const s = OVERLAY_STYLES[id];
    overlays.append(
      checkbox(id, s.label, s.key.toLowerCase(), `desc-${id}`, [lineSwatch(s)]),
      el('p', { class: 'desc', id: `desc-${id}` }, s.legend),
    );
    boxes
      .get(id)!
      .addEventListener('change', (e) => h.overlay(id, (e.target as HTMLInputElement).checked));
  }

  const element = el(
    'section',
    { id: 'controls-panel', class: 'panel', 'aria-labelledby': 'controls-heading', hidden: true },
    el('h2', { id: 'controls-heading' }, 'Controls'),
    el('fieldset', {}, el('legend', {}, 'Camera'), camera),
    scene,
    views,
    overlays,
    el(
      'p',
      { class: 'note' },
      `Lines come from the 64-bit reference library and are drawn over the GPU image. ${OVERLAY_NOTE}`,
    ),
    // Last in the focus order; shown at the top right.
    closeButton,
  );
  element.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      h.close();
    }
  });

  return {
    element,
    closeButton,
    sync(state) {
      boxes.get('disk')!.checked = state.disk;
      boxes.get('antialias')!.checked = state.antialias;
      for (const mode of VIEW_MODES) radios.get(mode)!.checked = state.view === mode;
      for (const id of OVERLAY_IDS) boxes.get(id)!.checked = state.overlays.includes(id);
    },
  };
}
