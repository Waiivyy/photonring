// Writes the view state to the URL hash: a trailing debounce, replaceState (no history entries,
// no hashchange), and a write that may fail. Browsers can throw when the history is changed too
// often, so a failure is retried once and otherwise left until the next change; the page never
// depends on a write succeeding. A write is skipped only when the address bar already shows the
// hash, so edits made outside the page are never mistaken for the page's own. Timers and the
// address bar are injected, so the logic is testable with a fake clock.

export interface UrlSyncDeps {
  setTimer(fn: () => void, ms: number): number;
  clearTimer(id: number): void;
  /** The hash in the address bar now, without '#'. */
  getHash(): string;
  /** Writes the hash (without '#'); may throw. */
  replaceHash(hash: string): void;
}

export interface UrlSync {
  /** Writes `hash` after DEBOUNCE_MS of quiet, unless the address bar already shows it. */
  schedule(hash: string): void;
  /** Writes a pending hash now. */
  flush(): void;
  /** Drops a pending write. */
  cancel(): void;
  readonly lastWritten: string | null;
}

export const DEBOUNCE_MS = 300;
export const RETRY_MS = 2000;

export function createUrlSync(deps: UrlSyncDeps): UrlSync {
  let pending: string | null = null;
  let timer: number | null = null;
  let lastWritten: string | null = null;

  const clear = () => {
    if (timer !== null) deps.clearTimer(timer);
    timer = null;
  };
  const write = (retry: boolean) => {
    timer = null;
    const hash = pending;
    if (hash === null) return;
    if (hash === deps.getHash()) {
      pending = null;
      return;
    }
    try {
      deps.replaceHash(hash);
      lastWritten = hash;
      pending = null;
    } catch {
      if (retry) timer = deps.setTimer(() => write(false), RETRY_MS);
      else pending = null;
    }
  };

  return {
    schedule(hash) {
      pending = hash;
      clear();
      timer = deps.setTimer(() => write(true), DEBOUNCE_MS);
    },
    flush() {
      clear();
      write(false);
    },
    cancel() {
      clear();
      pending = null;
    },
    get lastWritten() {
      return lastWritten;
    },
  };
}
