// One polite live region for the page's announcements. Bursts are coalesced into their last
// message, and a message equal to the current one is cleared and set again so it is read again.
import type { Lifecycle } from './lifecycle.ts';

export interface Announcer {
  announce(text: string): void;
}

const COALESCE_MS = 150;

export function createAnnouncer(region: HTMLElement, life: Lifecycle): Announcer {
  let pending: string | null = null;
  let timer = -1;
  const write = () => {
    timer = -1;
    if (pending === null) return;
    const text = pending;
    pending = null;
    if (region.textContent === text) {
      region.textContent = '';
      life.timeout(() => (region.textContent = text), 50);
    } else {
      region.textContent = text;
    }
  };
  return {
    announce(text) {
      pending = text;
      if (timer >= 0) life.cancel(timer);
      timer = life.timeout(write, COALESCE_MS);
    },
  };
}
