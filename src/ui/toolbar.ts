// The toolbar: one native button per tool, each showing its shortcut. Not a role="toolbar"
// (which would promise arrow-key navigation that conflicts with orbiting): a labelled group.
import { el } from './dom.ts';

export interface ToolbarButton {
  readonly id: string;
  readonly label: string;
  readonly key: string;
  /** Id of the panel this button opens and closes (sets aria-expanded and aria-controls). */
  readonly controls?: string;
  readonly dialog?: boolean;
  readonly onClick: () => void;
}

export function createToolbar(specs: readonly ToolbarButton[]): {
  element: HTMLDivElement;
  buttons: Map<string, HTMLButtonElement>;
} {
  const buttons = new Map<string, HTMLButtonElement>();
  const element = el('div', { class: 'toolbar', role: 'group', 'aria-label': 'Tools' });
  for (const s of specs) {
    const b = el(
      'button',
      {
        type: 'button',
        id: s.id,
        'aria-controls': s.controls,
        'aria-expanded': s.controls ? 'false' : undefined,
        'aria-haspopup': s.dialog ? 'dialog' : undefined,
      },
      s.label,
      ' ',
      el('kbd', { 'aria-hidden': 'true' }, s.key),
    );
    b.addEventListener('click', s.onClick);
    buttons.set(s.id, b);
    element.append(b);
  }
  return { element, buttons };
}
