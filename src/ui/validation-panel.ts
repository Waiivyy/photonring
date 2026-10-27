// The Validation panel: the shadow measured on an offscreen 1024 x 1024 validation render of the
// current view, against the analytic angular radius. The analytic rows follow the presented
// camera at once; the measured rows say plainly when they are waiting or measuring, so a stale
// number is never shown next to a new analytic value.
import { el } from './dom.ts';
import { LINKS } from './links.ts';
import { analyticRows, resultRows, type ShadowResult } from './validation.ts';

export type ValidationState = 'waiting' | 'measuring' | 'done' | 'failed';

export interface ValidationPanel {
  readonly element: HTMLElement;
  readonly closeButton: HTMLButtonElement;
  /** Shows the analytic values for a camera and a status in place of the measured rows. */
  pending(state: 'waiting' | 'measuring', distance: number, fovYDeg: number): void;
  done(result: ShadowResult): void;
  failed(message: string): void;
}

export const VALIDATION_SIDE = 1024;

const METHOD =
  'Measured on an offscreen 1024 x 1024 render of the current view: disk off, uniform white ' +
  'sky, no tone mapping, one ray per pixel centre. The black pixels are counted and treated as ' +
  'a disc. Pixel figures refer to that render.';

export function createValidationPanel(h: { close(): void }): ValidationPanel {
  const closeButton = el(
    'button',
    { type: 'button', class: 'close', 'aria-label': 'Close validation panel' },
    'Close',
  );
  closeButton.addEventListener('click', () => h.close());
  const list = el('dl', { class: 'results' });
  const element = el(
    'section',
    {
      id: 'validation-panel',
      class: 'panel validation',
      'aria-labelledby': 'validation-heading',
      'data-state': 'waiting',
      hidden: true,
    },
    el('h2', { id: 'validation-heading' }, 'Validation: shadow size'),
    el('p', { class: 'note' }, METHOD),
    el('p', { class: 'formula' }, 'sin psi = (3 sqrt(3) M / r) sqrt(1 - 2M/r)'),
    list,
    el(
      'p',
      { class: 'note' },
      el(
        'a',
        { href: LINKS.validation, rel: 'noopener noreferrer' },
        'How this is checked (GitHub)',
      ),
    ),
    closeButton,
  );
  element.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      h.close();
    }
  });

  const show = (rows: { label: string; value: string }[]) =>
    list.replaceChildren(...rows.flatMap((r) => [el('dt', {}, r.label), el('dd', {}, r.value)]));
  const setState = (s: ValidationState) => {
    element.setAttribute('data-state', s);
    element.setAttribute('aria-busy', s === 'measuring' ? 'true' : 'false');
  };

  return {
    element,
    closeButton,
    pending(state, distance, fovYDeg) {
      setState(state);
      const a = analyticRows(distance, fovYDeg, VALIDATION_SIDE);
      element.setAttribute('data-analytic-px', String(a.analyticPx));
      element.setAttribute('data-tolerance-px', String(a.tolerancePx));
      element.removeAttribute('data-measured-px');
      const status = state === 'waiting' ? 'Waiting for the view to settle' : 'Measuring';
      show([...a.rows, { label: 'Measured angular radius', value: status }]);
    },
    done(result) {
      setState('done');
      element.setAttribute('data-analytic-px', String(result.analyticPx));
      element.setAttribute('data-tolerance-px', String(result.tolerancePx));
      element.setAttribute('data-measured-px', String(result.measuredPx));
      show(resultRows(result));
    },
    failed(message) {
      setState('failed');
      element.removeAttribute('data-measured-px');
      show([{ label: 'Measurement unavailable', value: message }]);
    },
  };
}
